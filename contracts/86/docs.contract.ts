// #86 잎 T2(docs 정리)와 Z(옛 경로 지우기)의 약속: docs/ 이름은 영어 소문자-하이픈, ADR은 번호 파일, 설계 문서 이름이 바뀌어도 옛 경로는 병렬 변경으로 지운다
// 1단계(T2): 새 docs/ + 옛 경로 docs/harness/가운데 설계.md는 새 문서를 가리키는 영어 포인터로 남긴다(contracts/51/plugin.accept.ts가 읽는다)
// 2단계(Z): plugin.accept.ts와 남은 참조를 새 경로로 옮기고(사람 승인) docs/harness/를 지운다
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const walk = (p: string): string[] =>
	statSync(join(ROOT, p)).isDirectory()
		? readdirSync(join(ROOT, p)).flatMap((e) => walk(join(p, e)))
		: [p];
const OLD = "docs/harness/가운데 설계.md";
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+)?$/;
const docLinks = (md: string) =>
	[...md.matchAll(/docs\/[\w./-]+\.md/g)].map((m) => m[0]);

test("T2: docs/ 아래 파일·폴더 이름이 영어 소문자-하이픈이다 (옛 경로 포인터 하나만 예외)", () => {
	const bad = walk("docs")
		.filter((f) => f !== OLD)
		.flatMap((f) => f.split("/").slice(1))
		.filter((seg) => !seg.startsWith(".") && !NAME.test(seg)); // .DS_Store 같은 로컬 파일은 뺀다
	assert.deepEqual([...new Set(bad)], []);
});

test("T2: ADR이 docs/adr/NNNN-<name>.md 번호 파일로 0001부터 빈 번호 없이 있다", () => {
	assert.ok(existsSync(join(ROOT, "docs/adr")), "docs/adr/ 없음");
	const nums = readdirSync(join(ROOT, "docs/adr"))
		.map((f) => f.match(/^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/)?.[1])
		.filter((n) => n !== undefined)
		.map(Number)
		.sort((a, b) => a - b);
	assert.ok(nums.length, "번호 ADR 없음");
	assert.deepEqual(
		nums,
		nums.map((_, i) => i + 1),
	);
});

test("T2: 옛 경로가 남아 있으면 영어 포인터이고, 가리키는 docs/ 문서가 있다", () => {
	if (!existsSync(join(ROOT, OLD))) return; // Z 뒤
	const md = read(OLD);
	assert.ok(!/[가-힣]/.test(md), "포인터에 한글");
	const to = docLinks(md).filter((l) => !l.startsWith("docs/harness/"));
	assert.ok(to.length && to.every((l) => existsSync(join(ROOT, l))), md);
});

test("T2: CLAUDE.md가 가리키는 설계 문서가 docs/에 있고 docs/harness/가 아니다", () => {
	const links = docLinks(read("CLAUDE.md"));
	assert.ok(links.length, "CLAUDE.md에 docs/ 링크 없음");
	for (const l of links) {
		assert.ok(!l.startsWith("docs/harness/"), l);
		assert.ok(existsSync(join(ROOT, l)), l);
	}
});

test("Z: docs/harness/가 없고, 아무 파일도 docs/harness를 가리키지 않는다", () => {
	assert.equal(existsSync(join(ROOT, "docs/harness")), false);
	const hits = [
		"src",
		"skills",
		"agents",
		"contracts/51",
		"AGENTS.md",
		"CONTRIBUTING.md",
		"CLAUDE.md",
	]
		.flatMap(walk)
		.filter((f) => read(f).includes("docs/harness"));
	assert.deepEqual(hits, []);
});
