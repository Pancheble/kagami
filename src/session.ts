// 세션 권한은 모두 여기: 하네스 자신의 열쇠(봇 계정), claude -p 세션을 띄우는 곳(인증 없는 환경)과 역할마다 거는 CLI 플래그.
// 위험 경로다(CLAUDE.md의 Risk paths). 역할 프롬프트는 prompts/*.md
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import type { Opts, Run } from "./leaf.ts";
import { steerFile } from "./steer.ts";

const EVALUATOR = fileURLToPath(
	new URL("../.claude/agents/evaluator.md", import.meta.url),
);
const ENV = fileURLToPath(new URL("../.env", import.meta.url));

// 하네스의 열쇠: GitHub에 쓰는 것(gh, git push)은 모두 봇 계정 토큰으로 한다. 사람 계정이 단 /승인만 세려면
// 하네스와 사람이 다른 계정이어야 한다(자기 채점 금지). 토큰은 하네스 저장소 .env의 KAGAMI_BOT_TOKEN.
// 하네스 프로세스 환경(env)에만 건다: gh는 GH_TOKEN, git은 도우미 목록(키체인의 사람 자격 증명)을 비우고
// gh를 도우미로, ssh 원격(ssh 에이전트의 사람 키)은 https로. 세션에는 noKey가 이걸 다 뺀다.
// 토큰이 없거나 토큰의 계정이 login과 다르면 GitHub에 쓰기 전에 멈춘다. 돌려주는 건 소문자 계정
export async function harness(
	login: string | undefined,
	run: Run,
	env: NodeJS.ProcessEnv = process.env,
	file = ENV,
): Promise<string> {
	if (!login) throw new Error("--harness <봇 계정>이 필요하다");
	const token =
		env.KAGAMI_BOT_TOKEN ??
		(existsSync(file)
			? parseEnv(readFileSync(file, "utf8")).KAGAMI_BOT_TOKEN
			: undefined);
	if (!token)
		throw new Error(
			`KAGAMI_BOT_TOKEN이 없다: ${file}에 봇 계정(${login}) 토큰을 넣어라`,
		);
	Object.assign(env, {
		GH_TOKEN: token,
		GIT_CONFIG_COUNT: "4",
		GIT_CONFIG_KEY_0: "credential.helper",
		GIT_CONFIG_VALUE_0: "",
		GIT_CONFIG_KEY_1: "credential.helper",
		GIT_CONFIG_VALUE_1: "!gh auth git-credential",
		GIT_CONFIG_KEY_2: "url.https://github.com/.insteadOf",
		GIT_CONFIG_VALUE_2: "git@github.com:",
		GIT_CONFIG_KEY_3: "url.https://github.com/.insteadOf",
		GIT_CONFIG_VALUE_3: "ssh://git@github.com/",
	});
	const [id, who = ""] = (
		await run(
			"gh",
			["api", "user", "--jq", '"\\(.id) \\(.login)"'],
			undefined,
			env,
		)
	)
		.trim()
		.split(" ");
	if (who.toLowerCase() !== login.toLowerCase())
		throw new Error(
			`하네스 계정이 다르다: --harness ${login}인데 토큰의 계정은 ${who}`,
		);
	// 하네스가 만드는 커밋(잎 커밋, rebase)도 봇 이름으로: 8 보고서에서 AI가 바꾼 곳을 가려 본다.
	// 인증이 아니라 noKey는 이건 남긴다. 이메일은 GitHub noreply라 커밋이 봇 계정에 이어진다
	const me = `${id}+${who}@users.noreply.github.com`;
	Object.assign(env, {
		GIT_AUTHOR_NAME: who,
		GIT_AUTHOR_EMAIL: me,
		GIT_COMMITTER_NAME: who,
		GIT_COMMITTER_EMAIL: me,
	});
	return who.toLowerCase();
}

// 열쇠를 안 준다: 세션 환경에서 GitHub·git 인증을 뺀다. gh 토큰과 설정, git 자격 증명 도우미, ssh 에이전트.
// 그래서 허용된 node -e로 gh나 git push를 불러도 인증이 없어 실패한다. claude 자신의 로그인은 그대로다.
// push·PR·이슈·fetch는 하네스만 한다
export function noKey(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const k of [
		"KAGAMI_BOT_TOKEN",
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

const STEER = fileURLToPath(new URL("../hooks/steer.sh", import.meta.url));
const q = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

// 구현자: worktree에 쓰고 테스트를 돌린다. 그 잎의 방향 수정 파일(src/steer.ts)을 읽는 cwc steer hook을 건다:
// 도구를 부를 때마다 파일에 글이 있으면 그 호출을 한 번 막고 글을 보여 준다. 프로젝트 설정의 hook에 더해진다
export const implement = (o: Pick<Opts, "ctl" | "repo">, n: number) => [
	"--permission-mode",
	"acceptEdits",
	"--allowedTools",
	"Bash(npm test),Bash(npm run *),Bash(node *),Bash(git status),Bash(git diff *)",
	"--settings",
	JSON.stringify({
		hooks: {
			PreToolUse: [
				{
					matcher: "*",
					hooks: [
						{
							type: "command",
							command: `AGENT_STEER_FILE=${q(steerFile(o.ctl, o.repo, n))} bash ${q(STEER)}`,
						},
					],
				},
			],
		},
	}),
];

// 노드 세션(쪼개기·재계획)의 권한: worktree에 쓰고 테스트를 돌린다. gh는 없다. 읽을 것은 프롬프트로 준다
export const WRITE = [
	"--permission-mode",
	"acceptEdits",
	"--allowedTools",
	"Bash(node *),Bash(npm *),Bash(git status),Bash(git diff *)",
];

// 읽기 세션(평가자·8 보고서)의 권한: 쓰기 도구 없음
const READ = [
	"--tools",
	"Read,Grep,Glob,Bash",
	// ponytail: 끝 기준을 돌릴 명령만 미리 허용한다. 티켓마다 명령이 다르면 잎 티켓에 적게 한다
	"--allowedTools",
	"Bash(npm *),Bash(node *),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status),Bash(git rev-parse *)",
];

// 평가자: 매 라운드 새 세션, 쓰기 도구 없음. 구현자의 출력은 넘기지 않는다
export const evaluate = (text: string, wt: string, o: Opts, run: Run) =>
	session(
		o,
		["-p", text, "--append-system-prompt-file", EVALUATOR, ...READ],
		wt,
		run,
	);

// 8 보고서: 평가자와 같은 권한으로 dev에서 뿌리 성공 기준을 돌린다. 티켓 diff 판정이 아니라 역할은 프롬프트(prompts/report.md)로만
export const report = (text: string, wt: string, o: Opts, run: Run) =>
	session(o, ["-p", text, ...READ], wt, run);
