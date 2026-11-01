// T2 이슈 구조: 뿌리 이슈에서 하위 이슈와 blocked-by를 따라 트리를 읽어 JSON으로 내놓는다.
// 실행: node src/tree.ts --repo owner/name --root <이슈 번호>
//       node src/tree.ts --harness <봇 계정> --repo owner/name --labels   (상태 라벨 만들기)
import { parseArgs } from "node:util";
import { type Run, sh } from "./leaf.ts";
import { harness } from "./session.ts";

type State = "open" | "closed";
export type Comment = {
	id: number;
	author: string; // 단 계정. 지워진 계정이면 ""
	type?: string; // User · Bot. 모르면 없음
	assoc?: string; // author_association(OWNER · MEMBER · COLLABORATOR …). claim을 누가 달았나 센다
	body: string;
	createdAt: string;
	updatedAt: string; // claim 하트비트가 민다
};
export type Tree = {
	number: number;
	title: string;
	state: State;
	kind: "node" | "leaf";
	assignees: string[];
	blockedBy: { number: number; state: State }[];
	replan: boolean; // 재계획 중: 아래 잎을 고르지 않는다
	human: boolean; // 사람 대기: 사람이 라벨을 뗄 때까지 재계획하지 않는다
	stuck: number; // 막힘 횟수
	scope: string[]; // 잎의 "범위" 칸 경로들. 노드는 []
	comments: Comment[]; // claim과 막힘 이유를 읽는다
	children: Tree[];
};

// 담당은 라벨이 아니라 이슈 assignee로 둔다
const LABELS = [
	["node", "노드 이슈", "1D76DB"],
	["leaf", "잎 티켓", "0E8A16"],
	["replan", "재계획 중: 아래 잎을 고르지 않는다", "D93F0B"],
	["human", "사람 대기: 사람이 정할 때까지 재계획하지 않는다", "5319E7"],
	["stuck-1", "막힘 1번", "FBCA04"],
	["stuck-2", "막힘 2번", "FBCA04"],
	["stuck-3", "막힘 3번: 재계획 신호", "B60205"],
];

export async function ensureLabels(repo: string, run: Run) {
	for (const [name, description, color] of LABELS)
		await run("gh", [
			"label",
			"create",
			name,
			"-R",
			repo,
			"--description",
			description,
			"--color",
			color,
			"--force",
		]);
}

// ponytail: 댓글 말고는 연결마다 100개까지, 같은 저장소만 본다. 넘으면 페이지 넘기기를 붙인다
const PAGE =
	"pageInfo { hasNextPage endCursor } nodes { databaseId author { login __typename } authorAssociation body createdAt updatedAt }";
const QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      number title body state
      labels(first: 100) { nodes { name } }
      assignees(first: 100) { nodes { login } }
      subIssues(first: 100) { nodes { number } }
      blockedBy(first: 100) { nodes { number state } }
      comments(first: 100) { ${PAGE} }
    }
  }
}`;
// 댓글은 claim과 막힘 이유, 계약 정리 표시가 있어 끝까지 읽는다
const MORE = `query($owner: String!, $name: String!, $number: Int!, $after: String!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) { comments(first: 100, after: $after) { ${PAGE} } }
  }
}`;

type Raw = {
	number: number;
	title: string;
	body: string;
	state: string;
	labels: { nodes: { name: string }[] };
	assignees: { nodes: { login: string }[] };
	subIssues: { nodes: { number: number }[] };
	blockedBy: { nodes: { number: number; state: string }[] };
	comments: Page;
};
type Page = {
	pageInfo?: { hasNextPage: boolean; endCursor: string | null };
	nodes: {
		databaseId: number;
		author: { login: string; __typename: string } | null;
		authorAssociation: string;
		body: string;
		createdAt: string;
		updatedAt: string;
	}[];
};

const lower = (s: string) => s.toLowerCase() as State;

// "## 범위" 칸에서 "- 경로" 줄만 읽는다. 백틱은 벗긴다
export function scope(body: string): string[] {
	const sec = body.split(/^## /m).find((s) => s.startsWith("범위"));
	return sec ? [...sec.matchAll(/^- `?([^`\s]+)`?/gm)].map((m) => m[1]) : [];
}

export async function readTree(
	repo: string,
	number: number,
	run: Run,
): Promise<Tree> {
	const [owner, name] = repo.split("/");
	const query = async (q: string, ...more: string[]) =>
		JSON.parse(
			await run("gh", [
				"api",
				"graphql",
				"-f",
				`query=${q}`,
				"-f",
				`owner=${owner}`,
				"-f",
				`name=${name}`,
				"-F",
				`number=${number}`,
				...more,
			]),
		).data.repository.issue;
	const i: Raw | null = await query(QUERY);
	if (!i) throw new Error(`${repo}#${number} 이슈가 없다`);
	const comments = [...i.comments.nodes];
	for (let p = i.comments.pageInfo; p?.hasNextPage; ) {
		const next: Page = (await query(MORE, "-f", `after=${p.endCursor}`))
			.comments;
		comments.push(...next.nodes);
		p = next.pageInfo;
	}
	const labels = i.labels.nodes.map((l) => l.name);
	return {
		number: i.number,
		title: i.title,
		state: lower(i.state),
		kind: labels.includes("leaf") ? "leaf" : "node",
		assignees: i.assignees.nodes.map((a) => a.login),
		blockedBy: i.blockedBy.nodes.map((b) => ({
			number: b.number,
			state: lower(b.state),
		})),
		replan: labels.includes("replan"),
		human: labels.includes("human"),
		stuck: Math.max(
			0,
			...labels.map((l) => Number(l.match(/^stuck-(\d+)$/)?.[1] ?? 0)),
		),
		scope: scope(i.body),
		comments: comments.map((c) => ({
			id: c.databaseId,
			author: c.author?.login ?? "",
			type: c.author?.__typename,
			assoc: c.authorAssociation,
			body: c.body,
			createdAt: c.createdAt,
			updatedAt: c.updatedAt,
		})),
		children: await Promise.all(
			i.subIssues.nodes.map((c) => readTree(repo, c.number, run)),
		),
	};
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			repo: { type: "string" },
			root: { type: "string" },
			labels: { type: "boolean" },
			harness: { type: "string" },
		},
	});
	if (!values.repo) throw new Error("--repo가 필요하다");
	if (values.labels) {
		await harness(values.harness, sh);
		await ensureLabels(values.repo, sh);
	} else if (values.root)
		console.log(
			JSON.stringify(
				await readTree(values.repo, Number(values.root), sh),
				null,
				2,
			),
		);
	else throw new Error("--root나 --labels가 필요하다");
}
