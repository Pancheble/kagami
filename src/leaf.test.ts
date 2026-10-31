import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";
import { lockClone, type Run, runLeaves, sh, verdict } from "./leaf.ts";
import { noKey } from "./session.ts";

type Comment = {
	id: number;
	body: string;
	created_at: string;
	updated_at?: string;
	user?: string;
	type?: string; // gh api의 .user.type
	assoc?: string; // author_association
};
type Issue = {
	title: string;
	body: string;
	labels: string[];
	assignees: string[];
	subIssues: number[];
	comments: Comment[];
	state: "OPEN" | "CLOSED";
	blockedBy?: number[];
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
		root?: Partial<Issue>;
		plans?: object[]; // 쪼개기 세션의 구조화 출력
		reds?: object[][]; // node --test 한 번마다 테스트 결과 줄
		merged?: object; // dev에 이미 있는 contracts/1/leaves.json
		extra?: Record<number, Partial<Issue>>; // 이슈를 더 두거나 덮어쓴다
		prs?: object[]; // gh pr list 결과
		touched?: string[]; // origin/dev와 달라진 추적 파일(git diff --name-only)
		status?: string[]; // 머지 판정마다 git diff --name-status의 출력(비면 바뀐 것 없음)
		show?: Record<string, string>; // git show <ref>:<파일>
		trees?: Record<string, string[]>; // git ls-tree <ref> -- contracts
		approvals?: string[]; // gh pr view(위험 경로 대기)마다 이 계정이 PR에 /승인을 단다
		prState?: string;
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
			...structuredClone(o.root ?? {}),
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
	for (const [n, i] of Object.entries(o.extra ?? {}))
		issues[Number(n)] = Object.assign(
			{
				title: `이슈 ${n}`,
				body: "",
				labels: ["node"],
				assignees: [],
				subIssues: [],
				comments: [],
				state: "OPEN",
			},
			issues[Number(n)],
			structuredClone(i),
		);
	const verdicts = [...(o.verdicts ?? [])];
	const ci = [...(o.ci ?? [])];
	const rebase = [...(o.rebase ?? [])];
	const ff = [...(o.ff ?? [])];
	const plans = [...(o.plans ?? [])];
	const reds = [...(o.reds ?? [])];
	const approvals = [...(o.approvals ?? [])];
	const status = [...(o.status ?? [])];
	const splits: string[] = []; // 쪼개기 세션 프롬프트
	const evals: string[] = []; // 평가자 프롬프트
	const calls: string[] = [];
	const prompts: string[] = [];
	let id = 1000;
	const prComments: Record<number, Comment[]> = {};
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
							blockedBy: {
								nodes: (i.blockedBy ?? []).map((b) => ({
									number: b,
									state: issues[b].state,
								})),
							},
							comments: {
								nodes: i.comments.map((c) => ({
									databaseId: c.id,
									body: c.body,
									createdAt: c.created_at,
									updatedAt: c.updated_at ?? c.created_at,
								})),
							},
						},
					},
				},
			});
		}
		if (line.startsWith("gh api repos/o/r/issues -X POST")) {
			const n = Math.max(...Object.keys(issues).map(Number)) + 1;
			issues[n] = {
				title: at("-f").slice(6),
				body: args[args.indexOf("-f", args.indexOf("-f") + 1) + 1].slice(5),
				labels: ["leaf"],
				assignees: [],
				subIssues: [],
				comments: [],
				state: "OPEN",
			};
			return JSON.stringify({ id: n * 10, number: n });
		}
		const sub = line.match(/repos\/o\/r\/issues\/(\d+)\/sub_issues -X POST/);
		if (sub) {
			issues[Number(sub[1])].subIssues.push(Number(at("-F").slice(13)) / 10);
			return "";
		}
		const dep = line.match(
			/repos\/o\/r\/issues\/(\d+)\/dependencies\/blocked_by/,
		);
		if (dep) {
			const i = issues[Number(dep[1])];
			i.blockedBy = [...(i.blockedBy ?? []), Number(at("-F").slice(9)) / 10];
			return "";
		}
		const del = line.match(/-X DELETE repos\/o\/r\/issues\/comments\/(\d+)/);
		if (del) {
			for (const i of Object.values(issues))
				i.comments = i.comments.filter((c) => c.id !== Number(del[1]));
			return "";
		}
		const patch = line.match(/-X PATCH repos\/o\/r\/issues\/comments\/(\d+)/);
		if (patch) {
			for (const i of Object.values(issues))
				for (const c of i.comments)
					if (c.id === Number(patch[1]))
						Object.assign(c, { body: at("-f").slice(5), updated_at: now() });
			return "";
		}
		const cm = line.match(/repos\/o\/r\/issues\/(\d+)\/comments/);
		// PR 댓글도 같은 이슈 댓글 API다. PR은 이슈 목록에 없으니 댓글만 둔다
		const thread = (n: number) => {
			if (issues[n]) return issues[n].comments;
			prComments[n] ??= [];
			return prComments[n];
		};
		if (cm && args.includes("POST")) {
			const c = {
				id: id++,
				created_at: now(),
				body: at("-f").slice(5),
				user: "pancheble",
			};
			thread(Number(cm[1])).push(c);
			return JSON.stringify(c);
		}
		if (cm)
			return thread(Number(cm[1]))
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
				if (args[k] === "--body") i.body = v;
				if (args[k] === "--title") i.title = v;
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
		if (line.startsWith("gh pr list")) return JSON.stringify(o.prs ?? []);
		if (line.startsWith("git diff --name-status")) return status.shift() ?? "";
		if (line.startsWith("git show") && o.show?.[args[1]] !== undefined)
			return o.show[args[1]];
		if (line.startsWith("git ls-tree"))
			return (o.trees?.[args[3]] ?? []).join("\n");
		if (cmd.endsWith("/biome")) {
			const dest = args
				.find((a) => a.startsWith("--reporter-file="))
				?.slice(16);
			if (dest) writeFileSync(dest, JSON.stringify({ diagnostics: [] }));
			return "";
		}
		if (line.startsWith("gh pr view")) {
			const who = approvals.shift();
			if (who)
				thread(12).push({
					id: id++,
					created_at: now(),
					body: "/승인",
					user: who,
					type: who.endsWith("[bot]") ? "Bot" : "User",
					assoc: who.endsWith("[bot]") ? "NONE" : "OWNER",
				});
			return `${o.prState ?? "OPEN"}\n`;
		}
		if (line.startsWith("git diff --name-only origin/dev"))
			return (o.touched ?? []).join("\n");
		if (line.startsWith("gh pr create"))
			return "https://github.com/o/r/pull/12\n";
		if (cmd === "claude" && args.includes("--append-system-prompt-file")) {
			evals.push(args[1]);
			return verdicts.shift() ?? "판정: PASS";
		}
		if (cmd === "claude" && args.includes("--json-schema")) {
			splits.push(args[1]);
			return JSON.stringify({ structured_output: plans.shift() ?? plan() });
		}
		if (line.startsWith("git show origin/dev:contracts/1/leaves.json")) {
			if (!o.merged) throw new Error("git show 실패\nfatal: path not in");
			return JSON.stringify(o.merged);
		}
		if (line.startsWith("git ls-files"))
			return "contracts/1/add.contract.js\ncontracts/1/app.accept.js\n";
		if (args[0] === "--test") {
			const dest = args
				.find((a) => a.startsWith("--test-reporter-destination="))
				?.slice(28);
			const rows = reds.shift() ?? [
				{ name: "t", ok: false, error: "Error: not implemented" },
			];
			if (dest)
				writeFileSync(dest, rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
			throw new Error("node --test 실패"); // 빨강이면 종료 코드가 0이 아니다
		}
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
	return { calls, prompts, splits, evals, run, issues, git, prComments };
}

