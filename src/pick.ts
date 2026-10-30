// T3 잎 고르기: 트리 JSON에서 준비된 잎을 집중 노드에서 가까운 순으로 고르고 claim 댓글로 담당을 건다.
// 실행: node src/pick.ts --repo owner/name --root <뿌리> [--focus <집중 노드>] [--dial <층 수>] [--workers 1]
import { parseArgs } from "node:util";
import { type Run, sh } from "./leaf.ts";
import { readTree, type Tree } from "./tree.ts";

const parts = (p: string) => p.split("/").filter((s) => s && s !== ".");

// 경로 조각 단위 앞부분 일치. 범위가 비어 있으면 어디에 닿을지 모르니 모두와 겹친다
export function overlaps(a: string[], b: string[]): boolean {
	if (a.length === 0 || b.length === 0) return true;
	return a.some((x) =>
		b.some((y) => {
			const [xs, ys] = [parts(x), parts(y)];
			return xs
				.slice(0, Math.min(xs.length, ys.length))
				.every((s, i) => s === ys[i]);
		}),
	);
}

// 뿌리에서 집중 노드까지
function path(t: Tree, focus: number): Tree[] | undefined {
	if (t.number === focus) return [t];
	for (const c of t.children) {
		const p = path(c, focus);
		if (p) return [t, ...p];
	}
}

const all = (t: Tree): Tree[] => [t, ...t.children.flatMap(all)];

// 열림 · 기다림 끝 · 담당 없음 · 재계획 잠금 아님. 잠금은 아래로 번진다
function collect(t: Tree, locked: boolean, out: Tree[]) {
	locked ||= t.replan;
	if (
		t.kind === "leaf" &&
		!locked &&
		t.state === "open" &&
		t.assignees.length === 0 &&
		t.blockedBy.every((b) => b.state === "closed")
	)
		out.push(t);
	for (const c of t.children) collect(c, locked, out);
}

// 집중 노드 아래(거리 0) → 한 층 위 아래(사촌, 1) → … dial 층까지. 같은 거리는 이슈 트리 순서.
// 이미 담당이 걸린 열린 잎과 범위가 겹치는 잎은 뺀다
export function ready(tree: Tree, focus: number, dial: number): Tree[] {
	const p = path(tree, focus);
	if (!p) throw new Error(`집중 노드 #${focus}가 트리에 없다`);
	const busy = all(tree).filter(
		(t) => t.kind === "leaf" && t.state === "open" && t.assignees.length > 0,
	);
	const out: Tree[] = [];
	for (let d = 0; d <= dial && d < p.length; d++) {
		const at = p.length - 1 - d;
		const found: Tree[] = [];
		collect(
			p[at],
			p.slice(0, at).some((n) => n.replan),
			found,
		);
		for (const l of found)
			if (!out.includes(l) && !busy.some((b) => overlaps(b.scope, l.scope)))
				out.push(l);
	}
	return out;
}

export type Claim = { leaf: Tree; worker: string; comment: number };
type Comment = { id: number; created_at: string; body: string };

// claim 댓글을 달고 다시 읽어, 가장 먼저 달린 claim(같은 시각이면 작은 댓글 id)이 내 것일 때만 이긴다.
// 지면 내 claim을 지우고 다음 잎으로. assignee는 사람이 보는 표시일 뿐이다
export async function claim(
	repo: string,
	leaves: Tree[],
	run: Run,
	{ account, workers = 1 }: { account: string; workers?: number },
): Promise<Claim[]> {
	const got: Claim[] = [];
	for (const leaf of leaves) {
		if (got.length >= workers) break;
		if (got.some((g) => overlaps(g.leaf.scope, leaf.scope))) continue;
		const worker = `${account}/worker-${got.length + 1}`;
		const api = `repos/${repo}/issues/${leaf.number}/comments`;
		const mine: Comment = JSON.parse(
			await run("gh", [
				"api",
				api,
				"-X",
				"POST",
				"-f",
				`body=claim: ${worker}`,
			]),
		);
		const first = (
			await run("gh", [
				"api",
				"--paginate",
				`${api}?per_page=100`,
				"--jq",
				".[] | {id, created_at, body}",
			])
		)
			.split("\n")
			.filter(Boolean)
			.map((l): Comment => JSON.parse(l))
			.filter((c) => /^claim: \S+\s*$/.test(c.body))
			.sort((a, b) =>
				a.created_at === b.created_at
					? a.id - b.id
					: a.created_at < b.created_at
						? -1
						: 1,
			)[0];
		if (first?.id === mine.id) {
			await run("gh", [
				"issue",
				"edit",
				String(leaf.number),
				"-R",
				repo,
				"--add-assignee",
				"@me",
			]);
			got.push({ leaf, worker, comment: mine.id });
		} else
			await run("gh", [
				"api",
				"-X",
				"DELETE",
				`repos/${repo}/issues/comments/${mine.id}`,
			]);
	}
	return got;
}

// 잎을 놓을 때 claim을 지운다. 남겨 두면 다음 고르기에서 묵은 claim이 "가장 먼저"가 된다
export async function release(repo: string, c: Claim, run: Run) {
	await run("gh", [
		"api",
		"-X",
		"DELETE",
		`repos/${repo}/issues/comments/${c.comment}`,
	]);
	await run("gh", [
		"issue",
		"edit",
		String(c.leaf.number),
		"-R",
		repo,
		"--remove-assignee",
		"@me",
	]);
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			repo: { type: "string" },
			root: { type: "string" },
			focus: { type: "string" },
			dial: { type: "string" },
			workers: { type: "string", default: "1" },
		},
	});
	if (!values.repo || !values.root)
		throw new Error("--repo와 --root가 필요하다");
	const root = Number(values.root);
	const tree = await readTree(values.repo, root, sh);
	const leaves = ready(
		tree,
		Number(values.focus ?? root),
		values.dial === undefined ? Infinity : Number(values.dial),
	);
	const account = (await sh("gh", ["api", "user", "--jq", ".login"]))
		.trim()
		.toLowerCase();
	const got = await claim(values.repo, leaves, sh, {
		account,
		workers: Number(values.workers),
	});
	console.log(
		JSON.stringify(
			got.map((g) => ({
				issue: g.leaf.number,
				title: g.leaf.title,
				worker: g.worker,
				comment: g.comment,
			})),
			null,
			2,
		),
	);
}
