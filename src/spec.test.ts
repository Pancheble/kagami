import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { check, ITEMS_EN, readRoot } from "./spec.ts";

const FULL = `## 기획 문서

docs/plan.md

## 성공 기준

- 가입한 이메일로 로그인하면 대시보드가 뜬다 (확인: 시드 계정으로 로그인해 /dashboard 제목을 본다)
- 틀린 비밀번호면 에러가 뜬다 (확인: 시드 계정에 틀린 비밀번호로 로그인)

## 위험 경로

CLAUDE.md 참고

## 평가자 준비물

시드 계정 test@example.com

## 스택과 ADR

TypeScript. 이유: 팀이 쓴다. 버린 대안: Python

## 안 할 것

없음
`;

test("a fully filled root has nothing missing", () => {
	assert.deepEqual(check(FULL), []);
});

test("an empty root template reports every item as missing", () => {
	const template = readFileSync(
		new URL("../.github/ISSUE_TEMPLATE/root.md", import.meta.url),
		"utf8",
	);
	assert.deepEqual(
		check(template).map((m) => m.split(":")[0]),
		ITEMS_EN,
	);
});

test("a field that is absent or holds only a comment is missing", () => {
	const body = FULL.replace("## 안 할 것\n\n없음\n", "").replace(
		"시드 계정 test@example.com",
		"<!-- 테스트 계정, 시드 데이터 -->",
	);
	assert.deepEqual(check(body), [
		"Evaluator setup: empty",
		"Out of scope: missing",
	]);
});

test("None counts as an answer the human decided", () => {
	assert.deepEqual(
		check(FULL.replace("시드 계정 test@example.com", "없음")),
		[],
	);
});

test("Risk paths: See CLAUDE.md passes", () => {
	assert.ok(FULL.includes("## 위험 경로\n\nCLAUDE.md 참고\n"));
	assert.deepEqual(check(FULL), []);
});

test("a path list or None under Risk paths points to CLAUDE.md", () => {
	for (const text of ["`src/auth/`", "없음"])
		assert.deepEqual(check(FULL.replace("CLAUDE.md 참고", text)), [
			'Risk paths: the source of truth is Risk paths in CLAUDE.md. Write only "See CLAUDE.md" here',
		]);
});

test("reports each success criterion with no check method", () => {
	const body = FULL.replace(
		" (확인: 시드 계정에 틀린 비밀번호로 로그인)",
		"",
	).replace("- 가입한", "  - an added note is not a criterion\n- 가입한");
	assert.deepEqual(check(body), [
		'Success criteria 2 "틀린 비밀번호면 에러가 뜬다": no check method',
	]);
});

test("Success criteria with no list is missing", () => {
	const body = FULL.replace(/- 가입한[^\n]*\n- 틀린[^\n]*\n/, "login works\n");
	assert.deepEqual(check(body), [
		"Success criteria: no list (- <criterion> (check: <how>))",
	]);
});

test("reads the root issue body with the harness account", async () => {
	const calls: string[] = [];
	const body = await readRoot("o/app", 7, async (cmd, args) => {
		calls.push([cmd, ...args].join(" "));
		return "body\n";
	});
	assert.equal(body, "body");
	assert.deepEqual(calls, ["gh issue view 7 -R o/app --json body --jq .body"]);
});
