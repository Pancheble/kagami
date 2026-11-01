// T8 부모 닫기와 8: 자식이 다 닫힌 노드는 dev의 인수 테스트가 초록일 때만 닫는다. 빨강이면 그 노드에 재계획 신호.
// 닫으면 부모 아래에 플래그 지우기 잎을 만든다. 큰 가지(뿌리의 자식)가 닫히면 8 보고서 세션이 dev에서
// 뿌리 성공 기준을 돌려 보고서 이슈를 쓰고, 뿌리에 써 볼 차례를 알린다.
// 보고서 이슈에 사람이 단 /맞다 · /아니다 · /다르게 · /다시를 읽어 처리한다(/맞다는 promote.ts가 main을 옮긴다). 하네스는 이 댓글을 달지 않는다
import { install, results } from "./guard.ts";
import {
	firstLine,
	type Opts,
	prompt,
	quiet,
	type Result,
	type Run,
	relabel,
} from "./leaf.ts";
import { all, type Claim, path, release } from "./pick.ts";
import { first, promote } from "./promote.ts";
import { report } from "./session.ts";
import { create } from "./split.ts";
import { readTree, type Tree } from "./tree.ts";

const FLAG = "플래그 지우기: ";
// 8 보고서 세션이 읽을 "AI가 방향을 바꾼 곳": 재계획 기록과 신호, 잎 PR의 재계획 칸, 동작 바뀜 알림, 사람 확인 요청
const CHANGES = /^(재계획 |동작 바뀜 알림|사람 확인 필요)/;

// 닫을 수 있는 노드: 열린 노드, 자식이 있고 다 닫혔다, 재계획 중도 사람 대기도 아니다. 뿌리는 사람이 닫는다
export const closable = (tree: Tree, root: number) =>
	all(tree).filter(
		(t) =>
			t.kind === "node" &&
			t.state === "open" &&
			t.number !== root &&
			!t.replan &&
			!t.human &&
			t.children.length > 0 &&
			t.children.every((c) => c.state === "closed"),
	);

// dev의 contracts/<n>/ 인수 테스트를 돌린다. 파일이 하나 이상이고, 테스트 하나하나가 다 초록이어야 초록이다
async function accept(n: number, wt: string, run: Run) {
	const files = (
		await run(
			"git",
			["ls-tree", "-r", "--name-only", "origin/dev", "--", `contracts/${n}`],
			wt,
		)
	)
		.split("\n")
		.filter((f) => f.startsWith(`contracts/${n}/`) && /\.accept\./.test(f));
	if (!files.length)
		return {
			ok: false,
			report: `contracts/${n}/에 인수 테스트(*.accept.*)가 없다`,
		};
	let ok = true;
	const lines: string[] = [];
	for (const [f, rows] of await results(files, wt, run)) {
		if (!rows.length) {
			ok = false;
			lines.push(`✗ ${f}: 테스트가 없거나 불러오지 못했다`);
		}
		for (const r of rows) {
			ok &&= r.ok;
			lines.push(
				r.ok
					? `✓ ${f} › ${r.name}`
					: `✗ ${f} › ${r.name}: ${firstLine(r.error)}`,
			);
		}
	}
	return { ok, report: lines.join("\n") };
}

const view = async (n: number, o: Opts, run: Run) =>
	(
		await run("gh", [
			"issue",
			"view",
			String(n),
			"-R",
			o.repo,
			"--json",
			"body",
			"--jq",
			".body",
		])
	).trimEnd();

