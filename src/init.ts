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

// Installs into the empty new repo in dir (nothing but .git, no commits). Otherwise does nothing and refuses
// Labels, writing files, pointing HEAD at dev, up to the first commit. The human does the push (skills/init/SKILL.md). Returns the target repo name
export async function install(
	dir: string,
	{ root, ref }: { root: string; ref?: string },
	run: Run,
): Promise<string> {
	if (!existsSync(join(dir, ".git")))
		throw new Error(`Not a git repository: ${dir}`);
	const extra = readdirSync(dir).filter((f) => f !== ".git");
	if (extra.length)
		throw new Error(
			`Installs only into a new empty repository. Already there: ${extra.join(", ")}`,
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
			"Installs only into a new empty repository. It already has a commit",
		);

	const target = await name(dir, run);
	// labels first: if it fails for lack of permission, the folder stays empty and it can run again (--force, so creating them twice is fine)
	await ensureLabels(target, run);
	const p = plan(root, { repo: KAGAMI, ref });
	for (const [f, body] of Object.entries(p.files)) {
		mkdirSync(dirname(join(dir, f)), { recursive: true });
		writeFileSync(join(dir, f), body);
	}
	await run("git", ["symbolic-ref", "HEAD", `refs/heads/${p.branch}`], dir);
	await run("git", ["add", "-A"], dir);
	await run("git", ["commit", "-q", "-m", "chore: kagami init"], dir);
	return target;
}

// #155 leaf #157: links repo (owner/name) to a GitHub Project board. No project → creates a public board titled with the repo name under the repo owner.
// project → links that board of the repo owner, without creating or editing it. Returns the board number; null if it fails (no project scope and so on)
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
	}: { root: string; ref?: string; project?: number; only?: boolean },
	run: Run,
): Promise<{ target: string; board: number | null }> {
	const target = only
		? await name(dir, run)
		: await install(dir, { root, ref }, run);
	return { target, board: await board(target, project, run) };
}

// node src/init.ts [--ref <ref>] [--dir <target repo>] [--project <number>] [--board]  (dir defaults to the current folder)
// --project: link that existing board of the repo owner instead of making one. --board: only the board step, for a repo already using kagami
if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			ref: { type: "string" },
			dir: { type: "string" },
			project: { type: "string" },
			board: { type: "boolean" },
		},
	});
	const root = fileURLToPath(new URL("../", import.meta.url));
	const project =
		values.project === undefined
			? undefined
			: num("--project", values.project, 1);
	const { target, board: n } = await init(
		values.dir ?? process.cwd(),
		{ root, ref: values.ref, project, only: values.board },
		sh,
	);
	if (!values.board)
		console.log(
			`Installed into ${target}. Made the first commit on dev; not pushed yet`,
		);
	console.log(
		n
			? `Linked board ${n} of ${target.split("/")[0]} to ${target}`
			: `No board linked. If gh lacks the project scope, run \`gh auth refresh -s project\`, then run again with --board${project ? ` --project ${project}` : ""}`,
	);
}
