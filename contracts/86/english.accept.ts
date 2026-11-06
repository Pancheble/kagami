// #86 인수 테스트(큰 가지 목표): 본문이 영어고(용어표 contracts/86/glossary.md), 기록 표시어는 그대로, 옛 스킬 이름이 없다. T1·T2·H가 끝나야 초록
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const walk = (p: string): string[] =>
	statSync(join(ROOT, p)).isDirectory()
		? readdirSync(join(ROOT, p)).flatMap((e) => walk(join(p, e)))
		: [p];
const HANGUL = /[가-힣]/;
// 예외(D2): docs/harness의 파일 이름은 그대로 둔다
const NAMES = walk("docs/harness").map((f) => basename(f));
const hangul = (paths: string[]) =>
	paths.flatMap(walk).flatMap((f) =>
		read(f)
			.split("\n")
			.map((line, i) => [line, i] as const)
			.filter(([line]) =>
				HANGUL.test(NAMES.reduce((l, n) => l.replaceAll(n, ""), line)),
			)
			.map(([line, i]) => `${relative(".", f)}:${i + 1}: ${line}`),
	);

test("T1: 스킬·평가자·AGENTS.md·CONTRIBUTING.md 본문에 한글이 없다", () => {
	const hits = hangul(["skills", "agents", "AGENTS.md", "CONTRIBUTING.md"]);
	assert.deepEqual(hits.slice(0, 5), [], `${hits.length}줄`);
});

test("T2: docs/harness/ 본문에 한글이 없다 (파일 이름 예외)", () => {
	const hits = hangul(["docs/harness"]);
	assert.deepEqual(hits.slice(0, 5), [], `${hits.length}줄`);
});

test("AGENTS.md 기록 형식: 표시어는 그대로, 기록 본문은 팀이 쓰는 언어", () => {
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
		"not-what-i-wanted",
	])
		assert.ok(md.includes(`**${m}**`), m);
	assert.match(md, /the language your team uses/i);
});

test("옛 스킬 이름(/plan-talk, /to-tickets, /implement, /tdd)이 없다. 출처 줄의 원문 경로는 예외", () => {
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
