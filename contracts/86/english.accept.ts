// #86 acceptance test (branch goal): text is English (glossary contracts/86/glossary.md), record markers unchanged, no old skill names. Green once T1, T2 and H are done. The design doc is renamed in T2, so there is no file name exception
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const walk = (p: string): string[] =>
	statSync(join(ROOT, p)).isDirectory()
		? readdirSync(join(ROOT, p)).flatMap((e) => walk(join(p, e)))
		: [p];
const HANGUL = /[가-힣]/;
const hangul = (paths: string[]) =>
	paths.flatMap(walk).flatMap((f) =>
		read(f)
			.split("\n")
			.map((line, i) => [line, i] as const)
			.filter(([line]) => HANGUL.test(line))
			.map(([line, i]) => `${relative(".", f)}:${i + 1}: ${line}`),
	);

test("T1: no Hangul in the skills, evaluator, AGENTS.md and CONTRIBUTING.md", () => {
	const hits = hangul(["skills", "agents", "AGENTS.md", "CONTRIBUTING.md"]);
	assert.deepEqual(hits.slice(0, 5), [], `${hits.length} lines`);
});

test("T2: no Hangul in docs/ (no exceptions; the old path pointer is English too)", () => {
	const hits = hangul(["docs"]);
	assert.deepEqual(hits.slice(0, 5), [], `${hits.length} lines`);
});

test("AGENTS.md record format: markers unchanged, record body in the language your team uses", () => {
	const md = read("AGENTS.md");
	for (const m of [
		"needs-decision",
		"answer",
		"split",
		"contract-change",
		"blocked",
		"off-recommendation",
		"spec-gap",
		"discovered",
		"released",
	])
		assert.ok(md.includes(`**${m}**`), m);
	assert.match(md, /the language your team uses/i);
});

test("no old skill names (/plan-talk, /to-tickets, /implement, /tdd). Original paths on source lines are an exception", () => {
	const hits = ["src", "skills", "agents", "AGENTS.md", "CONTRIBUTING.md"]
		.flatMap(walk)
		.flatMap((f) =>
			read(f)
				.split("\n")
				.filter(
					(l) =>
						/plan-talk|to-tickets|\/implement\b|\/tdd\b/.test(l) &&
						!l.includes("github.com/mattpocock/skills"),
				)
				.map((l) => `${f}: ${l}`),
		);
	assert.deepEqual(hits, []);
});
