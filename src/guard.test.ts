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
	CLEANUP,
	cleanup,
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

test("래칫: 초록이던 테스트가 사라져도 깨진 것이다. 예외는 재계획의 병렬 변경이 자기 노드의 옛 계약을 지울 때뿐", async () => {
	const { dir, commit } = await repo();
	await commit({}, ["contracts/16/old.contract.js"]);
	assert.deepEqual((await ratchet(dir, run)).broken.sort(), [
		"contracts/16/old.contract.js › old 둘",
		"contracts/16/old.contract.js › old 하나",
	]);
	assert.deepEqual((await ratchet(dir, run, 16)).broken, []);
	assert.equal((await ratchet(dir, run, 17)).broken.length, 2);
});

test("래칫: 자기 노드라도 이 PR이 손대지 않은 계약 테스트는 지킨다", async () => {
	const { dir, commit } = await repo();
	await commit({ "src/mul.js": "export const mul = (a, b) => a + b;\n" }, [
		"contracts/16/old.contract.js",
	]);
	assert.deepEqual((await ratchet(dir, run, 16)).broken.sort(), [
		"contracts/16/mul.contract.js › mul 둘",
		"contracts/16/mul.contract.js › mul 하나",
	]);
});

test("래칫: 자기 노드의 옛 계약 파일을 비슷한 새 파일로 옮겨도 손댄 파일로 본다 (git의 rename 감지와 상관없이)", async () => {
	const { dir, commit } = await repo();
	await commit(
		{
			"contracts/16/new.contract.js": contract("old", "old").replace(
				"// old",
				"// new",
			),
		},
		["contracts/16/old.contract.js"],
	);
	assert.deepEqual((await ratchet(dir, run, 16)).broken, []);
});

test("계약 정리 표시: 하네스 계정이 잎 이슈에 단 '계약 정리 (#노드)' 댓글만 센다", () => {
	const leaf = (...cs: { author: string; body: string }[]) => ({
		comments: cs.map((c, id) => ({ id, createdAt: "", updatedAt: "", ...c })),
	});
	const mark = `${CLEANUP}#16): 옛 계약 테스트를 지운다`;
	assert.equal(
		cleanup(leaf({ author: "kagami-bot", body: mark }), "kagami-bot"),
		16,
	);
	assert.equal(
		cleanup(leaf({ author: "Kagami-Bot", body: mark }), "kagami-bot"),
		16,
	);
	// 사람·워크플로가 단 같은 글, 하네스가 단 다른 머리의 글(세션이 쓴 글이 뒤에 붙는다)은 표시가 아니다
	assert.equal(
		cleanup(leaf({ author: "pancheble", body: mark }), "kagami-bot"),
		undefined,
	);
	assert.equal(
		cleanup(leaf({ author: "github-actions", body: mark }), "kagami-bot"),
		undefined,
	);
	assert.equal(
		cleanup(
			leaf({ author: "kagami-bot", body: `재계획 칸 (PR #3): ${mark}` }),
			"kagami-bot",
		),
		undefined,
	);
	assert.equal(cleanup(leaf(), "kagami-bot"), undefined);
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
	// 이 저장소의 목록: 세션 권한·프롬프트·머지 판정이 들어 있다
	const mine = riskPaths(
		readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8"),
	);
	for (const p of [
		"prompts/",
		"src/session.ts",
		"src/guard.ts",
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
	// 병렬 변경(own)은 자기 노드의 계약 테스트만 고칠 수 있다. 인수 테스트는 아니다
	assert.deepEqual(facts(status, base, head, 16).contracts, [
		"contracts/16/sq.accept.js",
	]);
	assert.equal(facts(status, base, head, 17).contracts.length, 2);
});

test("위험 경로 목록은 dev 쪽으로 계산하고, 목록을 바꾼 것 자체가 위험 경로다", () => {
	const base = { md: md("src/auth/"), pkg: "" };
	const head = { md: md(), pkg: "" };
	assert.deepEqual(facts("M\tsrc/auth/a.js\nM\tCLAUDE.md", base, head).risk, [
		"src/auth/a.js",
		"CLAUDE.md의 위험 경로 목록",
	]);
	assert.deepEqual(facts("M\tCLAUDE.md", base, base).risk, []);
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
const ci = (dir: string) => {
	const summary = join(mkdtempSync(join(tmpdir(), "summary-")), "s.md");
	const r = spawnSync(
		"env",
		[
			"-u",
			"NODE_TEST_CONTEXT",
			"-u",
			"GH_TOKEN",
			"-u",
			"GITHUB_TOKEN",
			`GITHUB_STEP_SUMMARY=${summary}`,
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

test("CI 가드: 기존 계약 테스트를 고친 PR은 머지 단계와 같은 판정으로 막힘을 보이고 체크가 빨강이다", async () => {
	const { dir, commit } = await repo();
	await commit({
		"contracts/16/mul.contract.js": contract("mul", "느슨하게 고침"),
	});
	const r = ci(dir);
	assert.equal(r.code, 1, r.out);
	assert.match(
		r.out,
		/^지키는 검사: 막힘 — 기존 계약·인수 테스트를 고쳤다: contracts\/16\/mul\.contract\.js/m,
	);
	assert.match(r.summary, /지키는 검사: 막힘/);
});

test("CI 가드: 래칫이 깨진 PR도 막힘, 안 깨뜨렸으면 통과(초록)", async () => {
	const broke = await repo();
	await broke.commit({ "src/mul.js": "export const mul = (a, b) => a + b;\n" });
	const a = ci(broke.dir);
	assert.equal(a.code, 1, a.out);
	assert.match(a.out, /^지키는 검사: 막힘 — 래칫/m);
	const fine = await repo();
	await fine.commit({ "README.md": "x\n" });
	const b = ci(fine.dir);
	assert.equal(b.code, 0, b.out);
	assert.match(b.out, /^지키는 검사: 통과/m);
	assert.match(b.out, /래칫: dev에서 초록 4개 중 깨진 것: 없음/);
});

test("CI 가드: 위험 경로를 건드린 PR은 사람 승인 대기를 경고로 보인다(체크는 초록, 승인과 머지는 하네스에서만)", async () => {
	const { dir, commit } = await repo();
	await commit({ "CLAUDE.md": "# Risk paths\n\n- `ci/`\n" });
	const base = await sh("git", ["rev-parse", "HEAD"], dir);
	await sh("git", ["update-ref", "refs/remotes/origin/dev", base.trim()], dir);
	await commit({ "ci/guard.yml": "x\n" });
	const r = ci(dir);
	assert.equal(r.code, 0, r.out);
	assert.match(r.out, /^지키는 검사: 사람 승인 대기/m);
	assert.match(r.out, /^::warning::/m);
	assert.match(r.out, /위험 경로:\n {2}- ci\/guard\.yml/);
});
