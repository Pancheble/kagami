// #86 잎 G의 약속: 저장소 .github 정리와 제3자 고지. PR 템플릿은 AGENTS.md "PR TL;DR 형식", mattpocock/skills 라이선스는 루트 THIRD_PARTY_NOTICES로
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const has = (f: string) => existsSync(join(ROOT, f));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const walk = (p: string): string[] =>
	statSync(join(ROOT, p)).isDirectory()
		? readdirSync(join(ROOT, p)).flatMap((e) => walk(join(p, e)))
		: [p];

test("PR 템플릿: TL;DR 칸 Where·What·Changed·Decided가 있고 영어다", () => {
	assert.ok(has(".github/PULL_REQUEST_TEMPLATE.md"), "PR 템플릿 없음");
	const md = read(".github/PULL_REQUEST_TEMPLATE.md");
	for (const k of ["Where:", "What:", "Changed:", "Decided:"])
		assert.ok(md.includes(k), k);
	assert.ok(!/[가-힣]/.test(md), "한글");
});

test("이슈 템플릿 설정 .github/ISSUE_TEMPLATE/config.yml에 blank_issues_enabled가 있다", () => {
	assert.ok(has(".github/ISSUE_TEMPLATE/config.yml"), "config.yml 없음");
	assert.match(
		read(".github/ISSUE_TEMPLATE/config.yml"),
		/^blank_issues_enabled: (true|false)$/m,
	);
});

test("THIRD_PARTY_NOTICES: mattpocock/skills의 MIT 전문이 루트에 있고, 옛 skills/LICENSE-mattpocock과 그 참조가 없다", () => {
	assert.ok(has("THIRD_PARTY_NOTICES"), "THIRD_PARTY_NOTICES 없음");
	const n = read("THIRD_PARTY_NOTICES");
	for (const k of [
		"github.com/mattpocock/skills",
		"MIT License",
		"Copyright (c) 2026 Matt Pocock",
	])
		assert.ok(n.includes(k), k);
	assert.equal(has("skills/LICENSE-mattpocock"), false);
	const refs = [
		"skills",
		"agents",
		"src",
		"AGENTS.md",
		"CONTRIBUTING.md",
		"CLAUDE.md",
	]
		.flatMap(walk)
		.filter((f) => read(f).includes("LICENSE-mattpocock"));
	assert.deepEqual(refs, []);
});
