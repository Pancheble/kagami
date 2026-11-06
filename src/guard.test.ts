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

// runs with real git and node --test. NODE_TEST_CONTEXT inherited from the outer node --test makes the inner one skip the reporter, so it is removed
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
test("${name} one", () => assert.equal(mul(2, 3), 6));
test("${name} two", () => assert.equal(mul(-2, 5), -10));
// ${file}
`;

// repo whose dev commit is origin/dev: two green contracts, one acceptance test still red
async function repo() {
	const dir = mkdtempSync(join(tmpdir(), "guard-"));
	write(dir, {
		"CLAUDE.md": "# Risk paths\n", // the guard blocks without the section
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

test("ratchet: a test green on dev and red at HEAD is broken. Tests still red are let through", async () => {
	const { dir, commit } = await repo();
	await commit({ "src/mul.js": "export const mul = (a, b) => a + b;\n" });
	const r = await ratchet(dir, run);
	assert.equal(r.kept, 4);
	assert.deepEqual(r.broken.sort(), [
		"contracts/16/mul.contract.js › mul one",
		"contracts/16/mul.contract.js › mul two",
		"contracts/16/old.contract.js › old one",
		"contracts/16/old.contract.js › old two",
	]);
	assert.ok(!existsSync(`${dir}-dev`), "the dev worktree is removed");
});

test("ratchet: nothing changed means nothing broken", async () => {
	const { dir, commit } = await repo();
	await commit({ "README.md": "x\n" });
	assert.deepEqual(await ratchet(dir, run), { broken: [], kept: 4 });
});

test("ratchet: a green test that is gone is broken too", async () => {
	const { dir, commit } = await repo();
	await commit({}, ["contracts/16/old.contract.js"]);
	assert.deepEqual((await ratchet(dir, run)).broken.sort(), [
		"contracts/16/old.contract.js › old one",
		"contracts/16/old.contract.js › old two",
	]);
});

test("ratchet: tests that do not run because loading broke are broken", async () => {
	const { dir, commit } = await repo();
	await commit({}, ["src/mul.js"]);
	assert.equal((await ratchet(dir, run)).broken.length, 4);
});

// repo whose contracts are called through an npm package (a file: dependency here, so it installs without network).
// the root postinstall creates a ran file if it runs
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

test("ratchet: keeps dev's green in a repo with dependencies too (install scripts do not run)", async () => {
	const { dir, commit } = await withDeps();
	await commit({
		"vendor/dep/index.js": "export const mul = (a, b) => a + b;\n",
	});
	const r = await ratchet(dir, run);
	assert.equal(r.kept, 4);
	assert.equal(r.broken.length, 4);
	assert.ok(!existsSync(join(dir, "ran")), "postinstall does not run");
});

test("ratchet: passes in a repo with dependencies when nothing broke", async () => {
	const { dir, commit } = await withDeps();
	await commit({ "README.md": "x\n" });
	assert.deepEqual(await ratchet(dir, run), { broken: [], kept: 4 });
});

test("dependency install: with a lock file, npm ci --ignore-scripts without credentials; without one, nothing is installed", async () => {
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
	`# Project\n\n- \`src/\` is not one\n\n# Risk paths (notes)\n\n- written in words\n${paths.map((p) => `- \`${p}\``).join("\n")}\n\n# Rules\n\n- \`x\`\n`;

