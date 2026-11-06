// #115: tags are release `v*` only (#49 decision 9). The archive tag kind is gone from the rules and docs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

// Built from parts so this file does not match itself
const archiveTag = ["archive", "/"].join("");

test("no archive tags in AGENTS.md, CONTRIBUTING.md, docs, skills, src", () => {
	const r = spawnSync(
		"git",
		[
			"grep",
			"-n",
			"--fixed-strings",
			archiveTag,
			"--",
			"AGENTS.md",
			"CONTRIBUTING.md",
			"docs",
			"skills",
			"src",
		],
		{ cwd: new URL("..", import.meta.url), encoding: "utf8" },
	);
	assert.equal(r.status, 1, `git grep found:\n${r.stdout}${r.stderr}`);
});
