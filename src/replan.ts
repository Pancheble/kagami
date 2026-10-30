// T6 재계획: replan 신호가 걸린 노드를 재계획 세션이 다시 짠다. 셋 중 하나:
// resplit(열린 자식만 다시 쪼갠다) · expand(약속을 병렬 변경 잎들로) · up(노드 목표 안에서 안 풀리면 한 층 위로).
// 막힌 잎은 닫거나 고쳐 쓰고(고쳐 쓰면 막힘 0부터), 무엇을 왜 바꿨는지 노드 이슈에 한 줄 남긴다.
// 기존 인수 테스트를 고치면 목표를 바꾸는 것이라 머지하지 않고 사람에게 보낸다.
// 사용자에게 보이는 동작이 바뀌면 노드 이슈에 알림 한 줄을 남기고 멈추지 않는다
import {
	firstLine,
	giveUp,
	type Opts,
	prompt,
	type Result,
	type Run,
	relabel,
	STUCKS,
	stuckNotes,
} from "./leaf.ts";
import { type Claim, path, release } from "./pick.ts";
import {
	create,
	land,
	problems,
	red,
	str,
	TICKET,
	type Ticket,
	ticketBody,
	WRITE,
} from "./split.ts";
import type { Tree } from "./tree.ts";

type Rewrite = Omit<Ticket, "waitFor"> & { number: number };
export type Replan = {
	action: "resplit" | "expand" | "up";
	why: string; // 무엇을, 왜 바꿨는지 한 줄
	behavior: string; // 사용자에게 보이는 동작이 바뀌었으면 한 줄, 아니면 ""
	close: number[]; // 닫을 열린 자식
	rewrite: Rewrite[]; // 고쳐 쓸 열린 자식
	leaves: Ticket[]; // 새 잎. waitFor는 이 목록의 번호
};

