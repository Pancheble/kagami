import assert from "node:assert/strict";
import { test } from "node:test";
import { type Run, runLeaves, verdict } from "./leaf.ts";

type Comment = { id: number; body: string; created_at: string };
type Issue = {
	title: string;
	body: string;
	labels: string[];
	assignees: string[];
	subIssues: number[];
	comments: Comment[];
	state: "OPEN" | "CLOSED";
};

const now = () => new Date().toISOString();

// 뿌리 #1 아래 잎 #7 하나. 라벨·댓글·담당을 기억하는 가짜 GitHub와 git·claude.
// 평가 판정, CI, rebase, dev fast-forward 결과는 차례로 꺼내 쓴다(비면 성공)
function fake(
	o: {
		leaf?: Partial<Issue>;
		verdicts?: string[];
		ci?: boolean[];
		rebase?: boolean[];
		ff?: boolean[];
		implThrows?: boolean;
		two?: boolean; // 범위가 다른 잎 #8도 둔다
	} = {},
) {
	const issues: Record<number, Issue> = {
		1: {
			title: "뿌리",
			body: "",
			labels: ["node"],
			assignees: [],
			subIssues: [7],
			comments: [],
			state: "OPEN",
		},
		7: {
			title: "더미 잎",
			body: "hello.txt를 만든다\n\n## 범위\n\n- hello.txt\n",
			labels: ["leaf"],
			assignees: [],
			subIssues: [],
			comments: [],
			state: "OPEN",
			...structuredClone(o.leaf ?? {}),
		},
		8: {
			title: "다른 잎",
			body: "## 범위\n\n- other.txt\n",
			labels: ["leaf"],
			assignees: [],
			subIssues: [],
			comments: [],
			state: "OPEN",
		},
	};
	if (o.two) issues[1].subIssues.push(8);
	const verdicts = [...(o.verdicts ?? [])];
	const ci = [...(o.ci ?? [])];
	const rebase = [...(o.rebase ?? [])];
	const ff = [...(o.ff ?? [])];
	const calls: string[] = [];
	const prompts: string[] = [];
	let id = 1000;
	let gits = 0;
	const git = { most: 0 }; // 동시에 돈 git 명령 수의 최대
	const run: Run = async (cmd, args) => {
		const line = [cmd, ...args].join(" ");
		calls.push(line);
		if (cmd === "git") {
			git.most = Math.max(git.most, ++gits);
			await new Promise((r) => setTimeout(r, 1));
			gits--;
		}
		const at = (flag: string) => args[args.indexOf(flag) + 1];
		if (line.startsWith("gh api graphql")) {
			const n = Number(args.find((a) => a.startsWith("number="))?.slice(7));
			const i = issues[n];
			return JSON.stringify({
				data: {
					repository: {
						issue: {
							number: n,
							title: i.title,
							body: i.body,
							state: i.state,
							labels: { nodes: i.labels.map((name) => ({ name })) },
							assignees: { nodes: i.assignees.map((login) => ({ login })) },
							subIssues: { nodes: i.subIssues.map((number) => ({ number })) },
							blockedBy: { nodes: [] },
							comments: {
								nodes: i.comments.map((c) => ({
									databaseId: c.id,
									body: c.body,
									createdAt: c.created_at,
								})),
							},
						},
					},
				},
			});
		}
		const del = line.match(/-X DELETE repos\/o\/r\/issues\/comments\/(\d+)/);
		if (del) {
			for (const i of Object.values(issues))
				i.comments = i.comments.filter((c) => c.id !== Number(del[1]));
			return "";
		}
		const cm = line.match(/repos\/o\/r\/issues\/(\d+)\/comments/);
		if (cm && args.includes("POST")) {
			const c = { id: id++, created_at: now(), body: at("-f").slice(5) };
			issues[Number(cm[1])].comments.push(c);
			return JSON.stringify(c);
		}
		if (cm)
			return issues[Number(cm[1])].comments
				.map((c) => `${JSON.stringify(c)}\n`)
				.join("");
		if (line.startsWith("gh issue view")) return issues[Number(args[2])].body;
		if (line.startsWith("gh issue edit")) {
			const i = issues[Number(args[2])];
			for (let k = 0; k < args.length; k++) {
				const v = args[k + 1];
				if (args[k] === "--add-label") i.labels.push(v);
				if (args[k] === "--remove-label")
					i.labels = i.labels.filter((l) => l !== v);
				if (args[k] === "--add-assignee") i.assignees.push("pancheble");
				if (args[k] === "--remove-assignee") i.assignees = [];
			}
			return "";
		}
		if (line.startsWith("gh issue comment")) {
			issues[Number(args[2])].comments.push({
				id: id++,
				created_at: now(),
				body: at("--body"),
			});
			return "";
		}
		if (line.startsWith("gh issue close")) {
			issues[Number(args[2])].state = "CLOSED";
			return "";
		}
		if (line.startsWith("gh pr create"))
			return "https://github.com/o/r/pull/12\n";
		if (cmd === "claude" && args.includes("--append-system-prompt-file"))
			return verdicts.shift() ?? "판정: PASS";
		if (cmd === "claude") {
			prompts.push(args[1]);
			if (o.implThrows) throw new Error("claude -p 실패\n세션이 죽었다");
		}
		if (line.startsWith("gh pr checks") && ci.shift() === false)
			throw new Error("gh pr checks 실패\ntest\tfail");
		if (line.startsWith("git rebase origin/dev") && rebase.shift() === false)
			throw new Error("git rebase 실패\nCONFLICT");
		if (line.startsWith("git push origin HEAD:dev") && ff.shift() === false)
			throw new Error("git push 실패\n! [rejected] (fetch first)");
		return "";
	};
	return { calls, prompts, run, issues, git };
}

