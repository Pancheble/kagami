// Counts the Changed line of the PR TL;DR. Adds only new issues to the facts guard.ts facts() counts (contracts, risk paths, deleted tests, dependencies).
// Counts only. The one writing the PR fills plan changes and Decided
// New issues = the leaf's sub-issues (split) + **discovered** #N records on the leaf issue (AGENTS.md record format)
// Run: node src/changed.ts [--base origin/dev] [--issue <leaf number>]  (without a leaf number, reads it from the git branch leaf/<number>-)
import { parseArgs } from "node:util";
import { type Facts, facts } from "./guard.ts";
import { sh } from "./run.ts";

// Counts only comments whose first line starts with **discovered** #N
export const newIssues = (sub: number[], comments: string[]): number[] => [
	...new Set([
		...sub,
		...comments.flatMap((c) => {
			const n = c.match(/^\*\*discovered\*\* #(\d+)/)?.[1];
			return n ? [Number(n)] : [];
		}),
	]),
];

const list = (xs: string[]) => (xs.length ? xs.join(", ") : "None");
// Field order of AGENTS.md "PR TL;DR format". Deleted tests, which facts() counts, go at the very end
export const line = (f: Facts, issues: number[]) =>
	[
		`Changed: new issues ${list(issues.map((n) => `#${n}`))}`,
		"plan changes (manual)",
		`contract changes ${list(f.contracts)}`,
		`risk paths touched ${list(f.risk)}`,
		`new dependencies ${list(f.deps)}`,
		`deleted tests ${list(f.deleted)}`,
	].join(" / ");

if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			base: { type: "string", default: "origin/dev" },
			issue: { type: "string" },
		},
	});
	const git = (...a: string[]) => sh("git", a);
	const show = (ref: string, f: string) =>
		git("show", `${ref}:${f}`).catch(() => "");
	const side = async (ref: string) => ({
		md: await show(ref, "CLAUDE.md"),
		pkg: await show(ref, "package.json"),
	});
	const base = (await git("merge-base", values.base, "HEAD")).trim();
	const f = facts(
		await git("diff", "--name-status", "--no-renames", base, "HEAD"),
		await side(base),
		await side("HEAD"),
	);
	const n =
		values.issue ??
		(await git("branch", "--show-current")).match(/^leaf\/(\d+)-/)?.[1];
	if (!n) throw new Error("Unknown leaf number: --issue <number>");
	const nums = (out: string) => out.split("\n").filter(Boolean).map(Number);
	const sub = nums(
		await sh("gh", [
			"api",
			"--paginate",
			`repos/{owner}/{repo}/issues/${n}/sub_issues`,
			"--jq",
			".[].number",
		]),
	);
	const comments: string[] = JSON.parse(
		await sh("gh", [
			"issue",
			"view",
			n,
			"--json",
			"comments",
			"--jq",
			"[.comments[].body]",
		]),
	);
	console.log(line(f, newIssues(sub, comments)));
}
