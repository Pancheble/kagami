// #86 leaf G's contract: repo .github cleanup and third-party notices. The PR template follows AGENTS.md "PR TL;DR format"; the mattpocock/skills license goes in the root THIRD_PARTY_NOTICES
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const has = (f: string) => existsSync(join(ROOT, f));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const walk = (p: string): string[] =>
	statSync(join(ROOT, p)).isDirectory()
		? readdirSync(join(ROOT, p)).flatMap((e) => walk(join(p, e)))
		: [p];

test("PR template: has the TL;DR fields Where, What, Changed and Decided, in English", () => {
	assert.ok(has(".github/PULL_REQUEST_TEMPLATE.md"), "no PR template");
	const md = read(".github/PULL_REQUEST_TEMPLATE.md");
	for (const k of ["Where:", "What:", "Changed:", "Decided:"])
		assert.ok(md.includes(k), k);
	assert.ok(!/[가-힣]/.test(md), "Hangul");
});

test("issue template config .github/ISSUE_TEMPLATE/config.yml has blank_issues_enabled", () => {
	assert.ok(has(".github/ISSUE_TEMPLATE/config.yml"), "no config.yml");
	assert.match(
		read(".github/ISSUE_TEMPLATE/config.yml"),
		/^blank_issues_enabled: (true|false)$/m,
	);
});

test("THIRD_PARTY_NOTICES: the full MIT text of mattpocock/skills is at the root, and the old skills/LICENSE-mattpocock and references to it are gone", () => {
	assert.ok(has("THIRD_PARTY_NOTICES"), "no THIRD_PARTY_NOTICES");
	const n = read("THIRD_PARTY_NOTICES");
	for (const k of [
		"github.com/mattpocock/skills",
		"MIT License",
		"Copyright (c) 2026 Matt Pocock",
	])
		assert.ok(n.includes(k), k);
	assert.equal(has("skills/LICENSE-mattpocock"), false);
	const refs = [
		"skills",
		"agents",
		"src",
		"AGENTS.md",
		"CONTRIBUTING.md",
		"CLAUDE.md",
	]
		.flatMap(walk)
		.filter((f) => read(f).includes("LICENSE-mattpocock"));
	assert.deepEqual(refs, []);
});
