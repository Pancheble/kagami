// #51 leaf 5: what /kagami:init installs in an empty new repo. plan only works out what to install; install does the writing and the gh and git calls
// root is the kagami plugin root (${CLAUDE_PLUGIN_ROOT}). AGENTS.md, CONTRIBUTING.md, the issue templates and ci/guard.yml are read from there
// Contract: contracts/51/init.contract.ts
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { linked } from "./board.ts";
import { num, type Run, sh } from "./run.ts";
import { ensureLabels } from "./tree.ts";
import { stamp, version } from "./version.ts";

export type Plan = {
	files: Record<string, string>; // target repo path → content
	labels: string[]; // label names to create (the same 9 as tree.ts LABELS; init.test.ts checks they match)
	branch: string; // the git branch to create (dev only)
};

const KAGAMI = "Pancheble/kagami";
const TEMPLATES = ["root", "branch", "node", "leaf"].map(
	(t) => `.github/ISSUE_TEMPLATE/${t}.md`,
);
const LABELS = [
	"node",
	"leaf",
	"needs-decision",
	"split",
	"contract-change",
	"blocked",
	"off-recommendation",
	"spec-gap",
	"discovered",
];
// Default risk paths (root #49 decision 6). Project-specific paths are added in /kagami:plan. Inside the Risk paths section, use backticks only for paths
const CLAUDE_MD = `@AGENTS.md

# Project

Work the kagami workflow. The rules are in \`AGENTS.md\`, imported above. When you open a session, pick ready work with \`/kagami:next\`.

# Commands

List the check commands (typecheck, lint, test, and the one that runs them all), one per line. The evaluator and /kagami:build check with these. If empty, /kagami:build asks the human.

# Risk paths (a change here needs a behavior scenario and the human's approval)

- \`.github/workflows/\`
- \`.claude/\`
- \`AGENTS.md\`
- \`CLAUDE.md\`
- \`.env*\`
- This list itself (the guard reads only paths written in backticks. Add project paths in /kagami:plan)
`;

// repo: the kagami repo (owner/name). ref: the kagami ref the target repo pins. Defaults to `v<plugin.json version>`
export function plan(
	root: string,
	{ repo, ref = `v${version(root)}` }: { repo: string; ref?: string },
): Plan {
	const read = (f: string) => readFileSync(join(root, f), "utf8");
	const settings = {
		extraKnownMarketplaces: {
			kagami: { source: { source: "github", repo, ref } },
		},
		enabledPlugins: { "kagami@kagami": true },
	};
	// change only the kagami checkout step of ci/guard.yml (the ref line follows the repository line)
	const guard = read("ci/guard.yml").replace(
		/repository: \S+\n(\s+)ref: \S+/,
		`repository: ${repo}\n$1ref: ${ref}`,
	);
	return {
		files: {
			"AGENTS.md": stamp(read("AGENTS.md"), version(root)),
			"CONTRIBUTING.md": read("CONTRIBUTING.md"),
			"CLAUDE.md": CLAUDE_MD,
			".claude/settings.json": `${JSON.stringify(settings, null, "\t")}\n`,
			".github/workflows/kagami-guard.yml": guard,
			...Object.fromEntries(TEMPLATES.map((t) => [t, read(t)])),
		},
		labels: LABELS,
		branch: "dev",
	};
}

// Installs into the empty new repo in dir (nothing but .git, no commits). Otherwise does nothing and refuses.
// existing: a repo that already has code (#165, contract contracts/165/existing.contract.ts). dev from the default branch tip, one commit
// with the kagami files only. Same-name files: CLAUDE.md gets a kagami block appended, .claude/settings.json gets the kagami keys, the rest are skipped.
// Refuses (writing nothing) if AGENTS.md is there, the tree is not clean, or dev already exists (also origin/dev)
// Labels, writing files, pointing HEAD at dev, up to the first commit. The human does the push (skills/init/SKILL.md). Returns the target repo name
export async function install(
	dir: string,
	{ root, ref, existing }: { root: string; ref?: string; existing?: boolean },
	run: Run,
): Promise<string> {
	if (!existsSync(join(dir, ".git")))
		throw new Error(`Not a git repository: ${dir}`);
	const p = plan(root, { repo: KAGAMI, ref });
	if (existing) return installExisting(dir, p, run);
	const hint = ". For a repository that already has code, run with --existing";
	const extra = readdirSync(dir).filter((f) => f !== ".git");
	if (extra.length)
		throw new Error(
			`Installs only into a new empty repository. Already there: ${extra.join(", ")}${hint}`,
		);
	const head = await run(
		"git",
		["rev-parse", "--verify", "-q", "HEAD"],
		dir,
	).then(
		() => true,
		() => false,
	);
	if (head)
		throw new Error(
			`Installs only into a new empty repository. It already has a commit${hint}`,
		);

	const target = await name(dir, run);
	// labels first: if it fails for lack of permission, the folder stays empty and it can run again (--force, so creating them twice is fine)
	await ensureLabels(target, run);
	write(dir, p.files);
	await run("git", ["symbolic-ref", "HEAD", `refs/heads/${p.branch}`], dir);
	await run("git", ["add", "-A"], dir);
	await run("git", ["commit", "-q", "-m", "chore: kagami init"], dir);
	return target;
}

