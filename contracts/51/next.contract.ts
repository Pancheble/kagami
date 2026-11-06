// #51 잎 3 (next: 나머지)의 약속: 3일 무활동 할당, 답 대기 needs-decision, 버전 차이, 남은 잎 브랜치
import assert from "node:assert/strict";
import { test } from "node:test";
import { drift, type Issue, leftover, stale, waiting } from "../../src/next.ts";

const issue = (number: number, o: Partial<Issue> = {}): Issue => ({
	number,
	title: `#${number}`,
	state: "open",
	kind: "leaf",
	labels: ["leaf"],
	body: "",
	assignees: [],
	blockedBy: [],
	children: [],
	...o,
});
const NOW = new Date("2026-11-06T00:00:00Z");
const ago = (hours: number) =>
	new Date(NOW.getTime() - hours * 3600_000).toISOString();

test("stale: 할당된 열린 이슈 중 마지막 활동이 3일 넘게 지난 것", () => {
	const me = { assignees: ["someone"] };
	const root = issue(1, {
		kind: "node",
		labels: [],
		children: [
			issue(2, me),
			issue(3, me),
			issue(4, { ...me, state: "closed" }),
			issue(5),
			issue(6, me),
		],
	});
	const activity = { 2: ago(73), 3: ago(71), 4: ago(100), 5: ago(100) };
	assert.deepEqual(stale(root, activity, NOW), [2]);
});

test("waiting: 열린 이슈 중 needs-decision 라벨, 뿌리도 센다", () => {
	const nd = ["leaf", "needs-decision"];
	const root = issue(1, {
		kind: "node",
		labels: ["needs-decision"],
		children: [
			issue(2, { labels: nd }),
			issue(3, { labels: nd, state: "closed" }),
			issue(4),
		],
	});
	assert.deepEqual(waiting(root), [1, 2]);
});

test("drift: AGENTS.md 첫 줄 버전과 플러그인 버전이 다를 때만 낸다", () => {
	const md = "<!-- kagami v0.0.0 -->\n# AGENTS.md\n";
	assert.equal(drift(md, "0.0.0"), undefined);
	assert.deepEqual(drift(md, "0.1.0"), { repo: "0.0.0", plugin: "0.1.0" });
	const none = drift("# AGENTS.md\n", "0.1.0");
	assert.equal(none?.repo, undefined);
	assert.equal(none?.plugin, "0.1.0");
});

test("leftover: 이슈마다 leaf/<번호>- 브랜치. 번호 앞부분만 같은 것은 아니다", () => {
	const branches = [
		"dev",
		"leaf/5-a",
		"leaf/51-split",
		"leaf/51-b",
		"leaf/7-x",
		"claude/leaf/5-z",
	];
	assert.deepEqual(leftover([5, 51, 9], branches), {
		5: ["leaf/5-a"],
		51: ["leaf/51-split", "leaf/51-b"],
	});
});