const opts = {
	repo: "o/r",
	dir: "/clone",
	claude: "claude",
	workers: 1,
	root: 1,
	focus: 1,
	dial: Infinity,
	account: "pancheble",
	ttl: 6,
};

// calls 안에 order가 이 순서로 나오는지
function inOrder(calls: string[], order: string[]) {
	let i = 0;
	for (const c of calls) if (i < order.length && c.startsWith(order[i])) i++;
	assert.equal(
		i,
		order.length,
		`여기서 멈춤: ${order[i]}\n${calls.join("\n")}`,
	);
}
const count = (calls: string[], prefix: string) =>
	calls.filter((c) => c.startsWith(prefix)).length;
const claims = (i: Issue) =>
	i.comments.filter((c) => c.body.startsWith("claim: "));

test("verdict는 보고서에서 처음 나온 판정을 읽는다", () => {
	assert.equal(verdict("커밋 abc\n판정: PASS\n..."), "PASS");
	assert.equal(verdict("판정: NEEDS_WORK\n나중에 PASS 가능"), "NEEDS_WORK");
	assert.equal(verdict("판정 없음"), "NEEDS_WORK");
	assert.equal(
		verdict("형식(PASS / NEEDS_WORK)\n판정: NEEDS_WORK"),
		"NEEDS_WORK",
	);
	assert.equal(verdict("**판정: PASS**"), "PASS");
});

test("pick.ts로 잎을 고르고 claim을 이긴 뒤, 구현 → 평가 → rebase·CI → dev fast-forward → 닫기", async () => {
	const { calls, run, issues } = fake();
	assert.deepEqual(await runLeaves(opts, run), [
		{ issue: 7, pr: 12, outcome: "merged" },
	]);
	inOrder(calls, [
		"gh api graphql",
		"gh api repos/o/r/issues/7/comments -X POST -f body=claim: pancheble/worker-1",
		"gh issue edit 7 -R o/r --add-assignee @me",
		"git worktree add -b leaf/7-1",
		"claude -p", // 구현자
		"git commit",
		"git push --force-with-lease -u origin leaf/7-1",
		"gh pr create",
		"claude -p", // 평가자
		"gh pr comment 12",
		"git rebase origin/dev",
		"git push --force-with-lease",
		"gh pr checks 12",
		"git push origin HEAD:dev", // force 없이: dev가 움직였으면 거절된다
		"gh issue close 7",
	]);
	assert.ok(!calls.some((c) => c.includes("HEAD:dev") && c.includes("force")));
	assert.ok(!calls.some((c) => c.startsWith("gh pr merge")));
	assert.equal(issues[7].state, "CLOSED");
});

test("평가자는 쓰기 도구 없이 돌고, 판정은 PR 댓글로 남는다", async () => {
	const { calls, run } = fake();
	await runLeaves(opts, run);
	const evaluator = calls.find((c) =>
		c.includes("--append-system-prompt-file"),
	);
	assert.ok(evaluator?.includes("--tools Read,Grep,Glob,Bash"), evaluator);
	assert.ok(!/Write|Edit/.test(evaluator ?? ""), evaluator);
	// -p에는 승인할 사람이 없다. 끝 기준을 돌릴 명령은 미리 허용해야 한다
	assert.ok(evaluator?.includes("--allowedTools Bash(npm *)"), evaluator);
	assert.ok(calls.includes("gh pr comment 12 -R o/r --body 판정: PASS"));
});

