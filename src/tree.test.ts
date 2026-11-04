import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Run } from "./run.ts";
import { ensureLabels, readTree } from "./tree.ts";

// GraphQL 응답 모양 그대로의 가짜 이슈들
const issues: Record<number, object> = {
	1: {
		number: 1,
		title: "뿌리",
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
		title: "가지",
		body: "",
		state: "OPEN",
		labels: {
			nodes: [{ name: "node" }, { name: "replan" }, { name: "human" }],
		},
		assignees: { nodes: [] },
		subIssues: { nodes: [{ number: 4 }] },
		blockedBy: { nodes: [] },
		comments: { nodes: [] },
	},
	3: {
		number: 3,
		title: "잎 A",
		body: "## 목표\n\n무엇\n\n## 범위\n\n<!-- 주석 -->\n- `src/a.ts`\n- src/b/\n\n## 기다릴 티켓\n\n- #4\n",
		state: "OPEN",
		labels: { nodes: [{ name: "leaf" }, { name: "stuck-2" }] },
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
		title: "잎 B",
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

test("뿌리에서 하위 이슈와 blocked-by를 따라 트리를 읽는다", async () => {
	const { calls, run } = fake();
	const tree = await readTree("o/r", 1, run);
	assert.deepEqual(tree, {
		number: 1,
		title: "뿌리",
		state: "open",
		kind: "node",
		assignees: [],
		blockedBy: [],
		replan: false,
		human: false,
		stuck: 0,
		scope: [],
		comments: [],
		children: [
			{
				number: 2,
				title: "가지",
				state: "open",
				kind: "node",
				assignees: [],
				blockedBy: [],
				replan: true,
				human: true,
				stuck: 0,
				scope: [],
				comments: [],
				children: [
					{
						number: 4,
						title: "잎 B",
						state: "closed",
						kind: "leaf",
						assignees: [],
						blockedBy: [],
						replan: false,
						human: false,
						stuck: 0,
						scope: [],
						comments: [],
						children: [],
					},
				],
			},
			{
				number: 3,
				title: "잎 A",
				state: "open",
				kind: "leaf",
				assignees: ["bot"],
				blockedBy: [
					{ number: 4, state: "open" },
					{ number: 9, state: "closed" },
				],
				replan: false,
				human: false,
				stuck: 2,
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

test("댓글은 100개를 넘어도 끝까지 페이지를 넘겨 읽는다", async () => {
	const page = (ids: number[], next?: string) => ({
		pageInfo: { hasNextPage: !!next, endCursor: next ?? null },
		nodes: ids.map((id) => ({
			databaseId: id,
			body: `댓글 ${id}`,
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

test("없는 이슈면 번호를 말하며 실패한다", async () => {
	const run: Run = async () =>
		JSON.stringify({ data: { repository: { issue: null } } });
	await assert.rejects(readTree("o/r", 42, run), /#42/);
});

test("상태 라벨을 덮어쓰기로 만든다", async () => {
	const calls: string[] = [];
	const run: Run = async (cmd, args) => {
		calls.push([cmd, ...args].join(" "));
		return "";
	};
	await ensureLabels("o/r", run);
	for (const l of ["node", "leaf", "replan", "stuck-1", "stuck-2", "stuck-3"])
		assert.ok(
			calls.some((c) => c.startsWith(`gh label create ${l} -R o/r`)),
			l,
		);
	assert.ok(calls.every((c) => c.includes("--force")));
});

test("이슈 템플릿에 블록 목록의 칸이 다 있다", () => {
	const read = (f: string) =>
		readFileSync(
			new URL(`../.github/ISSUE_TEMPLATE/${f}`, import.meta.url),
			"utf8",
		);
	const node = read("node.md");
	assert.match(node, /^labels: node$/m);
	for (const h of ["목표", "인수 테스트", "자식끼리의 약속", "바뀐 약속"])
		assert.match(node, new RegExp(`^## ${h}`, "m"), h);
	const leaf = read("leaf.md");
	assert.match(leaf, /^labels: leaf$/m);
	for (const h of [
		"목표",
		"지킬 약속",
		"끝 기준 테스트",
		"범위",
		"기다릴 티켓",
	])
		assert.match(leaf, new RegExp(`^## ${h}`, "m"), h);
});
