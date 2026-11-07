// #52 leaf B's contract: once kagami is public, the guard fetches kagami without a token, and init no longer asks for the KAGAMI_READ_TOKEN secret
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("ci/guard.yml: the kagami checkout uses no token and KAGAMI_READ_TOKEN is gone", () => {
	const yml = read("ci/guard.yml");
	assert.ok(!yml.includes("KAGAMI_READ_TOKEN"), "KAGAMI_READ_TOKEN");
	assert.doesNotMatch(yml, /^\s*token:/m, "token: line");
});

test("init skill: no KAGAMI_READ_TOKEN secret step", () => {
	assert.ok(
		!read("skills/init/SKILL.md").includes("KAGAMI_READ_TOKEN"),
		"KAGAMI_READ_TOKEN",
	);
});
