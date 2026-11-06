// #86 잎 B의 약속: build·test description이 kagami 잎 안에서만 불리게 좁다. kagami와 상관없는 요청("README 오타 고쳐 줘")에 불리지 않는다
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { components } from "../../src/plugin.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const desc = (name: string) =>
	components(ROOT).skills.find((s) => s.name === name)?.description ?? "";

test("build description은 kagami 잎 이슈를 구현할 때로 좁다", () => {
	assert.match(desc("build"), /leaf issue/i);
});

test("test description은 /kagami:build 안에서 부르는 것으로 좁고, 아무 기능·버그에나 쓰라고 하지 않는다", () => {
	assert.match(desc("test"), /kagami:build/);
	assert.doesNotMatch(desc("test"), /building a feature or fixing a bug/i);
});
