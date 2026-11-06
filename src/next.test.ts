import assert from "node:assert/strict";
import { test } from "node:test";
import { collect, drift, roots } from "./next.ts";
import type { Run } from "./run.ts";
import type { Tree } from "./tree.ts";

const NOW = new Date("2026-11-06T00:00:00Z");
const ago = (hours: number) =>
	new Date(NOW.getTime() - hours * 3600_000).toISOString();

const node = (number: number, o: Partial<Tree> = {}): Tree => ({
	number,
	title: `#${number}`,
	state: "open",
	kind: "leaf",
	labels: ["leaf"],
	body: "",
	assignees: [],
	blockedBy: [],
	scope: [],
	comments: [],
	children: [],
	...o,
});
const me = { assignees: ["someone"] };

// 2: assigned 5 days ago, no activity since → stale
// 3: issue comment 1 day ago / 4: leaf branch commit 1 day ago / 5: leaf PR updated 1 day ago → not stale
// 6: ready leaf with an old leaf branch left / 7: waiting for an answer
// 8: over 100 events. The first page has only the assignment 5 days ago, the second page an assignment 1 hour ago → not stale
const tree = node(1, {
	kind: "node",
	labels: [],
	children: [
		node(2, me),
		node(3, {
			...me,
			comments: [
				{
					id: 1,
					author: "someone",
					body: "working on it",
					createdAt: ago(24),
					updatedAt: ago(24),
				},
			],
		}),
		node(4, me),
		node(5, me),
		node(6),
		node(7, { labels: ["leaf", "needs-decision"] }),
		node(8, me),
	],
});

const assigned = [
	{ event: "assigned", created_at: ago(120) },
	{ event: "labeled", created_at: ago(1) }, // a label is not activity
];
const R = "repos/o/r";
const events = (n: number) => `${R}/issues/${n}/events?per_page=100`;
// events is a list of pages. With --paginate --slurp, like gh, [pages...]; otherwise the first page only
const pages: Record<string, unknown[][]> = {
	...Object.fromEntries([2, 3, 4, 5].map((n) => [events(n), [assigned]])),
	[events(8)]: [
		[
			...assigned,
			...Array(98).fill({ event: "labeled", created_at: ago(100) }),
		],
		[{ event: "assigned", created_at: ago(1) }],
	],
};
function fake(agentsMd: () => string, dev = true) {
	const calls: string[][] = [];
	const routes: Record<string, unknown> = {
		[`${R}/git/matching-refs/heads/leaf/`]: [
			{ ref: "refs/heads/leaf/4-y", object: { sha: "s4" } },
			{ ref: "refs/heads/leaf/6-old", object: { sha: "s6" } },
		],
		[`${R}/commits/s4`]: { commit: { committer: { date: ago(24) } } },
		[`${R}/pulls?state=all&sort=updated&direction=desc&per_page=100`]: [
			{ head: { ref: "leaf/5-z" }, updated_at: ago(24) },
			{ head: { ref: "leaf/22-x" }, updated_at: ago(1) }, // not 2
		],
	};
	const run: Run = async (cmd, args) => {
		calls.push([cmd, ...args]);
		const path = args[args.length - 1];
		if (path === `${R}/contents/AGENTS.md?ref=dev`) return agentsMd();
		if (path === `${R}/branches/dev`) {
			if (!dev)
				throw new Error("gh api failed\ngh: Branch not found (HTTP 404)");
			return JSON.stringify({ name: "dev" });
		}
		if (path in pages) {
			const all = args.includes("--paginate") && args.includes("--slurp");
			return JSON.stringify(all ? pages[path] : pages[path][0]);
		}
		if (!(path in routes)) throw new Error(`unknown call ${path}`);
		return JSON.stringify(routes[path]);
	};
	return { calls, run };
}

test("collect: gathers ready work, inactive assignments, waiting answers, version drift and leftover branches", async () => {
	const { calls, run } = fake(
		() => "<!-- kagami v0.0.1 -->\r\n# AGENTS.md\r\n",
	);
	assert.deepEqual(await collect("o/r", tree, run, "0.1.0", NOW), {
		ready: [
			{ number: 1, kind: "plan" },
			{ number: 6, kind: "build" },
			{ number: 7, kind: "build" },
		],
		stale: [2],
		waiting: [7],
		drift: { repo: "0.0.1", plugin: "0.1.0" },
		leftover: { 6: ["leaf/6-old"] },
	});
	// counts only: every call is a gh api read
	for (const c of calls) {
		assert.deepEqual(c.slice(0, 2), ["gh", "api"]);
		assert.ok(!c.includes("-X") && !c.includes("-f"), c.join(" "));
	}
});

test("collect: a missing AGENTS.md means no version line; other failures are thrown as is", async () => {
	const missing = fake(() => {
		throw new Error("gh api failed\ngh: Not Found (HTTP 404)");
	});
	const got = await collect("o/r", tree, missing.run, "0.1.0", NOW);
	assert.deepEqual(got.drift, { repo: undefined, plugin: "0.1.0" });
	const down = fake(() => {
		throw new Error("gh api failed\nconnection refused");
	});
	await assert.rejects(collect("o/r", tree, down.run, "0.1.0", NOW));
});

test("collect: with neither AGENTS.md nor the dev branch, it is no dev rather than no version line", async () => {
	const missing = () => {
		throw new Error("gh api failed\ngh: Not Found (HTTP 404)");
	};
	const got = await collect(
		"o/r",
		tree,
		fake(missing, false).run,
		"0.1.0",
		NOW,
	);
	assert.deepEqual(got.drift, { plugin: "0.1.0", dev: false });
});

test("roots: only open issues with no parent and not a leaf that have at least one root template field", async () => {
	const calls: string[][] = [];
	const run: Run = async (cmd, args) => {
		calls.push([cmd, ...args]);
		return JSON.stringify([
			{ number: 77, body: "#71 평가자가 찾은 것\n\n## 목표\n\n고친다" }, // discovered issue with no parent
			{ number: 90, body: "## 기획 문서\r\n\r\ndocs/x.md\r\n" }, // root with missing fields (plan)
			{ number: 49, body: "## 기획 문서\n\n## 성공 기준\n\n## 안 할 것\n없음" },
			{ number: 12, body: "" },
		]);
	};
	assert.deepEqual(await roots("o/r", run), [49, 90]);
	assert.deepEqual(calls.length, 1);
	const [cmd, ...args] = calls[0];
	assert.deepEqual([cmd, args[0], args[1]], ["gh", "issue", "list"]);
	assert.ok(args.includes("no:parent-issue -label:leaf"), args.join(" "));
});

test("drift: reads a one-line AGENTS.md too", () => {
	assert.equal(drift("<!-- kagami v1.0.0 -->", "1.0.0"), undefined);
});
