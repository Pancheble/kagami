import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Issue } from "./next.ts";
import type { Run } from "./run.ts";
import { ensureLabels, readTree } from "./tree.ts";

// fake issues in the exact shape of the GraphQL response
const issues: Record<number, object> = {
	1: {
		number: 1,
		title: "Root",
		body: "",
		state: "OPEN",
		labels: { nodes: [{ name: "node" }] },
		assignees: { nodes: [] },
		subIssues: { nodes: [{ number: 2 }, { number: 3 }] },
		blockedBy: { nodes: [] },
		comments: { nodes: [] },
	},
	2: {
		number: 2,
		title: "Branch",
		body: "",
		state: "OPEN",
		labels: { nodes: [{ name: "node" }] },
		assignees: { nodes: [] },
		subIssues: { nodes: [{ number: 4 }] },
		blockedBy: { nodes: [] },
		comments: { nodes: [] },
	},
	3: {
		number: 3,
		title: "Leaf A",
		body: "## 목표\n\n무엇\n\n## 범위\n\n<!-- 주석 -->\n- `src/a.ts`\n- src/b/\n\n## 기다릴 티켓\n\n- #4\n",
		state: "OPEN",
		labels: { nodes: [{ name: "leaf" }, { name: "blocked" }] },
		assignees: { nodes: [{ login: "bot" }] },
		subIssues: { nodes: [] },
		blockedBy: {
			nodes: [
				{ number: 4, state: "OPEN" },
				{ number: 9, state: "CLOSED" },
			],
		},
		comments: {
			nodes: [
				{
					databaseId: 70,
					author: { login: "bot", __typename: "User" },
					authorAssociation: "COLLABORATOR",
					body: "claim: bot/worker-1",
					createdAt: "2026-10-30T00:00:00Z",
					updatedAt: "2026-10-31T00:00:00Z",
				},
			],
		},
	},
	4: {
		number: 4,
		title: "Leaf B",
		body: "",
		state: "CLOSED",
		labels: { nodes: [{ name: "leaf" }] },
		assignees: { nodes: [] },
		subIssues: { nodes: [] },
		blockedBy: { nodes: [] },
		comments: { nodes: [] },
	},
};

function fake() {
	const calls: string[] = [];
	const run: Run = async (cmd, args) => {
		calls.push([cmd, ...args].join(" "));
		const n = Number(args.find((a) => a.startsWith("number="))?.slice(7));
		return JSON.stringify({ data: { repository: { issue: issues[n] } } });
	};
	return { calls, run };
}

test("reads the tree from the root by following sub-issues and blocked-by, with labels and bodies", async () => {
	const { calls, run } = fake();
	const tree = await readTree("o/r", 1, run);
	const _asIssue: Issue = tree; // passed to next.ts ready() as is
	assert.deepEqual(tree, {
		number: 1,
		title: "Root",
		state: "open",
		kind: "node",
		labels: ["node"],
		body: "",
		assignees: [],
		blockedBy: [],
		scope: [],
		comments: [],
		children: [
			{
				number: 2,
				title: "Branch",
				state: "open",
				kind: "node",
				labels: ["node"],
				body: "",
				assignees: [],
				blockedBy: [],
				scope: [],
				comments: [],
				children: [
					{
						number: 4,
						title: "Leaf B",
						state: "closed",
						kind: "leaf",
						labels: ["leaf"],
						body: "",
						assignees: [],
						blockedBy: [],
						scope: [],
						comments: [],
						children: [],
					},
				],
			},
			{
				number: 3,
				title: "Leaf A",
				state: "open",
				kind: "leaf",
				labels: ["leaf", "blocked"],
				body: "## 목표\n\n무엇\n\n## 범위\n\n<!-- 주석 -->\n- `src/a.ts`\n- src/b/\n\n## 기다릴 티켓\n\n- #4\n",
				assignees: ["bot"],
				blockedBy: [
					{ number: 4, state: "open" },
					{ number: 9, state: "closed" },
				],
				scope: ["src/a.ts", "src/b/"],
				comments: [
					{
						id: 70,
						author: "bot",
						type: "User",
						assoc: "COLLABORATOR",
						body: "claim: bot/worker-1",
						createdAt: "2026-10-30T00:00:00Z",
						updatedAt: "2026-10-31T00:00:00Z",
					},
				],
				children: [],
			},
		],
	});
	assert.equal(calls.length, 4);
	assert.ok(calls[0].startsWith("gh api graphql"), calls[0]);
	assert.ok(calls[0].includes("owner=o") && calls[0].includes("name=r"));
});

test("reads comments to the end, paging past 100", async () => {
	const page = (ids: number[], next?: string) => ({
		pageInfo: { hasNextPage: !!next, endCursor: next ?? null },
		nodes: ids.map((id) => ({
			databaseId: id,
			body: `comment ${id}`,
			createdAt: "2026-10-30T00:00:00Z",
		})),
	});
	const calls: string[] = [];
	const run: Run = async (_cmd, args) => {
		calls.push(args.join(" "));
		const after = args.find((a) => a.startsWith("after="))?.slice(6);
		if (after === "c1")
			return JSON.stringify({
				data: { repository: { issue: { comments: page([2], "c2") } } },
			});
		if (after === "c2")
			return JSON.stringify({
				data: { repository: { issue: { comments: page([3]) } } },
			});
		return JSON.stringify({
			data: {
				repository: {
					issue: { ...issues[4], comments: page([1], "c1") },
				},
			},
		});
	};
	const tree = await readTree("o/r", 4, run);
	assert.deepEqual(
		tree.comments.map((c) => c.id),
		[1, 2, 3],
	);
	assert.equal(calls.length, 3);
});

test("a missing issue fails, naming its number", async () => {
	const run: Run = async () =>
		JSON.stringify({ data: { repository: { issue: null } } });
	await assert.rejects(readTree("o/r", 42, run), /#42/);
});

test("creates the node, leaf and record labels, overwriting existing ones", async () => {
	const calls: string[] = [];
	const run: Run = async (cmd, args) => {
		calls.push([cmd, ...args].join(" "));
		return "";
	};
	await ensureLabels("o/r", run);
	const want = [
		"node",
		"leaf",
		"needs-decision",
		"split",
		"contract-change",
		"blocked",
		"off-recommendation",
		"spec-gap",
		"discovered",
	];
	assert.equal(calls.length, want.length); // old labels (replan, human, stuck-*) are not created
	for (const l of want)
		assert.ok(
			calls.some((c) => c.startsWith(`gh label create ${l} -R o/r`)),
			l,
		);
	assert.ok(calls.every((c) => c.includes("--force")));
});

test("issue templates have every field in the block list", () => {
	const read = (f: string) =>
		readFileSync(
			new URL(`../.github/ISSUE_TEMPLATE/${f}`, import.meta.url),
			"utf8",
		);
	const node = read("node.md");
	assert.match(node, /^labels: node$/m);
	for (const h of [
		"Goal",
		"Acceptance test",
		"Child contracts",
		"Contract changes",
	])
		assert.match(node, new RegExp(`^## ${h}`, "m"), h);
	const leaf = read("leaf.md");
	assert.match(leaf, /^labels: leaf$/m);
	for (const h of [
		"Goal",
		"Contracts to keep",
		"Done when",
		"Scope",
		"Waits on",
	])
		assert.match(leaf, new RegExp(`^## ${h}`, "m"), h);
});
