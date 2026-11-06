import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	facts,
	install,
	ratchet,
	riskPaths,
	security,
	unquote,
} from "./guard.ts";
import { type Run, sh } from "./run.ts";

// 진짜 git과 node --test로 돈다. 바깥 node --test가 물려주는 NODE_TEST_CONTEXT가 있으면 안쪽이 리포터를 안 써서 뺀다
const run: Run = (cmd, args, cwd, env) =>
	cmd === process.execPath
		? sh("env", ["-u", "NODE_TEST_CONTEXT", cmd, ...args], cwd, env)
		: sh(cmd, args, cwd, env);

function write(dir: string, files: Record<string, string>) {
	for (const [f, body] of Object.entries(files)) {
		mkdirSync(join(dir, f, ".."), { recursive: true });
		writeFileSync(join(dir, f), body);
	}
}
const contract = (
	name: string,
	file: string,
) => `import { test } from "node:test";
import assert from "node:assert/strict";
import { mul } from "../../src/mul.js";
test("${name} 하나", () => assert.equal(mul(2, 3), 6));
test("${name} 둘", () => assert.equal(mul(-2, 5), -10));
// ${file}
`;

// dev 커밋을 origin/dev로 둔 저장소: 초록인 계약 둘, 아직 빨강인 인수 테스트 하나
async function repo() {
	const dir = mkdtempSync(join(tmpdir(), "guard-"));
	write(dir, {
		"CLAUDE.md": "# Risk paths\n", // 절이 없으면 가드가 막는다
		"src/mul.js": "export const mul = (a, b) => a * b;\n",
		"src/sq.js":
			'export function sq() { throw new Error("not implemented"); }\n',
		"contracts/16/mul.contract.js": contract("mul", "mul"),
		"contracts/16/old.contract.js": contract("old", "old"),
		"contracts/16/sq.accept.js": `import { test } from "node:test";
import { sq } from "../../src/sq.js";
test("sq", () => sq(2));
`,
	});
	const git = (...a: string[]) => sh("git", a, dir);
	await git("init", "-q", "-b", "dev");
	await git("-c", "user.name=t", "-c", "user.email=t@t", "add", "-A");
	await git(
		"-c",
		"user.name=t",
		"-c",
		"user.email=t@t",
		"commit",
		"-qm",
		"dev",
	);
	await git("update-ref", "refs/remotes/origin/dev", "HEAD");
	const commit = async (files: Record<string, string>, rm: string[] = []) => {
		write(dir, files);
		for (const f of rm) rmSync(join(dir, f));
		await git("add", "-A");
		await git(
			"-c",
			"user.name=t",
			"-c",
			"user.email=t@t",
			"commit",
			"-qm",
			"head",
		);
	};
	return { dir, commit };
}

test("래칫: dev에서 초록이던 테스트가 HEAD에서 빨강이면 깨진 것. 아직 빨강인 건 봐준다", async () => {
	const { dir, commit } = await repo();
	await commit({ "src/mul.js": "export const mul = (a, b) => a + b;\n" });
	const r = await ratchet(dir, run);
	assert.equal(r.kept, 4);
	assert.deepEqual(r.broken.sort(), [
		"contracts/16/mul.contract.js › mul 둘",
		"contracts/16/mul.contract.js › mul 하나",
		"contracts/16/old.contract.js › old 둘",
		"contracts/16/old.contract.js › old 하나",
	]);
	assert.ok(!existsSync(`${dir}-dev`), "dev worktree는 지운다");
});

test("래칫: 바뀐 게 없으면 깨진 것도 없다", async () => {
	const { dir, commit } = await repo();
	await commit({ "README.md": "x\n" });
	assert.deepEqual(await ratchet(dir, run), { broken: [], kept: 4 });
});

test("래칫: 초록이던 테스트가 사라져도 깨진 것이다", async () => {
	const { dir, commit } = await repo();
	await commit({}, ["contracts/16/old.contract.js"]);
	assert.deepEqual((await ratchet(dir, run)).broken.sort(), [
		"contracts/16/old.contract.js › old 둘",
		"contracts/16/old.contract.js › old 하나",
	]);
});

