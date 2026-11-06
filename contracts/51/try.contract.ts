// #51 leaf 4 (try) contract: on "it's fine", tag `v<version>` from v1.0.0, no tag before that. The Release description is the leaf PR titles
import assert from "node:assert/strict";
import { test } from "node:test";
import { finish } from "../../src/try.ts";

const TITLES = ["feat: plugin skeleton", "fix: next order"];

test("no tag before v1.0.0", () => {
	for (const v of ["0.0.0", "0.9.9"])
		assert.equal(finish(v, TITLES).tag, undefined, v);
});

test("v<version> tag from v1.0.0", () => {
	assert.equal(finish("1.0.0", TITLES).tag, "v1.0.0");
	assert.equal(finish("1.2.3", TITLES).tag, "v1.2.3");
});

test("Release description is one line per leaf PR title", () => {
	assert.equal(
		finish("1.0.0", TITLES).notes,
		"- feat: plugin skeleton\n- fix: next order",
	);
});
