// #51 잎 2·3: /kagami:next가 세션을 열 때 보는 것. 고르기와 추천은 CC가 한다. 여기서는 세기만 한다
// 잎 2: ready(준비된 일과 종류). 잎 3: stale, waiting, drift, leftover와 CLI
// 계약: contracts/51/ready.contract.ts, contracts/51/next.contract.ts
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { num, type Run, sh } from "./run.ts";
import { check, ITEMS, ITEMS_EN } from "./spec.ts";
import { readTree, type Tree } from "./tree.ts";
import { stamped, version } from "./version.ts";

export type State = "open" | "closed";
// tree.ts Tree에서 쓰는 칸만. Tree를 그대로 넘길 수 있다(tree.test.ts가 타입으로 확인)
export type Issue = {
	number: number;
	title: string;
	state: State;
	kind: "node" | "leaf"; // leaf 라벨이 있으면 leaf
	labels: string[];
	body: string;
	assignees: string[];
	blockedBy: { number: number; state: State }[];
	children: Issue[];
};

// build: 준비된 잎 구현 / split: 자식 없는 노드 쪼개기(칸이 다 있고 자식 없는 뿌리 포함) / plan: 칸이 빠진 뿌리 기획 대화 / try: 잎이 다 닫힌 큰 가지 확인
export type Kind = "build" | "split" | "plan" | "try";
export type Ready = { number: number; kind: Kind };

// root는 뿌리 이슈. 큰 가지는 뿌리의 바로 아래 노드다. 트리 순서(앞순회)로 낸다.
// 모두 공통: 열림, 할당 없음, blocked 라벨 없음, blocked-by가 다 닫힘. 닫힌 이슈 아래는 보지 않는다
export function ready(root: Issue): Ready[] {
	const out: Ready[] = [];
	const walk = (i: Issue, depth: number) => {
		if (i.state === "closed") return;
		const free =
			!i.assignees.length &&
			!i.labels.includes("blocked") &&
			i.blockedBy.every((b) => b.state === "closed");
		const kind =
			i.kind === "leaf"
				? "build"
				: depth === 0 && check(i.body).length
					? "plan"
					: !i.children.length
						? "split"
						: depth === 1 && allClosed(leaves(i))
							? "try"
							: undefined;
		if (free && kind) out.push({ number: i.number, kind });
		for (const c of i.children) walk(c, depth + 1);
	};
	walk(root, 0);
	return out;
}

const leaves = (i: Issue): Issue[] =>
	i.kind === "leaf" ? [i] : i.children.flatMap(leaves);
// 잎이 하나도 없으면 확인할 것이 없다
const allClosed = (l: Issue[]) =>
	l.length > 0 && l.every((x) => x.state === "closed");

// 이슈 번호 → 마지막 활동 시각(ISO). 활동 = 할당된 때, 잎 브랜치 푸시, PR(열기·커밋·댓글), 이슈 댓글 중 가장 늦은 것. CLI가 모은다
export type Activity = Record<number, string>;

// 할당된 열린 이슈 중 마지막 활동이 now보다 3일(72시간) 넘게 앞선 것. activity에 없는 이슈는 판정하지 않는다
export function stale(root: Issue, activity: Activity, now: Date): number[] {
	return all(root)
		.filter(
			(i) =>
				i.state === "open" &&
				i.assignees.length &&
				activity[i.number] &&
				now.getTime() - Date.parse(activity[i.number]) > 72 * 3600_000,
		)
		.map((i) => i.number);
}

// 열린 이슈 중 needs-decision 라벨이 붙은 것
export function waiting(root: Issue): number[] {
	return all(root)
		.filter((i) => i.state === "open" && i.labels.includes("needs-decision"))
		.map((i) => i.number);
}

const all = <T extends { children: T[] }>(i: T): T[] => [
	i,
	...i.children.flatMap(all),
];

// 대상 저장소 AGENTS.md 첫 줄의 버전(version.ts stamped)과 플러그인 버전이 다르면 둘을 낸다. 같으면 undefined
export function drift(
	agentsMd: string,
	plugin: string,
): { repo?: string; plugin: string } | undefined {
	// stamped는 줄 끝이 \n일 때만 읽는다. CRLF와 한 줄짜리 파일도 읽게 맞춰 넘긴다
	const repo = stamped(`${agentsMd.replace(/\r\n/g, "\n")}\n`);
	return repo === plugin ? undefined : { repo, plugin };
}

// 이슈마다 남은 잎 브랜치(leaf/<번호>-*). branches는 브랜치 이름 목록(refs/heads/·origin/ 없이). 없는 이슈는 빼고 낸다
export function leftover(
	numbers: number[],
	branches: string[],
): Record<number, string[]> {
	const out: Record<number, string[]> = {};
	for (const n of numbers) {
		const b = branches.filter((x) => x.startsWith(`leaf/${n}-`));
		if (b.length) out[n] = b;
	}
	return out;
}