test("래칫: 불러오기가 깨져 테스트가 안 돌면 깨진 것이다", async () => {
	const { dir, commit } = await repo();
	await commit({}, ["src/mul.js"]);
	assert.equal((await ratchet(dir, run)).broken.length, 4);
});

// 계약이 npm 패키지(여기선 file: 의존성이라 네트워크 없이 깔린다)를 거쳐 불리는 저장소.
// 루트 postinstall은 돌면 ran 파일을 만든다
async function withDeps() {
	const r = await repo();
	await r.commit({
		".gitignore": "node_modules/\n",
		"vendor/dep/package.json":
			'{"name":"dep","version":"1.0.0","type":"module","main":"index.js"}\n',
		"vendor/dep/index.js": "export const mul = (a, b) => a * b;\n",
		"package.json": JSON.stringify({
			name: "t",
			private: true,
			type: "module",
			dependencies: { dep: "file:vendor/dep" },
			scripts: {
				postinstall: "node -e \"require('fs').writeFileSync('ran','')\"",
			},
		}),
		"package-lock.json": JSON.stringify({
			name: "t",
			lockfileVersion: 3,
			requires: true,
			packages: {
				"": { name: "t", dependencies: { dep: "file:vendor/dep" } },
				"node_modules/dep": { resolved: "vendor/dep", link: true },
				"vendor/dep": { version: "1.0.0" },
			},
		}),
		"src/mul.js": 'export { mul } from "dep";\n',
	});
	await sh("git", ["update-ref", "refs/remotes/origin/dev", "HEAD"], r.dir);
	return r;
}

test("래칫: 의존성이 있는 저장소에서도 dev의 초록을 지킨다 (설치 스크립트는 안 돈다)", async () => {
	const { dir, commit } = await withDeps();
	await commit({
		"vendor/dep/index.js": "export const mul = (a, b) => a + b;\n",
	});
	const r = await ratchet(dir, run);
	assert.equal(r.kept, 4);
	assert.equal(r.broken.length, 4);
	assert.ok(!existsSync(join(dir, "ran")), "postinstall은 돌지 않는다");
});

test("래칫: 의존성이 있는 저장소에서 안 깨뜨렸으면 통과", async () => {
	const { dir, commit } = await withDeps();
	await commit({ "README.md": "x\n" });
	assert.deepEqual(await ratchet(dir, run), { broken: [], kept: 4 });
});

test("의존성 설치: lock 파일이 있으면 인증 없는 환경에서 npm ci --ignore-scripts, 없으면 안 깐다", async () => {
	const dir = mkdtempSync(join(tmpdir(), "install-"));
	const calls: { cmd: string; args: string[]; env?: NodeJS.ProcessEnv }[] = [];
	const fake: Run = async (cmd, args, _cwd, env) => {
		calls.push({ cmd, args, env });
		return "";
	};
	await install(dir, fake);
	assert.equal(calls.length, 0);
	writeFileSync(join(dir, "package-lock.json"), "{}");
	process.env.GH_TOKEN = "secret";
	try {
		await install(dir, fake);
	} finally {
		delete process.env.GH_TOKEN;
	}
	assert.equal(calls.length, 1);
	assert.equal(calls[0].cmd, "npm");
	assert.deepEqual(calls[0].args.slice(0, 2), ["ci", "--ignore-scripts"]);
	assert.equal(calls[0].env?.GH_TOKEN, undefined);
	assert.ok(calls[0].env?.GH_CONFIG_DIR);
});

const md = (...paths: string[]) =>
	`# Project\n\n- \`src/\`는 아님\n\n# Risk paths (설명)\n\n- 말로 적은 것\n${paths.map((p) => `- \`${p}\``).join("\n")}\n\n# Rules\n\n- \`x\`\n`;

