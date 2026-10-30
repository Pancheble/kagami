import assert from "node:assert/strict";
import { test } from "node:test";
import { type Run, runLeaves, verdict } from "./leaf.ts";

const issue = { number: 7, title: "더미 잎", body: "hello.txt를 만든다" };

// 명령을 기록하고, 정해 둔 답을 돌려주는 가짜 실행기
function fake(evalOut: string) {
	const calls: string[] = [];
	const run: Run = async (cmd, args) => {
		const line = [cmd, ...args].join(" ");
		calls.push(line);
		if (line.startsWith("gh issue list")) return JSON.stringify([issue]);
		if (line.startsWith("gh pr create"))
			return "https://github.com/o/r/pull/12\n";
		if (cmd === "claude" && args.includes("--append-system-prompt-file"))
			return evalOut;
		return "";
	};
	return { calls, run };
}

const opts = { repo: "o/r", dir: "/clone", claude: "claude", workers: 1 };

test("verdict는 보고서에서 처음 나온 판정을 읽는다", () => {
	assert.equal(verdict("커밋 abc\n판정: PASS\n..."), "PASS");
	assert.equal(verdict("판정: NEEDS_WORK\n나중에 PASS 가능"), "NEEDS_WORK");
	assert.equal(verdict("판정 없음"), "NEEDS_WORK");
	assert.equal(
		verdict("형식(PASS / NEEDS_WORK)\n판정: NEEDS_WORK"),
		"NEEDS_WORK",
	);
	assert.equal(verdict("**판정: PASS**"), "PASS");
});

test("PASS면 잎이 끝까지 간다: 고르기 → worktree → 구현 → PR → 평가 → rebase·CI·머지 → 닫기", async () => {
	const { calls, run } = fake("판정: PASS");
	const results = await runLeaves(opts, run);
	assert.deepEqual(results, [{ issue: 7, pr: 12, verdict: "PASS" }]);

	const order = [
		"gh issue list",
		"gh issue edit 7 -R o/r --add-assignee @me",
		"git worktree add -b leaf/7",
		"claude -p", // 구현자
		"git commit",
		"git push -u origin leaf/7",
		"gh pr create",
		"claude -p", // 평가자
		"gh pr comment 12",
		"git rebase origin/dev",
		"gh pr checks 12",
		"gh pr merge 12 -R o/r --rebase",
		"gh issue close 7",
	];
	let i = 0;
	for (const c of calls) if (i < order.length && c.startsWith(order[i])) i++;
	assert.equal(
		i,
		order.length,
		`여기서 멈춤: ${order[i]}\n${calls.join("\n")}`,
	);
});

test("평가자는 쓰기 도구 없이 돈다", async () => {
	const { calls, run } = fake("판정: PASS");
	await runLeaves(opts, run);
	const evaluator = calls.find((c) =>
		c.includes("--append-system-prompt-file"),
	);
	assert.ok(evaluator?.includes("--tools Read,Grep,Glob,Bash"), evaluator);
	assert.ok(!/Write|Edit/.test(evaluator ?? ""), evaluator);
	// -p에는 승인할 사람이 없다. 끝 기준을 돌릴 명령은 미리 허용해야 한다
	assert.ok(evaluator?.includes("--allowedTools Bash(npm *)"), evaluator);
});

test("NEEDS_WORK면 머지하지 않고 이슈를 닫지 않는다", async () => {
	const { calls, run } = fake("판정: NEEDS_WORK");
	const results = await runLeaves(opts, run);
	assert.deepEqual(results, [{ issue: 7, pr: 12, verdict: "NEEDS_WORK" }]);
	assert.ok(!calls.some((c) => c.startsWith("gh pr merge")));
	assert.ok(!calls.some((c) => c.startsWith("gh issue close")));
});

test("고를 잎이 없으면 아무것도 하지 않는다", async () => {
	const calls: string[] = [];
	const run: Run = async (cmd, args) => {
		calls.push([cmd, ...args].join(" "));
		return "[]";
	};
	assert.deepEqual(await runLeaves(opts, run), []);
	assert.equal(calls.length, 1);
});

test("일꾼 수만큼 잎을 고른다", async () => {
	const { calls, run } = fake("판정: PASS");
	await runLeaves({ ...opts, workers: 3 }, run);
	assert.ok(calls[0].includes("--limit 3"), calls[0]);
});
