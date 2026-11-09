// #155 leaf #157 (init links a board) contract: board(repo, project, run)
// no project → a new public board under the repo owner, titled with the repo name, linked to the repo
// project → links that existing board of the repo owner; does not create one or change its visibility. Failure → null (init goes on without a board)
import assert from "node:assert/strict";
import { test } from "node:test";
import { board } from "../../src/init.ts";
import { github, project } from "./github.ts";

const R = "o/r";

test("no project: creates a public board titled with the repo name and links it to the repo", async () => {
	const gh = github({ projects: [project("o", 3)] });
	const n = await board(R, undefined, gh.run);
	const p = gh.projects.find((p) => p.number === n && p.owner === "o");
	assert.ok(p, `board ${n}`);
	assert.notEqual(n, 3);
	assert.equal(p.title, "r");
	assert.equal(p.public, true);
	assert.deepEqual(p.links, [R]);
});

test("project: links the existing board only, without creating or editing one", async () => {
	const p = {
		...project(
			"o",
			8,
			[{ id: "X", repo: "o/other", number: 1, status: "Todo" }],
			["o/other"],
		),
		public: false,
	};
	const gh = github({ projects: [p] });
	assert.equal(await board(R, 8, gh.run), 8);
	assert.deepEqual(p.links, ["o/other", R]);
	assert.equal(p.public, false);
	assert.equal(gh.projects.length, 1);
	assert.ok(
		!gh.calls.some(
			(c) => c[1] === "project" && ["create", "edit"].includes(c[2]),
		),
	);
});

test("without the project scope: null, does not throw", async () => {
	const gh = github({ scope: false });
	assert.equal(await board(R, undefined, gh.run), null);
	assert.equal(await board(R, 8, gh.run), null);
});

test("a board number the owner does not have: null", async () => {
	const gh = github({ projects: [project("o", 8)] });
	assert.equal(await board(R, 99, gh.run), null);
});
