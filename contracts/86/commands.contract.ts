// #86 잎 A의 약속: 평가자와 /kagami:build가 npm 명령을 가정하지 않고 대상 저장소 CLAUDE.md "Commands"의 검사 명령을 쓴다. init이 까는 CLAUDE.md에 Commands 자리가 있다 (Pancheble/kagami-try#3)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { plan } from "../../src/init.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const FILES = ["agents/evaluator.md", "skills/build/SKILL.md"];

test("평가자와 build 본문에 npm·npx 명령이 없다", () => {
	for (const f of FILES) {
		const hits = read(f).match(/\bnp[mx] [a-z]+(?: [a-z]+)?/g);
		assert.equal(hits, null, `${f}: ${hits}`);
	}
});

test("평가자와 build가 대상 저장소 CLAUDE.md의 Commands를 가리킨다", () => {
	for (const f of FILES) {
		const md = read(f);
		assert.ok(md.includes("CLAUDE.md") && md.includes("Commands"), f);
	}
});

test("init이 까는 CLAUDE.md에 # Commands 절이 있다", () => {
	const md = plan(ROOT, { repo: "Pancheble/kagami" }).files["CLAUDE.md"];
	assert.match(md, /^# Commands$/m);
});
