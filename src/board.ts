// #155 leaf #156: shows the tree on the GitHub Project boards linked to the target repo. The board is not written in the repo:
// it is whatever board the repo is linked to (repository.projectsV2). sync adds missing issues and sets Status
// Contract: contracts/155/board.contract.ts
// Run: node src/board.ts --repo owner/name   (prints one line when something changed, nothing otherwise)
import { parseArgs } from "node:util";
import { roots } from "./next.ts";
import { type Run, sh } from "./run.ts";
import { readTree, type Tree } from "./tree.ts";

export type Board = { owner: string; number: number };
export type Issue = {
	number: number;
	state: "open" | "closed";
	assignees: string[];
};

const HINT =
	"board: skipped, the gh token lacks the project scope. Run: gh auth refresh -s project";

// gh's own scope errors do not always name the fix (graphql says "required scopes ... read:project"), so add it
const scoped = (e: Error) => {
	if (/scope/i.test(e.message) && !e.message.includes(HINT))
		throw new Error(`${e.message}\n${HINT}`);
	throw e;
};

type Node = {
	id: string;
	number: number;
	closed?: boolean;
	owner: { login: string };
};
const QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    projectsV2(first: 100) { nodes { id number closed owner { ... on User { login } ... on Organization { login } } } }
  }
}`;
async function boards(repo: string, run: Run): Promise<Node[]> {
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
	]).catch(scoped);
	const nodes: Node[] = JSON.parse(out).data.repository.projectsV2.nodes;
	return nodes.filter((n) => !n.closed);
}

// Boards linked to repo (owner/name). [] if none. Closed boards are left out
export async function linked(repo: string, run: Run): Promise<Board[]> {
	return (await boards(repo, run)).map((n) => ({
		owner: n.owner.login,
		number: n.number,
	}));
}

const want = (i: Issue) =>
	i.state === "closed" ? "Done" : i.assignees.length ? "In Progress" : "Todo";

// On every linked board: adds the issues that are not on it, and sets Status where it differs
// (closed → Done, open and assigned → In Progress, open and unassigned → Todo). Leaves other repos' items alone.
// No linked board → { added: [], moved: [] }. Rejects without the project scope, with a message that says `gh auth refresh -s project`
// ponytail: reads up to 10000 items per board. A class board bigger than that needs paging
export async function sync(
	repo: string,
	issues: Issue[],
	run: Run,
): Promise<{ added: number[]; moved: number[] }> {
	const added = new Set<number>();
	const moved = new Set<number>();
	for (const b of await boards(repo, run)) {
		const gh = async (...args: string[]) =>
			JSON.parse(
				await run("gh", [
					"project",
					...args,
					"--owner",
					b.owner.login,
					"--format",
					"json",
				]).catch(scoped),
			);
		const n = String(b.number);
		const status: { id: string; options: { id: string; name: string }[] } = (
			await gh("field-list", n)
		).fields.find((f: { name: string }) => f.name === "Status");
		const list: {
			id: string;
			status?: string;
			content?: { number: number; repository?: string };
		}[] = (await gh("item-list", n, "--limit", "10000")).items;
		const mine = new Map<number, { id: string; status?: string }>();
		for (const i of list)
			if (i.content?.repository?.toLowerCase() === repo.toLowerCase())
				mine.set(i.content.number, i);
		for (const i of issues) {
			let item = mine.get(i.number);
			if (!item) {
				const url = `https://github.com/${repo}/issues/${i.number}`;
				item = { id: (await gh("item-add", n, "--url", url)).id as string };
				added.add(i.number);
			}
			const s = want(i);
			if (item.status === s) continue;
			const opt = status?.options.find((o) => o.name === s);
			if (!opt)
				throw new Error(
					`board ${b.owner.login}/${n} has no Status option "${s}"`,
				);
			await run("gh", [
				"project",
				"item-edit",
				"--id",
				item.id,
				"--project-id",
				b.id,
				"--field-id",
				status.id,
				"--single-select-option-id",
				opt.id,
			]).catch(scoped);
			if (!added.has(i.number)) moved.add(i.number);
		}
	}
	return { added: [...added], moved: [...moved] };
}

const all = (t: Tree): Tree[] => [t, ...t.children.flatMap(all)];

// What the CLI prints: a line when the board changed, "" when nothing changed or no board is linked,
// the gh auth refresh hint without the project scope. Other failures throw
export async function cli(repo: string, run: Run): Promise<string> {
	const issues: Issue[] = [];
	for (const r of await roots(repo, run))
		issues.push(...all(await readTree(repo, r, run)));
	try {
		const { added, moved } = await sync(repo, issues, run);
		if (!added.length && !moved.length) return "";
		const list = (ns: number[]) =>
			ns.length ? ns.map((n) => `#${n}`).join(" ") : "none";
		return `board: added ${list(added)}; moved ${list(moved)}`;
	} catch (e) {
		if ((e as Error).message.includes("gh auth refresh -s project"))
			return HINT;
		throw e;
	}
}

if (import.meta.main) {
	const { values } = parseArgs({ options: { repo: { type: "string" } } });
	if (!values.repo)
		throw new Error("Usage: node src/board.ts --repo <owner/name>");
	const out = await cli(values.repo, sh);
	if (out) console.log(out);
}
