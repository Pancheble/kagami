// 잎 루프 세 겹: 평가 FAIL 3번 → 막힘(claim 놓고 다음 고르기에서 새 세션), 막힘 3번 → 부모에 재계획 신호.
// 잎은 pick.ts로 고르고, 머지 실패(rebase 충돌·CI·fast-forward 거절)도 FAIL로 센다.
// 실행: node src/leaf.ts --repo owner/name --dir <로컬 클론> --root <뿌리>
//       [--focus <집중 노드>] [--dial <층 수>] [--workers 1] [--ttl <시간>] [--claude <claude 경로>]
import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import {
	all,
	type Claim,
	claim,
	isClaim,
	num,
	path,
	ready,
	release,
} from "./pick.ts";
import { readTree, type Tree } from "./tree.ts";

export type Run = (
	cmd: string,
	args: string[],
	cwd?: string,
) => Promise<string>;
type Opts = {
	repo: string;
	dir: string;
	claude: string;
	workers: number;
	root: number; // 뿌리 이슈
	focus: number; // 집중 노드
	dial: number; // 범위 다이얼
	account: string; // claim에 적는 gh 계정
	ttl: number; // 시간. 이보다 오래된 claim은 시도가 끊긴 것으로 본다
};
export type Result = {
	issue: number;
	pr: number; // PR을 만들기 전에 막혔으면 0
	outcome: "merged" | "stuck";
};

const EVALUATOR = fileURLToPath(
	new URL("../.claude/agents/evaluator.md", import.meta.url),
);
const FAILS = 3; // 한 시도에서 FAIL이 이만큼이면 막힘
const STUCKS = 3; // 막힘이 이만큼이면 부모에 재계획 신호

export function verdict(report: string): "PASS" | "NEEDS_WORK" {
	return report.match(/판정:\s*(PASS|NEEDS_WORK)/)?.[1] === "PASS"
		? "PASS"
		: "NEEDS_WORK";
}

async function waitChecks(pr: number, o: Opts, run: Run, cwd: string) {
	// push 직후엔 체크가 아직 안 잡혀 있을 수 있다
	for (let tries = 0; ; tries++) {
		try {
			return await run(
				"gh",
				["pr", "checks", String(pr), "-R", o.repo, "--watch", "--fail-fast"],
				cwd,
			);
		} catch (e) {
			if (tries >= 30 || !String(e).includes("no checks reported")) throw e;
			await sleep(10_000);
		}
	}
}

const quiet = (p: Promise<unknown>) => p.catch(() => {});
const firstLine = (s: string) => s.split("\n")[0];
const stuckNotes = (t: Tree) =>
	t.comments.map((c) => c.body).filter((b) => /^막힘 \d+\/\d+: /.test(b));
const branchOf = (t: Tree) => `leaf/${t.number}-${t.stuck + 1}`; // 시도마다 새 브랜치
const worktreeOf = (t: Tree, o: Opts) => `${o.dir}-wt/${branchOf(t)}`;

// 막힘과 끊긴 시도(claim 만료)가 같이 지나는 길: 이번 시도의 흔적을 치우고
// claim 놓기 + 막힘 +1 + 막힘 이유 댓글. 막힘이 STUCKS에 닿으면 부모에 replan 라벨과 재계획 신호
async function giveUp(
	tree: Tree,
	leaf: Tree,
	claims: Claim[],
	why: string,
	detail: string,
	o: Opts,
	run: Run,
) {
	const n = String(leaf.number);
	const k = leaf.stuck + 1;
	// 끊긴 시도는 PR·브랜치·worktree가 어디까지 생겼는지 모른다
	await quiet(
		run(
			"gh",
			["pr", "close", branchOf(leaf), "-R", o.repo, "--delete-branch"],
			o.dir,
		),
	);
	await quiet(
		run("git", ["worktree", "remove", "--force", worktreeOf(leaf, o)], o.dir),
	);
	await quiet(run("git", ["branch", "-D", branchOf(leaf)], o.dir));
	for (const c of claims) await release(o.repo, c, run);
	await run("gh", [
		"issue",
		"edit",
		n,
		"-R",
		o.repo,
		"--add-label",
		`stuck-${k}`,
		...(k > 1 ? ["--remove-label", `stuck-${k - 1}`] : []),
	]);
	const note = `막힘 ${k}/${STUCKS}: ${why}`;
	await run("gh", [
		"issue",
		"comment",
		n,
		"-R",
		o.repo,
		"--body",
		detail ? `${note}\n\n${detail}` : note,
	]);
	// ponytail: 뿌리가 잎이면 부모가 없어 신호를 못 낸다. 막힘 4번째부터는 T6이 replan을 뗀 뒤의 일이다
	const parent = path(tree, leaf.number)?.at(-2);
	if (k < STUCKS || !parent) return;
	await run("gh", [
		"issue",
		"edit",
		String(parent.number),
		"-R",
		o.repo,
		"--add-label",
		"replan",
	]);
	const reasons = [...stuckNotes(leaf), note].map((b) => `- ${firstLine(b)}`);
	await run("gh", [
		"issue",
		"comment",
		String(parent.number),
		"-R",
		o.repo,
		"--body",
		`재계획 신호: #${n}이 ${k}번 막혔다\n\n${reasons.join("\n")}`,
	]);
}