test("NEEDS_WORK면 평가 보고서를 들고 같은 worktree에서 고치고 다시 평가한다", async () => {
	const { calls, prompts, run } = fake({
		verdicts: ["판정: NEEDS_WORK\n7. 테스트 없음"],
	});
	assert.deepEqual(await runLeaves(opts, run), [
		{ issue: 7, pr: 12, outcome: "merged" },
	]);
	assert.equal(prompts.length, 2);
	assert.match(prompts[1], /7\. 테스트 없음/);
	assert.equal(count(calls, "git worktree add"), 1);
	assert.equal(count(calls, "gh pr create"), 1);
	assert.equal(count(calls, "gh pr comment 12"), 2);
});

test("FAIL 3번이면 막힘: PR 닫기, claim 놓기, 막힘 1 라벨, 막힘 이유 댓글. 머지·닫기는 없다", async () => {
	const { calls, run, issues } = fake({
		verdicts: Array(3).fill("판정: NEEDS_WORK\n7. 못 풂"),
	});
	assert.deepEqual(await runLeaves(opts, run), [
		{ issue: 7, pr: 12, outcome: "stuck" },
	]);
	assert.equal(count(calls, "claude -p"), 6);
	assert.ok(
		calls.some((c) =>
			c.startsWith("gh pr close leaf/7-1 -R o/r --delete-branch"),
		),
	);
	assert.ok(calls.includes("gh issue edit 7 -R o/r --remove-assignee @me"));
	assert.deepEqual(claims(issues[7]), []);
	assert.deepEqual(issues[7].labels, ["leaf", "stuck-1"]);
	const note = issues[7].comments.at(-1)?.body ?? "";
	assert.match(note, /^막힘 1\/3: 평가 NEEDS_WORK/);
	assert.match(note, /7\. 못 풂/);
	assert.ok(!calls.some((c) => c.startsWith("git push origin HEAD:dev")));
	assert.equal(issues[7].state, "OPEN");
	assert.ok(!issues[1].labels.includes("replan"));
});

test("다음 시도는 새 브랜치에서 새 세션으로, 지난 막힘 이유를 읽고 시작한다", async () => {
	const { calls, prompts, run } = fake({
		leaf: {
			labels: ["leaf", "stuck-1"],
			comments: [
				{
					id: 1,
					created_at: now(),
					body: "막힘 1/3: 평가 NEEDS_WORK\n\n범위 밖 파일",
				},
			],
		},
	});
	await runLeaves(opts, run);
	assert.ok(calls.some((c) => c.startsWith("git worktree add -b leaf/7-2")));
	assert.match(prompts[0], /범위 밖 파일/);
});

test("머지 실패도 FAIL로 센다: fast-forward가 거절되면 1번(rebase)부터 다시", async () => {
	const { calls, run } = fake({ ff: [false, false] });
	assert.deepEqual(await runLeaves(opts, run), [
		{ issue: 7, pr: 12, outcome: "merged" },
	]);
	assert.equal(count(calls, "git rebase origin/dev"), 3);
	assert.equal(count(calls, "git push origin HEAD:dev"), 3);
	assert.equal(count(calls, "claude -p"), 2); // 코드는 그대로라 다시 구현·평가하지 않는다
});

test("fast-forward 거절이 3번이면 막힌다", async () => {
	const { run, issues } = fake({ ff: [false, false, false] });
	assert.deepEqual(await runLeaves(opts, run), [
		{ issue: 7, pr: 12, outcome: "stuck" },
	]);
	assert.match(
		issues[7].comments.at(-1)?.body ?? "",
		/^막힘 1\/3: .*fast-forward/,
	);
});

test("CI 실패는 FAIL이고, CI 출력을 들고 고친 뒤 다시 평가한다", async () => {
	const { calls, prompts, run } = fake({ ci: [false] });
	assert.deepEqual(await runLeaves(opts, run), [
		{ issue: 7, pr: 12, outcome: "merged" },
	]);
	assert.equal(prompts.length, 2);
	assert.match(prompts[1], /test\tfail/);
	assert.equal(count(calls, "gh pr comment 12"), 2);
});

