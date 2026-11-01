import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run } from "./leaf.ts";
import {
	claim,
	isClaim,
	num,
	overlaps,
	ready,
	release,
	replans,
	unsplit,
} from "./pick.ts";
import type { Tree } from "./tree.ts";

const node = (number: number, children: Tree[], replan = false): Tree => ({
	number,
	title: `노드 ${number}`,
	state: "open",
	kind: "node",
	assignees: [],
	blockedBy: [],
	replan,
	human: false,
	stuck: 0,
	scope: [],
	comments: [],
	children,
});
const leaf = (number: number, o: Partial<Tree> = {}): Tree => ({
	...node(number, []),
	title: `잎 ${number}`,
	kind: "leaf",
	scope: [`src/${number}.ts`],
	...o,
});

// 1 ─┬─ 2 ─┬─ 3 (집중) ─┬─ 10
//    │     │             └─ 4 ── 11   (집중 노드 아래 더 깊은 잎도 거리 0)
//    │     ├─ 20, 21                  (한 층 위 사촌)
//    │     └─ 5 ── 22
//    └─ 6 ── 30                       (두 층 위)
const tree = () =>
	node(1, [
		node(2, [
			node(3, [leaf(10), node(4, [leaf(11)])]),
			leaf(20),
			leaf(21),
			node(5, [leaf(22)]),
		]),
		node(6, [leaf(30)]),
	]);

const nums = (ls: Tree[]) => ls.map((l) => l.number);

test("집중 노드에서 가까운 순: 형제 → 한 층 위 사촌 → 그 위", () => {
	assert.deepEqual(nums(ready(tree(), 3, Infinity)), [10, 11, 20, 21, 22, 30]);
});

test("범위 다이얼: 몇 층까지 올라가나", () => {
	assert.deepEqual(nums(ready(tree(), 3, 0)), [10, 11]);
	assert.deepEqual(nums(ready(tree(), 3, 1)), [10, 11, 20, 21, 22]);
	assert.deepEqual(nums(ready(tree(), 3, 2)), [10, 11, 20, 21, 22, 30]);
	// 뿌리에 집중하면 다이얼과 상관없이 트리 전체
	assert.deepEqual(nums(ready(tree(), 1, 0)), [10, 11, 20, 21, 22, 30]);
});

test("닫힘 · 기다림 남음 · 담당 있음 · 재계획 잠금인 잎은 고르지 않는다", () => {
	const t = node(1, [
		leaf(10, { state: "closed" }),
		leaf(11, { blockedBy: [{ number: 10, state: "open" }] }),
		leaf(12, { blockedBy: [{ number: 9, state: "closed" }] }),
		leaf(13, { assignees: ["bot"] }),
		node(2, [leaf(14), node(3, [leaf(15)])], true), // 잠금은 아래로 다 번진다
		leaf(16, { replan: true }),
		leaf(17),
	]);
	assert.deepEqual(nums(ready(t, 1, 0)), [12, 17]);
});

test("집중 노드 위가 잠겨 있으면 그 아래는 고르지 않는다", () => {
	const t = node(1, [node(2, [node(3, [leaf(10)]), leaf(20)], true), leaf(30)]);
	assert.deepEqual(nums(ready(t, 3, Infinity)), [30]);
});

test("안 쪼갠 노드(자식 없음)를 가까운 순으로. 닫힘 · 담당 있음 · 재계획 잠금은 빼고, 다이얼을 지킨다", () => {
	const t = node(1, [
		node(2, [node(3, []), node(4, [], true), leaf(10)]),
		node(5, []),
		node(6, [node(7, [])], true),
		{ ...node(8, []), state: "closed" },
		{
			...node(9, []),
			comments: [
				{
					id: 1,
					author: "x",
					type: "User",
					assoc: "COLLABORATOR",
					body: "claim: x/worker-1",
					createdAt: "",
					updatedAt: "",
				},
			],
		},
	]);
	assert.deepEqual(nums(unsplit(t, 2, Infinity)), [3, 5]);
	assert.deepEqual(nums(unsplit(t, 2, 0)), [3]);
});