// 뿌리: 부모 없고 leaf 아닌 열린 이슈 중 뿌리 템플릿 칸(spec.ts ITEMS_EN, 옛 한국어 칸 ITEMS의 ## 제목)이 하나라도 있는 것. 번호 순.
// 칸이 빠진 뿌리(plan)도 센다. 칸이 하나도 없는 부모 없는 이슈(discovered 등)는 뿌리가 아니다
const HEADS = [...ITEMS_EN, ...ITEMS];
export async function roots(repo: string, run: Run): Promise<number[]> {
	const list: { number: number; body: string }[] = JSON.parse(
		await run("gh", [
			"issue",
			"list",
			"-R",
			repo,
			"--state",
			"open",
			"--search",
			"no:parent-issue -label:leaf",
			"--json",
			"number,body",
			"--limit",
			"1000",
		]),
	);
	return list
		.filter((i) =>
			i.body
				.split(/^## /m)
				.slice(1)
				.some((p) => HEADS.includes(p.split("\n")[0].trim())),
		)
		.map((i) => i.number)
		.sort((a, b) => a - b);
}

const is404 = (e: Error) => e.message.includes("HTTP 404");

// CLI가 모으는 것. GitHub를 읽기만 하고 쓰지 않는다. plugin은 플러그인 버전
// 활동은 할당된 열린 이슈만 모은다(stale이 그것만 본다). 잎 브랜치 푸시는 브랜치 머리 커밋의 커밋 시각으로 본다
// ponytail: PR은 최근 갱신 순 100개까지. 넘으면 페이지 넘기기를 붙인다
export async function collect(
	repo: string,
	tree: Tree,
	run: Run,
	plugin: string,
	now: Date,
) {
	const R = `repos/${repo}`;
	const api = async (path: string, ...flags: string[]) =>
		JSON.parse(await run("gh", ["api", ...flags, path]));
	const refs: { ref: string; object: { sha: string } }[] = await api(
		`${R}/git/matching-refs/heads/leaf/`,
	);
	const sha = new Map(
		refs.map((r) => [r.ref.replace("refs/heads/", ""), r.object.sha]),
	);
	const branches = [...sha.keys()];
	const pulls: { head: { ref: string }; updated_at: string }[] = await api(
		`${R}/pulls?state=all&sort=updated&direction=desc&per_page=100`,
	);
	const activity: Activity = {};
	for (const i of all(tree)) {
		if (i.state !== "open" || !i.assignees.length) continue;
		const mine = leftover([i.number], branches)[i.number] ?? [];
		// 이벤트는 오래된 순이라 끝까지 읽어야 최근 할당이 보인다
		const events: { event: string; created_at: string }[] = (
			await api(
				`${R}/issues/${i.number}/events?per_page=100`,
				"--paginate",
				"--slurp",
			)
		).flat();
		const times = [
			...events.filter((e) => e.event === "assigned").map((e) => e.created_at),
			...i.comments.map((c) => c.createdAt),
			...pulls
				.filter((p) => p.head.ref.startsWith(`leaf/${i.number}-`))
				.map((p) => p.updated_at),
		];
		for (const b of mine)
			times.push(
				(await api(`${R}/commits/${sha.get(b)}`)).commit.committer.date,
			);
		if (times.length)
			activity[i.number] = new Date(
				Math.max(...times.map((t) => Date.parse(t))),
			).toISOString();
	}
	const md = await run("gh", [
		"api",
		"-H",
		"Accept: application/vnd.github.raw",
		`${R}/contents/AGENTS.md?ref=dev`,
	]).catch((e: Error) => {
		if (is404(e)) return undefined;
		throw e;
	});
	// AGENTS.md가 404면 dev 브랜치부터 없는지 본다. 없으면 버전 줄 없음이 아니라 dev 없음이다
	const dev =
		md !== undefined ||
		(await api(`${R}/branches/dev`).then(
			() => true,
			(e: Error) => {
				if (is404(e)) return false;
				throw e;
			},
		));
	const r = ready(tree);
	return {
		ready: r,
		stale: stale(tree, activity, now),
		waiting: waiting(tree),
		drift: dev ? drift(md ?? "", plugin) : { plugin, dev: false as const },
		leftover: leftover(
			r.map((x) => x.number),
			branches,
		),
	};
}

// node src/next.ts --repo <owner/name> --root <뿌리 번호> → {ready, stale, waiting, drift?, leftover} JSON
// node src/next.ts --repo <owner/name> → 뿌리 번호 배열 JSON
if (import.meta.main) {
	const { values } = parseArgs({
		options: { repo: { type: "string" }, root: { type: "string" } },
	});
	if (!values.repo)
		throw new Error(
			"Usage: node src/next.ts --repo <owner/name> [--root <root number>]",
		);
	if (!values.root) {
		console.log(JSON.stringify(await roots(values.repo, sh)));
		process.exit(0);
	}
	const tree = await readTree(values.repo, num("--root", values.root, 1), sh);
	const plugin = version(fileURLToPath(new URL("..", import.meta.url)));
	console.log(
		JSON.stringify(
			await collect(values.repo, tree, sh, plugin, new Date()),
			null,
			2,
		),
	);
}
