// #52 leaf C's contract: a version with a pre-release tail (1.0.0-beta.1) gets its tag and a GitHub Release marked Pre-release. Widens contracts/51/try.contract.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { finish } from "../../src/try.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
// prerelease is new on finish's result; read it loosely so this file loads before leaf C
const pre = (v: string) =>
	(finish(v, []) as { prerelease?: boolean }).prerelease;

test("a pre-release version gets tag v<version> and prerelease true; a plain version gets prerelease false", () => {
	assert.equal(finish("1.0.0-beta.1", []).tag, "v1.0.0-beta.1");
	assert.equal(pre("1.0.0-beta.1"), true, "1.0.0-beta.1");
	assert.equal(pre("1.0.0-rc.2"), true, "1.0.0-rc.2");
	assert.equal(pre("1.0.0"), false, "1.0.0");
});

test("try skill creates the Release with --prerelease when finish says so", () => {
	assert.ok(
		readFileSync(join(ROOT, "skills/try/SKILL.md"), "utf8").includes(
			"--prerelease",
		),
	);
});
