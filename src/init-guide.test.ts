// #103: a marketplace first announced by repo settings is registered after the session starts (#90). Checks that the init guide follows that order
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const md = readFileSync(
	new URL("../skills/init/SKILL.md", import.meta.url),
	"utf8",
);
const human = md.slice(md.indexOf("## 3. What the human does"));

test("init guide: trust the folder → reopen or /reload-plugins → /kagami:next, in that order", () => {
	const at = ["trust", "/reload-plugins", "/kagami:next"].map((s) =>
		human.indexOf(s),
	);
	assert.ok(
		at.every((i) => i >= 0),
		`not found: ${at}`,
	);
	assert.deepEqual(
		[...at].sort((a, b) => a - b),
		at,
	);
	assert.match(human, /open (another|a second|one more) session/i);
});

test("init guide: does not include registering ahead of time from the shell (#103 answer ①)", () => {
	assert.doesNotMatch(human, /marketplace add/);
});
