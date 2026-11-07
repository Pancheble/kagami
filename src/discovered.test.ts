// #118: where a discovered issue goes in the tree. A parentless issue is invisible to /kagami:next (next.ts roots)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const md = readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");
const section = md.split(/^## Before you finish$/m)[1].split(/^## /m)[0];
const line = section.split("\n").find((l) => l.includes("`discovered` label"));

test("Before you finish: a discovered issue is a sub-issue of the branch it belongs to, with a leaf or node label", () => {
	assert.ok(line, section);
	for (const want of [
		/sub-issue/,
		/parent of the work's issue/, // default
		/under the root/, // fallback when it fits no branch
		/`leaf`/,
		/`node`/,
		/never .*without a parent/i,
	])
		assert.match(line, want);
});
