// T1 관통 조각: 열린 잎 하나를 골라 worktree → 구현 세션 → PR → 평가자 세션 → rebase·CI·머지 → 이슈 닫기.
// 실행: node src/leaf.ts --repo owner/name --dir <로컬 클론> [--workers 1] [--claude <claude 경로>]
import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

export type Run = (
	cmd: string,
	args: string[],
	cwd?: string,
) => Promise<string>;
type Opts = { repo: string; dir: string; claude: string; workers: number };
type Issue = { number: number; title: string; body: string };
export type Result = {
	issue: number;
	pr: number;
	verdict: "PASS" | "NEEDS_WORK";
};

const EVALUATOR = fileURLToPath(
	new URL("../.claude/agents/evaluator.md", import.meta.url),
);

export function verdict(report: string): Result["verdict"] {
	return report.match(/판정:\s*(PASS|NEEDS_WORK)/)?.[1] === "PASS"
		? "PASS"
		: "NEEDS_WORK";
}

// ponytail: 잎 = 열림 · `leaf` 라벨 · 담당 없음, 오래된 순. 트리 거리와 범위 다이얼은 T3
async function pick(o: Opts, run: Run): Promise<Issue[]> {
	const out = await run("gh", [
		"issue",
		"list",
		"-R",
		o.repo,
		"--state",
		"open",
		"--label",
		"leaf",
		"--search",
		"no:assignee sort:created-asc",
		"--json",
		"number,title,body",
		"--limit",
		String(o.workers),
	]);
	const issues: Issue[] = JSON.parse(out);
	for (const i of issues)
		await run("gh", [
			"issue",
			"edit",
			String(i.number),
			"-R",
			o.repo,
			"--add-assignee",
			"@me",
		]);
	return issues;
}

// 머지 큐: 한 번에 하나만 rebase·CI·머지한다
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(f: () => Promise<T>): Promise<T> {
	const next = queue.then(f);
	queue = next.catch(() => {});
	return next;
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

async function leaf(i: Issue, o: Opts, run: Run): Promise<Result> {
	const n = String(i.number);
	const branch = `leaf/${n}`;
	const wt = `${o.dir}-wt/${branch}`;
	const ticket = `티켓 #${n}: ${i.title}\n\n${i.body}`;

	await run("git", ["fetch", "origin", "dev"], o.dir);
	await run("git", ["worktree", "add", "-b", branch, wt, "origin/dev"], o.dir);

	await run(
		o.claude,
		[
			"-p",
			`너는 구현자다. 아래 잎 티켓을 구현해. 테스트부터 쓰고, 티켓 범위 밖 파일은 건드리지 마. 커밋은 하지 마.\n\n${ticket}`,
			"--permission-mode",
			"acceptEdits",
			"--allowedTools",
			"Bash(npm test),Bash(npm run *),Bash(node *),Bash(git status),Bash(git diff *)",
		],
		wt,
	);
	await run("git", ["add", "-A"], wt);
	await run("git", ["commit", "-m", `#${n} ${i.title}`], wt);
	await run("git", ["push", "-u", "origin", branch], wt);
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
	const pr = Number(url.trim().split("/").pop());

	// 평가자: 새 세션, 쓰기 도구 없음. 구현자의 출력은 넘기지 않는다
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
	const v = verdict(report);
	// ponytail: NEEDS_WORK면 PR과 worktree를 두고 멈춘다. 다시 돌리기는 T4
	if (v !== "PASS") return { issue: i.number, pr, verdict: v };

	await serial(async () => {
		await run("git", ["fetch", "origin", "dev"], wt);
		await run("git", ["rebase", "origin/dev"], wt);
		await run("git", ["push", "--force-with-lease"], wt);
		await waitChecks(pr, o, run, wt);
		await run("gh", ["pr", "merge", String(pr), "-R", o.repo, "--rebase"], wt);
	});
	await run("gh", ["issue", "close", n, "-R", o.repo], o.dir);
	await run("git", ["worktree", "remove", "--force", wt], o.dir);
	await run("git", ["branch", "-D", branch], o.dir);
	await run("git", ["push", "origin", "--delete", branch], o.dir);
	return { issue: i.number, pr, verdict: v };
}

export async function runLeaves(o: Opts, run: Run): Promise<Result[]> {
	const issues = await pick(o, run);
	return Promise.all(issues.map((i) => leaf(i, o, run)));
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
			workers: { type: "string", default: "1" },
			claude: { type: "string", default: process.env.CLAUDE_BIN ?? "claude" },
		},
	});
	if (!values.repo || !values.dir) throw new Error("--repo와 --dir가 필요하다");
	const results = await runLeaves(
		{
			repo: values.repo,
			dir: values.dir,
			claude: values.claude,
			workers: Number(values.workers),
		},
		sh,
	);
	console.log(JSON.stringify(results, null, 2));
	if (results.some((r) => r.verdict !== "PASS")) process.exitCode = 1;
}
