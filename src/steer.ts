// T10 방향 수정 파일: 사람이 잎에 남긴 말을 그 잎의 구현 세션에 끼워 넣는다.
// 구현 세션에 cwc의 steer hook(hooks/steer.sh)을 건다: 도구를 부를 때마다 파일을 보고, 글이 있으면 그 호출을 한 번 막고
// 글을 세션에 보여 준 뒤 비운다. 파일은 저장소·잎마다 하나라 일꾼이 여럿이어도 제 잎의 말만 받는다.
// 도는 세션이 없으면 그 잎의 다음 구현 세션이 받는다. 파일은 하네스 체크아웃의 .kagami/steer/<owner>/<name>/<잎>.md
// 실행: node src/steer.ts --repo owner/name --issue <잎> "<말>"
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { num } from "./pick.ts";
import { CTL } from "./stop.ts";

const HOOK = fileURLToPath(new URL("../hooks/steer.sh", import.meta.url));

export const steerFile = (ctl: string, repo: string, n: number) =>
	join(ctl, "steer", repo, `${n}.md`);

export function steer(ctl: string, repo: string, n: number, text: string) {
	const f = steerFile(ctl, repo, n);
	mkdirSync(dirname(f), { recursive: true });
	appendFileSync(f, `${text.trim()}\n`); // 덧붙이기: 둘이 따로 남겨도 하나가 사라지지 않는다
}

const q = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;
// 구현 세션에 붙이는 플래그. 프로젝트 설정의 hook에 더해진다
export const steerHook = (ctl: string, repo: string, n: number) => [
	"--settings",
	JSON.stringify({
		hooks: {
			PreToolUse: [
				{
					matcher: "*",
					hooks: [
						{
							type: "command",
							command: `AGENT_STEER_FILE=${q(steerFile(ctl, repo, n))} bash ${q(HOOK)}`,
						},
					],
				},
			],
		},
	}),
];

if (import.meta.main) {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: { repo: { type: "string" }, issue: { type: "string" } },
	});
	const text = positionals.join(" ").trim();
	if (!values.repo || !values.issue || !text)
		throw new Error('--repo owner/name --issue <잎> "<말>"이 필요하다');
	const n = num("--issue", values.issue, 1);
	steer(CTL, values.repo, n, text);
	console.log(
		`방향 수정: ${steerFile(CTL, values.repo, n)}. #${n}의 구현 세션이 다음 도구 호출에서 받는다`,
	);
}
