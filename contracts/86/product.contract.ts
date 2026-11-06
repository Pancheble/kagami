// #86 잎 X의 약속: "전부 수락" 실험은 제품에 없다. 실험 계획은 뿌리 #49 "정한 것 7"에만 있고, 실험할 때 기록은 손으로 단다
// 제품 = 플러그인이 싣거나 init이 대상 저장소에 까는 본문
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { plan } from "../../src/init.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const walk = (p: string): string[] =>
	statSync(join(ROOT, p)).isDirectory()
		? readdirSync(join(ROOT, p)).flatMap((e) => walk(join(p, e)))
		: [p];
const GONE = /not-what-i-wanted|accept-all|전부 수락/i;

test("제품 본문에 not-what-i-wanted·accept-all·전부 수락이 없다", () => {
	const files: [string, string][] = [
		...["AGENTS.md", "CONTRIBUTING.md", "skills", "agents"]
			.flatMap(walk)
			.map((f): [string, string] => [f, readFileSync(join(ROOT, f), "utf8")]),
		...Object.entries(plan(ROOT, { repo: "Pancheble/kagami" }).files).map(
			([f, body]): [string, string] => [`init:${f}`, body],
		),
	];
	const hits = files.flatMap(([f, body]) =>
		body
			.split("\n")
			.filter((l) => GONE.test(l))
			.map((l) => `${f}: ${l.slice(0, 80)}`),
	);
	assert.deepEqual(hits, []);
});
