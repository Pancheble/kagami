// T2 issue structure: from the root issue, follows sub-issues and blocked-by to read the tree and output JSON.
// Run: node src/tree.ts --repo owner/name --root <issue number>
//       node src/tree.ts --repo owner/name --labels   (creates labels. Runs as the human's gh account)
import { parseArgs } from "node:util";
import { type Run, sh } from "./run.ts";

type State = "open" | "closed";
export type Comment = {
	id: number;
	author: string; // the account that wrote it. "" if the account was deleted
	type?: string; // User · Bot. Absent if unknown
	assoc?: string; // author_association(OWNER · MEMBER · COLLABORATOR …)
	body: string;
	createdAt: string;
	updatedAt: string;
};
export type Tree = {
	number: number;
	title: string;
	state: State;
	kind: "node" | "leaf";
	labels: string[];
	body: string;
	assignees: string[];
	blockedBy: { number: number; state: State }[];
	scope: string[]; // paths in the leaf's "Scope" field (or the old Korean one). [] for nodes
	comments: Comment[]; // reads records (needs-decision, blocked and so on) and activity
	children: Tree[];
};

// Ownership is the issue assignee, not a label. Record labels match the markers in AGENTS.md "Record format"
const LABELS = [
	["node", "Node issue", "1D76DB"],
	["leaf", "Leaf issue", "0E8A16"],
	[
		"needs-decision",
		"Waiting for the human's answer. Remove once answered",
		"D93F0B",
	],
	["split", "Split record", "5319E7"],
	["contract-change", "Child contracts changed", "FBCA04"],
	["blocked", "Blocked. Start over in a new session", "B60205"],
	["off-recommendation", "Picked work outside the recommendations", "C5DEF5"],
	[
		"spec-gap",
		"Needed information the ticket and parent did not have",
		"F9D0C4",
	],
	["discovered", "New work found along the way", "BFDADC"],
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

// ponytail: up to 100 per connection except comments, same repo only. Add paging if there are more
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
// comments hold records, so read them to the end
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

// Reads only "- path" lines from the "## Scope" field (or the old Korean one). Strips backticks
export function scope(body: string): string[] {
	const sec = body
		.split(/^## /m)
		.find((s) => s.startsWith("Scope") || s.startsWith("범위"));
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
	if (!i) throw new Error(`No issue ${repo}#${number}`);
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
		labels,
		body: i.body,
		assignees: i.assignees.nodes.map((a) => a.login),
		blockedBy: i.blockedBy.nodes.map((b) => ({
			number: b.number,
			state: lower(b.state),
		})),
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
		},
	});
	if (!values.repo) throw new Error("--repo is required");
	if (values.labels) await ensureLabels(values.repo, sh);
	else if (values.root)
		console.log(
			JSON.stringify(
				await readTree(values.repo, Number(values.root), sh),
				null,
				2,
			),
		);
	else throw new Error("--root or --labels is required");
}
