import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { github, project } from "../contracts/155/github.ts";
import { cli } from "./board.ts";
import type { Run } from "./run.ts";

const R = "o/r";
// Two roots: 1 › 2 (assigned) and 10 › 11 (closed). 5 has no parent and no root fields, so it is not a root
const issues: Record<number, { state: string; who: string[]; kids: number[] }> =
	{
		1: { state: "OPEN", who: [], kids: [2] },
		2: { state: "OPEN", who: ["o"], kids: [] },
		10: { state: "OPEN", who: [], kids: [11] },
		11: { state: "CLOSED", who: ["o"], kids: [] },
	};
// The fake GitHub, plus the issue list (next.ts roots) and issue reads (tree.ts readTree)
const tree = (gh: ReturnType<typeof github>): Run => {
	const run: Run = async (cmd, args, ...rest) => {
		if (args[0] === "issue" && args[1] === "list")
			return JSON.stringify([
				{ number: 1, body: "## Success criteria\nx" },
				{ number: 5, body: "no fields" },
				{ number: 10, body: "## Success criteria\ny" },
			]);
		const n = args.find((a) => a.startsWith("number="));
		if (!n) return gh.run(cmd, args, ...rest);
		const i = issues[Number(n.slice(7))];
		return JSON.stringify({
			data: {
				repository: {
					issue: {
						number: Number(n.slice(7)),
						title: "",
						body: "",
						state: i.state,
						labels: { nodes: [] },
						assignees: { nodes: i.who.map((login) => ({ login })) },
						subIssues: { nodes: i.kids.map((number) => ({ number })) },
						blockedBy: { nodes: [] },
						comments: { nodes: [] },
					},
				},
			},
		});
	};
	return run;
};

test("cli: puts every root's tree issues on the linked board with their Status", async () => {
	const p = project("o", 8, [], [R]);
	const gh = github({ projects: [p] });
	assert.equal(
		await cli(R, tree(gh)),
		"board: added #1 #2 #10 #11; moved none",
	);
	assert.deepEqual(
		[1, 2, 10, 11].map((n) => gh.status(p, R, n)),
		["Todo", "In Progress", "Todo", "Done"],
	);
	assert.equal(gh.status(p, R, 5), undefined);
	assert.equal(await cli(R, tree(gh)), "", "nothing changed: says nothing");
});

test("cli: no linked board → says nothing", async () => {
	const gh = github({ projects: [project("o", 8, [], ["o/other"])] });
	assert.equal(await cli(R, tree(gh)), "");
});

test("cli: without the project scope, returns the gh auth refresh hint instead of throwing", async () => {
	const gh = github({ projects: [project("o", 8, [], [R])], scope: false });
	assert.match(await cli(R, tree(gh)), /gh auth refresh -s project/);
});

test("cli: a real gh scope error (no hint in it) still becomes the hint", async () => {
	const run: Run = async (_cmd, args) => {
		if (args[0] === "issue")
			return JSON.stringify([{ number: 1, body: "## Success criteria\nx" }]);
		if (args.some((a) => a.startsWith("number=")))
			return JSON.stringify({
				data: {
					repository: {
						issue: {
							...{ number: 1, title: "", body: "", state: "OPEN" },
							labels: { nodes: [] },
							assignees: { nodes: [] },
							subIssues: { nodes: [] },
							blockedBy: { nodes: [] },
							comments: { nodes: [] },
						},
					},
				},
			});
		throw new Error(
			"gh api failed\nYour token has not been granted the required scopes to execute this query. The 'projectsV2' field requires one of the following scopes: ['read:project']",
		);
	};
	assert.match(await cli(R, run), /gh auth refresh -s project/);
});

test("cli: other failures still throw (the skill shows them as a warning)", async () => {
	const run: Run = async () => {
		throw new Error("gh issue failed\nHTTP 502");
	};
	await assert.rejects(cli(R, run), /HTTP 502/);
});

test("next, split and try call the board sync and never stop on it", () => {
	for (const s of ["next", "split", "try"]) {
		const md = readFileSync(
			new URL(`../skills/${s}/SKILL.md`, import.meta.url),
			"utf8",
		);
		assert.ok(md.includes('src/board.ts" --repo R'), s);
		assert.ok(md.includes("The board never stops the work"), s);
		assert.ok(md.includes("at most once per session"), s);
	}
});
