// #51 잎 1 (플러그인 골격)의 약속: 저장소 루트가 플러그인 kagami, 옮긴 스킬 넷의 frontmatter, 평가자 에이전트
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { components } from "../../src/plugin.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
// 표준 frontmatter(name, description, license) + Claude Code의 disable-model-invocation(init·plan만)
const KEYS = ["name", "description", "license", "disable-model-invocation"];

test("플러그인과 마켓플레이스 이름은 kagami, 저장소 루트가 플러그인이다", () => {
	const c = components(ROOT);
	assert.equal(c.plugin, "kagami");
	assert.equal(c.marketplace, "kagami");
	assert.equal(c.source, "./");
	assert.match(c.version, /^\d+\.\d+\.\d+$/);
});

test("옮긴 스킬 넷: plan은 사람만 부르고, split·build·test는 모델도 부른다", () => {
	const by = new Map(components(ROOT).skills.map((s) => [s.name, s]));
	for (const n of ["plan", "split", "build", "test"]) assert.ok(by.has(n), n);
	assert.equal(by.get("plan")?.model, false);
	for (const n of ["split", "build", "test"])
		assert.equal(by.get(n)?.model, true, n);
});

test("스킬 frontmatter는 정한 키만 쓰고 description과 license가 있다", () => {
	for (const s of components(ROOT).skills) {
		assert.deepEqual(
			s.keys.filter((k) => !KEYS.includes(k)),
			[],
			s.name,
		);
		assert.ok(s.description, s.name);
		assert.ok(s.license, s.name);
	}
});

test("평가자 에이전트 evaluator는 플러그인 안의 changed.ts를 부른다", () => {
	const ev = components(ROOT).agents.find((a) => a.name === "evaluator");
	assert.ok(ev, "evaluator가 없다");
	// biome-ignore lint/suspicious/noTemplateCurlyInString: Claude Code가 치환하는 변수 이름 그대로
	assert.ok(ev.body.includes("${CLAUDE_PLUGIN_ROOT}/src/changed.ts"));
});