// 쪼개기 세션의 기본 답: 잎 둘, 둘째는 첫째를 기다린다
const plan = (o: object = {}) => ({
	asIs: false,
	leaves: [
		{
			title: "add 구현",
			goal: "add가 합을 돌려준다",
			promises: "add(a, b): number",
			test: "node --test contracts/1/add.contract.js",
			scope: ["src/add.js"],
			waitFor: [],
		},
		{
			title: "앱 연결",
			goal: "앱이 add를 쓴다",
			promises: "add(a, b): number",
			test: "node --test contracts/1/app.accept.js",
			scope: ["src/app.js"],
			waitFor: [0],
		},
	],
	...o,
});

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

// ── 쪼개기 (T5) ──
// 뿌리 #1에 자식이 없으면 준비된 잎이 0 < 일꾼 1이라 쪼개기 신호가 뜬다
const bare = {
	subIssues: [],
	body: "## 목표\n\n덧셈 앱\n\n## 자식끼리의 약속\n\n- add(a, b)",
};
const splitOpts = () => ({
	...opts,
	dir: mkdtempSync(join(tmpdir(), "clone-")),
});

test("준비된 잎이 일꾼 수보다 적으면 가장 가까운 안 쪼갠 노드를 쪼개고, 그다음 새 잎을 고른다", async () => {
	const { calls, splits, run, issues } = fake({ root: bare });
	const o = splitOpts();
	const results = await runLeaves(o, run);
	assert.deepEqual(results, [
		{ issue: 1, pr: 12, outcome: "merged" },
		{ issue: 9, pr: 12, outcome: "merged" },
	]);
	inOrder(calls, [
		"gh api repos/o/r/issues/1/comments -X POST -f body=claim: pancheble/worker-1",
		"git show origin/dev:contracts/1/leaves.json", // 이어 할 쪼개기가 없다
		"gh issue view 1",
		"git worktree add -b split/1-1",
		"claude -p", // 쪼개기 세션
		"git ls-files",
		"git add -A",
		"git commit",
		"git push --force-with-lease -u origin split/1-1",
		"gh pr create",
		"gh pr comment 12 -R o/r --body 처음엔 빨강",
		"claude -p", // 약속 대조
		"gh pr comment 12 -R o/r --body 판정: PASS",
		"git rebase origin/dev",
		"gh pr checks 12",
		"git push origin HEAD:dev",
		"gh api repos/o/r/issues -X POST -f title=add 구현",
		"gh api repos/o/r/issues/1/sub_issues -X POST -F sub_issue_id=90",
		"gh api repos/o/r/issues -X POST -f title=앱 연결",
		"gh api repos/o/r/issues/1/sub_issues -X POST -F sub_issue_id=100",
		"gh api repos/o/r/issues/10/dependencies/blocked_by -X POST -F issue_id=90",
		"gh issue comment 1 -R o/r --body 쪼갬: #9, #10",
		"gh api -X DELETE repos/o/r/issues/comments/", // 노드 claim 놓기
		"gh api graphql",
		"git worktree add -b leaf/9-1", // #10은 #9를 기다린다
	]);
	// 테스트 파일마다 따로 돌린다
	assert.equal(count(calls, `${process.execPath} --test`), 2);
	// 쪼개기 세션: 부모 이슈만 읽고, gh 없이, 구조화 출력으로 잎을 돌려준다
	const session = calls.find((c) => c.includes("--json-schema")) ?? "";
	assert.match(session, /--permission-mode acceptEdits/);
	assert.ok(!session.includes("Bash(gh"), session);
	assert.match(splits[0], /덧셈 앱/);
	assert.match(splits[0], /contracts\/1\//);
	assert.ok(!splits[0].includes("더미 잎"), "다른 이슈를 넘기지 않는다");
	// 잎 티켓
	assert.deepEqual(issues[1].subIssues, [9, 10]);
	assert.deepEqual(issues[10].blockedBy, [9]);
	assert.ok(issues[9].labels.includes("leaf"));
	assert.match(
		issues[9].body,
		/## 끝 기준 테스트\n\nnode --test contracts\/1\/add.contract.js/,
	);
	assert.match(issues[9].body, /## 범위\n\n- src\/add.js/);
	assert.deepEqual(claims(issues[1]), []);
	// 쪼개기 결과는 contracts/1/leaves.json으로 같이 머지된다
	const saved = `${o.dir}-wt/split/1-1/contracts/1/leaves.json`;
	assert.deepEqual(JSON.parse(readFileSync(saved, "utf8")), plan());
});

test("빨강 결과는 PR 댓글로, 약속 대조 평가자는 쓰기 도구 없이 노드 이슈를 받는다", async () => {
	const { calls, evals, run } = fake({ root: bare });
	await runLeaves(splitOpts(), run);
	const check = calls.find(
		(c) => c.includes("--append-system-prompt-file") && c.includes("약속"),
	);
	assert.ok(check?.includes("--tools Read,Grep,Glob,Bash"), check);
	assert.ok(!/Write|Edit/.test(check ?? ""), check);
	assert.match(evals[0], /덧셈 앱/);
	assert.match(evals[0], /약속 대조/);
	assert.match(evals[0], /contracts\/1\/leaves\.json/);
});

test("처음엔 빨강이 아니면 FAIL: 이유를 들고 같은 worktree에서 다시 쪼갠다", async () => {
	const green = [{ name: "늘 통과", ok: true, error: "" }];
	const { calls, splits, run } = fake({ root: bare, reds: [green] });
	const [r] = await runLeaves(splitOpts(), run);
	assert.deepEqual(r, { issue: 1, pr: 12, outcome: "merged" });
	assert.equal(splits.length, 2);
	assert.match(splits[1], /늘 통과/);
	assert.equal(count(calls, "git worktree add"), 2); // 쪼개기 1 + 잎 1
	assert.equal(count(calls, "gh pr create"), 2);
});

test("잎 조건을 못 맞추면(범위 없음, 끝 기준이 contracts/<노드>/를 안 가리킴) FAIL로 다시 쪼갠다", async () => {
	const bad = plan();
	bad.leaves[0] = { ...bad.leaves[0], scope: [], test: "npm test" };
	const { calls, splits, run } = fake({ root: bare, plans: [bad] });
	await runLeaves(splitOpts(), run);
	assert.equal(splits.length, 2);
	assert.match(splits[1], /"add 구현": 범위가 비었다/);
	assert.match(splits[1], /"add 구현": 끝 기준 테스트가 contracts\/1\//);
	assert.equal(count(calls, "gh api repos/o/r/issues -X POST"), 2);
});

test("약속 대조가 NEEDS_WORK면 보고서를 들고 다시 쪼갠다", async () => {
	const { splits, run } = fake({
		root: bare,
		verdicts: ["판정: NEEDS_WORK\n약속 add(a, b) → 없음"],
	});
	await runLeaves(splitOpts(), run);
	assert.equal(splits.length, 2);
	assert.match(splits[1], /add\(a, b\) → 없음/);
});

test("쪼개기도 FAIL 3번이면 같은 길로 노드가 막힌다. 잎 이슈는 만들지 않는다", async () => {
	const { calls, run, issues } = fake({
		root: bare,
		verdicts: Array(3).fill("판정: NEEDS_WORK"),
	});
	assert.deepEqual(await runLeaves(splitOpts(), run), [
		{ issue: 1, pr: 12, outcome: "stuck" },
	]);
	assert.ok(calls.some((c) => c.startsWith("gh pr close split/1-1")));
	assert.ok(issues[1].labels.includes("stuck-1"));
	assert.match(issues[1].comments.at(-1)?.body ?? "", /^막힘 1\/3: /);
	assert.equal(count(calls, "gh api repos/o/r/issues -X POST"), 0);
	assert.deepEqual(claims(issues[1]), []);
});

test("노드가 이미 잎 조건을 만족하면 그대로 잎: 노드를 잎으로 바꾸고 고른다", async () => {
	const one = plan({ asIs: true });
	one.leaves = [one.leaves[0]];
	const { calls, run, issues } = fake({ root: bare, plans: [one] });
	assert.deepEqual(await runLeaves(splitOpts(), run), [
		{ issue: 1, pr: 12, outcome: "merged" },
		{ issue: 1, pr: 12, outcome: "merged" },
	]);
	assert.ok(
		calls.some((c) =>
			c.startsWith(
				"gh issue edit 1 -R o/r --remove-label node --add-label leaf",
			),
		),
	);
	assert.equal(count(calls, "gh api repos/o/r/issues -X POST"), 0);
	assert.match(issues[1].body, /^## 목표\n\n덧셈 앱/); // 원래 본문은 남긴다
	assert.match(issues[1].body, /## 범위\n\n- src\/add.js/);
	assert.ok(calls.some((c) => c.startsWith("git worktree add -b leaf/1-1")));
});

test("dev에 contracts/<노드>/leaves.json이 있는데 자식이 없으면 다시 쪼개지 않고 이슈 만들기만 잇는다", async () => {
	const { calls, splits, run, issues } = fake({ root: bare, merged: plan() });
	const [r] = await runLeaves(splitOpts(), run);
	assert.deepEqual(r, { issue: 1, pr: 0, outcome: "merged" });
	assert.equal(splits.length, 0);
	assert.ok(!calls.some((c) => c.startsWith("git worktree add -b split/")));
	assert.deepEqual(issues[1].subIssues, [9, 10]);
});

test("준비된 잎이 일꾼 수만큼 있으면 쪼개지 않는다", async () => {
	const { calls, run } = fake();
	await runLeaves(opts, run);
	assert.ok(!calls.some((c) => c.includes("leaves.json")));
});

// ── 클론 잠금 ──
const clone = () => {
	const dir = mkdtempSync(join(tmpdir(), "clone-"));
	mkdirSync(join(dir, ".git"));
	return dir;
};
test("클론 하나에 프로세스 하나: 살아 있는 프로세스가 쓰는 클론이면 시작을 거부한다", () => {
	const dir = clone();
	const unlock = lockClone(dir);
	assert.throws(() => lockClone(dir), /이미 쓰는 클론/);
	unlock();
	lockClone(dir)();
});

test("잠근 프로세스가 죽었으면 묵은 잠금을 넘겨받는다", () => {
	const dir = clone();
	const lock = join(dir, ".git", "kagami.lock");
	const dead = spawnSync(process.execPath, ["-e", ""]).pid;
	writeFileSync(lock, String(dead));
	const unlock = lockClone(dir);
	assert.equal(readFileSync(lock, "utf8"), String(process.pid));
	unlock();
	assert.equal(existsSync(lock), false);
});

// ── claim 하트비트와 라벨 (T6) ──
test("만료는 claim의 마지막 갱신 기준: 오래전에 달렸어도 최근에 갱신됐으면 끊긴 게 아니다", async () => {
	const old = "2020-01-01T00:00:00Z";
	const { calls, run } = fake({
		leaf: {
			comments: [
				{
					id: 1,
					created_at: old,
					updated_at: now(),
					body: "claim: x/worker-1\n갱신 2026-10-31T00:00:00Z",
				},
			],
		},
	});
	assert.deepEqual(await runLeaves(opts, run), []);
	assert.ok(!calls.some((c) => c.includes("DELETE")));
});

test("시도하는 동안 claim 댓글을 ttl/3마다 고쳐 써서 갱신하고, 끝나면 멈춘다", async () => {
	mock.timers.enable({ apis: ["setInterval"] });
	try {
		const { calls, run } = fake();
		const tick: Run = async (cmd, args, cwd) => {
			// 구현 세션이 도는 동안 2시간이 흐른다
			if (cmd === "claude" && !args.includes("--append-system-prompt-file"))
				mock.timers.tick(2 * 3_600_000);
			return run(cmd, args, cwd);
		};
		await runLeaves(opts, tick);
		const beats = calls.filter((c) =>
			c.startsWith("gh api -X PATCH repos/o/r/issues/comments/1000"),
		);
		assert.equal(beats.length, 1);
		assert.match(beats[0], /-f body=claim: pancheble\/worker-1\n갱신 \S+$/);
		mock.timers.tick(10 * 3_600_000);
		assert.equal(count(calls, "gh api -X PATCH"), 1);
	} finally {
		mock.timers.reset();
	}
});

test("라벨은 필요할 때 만든다: 막힘 4번째도 붙는다", async () => {
	const { calls, run, issues } = fake({
		leaf: { labels: ["leaf", "stuck-3"] },
		root: { subIssues: [5] },
		extra: { 5: { subIssues: [7] } },
		verdicts: Array(3).fill("판정: NEEDS_WORK"),
	});
	await runLeaves({ ...opts, focus: 5 }, run);
	inOrder(calls, [
		"gh label create stuck-4 -R o/r",
		"gh issue edit 7 -R o/r --add-label stuck-4 --remove-label stuck-3",
	]);
	assert.deepEqual(issues[7].labels, ["leaf", "stuck-4"]);
});

// ── 재계획 (T6) ──
// 뿌리 #1에 replan 라벨, 잎 #7이 세 번 막혔다
const signalled = {
	root: {
		labels: ["node", "replan"],
		body: "## 목표\n\n덧셈 앱\n\n## 자식끼리의 약속\n\n- add(a, b)",
		comments: [
			{ id: 50, created_at: now(), body: "재계획 신호: #7이 3번 막혔다" },
		],
	},
	leaf: {
		labels: ["leaf", "stuck-3"],
		comments: [
			{ id: 1, created_at: now(), body: "막힘 1/3: 이유 하나\n\n자세히 하나" },
			{ id: 2, created_at: now(), body: "막힘 2/3: 이유 둘" },
			{ id: 3, created_at: now(), body: "막힘 3/3: 이유 셋" },
		],
	},
};
// 재계획 세션의 기본 답: #7을 닫고 둘로 다시 쪼갠다
const rp = (o: object = {}) => ({
	action: "resplit",
	why: "#7의 끝 기준은 못 푸니 닫고 add와 앱 연결로 다시 쪼갠다",
	behavior: "",
	close: [7],
	rewrite: [],
	leaves: plan().leaves,
	...o,
});

test("재계획 신호에서 노드가 다시 쪼개진다: 막힌 잎을 닫고 새 잎을 만들고, 노드에 한 줄 남기고 replan을 뗀 뒤 새 잎을 고른다", async () => {
	const { calls, splits, evals, run, issues } = fake({
		...signalled,
		plans: [rp()],
	});
	const o = splitOpts();
	assert.deepEqual(await runLeaves(o, run), [
		{ issue: 1, pr: 12, outcome: "merged" },
		{ issue: 9, pr: 12, outcome: "merged" },
	]);
	inOrder(calls, [
		"gh api repos/o/r/issues/1/comments -X POST -f body=claim: pancheble/worker-1",
		"git fetch origin dev",
		"gh issue view 1",
		"gh pr list",
		"git worktree add -b replan/1-1",
		"claude -p", // 재계획 세션
		"git diff --name-only origin/dev", // 인수 테스트 수정 감지
		"git ls-files --others --modified", // 새로 쓰거나 고친 테스트만 처음엔 빨강
		"git commit",
		"git push --force-with-lease -u origin replan/1-1",
		"gh pr create",
		"gh pr comment 12 -R o/r --body 처음엔 빨강",
		"claude -p", // 약속 대조
		"git push origin HEAD:dev",
		"gh issue close 7 -R o/r --reason not planned",
		"gh api repos/o/r/issues -X POST -f title=add 구현",
		"gh api repos/o/r/issues/1/sub_issues -X POST -F sub_issue_id=90",
		"gh api repos/o/r/issues -X POST -f title=앱 연결",
		"gh api repos/o/r/issues/10/dependencies/blocked_by -X POST -F issue_id=90",
		"gh issue edit 1 -R o/r --remove-label replan",
		"gh issue comment 1 -R o/r --body 재계획 (resplit): ",
		"gh api -X DELETE repos/o/r/issues/comments/", // 노드 claim 놓기
		"gh api graphql",
		"git worktree add -b leaf/9-1",
	]);
	assert.equal(issues[7].state, "CLOSED");
	assert.deepEqual(issues[1].subIssues, [7, 9, 10]);
	assert.ok(!issues[1].labels.includes("replan"));
	const line = issues[1].comments.find((c) => c.body.startsWith("재계획 ("));
	assert.equal(
		line?.body,
		"재계획 (resplit): #7의 끝 기준은 못 푸니 닫고 add와 앱 연결로 다시 쪼갠다 — 닫음 #7 · 새 잎 #9, #10",
	);
	assert.equal(splits.length, 1);
	// 재계획 결과는 contracts/1/replan.json으로 같이 머지되고, 약속 대조는 그 파일을 본다
	const saved = `${o.dir}-wt/replan/1-1/contracts/1/replan.json`;
	assert.deepEqual(JSON.parse(readFileSync(saved, "utf8")), rp());
	assert.match(evals[0], /contracts\/1\/replan\.json/);
	assert.ok(!evals[0].includes("leaves.json"));
	// 노드 claim은 놓았다
	assert.deepEqual(claims(issues[1]), []);
});

test("재계획 세션은 쪼개기와 같은 권한(gh 없음)이고, 노드·자식 상태·막힌 이유·자식 PR의 결정 칸을 프롬프트로 받는다", async () => {
	const { calls, splits, run } = fake({
		...signalled,
		two: true,
		extra: { 8: { state: "CLOSED" } },
		plans: [rp()],
		prs: [
			{
				number: 30,
				state: "CLOSED",
				body: "Closes #7\n\n## 결정과 이유\n\n- 정규식으로 풀었다\n\n## 다음 사람에게\n\n- 없음",
			},
			{
				number: 31,
				state: "MERGED",
				body: "Closes #70\n\n## 결정과 이유\n\n- 남의 것",
			},
		],
	});
	await runLeaves(splitOpts(), run);
	const session = calls.find((c) => c.includes("--json-schema")) ?? "";
	assert.match(session, /--permission-mode acceptEdits/);
	assert.match(
		session,
		/--allowedTools Bash\(node \*\),Bash\(npm \*\),Bash\(git status\),Bash\(git diff \*\)/,
	);
	assert.ok(!session.includes("Bash(gh"), session);
	const p = splits[0];
	assert.match(p, /재계획 AI/);
	assert.match(p, /덧셈 앱/);
	assert.match(p, /#7 \[열림, 막힘 3\] 더미 잎/);
	assert.match(p, /hello.txt를 만든다/); // 열린 자식의 본문
	assert.match(p, /자세히 하나/); // 막힌 이유 전문
	assert.match(p, /#8 \[닫힘\] 다른 잎/);
	assert.match(p, /PR #30 \(#7\)[\s\S]*정규식으로 풀었다/);
	assert.ok(!p.includes("다음 사람에게"));
	assert.ok(!p.includes("남의 것"));
	assert.match(p, /contracts\/1\//);
});

test("고쳐 쓴 막힌 잎은 막힘 횟수가 0부터: 본문을 바꾸고 stuck 라벨을 떼고, 다음 시도는 첫 브랜치로", async () => {
	const t = plan().leaves[0];
	const { calls, run, issues } = fake({
		...signalled,
		plans: [
			rp({
				close: [],
				leaves: [],
				rewrite: [
					{
						number: 7,
						title: t.title,
						goal: t.goal,
						promises: t.promises,
						test: t.test,
						scope: t.scope,
					},
				],
			}),
		],
	});
	const [r, next] = await runLeaves(splitOpts(), run);
	assert.deepEqual(r, { issue: 1, pr: 12, outcome: "merged" });
	assert.equal(next.issue, 7);
	inOrder(calls, [
		"gh issue edit 7 -R o/r --title add 구현 --body ## 목표",
		"gh issue comment 1 -R o/r --body 재계획 (resplit): ",
		"git worktree add -b leaf/7-1",
	]);
	assert.ok(!issues[7].labels.some((l) => l.startsWith("stuck-")));
	assert.match(issues[7].body, /## 범위\n\n- src\/add.js/);
	assert.ok(
		!calls.some((c) => c.startsWith("gh issue close 7 -R o/r --reason")),
	);
	const line = issues[1].comments.find((c) => c.body.startsWith("재계획 ("));
	assert.match(line?.body ?? "", / — 고쳐 씀 #7$/);
});

test("막힌 잎을 닫지도 고쳐 쓰지도 않거나, 닫힌 자식을 건드리는 계획은 FAIL: 이유를 들고 다시 짠다", async () => {
	const { splits, run, issues } = fake({
		...signalled,
		two: true,
		extra: { 8: { state: "CLOSED" } },
		plans: [rp({ close: [8] }), rp()],
	});
	await runLeaves(splitOpts(), run);
	assert.equal(splits.length, 2);
	assert.match(splits[1], /막힌 잎 #7을 닫거나 고쳐 쓰지 않았다/);
	assert.match(splits[1], /#8은 열린 자식이 아니다/);
	assert.equal(issues[7].state, "CLOSED");
});

test("돌고 있는 잎이 아래에 있으면 재계획하지 않고 기다린다", async () => {
	const { calls, splits, run } = fake({
		...signalled,
		two: true,
		extra: {
			8: {
				comments: [{ id: 9, created_at: now(), body: "claim: x/worker-1" }],
			},
		},
	});
	assert.deepEqual(await runLeaves(splitOpts(), run), []);
	assert.equal(splits.length, 0);
	assert.ok(!calls.some((c) => c.includes("body=claim:")));
});

test("재계획이 기존 인수 테스트를 고치면 머지하지 않고 사람에게: human 라벨과 이유 댓글, 그 노드는 다시 고르지 않는다", async () => {
	const { calls, run, issues } = fake({
		...signalled,
		plans: [rp()],
		touched: ["contracts/1/app.accept.js", "contracts/1/add.contract.js"],
	});
	assert.deepEqual(await runLeaves(splitOpts(), run), [
		{ issue: 1, pr: 0, outcome: "human" },
	]);
	assert.ok(!calls.some((c) => c.startsWith("gh pr create")));
	assert.ok(!calls.some((c) => c.startsWith("git push")));
	assert.ok(calls.some((c) => c.startsWith("git worktree remove")));
	assert.ok(issues[1].labels.includes("human"));
	assert.ok(issues[1].labels.includes("replan")); // 잠금은 그대로
	const note = issues[1].comments.at(-1)?.body ?? "";
	assert.match(note, /^사람 확인 필요: 재계획이 인수 테스트를 고치려 했다/);
	assert.match(note, /contracts\/1\/app.accept.js/);
	assert.ok(!note.includes("add.contract.js"));
	assert.equal(issues[7].state, "OPEN");
	assert.deepEqual(claims(issues[1]), []);
	// 사람이 human을 뗄 때까지 그 노드는 다시 짜지 않는다
	const again = fake({
		...signalled,
		root: { ...signalled.root, labels: ["node", "replan", "human"] },
	});
	assert.deepEqual(await runLeaves(splitOpts(), again.run), []);
	assert.equal(again.splits.length, 0);
});

test("사용자에게 보이는 동작이 바뀌면 노드 이슈에 알림 한 줄. 작업은 멈추지 않는다", async () => {
	const { run, issues } = fake({
		...signalled,
		plans: [rp({ behavior: "비밀번호 로그인 → 매직 링크" })],
	});
	const results = await runLeaves(splitOpts(), run);
	assert.equal(results.length, 2);
	assert.ok(
		issues[1].comments.some(
			(c) => c.body === "동작 바뀜 알림: 비밀번호 로그인 → 매직 링크",
		),
	);
});

// 1 ── 4 (큰 가지) ── 5 (replan) ── 7 (막힘 3)
const deep = {
	...signalled,
	root: { labels: ["node"], subIssues: [4] },
	extra: {
		4: { subIssues: [5] },
		5: { ...signalled.root, subIssues: [7] },
	},
};

test("노드 목표 안에서 안 풀리면 한 층 위로: 노드의 replan을 부모로 옮기고 PR은 없다", async () => {
	const { calls, run, issues } = fake({
		...deep,
		plans: [rp({ action: "up", close: [], leaves: [], why: "약속이 틀렸다" })],
	});
	assert.deepEqual(await runLeaves(splitOpts(), run), [
		{ issue: 5, pr: 0, outcome: "up" },
	]);
	assert.ok(!calls.some((c) => c.startsWith("gh pr create")));
	assert.ok(!issues[5].labels.includes("replan"));
	assert.ok(issues[4].labels.includes("replan"));
	assert.match(
		issues[4].comments.at(-1)?.body ?? "",
		/^재계획 신호: #5에서 올라옴: 약속이 틀렸다/,
	);
	assert.equal(
		issues[5].comments.at(-1)?.body,
		"재계획 (up): 약속이 틀렸다 — #4로 올림",
	);
	assert.deepEqual(claims(issues[5]), []);
});

test("올릴 곳이 뿌리면 사람에게 간다", async () => {
	const { run, issues } = fake({
		...deep,
		root: { labels: ["node"], subIssues: [5] },
		extra: { 5: deep.extra[5] },
		plans: [rp({ action: "up", close: [], leaves: [], why: "목표가 틀렸다" })],
	});
	assert.deepEqual(await runLeaves(splitOpts(), run), [
		{ issue: 5, pr: 0, outcome: "human" },
	]);
	assert.ok(!issues[1].labels.includes("replan"));
	assert.ok(issues[5].labels.includes("human"));
	assert.match(
		issues[5].comments.at(-1)?.body ?? "",
		/^사람 확인 필요: 재계획이 뿌리까지 올라왔다: 목표가 틀렸다/,
	);
});

test("재계획도 FAIL 3번이면 노드가 막힌다(막힘이 쌓여 3번이면 한 층 위)", async () => {
	const { calls, run, issues } = fake({
		...signalled,
		plans: [rp(), rp(), rp()],
		verdicts: Array(3).fill("판정: NEEDS_WORK"),
	});
	assert.deepEqual(await runLeaves(splitOpts(), run), [
		{ issue: 1, pr: 12, outcome: "stuck" },
	]);
	assert.ok(calls.some((c) => c.startsWith("gh pr close replan/1-1")));
	assert.ok(issues[1].labels.includes("stuck-1"));
	assert.ok(issues[1].labels.includes("replan"));
	assert.equal(issues[7].state, "OPEN");
});

// ── 세션에 열쇠를 주지 않는다 (T6, T7에서 당겨 옴) ──
test("모든 claude 세션(구현자·평가자·쪼개기·재계획)은 GitHub·git 인증 없는 환경으로 뜨고, 나머지 명령은 하네스 환경 그대로", async () => {
	const { run } = fake({ ...signalled, plans: [rp()] });
	const envs: { cmd: string; env?: NodeJS.ProcessEnv }[] = [];
	const spy: Run = (cmd, args, cwd, env) => {
		envs.push({ cmd, env });
		return run(cmd, args, cwd, env);
	};
	await runLeaves(splitOpts(), spy);
	const sessions = envs.filter((e) => e.cmd === "claude");
	assert.ok(sessions.length >= 4, String(sessions.length)); // 재계획 · 약속 대조 · 구현 · 평가
	for (const { env } of sessions) {
		assert.ok(env, "세션에 env를 넘겨야 한다");
		for (const k of ["GH_TOKEN", "GITHUB_TOKEN", "SSH_AUTH_SOCK"])
			assert.equal(env[k], undefined, k);
		assert.match(env.GH_CONFIG_DIR ?? "", /nokey-/);
		assert.equal(env.GIT_TERMINAL_PROMPT, "0");
		assert.equal(env.GIT_CONFIG_KEY_0, "credential.helper");
		assert.equal(env.GIT_CONFIG_VALUE_0, "");
	}
	assert.ok(envs.filter((e) => e.cmd !== "claude").every((e) => !e.env));
});

test("인증 없는 환경에서는 git이 github.com 자격 증명을 못 얻고 GitHub 토큰도 없다", async () => {
	const saved = process.env.GH_TOKEN;
	process.env.GH_TOKEN = "가짜 토큰";
	try {
		const out = await sh(
			process.execPath,
			[
				"-e",
				`const { execSync } = require("node:child_process");
console.log(JSON.stringify({
	// 자격 증명을 실제로 얻을 수 있나. 얻으면 비밀번호가 나오니 출력은 버리고 성공 여부만 본다
	credential: (() => { try { execSync("git credential fill", { input: "protocol=https\\nhost=github.com\\n\\n", stdio: ["pipe", "ignore", "ignore"] }); return "얻음"; } catch { return "없음"; } })(),
	token: process.env.GH_TOKEN ?? null,
	config: require("node:fs").readdirSync(process.env.GH_CONFIG_DIR).length,
}));`,
			],
			undefined,
			noKey(),
		);
		assert.deepEqual(JSON.parse(out), {
			credential: "없음",
			token: null,
			config: 0,
		});
	} finally {
		if (saved === undefined) delete process.env.GH_TOKEN;
		else process.env.GH_TOKEN = saved;
	}
});

// ── 지키는 장치 (T7) ──
const prThread = (c: Record<number, Comment[]>) =>
	(c[12] ?? []).map((x) => x.body);

test("머지 앞의 판정은 PR 댓글로 남는다: 바뀐 게 없으면 통과", async () => {
	const { calls, run, prComments } = fake();
	await runLeaves(opts, run);
	inOrder(calls, [
		"git rebase origin/dev",
		"git diff --name-status --no-renames origin/dev HEAD",
		"gh api repos/o/r/issues/12/comments -X POST -f body=지키는 검사: 통과",
		"gh pr checks 12",
		"git push origin HEAD:dev",
	]);
	assert.match(prThread(prComments)[0], /래칫: dev에서 초록 0개/);
});

test("기존 계약 테스트를 고친 잎 PR은 막힌다: 머지 없이 막힘, 그 계약을 정한 노드에 재계획 신호", async () => {
	const { calls, prompts, run, issues, prComments } = fake({
		status: ["M\tcontracts/1/add.contract.js\nM\tsrc/add.js"],
	});
	assert.deepEqual(await runLeaves(opts, run), [
		{ issue: 7, pr: 12, outcome: "stuck" },
	]);
	assert.ok(!calls.some((c) => c.startsWith("git push origin HEAD:dev")));
	assert.ok(!calls.some((c) => c.startsWith("gh pr checks")));
	assert.equal(prompts.length, 1); // 잎이 고쳐서 다시 하지 않는다
	assert.match(
		prThread(prComments)[0],
		/^지키는 검사: 막힘 — 기존 계약·인수 테스트를 고쳤다: contracts\/1\/add\.contract\.js/,
	);
	inOrder(calls, [
		"git diff origin/dev HEAD -- contracts/1/add.contract.js", // 제안한 변경을 막힘 이유에 담는다
		"gh pr close leaf/7-1",
		"gh issue edit 7 -R o/r --add-label stuck-1",
		"gh issue edit 1 -R o/r --add-label replan",
	]);
	assert.match(
		issues[7].comments.at(-1)?.body ?? "",
		/^막힘 1\/3: 기존 계약·인수 테스트를 고쳤다/,
	);
	assert.match(
		issues[1].comments.at(-1)?.body ?? "",
		/^재계획 신호: #7이 #1의 계약 테스트를 고치려 했다 \(PR #12\)/,
	);
});

test("래칫: dev에서 초록이던 계약 테스트가 빨강이 되면 FAIL, 깨진 테스트를 들고 고친다", async () => {
	const trees = {
		"origin/dev": ["contracts/1/add.contract.js", "contracts/1/app.accept.js"],
		HEAD: ["contracts/1/add.contract.js", "contracts/1/app.accept.js"],
	};
	const green = [{ name: "합", ok: true, error: "" }];
	const red = [{ name: "앱", ok: false, error: "Error: not implemented" }];
	const broke = [{ name: "합", ok: false, error: "AssertionError" }];
	const { calls, prompts, run, prComments } = fake({
		trees,
		// dev 두 파일 → HEAD는 초록이 있던 파일만. 두 번째 머지에서는 고쳤다
		reds: [green, red, broke, green, red, green],
	});
	assert.deepEqual(await runLeaves(opts, run), [
		{ issue: 7, pr: 12, outcome: "merged" },
	]);
	inOrder(calls, [
		"git worktree add --detach /clone-wt/leaf/7-1-dev origin/dev",
		`${process.execPath} --test`,
		"git worktree remove --force /clone-wt/leaf/7-1-dev",
	]);
	assert.equal(prompts.length, 2);
	assert.match(prompts[1], /contracts\/1\/add\.contract\.js › 합/);
	assert.ok(!prompts[1].includes("› 앱")); // 아직 빨강인 건 봐준다
	assert.match(prThread(prComments)[0], /^지키는 검사: 막힘 — 래칫/);
	assert.match(prThread(prComments)[1], /^지키는 검사: 통과/);
	assert.match(
		prThread(prComments)[1],
		/래칫: dev에서 초록 1개 중 깨진 것: 없음/,
	);
});

const risky = {
	show: {
		"origin/dev:CLAUDE.md": "# Risk paths\n\n- `src/auth/`\n",
		"HEAD:CLAUDE.md": "# Risk paths\n\n- `src/auth/`\n",
	},
	status: ["M\tsrc/auth/keys.txt"],
};

test("위험 경로를 건드리면 CI 뒤에 /승인을 기다린다. 하네스 계정이나 bot이 단 /승인은 세지 않는다", async () => {
	const { calls, run, prComments } = fake({
		...risky,
		approvals: ["pancheble", "github-actions[bot]", "백찬"],
	});
	assert.deepEqual(await runLeaves({ ...opts, poll: 1 }, run), [
		{ issue: 7, pr: 12, outcome: "merged" },
	]);
	const [said] = prThread(prComments);
	assert.match(said, /^지키는 검사: 사람 승인 대기/);
	assert.match(said, /위험 경로:\n {2}- src\/auth\/keys\.txt/);
	inOrder(calls, [
		"gh pr checks 12",
		"gh api --paginate repos/o/r/issues/12/comments",
		"gh pr view 12", // 하네스 계정의 /승인이 달린다
		"gh pr view 12", // PR 워크플로가 bot으로 /승인을 단다
		"gh pr view 12", // 사람의 /승인이 달린다
		"gh api --paginate repos/o/r/issues/12/comments",
		"git push origin HEAD:dev",
	]);
	assert.equal(count(calls, "gh pr view 12"), 3);
});

test("/승인은 대기 댓글 뒤에 달린 것만 센다: 다시 평가하면 다시 받는다", async () => {
	const { calls, run, prComments } = fake({
		...risky,
		status: [risky.status[0], risky.status[0]],
		ci: [false], // CI 실패 → 고치고 다시 평가
		approvals: ["백찬"],
	});
	// 첫 CI가 도는 동안 사람이 첫 대기 댓글에 /승인을 단다. 다시 평가한 뒤에는 세지 않는다
	let early = true;
	const spy: Run = (cmd, args, cwd, env) => {
		if (early && cmd === "gh" && args[0] === "pr" && args[1] === "checks") {
			early = false;
			return run("gh", [
				"api",
				"repos/o/r/issues/12/comments",
				"-X",
				"POST",
				"-f",
				"body=/승인",
			]).then(() => {
				Object.assign(prComments[12].at(-1) as Comment, {
					user: "백찬",
					type: "User",
					assoc: "COLLABORATOR",
				});
				return run(cmd, args, cwd, env);
			});
		}
		return run(cmd, args, cwd, env);
	};
	assert.deepEqual(await runLeaves({ ...opts, poll: 1 }, spy), [
		{ issue: 7, pr: 12, outcome: "merged" },
	]);
	assert.equal(count(calls, "gh pr view 12"), 1);
});

test("/승인 뒤 fast-forward가 거절돼 다시 rebase해도 승인은 그대로다", async () => {
	const { calls, run } = fake({
		...risky,
		status: [risky.status[0], risky.status[0]],
		ff: [false],
		approvals: ["백찬"],
	});
	assert.deepEqual(await runLeaves({ ...opts, poll: 1 }, run), [
		{ issue: 7, pr: 12, outcome: "merged" },
	]);
	assert.equal(count(calls, "git rebase origin/dev"), 2);
	assert.equal(count(calls, "gh pr view 12"), 1);
});

test("위험 경로 대기 중에 사람이 PR을 닫으면 바로 막힌다", async () => {
	const { calls, run, issues } = fake({ ...risky, prState: "CLOSED" });
	assert.deepEqual(await runLeaves({ ...opts, poll: 1 }, run), [
		{ issue: 7, pr: 12, outcome: "stuck" },
	]);
	assert.equal(count(calls, "git rebase origin/dev"), 1);
	assert.ok(!calls.some((c) => c.startsWith("git push origin HEAD:dev")));
	assert.match(
		issues[7].comments.at(-1)?.body ?? "",
		/^막힘 1\/3: 위험 경로 대기 중에 PR이 닫혔다/,
	);
});

test("지운 테스트도 /승인을 기다린다. 새 의존성은 세서 댓글에만 남긴다", async () => {
	const { run, prComments } = fake({
		status: ["D\tsrc/add.test.js\nM\tpackage.json"],
		show: {
			"origin/dev:package.json": '{"dependencies":{"a":"1"}}',
			"HEAD:package.json": '{"dependencies":{"a":"1","left-pad":"1"}}',
		},
		approvals: ["백찬"],
	});
	await runLeaves({ ...opts, poll: 1 }, run);
	const [said] = prThread(prComments);
	assert.match(said, /^지키는 검사: 사람 승인 대기/);
	assert.match(said, /지운 테스트:\n {2}- src\/add\.test\.js/);
	assert.match(said, /새 의존성:\n {2}- left-pad/);
});

test("재계획의 병렬 변경은 자기 노드의 옛 계약 테스트를 고칠 수 있다. 다른 재계획은 고치면 FAIL로 다시 짠다", async () => {
	const touch = "M\tcontracts/1/add.contract.js";
	const expand = fake({
		...signalled,
		plans: [rp({ action: "expand" })],
		status: [touch],
	});
	const [r] = await runLeaves(splitOpts(), expand.run);
	assert.deepEqual(r, { issue: 1, pr: 12, outcome: "merged" });

	const resplit = fake({ ...signalled, plans: [rp(), rp()], status: [touch] });
	const [r2] = await runLeaves(splitOpts(), resplit.run);
	assert.deepEqual(r2, { issue: 1, pr: 12, outcome: "merged" });
	assert.equal(resplit.splits.length, 2);
	assert.match(resplit.splits[1], /고치거나 지우지 마/);
	assert.ok(!resplit.issues[1].labels.includes("stuck-1"));
});

test("여러 노드의 계약을 고쳤으면 노드마다 재계획 신호", async () => {
	const { issues, run } = fake({
		root: { subIssues: [5, 7] },
		extra: { 5: {} },
		status: ["M\tcontracts/1/a.contract.js\nD\tcontracts/5/b.accept.js"],
	});
	await runLeaves(opts, run);
	assert.ok(issues[1].labels.includes("replan"));
	assert.ok(issues[5].labels.includes("replan"));
});
