// #51 leaf 2 (next: ready work) contract: ready(root) returns ready work and its kind in tree order. A root with every field and no children is a split too (split into branches)
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Issue, ready } from "../../src/next.ts";
import { ITEMS } from "../../src/spec.ts";

// a root body that passes the spec check
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

test("returns leaf builds, node splits and branch tries in tree order, leaving out assigned, blocked and waiting ones", () => {
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

test("a branch with any open leaf is not a try", () => {
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

test("a root with missing fields is a planning conversation. Assigned roots are left out", () => {
	assert.deepEqual(ready(issue(1)), [{ number: 1, kind: "plan" }]);
	assert.deepEqual(ready(issue(1, { assignees: ["someone"] })), []);
	assert.deepEqual(ready(issue(1, { body: FULL, children: [issue(2)] })), [
		{ number: 2, kind: "split" },
	]);
});

test("a root with every field and no children is split into branches (split). Assigned roots are left out", () => {
	assert.deepEqual(ready(issue(1, { body: FULL })), [
		{ number: 1, kind: "split" },
	]);
	assert.deepEqual(ready(issue(1, { body: FULL, assignees: ["someone"] })), []);
});
