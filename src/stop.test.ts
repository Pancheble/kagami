import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { implement } from "./session.ts";
import { steer, steerFile } from "./steer.ts";
import { stop, stopped } from "./stop.ts";

const ctl = () => mkdtempSync(join(tmpdir(), "ctl-"));

test("stop은 정지 파일을 만들고, --off는 지운다", () => {
	const d = ctl();
	assert.equal(stopped(d), false);
	stop(d, true);
	assert.equal(stopped(d), true);
	stop(d, true); // 이미 있어도 된다
	stop(d, false);
	assert.equal(stopped(d), false);
	stop(d, false); // 이미 없어도 된다
});

test("steer는 저장소·이슈마다 방향 수정 파일에 덧붙인다", () => {
	const d = ctl();
	steer(d, "o/r", 7, "hello.txt에 줄 하나 더");
	steer(d, "o/r", 7, "테스트도 같이");
	assert.equal(
		readFileSync(steerFile(d, "o/r", 7), "utf8"),
		"hello.txt에 줄 하나 더\n테스트도 같이\n",
	);
	assert.equal(existsSync(steerFile(d, "o/r", 8)), false);
	assert.equal(existsSync(steerFile(d, "o/x", 7)), false);
});

// 구현 세션의 --settings에 걸리는 hook 명령을 그대로 셸로 돌린다(claude가 PreToolUse마다 하는 일)
const fire = (args: string[]) => {
	const s = JSON.parse(args[args.indexOf("--settings") + 1]);
	const { command } = s.hooks.PreToolUse[0].hooks[0];
	return spawnSync("sh", ["-c", command], { encoding: "utf8" }).stdout;
};

test("방향 수정 hook: 파일에 글이 있으면 한 번 막고 그 글을 세션에 보여 준 뒤 비운다. 비었으면 아무것도 안 한다", () => {
	const d = ctl();
	const args = implement({ ctl: d, repo: "o/r" }, 7);
	assert.equal(fire(args), "");
	steer(d, "o/r", 7, "이름을 greet로 바꿔");
	const out = JSON.parse(fire(args));
	assert.equal(out.decision, "block");
	assert.match(out.reason, /OPERATOR STEERING: 이름을 greet로 바꿔/);
	assert.equal(readFileSync(steerFile(d, "o/r", 7), "utf8"), "");
	assert.equal(fire(args), "");
});

test("구현 세션 플래그는 session.ts 한 곳에서: 권한 플래그 그대로에 그 잎의 방향 수정 hook만 더한다", () => {
	const d = ctl();
	const args = implement({ ctl: d, repo: "o/r" }, 7);
	assert.deepEqual(args.slice(0, 4), [
		"--permission-mode",
		"acceptEdits",
		"--allowedTools",
		"Bash(npm test),Bash(npm run *),Bash(node *),Bash(git status),Bash(git diff *)",
	]);
	assert.equal(args[4], "--settings");
	assert.ok(args[5].includes(steerFile(d, "o/r", 7)));
	assert.equal(args.length, 6);
});
