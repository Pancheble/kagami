// #86 잎 P의 약속: TL;DR Changed의 plan changes 칸이 빈칸 "(직접)"으로 남지 않는다
// 두 길 중 하나(잎에서 사람이 고른다): changed.ts가 plan changes를 세서 "(직접)"을 내지 않거나, 평가자가 "(직접)"이 남은 TL;DR을 FAIL로 잡는다
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

test('plan changes: changed.ts가 세거나, 평가자가 남은 "(직접)"을 FAIL로 잡는다', () => {
	const counted = !read("src/changed.ts").includes("(직접)");
	const caught = read("agents/evaluator.md")
		.split("\n")
		.some((l) => l.includes("(직접)") && l.includes("FAIL"));
	assert.ok(
		counted || caught,
		"changed.ts가 아직 (직접)을 내고, 평가자도 잡지 않는다",
	);
});
