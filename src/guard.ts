// CI guard: compares the PR checkout's HEAD (the PR on top of dev) with origin/dev, judges it (judge), and shows the result as a check.
// The gate to dev is the human's merge consent (AGENTS.md). Before it, the guard shows red, green or a flag. This file is a risk path (Risk paths in CLAUDE.md).
//   Edited-contract check: blocks if an existing contract or acceptance test was edited or deleted.
//     Contract cleanup: if the PR has the contract-change label and the Changed line of the body TL;DR names that contract file (*.contract.*), flag it instead of blocking
//   Ratchet: FAIL if a contract or acceptance test that was green on dev is red or gone at HEAD
//   Fact counting: counts risk paths (the list in dev's CLAUDE.md), deleted tests and new dependencies
//   Risk paths source: blocks if the PR side's CLAUDE.md has no Risk paths section
//   Security check: looks at changed code with the Biome security rules
// Contract cleanup, risk paths, deleted tests and security findings are shown to the human as flags (warnings) on green. Writes nothing to GitHub (read token)
// Run: node src/guard.ts --dir <PR checkout>  (origin/dev must exist. Exit code 1 when blocked)
//   Labels and body are read from the pull_request payload in GITHUB_EVENT_PATH. Locally, pass a JSON file of the same shape in that variable
import { appendFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, matchesGlob, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { noKey, quiet, type Run, sh } from "./run.ts";

export const TESTS = /\.(accept|contract)\.[cm]?[jt]sx?$/;
const REPORTER = new URL("./red-reporter.ts", import.meta.url).href;
const BIOME = fileURLToPath(
	new URL("../node_modules/.bin/biome", import.meta.url),
);

export type Row = { name: string; ok: boolean; error: string };

// git wraps paths with non-ASCII characters or quotes in "..." and writes bytes as \ooo (core.quotePath).
// Without unquoting, contract tests with Korean names slip past the regex and prefix match
export function unquote(p: string): string {
	if (!p.startsWith('"')) return p;
	const esc: Record<string, number> = {
		t: 9,
		n: 10,
		r: 13,
		'"': 34,
		"\\": 92,
		a: 7,
		b: 8,
		f: 12,
		v: 11,
	};
	const bytes: number[] = [];
	const body = p.slice(1, -1);
	for (let i = 0; i < body.length; i++) {
		if (body[i] !== "\\") {
			bytes.push(...Buffer.from(body[i]));
			continue;
		}
		const oct = body.slice(i + 1, i + 4);
		if (/^[0-7]{3}$/.test(oct)) {
			bytes.push(Number.parseInt(oct, 8));
			i += 3;
		} else bytes.push(esc[body[++i]] ?? body.charCodeAt(i));
	}
	return Buffer.from(bytes).toString("utf8");
}
// Path list from git, one per line
export const paths = (out: string) =>
	out.split("\n").filter(Boolean).map(unquote);
// Reason for blocking
export type Failed = { why: string };

// Installs the target repo's dependencies in the worktree. Every place that runs tests (results) goes through here.
// This takes in the target repo's code, so it runs in an environment without credentials and does not run install scripts (lifecycle).
// Installs only from the lock file (npm ci). Throws if it cannot: something that cannot be judged is not a pass
// ponytail: npm's package-lock.json only. pnpm, yarn or repos without a lock are not installed (red from load failure)
export async function install(wt: string, run: Run) {
	if (!existsSync(join(wt, "package-lock.json"))) return;
	await run(
		"npm",
		["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
		wt,
		noKey(),
	);
}

// Runs node --test separately per contract or acceptance test file to read each test's result. The reporter writes results to a file.
// It runs the PR's code, so it runs in an environment without credentials. If a file fails to load, its results are empty.
// Installs dependencies from that commit's lock file first (the PR's and dev's lock can differ)
export async function results(
	files: string[],
	cwd: string,
	run: Run,
): Promise<Map<string, Row[]>> {
	if (files.length) await install(cwd, run);
	const tmp = mkdtempSync(join(tmpdir(), "rows-"));
	const out = new Map<string, Row[]>();
	for (const [k, f] of files.entries()) {
		const dest = join(tmp, `${k}.jsonl`);
		// red means a non-zero exit code
		await quiet(
			run(
				process.execPath,
				[
					"--test",
					`--test-reporter=${REPORTER}`,
					`--test-reporter-destination=${dest}`,
					f,
				],
				cwd,
				noKey(),
			),
		);
		out.set(
			f,
			existsSync(dest)
				? readFileSync(dest, "utf8")
						.split("\n")
						.filter(Boolean)
						.map((l) => JSON.parse(l))
				: [],
		);
	}
	return out;
}

// Reads only paths written in backticks in the CLAUDE.md "Risk paths" section. Lines written in words (a script that moves main, and so on) cannot be counted
const section = (md: string) =>
	md.split(/^#+ /m).find((s) => s.startsWith("Risk paths"));
export function riskPaths(md: string): string[] {
	const sec = section(md);
	return sec ? [...sec.matchAll(/`([^`]+)`/g)].map((m) => m[1]) : [];
}
// Ending in / means under that folder, * means a glob (* does not cross /), anything else must match the name exactly
const under = (f: string, p: string) =>
	p.endsWith("/")
		? f.startsWith(p)
		: p.includes("*")
			? matchesGlob(f, p)
			: f === p;
const deps = (pkg: string): string[] => {
	try {
		const j = JSON.parse(pkg);
		return Object.keys({
			...j.dependencies,
			...j.devDependencies,
			...j.optionalDependencies,
			...j.peerDependencies,
		});
	} catch {
		return [];
	}
};
export type Facts = {
	contracts: string[]; // existing contract or acceptance tests edited or deleted
	risk: string[]; // risk paths touched
	deleted: string[]; // deleted tests
	deps: string[]; // new dependencies
};
type Side = { md: string; pkg: string }; // CLAUDE.md and package.json

// Fact counting: counts from the output of git diff --name-status --no-renames and the CLAUDE.md and package.json of both sides.
// The risk path list comes from dev. Even if a PR drops its own path from the list, it is caught, and changing the list is itself a risk path
export function facts(status: string, base: Side, head: Side): Facts {
	const changes = status
		.split("\n")
		.filter(Boolean)
		.map((l) => {
			const [s, f] = l.split("\t");
			return [s, unquote(f)] as [string, string];
		});
	const list = riskPaths(base.md);
	const risk = changes
		.map(([, f]) => f)
		.filter((f) => list.some((p) => under(f, p)));
	if (riskPaths(head.md).join("\n") !== list.join("\n"))
		risk.push("Risk paths list in CLAUDE.md");
	return {
		contracts: changes
			.filter(([s, f]) => s !== "A" && TESTS.test(f))
			.map(([, f]) => f),
		risk,
		deleted: changes
			.filter(
				([s, f]) => s === "D" && /\.(test|spec|contract|accept)\./.test(f),
			)
			.map(([, f]) => f),
		deps: deps(head.pkg).filter((d) => !deps(base.pkg).includes(d)),
	};
}

// Ratchet: a contract or acceptance test that was green on dev must also be green at HEAD. If it turned red or is gone, it broke.
// Tests still red are let through. The passing list is not stored; it is computed from dev on every merge.
// skip: files edited by a contract cleanup. Everything except those files is kept
export async function ratchet(
	wt: string,
	run: Run,
	skip: string[] = [],
): Promise<{ broken: string[]; kept: number }> {
	const list = async (ref: string) =>
		paths(
			await run(
				"git",
				["ls-tree", "-r", "--name-only", ref, "--", "contracts"],
				wt,
			),
		).filter((f) => TESTS.test(f));
	const files = await list("origin/dev");
	if (!files.length) return { broken: [], kept: 0 };
	const dev = `${wt}-dev`;
	await quiet(run("git", ["worktree", "remove", "--force", dev], wt));
	await run("git", ["worktree", "add", "--detach", dev, "origin/dev"], wt);
	let before: Map<string, Row[]>;
	try {
		before = await results(files, dev, run);
	} finally {
		await quiet(run("git", ["worktree", "remove", "--force", dev], wt));
	}
	const key = (f: string, r: Row) => `${f} › ${r.name}`;
	const green = [...before].flatMap(([f, rs]) =>
		skip.includes(f) ? [] : rs.filter((r) => r.ok).map((r) => key(f, r)),
	);
	const now = new Set(await list("HEAD"));
	const after = await results(
		[...before.keys()].filter(
			(f) => now.has(f) && green.some((k) => k.startsWith(`${f} › `)),
		),
		wt,
		run,
	);
	const ok = new Set(
		[...after].flatMap(([f, rs]) =>
			rs.filter((r) => r.ok).map((r) => key(f, r)),
		),
	);
	return { broken: green.filter((k) => !ok.has(k)), kept: green.length };
}

// Security check: looks at changed code files with the harness's Biome security rules (eval, secrets and so on). Failing to run is a finding too
export async function security(
	files: string[],
	wt: string,
	run: Run,
): Promise<string[]> {
	const code = files.filter((f) => /\.[cm]?[jt]sx?$/.test(f));
	if (!code.length) return [];
	const dest = join(mkdtempSync(join(tmpdir(), "sec-")), "biome.json");
	await quiet(
		run(
			BIOME,
			[
				"lint",
				"--only=security",
				"--reporter=json",
				`--reporter-file=${dest}`,
				"--no-errors-on-unmatched",
				...code,
			],
			wt,
		),
	);
	if (!existsSync(dest)) return ["Could not run the security lint"];
	type D = {
		category: string;
		message: string;
		location: { path: string; start: { line: number } };
	};
	return (JSON.parse(readFileSync(dest, "utf8")).diagnostics as D[]).map(
		(d) =>
			`${d.location.path}:${d.location.start.line} ${d.category}: ${d.message}`,
	);
}

const items = (xs: string[]) =>
	xs.length ? xs.map((x) => `\n  - ${x}`).join("") : " None";

// The PR's labels and body (pull_request in GITHUB_EVENT_PATH)
export type Pr = { labels: string[]; body: string };
// Files allowed by a contract cleanup: contract tests named as a word on the body's Changed: line, with the contract-change label. Not acceptance tests
export const allowed = (contracts: string[], pr?: Pr) => {
	if (!pr?.labels.includes("contract-change")) return [];
	const words = new Set(
		pr.body
			.split("\n")
			.filter((l) => /^\s*Changed:/.test(l))
			.flatMap((l) => l.split(/[\s,]+/)),
	);
	return contracts.filter((f) => /\.contract\./.test(f) && words.has(f));
};

// Judgment: blocked (fail) is red. wait means green with something flagged for the human. report is the log and job summary body
export async function judge(wt: string, run: Run, pr?: Pr) {
	const show = (ref: string, f: string) =>
		run("git", ["show", `${ref}:${f}`], wt).catch(() => "");
	const status = await run(
		"git",
		["diff", "--name-status", "--no-renames", "origin/dev", "HEAD"],
		wt,
	);
	const head = {
		md: await show("HEAD", "CLAUDE.md"),
		pkg: await show("HEAD", "package.json"),
	};
	const f = facts(
		status,
		{
			md: await show("origin/dev", "CLAUDE.md"),
			pkg: await show("origin/dev", "package.json"),
		},
		head,
	);
	const changed = status
		.split("\n")
		.filter((l) => l && !l.startsWith("D"))
		.map((l) => unquote(l.split("\t")[1]));
	const tidy = allowed(f.contracts, pr);
	const bad = f.contracts.filter((c) => !tidy.includes(c));
	// editing a contract without permission blocks. The ratchet is not run
	const r = bad.length ? { broken: [], kept: 0 } : await ratchet(wt, run, tidy);
	const sec = await security(changed, wt, run);
	let fail: Failed | undefined;
	// The single source of risk paths is Risk paths in CLAUDE.md (root #49 decision 6). Block if it cannot be found on the PR side
	if (section(head.md) === undefined)
		fail = {
			why: "CLAUDE.md has no Risk paths section (the source of truth for risk paths: list the paths in backticks under a `# Risk paths` heading)",
		};
	else if (bad.length)
		fail = {
			why: `edited existing contract/acceptance tests: ${bad.join(", ")}`,
		};
	else if (r.broken.length)
		fail = {
			why: `ratchet: contract/acceptance tests that were green on dev broke (${r.broken.length})`,
		};
	const wait =
		!fail && tidy.length + f.risk.length + f.deleted.length + sec.length > 0;
	const word = fail
		? `blocked — ${fail.why}`
		: wait
			? "needs a human look — contract cleanup, risk paths, deleted tests, or security findings. The check is green; the human looks and decides on the merge"
			: "pass";
	const report = [
		`kagami guard: ${word}`,
		"",
		`- Contract/acceptance test edits:${items(bad)}`,
		`- Contract cleanup:${items(tidy)}`,
		`- Ratchet: broken of ${r.kept} green on dev:${items(r.broken)}`,
		`- Risk paths:${items(f.risk)}`,
		`- Deleted tests:${items(f.deleted)}`,
		`- Security lint:${items(sec)}`,
		`- New dependencies:${items(f.deps)}`,
	].join("\n");
	return { fail, wait, report };
}

// CI job: runs judge on the PR checkout and shows the result in the log and job summary. Blocked means a red check, flagged means green with a warning
if (import.meta.main) {
	const { values } = parseArgs({
		options: { dir: { type: "string", default: "." } },
	});
	const ev = process.env.GITHUB_EVENT_PATH;
	const p = ev && JSON.parse(readFileSync(ev, "utf8")).pull_request;
	const pr: Pr | undefined = p && {
		labels: (p.labels ?? []).map((l: { name: string }) => l.name),
		body: p.body ?? "",
	};
	const j = await judge(resolve(values.dir), sh, pr);
	console.log(j.report);
	if (process.env.GITHUB_STEP_SUMMARY)
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${j.report}\n`);
	if (j.fail) process.exitCode = 1;
	else if (j.wait)
		console.log(
			"::warning::kagami guard: needs a human look (contract cleanup, risk paths, deleted tests, security findings)",
		);
}
