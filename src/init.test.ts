import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { init, install, plan } from "./init.ts";
import type { Run } from "./run.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TARGET = "o/target";

// fake empty new repo: a single .git folder (plus the extra files, if any)
function repo(extra?: string) {
	const dir = mkdtempSync(join(tmpdir(), "init-"));
	mkdirSync(join(dir, ".git"));
	if (extra) writeFileSync(join(dir, extra), "x");
	return dir;
}
// HEAD exists when commits is true. board: gh project calls work (else they fail like a token without the project scope)
function fake(commits = false, board = false) {
	const calls: string[][] = [];
	const run: Run = async (cmd, args) => {
		calls.push([cmd, ...args]);
		if (args[0] === "project") {
			if (!board)
				throw new Error("gh project failed\nmissing required scopes [project]");
			return args[1] === "create" ? '{"number":5}\n' : "";
		}
		if (args[0] === "rev-parse") {
			if (commits) return "abc\n";
			throw new Error("git rev-parse failed");
		}
		if (args[0] === "repo") return `${TARGET}\n`;
		return "";
	};
	return { run, calls };
}

test("in an empty new repo, writes the plan's files, creates 9 labels and makes the first commit on dev", async () => {
	const dir = repo();
	const { run, calls } = fake();
	assert.equal(await install(dir, { root: ROOT, ref: "dev" }, run), TARGET);

	const p = plan(ROOT, { repo: "Pancheble/kagami", ref: "dev" });
	for (const [f, body] of Object.entries(p.files))
		assert.equal(readFileSync(join(dir, f), "utf8"), body, f);

	const labels = calls.filter((c) => c[1] === "label");
	assert.deepEqual(labels.map((c) => c[3]).sort(), [...p.labels].sort());
	assert.ok(labels.every((c) => c[5] === TARGET));

	const git = calls.filter((c) => c[0] === "git").map((c) => c[1]);
	assert.deepEqual(git, ["rev-parse", "symbolic-ref", "add", "commit"]);
	assert.ok(
		calls.some((c) => c.join(" ") === "git symbolic-ref HEAD refs/heads/dev"),
	);
});

test("refuses and writes nothing if there are commits", async () => {
	const dir = repo();
	const { run, calls } = fake(true);
	await assert.rejects(
		install(dir, { root: ROOT }, run),
		/already has a commit/,
	);
	assert.deepEqual(readdirSync(dir), [".git"]);
	assert.ok(!calls.some((c) => c[0] === "gh"));
});

test("refuses and writes nothing if there are files besides .git", async () => {
	const dir = repo("README.md");
	const { run, calls } = fake();
	await assert.rejects(install(dir, { root: ROOT }, run), /README\.md/);
	assert.deepEqual(readdirSync(dir).sort(), [".git", "README.md"]);
	assert.deepEqual(calls, []);
});

test("refuses if it is not a git repo", async () => {
	const dir = mkdtempSync(join(tmpdir(), "init-"));
	await assert.rejects(install(dir, { root: ROOT }, fake().run), /git/);
});

test("a failing board step does not undo the install: the first commit is made, board is null", async () => {
	const dir = repo();
	const { run, calls } = fake();
	assert.deepEqual(await init(dir, { root: ROOT, ref: "dev" }, run), {
		target: TARGET,
		board: null,
	});
	assert.ok(calls.some((c) => c[0] === "git" && c[1] === "commit"));
	assert.ok(calls.some((c) => c[1] === "project"));
});

test("install then board: makes and links a board", async () => {
	const { run, calls } = fake(false, true);
	assert.deepEqual(await init(repo(), { root: ROOT, ref: "dev" }, run), {
		target: TARGET,
		board: 5,
	});
	assert.ok(
		calls.some(
			(c) => c.join(" ") === "gh project link 5 --owner o --repo target",
		),
	);
});

test("--board: in a repo already using kagami, skips the empty-repo check and only links the board", async () => {
	const dir = repo("AGENTS.md");
	const { run, calls } = fake(true, true);
	assert.deepEqual(
		await init(dir, { root: ROOT, project: 8, only: true }, run),
		{ target: TARGET, board: 8 },
	);
	assert.ok(!calls.some((c) => c[0] === "git" || c[1] === "label"));
	assert.ok(!calls.some((c) => c[2] === "create"));
	assert.deepEqual(readdirSync(dir).sort(), [".git", "AGENTS.md"]);
});
