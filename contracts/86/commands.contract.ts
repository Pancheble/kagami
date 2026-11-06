// #86 leaf A's contract: the evaluator and /kagami:build do not assume npm commands and use the check commands in the target repo's CLAUDE.md "Commands". The CLAUDE.md init installs has a place for Commands (Pancheble/kagami-try#3)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { plan } from "../../src/init.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const FILES = ["agents/evaluator.md", "skills/build/SKILL.md"];

test("no npm or npx commands in the evaluator and build text", () => {
	for (const f of FILES) {
		const hits = read(f).match(/\bnp[mx] [a-z]+(?: [a-z]+)?/g);
		assert.equal(hits, null, `${f}: ${hits}`);
	}
});

test("the evaluator and build point to Commands in the target repo's CLAUDE.md", () => {
	for (const f of FILES) {
		const md = read(f);
		assert.ok(md.includes("CLAUDE.md") && md.includes("Commands"), f);
	}
});

test("the CLAUDE.md init installs has a # Commands section", () => {
	const md = plan(ROOT, { repo: "Pancheble/kagami" }).files["CLAUDE.md"];
	assert.match(md, /^# Commands$/m);
});