// 순차 머지: 잠금 대신 dev의 fast-forward가 잠금이다. 그 사이 dev가 움직이면 push가 거절된다.
// 실패면 FAIL 이유를 돌려준다. fix가 있으면 구현자가 고칠 것이 있다는 뜻
async function merge(
	pr: number,
	wt: string,
	o: Opts,
	run: Run,
): Promise<{ why: string; fix?: string } | undefined> {
	await run("git", ["fetch", "origin", "dev"], wt);
	try {
		await run("git", ["rebase", "origin/dev"], wt);
	} catch (e) {
		await quiet(run("git", ["rebase", "--abort"], wt));
		return { why: `dev에 rebase하면 충돌난다\n\n${e}` };
	}
	await run("git", ["push", "--force-with-lease"], wt);
	try {
		await waitChecks(pr, o, run, wt);
	} catch (e) {
		return { why: "CI 실패", fix: `CI가 실패했다. 고쳐:\n${e}` };
	}
	try {
		await run("git", ["push", "origin", "HEAD:dev"], wt); // force 없이
	} catch (e) {
		return { why: `dev가 그새 움직여 fast-forward가 거절됐다\n\n${e}` };
	}
}

// 한 시도: claim을 쥔 채 FAIL이 FAILS번 될 때까지 고치고 다시 평가한다. 끝나면 머지되거나 막힌다
async function attempt(
	tree: Tree,
	c: Claim,
	o: Opts,
	run: Run,
): Promise<Result> {
	const i = c.leaf;
	const n = String(i.number);
	const branch = branchOf(i);
	const wt = worktreeOf(i, o);
	let pr = 0;
	let fails = 0;
	let why = "";
	let detail = "";
	try {
		const body = await run("gh", [
			"issue",
			"view",
			n,
			"-R",
			o.repo,
			"--json",
			"body",
			"--jq",
			".body",
		]);
		const ticket = `티켓 #${n}: ${i.title}\n\n${body}`;
		const notes = stuckNotes(i);
		const before = notes.length
			? `\n\n이 잎은 전에 막혔다. 같은 길로 가지 마:\n\n${notes.join("\n\n")}`
			: "";

		await run("git", ["fetch", "origin", "dev"], o.dir);
		await run(
			"git",
			["worktree", "add", "-b", branch, wt, "origin/dev"],
			o.dir,
		);

		let fix: string | undefined = "";
		while (fails < FAILS) {
			if (fix !== undefined) {
				await run(
					o.claude,
					[
						"-p",
						`너는 구현자다. 아래 잎 티켓을 구현해. 테스트부터 쓰고, 티켓 범위 밖 파일은 건드리지 마. 커밋은 하지 마.\n\n${ticket}${before}${fix && `\n\n${fix}`}`,
						"--permission-mode",
						"acceptEdits",
						"--allowedTools",
						"Bash(npm test),Bash(npm run *),Bash(node *),Bash(git status),Bash(git diff *)",
					],
					wt,
				);
				await run("git", ["add", "-A"], wt);
				await run(
					"git",
					["commit", "--allow-empty", "-m", `#${n} ${i.title}`],
					wt,
				);
				await run(
					"git",
					["push", "--force-with-lease", "-u", "origin", branch],
					wt,
				);
				if (!pr) {
					const url = await run(
						"gh",
						[
							"pr",
							"create",
							"-R",
							o.repo,
							"--base",
							"dev",
							"--head",
							branch,
							"--title",
							i.title,
							"--body",
							`Closes #${n}`,
						],
						wt,
					);
					pr = Number(url.trim().split("/").pop());
				}
				// 평가자: 매 라운드 새 세션, 쓰기 도구 없음. 구현자의 출력은 넘기지 않는다
				const report = await run(
					o.claude,
					[
						"-p",
						`${ticket}\n\n여기서 dev는 origin/dev다(git diff origin/dev...HEAD). 보고서 맨 위에 "판정: PASS" 또는 "판정: NEEDS_WORK"를 적어.`,
						"--append-system-prompt-file",
						EVALUATOR,
						"--tools",
						"Read,Grep,Glob,Bash",
						// ponytail: 끝 기준을 돌릴 명령만 미리 허용한다. 티켓마다 명령이 다르면 잎 티켓에 적게 한다
						"--allowedTools",
						"Bash(npm *),Bash(node *),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status),Bash(git rev-parse *)",
					],
					wt,
				);
				await run(
					"gh",
					["pr", "comment", String(pr), "-R", o.repo, "--body", report],
					wt,
				);
				if (verdict(report) !== "PASS") {
					fails++;
					why = `평가 NEEDS_WORK (PR #${pr})`;
					detail = report;
					fix = `평가자가 NEEDS_WORK를 줬다. 보고서를 보고 고쳐:\n\n${report}`;
					continue;
				}
			}
			const failed = await merge(pr, wt, o, run);
			if (!failed) {
				await run("gh", ["issue", "close", n, "-R", o.repo], o.dir);
				await run("git", ["worktree", "remove", "--force", wt], o.dir);
				await run("git", ["branch", "-D", branch], o.dir);
				await quiet(run("git", ["push", "origin", "--delete", branch], o.dir));
				return { issue: i.number, pr, outcome: "merged" };
			}
			fails++;
			[why, detail] = [firstLine(failed.why), failed.fix ?? failed.why];
			fix = failed.fix; // 고칠 게 없으면(충돌·거절) 구현·평가 없이 rebase부터 다시
		}
	} catch (e) {
		why = `오류: ${firstLine(String(e).replace(/^Error: /, ""))}`;
		detail = String(e);
	}
	await giveUp(tree, i, [c], why, detail, o, run);
	return { issue: i.number, pr, outcome: "stuck" };
}

