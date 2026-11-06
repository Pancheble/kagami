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

test("다 채운 뿌리는 빠진 게 없다", () => {
	assert.deepEqual(check(FULL), []);
});

test("빈 뿌리 템플릿은 항목마다 빠졌다고 알린다", () => {
	const template = readFileSync(
		new URL("../.github/ISSUE_TEMPLATE/root.md", import.meta.url),
		"utf8",
	);
	assert.deepEqual(
		check(template).map((m) => m.split(":")[0]),
		ITEMS_EN,
	);
});

test("칸이 없거나 주석만 있으면 빠졌다", () => {
	const body = FULL.replace("## 안 할 것\n\n없음\n", "").replace(
		"시드 계정 test@example.com",
		"<!-- 테스트 계정, 시드 데이터 -->",
	);
	assert.deepEqual(check(body), [
		"평가자 준비물: 비었다",
		"안 할 것: 칸이 없다",
	]);
});

test("없음은 사람이 정한 답으로 센다", () => {
	assert.deepEqual(
		check(FULL.replace("시드 계정 test@example.com", "없음")),
		[],
	);
});

test("위험 경로: CLAUDE.md 참고는 통과한다", () => {
	assert.ok(FULL.includes("## 위험 경로\n\nCLAUDE.md 참고\n"));
	assert.deepEqual(check(FULL), []);
});

test("위험 경로에 경로 목록이나 없음을 적으면 CLAUDE.md로 보낸다", () => {
	for (const text of ["`src/auth/`", "없음"])
		assert.deepEqual(check(FULL.replace("CLAUDE.md 참고", text)), [
			'위험 경로: 정본은 CLAUDE.md의 Risk paths다. 여기엔 "CLAUDE.md 참고"만 적는다',
		]);
});

test("확인 방법이 없는 성공 기준을 하나씩 알린다", () => {
	const body = FULL.replace(
		" (확인: 시드 계정에 틀린 비밀번호로 로그인)",
		"",
	).replace("- 가입한", "  - 덧붙인 설명은 기준이 아니다\n- 가입한");
	assert.deepEqual(check(body), [
		'성공 기준 2 "틀린 비밀번호면 에러가 뜬다": 확인 방법이 없다',
	]);
});

test("성공 기준에 목록이 없으면 빠졌다", () => {
	const body = FULL.replace(
		/- 가입한[^\n]*\n- 틀린[^\n]*\n/,
		"로그인이 잘 된다\n",
	);
	assert.deepEqual(check(body), [
		"성공 기준: 목록(- 기준 (확인: 방법))이 없다",
	]);
});

test("뿌리 이슈 본문은 하네스 계정으로 읽는다", async () => {
	const calls: string[] = [];
	const body = await readRoot("o/app", 7, async (cmd, args) => {
		calls.push([cmd, ...args].join(" "));
		return "본문\n";
	});
	assert.equal(body, "본문");
	assert.deepEqual(calls, ["gh issue view 7 -R o/app --json body --jq .body"]);
});