test("risk paths are read only from backticked entries in the Risk paths section of CLAUDE.md", () => {
	assert.deepEqual(riskPaths(md("src/auth/", ".github/workflows/")), [
		"src/auth/",
		".github/workflows/",
	]);
	assert.deepEqual(riskPaths(""), []);
	// this repo's list: includes the guard, hook, CI and agent settings
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

test("fact counting: counts edited contract/acceptance tests, risk paths, deleted tests and new dependencies", () => {
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
		"A\tcontracts/16/new.contract.js", // newly added is fine
		"D\tsrc/old.test.js",
		"M\tsrc/auth/login.js",
		"M\t.github/workflows/ci.yml",
		"M\tsrc/authx.js", // a different path segment
	].join("\n");
	assert.deepEqual(facts(status, base, head), {
		contracts: ["contracts/16/mul.contract.js", "contracts/16/sq.accept.js"],
		risk: ["src/auth/login.js", ".github/workflows/ci.yml"],
		deleted: ["contracts/16/sq.accept.js", "src/old.test.js"],
		deps: ["c"],
	});
});

test("the risk path list comes from dev, and changing the list is itself a risk path", () => {
	const base = { md: md("src/auth/"), pkg: "" };
	const head = { md: md(), pkg: "" };
	assert.deepEqual(facts("M\tsrc/auth/a.js\nM\tCLAUDE.md", base, head).risk, [
		"src/auth/a.js",
		"Risk paths list in CLAUDE.md",
	]);
	assert.deepEqual(facts("M\tCLAUDE.md", base, base).risk, []);
});

test("`.env*` in Risk paths counts changes to `.env` and `.env.local` as risk paths (`*` does not cross `/`)", () => {
	const side = { md: md(".env*", "src/auth/"), pkg: "" };
	const status = ["M\t.env", "A\t.env.local", "M\tsrc/.env", "M\tenv"].join(
		"\n",
	);
	assert.deepEqual(facts(status, side, side).risk, [".env", ".env.local"]);
});

test("security check: looks at changed code files with the Biome security rules", async () => {
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

test("catches edits to a contract test with a Korean name and keeps its ratchet (even when git quotes the path)", async () => {
	const { dir, commit } = await repo();
	await commit({ "contracts/16/곱셈.contract.js": contract("곱셈", "곱셈") });
	await sh("git", ["update-ref", "refs/remotes/origin/dev", "HEAD"], dir);
	await commit({ "contracts/16/곱셈.contract.js": "// emptied\n" });
	const status = await sh(
		"git",
		["diff", "--name-status", "--no-renames", "origin/dev", "HEAD"],
		dir,
	);
	assert.match(status, /"contracts\/16\/\\/); // git quoted it
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

// the guard in CI: runs the same judgment (judge) on the target repo's PR checkout. It only shows, never writes to GitHub
// pr: labels and body of the pull_request payload CI passes in GITHUB_EVENT_PATH
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

test("CI guard: a PR that edits an existing contract test shows blocked and the check is red", async () => {
	const { dir, commit } = await repo();
	await commit({
		"contracts/16/mul.contract.js": contract("mul", "loosened"),
	});
	const r = ci(dir);
	assert.equal(r.code, 1, r.out);
	assert.match(
		r.out,
		/^kagami guard: blocked — edited existing contract\/acceptance tests: contracts\/16\/mul\.contract\.js/m,
	);
	assert.match(r.summary, /kagami guard: blocked/);
});

test("CI guard: a PR that breaks the ratchet is blocked too; one that does not passes (green)", async () => {
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

test("CI guard: a PR touching a risk path shows what the human should look at as a warning on green", async () => {
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

test("CI guard: blocked (red) if CLAUDE.md has no Risk paths section", async () => {
	const gone = await repo();
	await gone.commit({ "CLAUDE.md": "# Project\n" });
	const a = ci(gone.dir);
	assert.equal(a.code, 1, a.out);
	assert.match(
		a.out,
		/^kagami guard: blocked — CLAUDE\.md has no Risk paths section/m,
	);
	// blocked even with no CLAUDE.md at all
	const none = await repo();
	await none.commit({}, ["CLAUDE.md"]);
	const b = ci(none.dir);
	assert.equal(b.code, 1, b.out);
	assert.match(
		b.out,
		/^kagami guard: blocked — CLAUDE\.md has no Risk paths section/m,
	);
});

// contract cleanup: a PR that edits an existing contract. Renaming mul's tests makes the names green on dev disappear (the ratchet's business)
const tidy = {
	"contracts/16/mul.contract.js": contract("times", "renamed"),
};
const TLDR =
	"Where: #22 › #40\nChanged: new issues None / plan changes None / contract changes contracts/16/mul.contract.js / risk paths touched None\n";

test("CI guard: with both the contract-change label and the file in the TL;DR Changed line, a contract edit is only flagged and stays green", async () => {
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
	// only the edited file leaves the ratchet; the two untouched old contracts are kept
	assert.match(r.out, /Ratchet: broken of 2 green on dev: None/);
});

test("CI guard: a contract edit missing either the label or the TL;DR is blocked (red)", async () => {
	const { dir, commit } = await repo();
	await commit(tidy);
	for (const pr of [
		{ labels: ["contract-change"], body: "Changed: contract changes None\n" },
		{ labels: ["leaf"], body: TLDR },
		undefined, // no event (local run)
	]) {
		const r = ci(dir, pr);
		assert.equal(r.code, 1, r.out);
		assert.match(
			r.out,
			/^kagami guard: blocked — edited existing contract\/acceptance tests: contracts\/16\/mul\.contract\.js/m,
		);
	}
});

test("CI guard: even with the label and TL;DR, blocks contracts not named in Changed, and acceptance tests", async () => {
	const other = await repo();
	await other.commit({
		...tidy,
		"contracts/16/old.contract.js": contract("old", "edited quietly"),
	});
	const a = ci(other.dir, { labels: ["contract-change"], body: TLDR });
	assert.equal(a.code, 1, a.out);
	assert.match(
		a.out,
		/^kagami guard: blocked — edited existing contract\/acceptance tests: contracts\/16\/old\.contract\.js$/m,
	);
	const accept = await repo();
	await accept.commit({ "contracts/16/sq.accept.js": "// deleted\n" });
	const b = ci(accept.dir, {
		labels: ["contract-change"],
		body: "Changed: contract changes contracts/16/sq.accept.js\n",
	});
	assert.equal(b.code, 1, b.out);
	assert.match(b.out, /^kagami guard: blocked — .*sq\.accept\.js/m);
});
