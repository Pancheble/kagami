// 잎 루프 세 겹: 평가 FAIL 3번 → 막힘(claim 놓고 다음 고르기에서 새 세션), 막힘 3번 → 부모에 재계획 신호.
// 잎은 pick.ts로 고르고, 머지 실패(rebase 충돌·CI·fast-forward 거절)도 FAIL로 센다.
// 실행: node src/leaf.ts --harness <봇 계정> --repo owner/name --dir <로컬 클론> --root <뿌리>
//       [--focus <집중 노드>] [--dial <층 수>] [--workers 1] [--ttl <시간>] [--claude <claude 경로>]
// 준비된 잎이 일꾼 수보다 적으면 split.ts로 가장 가까운 안 쪼갠 노드를 쪼갠다(쪼개기 신호)
// 재계획 신호(replan)가 걸린 노드는 아래에 돌고 있는 잎이 없을 때 replan.ts로 다시 짠다
// 자식이 다 닫힌 노드는 close.ts로 닫고(큰 가지면 8 보고서), 8 보고서에 사람이 단 답을 처리한다
import { execFile } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { answers, closable, close } from "./close.ts";
import { type Gate, merge } from "./guard.ts";
import {
	all,
	beat,
	type Claim,
	claim,
	isClaim,
	num,
	path,
	ready,
	release,
	replans,
	unsplit,
} from "./pick.ts";
import { replan } from "./replan.ts";
import { evaluate, harness, IMPLEMENT, session } from "./session.ts";
import { split } from "./split.ts";
import { readTree, type Tree } from "./tree.ts";

export type Run = (
	cmd: string,
	args: string[],
	cwd?: string,
	env?: NodeJS.ProcessEnv, // 없으면 하네스 환경 그대로
) => Promise<string>;
export type Opts = {
	repo: string;
	dir: string;
	claude: string;
	workers: number;
	root: number; // 뿌리 이슈
	focus: number; // 집중 노드
	dial: number; // 범위 다이얼
	account: string; // 하네스 계정(봇, 소문자). claim에 적고, /승인에서 뺀다
	ttl: number; // 시간. 이보다 오래된 claim은 시도가 끊긴 것으로 본다
	poll?: number; // ms. 위험 경로 대기에서 /승인을 다시 볼 간격(기본 1분)
};
export type Result = {
	issue: number;
	pr: number; // PR을 만들기 전에 막혔으면 0
	// human: 사람이 정할 때까지 멈춤 · up: 재계획을 한 층 위로 올림
	// closed: 노드를 닫음 · replan: 자식은 다 닫혔는데 인수 테스트가 빨강이라 재계획 신호
	outcome: "merged" | "stuck" | "human" | "up" | "closed" | "replan";
};

export const FAILS = 3; // 한 시도에서 FAIL이 이만큼이면 막힘
export const STUCKS = 3; // 막힘이 이만큼이면 부모에 재계획 신호

// 프롬프트는 하네스 저장소의 prompts/<이름>.md. {{키}}를 채운다. 권한은 여기 말고 CLI 플래그로 건다
export const prompt = (name: string, vars: Record<string, string>) =>
	readFileSync(new URL(`../prompts/${name}.md`, import.meta.url), "utf8")
		.trimEnd()
		.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");

export function verdict(report: string): "PASS" | "NEEDS_WORK" {
	return report.match(/판정:\s*(PASS|NEEDS_WORK)/)?.[1] === "PASS"
		? "PASS"
		: "NEEDS_WORK";
}

export const quiet = (p: Promise<unknown>) => p.catch(() => {});
export const firstLine = (s: string) => s.split("\n")[0];
export const stuckNotes = (t: Tree) =>
	t.comments.map((c) => c.body).filter((b) => /^막힘 \d+\/\d+: /.test(b));
// 시도마다 새 브랜치. 노드는 쪼개기, replan이 걸린 노드는 재계획 브랜치
export const branchOf = (t: Tree) =>
	`${t.kind === "leaf" ? "leaf" : t.replan ? "replan" : "split"}/${t.number}-${t.stuck + 1}`;

// 라벨은 필요할 때 만든다(막힘 4번째의 stuck-4, human 등). 이미 있으면 create가 실패하고 그냥 넘어간다
export async function relabel(
	n: number,
	add: string[],
	remove: string[],
	o: Pick<Opts, "repo">,
	run: Run,
) {
	for (const l of add)
		await quiet(run("gh", ["label", "create", l, "-R", o.repo]));
	await run("gh", [
		"issue",
		"edit",
		String(n),
		"-R",
		o.repo,
		...add.flatMap((l) => ["--add-label", l]),
		...remove.flatMap((l) => ["--remove-label", l]),
	]);
}
export const worktreeOf = (t: Tree, o: Opts) => `${o.dir}-wt/${branchOf(t)}`;

