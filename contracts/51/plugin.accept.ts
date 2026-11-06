// #51 acceptance test (node goal): the seven skills and the evaluator are under /kagami:, with no old locations or names left. Green once leaf 6 is done
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { riskPaths } from "../../src/guard.ts";
import { components } from "../../src/plugin.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("seven skills: only the human calls init and plan; the model can call split, build, test, try and next", () => {
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

test("the evaluator agent is in the plugin", () => {
	assert.ok(components(ROOT).agents.some((a) => a.name === "evaluator"));
});

test("old locations .claude/skills/ and .claude/agents/evaluator.md are gone", () => {
	components(ROOT);
	assert.equal(existsSync(join(ROOT, ".claude/skills")), false);
	assert.equal(existsSync(join(ROOT, ".claude/agents/evaluator.md")), false);
});

test("the new locations are risk paths", () => {
	components(ROOT);
	const risk = riskPaths(read("CLAUDE.md"));
	for (const p of ["skills/", "agents/", ".claude-plugin/"])
		assert.ok(risk.includes(p), p);
});

test("rule documents have no old skill names or old evaluator path", () => {
	components(ROOT);
	for (const f of ["AGENTS.md", "CONTRIBUTING.md", "docs/design.md"]) {
		const md = read(f);
		assert.doesNotMatch(md, /`\/(implement|plan-talk|to-tickets|tdd)\b/, f);
		assert.ok(!md.includes(".claude/agents/evaluator.md"), f);
	}
});
