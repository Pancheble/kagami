// #125 contract: a root whose branches are all closed is ready to close (kind "close"), and a branch right under the root never stays a leaf, so it still gets tried. Widens contracts/51/ready.contract.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { type Issue, ready } from "../../src/next.ts";
import { ITEMS } from "../../src/spec.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

// a root body that passes the spec check (same as contracts/51/ready.contract.ts)
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

test("ready: a root with every branch closed is a close; not while a branch is open or the root is assigned", () => {
	const closed = [
		issue(2, { state: "closed", children: [leaf(3, { state: "closed" })] }),
		issue(4, { state: "closed", children: [leaf(5, { state: "closed" })] }),
	];
	assert.deepEqual(ready(issue(1, { body: FULL, children: closed })), [
		{ number: 1, kind: "close" },
	]);
	assert.deepEqual(
		ready(
			issue(1, {
				body: FULL,
				children: [...closed, issue(6, { children: [leaf(7)] })],
			}),
		),
		[{ number: 7, kind: "build" }],
		"open branch",
	);
	assert.deepEqual(
		ready(issue(1, { body: FULL, assignees: ["someone"], children: closed })),
		[],
		"assigned root",
	);
});

test("ready: a branch that was built as a leaf and closed still lets the root close (Pancheble/kagami-try86b)", () => {
	assert.deepEqual(
		ready(issue(1, { body: FULL, children: [leaf(2, { state: "closed" })] })),
		[{ number: 1, kind: "close" }],
	);
});

test("next skill handles close: confirms, then closes the root with gh issue close", () => {
	const md = read("skills/next/SKILL.md");
	assert.ok(md.includes("`close`"), "close kind");
	assert.ok(md.includes("gh issue close"), "gh issue close");
});

test("AGENTS.md: a root with every branch closed is closed; a branch right under the root never stays a leaf", () => {
	const md = read("AGENTS.md");
	assert.ok(md.includes("root with every branch closed"), "role");
	const line = (f: string) =>
		read(f)
			.split("\n")
			.some((l) => l.includes("stays a leaf") && /\broot\b/.test(l));
	assert.ok(line("AGENTS.md"), "AGENTS.md Splitting");
	assert.ok(line("skills/split/SKILL.md"), "split skill");
});
