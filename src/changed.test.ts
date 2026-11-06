import assert from "node:assert/strict";
import { test } from "node:test";
import { line, newIssues } from "./changed.ts";
import { facts } from "./guard.ts";

test("new issues: gathers numbers from sub-issues and **discovered** records without duplicates", () => {
	assert.deepEqual(
		newIssues(
			[41, 42],
			[
				"**discovered** #43 no log is written. Found in: src/x.ts",
				"**needs-decision** not #44 ① …",
				"just a comment **discovered** #45",
				"**discovered** #42 duplicates a sub-issue",
			],
		),
		[41, 42, 43],
	);
});

test("Changed line: writes what facts() counted and new issues in TL;DR field order, None if empty", () => {
	const md = "# Risk paths\n\n- `src/guard.ts`\n- `hooks/`\n";
	const f = facts(
		[
			"M\tsrc/guard.ts",
			"A\thooks/x.sh",
			"M\tcontracts/7/a.contract.ts",
			"D\tsrc/old.test.ts",
			"A\tsrc/new.ts",
		].join("\n"),
		{ md, pkg: '{"devDependencies":{"a":"1"}}' },
		{ md, pkg: '{"dependencies":{"b":"1"},"devDependencies":{"a":"1"}}' },
	);
	assert.equal(
		line(f, [41]),
		"Changed: new issues #41 / plan changes (manual) / contract changes contracts/7/a.contract.ts / risk paths touched src/guard.ts, hooks/x.sh / new dependencies b / deleted tests src/old.test.ts",
	);
	assert.equal(
		line(facts("A\tsrc/new.ts", { md, pkg: "{}" }, { md, pkg: "{}" }), []),
		"Changed: new issues None / plan changes (manual) / contract changes None / risk paths touched None / new dependencies None / deleted tests None",
	);
});