test("없는 집중 노드면 번호를 말하며 실패한다", () => {
	assert.throws(() => ready(tree(), 99, 0), /#99/);
});

test("범위 겹침은 경로 조각 단위 앞부분 일치, 빈 범위는 모두와 겹친다", () => {
	assert.ok(overlaps(["src/"], ["src/tree.ts"]));
	assert.ok(overlaps(["src/tree.ts"], ["./src/tree.ts"]));
	assert.ok(!overlaps(["src/tree.ts"], ["src/tree.test.ts"]));
	assert.ok(!overlaps(["src/a/"], ["src/ab/x.ts"]));
	assert.ok(overlaps(["docs/x.md", "src/a.ts"], ["src/a.ts"]));
	assert.ok(overlaps([], ["src/a.ts"]));
});

test("이미 담당이 걸린 열린 잎과 범위가 겹치면 고르지 않는다 (다이얼 밖이어도)", () => {
	const t = node(1, [
		node(2, [
			leaf(10, { scope: ["src/x/"] }),
			leaf(11),
			leaf(12, { scope: [] }),
		]),
		leaf(30, { scope: ["src/x/y.ts"], assignees: ["bot"] }),
		leaf(31, { scope: ["src/11.ts"], state: "closed", assignees: ["bot"] }),
	]);
	assert.deepEqual(nums(ready(t, 2, 0)), [11]);
});

test("claim 댓글만 달리고 assignee가 아직 없는 잎도 담당이 걸린 것으로 본다", () => {
	const claimed = [
		{
			id: 1,
			author: "bot",
			type: "User",
			assoc: "COLLABORATOR",
			body: "claim: bot/worker-1",
			createdAt: "2026-10-30T00:00:00Z",
			updatedAt: "2026-10-30T00:00:00Z",
		},
	];
	const chat = [
		{
			id: 2,
			author: "pancheble",
			body: "claim은 나중에",
			createdAt: "2026-10-30T00:00:00Z",
			updatedAt: "2026-10-30T00:00:00Z",
		},
	];
	const t = node(1, [
		node(2, [
			leaf(10, { scope: ["src/x/"] }),
			leaf(11),
			leaf(12, { comments: chat }),
		]),
		leaf(30, { scope: ["src/x/y.ts"], comments: claimed }),
		leaf(31, { comments: claimed }),
	]);
	assert.deepEqual(nums(ready(t, 2, 0)), [11, 12]);
	assert.deepEqual(nums(ready(t, 1, 0)), [11, 12]);
});

test("--workers, --dial 같은 숫자 인자는 정수인지 검사한다", () => {
	assert.equal(num("--workers", "3", 1), 3);
	assert.equal(num("--dial", "0", 0), 0);
	for (const bad of ["", "abc", "1.5", "-1", "2x"])
		assert.throws(() => num("--dial", bad, 0), /--dial/, bad);
	assert.throws(() => num("--workers", "0", 1), /--workers/);
});

// claim 댓글: 가장 먼저 달린 claim이 이긴다. 같은 시각이면 댓글 id가 작은 쪽
type Comment = {
	id: number;
	created_at: string;
	body: string;
	user?: string;
	type?: string;
	assoc?: string;
};
function fake(before: Record<number, Comment[]> = {}) {
	const calls: string[] = [];
	const comments: Record<number, Comment[]> = structuredClone(before);
	let id = 1000;
	const run: Run = async (cmd, args) => {
		const line = [cmd, ...args].join(" ");
		calls.push(line);
		const del = line.match(/-X DELETE repos\/o\/r\/issues\/comments\/(\d+)/);
		if (del)
			for (const n in comments)
				comments[n] = comments[n].filter((c) => c.id !== Number(del[1]));
		const m = line.match(/repos\/o\/r\/issues\/(\d+)\/comments/);
		if (m && args.includes("POST")) {
			const c = {
				id: id++,
				created_at: "2026-10-30T00:00:05Z",
				body: args[args.indexOf("-f") + 1].slice(5),
				type: "User",
				assoc: "COLLABORATOR", // 하네스 계정도 협업자다
			};
			comments[Number(m[1])] = [...(comments[Number(m[1])] ?? []), c];
			return JSON.stringify(c);
		}
		// 작성자를 따로 적지 않은 댓글은 협업자(다른 하네스 일꾼 등)가 단 것으로 본다
		if (m)
			return (comments[Number(m[1])] ?? [])
				.map(
					(c) =>
						`${JSON.stringify({ type: "User", assoc: "COLLABORATOR", ...c })}\n`,
				)
				.join("");
		return "";
	};
	return { calls, run, comments };
}

const ls = () => ready(tree(), 3, Infinity);

test("일꾼 수만큼 앞에서부터 claim 댓글을 달고, 이기면 assignee를 표시로 건다 (기본 1)", async () => {
	const { calls, run } = fake();
	const got = await claim("o/r", ls(), run, { account: "pancheble" });
	assert.deepEqual(
		got.map((g) => [g.leaf.number, g.worker]),
		[[10, "pancheble/worker-1"]],
	);
	assert.ok(
		calls.includes(
			"gh api repos/o/r/issues/10/comments -X POST -f body=claim: pancheble/worker-1",
		),
	);
	assert.ok(calls.includes("gh issue edit 10 -R o/r --add-assignee @me"));

	const three = await claim("o/r", ls(), fake().run, {
		account: "pancheble",
		workers: 3,
	});
	assert.deepEqual(
		three.map((g) => [g.leaf.number, g.worker]),
		[
			[10, "pancheble/worker-1"],
			[11, "pancheble/worker-2"],
			[20, "pancheble/worker-3"],
		],
	);
});

test("먼저 달린 claim이 있으면 내 claim을 지우고 다음 잎으로", async () => {
	const { calls, run, comments } = fake({
		10: [
			{ id: 5, created_at: "2026-10-30T00:00:00Z", body: "아무 댓글" },
			{
				id: 7,
				created_at: "2026-10-30T00:00:01Z",
				body: "claim: pancheble/worker-9",
			},
		],
	});
	const got = await claim("o/r", ls(), run, { account: "pancheble" });
	assert.deepEqual(
		got.map((g) => [g.leaf.number, g.worker]),
		[[11, "pancheble/worker-1"]],
	);
	assert.ok(calls.includes("gh api -X DELETE repos/o/r/issues/comments/1000"));
	assert.ok(!calls.includes("gh issue edit 10 -R o/r --add-assignee @me"));
	assert.equal(comments[10].length, 2);
});

test("같은 시각이면 댓글 id가 작은 claim이 이긴다", async () => {
	const at = "2026-10-30T00:00:05Z"; // 가짜가 새 댓글에 붙이는 시각과 같다
	const lose = fake({
		10: [{ id: 999, created_at: at, body: "claim: x/worker-1" }],
	});
	const a = await claim("o/r", ls(), lose.run, { account: "pancheble" });
	assert.equal(a[0].leaf.number, 11);
	const win = fake({
		10: [{ id: 2000, created_at: at, body: "claim: x/worker-1" }],
	});
	const b = await claim("o/r", ls(), win.run, { account: "pancheble" });
	assert.equal(b[0].leaf.number, 10);
});

test("이번에 고른 잎과 범위가 겹치는 잎은 건너뛴다", async () => {
	const t = node(1, [
		leaf(10, { scope: ["src/"] }),
		leaf(11, { scope: ["src/a.ts"] }),
		leaf(12, { scope: ["docs/"] }),
	]);
	const { calls, run } = fake();
	const got = await claim("o/r", ready(t, 1, 0), run, {
		account: "a",
		workers: 2,
	});
	assert.deepEqual(
		got.map((g) => g.leaf.number),
		[10, 12],
	);
	assert.ok(!calls.some((c) => c.includes("issues/11/")));
});

test("고를 잎이 없으면 빈 목록", async () => {
	const { calls, run } = fake();
	assert.deepEqual(await claim("o/r", [], run, { account: "a" }), []);
	assert.equal(calls.length, 0);
});

test("놓을 때 내 claim 댓글과 assignee를 지운다", async () => {
	const { calls, run } = fake();
	const [g] = await claim("o/r", ls(), run, { account: "a" });
	await release("o/r", g, run);
	assert.ok(
		calls.includes(`gh api -X DELETE repos/o/r/issues/comments/${g.comment}`),
	);
	assert.ok(calls.includes("gh issue edit 10 -R o/r --remove-assignee @me"));
});

test("재계획할 노드: replan이고 사람 대기가 아니며, 아래에 돌고 있는 잎이 없다", () => {
	const claimed = {
		comments: [
			{
				id: 1,
				author: "x",
				type: "User",
				assoc: "COLLABORATOR",
				body: "claim: x/worker-1",
				createdAt: "",
				updatedAt: "",
			},
		],
	};
	const t = node(1, [
		node(2, [leaf(10, { stuck: 3 })], true),
		node(3, [leaf(11, claimed)], true),
		{ ...node(4, [leaf(12)], true), human: true },
		node(5, [leaf(13)]),
	]);
	assert.deepEqual(nums(replans(t)), [2]);
});

test("claim 댓글은 갱신 줄이 붙어도 claim이다", () => {
	assert.ok(isClaim("claim: x/worker-1\n갱신 2026-10-31T00:00:00.000Z"));
	assert.ok(!isClaim("claim: x/worker-1\n아무 말"));
});

// 사람도 일꾼 하나: 협업자 이상의 사람 계정(User)이 단 claim도 하네스 claim과 같은 판정으로 담당이다
const said = (author: string, type: string, assoc: string) => [
	{
		id: 1,
		author,
		type,
		assoc,
		body: `claim: ${author}`,
		createdAt: "2026-10-30T00:00:00Z",
		updatedAt: "2026-10-30T00:00:00Z",
	},
];

test("사람 협업자가 단 claim도 담당이다: 그 잎과 범위가 겹치는 잎을 고르지 않는다. 협업자가 아닌 사람·bot의 claim은 세지 않는다", () => {
	const t = (comments: Tree["comments"]) =>
		node(1, [
			leaf(10, { scope: ["src/x/"], comments }),
			leaf(11, { scope: ["src/x/y.ts"] }),
			leaf(12),
		]);
	for (const assoc of ["OWNER", "MEMBER", "COLLABORATOR"])
		assert.deepEqual(
			nums(ready(t(said("teammate", "User", assoc)), 1, 0)),
			[12],
			assoc,
		);
	for (const [type, assoc] of [
		["User", "CONTRIBUTOR"],
		["User", "NONE"],
		["Bot", "NONE"],
		["Bot", "COLLABORATOR"],
	])
		assert.deepEqual(
			nums(ready(t(said("someone", type, assoc)), 1, 0)),
			[10, 11, 12],
			`${type} ${assoc}`,
		);
	// 작성자를 모르는 claim(지워진 계정 등)도 세지 않는다
	assert.deepEqual(
		nums(ready(t([{ ...said("", "", "")[0] }]), 1, 0)),
		[10, 11, 12],
	);
	// 사람이 claim을 지우면 다시 고른다
	assert.deepEqual(nums(ready(t([]), 1, 0)), [10, 11, 12]);
});

test("사람 claim이 걸린 잎이 아래에 있으면 재계획하지 않는다 (하네스 claim과 같다)", () => {
	const t = node(1, [
		node(2, [leaf(10, { comments: said("teammate", "User", "MEMBER") })], true),
		node(3, [leaf(11, { comments: said("x", "User", "NONE") })], true),
	]);
	assert.deepEqual(nums(replans(t)), [3]);
});

test("먼저 단 사람 협업자의 claim이 이긴다. 협업자가 아닌 사람·bot의 claim은 순서에 안 든다", async () => {
	const early = (user: string, type: string, assoc: string) =>
		fake({
			10: [
				{
					id: 7,
					created_at: "2026-10-30T00:00:01Z",
					body: `claim: ${user}`,
					user,
					type,
					assoc,
				} as Comment,
			],
		});
	const human = early("teammate", "User", "COLLABORATOR");
	const a = await claim("o/r", ls(), human.run, { account: "pancheble" });
	assert.equal(a[0].leaf.number, 11);
	assert.ok(
		human.calls.includes("gh api -X DELETE repos/o/r/issues/comments/1000"),
	);
	for (const [type, assoc] of [
		["User", "NONE"],
		["Bot", "NONE"],
	]) {
		const b = await claim("o/r", ls(), early("x", type, assoc).run, {
			account: "pancheble",
		});
		assert.equal(b[0].leaf.number, 10, `${type} ${assoc}`);
	}
});