// 노드 하나 닫기: claim을 쥔 채 dev에서 인수 테스트 → 초록이면 닫고 플래그 지우기 잎(큰 가지면 8 보고서까지),
// 빨강이면 replan 라벨과 재계획 신호. 재계획은 다음 단계(replans)가 이어서 한다
// ponytail: claim을 놓은 뒤에 늦게 claim한 프로세스는 닫힌 노드를 다시 닫으려 한다(플래그 잎·보고서가 둘). 일꾼이 여럿일 때 상태를 다시 읽는다
export async function close(
	tree: Tree,
	c: Claim,
	o: Opts,
	run: Run,
): Promise<Result> {
	const node = c.leaf;
	const n = String(node.number);
	const wt = `${o.dir}-wt/close/${n}`;
	const comment = (k: number | string, text: string) =>
		run("gh", ["issue", "comment", String(k), "-R", o.repo, "--body", text]);
	await run("git", ["fetch", "origin", "dev"], o.dir);
	const sha = (await run("git", ["rev-parse", "origin/dev"], o.dir)).trim();
	await quiet(run("git", ["worktree", "remove", "--force", wt], o.dir));
	await run("git", ["worktree", "add", "--detach", wt, sha], o.dir);
	try {
		const a = await accept(node.number, wt, run);
		if (!a.ok) {
			await relabel(node.number, ["replan"], [], o, run);
			await comment(
				n,
				`재계획 신호: 자식이 다 닫혔는데 인수 테스트가 초록이 아니다 (dev ${sha})\n\n${a.report}`,
			);
			await release(o.repo, c, run);
			return { issue: node.number, pr: 0, outcome: "replan" };
		}
		await comment(
			n,
			`닫음: 자식이 다 닫혔고 인수 테스트가 초록이다 (dev ${sha})\n\n${a.report}`,
		);
		await run("gh", ["issue", "close", n, "-R", o.repo]);
		// 덜 된 기능은 플래그로 꺼 두거나 연결하지 않는다. 노드가 닫혔으니 켠다. 부모 아래에 두어 부모가 그 뒤에 닫힌다
		const parent = path(tree, node.number)?.at(-2);
		if (parent) {
			const [flag] = await create(
				parent,
				[
					{
						title: `${FLAG}${node.title}`,
						goal: `#${n}이 닫혔다. #${n}을 만드느라 기능 플래그로 꺼 두었거나 연결하지 않은 것이 있으면 켜고 플래그를 지운다. 없으면 아무것도 바꾸지 않는다`,
						promises: `contracts/${n}/의 계약·인수 테스트는 초록 그대로다`,
						test: `node --test contracts/${n}/*.accept.* contracts/${n}/*.contract.*`,
						scope: [],
						waitFor: [],
					},
				],
				o,
				run,
			);
			if (parent.number === o.root) {
				const r = await review(tree, node, sha, wt, o, run, { flag });
				await comment(
					tree.number,
					`써 볼 차례: 큰 가지 #${n}이 닫혔다. dev ${sha}를 써 보고 8 보고서 #${r}에 답해 달라`,
				);
			}
		}
		await release(o.repo, c, run);
		return { issue: node.number, pr: 0, outcome: "closed" };
	} finally {
		await quiet(run("git", ["worktree", "remove", "--force", wt], o.dir));
	}
}

const TAIL = "\n\n---\n\n- 큰 가지: #";

// 8 보고서: 큰 가지가 닫힌 dev에서 평가자가 뿌리 성공 기준을 돌려 쓴다. 보고서 이슈는 트리 밖(하위 이슈가 아니다).
// flag: 방금 만든 플래그 지우기 잎 · again: 사람이 /다시로 다시 써 달라고 한 이전 보고서와 이유. 만든 이슈 번호를 돌려준다
async function review(
	tree: Tree,
	node: Tree,
	sha: string,
	wt: string,
	o: Opts,
	run: Run,
	more: { flag?: number; again?: { prev: number; text: string; why: string } },
): Promise<number> {
	const changes = all(node).flatMap((t) =>
		t.comments
			.filter((c) => CHANGES.test(c.body))
			.map((c) => `- #${t.number}: ${c.body}`),
	);
	const flags = [
		...all(tree)
			.filter((t) => t.state === "open" && t.title.startsWith(FLAG))
			.map((t) => `- #${t.number} ${t.title}`),
		...(more.flag ? [`- #${more.flag} ${FLAG}${node.title}`] : []),
	];
	const a = more.again;
	const text = await report(
		prompt("report", {
			root: `# 뿌리 #${tree.number} ${tree.title}\n\n${await view(tree.number, o, run)}`,
			branch: `# 닫힌 큰 가지 #${node.number} ${node.title}\n\n${await view(node.number, o, run)}`,
			changes: `# 재계획 기록\n\n${changes.join("\n") || "없음"}\n\n# 아직 열린 플래그 지우기 잎\n\n${flags.join("\n") || "없음"}`,
			again: a
				? `# 다시 써 달라는 요청\n\n사람이 이전 보고서 #${a.prev}를 읽고 다시 써 달라고 했다: ${a.why || "(이유 없음)"}\n\n## 이전 보고서\n\n${a.text.split(TAIL)[0].trimEnd()}`
				: "",
		}),
		wt,
		o,
		run,
	);
	await quiet(run("gh", ["label", "create", "report", "-R", o.repo]));
	const issue: { number: number } = JSON.parse(
		await run("gh", [
			"api",
			`repos/${o.repo}/issues`,
			"-X",
			"POST",
			"-f",
			`title=8 보고서: ${node.title}`,
			"-f",
			`body=${text.trimEnd()}${TAIL}${node.number}\n- 뿌리: #${tree.number}\n- dev: ${sha}\n${a ? `- 이전 보고서: #${a.prev}\n` : ""}- 답: 이 이슈에 댓글로 \`/맞다\`(main으로 올린다) · \`/아니다 <이유>\`(뿌리를 고친다) · \`/다르게 <이유>\`(이 큰 가지를 재계획한다) · \`/다시 <이유>\`(코드는 두고 이 보고서만 다시 쓴다). 하네스 계정이 아닌 사람 협업자의 첫 답만 센다\n`,
			"-f",
			"labels[]=report",
		]),
	);
	return issue.number;
}

