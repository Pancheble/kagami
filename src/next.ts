// #51 leaves 2 and 3: what /kagami:next looks at when a session opens. CC picks and recommends. This only counts
// Leaf 2: ready (ready work and its kind). Leaf 3: stale, waiting, drift, leftover, and the CLI
// Contracts: contracts/51/ready.contract.ts, contracts/51/next.contract.ts
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { num, type Run, sh } from "./run.ts";
import { check, ITEMS, ITEMS_EN } from "./spec.ts";
import { readTree, type Tree } from "./tree.ts";
import { stamped, version } from "./version.ts";

export type State = "open" | "closed";
// Only the fields used from tree.ts Tree. A Tree can be passed as is (tree.test.ts checks this with types)
export type Issue = {
	number: number;
	title: string;
	state: State;
	kind: "node" | "leaf"; // leaf if it has the leaf label
	labels: string[];
	body: string;
	assignees: string[];
	blockedBy: { number: number; state: State }[];
	children: Issue[];
};

// build: build a ready leaf / split: split a node with no children (including a root with every field and no children) / plan: planning conversation for a root with missing fields / try: try a branch whose leaves are all closed
export type Kind = "build" | "split" | "plan" | "try";
export type Ready = { number: number; kind: Kind };

// root is the root issue. A branch is a node directly under the root. Output in tree order (pre-order).
// Common to all: open, unassigned, no blocked label, every blocked-by closed. Nothing under a closed issue is looked at
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
// With no leaves at all, there is nothing to try
const allClosed = (l: Issue[]) =>
	l.length > 0 && l.every((x) => x.state === "closed");

// Issue number → last activity time (ISO). Activity = the latest of: when assigned, a leaf branch push, a PR (opened, committed to, commented on), an issue comment. The CLI gathers it
export type Activity = Record<number, string>;

// Assigned open issues whose last activity is more than 3 days (72 hours) before now. Issues missing from activity are not judged
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

// Open issues with the needs-decision label
export function waiting(root: Issue): number[] {
	return all(root)
		.filter((i) => i.state === "open" && i.labels.includes("needs-decision"))
		.map((i) => i.number);
}

const all = <T extends { children: T[] }>(i: T): T[] => [
	i,
	...i.children.flatMap(all),
];

// If the version on the first line of the target repo's AGENTS.md (version.ts stamped) differs from the plugin version, returns both. undefined if equal
export function drift(
	agentsMd: string,
	plugin: string,
): { repo?: string; plugin: string } | undefined {
	// stamped reads only when the line ends in \n. Normalize so CRLF and one-line files are read too
	const repo = stamped(`${agentsMd.replace(/\r\n/g, "\n")}\n`);
	return repo === plugin ? undefined : { repo, plugin };
}

// Leaf branches left per issue (leaf/<number>-*). branches is a list of git branch names (without refs/heads/ or origin/). Issues without any are left out
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

// Roots: open issues with no parent and not a leaf that have at least one root template field (## headings of spec.ts ITEMS_EN or the old Korean fields ITEMS). In number order.
// Roots with missing fields (plan) count too. An issue with no parent and no fields at all (discovered and so on) is not a root
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

// What the CLI gathers. It only reads GitHub, never writes. plugin is the plugin version
// Activity is gathered only for assigned open issues (stale looks only at those). A leaf branch push is the commit time of the git branch's head commit
// ponytail: PRs up to the 100 most recently updated. Add paging if there are more
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
		// events come oldest first, so read to the end to see the latest assignment
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
	// if AGENTS.md is a 404, check whether the dev branch itself is missing. If so, it is no dev rather than no version line
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

// node src/next.ts --repo <owner/name> --root <root number> → {ready, stale, waiting, drift?, leftover} JSON
// node src/next.ts --repo <owner/name> → JSON array of root numbers
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