test("위험 경로는 CLAUDE.md의 Risk paths 절에서 백틱으로 적은 것만 읽는다", () => {
	assert.deepEqual(riskPaths(md("src/auth/", ".github/workflows/")), [
		"src/auth/",
		".github/workflows/",
	]);
	assert.deepEqual(riskPaths(""), []);
	// 이 저장소의 목록: 가드·hook·CI·에이전트 설정이 들어 있다
	const mine = riskPaths(
		readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8"),
	);
	for (const p of [
		"src/guard.ts",
		"hooks/",
		".github/workflows/",
		".claude/agents/",
	])
		assert.ok(mine.includes(p), p);
});

test("사실 계산: 고친 계약·인수 테스트, 위험 경로, 지운 테스트, 새 의존성을 센다", () => {
	const base = {
		md: md("src/auth/", ".github/workflows/"),
		pkg: '{"dependencies":{"a":"1"},"devDependencies":{"b":"1"}}',
	};
	const head = {
		md: base.md,
		pkg: '{"dependencies":{"a":"2","c":"1"},"devDependencies":{"b":"1"}}',
	};
	const status = [
		"M\tcontracts/16/mul.contract.js",
		"D\tcontracts/16/sq.accept.js",
		"A\tcontracts/16/new.contract.js", // 새로 더한 건 괜찮다
		"D\tsrc/old.test.js",
		"M\tsrc/auth/login.js",
		"M\t.github/workflows/ci.yml",
		"M\tsrc/authx.js", // 경로 조각이 다르다
	].join("\n");
	assert.deepEqual(facts(status, base, head), {
		contracts: ["contracts/16/mul.contract.js", "contracts/16/sq.accept.js"],
		risk: ["src/auth/login.js", ".github/workflows/ci.yml"],
		deleted: ["contracts/16/sq.accept.js", "src/old.test.js"],
		deps: ["c"],
	});
});

test("위험 경로 목록은 dev 쪽으로 계산하고, 목록을 바꾼 것 자체가 위험 경로다", () => {
	const base = { md: md("src/auth/"), pkg: "" };
	const head = { md: md(), pkg: "" };
	assert.deepEqual(facts("M\tsrc/auth/a.js\nM\tCLAUDE.md", base, head).risk, [
		"src/auth/a.js",
		"Risk paths list in CLAUDE.md",
	]);
	assert.deepEqual(facts("M\tCLAUDE.md", base, base).risk, []);
});

test("Risk paths의 `.env*`가 `.env`·`.env.local` 변경을 위험 경로로 센다 (`*`는 `/`를 넘지 않는다)", () => {
	const side = { md: md(".env*", "src/auth/"), pkg: "" };
	const status = ["M\t.env", "A\t.env.local", "M\tsrc/.env", "M\tenv"].join(
		"\n",
	);
	assert.deepEqual(facts(status, side, side).risk, [".env", ".env.local"]);
});

test("보안 계산 검사: 바뀐 코드 파일을 Biome security 규칙으로 본다", async () => {
	const dir = mkdtempSync(join(tmpdir(), "sec-"));
	write(dir, {
		"bad.js": 'eval("1 + 1");\n',
		"ok.js": "export const a = 1;\n",
		"notes.txt": 'eval("x")\n',
	});
	const found = await security(["bad.js", "ok.js", "notes.txt"], dir, run);
	assert.equal(found.length, 1);
	assert.match(found[0], /bad\.js:1 lint\/security\/noGlobalEval/);
	assert.deepEqual(await security(["ok.js"], dir, run), []);
	assert.deepEqual(await security(["notes.txt"], dir, run), []);
});

