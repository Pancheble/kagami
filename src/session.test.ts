import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type Run, sh } from "./leaf.ts";
import { harness, noKey } from "./session.ts";

const NONE = join(tmpdir(), "kagami-no-env-file");
// gh api user가 이 계정을 돌려준다. 부른 명령을 적는다
const gh = (login: string) => {
	const calls: string[] = [];
	const run: Run = async (cmd, args) => {
		calls.push([cmd, ...args].join(" "));
		return `${login}\n`;
	};
	return { calls, run };
};

test("토큰이 없으면 GitHub에 묻기 전에 시작을 거부한다", async () => {
	const { calls, run } = gh("pancheble-bot");
	await assert.rejects(
		harness("pancheble-bot", run, {}, NONE),
		/KAGAMI_BOT_TOKEN/,
	);
	assert.deepEqual(calls, []);
});

test("--harness가 없으면 시작을 거부한다", async () => {
	const { calls, run } = gh("pancheble-bot");
	await assert.rejects(
		harness(undefined, run, { KAGAMI_BOT_TOKEN: "t" }, NONE),
		/--harness/,
	);
	assert.deepEqual(calls, []);
});

test("토큰의 계정이 --harness와 다르면 쓰기 전에 멈춘다", async () => {
	const { calls, run } = gh("Pancheble");
	await assert.rejects(
		harness("pancheble-bot", run, { KAGAMI_BOT_TOKEN: "t" }, NONE),
		/pancheble-bot.*Pancheble/,
	);
	assert.deepEqual(calls, ["gh api user --jq .login"]);
});

test("맞으면 소문자 계정을 돌려주고, 하네스 환경의 gh와 git이 봇 토큰을 쓴다", async () => {
	const { run } = gh("Pancheble-bot");
	const env: NodeJS.ProcessEnv = { KAGAMI_BOT_TOKEN: "봇토큰" };
	assert.equal(await harness("Pancheble-bot", run, env, NONE), "pancheble-bot");
	assert.equal(env.GH_TOKEN, "봇토큰");
});

test("토큰은 하네스 저장소의 .env에서 읽는다", async () => {
	const file = join(mkdtempSync(join(tmpdir(), "env-")), ".env");
	writeFileSync(file, "KAGAMI_BOT_TOKEN=파일토큰\n");
	const env: NodeJS.ProcessEnv = {};
	await harness("pancheble-bot", gh("pancheble-bot").run, env, file);
	assert.equal(env.GH_TOKEN, "파일토큰");
});

// git이 실제로 무엇을 쓰는지: 키체인(사람 계정) 대신 봇 토큰, ssh 원격도 https로
test("하네스의 git push는 사람 자격 증명이 아니라 봇 토큰으로 간다", async () => {
	const env: NodeJS.ProcessEnv = {
		...process.env,
		KAGAMI_BOT_TOKEN: "봇-토큰-123",
	};
	await harness("pancheble-bot", gh("pancheble-bot").run, env, NONE);
	const fill = await new Promise<string>((ok, no) => {
		const p = execFile(
			"git",
			["credential", "fill"],
			{ env: { ...env, GIT_TERMINAL_PROMPT: "0" } },
			(e, out) => (e ? no(e) : ok(out)),
		);
		p.stdin?.end("protocol=https\nhost=github.com\n\n");
	});
	assert.match(fill, /^password=봇-토큰-123$/m);
	const url = await sh(
		"git",
		["ls-remote", "--get-url", "git@github.com:o/r.git"],
		undefined,
		env,
	);
	assert.equal(url.trim(), "https://github.com/o/r.git");
});

test("세션 환경에는 봇 토큰과 하네스의 git 자격 증명 설정이 넘어가지 않는다", async () => {
	const saved = { ...process.env };
	try {
		process.env.KAGAMI_BOT_TOKEN = "봇토큰";
		await harness("pancheble-bot", gh("pancheble-bot").run, process.env, NONE);
		const env = noKey();
		assert.equal(env.KAGAMI_BOT_TOKEN, undefined);
		assert.equal(env.GH_TOKEN, undefined);
		assert.equal(env.GIT_CONFIG_COUNT, "1");
		assert.equal(env.GIT_CONFIG_VALUE_0, "");
		assert.ok(!Object.values(env).includes("봇토큰"));
	} finally {
		for (const k of Object.keys(process.env))
			if (!(k in saved)) delete process.env[k];
		Object.assign(process.env, saved);
	}
});