async function installExisting(dir: string, p: Plan, run: Run) {
	const git = (...args: string[]) => run("git", args, dir);
	if ((await git("status", "--porcelain")).trim())
		throw new Error("Uncommitted changes: commit or stash them first");
	if (
		(await git("branch", "--list", p.branch)).trim() ||
		(await git("branch", "-r", "--list", `origin/${p.branch}`)).trim()
	)
		throw new Error(`A ${p.branch} branch is already there`);
	const base = (
		await run(
			"gh",
			[
				"repo",
				"view",
				"--json",
				"defaultBranchRef",
				"-q",
				".defaultBranchRef.name",
			],
			dir,
		)
	).trim();
	const there = new Set(
		(
			await git(
				"ls-tree",
				"--name-only",
				"-r",
				base,
				"--",
				...Object.keys(p.files),
			)
		)
			.split("\n")
			.filter(Boolean),
	);
	if (there.has("AGENTS.md"))
		throw new Error(
			"AGENTS.md is already there: kagami would replace its rules",
		);

	// everything that can refuse is above; from here on it writes
	const files: Record<string, string> = {};
	for (const [f, body] of Object.entries(p.files)) {
		if (!there.has(f)) files[f] = body;
		else if (f === "CLAUDE.md") {
			const mine = await git("show", `${base}:${f}`);
			files[f] =
				`${mine}${mine.endsWith("\n") ? "" : "\n"}\n<!-- kagami -->\n${body}`;
		} else if (f === ".claude/settings.json") {
			const mine = parse(await git("show", `${base}:${f}`), f);
			const k = JSON.parse(body);
			for (const key of ["extraKnownMarketplaces", "enabledPlugins"])
				mine[key] = { ...mine[key], ...k[key] };
			files[f] = `${JSON.stringify(mine, null, "\t")}\n`;
		}
		if (there.has(f))
			console.log(
				f in files ? `Merged kagami into ${f}` : `Skipped ${f} (already there)`,
			);
	}
	const target = await name(dir, run);
	await ensureLabels(target, run);
	await git("switch", "-q", "-c", p.branch, base);
	write(dir, files);
	await git("add", "--", ...Object.keys(files));
	await git("commit", "-q", "-m", "chore: kagami init");
	return target;
}

// an existing settings.json must be a JSON object, else refuse before anything is written
function parse(s: string, f: string): Record<string, Record<string, unknown>> {
	try {
		const j = JSON.parse(s);
		if (j && typeof j === "object" && !Array.isArray(j)) return j;
	} catch {}
	throw new Error(`${f} is not a JSON object: fix it or remove it first`);
}

function write(dir: string, files: Record<string, string>) {
	for (const [f, body] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, f)), { recursive: true });
		writeFileSync(join(dir, f), body);
	}
}

// #155 leaf #157: links repo (owner/name) to a GitHub Project board. No project → the board already linked to the repo if there is one (#160),
// else creates a public board titled with the repo name under the repo owner. project → links that board of the repo owner, without creating or editing it. Returns the board number; null if it fails (no project scope and so on)
// Contract: contracts/155/init.contract.ts
export async function board(
	repo: string,
	project: number | undefined,
	run: Run,
): Promise<number | null> {
	const [owner, repoName] = repo.split("/");
	try {
		let n = project;
		if (n === undefined) {
			const [first] = await linked(repo, run);
			if (first) return first.number;
			const made = await run("gh", [
				"project",
				"create",
				"--owner",
				owner,
				"--title",
				repoName,
				"--format",
				"json",
			]);
			n = Number(JSON.parse(made).number);
			await run("gh", [
				"project",
				"edit",
				String(n),
				"--owner",
				owner,
				"--visibility",
				"PUBLIC",
			]);
		}
		await run("gh", [
			"project",
			"link",
			String(n),
			"--owner",
			owner,
			"--repo",
			repoName,
		]);
		return n;
	} catch (e) {
		console.error(`Board step failed: ${(e as Error).message.trim()}`);
		return null;
	}
}

// The target repo's owner/name, from the gh remote of dir
async function name(dir: string, run: Run): Promise<string> {
	return (
		await run(
			"gh",
			["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
			dir,
		)
	).trim();
}

// What the CLI does: install (skipped with only, for a repo already using kagami), then the board step.
// A board failure does not undo the install; board is null then
export async function init(
	dir: string,
	{
		root,
		ref,
		project,
		only = false,
		existing,
	}: {
		root: string;
		ref?: string;
		project?: number;
		only?: boolean;
		existing?: boolean;
	},
	run: Run,
): Promise<{ target: string; board: number | null }> {
	const target = only
		? await name(dir, run)
		: await install(dir, { root, ref, existing }, run);
	return { target, board: await board(target, project, run) };
}

// node src/init.ts [--ref <ref>] [--dir <target repo>] [--project <number>] [--board] [--existing]  (dir defaults to the current folder)
// --existing: install into a repo that already has code and commits (dev from its default branch)
// --project: link that existing board of the repo owner instead of making one. --board: only the board step, for a repo already using kagami
if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			ref: { type: "string" },
			dir: { type: "string" },
			project: { type: "string" },
			board: { type: "boolean" },
			existing: { type: "boolean" },
		},
	});
	const root = fileURLToPath(new URL("../", import.meta.url));
	const project =
		values.project === undefined
			? undefined
			: num("--project", values.project, 1);
	const { target, board: n } = await init(
		values.dir ?? process.cwd(),
		{
			root,
			ref: values.ref,
			project,
			only: values.board,
			existing: values.existing,
		},
		sh,
	);
	if (!values.board)
		console.log(
			`Installed into ${target}. Made the first commit on dev; not pushed yet`,
		);
	if (values.existing)
		console.log(
			"Next: `git push -u origin dev`, then `gh repo edit --default-branch dev`",
		);
	console.log(
		n
			? `Linked board ${n} of ${target.split("/")[0]} to ${target}`
			: `No board linked. If gh lacks the project scope, run \`gh auth refresh -s project\`, then run again with --board${project ? ` --project ${project}` : ""}`,
	);
}
