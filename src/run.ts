// 남는 파일(guard·tree·spec·pick 등)이 함께 쓰는 것: 명령 실행(Run, sh), 하네스 옵션 타입(Opts), 작은 도우미,
// 세션 환경에서 인증 빼기(noKey), CLI 숫자 인자(num). 자율 루프 파일에 기대지 않으려고 여기 둔다
import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export type Run = (
	cmd: string,
	args: string[],
	cwd?: string,
	env?: NodeJS.ProcessEnv, // 없으면 하네스 환경 그대로
) => Promise<string>;
export type Opts = {
	repo: string;
	dir: string;
	claude: string;
	workers: number;
	root: number; // 뿌리 이슈
	focus: number; // 집중 노드
	dial: number; // 범위 다이얼
	account: string; // 하네스 계정(봇, 소문자). claim에 적고, /승인에서 뺀다
	ttl: number; // 시간. 이보다 오래된 claim은 시도가 끊긴 것으로 본다
	poll?: number; // ms. 위험 경로 대기에서 /승인을 다시 볼 간격(기본 1분)
	ctl: string; // 정지·방향 수정 파일 폴더
};

export const quiet = (p: Promise<unknown>) => p.catch(() => {});
export const firstLine = (s: string) => s.split("\n")[0];

const exec = promisify(execFile);
export const sh: Run = async (cmd, args, cwd, env) => {
	try {
		const p = exec(cmd, args, { cwd, env, maxBuffer: 64 << 20 });
		p.child.stdin?.end(); // claude -p는 stdin이 열려 있으면 3초 기다린다
		return (await p).stdout;
	} catch (e) {
		const { stdout = "", stderr = "" } = e as {
			stdout?: string;
			stderr?: string;
		};
		throw new Error(`${cmd} ${args[0]} 실패\n${stderr}${stdout}`);
	}
};

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

// CLI 숫자 인자. min 이상 정수만
export function num(flag: string, v: string, min: number): number {
	if (!/^\d+$/.test(v) || Number(v) < min)
		throw new Error(`${flag}는 ${min} 이상의 정수여야 한다: "${v}"`);
	return Number(v);
}
