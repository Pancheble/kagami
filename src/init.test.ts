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
import { install, plan } from "./init.ts";
import type { Run } from "./run.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TARGET = "o/target";

// 빈 새 저장소 흉내: .git 폴더 하나(extra가 있으면 그 파일도)
function repo(extra?: string) {
	const dir = mkdtempSync(join(tmpdir(), "init-"));
	mkdirSync(join(dir, ".git"));
	if (extra) writeFileSync(join(dir, extra), "x");
	return dir;
}
// commits가 true면 HEAD가 있다
function fake(commits = false) {
	const calls: string[][] = [];
	const run: Run = async (cmd, args) => {
		calls.push([cmd, ...args]);
		if (args[0] === "rev-parse") {
			if (commits) return "abc\n";
			throw new Error("git rev-parse 실패");
		}
		if (args[0] === "repo") return `${TARGET}\n`;
		return "";
	};
	return { run, calls };
}

test("빈 새 저장소에 plan의 파일을 쓰고, 라벨 9개를 만들고, dev에 첫 커밋을 한다", async () => {
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

test("커밋이 있으면 거부하고 아무것도 쓰지 않는다", async () => {
	const dir = repo();
	const { run, calls } = fake(true);
	await assert.rejects(install(dir, { root: ROOT }, run), /커밋/);
	assert.deepEqual(readdirSync(dir), [".git"]);
	assert.ok(!calls.some((c) => c[0] === "gh"));
});

test(".git 말고 파일이 있으면 거부하고 아무것도 쓰지 않는다", async () => {
	const dir = repo("README.md");
	const { run, calls } = fake();
	await assert.rejects(install(dir, { root: ROOT }, run), /README\.md/);
	assert.deepEqual(readdirSync(dir).sort(), [".git", "README.md"]);
	assert.deepEqual(calls, []);
});

test("git 저장소가 아니면 거부한다", async () => {
	const dir = mkdtempSync(join(tmpdir(), "init-"));
	await assert.rejects(install(dir, { root: ROOT }, fake().run), /git/);
});