const field = (body: string, k: string) =>
	Number(body.match(new RegExp(`^- ${k}: #(\\d+)$`, "m"))?.[1] ?? 0);

// 열린 8 보고서 이슈마다 사람의 첫 답을 처리하고 보고서 이슈를 닫는다. 하나라도 처리했으면 true
// ponytail: 프로세스가 여럿이면 같은 답을 두 번 처리할 수 있다. 일꾼이 여럿일 때 보고서 이슈도 claim한다
export async function answers(o: Opts, run: Run): Promise<boolean> {
	const open: { number: number; body: string }[] = JSON.parse(
		await run("gh", [
			"issue",
			"list",
			"-R",
			o.repo,
			"--label",
			"report",
			"--state",
			"open",
			"--json",
			"number,body",
			"--limit",
			"100",
		]),
	);
	let any = false;
	for (const r of open) {
		const a = await first(o.repo, r.number, o.account, run);
		if (!a?.m) continue;
		const [, word, why = ""] = a.m;
		const by = `8 보고서 #${r.number}, @${a.who}`;
		const say = (k: number, text: string) =>
			run("gh", [
				"issue",
				"comment",
				String(k),
				"-R",
				o.repo,
				"--body",
				why ? `${text}\n\n${why}` : text,
			]);
		const big = field(r.body, "큰 가지");
		let done = "";
		if (word === "맞다") {
			// 못 올리면 이유를 남기고 닫는다. main을 고친 뒤 이 이슈를 다시 열면 같은 /맞다로 다시 시도한다
			const p = await promote(r.body, o, run);
			done = p.ok
				? `맞다 (@${a.who}): ${p.done}`
				: `맞다 (@${a.who}): main으로 못 올렸다: ${p.done}\n\nmain을 고친 뒤 이 이슈를 다시 열면 다시 시도한다`;
		} else if (word === "아니다") {
			const root = field(r.body, "뿌리");
			await say(root, `아니다 (${by}): 뿌리를 고친다. 기획 대화로 돌아간다`);
			done = `아니다 (@${a.who}): 뿌리 #${root}에 남겼다`;
		} else if (word === "다시") {
			// 보고서만 다시 쓴다: 같은 dev 커밋, 같은 입력에 이전 보고서와 이유를 더한다. 노드와 트리는 그대로
			const tree = await readTree(o.repo, field(r.body, "뿌리"), run);
			const node = path(tree, big)?.at(-1);
			if (!node)
				throw new Error(
					`8 보고서 #${r.number}의 큰 가지 #${big}이 트리에 없다`,
				);
			const sha = r.body.match(/^- dev: (\S+)$/m)?.[1] ?? "origin/dev";
			const wt = `${o.dir}-wt/report/${r.number}`;
			await run("git", ["fetch", "origin", "dev"], o.dir);
			await quiet(run("git", ["worktree", "remove", "--force", wt], o.dir));
			await run("git", ["worktree", "add", "--detach", wt, sha], o.dir);
			try {
				await install(wt, run); // 8 보고서 세션이 성공 기준을 돌리게
				const k = await review(tree, node, sha, wt, o, run, {
					again: { prev: r.number, text: r.body, why },
				});
				done = `다시 (@${a.who}): 새 보고서 #${k}`;
			} finally {
				await quiet(run("git", ["worktree", "remove", "--force", wt], o.dir));
			}
		} else {
			await run("gh", ["issue", "reopen", String(big), "-R", o.repo]);
			await relabel(big, ["replan"], [], o, run);
			await say(big, `재계획 신호: 8에서 다르게 (${by})`);
			done = `다르게 (@${a.who}): 큰 가지 #${big}을 다시 열고 재계획한다`;
		}
		await run("gh", [
			"issue",
			"comment",
			String(r.number),
			"-R",
			o.repo,
			"--body",
			done,
		]);
		await run("gh", ["issue", "close", String(r.number), "-R", o.repo]);
		any = true;
	}
	return any;
}
