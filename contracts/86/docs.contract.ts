// #86 leaf T2 (docs cleanup) and Z (delete the old path) contract: docs/ names are English lowercase-hyphen, ADRs are numbered files, and when the design doc is renamed the old path is removed by parallel change
// Step 1 (T2): new docs/ + the old path (OLD) stays as an English pointer to the new doc (contracts/51/plugin.accept.ts reads it)
// Step 2 (Z): move plugin.accept.ts and the remaining references to the new path (the human approves) and delete docs/harness/
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const walk = (p: string): string[] =>
	statSync(join(ROOT, p)).isDirectory()
		? readdirSync(join(ROOT, p)).flatMap((e) => walk(join(p, e)))
		: [p];
const OLD = "docs/harness/가운데 설계.md";
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+)?$/;
const docLinks = (md: string) =>
	[...md.matchAll(/docs\/[\w./-]+\.md/g)].map((m) => m[0]);

test("T2: file and folder names under docs/ are English lowercase-hyphen (only the old path pointer is an exception)", () => {
	const bad = walk("docs")
		.filter((f) => f !== OLD)
		.flatMap((f) => f.split("/").slice(1))
		.filter((seg) => !seg.startsWith(".") && !NAME.test(seg)); // skip local files like .DS_Store
	assert.deepEqual([...new Set(bad)], []);
});

test("T2: ADRs are numbered files docs/adr/NNNN-<name>.md from 0001 with no gaps", () => {
	assert.ok(existsSync(join(ROOT, "docs/adr")), "no docs/adr/");
	const nums = readdirSync(join(ROOT, "docs/adr"))
		.map((f) => f.match(/^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/)?.[1])
		.filter((n) => n !== undefined)
		.map(Number)
		.sort((a, b) => a - b);
	assert.ok(nums.length, "no numbered ADR");
	assert.deepEqual(
		nums,
		nums.map((_, i) => i + 1),
	);
});

test("T2: if the old path remains, it is an English pointer and the docs/ doc it points to exists", () => {
	if (!existsSync(join(ROOT, OLD))) return; // after Z
	const md = read(OLD);
	assert.ok(!/[가-힣]/.test(md), "Hangul in the pointer");
	const to = docLinks(md).filter((l) => !l.startsWith("docs/harness/"));
	assert.ok(to.length && to.every((l) => existsSync(join(ROOT, l))), md);
});

test("T2: the design doc CLAUDE.md points to is in docs/, not docs/harness/", () => {
	const links = docLinks(read("CLAUDE.md"));
	assert.ok(links.length, "no docs/ link in CLAUDE.md");
	for (const l of links) {
		assert.ok(!l.startsWith("docs/harness/"), l);
		assert.ok(existsSync(join(ROOT, l)), l);
	}
});

test("Z: docs/harness/ is gone and no file points to docs/harness", () => {
	assert.equal(existsSync(join(ROOT, "docs/harness")), false);
	const hits = [
		"src",
		"skills",
		"agents",
		"contracts/51",
		"AGENTS.md",
		"CONTRIBUTING.md",
		"CLAUDE.md",
	]
		.flatMap(walk)
		.filter((f) => read(f).includes("docs/harness"));
	assert.deepEqual(hits, []);
});
