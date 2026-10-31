// 세션 권한은 모두 여기: claude -p 세션을 띄우는 곳(인증 없는 환경)과 역할마다 거는 CLI 플래그.
// 위험 경로다(CLAUDE.md의 Risk paths). 역할 프롬프트는 prompts/*.md
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Opts, Run } from "./leaf.ts";

const EVALUATOR = fileURLToPath(
	new URL("../.claude/agents/evaluator.md", import.meta.url),
);

// 열쇠를 안 준다: 세션 환경에서 GitHub·git 인증을 뺀다. gh 토큰과 설정, git 자격 증명 도우미, ssh 에이전트.
// 그래서 허용된 node -e로 gh나 git push를 불러도 인증이 없어 실패한다. claude 자신의 로그인은 그대로다.
// push·PR·이슈·fetch는 하네스만 한다
export function noKey(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const k of [
		"GH_TOKEN",
		"GITHUB_TOKEN",
		"GH_ENTERPRISE_TOKEN",
		"GITHUB_ENTERPRISE_TOKEN",
		"SSH_AUTH_SOCK",
	])
		delete env[k];
	return Object.assign(env, {
		GH_CONFIG_DIR: mkdtempSync(join(tmpdir(), "nokey-")), // 빈 폴더: gh가 로그인을 못 찾는다
		GIT_TERMINAL_PROMPT: "0",
		GIT_SSH_COMMAND: "false",
		// 명령줄 설정으로 credential.helper를 빈 값으로: 앞서 읽은 도우미 목록(키체인 등)을 비운다
		GIT_CONFIG_COUNT: "1",
		GIT_CONFIG_KEY_0: "credential.helper",
		GIT_CONFIG_VALUE_0: "",
	});
}

// claude -p 세션은 모두 여기서 띄운다(구현자·평가자·쪼개기·재계획). 권한은 args의 플래그로 건다
export const session = (o: Opts, args: string[], cwd: string, run: Run) =>
	run(o.claude, args, cwd, noKey());

// 구현자: worktree에 쓰고 테스트를 돌린다
export const IMPLEMENT = [
	"--permission-mode",
	"acceptEdits",
	"--allowedTools",
	"Bash(npm test),Bash(npm run *),Bash(node *),Bash(git status),Bash(git diff *)",
];

// 노드 세션(쪼개기·재계획)의 권한: worktree에 쓰고 테스트를 돌린다. gh는 없다. 읽을 것은 프롬프트로 준다
export const WRITE = [
	"--permission-mode",
	"acceptEdits",
	"--allowedTools",
	"Bash(node *),Bash(npm *),Bash(git status),Bash(git diff *)",
];

// 평가자: 매 라운드 새 세션, 쓰기 도구 없음. 구현자의 출력은 넘기지 않는다
export const evaluate = (text: string, wt: string, o: Opts, run: Run) =>
	session(
		o,
		[
			"-p",
			text,
			"--append-system-prompt-file",
			EVALUATOR,
			"--tools",
			"Read,Grep,Glob,Bash",
			// ponytail: 끝 기준을 돌릴 명령만 미리 허용한다. 티켓마다 명령이 다르면 잎 티켓에 적게 한다
			"--allowedTools",
			"Bash(npm *),Bash(node *),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status),Bash(git rev-parse *)",
		],
		wt,
		run,
	);
