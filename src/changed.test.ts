import assert from "node:assert/strict";
import { test } from "node:test";
import { line, newIssues } from "./changed.ts";
import { facts } from "./guard.ts";

test("새 이슈: 하위 이슈와 **discovered** 기록의 번호를 겹치지 않게 모은다", () => {
	assert.deepEqual(
		newIssues(
			[41, 42],
			[
				"**discovered** #43 로그가 안 남는다. 찾은 곳: src/x.ts",
				"**needs-decision** #44 말고 ① …",
				"그냥 댓글 **discovered** #45",
				"**discovered** #42 하위 이슈와 겹침",
			],
		),
		[41, 42, 43],
	);
});

test("Changed 줄: facts()가 센 것과 새 이슈를 TL;DR 칸 순서대로 적고, 없으면 없음", () => {
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
		"Changed: new issues #41 / plan changes (직접) / contract changes contracts/7/a.contract.ts / risk paths touched src/guard.ts, hooks/x.sh / new dependencies b / deleted tests src/old.test.ts",
	);
	assert.equal(
		line(facts("A\tsrc/new.ts", { md, pkg: "{}" }, { md, pkg: "{}" }), []),
		"Changed: new issues 없음 / plan changes (직접) / contract changes 없음 / risk paths touched 없음 / new dependencies 없음 / deleted tests 없음",
	);
});
