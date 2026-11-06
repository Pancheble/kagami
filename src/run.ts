// Shared by guard, tree, spec and changed: running commands (Run, sh), a small helper (quiet),
// running target repo code without credentials (noKey), and numeric CLI arguments (num)
import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export type Run = (
	cmd: string,
	args: string[],
	cwd?: string,
	env?: NodeJS.ProcessEnv, // if unset, the harness environment as is
) => Promise<string>;
export const quiet = (p: Promise<unknown>) => p.catch(() => {});

const exec = promisify(execFile);
export const sh: Run = async (cmd, args, cwd, env) => {
	try {
		const p = exec(cmd, args, { cwd, env, maxBuffer: 64 << 20 });
		p.child.stdin?.end(); // so commands that wait on stdin do not hang
		return (await p).stdout;
	} catch (e) {
		const { stdout = "", stderr = "" } = e as {
			stdout?: string;
			stderr?: string;
		};
		throw new Error(`${cmd} ${args[0]} failed\n${stderr}${stdout}`);
	}
};

// Hands out no keys: an environment without GitHub and git credentials. No gh token or config, git credential helper, or ssh agent.
// Used when the guard installs the target repo's dependencies and runs its tests (install, results). If that code calls gh or git push, it fails
export function noKey(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const k of [
		"KAGAMI_BOT_TOKEN",
		"GH_TOKEN",
		"GITHUB_TOKEN",
		"GH_ENTERPRISE_TOKEN",
		"GITHUB_ENTERPRISE_TOKEN",
		"SSH_AUTH_SOCK",
	])
		delete env[k];
	return Object.assign(env, {
		GH_CONFIG_DIR: mkdtempSync(join(tmpdir(), "nokey-")), // empty folder: gh finds no login
		GIT_TERMINAL_PROMPT: "0",
		GIT_SSH_COMMAND: "false",
		// set credential.helper to empty on the command line: clears the helper list read earlier (keychain and so on)
		GIT_CONFIG_COUNT: "1",
		GIT_CONFIG_KEY_0: "credential.helper",
		GIT_CONFIG_VALUE_0: "",
	});
}

// Numeric CLI argument. Integers of at least min only
export function num(flag: string, v: string, min: number): number {
	if (!/^\d+$/.test(v) || Number(v) < min)
		throw new Error(`${flag} must be an integer >= ${min}: "${v}"`);
	return Number(v);
}
