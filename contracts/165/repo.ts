// #165 test repo for the existing-repo contracts: a real git repo with commits on main, and a Run that sends git to real git
// and answers gh from memory. Not a test file
// gh understood: repo view (nameWithOwner → o/r, defaultBranchRef → main), label create. project and api go to board (contracts/155/github.ts) if given.
// Anything else (issue edit and so on) throws, so touching existing issues fails the test
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Run, sh } from "../../src/run.ts";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const R = "o/r";

// files: path → content, committed on main in one commit
export function repo(files: Record<string, string>) {
	const dir = mkdtempSync(join(tmpdir(), "existing-"));
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
	git("init", "-q", "-b", "main");
	git("config", "user.name", "t");
	git("config", "user.email", "t@example.com");
	git("config", "commit.gpgsign", "false");
	for (const [f, body] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, f)), { recursive: true });
		writeFileSync(join(dir, f), body);
	}
	git("add", "-A");
	git("commit", "-q", "-m", "existing work");
	const read = (f: string) => readFileSync(join(dir, f), "utf8");
	return { dir, git, read, main: git("rev-parse", "main") };
}

export function gh(board?: Run) {
	const calls: string[][] = [];
	const labels: string[] = [];
	const run: Run = async (cmd, args, cwd, env) => {
		if (cmd === "git") return sh(cmd, args, cwd, env);
		calls.push([cmd, ...args]);
		if (cmd !== "gh") throw new Error(`fake gh: not gh: ${cmd}`);
		if (args[0] === "repo" && args[1] === "view")
			return args.join(" ").includes("defaultBranchRef") ? "main\n" : `${R}\n`;
		if (args[0] === "label" && args[1] === "create") {
			labels.push(args[2]);
			return "";
		}
		if (board && ["project", "api"].includes(args[0]))
			return board(cmd, args, cwd, env);
		throw new Error(`fake gh: unknown ${args.join(" ")}`);
	};
	return { run, calls, labels };
}
