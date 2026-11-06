// #51 잎 4 (try)의 약속: "괜찮다"면 v1.0.0부터 태그 `v<version>`, 그 전에는 태그 없이. Release 설명은 잎 PR 제목
import assert from "node:assert/strict";
import { test } from "node:test";
import { finish } from "../../src/try.ts";

const TITLES = ["feat: 플러그인 골격", "fix: next 순서"];

test("v1.0.0 전에는 태그가 없다", () => {
	for (const v of ["0.0.0", "0.9.9"])
		assert.equal(finish(v, TITLES).tag, undefined, v);
});

test("v1.0.0부터는 v<version> 태그", () => {
	assert.equal(finish("1.0.0", TITLES).tag, "v1.0.0");
	assert.equal(finish("1.2.3", TITLES).tag, "v1.2.3");
});

test("Release 설명은 잎 PR 제목마다 한 줄", () => {
	assert.equal(
		finish("1.0.0", TITLES).notes,
		"- feat: 플러그인 골격\n- fix: next 순서",
	);
});
