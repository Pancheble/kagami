// T5 쪼개기: 쪼개기 신호(leaf.ts)가 고른 노드를 잎 티켓과 계약·인수 테스트로 쪼갠다.
// 세션은 부모 이슈만 읽고 약속 스텁과 contracts/<노드>/ 테스트를 쓰고, 잎 티켓은 구조화 출력으로 돌려준다.
// 하네스가 잎 조건과 처음엔 빨강을 계산하고, 평가자가 약속을 대조하면 순차 머지한 뒤 잎 이슈를 만든다.
// 쪼개기 결과는 contracts/<노드>/leaves.json으로 같이 머지한다
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Gate, merge, paths, results, TESTS } from "./guard.ts";
import {
	branchOf,
	FAILS,
	firstLine,
	giveUp,
	type Opts,
	PROMISED,
	prompt,
	quiet,
	type Result,
	type Run,
	verdict,
	worktreeOf,
} from "./leaf.ts";
import { type Claim, release } from "./pick.ts";
import { evaluate, session, WRITE } from "./session.ts";
import type { Tree } from "./tree.ts";

export type Ticket = {
	title: string;
	goal: string;
	promises: string;
	test: string; // 끝 기준 테스트를 돌리는 명령
	scope: string[];
	waitFor: number[]; // 먼저 닫혀야 하는 잎(이 목록의 번호)
};
export type Plan = { asIs: boolean; leaves: Ticket[] }; // asIs: 노드가 그대로 잎

export const str = { type: "string", minLength: 1 };
export const TICKET = {
	title: str,
	goal: str,
	promises: str,
	test: str,
	scope: { type: "array", items: str },
};
const SCHEMA = JSON.stringify({
	type: "object",
	additionalProperties: false,
	required: ["asIs", "leaves"],
	properties: {
		asIs: { type: "boolean" },
		leaves: {
			type: "array",
			minItems: 1,
			items: {
				type: "object",
				additionalProperties: false,
				required: ["title", "goal", "promises", "test", "scope", "waitFor"],
				properties: {
					...TICKET,
					waitFor: { type: "array", items: { type: "integer", minimum: 0 } },
				},
			},
		},
	},
});

// 잎 조건 중 계산으로 볼 수 있는 것: 범위가 있다 · 끝 기준이 contracts/<노드>/의 테스트다 · 기다림이 다른 잎을 가리킨다
// ponytail: waitFor 순환은 보지 않는다. 생기면 위상 정렬로 막는다
export function problems(p: Plan, n: number): string[] {
	const out: string[] = [];
	if (p.asIs && p.leaves.length !== 1)
		out.push(`그대로 잎이면 잎은 하나다 (${p.leaves.length}개)`);
	p.leaves.forEach((l, i) => {
		const who = `잎 ${i} "${l.title}"`;
		if (!l.scope.length) out.push(`${who}: 범위가 비었다`);
		if (!l.test.includes(`contracts/${n}/`))
			out.push(
				`${who}: 끝 기준 테스트가 contracts/${n}/의 파일을 가리키지 않는다`,
			);
		for (const w of l.waitFor)
			if (w === i || w >= p.leaves.length)
				out.push(`${who}: waitFor ${w}는 다른 잎이 아니다`);
	});
	return out;
}

// 처음엔 빨강: contracts/<노드>/의 계약·인수 테스트를 파일마다 돌려, 테스트 하나하나가
// "not implemented"로 실패해야 통과다. 불러오기 실패·문법 에러·테스트 없음·통과는 빨강이 아니다.
// changed(재계획)면 이번에 새로 쓰거나 고친 파일만 본다. 이미 있던 테스트는 닫힌 잎이 초록으로 만들었을 수 있다
export async function red(
	n: number,
	wt: string,
	run: Run,
	changed = false,
): Promise<{ ok: boolean; report: string }> {
	const files = paths(
		await run(
			"git",
			[
				"ls-files",
				...(changed ? ["--others", "--modified"] : ["--cached", "--others"]),
				"--exclude-standard",
				"--",
				`contracts/${n}`,
			],
			wt,
		),
	)
		// --modified는 지운 파일도 내놓는다
		.filter((f) => TESTS.test(f) && (!changed || existsSync(join(wt, f))));
	if (!files.length && changed) return { ok: true, report: "새 테스트 없음" };
	if (!files.length)
		return {
			ok: false,
			report: `contracts/${n}/에 계약·인수 테스트(*.contract.*, *.accept.*)가 없다`,
		};
	const lines: string[] = [];
	let ok = true;
	for (const [f, rows] of await results(files, wt, run)) {
		if (!rows.length) {
			ok = false;
			lines.push(`✗ ${f}: 테스트가 없다`);
		}
		for (const r of rows) {
			const good = !r.ok && /not implemented/i.test(r.error);
			ok &&= good;
			lines.push(
				good
					? `✓ 빨강 ${f} › ${r.name}`
					: `✗ 빨강 아님 ${f} › ${r.name}: ${r.ok ? "통과했다" : firstLine(r.error)}`,
			);
		}
	}
	return { ok, report: lines.join("\n") };
}

