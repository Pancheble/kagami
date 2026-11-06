// #103: 저장소 설정이 처음 알려 주는 마켓플레이스는 세션 시작 뒤 등록된다(#90). init 안내가 그 순서를 따르는지 본다
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const md = readFileSync(
	new URL("../skills/init/SKILL.md", import.meta.url),
	"utf8",
);
const human = md.slice(md.indexOf("## 3. What the human does"));

test("init 안내: 폴더 신뢰 → 다시 열기나 /reload-plugins → /kagami:next 순서", () => {
	const at = ["trust", "/reload-plugins", "/kagami:next"].map((s) =>
		human.indexOf(s),
	);
	assert.ok(
		at.every((i) => i >= 0),
		`못 찾음: ${at}`,
	);
	assert.deepEqual(
		[...at].sort((a, b) => a - b),
		at,
	);
	assert.match(human, /open (another|a second|one more) session/i);
});

test("init 안내: 셸에서 미리 등록하는 길은 넣지 않는다 (#103 answer ①)", () => {
	assert.doesNotMatch(human, /marketplace add/);
});