const SCHEMA = JSON.stringify({
	type: "object",
	additionalProperties: false,
	required: ["action", "why", "behavior", "close", "rewrite", "leaves"],
	properties: {
		action: { enum: ["resplit", "expand", "up"] },
		why: str,
		behavior: { type: "string" },
		close: { type: "array", items: { type: "integer" } },
		rewrite: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["number", "title", "goal", "promises", "test", "scope"],
				properties: { number: { type: "integer" }, ...TICKET },
			},
		},
		leaves: {
			type: "array",
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

// 계산으로 볼 수 있는 것: 열린 자식만 건드린다 · 막힌 잎(막힘 STUCKS번)은 닫거나 고쳐 쓴다 · 잎 조건
export function replanProblems(p: Replan, node: Tree): string[] {
	if (p.action === "up") return [];
	const out: string[] = [];
	const open = node.children.filter((c) => c.state === "open");
	const touched = [...p.close, ...p.rewrite.map((r) => r.number)];
	for (const k of touched)
		if (!open.some((c) => c.number === k))
			out.push(`#${k}은 열린 자식이 아니다`);
	for (const c of open)
		if (c.stuck >= STUCKS && !touched.includes(c.number))
			out.push(`막힌 잎 #${c.number}을 닫거나 고쳐 쓰지 않았다`);
	if (!touched.length && !p.leaves.length) out.push("아무것도 바꾸지 않았다");
	out.push(...problems({ asIs: false, leaves: p.leaves }, node.number));
	out.push(
		...problems(
			{ asIs: false, leaves: p.rewrite.map((r) => ({ ...r, waitFor: [] })) },
			node.number,
		).map((b) => `고쳐 쓸 ${b}`),
	);
	return out;
}

const view = (n: number, o: Opts, run: Run) =>
	run("gh", [
		"issue",
		"view",
		String(n),
		"-R",
		o.repo,
		"--json",
		"body",
		"--jq",
		".body",
	]);

// 재계획 세션이 읽을 것: 노드 이슈, 자식 상태, 열린 자식의 티켓과 막힌 이유, 자식 PR의 결정과 재계획 칸.
// 형제 PR을 몰아 읽는 건 이때뿐이다
// ponytail: PR은 최근 200개만 본다. 넘으면 자식 번호로 검색한다
async function context(node: Tree, ticket: string, o: Opts, run: Run) {
	const prs: { number: number; body: string }[] = JSON.parse(
		await run("gh", [
			"pr",
			"list",
			"-R",
			o.repo,
			"--state",
			"all",
			"--limit",
			"200",
			"--json",
			"number,body",
		]),
	);
	const out = [ticket, "# 자식 상태"];
	for (const c of node.children) {
		const tag =
			c.state === "open" ? `열림${c.stuck ? `, 막힘 ${c.stuck}` : ""}` : "닫힘";
		out.push(`## #${c.number} [${tag}] ${c.title}`);
		if (c.state === "open") {
			out.push((await view(c.number, o, run)).trimEnd());
			const notes = stuckNotes(c);
			if (notes.length) out.push("막힌 이유:", ...notes);
		}
		for (const pr of prs.filter((p) =>
			new RegExp(`Closes #${c.number}\\b`).test(p.body),
		)) {
			const secs = pr.body
				.split(/^## /m)
				.filter((s) => /^(결정과 이유|재계획)\s/.test(s));
			if (secs.length)
				out.push(
					`PR #${pr.number} (#${c.number}):`,
					...secs.map((s) => `### ${s.trimEnd()}`),
				);
		}
	}
	return out.join("\n\n");
}

const list = (label: string, ns: number[]) =>
	ns.length ? `${label} ${ns.map((k) => `#${k}`).join(", ")}` : "";

// 한 번 재계획: claim(재계획 잠금)을 쥔 채 FAIL이 FAILS번 될 때까지 다시 짠다. 끝나면 노드가 다시 쪼개지거나,
// 한 층 위로 올라가거나, 사람을 기다리거나, 노드가 막힌다(막힘이 STUCKS번이면 giveUp이 한 층 위로 올린다)
export async function replan(
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
	const comment = (k: number, text: string) =>
		run("gh", ["issue", "comment", String(k), "-R", o.repo, "--body", text]);
	const done = async (outcome: Result["outcome"]) => {
		await release(o.repo, c, run);
		return { issue: node.number, pr, outcome };
	};
	// replan은 그대로 둔다(잠금). 사람이 human을 떼면 다시 짠다
	const human = async (text: string) => {
		await relabel(node.number, ["human"], [], o, run);
		await comment(node.number, `사람 확인 필요: ${text}`);
		return done("human");
	};
	try {
		await run("git", ["fetch", "origin", "dev"], o.dir);
		const ticket = `노드 이슈 #${n}: ${node.title}\n\n${await view(node.number, o, run)}`;
		const state = await context(node, ticket, o, run);
		let accept: string[] = [];
		const l = await land<Replan>(node, o, run, {
			args: (fix) => [
				"-p",
				prompt("replan", { node: n, state, fix }),
				...WRITE,
				"--output-format",
				"json",
				"--json-schema",
				SCHEMA,
			],
			check: async (p, wt) => {
				if (p.action === "up") return { stop: true };
				// 인수 테스트 수정 감지: dev에 있던 인수 테스트를 고치거나 지웠나. 새로 더한 건 괜찮다
				accept = (
					await run("git", ["diff", "--name-only", "origin/dev", "--", dir], wt)
				)
					.split("\n")
					.filter((f) => /\.accept\./.test(f));
				if (accept.length) return { stop: true };
				const bad = replanProblems(p, node);
				if (bad.length)
					return {
						fail: "막힌 잎 처리나 잎 조건이 안 맞는다",
						detail: bad.map((b) => `- ${b}`).join("\n"),
					};
				const r = await red(node.number, wt, run, true);
				if (!r.ok) return { fail: "처음엔 빨강이 아니다", detail: r.report };
				return { report: r.report };
			},
			ticket,
			title: `재계획: ${node.title}`,
			body: `#${n}을 다시 짠다 (${dir}/)`,
		});
		({ pr, why, detail } = l);
		const p = l.plan;
		if (l.end === "stop" && p && accept.length)
			return await human(
				`재계획이 인수 테스트를 고치려 했다: ${accept.join(", ")}. 목표를 바꾸는 일이라 사람이 정한다\n\n재계획의 이유: ${p.why}`,
			);
		if (l.end === "stop" && p) {
			// 뿌리의 목표를 바꾸는 건 기획 대화(사람)다
			const parent = path(tree, node.number)?.at(-2);
			if (!parent || parent.number === o.root)
				return await human(`재계획이 뿌리까지 올라왔다: ${p.why}`);
			await relabel(parent.number, ["replan"], [], o, run);
			await comment(parent.number, `재계획 신호: #${n}에서 올라옴: ${p.why}`);
			await relabel(node.number, [], ["replan"], o, run);
			await comment(
				node.number,
				`재계획 (up): ${p.why} — #${parent.number}로 올림`,
			);
			return await done("up");
		}
		if (l.end === "merged" && p) {
			for (const k of p.close)
				await run("gh", [
					"issue",
					"close",
					String(k),
					"-R",
					o.repo,
					"--reason",
					"not planned",
					"--comment",
					`재계획으로 닫음 (#${n}): ${p.why}`,
				]);
			// 고쳐 쓴 잎은 막힘 0부터: stuck 라벨을 뗀다
			for (const r of p.rewrite) {
				const was = node.children.find((k) => k.number === r.number)?.stuck;
				await run("gh", [
					"issue",
					"edit",
					String(r.number),
					"-R",
					o.repo,
					"--title",
					r.title,
					"--body",
					ticketBody(r),
					...(was ? ["--remove-label", `stuck-${was}`] : []),
				]);
			}
			const made = await create(node, p.leaves, o, run);
			// ponytail: 여기까지 오다 죽으면 replan이 남아 다음 돌기에서 다시 짠다. 반쯤 만든 잎이 남는다
			await relabel(node.number, [], ["replan"], o, run);
			const what = [
				list("닫음", p.close),
				list(
					"고쳐 씀",
					p.rewrite.map((r) => r.number),
				),
				list("새 잎", made),
			]
				.filter(Boolean)
				.join(" · ");
			await comment(node.number, `재계획 (${p.action}): ${p.why} — ${what}`);
			if (p.behavior)
				await comment(node.number, `동작 바뀜 알림: ${p.behavior}`);
			return await done("merged");
		}
	} catch (e) {
		why = `오류: ${firstLine(String(e).replace(/^Error: /, ""))}`;
		detail = String(e);
	}
	await giveUp(tree, node, [c], why, detail, o, run);
	return { issue: node.number, pr, outcome: "stuck" };
}
