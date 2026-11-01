import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type Opts, sh } from "./leaf.ts";
import { HOOKS, promote } from "./promote.ts";

const ID = ["-c", "user.name=t", "-c", "user.email=t@t"];
const git = (dir: string, ...a: string[]) => sh("git", [...ID, ...a], dir);
const head = async (dir: string, ref: string) =>
	(await git(dir, "rev-parse", ref)).trim();
async function commit(dir: string, f: string) {
	writeFileSync(join(dir, f), f);
	await git(dir, "add", f);
	await git(dir, "commit", "-q", "-m", f);
	return head(dir, "HEAD");
}

// 진짜 git: 원격(bare)에 main = c0, dev = c0 → a → b. 하네스 클론은 o.dir
async function world() {
	const root = mkdtempSync(join(tmpdir(), "promote-"));
	const remote = join(root, "remote.git");
	const work = join(root, "work");
	await sh("git", ["init", "-q", "--bare", "-b", "main", remote]);
	await sh("git", ["clone", "-q", remote, work]);
	const c0 = await commit(work, "c0");
	await git(work, "push", "-q", "origin", "HEAD:main");
	await git(work, "checkout", "-q", "-b", "dev");
	const a = await commit(work, "a");
	const b = await commit(work, "b");
	await git(work, "push", "-q", "origin", "dev");
	const dir = join(root, "harness");
	await sh("git", ["clone", "-q", remote, dir]);
	const o = { dir } as Opts;
	const main = () => head(remote, "main");
	return { remote, work, dir, o, c0, a, b, main };
}
const body = (sha: string) =>
	`## 되는 것\n\n---\n\n- 큰 가지: #5\n- dev: ${sha}\n`;

test("보고서의 dev 커밋이 main의 자손이면 main을 그 커밋으로 fast-forward한다", async () => {
	const w = await world();
	const r = await promote(body(w.a), w.o, sh);
	assert.equal(await w.main(), w.a);
	assert.match(r.done, new RegExp(`main을 dev ${w.a}로 옮겼다`));
	assert.ok(r.ok);
	assert.ok(r.done.includes(w.c0)); // 옮기기 전 main
});

test("보고서에 dev 커밋이 없으면 main을 건드리지 않는다", async () => {
	const w = await world();
	const r = await promote("## 되는 것\n", w.o, sh);
	assert.equal(r.ok, false);
	assert.match(r.done, /보고서에 dev 커밋이 없다/);
	assert.equal(await w.main(), w.c0);
});

test("dev에 없는 커밋(main의 자손이어도)으로는 옮기지 않는다", async () => {
	const w = await world();
	await git(w.work, "checkout", "-q", "-b", "side", w.c0);
	const s = await commit(w.work, "side");
	await git(w.work, "push", "-q", "origin", "side");
	const r = await promote(body(s), w.o, sh);
	assert.equal(r.ok, false);
	assert.match(r.done, /dev에 없는 커밋/);
	assert.equal(await w.main(), w.c0);
});

test("main에 dev에 없는 커밋이 있으면(갈라짐) git이 fast-forward를 거절하고 main은 그대로다", async () => {
	const w = await world();
	await git(w.work, "checkout", "-q", "-b", "hot", w.c0);
	const hot = await commit(w.work, "hot");
	// 사람이 hook 없이 main에 직접 올린 상황
	await git(w.work, "push", "-q", "--no-verify", "origin", "HEAD:main");
	const r = await promote(body(w.b), w.o, sh);
	assert.equal(r.ok, false);
	assert.match(r.done, /push가 거절됐다[\s\S]*non-fast-forward/);
	assert.equal(await w.main(), hot);
});

test("main이 이미 그 커밋을 품고 있으면 되돌리지 않고 이미 올라갔다고 한다", async () => {
	const w = await world();
	await promote(body(w.b), w.o, sh);
	const r = await promote(body(w.a), w.o, sh);
	assert.ok(r.ok);
	assert.match(r.done, /이미 main에 있다/);
	assert.equal(await w.main(), w.b);
});

test("두 하네스가 동시에 올리면 main은 더 앞선 dev 커밋에 서고, 어느 쪽도 main을 되돌리지 않는다", async () => {
	const w = await world();
	const dir2 = join(w.dir, "..", "harness2");
	await sh("git", ["clone", "-q", w.remote, dir2]);
	const rs = await Promise.all([
		promote(body(w.a), w.o, sh),
		promote(body(w.b), { dir: dir2 } as Opts, sh),
	]);
	assert.ok(
		rs.every((r) => r.ok),
		JSON.stringify(rs),
	);
	assert.equal(await w.main(), w.b);
});

// hooks/pre-push: core.hooksPath로 건 클론(사람·세션)에서 main을 dev 밖 커밋이나 force로 옮기는 push를 막는다
async function hooked() {
	const w = await world();
	await git(w.work, "config", "core.hooksPath", HOOKS);
	await git(w.work, "fetch", "-q", "origin");
	return w;
}

test("pre-push hook: main에 직접 커밋해 올리면 막는다", async () => {
	const w = await hooked();
	await git(w.work, "checkout", "-q", "-b", "m", "origin/main");
	await commit(w.work, "direct");
	await assert.rejects(
		git(w.work, "push", "origin", "HEAD:main"),
		/main에는 dev 커밋만 fast-forward로 올린다/,
	);
	await assert.rejects(
		git(w.work, "push", "--force", "origin", "HEAD:refs/heads/main"),
		/main에는 dev 커밋만/,
	);
	assert.equal(await w.main(), w.c0);
});

test("pre-push hook: force로 main을 되돌리거나 지우는 것도 막는다", async () => {
	const w = await hooked();
	await git(w.work, "push", "-q", "origin", `${w.b}:main`); // dev 커밋으로 fast-forward는 된다
	await git(w.work, "fetch", "-q", "origin");
	await assert.rejects(
		git(w.work, "push", "--force", "origin", `${w.a}:main`),
		/fast-forward가 아니다/,
	);
	await assert.rejects(
		git(w.work, "push", "origin", "--delete", "main"),
		/main을 지우지 않는다/,
	);
	assert.equal(await w.main(), w.b);
	// main 말고 다른 브랜치는 건드리지 않는다
	await git(
		w.work,
		"push",
		"-q",
		"--force",
		"origin",
		`${w.c0}:refs/heads/dev`,
	);
});

test("원격에 main이 아직 없으면(dev만 있는 저장소) 첫 /맞다가 그 dev 커밋으로 main을 만든다", async () => {
	const w = await world();
	await sh("git", ["update-ref", "-d", "refs/heads/main"], w.remote);
	const r = await promote(body(w.a), w.o, sh);
	assert.ok(r.ok);
	assert.match(r.done, /전 main 없음/);
	assert.equal(await w.main(), w.a);
});
