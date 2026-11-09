// #155 fake GitHub for the board contracts: a Run that answers the gh calls below from in-memory state. Not a test file
// Understood: gh project create · edit · link · view · field-list · item-list · item-add · item-edit,
// and gh api graphql asking repository.projectsV2 (owner and name as -f/-F variables or inline). Anything else throws
// Like real gh: item-list returns 30 items unless --limit is given; item-add of an issue already on the board returns the same item
import type { Run } from "../../src/run.ts";

export type Item = {
	id: string;
	repo: string;
	number: number;
	status?: string;
};
export type Project = {
	owner: string;
	number: number;
	id: string;
	title: string;
	public: boolean;
	links: string[]; // owner/name
	items: Item[];
};

const STATUS = ["Todo", "In Progress", "Done"];
const opt = (s: string) => `OPT_${s.replace(" ", "_")}`;
const SCOPE =
	"error: your authentication token is missing required scopes [project]\nTo request it, run:  gh auth refresh -s project";

export function github({
	viewer = "o",
	projects = [] as Project[],
	scope = true,
} = {}) {
	const calls: string[][] = [];
	const find = (owner: string, number: number) => {
		const p = projects.find(
			(p) =>
				p.owner === (owner === "@me" ? viewer : owner) && p.number === number,
		);
		if (!p)
			throw new Error(
				`gh project failed\nproject ${owner}/${number} not found`,
			);
		return p;
	};
	const run: Run = async (cmd, args) => {
		calls.push([cmd, ...args]);
		if (cmd !== "gh") throw new Error(`fake gh: not gh: ${cmd}`);
		const flag = (name: string) => {
			const i = args.indexOf(`--${name}`);
			if (i >= 0) return args[i + 1];
			return args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
		};
		const json = (v: unknown) => `${JSON.stringify(v)}\n`;

		if (args[0] === "api" && args.includes("graphql")) {
			const vars = Object.fromEntries(
				args
					.filter((a) => /^\w+=/.test(a))
					.map((a) => [
						a.slice(0, a.indexOf("=")),
						a.slice(a.indexOf("=") + 1),
					]),
			);
			if (!String(vars.query).includes("projectsV2"))
				throw new Error(`fake gh: unknown graphql ${vars.query}`);
			if (!scope) throw new Error(`gh api failed\n${SCOPE}`);
			const inline = String(vars.query).match(
				/repository\(\s*owner:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"/,
			);
			const repo = inline
				? `${inline[1]}/${inline[2]}`
				: `${vars.owner}/${vars.name}`;
			const nodes = projects
				.filter((p) => p.links.includes(repo))
				.map((p) => ({
					id: p.id,
					number: p.number,
					title: p.title,
					public: p.public,
					url: `https://github.com/users/${p.owner}/projects/${p.number}`,
					owner: { login: p.owner, __typename: "User" },
				}));
			return json({
				data: {
					repository: { projectsV2: { totalCount: nodes.length, nodes } },
				},
			});
		}
		if (args[0] !== "project")
			throw new Error(`fake gh: unknown ${args.join(" ")}`);
		if (!scope) throw new Error(`gh project failed\n${SCOPE}`);
		const sub = args[1];
		const owner = flag("owner") ?? viewer;

		if (sub === "create") {
			const o = owner === "@me" ? viewer : owner;
			const number =
				Math.max(
					0,
					...projects.filter((p) => p.owner === o).map((p) => p.number),
				) + 1;
			const p: Project = {
				owner: o,
				number,
				id: `PVT_${o}_${number}`,
				title: flag("title") ?? "",
				public: false,
				links: [],
				items: [],
			};
			projects.push(p);
			return json({
				id: p.id,
				number,
				title: p.title,
				url: `https://github.com/users/${o}/projects/${number}`,
			});
		}
		if (sub === "item-edit") {
			const id = flag("id");
			const p = projects.find((p) => p.id === flag("project-id"));
			const item = p?.items.find((i) => i.id === id);
			if (!p || !item) throw new Error(`gh project failed\nno item ${id}`);
			if (flag("field-id") !== "F_status")
				throw new Error(`gh project failed\nno field ${flag("field-id")}`);
			const s = STATUS.find((s) => opt(s) === flag("single-select-option-id"));
			if (!s) throw new Error("gh project failed\nno such option");
			item.status = s;
			return json({ id });
		}
		const p = find(owner, Number(args[2]));
		if (sub === "view")
			return json({
				id: p.id,
				number: p.number,
				title: p.title,
				public: p.public,
				owner: { login: p.owner },
			});
		if (sub === "edit") {
			const v = flag("visibility");
			if (v) p.public = v.toUpperCase() === "PUBLIC";
			const t = flag("title");
			if (t) p.title = t;
			return json({ id: p.id, number: p.number });
		}
		if (sub === "link") {
			const r = flag("repo") ?? "";
			const repo = r.includes("/") ? r : `${p.owner}/${r}`;
			if (!p.links.includes(repo)) p.links.push(repo);
			return "";
		}
		if (sub === "field-list")
			return json({
				fields: [
					{ id: "F_title", name: "Title", type: "ProjectV2Field" },
					{
						id: "F_status",
						name: "Status",
						type: "ProjectV2SingleSelectField",
						options: STATUS.map((s) => ({ id: opt(s), name: s })),
					},
				],
				totalCount: 2,
			});
		if (sub === "item-list") {
			const limit = Number(flag("limit") ?? 30);
			return json({
				items: p.items.slice(0, limit).map((i) => ({
					id: i.id,
					...(i.status ? { status: i.status } : {}),
					content: {
						type: "Issue",
						number: i.number,
						repository: i.repo,
						url: `https://github.com/${i.repo}/issues/${i.number}`,
					},
					repository: `https://github.com/${i.repo}`,
				})),
				totalCount: p.items.length,
			});
		}
		if (sub === "item-add") {
			const m = (flag("url") ?? "").match(
				/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)$/,
			);
			if (!m) throw new Error(`gh project failed\nbad url ${flag("url")}`);
			const [, repo, n] = m;
			let item = p.items.find((i) => i.repo === repo && i.number === Number(n));
			if (!item) {
				item = { id: `PVTI_${p.number}_${repo}_${n}`, repo, number: Number(n) };
				p.items.push(item);
			}
			return json({ id: item.id });
		}
		throw new Error(`fake gh: unknown ${args.join(" ")}`);
	};
	// Status of repo#number on that board. undefined if it is not on the board or has no Status
	const status = (p: Project, repo: string, number: number) =>
		p.items.find((i) => i.repo === repo && i.number === number)?.status;
	return { run, calls, projects, status };
}

// A board of owner with items already on it
export function project(
	owner: string,
	number: number,
	items: Item[] = [],
	links: string[] = [],
): Project {
	return {
		owner,
		number,
		id: `PVT_${owner}_${number}`,
		title: `board ${number}`,
		public: true,
		links,
		items,
	};
}
