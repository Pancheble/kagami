// #155 leaf #156 (board sync) contract: the board is the one the repo is linked to; sync adds missing issues and sets Status
// closed → Done, open and assigned → In Progress, open and unassigned → Todo. Other repos' items on a shared board are left alone
import assert from "node:assert/strict";
import { test } from "node:test";
import { linked, sync } from "../../src/board.ts";
import { github, project } from "./github.ts";

const R = "o/r";
const issues = [
	{ number: 1, state: "open" as const, assignees: [] },
	{ number: 2, state: "open" as const, assignees: ["o"] },
	{ number: 3, state: "closed" as const, assignees: ["o"] },
];
const edits = (calls: string[][]) =>
	calls.filter(
		(c) => c[1] === "project" && ["item-add", "item-edit"].includes(c[2]),
	);

test("linked: the boards the repo is linked to, [] if none", async () => {
	const gh = github({
		projects: [project("o", 8, [], [R]), project("o", 9, [], ["o/other"])],
	});
	assert.deepEqual(await linked(R, gh.run), [{ owner: "o", number: 8 }]);
	assert.deepEqual(await linked("o/none", gh.run), []);
});

test("sync: adds missing issues and sets Status by state and assignee", async () => {
	const p = project(
		"o",
		8,
		[{ id: "I2", repo: R, number: 2, status: "Todo" }],
		[R],
	);
	const gh = github({ projects: [p] });
	const r = await sync(R, issues, gh.run);
	assert.deepEqual([...r.added].sort(), [1, 3]);
	assert.deepEqual(r.moved, [2]);
	assert.equal(gh.status(p, R, 1), "Todo");
	assert.equal(gh.status(p, R, 2), "In Progress");
	assert.equal(gh.status(p, R, 3), "Done");
	assert.equal(p.items.length, 3);
});

test("sync: a second run changes nothing and makes no add or edit calls", async () => {
	const p = project("o", 8, [], [R]);
	const gh = github({ projects: [p] });
	await sync(R, issues, gh.run);
	gh.calls.length = 0;
	assert.deepEqual(await sync(R, issues, gh.run), { added: [], moved: [] });
	assert.deepEqual(edits(gh.calls), []);
});

test("sync: on a shared board with many items (over 30), sees this repo's items and leaves other repos alone", async () => {
	const others = Array.from({ length: 40 }, (_, i) => ({
		id: `X${i}`,
		repo: "o/other",
		number: i + 1,
		status: "Todo",
	}));
	const p = project(
		"o",
		8,
		[...others, { id: "I2", repo: R, number: 2, status: "In Progress" }],
		[R, "o/other"],
	);
	const gh = github({ projects: [p] });
	const r = await sync(R, issues, gh.run);
	assert.deepEqual([...r.added].sort(), [1, 3]);
	assert.deepEqual(r.moved, []);
	assert.equal(p.items.length, 43);
	for (let n = 1; n <= 40; n++)
		assert.equal(gh.status(p, "o/other", n), "Todo");
	assert.equal(gh.status(p, R, 1), "Todo");
});

test("sync: with no linked board, does nothing and does not throw", async () => {
	const gh = github({ projects: [project("o", 8, [], ["o/other"])] });
	assert.deepEqual(await sync(R, issues, gh.run), { added: [], moved: [] });
	assert.deepEqual(edits(gh.calls), []);
});

test("sync: without the project scope, rejects with how to add it", async () => {
	const gh = github({ projects: [project("o", 8, [], [R])], scope: false });
	await assert.rejects(sync(R, issues, gh.run), /gh auth refresh -s project/);
});
