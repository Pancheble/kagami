// T2 이슈 구조: 뿌리 이슈에서 하위 이슈와 blocked-by를 따라 트리를 읽어 JSON으로 내놓는다.
// 실행: node src/tree.ts --repo owner/name --root <이슈 번호>
//       node src/tree.ts --repo owner/name --labels   (상태 라벨 만들기)
import { parseArgs } from "node:util";
import { type Run, sh } from "./leaf.ts";

type State = "open" | "closed";
export type Tree = {
	number: number;
	title: string;
	state: State;
	kind: "node" | "leaf";
	assignees: string[];
	blockedBy: { number: number; state: State }[];
	replan: boolean; // 재계획 중: 아래 잎을 고르지 않는다
	stuck: number; // 막힘 횟수
	scope: string[]; // 잎의 "범위" 칸 경로들. 노드는 []
	children: Tree[];
};

// 담당은 라벨이 아니라 이슈 assignee로 둔다
const LABELS = [
	["node", "노드 이슈", "1D76DB"],
	["leaf", "잎 티켓", "0E8A16"],
	["replan", "재계획 중: 아래 잎을 고르지 않는다", "D93F0B"],
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

// ponytail: 연결마다 100개까지, 같은 저장소만 본다. 넘으면 페이지 넘기기를 붙인다
const QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      number title body state
      labels(first: 100) { nodes { name } }
      assignees(first: 100) { nodes { login } }
      subIssues(first: 100) { nodes { number } }
      blockedBy(first: 100) { nodes { number state } }
    }
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
	const out = await run("gh", [
		"api",
		"graphql",
		"-f",
		`query=${QUERY}`,
		"-f",
		`owner=${owner}`,
		"-f",
		`name=${name}`,
		"-F",
		`number=${number}`,
	]);
	const i: Raw | null = JSON.parse(out).data.repository.issue;
	if (!i) throw new Error(`${repo}#${number} 이슈가 없다`);
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
		stuck: Math.max(
			0,
			...labels.map((l) => Number(l.match(/^stuck-(\d+)$/)?.[1] ?? 0)),
		),
		scope: scope(i.body),
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
		},
	});
	if (!values.repo) throw new Error("--repo가 필요하다");
	if (values.labels) await ensureLabels(values.repo, sh);
	else if (values.root)
		console.log(
			JSON.stringify(
				await readTree(values.repo, Number(values.root), sh),
				null,
				2,
			),
		);
	else throw new Error("--root나 --labels가 필요하다");
}