test("rebase 충돌은 FAIL이고 rebase를 되돌린다", async () => {
	const { calls, run } = fake({ rebase: [false] });
	assert.deepEqual(await runLeaves(opts, run), [
		{ issue: 7, pr: 12, outcome: "merged" },
	]);
	inOrder(calls, [
		"git rebase origin/dev",
		"git rebase --abort",
		"git rebase origin/dev",
	]);
});

test("세 번째 막힘이면 부모에 replan 라벨과 막힘 1~3 이유를 모은 재계획 신호 댓글", async () => {
	const { run, issues } = fake({
		leaf: {
			labels: ["leaf", "stuck-2"],
			comments: [
				{ id: 1, created_at: now(), body: "막힘 1/3: 이유 하나\n\n자세히" },
				{ id: 2, created_at: now(), body: "아무 댓글" },
				{ id: 3, created_at: now(), body: "막힘 2/3: 이유 둘" },
			],
		},
		verdicts: Array(3).fill("판정: NEEDS_WORK"),
	});
	await runLeaves(opts, run);
	assert.deepEqual(issues[7].labels, ["leaf", "stuck-3"]);
	assert.ok(issues[1].labels.includes("replan"));
	const signal = issues[1].comments.at(-1)?.body ?? "";
	assert.match(signal, /^재계획 신호: #7/);
	assert.match(signal, /막힘 1\/3: 이유 하나\n/);
	assert.ok(!signal.includes("자세히"));
	assert.match(signal, /막힘 2\/3: 이유 둘/);
	assert.match(signal, /막힘 3\/3: 평가 NEEDS_WORK/);
});

test("시도가 끊겨 claim이 만료되면 막혔을 때와 같은 길: claim 놓기 + 막힘 1 + 이유 댓글. 그다음 다시 고른다", async () => {
	const old = "2020-01-01T00:00:00Z";
	const { calls, run } = fake({
		leaf: {
			assignees: ["pancheble"],
			comments: [
				{ id: 1, created_at: old, body: "claim: pancheble/worker-1" },
				{ id: 2, created_at: old, body: "claim: pancheble/worker-2" }, // 진 쪽이 지우기 전에 죽음
			],
		},
	});
	assert.deepEqual(await runLeaves(opts, run), [
		{ issue: 7, pr: 12, outcome: "merged" },
	]);
	inOrder(calls, [
		"gh pr close leaf/7-1",
		"gh api -X DELETE repos/o/r/issues/comments/1",
		"gh issue edit 7 -R o/r --remove-assignee @me",
		"gh issue edit 7 -R o/r --add-label stuck-1",
		"gh issue comment 7 -R o/r --body 막힘 1/3: 시도가 끊겼다",
		"gh api graphql", // 다시 읽고 고른다
		"git worktree add -b leaf/7-2",
	]);
	assert.ok(calls.includes("gh api -X DELETE repos/o/r/issues/comments/2"));
});

test("만료되지 않은 claim은 건드리지 않고, 그 잎을 고르지 않는다", async () => {
	const { calls, run } = fake({
		leaf: {
			comments: [{ id: 1, created_at: now(), body: "claim: x/worker-1" }],
		},
	});
	assert.deepEqual(await runLeaves(opts, run), []);
	assert.ok(!calls.some((c) => c.includes("DELETE")));
});

test("시도 중 예상 못 한 오류도 같은 길로 막힘 처리한다", async () => {
	const { run, issues } = fake({ implThrows: true });
	assert.deepEqual(await runLeaves(opts, run), [
		{ issue: 7, pr: 0, outcome: "stuck" },
	]);
	assert.deepEqual(claims(issues[7]), []);
	assert.deepEqual(issues[7].labels, ["leaf", "stuck-1"]);
	assert.match(
		issues[7].comments.at(-1)?.body ?? "",
		/^막힘 1\/3: 오류: claude -p 실패/,
	);
});

test("일꾼이 여럿이면 잎마다 시도하고, 같은 클론의 git 명령은 한 번에 하나씩 돈다", async () => {
	const { run, git } = fake({ two: true });
	assert.deepEqual(await runLeaves({ ...opts, workers: 2 }, run), [
		{ issue: 7, pr: 12, outcome: "merged" },
		{ issue: 8, pr: 12, outcome: "merged" },
	]);
	assert.equal(git.most, 1);
});

test("고를 잎이 없으면 트리만 읽는다", async () => {
	const { calls, run } = fake({ leaf: { state: "CLOSED" } });
	assert.deepEqual(await runLeaves(opts, run), []);
	assert.deepEqual(
		calls.map((c) => c.split(" ").slice(0, 3).join(" ")),
		["gh api graphql", "gh api graphql"],
	);
});
