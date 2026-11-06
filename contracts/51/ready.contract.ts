// #51 잎 2 (next: 준비된 일)의 약속: ready(뿌리)가 준비된 일과 종류를 트리 순서로 낸다
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Issue, ready } from "../../src/next.ts";
import { ITEMS } from "../../src/spec.ts";

// 명세 점검을 통과하는 뿌리 본문
const FULL = ITEMS.map(
	(i) =>
		`## ${i}\n\n${i === "위험 경로" ? "CLAUDE.md 참고" : i === "성공 기준" ? "- 된다 (확인: 본다)" : "없음"}`,
).join("\n\n");

const issue = (number: number, o: Partial<Issue> = {}): Issue => ({
	number,
	title: `#${number}`,
	state: "open",
	kind: "node",
	labels: [],
	body: "",
	assignees: [],
	blockedBy: [],
	children: [],
	...o,
});
const leaf = (number: number, o: Partial<Issue> = {}) =>
	issue(number, { kind: "leaf", labels: ["leaf"], ...o });

test("잎 구현·노드 쪼개기·큰 가지 확인을 트리 순서로 내고, 할당·막힘·기다림은 뺀다", () => {
	const root = issue(1, {
		body: FULL,
		children: [
			issue(2, {
				children: [
					leaf(3),
					leaf(4, { assignees: ["someone"] }),
					leaf(5, { labels: ["leaf", "blocked"] }),
					leaf(6, { blockedBy: [{ number: 3, state: "open" }] }),
					leaf(7, { state: "closed" }),
					leaf(8, { blockedBy: [{ number: 7, state: "closed" }] }),
				],
			}),
			issue(10, { children: [leaf(11, { state: "closed" })] }),
			issue(12),
			issue(13, {
				children: [issue(14), issue(15, { assignees: ["someone"] })],
			}),
			issue(16, { state: "closed", children: [leaf(17)] }),
			issue(18, {
				assignees: ["someone"],
				children: [leaf(19, { state: "closed" })],
			}),
			issue(20, {
				blockedBy: [{ number: 2, state: "open" }],
				children: [leaf(21, { state: "closed" })],
			}),
		],
	});
	assert.deepEqual(ready(root), [
		{ number: 3, kind: "build" },
		{ number: 8, kind: "build" },
		{ number: 10, kind: "try" },
		{ number: 12, kind: "split" },
		{ number: 14, kind: "split" },
	]);
});

test("큰 가지 아래 잎이 하나라도 열려 있으면 확인이 아니다", () => {
	const root = issue(1, {
		body: FULL,
		children: [
			issue(2, {
				children: [
					leaf(3, { state: "closed" }),
					leaf(4, { assignees: ["someone"] }),
				],
			}),
		],
	});
	assert.deepEqual(ready(root), []);
});

test("칸이 빠진 뿌리는 기획 대화다. 할당된 뿌리는 뺀다", () => {
	assert.deepEqual(ready(issue(1)), [{ number: 1, kind: "plan" }]);
	assert.deepEqual(ready(issue(1, { assignees: ["someone"] })), []);
	assert.deepEqual(ready(issue(1, { body: FULL, children: [issue(2)] })), [
		{ number: 2, kind: "split" },
	]);
});