// 막힘과 끊긴 시도(claim 만료)가 같이 지나는 길: 이번 시도의 흔적을 치우고
// claim 놓기 + 막힘 +1 + 막힘 이유 댓글. 막힘이 STUCKS에 닿으면 부모에 replan 라벨과 재계획 신호
export async function giveUp(
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
	await relabel(
		leaf.number,
		[`stuck-${k}`],
		k > 1 ? [`stuck-${k - 1}`] : [],
		o,
		run,
	);
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
	// ponytail: 뿌리가 잎이면 부모가 없어 신호를 못 낸다
	const parent = path(tree, leaf.number)?.at(-2);
	if (k < STUCKS || !parent) return;
	await relabel(parent.number, ["replan"], [], o, run);
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
	let owners: number[] = []; // 계약 테스트를 고치려 했으면 그 계약들을 정한 노드
	const gate: Gate = {};
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
				await session(
					o,
					[
						"-p",
						prompt("implement", { ticket, before, fix: fix && `\n\n${fix}` }),
						...IMPLEMENT,
					],
					wt,
					run,
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
				const report = await evaluate(
					prompt("evaluate", { ticket }),
					wt,
					o,
					run,
				);
				await run(
					"gh",
					["pr", "comment", String(pr), "-R", o.repo, "--body", report],
					wt,
				);
				delete gate.wait; // 코드가 바뀌었으니 /승인은 다시 받는다
				if (verdict(report) !== "PASS") {
					fails++;
					why = `평가 NEEDS_WORK (PR #${pr})`;
					detail = report;
					fix = `평가자가 NEEDS_WORK를 줬다. 보고서를 보고 고쳐:\n\n${report}`;
					continue;
				}
			}
			const failed = await merge(pr, wt, o, run, gate);
			if (!failed) {
				await run("gh", ["issue", "close", n, "-R", o.repo], o.dir);
				await run("git", ["worktree", "remove", "--force", wt], o.dir);
				await run("git", ["branch", "-D", branch], o.dir);
				await quiet(run("git", ["push", "origin", "--delete", branch], o.dir));
				return { issue: i.number, pr, outcome: "merged" };
			}
			[why, detail] = [firstLine(failed.why), failed.fix ?? failed.why];
			// 깨는 변경은 잎이 고치지 않는다: 멈추고 그 계약을 정한 노드로 보낸다
			if (failed.stop) {
				owners = failed.owners ?? [];
				break;
			}
			fails++;
			fix = failed.fix; // 고칠 게 없으면(충돌·거절) 구현·평가 없이 rebase부터 다시
		}
	} catch (e) {
		why = `오류: ${firstLine(String(e).replace(/^Error: /, ""))}`;
		detail = String(e);
	}
	await giveUp(tree, i, [c], why, detail, o, run);
	for (const owner of owners) {
		await relabel(owner, ["replan"], [], o, run);
		await run("gh", [
			"issue",
			"comment",
			String(owner),
			"-R",
			o.repo,
			"--body",
			`재계획 신호: #${n}이 #${owner}의 계약 테스트를 고치려 했다 (PR #${pr}). 깨는 변경이면 여기서 정한다\n\n- ${why}`,
		]);
	}
	return { issue: i.number, pr, outcome: "stuck" };
}