export const sections = (t: Omit<Ticket, "waitFor">) =>
	`## 지킬 약속\n\n${t.promises}\n\n## 끝 기준 테스트\n\n${t.test}\n\n## 범위\n\n${t.scope.map((s) => `- ${s}`).join("\n")}\n`;
export const ticketBody = (t: Omit<Ticket, "waitFor">) =>
	`## 목표\n\n${t.goal}\n\n${sections(t)}`;

// 잎 이슈를 만들어 노드의 하위 이슈로 달고 blocked-by를 건다. 만든 이슈 번호를 돌려준다
// ponytail: 이슈를 만들다 죽으면 자식이 일부만 남고, 자식이 있으니 다시 잇지 않는다. 생기면 leaves.json과 자식 제목을 맞춰 본다
export async function create(
	node: Tree,
	leaves: Ticket[],
	o: Opts,
	run: Run,
): Promise<number[]> {
	const made: { id: number; number: number }[] = [];
	for (const t of leaves) {
		const i = JSON.parse(
			await run("gh", [
				"api",
				`repos/${o.repo}/issues`,
				"-X",
				"POST",
				"-f",
				`title=${t.title}`,
				"-f",
				`body=${ticketBody(t)}`,
				"-f",
				"labels[]=leaf",
			]),
		);
		await run("gh", [
			"api",
			`repos/${o.repo}/issues/${node.number}/sub_issues`,
			"-X",
			"POST",
			"-F",
			`sub_issue_id=${i.id}`,
		]);
		made.push(i);
	}
	for (const [k, t] of leaves.entries())
		for (const w of t.waitFor)
			await run("gh", [
				"api",
				`repos/${o.repo}/issues/${made[k].number}/dependencies/blocked_by`,
				"-X",
				"POST",
				"-F",
				`issue_id=${made[w].id}`,
			]);
	return made.map((m) => m.number);
}

// check의 답: stop은 PR 없이 그 계획을 돌려준다 · fail은 FAIL 이유 · report는 통과(처음엔 빨강 결과를 PR 댓글로)
export type Check =
	| { stop: true }
	| { fail: string; detail: string }
	| { report: string };
export type Landed<P> = {
	plan?: P;
	pr: number;
	end: "merged" | "stop" | "fail";
	why: string;
	detail: string;
};

// 노드 세션 한 벌(쪼개기·재계획): worktree에서 세션이 테스트를 쓰고 계획을 구조화 출력으로 돌려주면
// check → PR(빨강 댓글) → 약속 대조 → 순차 머지. FAIL이 FAILS번이면 그때 이유를 들고 끝난다(정리는 giveUp)
export async function land<P>(
	node: Tree,
	o: Opts,
	run: Run,
	s: {
		args: (fix: string) => string[]; // claude 인자. fix는 지난 FAIL 이유
		check: (p: P, wt: string) => Promise<Check>;
		own?: (p: P) => number | undefined; // 이 PR이 고쳐도 되는 계약의 노드(guard.ts Gate)
		ticket: string; // 약속 대조가 받는 노드 이슈
		plan: string; // 약속 대조가 읽을 계획 파일. check가 통과하면서 worktree에 쓴다
		title: string;
		body: string;
	},
): Promise<Landed<P>> {
	const n = String(node.number);
	const branch = branchOf(node);
	const wt = worktreeOf(node, o);
	const done = async () => {
		await run("git", ["worktree", "remove", "--force", wt], o.dir);
		await run("git", ["branch", "-D", branch], o.dir);
	};
	let plan: P | undefined;
	let pr = 0;
	let fails = 0;
	let why = "";
	let detail = "";
	const gate: Gate = {};
	await run("git", ["worktree", "add", "-b", branch, wt, "origin/dev"], o.dir);
	let fix: string | undefined = "";
	while (fails < FAILS) {
		if (fix !== undefined) {
			const out = await session(o, s.args(fix && `\n\n${fix}`), wt, run);
			plan = JSON.parse(out).structured_output as P | undefined;
			if (!plan)
				throw new Error(`세션이 구조화 출력을 돌려주지 않았다\n${out}`);
			gate.own = s.own?.(plan);
			delete gate.wait; // 다시 짰으니 /승인은 다시 받는다
			const c = await s.check(plan, wt);
			if ("stop" in c) {
				await done();
				return { plan, pr, end: "stop", why, detail };
			}
			if ("fail" in c) {
				fails++;
				[why, detail] = [c.fail, c.detail];
				fix = `${why}. 고쳐:\n\n${detail}`;
				continue;
			}
			await run("git", ["add", "-A"], wt);
			await run(
				"git",
				["commit", "--allow-empty", "-m", `#${n} ${s.title}`],
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
						s.title,
						"--body",
						s.body,
					],
					wt,
				);
				pr = Number(url.trim().split("/").pop());
			}
			await run(
				"gh",
				[
					"pr",
					"comment",
					String(pr),
					"-R",
					o.repo,
					"--body",
					`처음엔 빨강: contracts/${n}/\n\n${c.report}`,
				],
				wt,
			);
			const report = await evaluate(
				prompt("promise-check", { ticket: s.ticket, node: n, plan: s.plan }),
				wt,
				o,
				run,
			);
			await run(
				"gh",
				["pr", "comment", String(pr), "-R", o.repo, "--body", report],
				wt,
			);
			if (verdict(report) !== "PASS") {
				fails++;
				why = `약속 대조 NEEDS_WORK (PR #${pr})`;
				detail = report;
				fix = `약속 대조 평가자가 NEEDS_WORK를 줬다. 보고서를 보고 고쳐:\n\n${report}`;
				continue;
			}
		}
		const failed = await merge(pr, wt, o, run, gate);
		if (!failed) {
			await done();
			await quiet(run("git", ["push", "origin", "--delete", branch], o.dir));
			return { plan, pr, end: "merged", why, detail };
		}
		fails++;
		[why, detail] = [firstLine(failed.why), failed.fix ?? failed.why];
		// 노드 세션은 자기 계약만 정한다: 다른 계약을 고쳤으면 고쳐서 다시. 사람이 PR을 닫았으면 끝
		if (failed.stop && !failed.fix) break;
		fix = failed.fix;
	}
	return { plan, pr, end: "fail", why, detail };
}

