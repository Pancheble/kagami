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
import { type Run, sh } from "./run.ts";
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

	const target = (
		await run(
			"gh",
			["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
			dir,
		)
	).trim();
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

// node src/init.ts [--ref <ref>] [--dir <target repo>]  (dir defaults to the current folder)
if (import.meta.main) {
	const { values } = parseArgs({
		options: { ref: { type: "string" }, dir: { type: "string" } },
	});
	const root = fileURLToPath(new URL("../", import.meta.url));
	const target = await install(
		values.dir ?? process.cwd(),
		{ root, ref: values.ref },
		sh,
	);
	console.log(
		`Installed into ${target}. Made the first commit on dev; not pushed yet`,
	);
}
