// #51 leaf 5 (init) contract: files, labels and git branch to install in an empty new repo. kagami files are copied as is from the plugin root; only AGENTS.md gets a version line
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { riskPaths } from "../../src/guard.ts";
import { plan } from "../../src/init.ts";
import { stamp, version } from "../../src/version.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REPO = "Pancheble/kagami";
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const TEMPLATES = ["root", "branch", "node", "leaf"].map(
	(t) => `.github/ISSUE_TEMPLATE/${t}.md`,
);

test("these are the only files installed", () => {
	assert.deepEqual(
		Object.keys(plan(ROOT, { repo: REPO }).files).sort(),
		[
			"AGENTS.md",
			"CONTRIBUTING.md",
			"CLAUDE.md",
			".claude/settings.json",
			".github/workflows/kagami-guard.yml",
			...TEMPLATES,
		].sort(),
	);
});

test("AGENTS.md is a copy with a version line; CONTRIBUTING.md and the issue templates are copied as is", () => {
	const { files } = plan(ROOT, { repo: REPO });
	assert.equal(files["AGENTS.md"], stamp(read("AGENTS.md"), version(ROOT)));
	for (const f of ["CONTRIBUTING.md", ...TEMPLATES])
		assert.equal(files[f], read(f), f);
});

test("CLAUDE.md: @AGENTS.md, five default Risk paths, /kagami:next when a session opens", () => {
	const md = plan(ROOT, { repo: REPO }).files["CLAUDE.md"];
	assert.ok(md.includes("@AGENTS.md"));
	assert.deepEqual(riskPaths(md), [
		".github/workflows/",
		".claude/",
		"AGENTS.md",
		"CLAUDE.md",
		".env*",
	]);
	assert.ok(md.includes("/kagami:next"));
});

test("settings.json: pins the kagami marketplace to a ref and enables the plugin. ref defaults to v<version>", () => {
	const settings = (ref?: string) =>
		JSON.parse(plan(ROOT, { repo: REPO, ref }).files[".claude/settings.json"]);
	const source = (ref: string) => ({ source: "github", repo: REPO, ref });
	const s = settings();
	assert.deepEqual(
		s.extraKnownMarketplaces.kagami.source,
		source(`v${version(ROOT)}`),
	);
	assert.equal(s.enabledPlugins["kagami@kagami"], true);
	assert.deepEqual(
		settings("dev").extraKnownMarketplaces.kagami.source,
		source("dev"),
	);
});

test("the guard workflow checks out kagami at the same ref", () => {
	const yml = (ref?: string) =>
		plan(ROOT, { repo: REPO, ref }).files[".github/workflows/kagami-guard.yml"];
	assert.ok(yml().includes(`repository: ${REPO}`));
	assert.ok(yml().includes(`ref: v${version(ROOT)}`));
	assert.ok(!yml().includes("ref: dev"));
	assert.ok(yml("dev").includes("ref: dev"));
});

test("9 labels (7 records + node, leaf) and one dev branch", () => {
	const p = plan(ROOT, { repo: REPO });
	assert.deepEqual(
		[...p.labels].sort(),
		[
			"node",
			"leaf",
			"needs-decision",
			"split",
			"contract-change",
			"blocked",
			"off-recommendation",
			"spec-gap",
			"discovered",
		].sort(),
	);
	assert.equal(p.branch, "dev");
});
