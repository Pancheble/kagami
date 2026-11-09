// #165 leaf A (install into an existing repo) contract: install(dir, { root, ref, existing: true }, run)
// dev from the default branch tip, one commit `chore: kagami init` with the kagami files only. Existing files, branches and issues stay as they are.
// Same-name files (#165 split answer 가): CLAUDE.md gets a kagami block appended, .claude/settings.json gets the kagami keys added,
// AGENTS.md stops everything, the rest are skipped. Without existing, a non-empty repo is still refused
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { riskPaths } from "../../src/guard.ts";
import { install, plan } from "../../src/init.ts";
import { gh, R, ROOT, repo } from "./repo.ts";

const KAGAMI = Object.keys(plan(ROOT, { repo: "Pancheble/kagami" }).files);
const opts = { root: ROOT, ref: "dev", existing: true };
const lines = (s: string) => s.split("\n").filter(Boolean).sort();

test("dev from main's tip, one commit with the kagami files only; main and existing files unchanged; 9 labels; issues untouched", async () => {
	const r = repo({ "README.md": "hi\n", "src/a.ts": "export {}\n" });
	const g = gh();
	assert.equal(await install(r.dir, opts, g.run), R);
	assert.equal(r.git("rev-parse", "main"), r.main);
	assert.equal(r.git("rev-parse", "dev~1"), r.main);
	assert.equal(r.git("log", "-1", "--format=%s", "dev"), "chore: kagami init");
	assert.equal(r.git("symbolic-ref", "--short", "HEAD"), "dev");
	assert.deepEqual(
		lines(r.git("diff", "--name-only", "main", "dev")),
		[...KAGAMI].sort(),
	);
	assert.equal(r.read("README.md"), "hi\n");
	assert.equal(r.git("status", "--porcelain"), "");
	assert.equal(g.labels.length, 9);
	assert.ok(!g.calls.some((c) => c[1] === "issue"));
});

test("CLAUDE.md: the original stays as is at the top, a kagami block is appended after it", async () => {
	const mine = "# Mine\n\nUse pnpm.\n";
	const r = repo({ "CLAUDE.md": mine });
	await install(r.dir, opts, gh().run);
	const md = r.read("CLAUDE.md");
	assert.ok(md.startsWith(mine), md);
	const block = md.slice(mine.length);
	assert.match(block, /^\n*<!-- kagami -->/);
	assert.ok(block.includes("@AGENTS.md"));
	assert.deepEqual(riskPaths(md), [
		".github/workflows/",
		".claude/",
		"AGENTS.md",
		"CLAUDE.md",
		".env*",
	]);
});

test(".claude/settings.json: keeps every existing key, adds the kagami marketplace and enables the plugin", async () => {
	const mine = {
		permissions: { allow: ["Bash(npm test)"] },
		enabledPlugins: { "other@other": true },
		extraKnownMarketplaces: {
			other: { source: { source: "github", repo: "x/other" } },
		},
	};
	const r = repo({ ".claude/settings.json": JSON.stringify(mine) });
	await install(r.dir, opts, gh().run);
	const s = JSON.parse(r.read(".claude/settings.json"));
	assert.deepEqual(s.permissions, mine.permissions);
	assert.equal(s.enabledPlugins["other@other"], true);
	assert.equal(s.enabledPlugins["kagami@kagami"], true);
	assert.deepEqual(
		s.extraKnownMarketplaces.other,
		mine.extraKnownMarketplaces.other,
	);
	assert.deepEqual(s.extraKnownMarketplaces.kagami.source, {
		source: "github",
		repo: "Pancheble/kagami",
		ref: "dev",
	});
});

test("CONTRIBUTING.md, a same-name issue template and kagami-guard.yml are skipped; the other templates are written", async () => {
	const mine = {
		"CONTRIBUTING.md": "mine\n",
		".github/ISSUE_TEMPLATE/root.md": "mine\n",
		".github/ISSUE_TEMPLATE/bug.md": "mine\n",
		".github/workflows/kagami-guard.yml": "mine\n",
	};
	const r = repo(mine);
	await install(r.dir, opts, gh().run);
	for (const f of Object.keys(mine)) assert.equal(r.read(f), "mine\n", f);
	for (const t of ["branch", "node", "leaf"])
		assert.ok(r.read(`.github/ISSUE_TEMPLATE/${t}.md`).length > 0, t);
});

// refusals write nothing: no labels, branches and HEAD as they were
async function refused(r: ReturnType<typeof repo>, why: RegExp) {
	const before = r.git("branch", "--list");
	const g = gh();
	await assert.rejects(install(r.dir, opts, g.run), why);
	assert.deepEqual(g.labels, []);
	assert.equal(r.git("branch", "--list"), before);
	assert.equal(r.git("symbolic-ref", "--short", "HEAD"), "main");
	assert.equal(r.git("rev-parse", "HEAD"), r.main);
}

test("AGENTS.md already there: refuses and writes nothing", async () => {
	const r = repo({ "AGENTS.md": "other rules\n" });
	await refused(r, /AGENTS\.md/);
	assert.equal(r.read("AGENTS.md"), "other rules\n");
	assert.equal(r.git("status", "--porcelain"), "");
});

test("uncommitted changes: refuses and writes nothing", async () => {
	const r = repo({ "README.md": "hi\n" });
	writeFileSync(join(r.dir, "README.md"), "edited\n");
	await refused(r, /uncommitted|clean|commit/i);
	assert.equal(r.read("README.md"), "edited\n");
});

test("a dev branch already there: refuses and writes nothing", async () => {
	const r = repo({ "README.md": "hi\n" });
	r.git("branch", "dev");
	await refused(r, /dev/);
	assert.equal(r.git("status", "--porcelain"), "");
});

test("without existing: a repo with commits is still refused as before", async () => {
	const r = repo({ "README.md": "hi\n" });
	const g = gh();
	await assert.rejects(install(r.dir, { root: ROOT, ref: "dev" }, g.run));
	assert.deepEqual(g.labels, []);
	assert.equal(r.git("branch", "--list", "dev"), "");
});
