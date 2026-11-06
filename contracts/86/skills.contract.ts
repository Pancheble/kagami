// #86 leaf B's contract: the build and test descriptions are narrow enough to be called only inside a kagami leaf. They are not called for requests unrelated to kagami ("fix the README typo")
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { components } from "../../src/plugin.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const desc = (name: string) =>
	components(ROOT).skills.find((s) => s.name === name)?.description ?? "";

test("build description is narrowed to implementing a kagami leaf issue", () => {
	assert.match(desc("build"), /leaf issue/i);
});

test("test description is narrowed to being called inside /kagami:build and does not invite use for any feature or bug", () => {
	assert.match(desc("test"), /kagami:build/);
	assert.doesNotMatch(desc("test"), /building a feature or fixing a bug/i);
});