test("한글 이름의 계약 테스트도 고치면 잡고, 래칫도 지킨다 (git이 경로를 따옴표로 감싸도)", async () => {
	const { dir, commit } = await repo();
	await commit({ "contracts/16/곱셈.contract.js": contract("곱셈", "곱셈") });
	await sh("git", ["update-ref", "refs/remotes/origin/dev", "HEAD"], dir);
	await commit({ "contracts/16/곱셈.contract.js": "// 비움\n" });
	const status = await sh(
		"git",
		["diff", "--name-status", "--no-renames", "origin/dev", "HEAD"],
		dir,
	);
	assert.match(status, /"contracts\/16\/\\/); // git이 감쌌다
	const side = { md: "", pkg: "" };
	assert.deepEqual(facts(status, side, side).contracts, [
		"contracts/16/곱셈.contract.js",
	]);
	assert.equal(
		(await ratchet(dir, run)).broken.filter((k) => k.includes("곱셈")).length,
		2,
	);
	assert.equal(unquote('"a\\tb\\"c"'), 'a\tb"c');
	assert.equal(unquote("plain/path.js"), "plain/path.js");
});

// CI의 가드: 같은 판정(judge)을 대상 저장소의 PR 체크아웃에서 돌린다. GitHub에 쓰지 않고 보여 주기만 한다
// pr: CI가 GITHUB_EVENT_PATH로 주는 pull_request payload의 라벨과 본문
const ci = (dir: string, pr?: { labels: string[]; body: string }) => {
	const tmp = mkdtempSync(join(tmpdir(), "summary-"));
	const summary = join(tmp, "s.md");
	const event = join(tmp, "event.json");
	if (pr)
		writeFileSync(
			event,
			JSON.stringify({
				pull_request: {
					labels: pr.labels.map((name) => ({ name })),
					body: pr.body,
				},
			}),
		);
	const r = spawnSync(
		"env",
		[
			"-u",
			"NODE_TEST_CONTEXT",
			"-u",
			"GH_TOKEN",
			"-u",
			"GITHUB_TOKEN",
			"-u",
			"GITHUB_EVENT_PATH",
			`GITHUB_STEP_SUMMARY=${summary}`,
			...(pr ? [`GITHUB_EVENT_PATH=${event}`] : []),
			process.execPath,
			new URL("./guard.ts", import.meta.url).pathname,
			"--dir",
			dir,
		],
		{ encoding: "utf8" },
	);
	return {
		code: r.status,
		out: r.stdout,
		summary: existsSync(summary) ? readFileSync(summary, "utf8") : "",
	};
};

test("CI 가드: 기존 계약 테스트를 고친 PR은 막힘을 보이고 체크가 빨강이다", async () => {
	const { dir, commit } = await repo();
	await commit({
		"contracts/16/mul.contract.js": contract("mul", "느슨하게 고침"),
	});
	const r = ci(dir);
	assert.equal(r.code, 1, r.out);
	assert.match(
		r.out,
		/^kagami guard: blocked — edited existing contract\/acceptance tests: contracts\/16\/mul\.contract\.js/m,
	);
	assert.match(r.summary, /kagami guard: blocked/);
});

test("CI 가드: 래칫이 깨진 PR도 막힘, 안 깨뜨렸으면 통과(초록)", async () => {
	const broke = await repo();
	await broke.commit({ "src/mul.js": "export const mul = (a, b) => a + b;\n" });
	const a = ci(broke.dir);
	assert.equal(a.code, 1, a.out);
	assert.match(a.out, /^kagami guard: blocked — ratchet/m);
	const fine = await repo();
	await fine.commit({ "README.md": "x\n" });
	const b = ci(fine.dir);
	assert.equal(b.code, 0, b.out);
	assert.match(b.out, /^kagami guard: pass/m);
	assert.match(b.out, /Ratchet: broken of 4 green on dev: None/);
});

test("CI 가드: 위험 경로를 건드린 PR은 초록에 경고로 사람이 볼 것을 보인다", async () => {
	const { dir, commit } = await repo();
	await commit({ "CLAUDE.md": "# Risk paths\n\n- `ci/`\n" });
	const base = await sh("git", ["rev-parse", "HEAD"], dir);
	await sh("git", ["update-ref", "refs/remotes/origin/dev", base.trim()], dir);
	await commit({ "ci/guard.yml": "x\n" });
	const r = ci(dir);
	assert.equal(r.code, 0, r.out);
	assert.match(r.out, /^kagami guard: needs a human look — /m);
	assert.match(r.out, /^::warning::/m);
	assert.doesNotMatch(r.out, /\/승인/);
	assert.match(r.out, /Risk paths:\n {2}- ci\/guard\.yml/);
});

test("CI 가드: CLAUDE.md에 Risk paths 절이 없으면 막힘(빨강)", async () => {
	const gone = await repo();
	await gone.commit({ "CLAUDE.md": "# Project\n" });
	const a = ci(gone.dir);
	assert.equal(a.code, 1, a.out);
	assert.match(
		a.out,
		/^kagami guard: blocked — CLAUDE\.md has no Risk paths section/m,
	);
	// CLAUDE.md가 아예 없어도 막힌다
	const none = await repo();
	await none.commit({}, ["CLAUDE.md"]);
	const b = ci(none.dir);
	assert.equal(b.code, 1, b.out);
	assert.match(
		b.out,
		/^kagami guard: blocked — CLAUDE\.md has no Risk paths section/m,
	);
});

// 계약 정리: 기존 계약을 고치는 PR. mul의 테스트 이름을 바꾸면 dev에서 초록이던 이름이 사라진다(래칫이 볼 일)
const tidy = {
	"contracts/16/mul.contract.js": contract("곱셈", "이름을 바꿈"),
};
const TLDR =
	"Where: #22 › #40\nChanged: new issues None / plan changes None / contract changes contracts/16/mul.contract.js / risk paths touched None\n";

test("CI 가드: contract-change 라벨과 TL;DR Changed에 그 파일이 둘 다 있으면 계약 수정은 표시만 하고 초록이다", async () => {
	const { dir, commit } = await repo();
	await commit(tidy);
	const r = ci(dir, { labels: ["leaf", "contract-change"], body: TLDR });
	assert.equal(r.code, 0, r.out);
	assert.match(r.out, /^kagami guard: needs a human look — /m);
	assert.match(
		r.out,
		/Contract cleanup:\n {2}- contracts\/16\/mul\.contract\.js/,
	);
	assert.match(r.out, /^::warning::/m);
	// 고친 파일만 래칫에서 빠지고, 손대지 않은 old 계약 둘은 지킨다
	assert.match(r.out, /Ratchet: broken of 2 green on dev: None/);
});

test("CI 가드: 계약 수정에 라벨이나 TL;DR 중 하나라도 없으면 막힘(빨강)", async () => {
	const { dir, commit } = await repo();
	await commit(tidy);
	for (const pr of [
		{ labels: ["contract-change"], body: "Changed: contract changes None\n" },
		{ labels: ["leaf"], body: TLDR },
		undefined, // 이벤트 없음(로컬 실행)
	]) {
		const r = ci(dir, pr);
		assert.equal(r.code, 1, r.out);
		assert.match(
			r.out,
			/^kagami guard: blocked — edited existing contract\/acceptance tests: contracts\/16\/mul\.contract\.js/m,
		);
	}
});

test("CI 가드: 라벨과 TL;DR이 있어도 Changed에 적지 않은 계약, 인수 테스트는 막는다", async () => {
	const other = await repo();
	await other.commit({
		...tidy,
		"contracts/16/old.contract.js": contract("old", "몰래 고침"),
	});
	const a = ci(other.dir, { labels: ["contract-change"], body: TLDR });
	assert.equal(a.code, 1, a.out);
	assert.match(
		a.out,
		/^kagami guard: blocked — edited existing contract\/acceptance tests: contracts\/16\/old\.contract\.js$/m,
	);
	const accept = await repo();
	await accept.commit({ "contracts/16/sq.accept.js": "// 지움\n" });
	const b = ci(accept.dir, {
		labels: ["contract-change"],
		body: "Changed: contract changes contracts/16/sq.accept.js\n",
	});
	assert.equal(b.code, 1, b.out);
	assert.match(b.out, /^kagami guard: blocked — .*sq\.accept\.js/m);
});
