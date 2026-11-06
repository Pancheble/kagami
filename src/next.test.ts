import assert from "node:assert/strict";
import { test } from "node:test";
import { collect, drift } from "./next.ts";
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

// 2: 5일 전 할당, 그 뒤 활동 없음 → stale
// 3: 이슈 댓글 1일 전 / 4: 잎 브랜치 커밋 1일 전 / 5: 잎 PR 갱신 1일 전 → stale 아님
// 6: 준비된 잎, 예전 잎 브랜치가 남음 / 7: 답 대기
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
					body: "하는 중",
					createdAt: ago(24),
					updatedAt: ago(24),
				},
			],
		}),
		node(4, me),
		node(5, me),
		node(6),
		node(7, { labels: ["leaf", "needs-decision"] }),
	],
});

const assigned = [
	{ event: "assigned", created_at: ago(120) },
	{ event: "labeled", created_at: ago(1) }, // 라벨은 활동이 아니다
];
const R = "repos/o/r";
function fake(agentsMd: () => string) {
	const calls: string[][] = [];
	const routes: Record<string, unknown> = {
		[`${R}/git/matching-refs/heads/leaf/`]: [
			{ ref: "refs/heads/leaf/4-y", object: { sha: "s4" } },
			{ ref: "refs/heads/leaf/6-old", object: { sha: "s6" } },
		],
		[`${R}/commits/s4`]: { commit: { committer: { date: ago(24) } } },
		[`${R}/pulls?state=all&sort=updated&direction=desc&per_page=100`]: [
			{ head: { ref: "leaf/5-z" }, updated_at: ago(24) },
			{ head: { ref: "leaf/22-x" }, updated_at: ago(1) }, // 2가 아니다
		],
		...Object.fromEntries(
			[2, 3, 4, 5].map((n) => [
				`${R}/issues/${n}/events?per_page=100`,
				assigned,
			]),
		),
	};
	const run: Run = async (cmd, args) => {
		calls.push([cmd, ...args]);
		const path = args[args.length - 1];
		if (path === `${R}/contents/AGENTS.md?ref=dev`) return agentsMd();
		if (!(path in routes)) throw new Error(`모르는 호출 ${path}`);
		return JSON.stringify(routes[path]);
	};
	return { calls, run };
}

test("collect: 준비된 일, 무활동 할당, 답 대기, 버전 차이, 남은 브랜치를 모은다", async () => {
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
	// 세기만 한다: 모두 gh api 읽기
	for (const c of calls) {
		assert.deepEqual(c.slice(0, 2), ["gh", "api"]);
		assert.ok(!c.includes("-X") && !c.includes("-f"), c.join(" "));
	}
});

test("collect: AGENTS.md가 없으면 버전 줄 없음으로, 다른 실패는 그대로 던진다", async () => {
	const missing = fake(() => {
		throw new Error("gh api 실패\ngh: Not Found (HTTP 404)");
	});
	const got = await collect("o/r", tree, missing.run, "0.1.0", NOW);
	assert.deepEqual(got.drift, { repo: undefined, plugin: "0.1.0" });
	const down = fake(() => {
		throw new Error("gh api 실패\nconnection refused");
	});
	await assert.rejects(collect("o/r", tree, down.run, "0.1.0", NOW));
});

test("drift: 한 줄짜리 AGENTS.md도 읽는다", () => {
	assert.equal(drift("<!-- kagami v1.0.0 -->", "1.0.0"), undefined);
});