// 만료된 claim이 걸린 열린 잎·노드(쪼개기)를 막힘으로 돌린다. 하나라도 돌렸으면 true
async function expire(tree: Tree, o: Opts, run: Run): Promise<boolean> {
	const cutoff = Date.now() - o.ttl * 3_600_000;
	let any = false;
	for (const t of all(tree)) {
		if (t.state !== "open") continue;
		// 만료는 마지막 갱신 기준: 하트비트가 claim 댓글을 고쳐 쓰면 updatedAt이 밀린다
		const old = t.comments.filter(
			(c) => isClaim(c.body) && Date.parse(c.updatedAt) < cutoff,
		);
		if (!old.length) continue;
		const claims = old.map((c) => ({
			leaf: t,
			worker: firstLine(c.body).slice(7).trim(),
			comment: c.id,
		}));
		await giveUp(
			tree,
			t,
			claims,
			`시도가 끊겼다 (claim 만료: ${claims[0].worker}, 마지막 갱신 ${old[0].updatedAt})`,
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
	return (cmd, args, cwd, env) => {
		if (cmd !== "git") return run(cmd, args, cwd, env);
		const next = line.then(() => run(cmd, args, cwd, env));
		line = next.catch(() => {});
		return next;
	};
}

// claim을 쥔 동안 ttl/3마다 하트비트를 친다
const holding = async (
	c: Claim,
	o: Opts,
	run: Run,
	f: () => Promise<Result>,
) => {
	const stop = beat(o.repo, c, (o.ttl * 3_600_000) / 3, run);
	try {
		return await f();
	} finally {
		stop();
	}
};

// 한 번 돌기: 트리를 읽고 → 끊긴 시도를 막힘으로 → 8의 답 → 부모 닫기 → (재계획) → (쪼개기 신호)
// → pick.ts로 일꾼 수만큼 고르고 claim → 잎마다 시도
// ponytail: 한 번 고르고 끝난다. 다음 잎으로 계속 도는 루프는 정지 파일과 함께 T10
export async function runLeaves(o: Opts, raw: Run): Promise<Result[]> {
	const run = oneGit(raw);
	let tree = await readTree(o.repo, o.root, run);
	if (await expire(tree, o, run)) tree = await readTree(o.repo, o.root, run);
	const done: Result[] = [];
	// 8의 /다르게는 닫힌 큰 가지를 다시 열고 재계획 신호를 건다
	if (await answers(o, run)) tree = await readTree(o.repo, o.root, run);
	// 부모 닫기: 노드마다 claim을 이긴 쪽만 닫는다. 빨강이면 재계획 신호를 걸어 바로 아래 재계획이 잇는다
	for (const node of closable(tree, o.root)) {
		const [c] = await claim(o.repo, [node], run, { account: o.account });
		if (c) done.push(await holding(c, o, run, () => close(tree, c, o, run)));
	}
	if (done.length) tree = await readTree(o.repo, o.root, run);
	// 재계획: replan 노드 하나를 claim(재계획 잠금)하고 다시 짠다. 아래 잎 고르기는 replan 라벨이 막고 있다
	// 한 번에 노드 하나. 다른 프로세스에 claim을 지면 다음 replan 노드로
	const [r] = await claim(o.repo, replans(tree), run, {
		account: o.account,
	});
	if (r) {
		done.push(await holding(r, o, run, () => replan(tree, r, o, run)));
		tree = await readTree(o.repo, o.root, run);
	}
	let leaves = ready(tree, o.focus, o.dial);
	// 쪼개기 신호: 준비된 잎이 일꾼 수보다 적으면 가장 가까운 안 쪼갠 노드를 쪼개고 다시 고른다
	// ponytail: 한 번에 노드 하나. 모자란 만큼 여러 노드를 쪼개는 건 일꾼이 여럿일 때
	if (leaves.length < o.workers) {
		const [c] = await claim(o.repo, unsplit(tree, o.focus, o.dial), run, {
			account: o.account,
		});
		if (c) {
			done.push(await holding(c, o, run, () => split(tree, c, o, run)));
			tree = await readTree(o.repo, o.root, run);
			leaves = ready(tree, o.focus, o.dial);
		}
	}
	const got = await claim(o.repo, leaves, run, {
		account: o.account,
		workers: o.workers,
	});
	return [
		...done,
		...(await Promise.all(
			got.map((c) => holding(c, o, run, () => attempt(tree, c, o, run))),
		)),
	];
}

// 클론 하나에 프로세스 하나: oneGit은 한 프로세스 안에서만 줄을 세운다.
// 잠금 파일에 pid를 적고, 그 pid가 살아 있으면 시작을 거부한다. 돌려준 함수로 푼다
// ponytail: 묵은 잠금을 두 프로세스가 동시에 넘겨받는 틈은 막지 않는다
export function lockClone(dir: string): () => void {
	const lock = join(dir, ".git", "kagami.lock");
	try {
		writeFileSync(lock, String(process.pid), { flag: "wx" });
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
		const pid = Number(readFileSync(lock, "utf8"));
		if (alive(pid))
			throw new Error(`이미 쓰는 클론이다: ${dir} (pid ${pid}, ${lock})`);
		writeFileSync(lock, String(process.pid));
	}
	return () => rmSync(lock, { force: true });
}

function alive(pid: number): boolean {
	if (!(pid > 0)) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		return (e as NodeJS.ErrnoException).code === "EPERM";
	}
}

const exec = promisify(execFile);
export const sh: Run = async (cmd, args, cwd, env) => {
	try {
		const p = exec(cmd, args, { cwd, env, maxBuffer: 64 << 20 });
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
			harness: { type: "string" },
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
	const account = await harness(values.harness, sh);
	process.on("exit", lockClone(o.dir));
	const results = await runLeaves({ ...o, account }, sh);
	console.log(JSON.stringify(results, null, 2));
	if (results.some((r) => r.outcome === "stuck" || r.outcome === "human"))
		process.exitCode = 1;
}
