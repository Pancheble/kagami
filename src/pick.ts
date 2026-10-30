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
export function path(t: Tree, focus: number): Tree[] | undefined {
	if (t.number === focus) return [t];
	for (const c of t.children) {
		const p = path(c, focus);
		if (p) return [t, ...p];
	}
}

export const all = (t: Tree): Tree[] => [t, ...t.children.flatMap(all)];

// 하트비트가 고쳐 쓴 claim에는 "갱신 <시각>" 줄이 붙는다
export const isClaim = (body: string) =>
	/^claim: \S+(\n갱신 \S+)?\s*$/.test(body);

// assignee는 claim을 이긴 뒤에야 걸린다. 그 틈에도 담당으로 보려고 claim 댓글도 본다
const taken = (t: Tree) =>
	t.assignees.length > 0 || t.comments.some((c) => isClaim(c.body));

// CLI 숫자 인자. min 이상 정수만
export function num(flag: string, v: string, min: number): number {
	if (!/^\d+$/.test(v) || Number(v) < min)
		throw new Error(`${flag}는 ${min} 이상의 정수여야 한다: "${v}"`);
	return Number(v);
}

// 열림 · 담당 없음 · 재계획 잠금 아님 · want. 잠금은 아래로 번진다
function collect(
	t: Tree,
	locked: boolean,
	want: (t: Tree) => boolean,
	out: Tree[],
) {
	locked ||= t.replan;
	if (!locked && t.state === "open" && !taken(t) && want(t)) out.push(t);
	for (const c of t.children) collect(c, locked, want, out);
}

// 집중 노드 아래(거리 0) → 한 층 위 아래(사촌, 1) → … dial 층까지. 같은 거리는 이슈 트리 순서
export function near(
	tree: Tree,
	focus: number,
	dial: number,
	want: (t: Tree) => boolean,
): Tree[] {
	const p = path(tree, focus);
	if (!p) throw new Error(`집중 노드 #${focus}가 트리에 없다`);
	const out: Tree[] = [];
	for (let d = 0; d <= dial && d < p.length; d++) {
		const at = p.length - 1 - d;
		const found: Tree[] = [];
		collect(
			p[at],
			p.slice(0, at).some((n) => n.replan),
			want,
			found,
		);
		for (const t of found) if (!out.includes(t)) out.push(t);
	}
	return out;
}

// 기다림이 끝난 잎. 이미 담당이 걸린 열린 잎과 범위가 겹치는 잎은 뺀다
export function ready(tree: Tree, focus: number, dial: number): Tree[] {
	const busy = all(tree).filter(
		(t) => t.kind === "leaf" && t.state === "open" && taken(t),
	);
	return near(
		tree,
		focus,
		dial,
		(t) => t.kind === "leaf" && t.blockedBy.every((b) => b.state === "closed"),
	).filter((l) => !busy.some((b) => overlaps(b.scope, l.scope)));
}

// 재계획할 노드: replan이고 사람 대기가 아니며, 자신과 아래에 담당이 걸린 열린 이슈가 없다(돌고 있는 잎은 끝까지 둔다)
// ponytail: 트리 순서로 고른다. 범위 다이얼은 보지 않는다. 일꾼이 여럿이고 replan 노드가 여럿이면 거리순으로
export const replans = (tree: Tree) =>
	all(tree).filter(
		(t) =>
			t.kind === "node" &&
			t.replan &&
			!t.human &&
			t.state === "open" &&
			!all(t).some((d) => d.state === "open" && taken(d)),
	);

// 아직 안 쪼갠 노드: 자식이 하나도 없다
export const unsplit = (tree: Tree, focus: number, dial: number) =>
	near(tree, focus, dial, (t) => t.kind === "node" && t.children.length === 0);

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
			.filter((c) => isClaim(c.body))
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

// claim 하트비트: ms마다 claim 댓글을 고쳐 써서 updatedAt을 민다. 만료는 마지막 갱신 기준이다.
// 같은 본문으로 고치면 GitHub가 updatedAt을 안 바꿔서 갱신 시각을 본문에 적는다. 돌려준 함수로 멈춘다
export function beat(repo: string, c: Claim, ms: number, run: Run) {
	const t = setInterval(() => {
		run("gh", [
			"api",
			"-X",
			"PATCH",
			`repos/${repo}/issues/comments/${c.comment}`,
			"-f",
			`body=claim: ${c.worker}\n갱신 ${new Date().toISOString()}`,
		]).catch(() => {}); // 놓은 뒤에 도착하면 404다. 한 번 놓쳐도 다음 박동이 있다
	}, ms);
	return () => clearInterval(t);
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
	const root = num("--root", values.root, 1);
	const focus =
		values.focus === undefined ? root : num("--focus", values.focus, 1);
	const dial =
		values.dial === undefined ? Infinity : num("--dial", values.dial, 0);
	const workers = num("--workers", values.workers, 1);
	const tree = await readTree(values.repo, root, sh);
	const leaves = ready(tree, focus, dial);
	const account = (await sh("gh", ["api", "user", "--jq", ".login"]))
		.trim()
		.toLowerCase();
	const got = await claim(values.repo, leaves, sh, {
		account,
		workers,
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
