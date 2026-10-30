// ponytail: 도구 사슬(tsc·biome·node --test)이 도는지만 본다. T1에서 진짜 테스트가 생기면 지운다
import assert from "node:assert/strict";
import { test } from "node:test";

test("TypeScript가 Node에서 바로 돈다", () => {
	const n: number = 1;
	assert.equal(n + 1, 2);
});
