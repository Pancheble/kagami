// #155 acceptance test (node goal): the tree shows on a GitHub Project board. init links a board (new, or an existing one with --project),
// then sync puts the issues on it with Status Todo / In Progress / Done. Checked on the fake GitHub (contracts/155/github.ts)
// Not checked here (leaf done criteria): the init and board CLIs, the skills calling sync, the gh auth refresh hint
import assert from "node:assert/strict";
import { test } from "node:test";
import { linked, sync } from "../../src/board.ts";
import { board } from "../../src/init.ts";
import { github, project } from "./github.ts";

const R = "o/r";
const tree = [
	{ number: 1, state: "open" as const, assignees: [] }, // root
	{ number: 2, state: "open" as const, assignees: ["o"] }, // picked leaf
	{ number: 3, state: "closed" as const, assignees: ["o"] }, // merged leaf
];

test("new board: init makes and links it, sync fills it", async () => {
	const gh = github();
	const n = await board(R, undefined, gh.run);
	assert.ok(n);
	assert.deepEqual(await linked(R, gh.run), [{ owner: "o", number: n }]);
	await sync(R, tree, gh.run);
	const p = gh.projects[0];
	assert.equal(p.public, true);
	assert.deepEqual(
		[1, 2, 3].map((i) => gh.status(p, R, i)),
		["Todo", "In Progress", "Done"],
	);
});

test("--project: init links the given board shared with another repo, sync adds this repo's issues beside the others", async () => {
	const p = project(
		"o",
		8,
		[{ id: "X", repo: "o/other", number: 1, status: "In Progress" }],
		["o/other"],
	);
	const gh = github({ projects: [p] });
	assert.equal(await board(R, 8, gh.run), 8);
	await sync(R, tree, gh.run);
	assert.deepEqual(
		[1, 2, 3].map((i) => gh.status(p, R, i)),
		["Todo", "In Progress", "Done"],
	);
	assert.equal(gh.status(p, "o/other", 1), "In Progress");
});

test("picking work: after the leaf is assigned, the next sync moves it to In Progress", async () => {
	const p = project("o", 8, [], [R]);
	const gh = github({ projects: [p] });
	const leaf = { number: 4, state: "open" as const, assignees: [] as string[] };
	await sync(R, [leaf], gh.run);
	assert.equal(gh.status(p, R, 4), "Todo");
	leaf.assignees.push("o");
	assert.deepEqual(await sync(R, [leaf], gh.run), { added: [], moved: [4] });
	assert.equal(gh.status(p, R, 4), "In Progress");
});
