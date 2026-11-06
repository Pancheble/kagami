// guard·tree·spec·changed가 함께 쓰는 것: 명령 실행(Run, sh), 작은 도우미(quiet),
// 대상 저장소의 코드를 인증 없이 돌리기(noKey), CLI 숫자 인자(num)
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
export const quiet = (p: Promise<unknown>) => p.catch(() => {});

const exec = promisify(execFile);
export const sh: Run = async (cmd, args, cwd, env) => {
	try {
		const p = exec(cmd, args, { cwd, env, maxBuffer: 64 << 20 });
		p.child.stdin?.end(); // stdin을 기다리는 명령이 멈추지 않게
		return (await p).stdout;
	} catch (e) {
		const { stdout = "", stderr = "" } = e as {
			stdout?: string;
			stderr?: string;
		};
		throw new Error(`${cmd} ${args[0]} failed\n${stderr}${stdout}`);
	}
};

// 열쇠를 안 준다: GitHub·git 인증을 뺀 환경. gh 토큰과 설정, git 자격 증명 도우미, ssh 에이전트.
// 가드가 대상 저장소의 의존성을 깔고 테스트를 돌릴 때(install·results) 쓴다. 그 코드가 gh나 git push를 불러도 실패한다
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
		throw new Error(`${flag} must be an integer >= ${min}: "${v}"`);
	return Number(v);
}
