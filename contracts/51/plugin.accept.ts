// #51 인수 테스트(노드 목표): 스킬 일곱과 평가자가 /kagami: 아래에 있고, 옛 위치와 옛 이름이 남지 않았다. 잎 6이 끝나야 초록
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { riskPaths } from "../../src/guard.ts";
import { components } from "../../src/plugin.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("스킬 일곱: init·plan은 사람만, split·build·test·try·next는 모델도 부른다", () => {
	const skills = components(ROOT).skills;
	assert.deepEqual(
		skills.map((s) => s.name).sort(),
		["init", "plan", "next", "split", "build", "test", "try"].sort(),
	);
	assert.deepEqual(
		skills
			.filter((s) => s.model)
			.map((s) => s.name)
			.sort(),
		["split", "build", "test", "try", "next"].sort(),
	);
});

test("평가자 에이전트 evaluator가 플러그인에 있다", () => {
	assert.ok(components(ROOT).agents.some((a) => a.name === "evaluator"));
});

test("옛 위치 .claude/skills/, .claude/agents/evaluator.md가 없다", () => {
	components(ROOT);
	assert.equal(existsSync(join(ROOT, ".claude/skills")), false);
	assert.equal(existsSync(join(ROOT, ".claude/agents/evaluator.md")), false);
});

test("새 위치가 위험 경로다", () => {
	components(ROOT);
	const risk = riskPaths(read("CLAUDE.md"));
	for (const p of ["skills/", "agents/", ".claude-plugin/"])
		assert.ok(risk.includes(p), p);
});

test("규칙 문서에 옛 스킬 이름과 옛 평가자 경로가 없다", () => {
	components(ROOT);
	for (const f of [
		"AGENTS.md",
		"CONTRIBUTING.md",
		"docs/harness/가운데 설계.md",
	]) {
		const md = read(f);
		assert.doesNotMatch(md, /`\/(implement|plan-talk|to-tickets|tdd)\b/, f);
		assert.ok(!md.includes(".claude/agents/evaluator.md"), f);
	}
});
