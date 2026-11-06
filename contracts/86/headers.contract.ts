// #86 leaf H's contract: issue field names and the CLAUDE.md init installs are English (glossary contracts/86/glossary.md). The old Korean fields are still read (parallel change step 1)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { plan } from "../../src/init.ts";
import { roots } from "../../src/next.ts";
import { check } from "../../src/spec.ts";
import { scope } from "../../src/tree.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const HANGUL = /[가-힣]/;
const TEMPLATES = ["root", "branch", "node", "leaf"];
const heads = (md: string) =>
	[...md.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());

const EN_ROOT = `## Plan document

docs/plan.md

## Success criteria

- it works (check: run it)

## Risk paths

See CLAUDE.md

## Evaluator setup

None

## Stack and ADRs

None

## Out of scope

None
`;
const KO_ROOT = `## 기획 문서

docs/plan.md

## 성공 기준

- 된다 (확인: 본다)

## 위험 경로

CLAUDE.md 참고

## 평가자 준비물

없음

## 스택과 ADR

없음

## 안 할 것

없음
`;

test("check: counts both English root fields and old Korean root fields", () => {
	assert.deepEqual(check(EN_ROOT), []);
	assert.deepEqual(check(KO_ROOT), []);
});

test("check: catches English Success criteria without check:", () => {
	const bad = EN_ROOT.replace("(check: run it)", "");
	assert.equal(check(bad).length, 1);
});

test("scope: reads both ## Scope and the old Korean Scope heading", () => {
	assert.deepEqual(
		scope("## Goal\n\nx\n\n## Scope\n\n- `src/a.ts`\n- src/b/\n"),
		["src/a.ts", "src/b/"],
	);
	assert.deepEqual(scope("## 범위\n\n- `src/a.ts`\n"), ["src/a.ts"]);
});

test("roots: finds roots with English fields and roots with old Korean fields", async () => {
	const list = [
		{ number: 3, body: "## Goal\n\nnot a root\n" },
		{ number: 2, body: "## 기획 문서\n\ndocs/a.md\n" },
		{ number: 1, body: "## Plan document\n\ndocs/b.md\n" },
	];
	assert.deepEqual(
		await roots("o/r", async () => JSON.stringify(list)),
		[1, 2],
	);
});

test("the four issue templates have no Hangul, and a filled root template passes check", () => {
	for (const t of TEMPLATES) {
		const md = read(`.github/ISSUE_TEMPLATE/${t}.md`);
		assert.ok(!HANGUL.test(md), `Hangul in ${t}.md`);
	}
	const filled = heads(read(".github/ISSUE_TEMPLATE/root.md"))
		.map((h) =>
			h === "Success criteria"
				? `## ${h}\n\n- it works (check: run it)`
				: h === "Risk paths"
					? `## ${h}\n\nSee CLAUDE.md`
					: `## ${h}\n\nNone`,
		)
		.join("\n\n");
	assert.deepEqual(heads(filled), heads(EN_ROOT));
	assert.deepEqual(check(filled), []);
});

test("leaf template fields are Goal, Contracts to keep, Done when, Scope, Waits on", () => {
	assert.deepEqual(heads(read(".github/ISSUE_TEMPLATE/leaf.md")), [
		"Goal",
		"Contracts to keep",
		"Done when",
		"Scope",
		"Waits on",
	]);
});

test("the CLAUDE.md init installs has no Hangul", () => {
	const md = plan(ROOT, { repo: "Pancheble/kagami" }).files["CLAUDE.md"];
	assert.ok(!HANGUL.test(md), md);
});
