// #126 leaf H's contract: main is a pointer to the latest plain release. try moves main only for a version without a tail; a beta does not move it. Widens contracts/51/try.contract.ts and contracts/52/try.contract.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { finish } from "../../src/try.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
// main is new on finish's result; read it loosely so this file loads before leaf H
const main = (v: string) => (finish(v, []) as { main?: boolean }).main;

test("finish: main true for a plain release, false for a pre-release or below 1.0.0", () => {
	assert.equal(main("1.0.0"), true, "1.0.0");
	assert.equal(main("1.2.3"), true, "1.2.3");
	assert.equal(main("1.0.0-beta.2"), false, "1.0.0-beta.2");
	assert.equal(main("0.9.0"), false, "0.9.0");
});

test("try skill moves main to the tag commit (refs/heads/main)", () => {
	assert.ok(read("skills/try/SKILL.md").includes("refs/heads/main"));
});

test("AGENTS.md no longer says dev is the only git branch, and names main as the release pointer", () => {
	const md = read("AGENTS.md");
	assert.ok(!md.includes("dev is the only git branch"), "old rule");
	assert.match(md, /\bmain\b/, "main");
});
