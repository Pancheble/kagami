// #86 인수 테스트(큰 가지 목표): 본문이 영어고(용어표 contracts/86/glossary.md), 기록 표시어는 그대로, 옛 스킬 이름이 없다. T1·T2·H가 끝나야 초록. 설계 문서 이름은 T2에서 바뀌므로 파일 이름 예외는 없다
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

test("T1: 스킬·평가자·AGENTS.md·CONTRIBUTING.md 본문에 한글이 없다", () => {
	const hits = hangul(["skills", "agents", "AGENTS.md", "CONTRIBUTING.md"]);
	assert.deepEqual(hits.slice(0, 5), [], `${hits.length}줄`);
});

test("T2: docs/ 본문에 한글이 없다 (예외 없음. 옛 경로 포인터도 영어)", () => {
	const hits = hangul(["docs"]);
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
