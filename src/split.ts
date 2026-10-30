// T5 쪼개기: 쪼개기 신호(leaf.ts)가 고른 노드를 잎 티켓과 계약·인수 테스트로 쪼갠다.
// 세션은 부모 이슈만 읽고 약속 스텁과 contracts/<노드>/ 테스트를 쓰고, 잎 티켓은 구조화 출력으로 돌려준다.
// 하네스가 잎 조건과 처음엔 빨강을 계산하고, 평가자가 약속을 대조하면 순차 머지한 뒤 잎 이슈를 만든다.
// 쪼개기 결과는 contracts/<노드>/leaves.json으로 같이 머지한다
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	branchOf,
	evaluate,
	FAILS,
	firstLine,
	giveUp,
	merge,
	type Opts,
	prompt,
	quiet,
	type Result,
	type Run,
	verdict,
	worktreeOf,
} from "./leaf.ts";
import { type Claim, release } from "./pick.ts";
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

const str = { type: "string", minLength: 1 };
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
					title: str,
					goal: str,
					promises: str,
					test: str,
					scope: { type: "array", items: str },
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

const REPORTER = new URL("./red-reporter.ts", import.meta.url).href;
const TESTS = /\.(accept|contract)\.[cm]?[jt]sx?$/;
type Row = { name: string; ok: boolean; error: string };

// 처음엔 빨강: contracts/<노드>/의 계약·인수 테스트를 파일마다 돌려, 테스트 하나하나가
// "not implemented"로 실패해야 통과다. 불러오기 실패·문법 에러·테스트 없음·통과는 빨강이 아니다
export async function red(
	n: number,
	wt: string,
	run: Run,
): Promise<{ ok: boolean; report: string }> {
	const files = (
		await run(
			"git",
			[
				"ls-files",
				"--cached",
				"--others",
				"--exclude-standard",
				"--",
				`contracts/${n}`,
			],
			wt,
		)
	)
		.split("\n")
		.filter((f) => TESTS.test(f));
	if (!files.length)
		return {
			ok: false,
			report: `contracts/${n}/에 계약·인수 테스트(*.contract.*, *.accept.*)가 없다`,
		};
	const tmp = mkdtempSync(join(tmpdir(), "red-"));
	const lines: string[] = [];
	let ok = true;
	for (const [k, f] of files.entries()) {
		const dest = join(tmp, `${k}.jsonl`);
		// 빨강이면 종료 코드가 0이 아니다. 결과는 리포터가 dest에 쓴다
		await quiet(
			run(
				process.execPath,
				[
					"--test",
					`--test-reporter=${REPORTER}`,
					`--test-reporter-destination=${dest}`,
					f,
				],
				wt,
			),
		);
		const rows: Row[] = existsSync(dest)
			? readFileSync(dest, "utf8")
					.split("\n")
					.filter(Boolean)
					.map((l) => JSON.parse(l))
			: [];
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

const sections = (t: Ticket) =>
	`## 지킬 약속\n\n${t.promises}\n\n## 끝 기준 테스트\n\n${t.test}\n\n## 범위\n\n${t.scope.map((s) => `- ${s}`).join("\n")}\n`;

// 잎 이슈를 만들어 노드의 하위 이슈로 달고 blocked-by를 건다. 그대로 잎이면 노드를 잎으로 바꾼다
// ponytail: 이슈를 만들다 죽으면 자식이 일부만 남고, 자식이 있으니 다시 잇지 않는다. 생기면 leaves.json과 자식 제목을 맞춰 본다
async function make(node: Tree, plan: Plan, body: string, o: Opts, run: Run) {
	const n = String(node.number);
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
		await comment(`그대로 잎: 쪼개지 않고 잎으로 바꿨다 (contracts/${n}/)`);
		return;
	}
	const made: { id: number; number: number }[] = [];
	for (const t of plan.leaves) {
		const i = JSON.parse(
			await run("gh", [
				"api",
				`repos/${o.repo}/issues`,
				"-X",
				"POST",
				"-f",
				`title=${t.title}`,
				"-f",
				`body=## 목표\n\n${t.goal}\n\n${sections(t)}`,
				"-f",
				"labels[]=leaf",
			]),
		);
		await run("gh", [
			"api",
			`repos/${o.repo}/issues/${n}/sub_issues`,
			"-X",
			"POST",
			"-F",
			`sub_issue_id=${i.id}`,
		]);
		made.push(i);
	}
	for (const [k, t] of plan.leaves.entries())
		for (const w of t.waitFor)
			await run("gh", [
				"api",
				`repos/${o.repo}/issues/${made[k].number}/dependencies/blocked_by`,
				"-X",
				"POST",
				"-F",
				`issue_id=${made[w].id}`,
			]);
	await comment(
		`쪼갬: ${made.map((m) => `#${m.number}`).join(", ")} (contracts/${n}/)`,
	);
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
	let fails = 0;
	let why = "";
	let detail = "";
	let merged = false;
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
			const ticket = `노드 이슈 #${n}: ${node.title}\n\n${body}`;
			const branch = branchOf(node);
			const wt = worktreeOf(node, o);
			await run(
				"git",
				["worktree", "add", "-b", branch, wt, "origin/dev"],
				o.dir,
			);
			let fix: string | undefined = "";
			while (fails < FAILS) {
				if (fix !== undefined) {
					const out = await run(
						o.claude,
						[
							"-p",
							prompt("split", { node: n, ticket, fix: fix && `\n\n${fix}` }),
							"--permission-mode",
							"acceptEdits",
							"--allowedTools",
							"Bash(node *),Bash(npm *),Bash(git status),Bash(git diff *)",
							"--output-format",
							"json",
							"--json-schema",
							SCHEMA,
						],
						wt,
					);
					plan = JSON.parse(out).structured_output as Plan | undefined;
					if (!plan)
						throw new Error(`쪼개기 세션이 잎 티켓을 돌려주지 않았다\n${out}`);
					const bad = problems(plan, node.number);
					const r = bad.length ? undefined : await red(node.number, wt, run);
					if (!r?.ok) {
						fails++;
						why = r ? "처음엔 빨강이 아니다" : "잎 조건이 안 맞는다";
						detail = r ? r.report : bad.map((b) => `- ${b}`).join("\n");
						fix = `${why}. 고쳐:\n\n${detail}`;
						continue;
					}
					mkdirSync(join(wt, dir), { recursive: true });
					writeFileSync(
						join(wt, dir, "leaves.json"),
						`${JSON.stringify(plan, null, 2)}\n`,
					);
					await run("git", ["add", "-A"], wt);
					await run(
						"git",
						["commit", "--allow-empty", "-m", `#${n} 쪼개기`],
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
								`쪼개기: ${node.title}`,
								"--body",
								`#${n}을 잎 티켓과 계약·인수 테스트(${dir}/)로 쪼갠다`,
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
							`처음엔 빨강: ${dir}/\n\n${r.report}`,
						],
						wt,
					);
					const report = await evaluate(
						prompt("promise-check", { ticket, node: n }),
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
				const failed = await merge(pr, wt, o, run);
				if (!failed) {
					merged = true;
					break;
				}
				fails++;
				[why, detail] = [firstLine(failed.why), failed.fix ?? failed.why];
				fix = failed.fix;
			}
			if (merged) {
				await run("git", ["worktree", "remove", "--force", wt], o.dir);
				await run("git", ["branch", "-D", branch], o.dir);
				await quiet(run("git", ["push", "origin", "--delete", branch], o.dir));
			}
		} else merged = true;
		if (merged && plan) {
			await make(node, plan, body, o, run);
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