// 만료된 claim이 걸린 열린 잎을 막힘으로 돌린다. 하나라도 돌렸으면 true
async function expire(tree: Tree, o: Opts, run: Run): Promise<boolean> {
	const cutoff = Date.now() - o.ttl * 3_600_000;
	let any = false;
	for (const t of all(tree)) {
		if (t.kind !== "leaf" || t.state !== "open") continue;
		const old = t.comments.filter(
			(c) => isClaim(c.body) && Date.parse(c.createdAt) < cutoff,
		);
		if (!old.length) continue;
		const claims = old.map((c) => ({
			leaf: t,
			worker: c.body.slice(7).trim(),
			comment: c.id,
		}));
		await giveUp(
			tree,
			t,
			claims,
			`시도가 끊겼다 (claim 만료: ${claims[0].worker}, ${old[0].createdAt})`,
			"",
			o,
			run,
		);
		any = true;
	}
	return any;
}

// ponytail: 일꾼들이 클론 하나를 같이 쓰니 git 명령을 한 줄로 세운다(.git/config와 ref 잠금이 부딪힌다).
// 머지 잠금은 아니다: CI 기다리기와 dev fast-forward 판정은 줄 밖이다. 프로세스가 여럿이면 클론을 나눈다
function oneGit(run: Run): Run {
	let line: Promise<unknown> = Promise.resolve();
	return (cmd, args, cwd) => {
		if (cmd !== "git") return run(cmd, args, cwd);
		const next = line.then(() => run(cmd, args, cwd));
		line = next.catch(() => {});
		return next;
	};
}

// 한 번 돌기: 트리를 읽고 → 끊긴 시도를 막힘으로 → pick.ts로 일꾼 수만큼 고르고 claim → 잎마다 시도
// ponytail: 한 번 고르고 끝난다. 다음 잎으로 계속 도는 루프는 정지 파일과 함께 T10
export async function runLeaves(o: Opts, raw: Run): Promise<Result[]> {
	const run = oneGit(raw);
	let tree = await readTree(o.repo, o.root, run);
	if (await expire(tree, o, run)) tree = await readTree(o.repo, o.root, run);
	const got = await claim(o.repo, ready(tree, o.focus, o.dial), run, {
		account: o.account,
		workers: o.workers,
	});
	return Promise.all(got.map((c) => attempt(tree, c, o, run)));
}

const exec = promisify(execFile);
export const sh: Run = async (cmd, args, cwd) => {
	try {
		const p = exec(cmd, args, { cwd, maxBuffer: 64 << 20 });
		p.child.stdin?.end(); // claude -p는 stdin이 열려 있으면 3초 기다린다
		return (await p).stdout;
	} catch (e) {
		const { stdout = "", stderr = "" } = e as {
			stdout?: string;
			stderr?: string;
		};
		throw new Error(`${cmd} ${args[0]} 실패\n${stderr}${stdout}`);
	}
};

if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			repo: { type: "string" },
			dir: { type: "string" },
			root: { type: "string" },
			focus: { type: "string" },
			dial: { type: "string" },
			workers: { type: "string", default: "1" },
			ttl: { type: "string", default: "6" },
			claude: { type: "string", default: process.env.CLAUDE_BIN ?? "claude" },
		},
	});
	if (!values.repo || !values.dir || !values.root)
		throw new Error("--repo, --dir, --root가 필요하다");
	const root = num("--root", values.root, 1);
	const o = {
		repo: values.repo,
		dir: values.dir,
		claude: values.claude,
		workers: num("--workers", values.workers, 1),
		root,
		focus: values.focus === undefined ? root : num("--focus", values.focus, 1),
		dial: values.dial === undefined ? Infinity : num("--dial", values.dial, 0),
		ttl: num("--ttl", values.ttl, 1),
	};
	const account = (await sh("gh", ["api", "user", "--jq", ".login"]))
		.trim()
		.toLowerCase();
	const results = await runLeaves({ ...o, account }, sh);
	console.log(JSON.stringify(results, null, 2));
	if (results.some((r) => r.outcome !== "merged")) process.exitCode = 1;
}