// 한 번 쪼개기: claim을 쥔 채 FAIL이 FAILS번 될 때까지 다시 쪼갠다. 끝나면 잎 이슈가 생기거나 노드가 막힌다
export async function split(
	tree: Tree,
	c: Claim,
	o: Opts,
	run: Run,
): Promise<Result> {
	const node = c.leaf;
	const n = String(node.number);
	const dir = `contracts/${n}`;
	let pr = 0;
	let why = "";
	let detail = "";
	try {
		await run("git", ["fetch", "origin", "dev"], o.dir);
		// 머지와 이슈 만들기 사이에 죽었으면 다시 쪼개지 않고 dev의 leaves.json으로 이슈 만들기만 잇는다
		let plan: Plan | undefined = await run(
			"git",
			["show", `origin/dev:${dir}/leaves.json`],
			o.dir,
		).then(JSON.parse, () => undefined);
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
		if (!plan) {
			// 머지된 잎이 덧붙인 바뀐 약속도 부모 이슈의 일부로 읽는다
			const promised = node.comments
				.map((k) => k.body)
				.filter((b) => b.startsWith(PROMISED));
			const ticket = `노드 이슈 #${n}: ${node.title}\n\n${body}${promised.length ? `\n\n# 바뀐 약속\n\n${promised.join("\n")}` : ""}`;
			const l = await land<Plan>(node, o, run, {
				args: (fix) => [
					"-p",
					prompt("split", { node: n, ticket, fix }),
					...WRITE,
					"--output-format",
					"json",
					"--json-schema",
					SCHEMA,
				],
				check: async (p, wt) => {
					const bad = problems(p, node.number);
					if (bad.length)
						return {
							fail: "잎 조건이 안 맞는다",
							detail: bad.map((b) => `- ${b}`).join("\n"),
						};
					const r = await red(node.number, wt, run);
					if (!r.ok) return { fail: "처음엔 빨강이 아니다", detail: r.report };
					mkdirSync(join(wt, dir), { recursive: true });
					writeFileSync(
						join(wt, dir, "leaves.json"),
						`${JSON.stringify(p, null, 2)}\n`,
					);
					return { report: r.report };
				},
				ticket,
				plan: `${dir}/leaves.json`,
				title: `쪼개기: ${node.title}`,
				body: `#${n}을 잎 티켓과 계약·인수 테스트(${dir}/)로 쪼갠다`,
			});
			({ pr, why, detail } = l);
			plan = l.end === "merged" ? l.plan : undefined;
		}
		if (plan) {
			const comment = (text: string) =>
				run("gh", ["issue", "comment", n, "-R", o.repo, "--body", text]);
			if (plan.asIs) {
				await run("gh", [
					"issue",
					"edit",
					n,
					"-R",
					o.repo,
					"--remove-label",
					"node",
					"--add-label",
					"leaf",
					"--body",
					`${body.trimEnd()}\n\n${sections(plan.leaves[0])}`,
				]);
				await comment(`그대로 잎: 쪼개지 않고 잎으로 바꿨다 (${dir}/)`);
			} else {
				const made = await create(node, plan.leaves, o, run);
				await comment(`쪼갬: ${made.map((m) => `#${m}`).join(", ")} (${dir}/)`);
			}
			await release(o.repo, c, run);
			return { issue: node.number, pr, outcome: "merged" };
		}
	} catch (e) {
		why = `오류: ${firstLine(String(e).replace(/^Error: /, ""))}`;
		detail = String(e);
	}
	await giveUp(tree, node, [c], why, detail, o, run);
	return { issue: node.number, pr, outcome: "stuck" };
}
