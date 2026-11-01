// T10 정지 파일: 있으면 하네스가 새 일을 시작하지 않는다(한 번 돌기의 단계마다, loop의 다음 돌기). 돌고 있는 일은 끝낸다.
// 바로 끊으려면 프로세스를 죽인다. 그 시도는 claim이 만료되면 끊긴 시도와 같은 길(막힘 1)로 간다.
// 파일은 하네스 체크아웃의 .kagami/STOP. 그 체크아웃으로 도는 프로세스에만 닿는다(다른 기계는 그 기계에서 stop)
// 실행: node src/stop.ts (정지) · node src/stop.ts --off (풀기)
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// 정지·방향 수정 파일 폴더
export const CTL = fileURLToPath(new URL("../.kagami/", import.meta.url));

const file = (ctl: string) => join(ctl, "STOP");
export const stopped = (ctl: string) => existsSync(file(ctl));

export function stop(ctl: string, on: boolean) {
	if (!on) return rmSync(file(ctl), { force: true });
	mkdirSync(ctl, { recursive: true });
	writeFileSync(file(ctl), `${new Date().toISOString()}\n`);
}

if (import.meta.main) {
	const { values } = parseArgs({ options: { off: { type: "boolean" } } });
	stop(CTL, !values.off);
	console.log(
		values.off
			? `정지를 풀었다: ${file(CTL)}`
			: `정지: ${file(CTL)}. 돌고 있는 일은 끝내고 새 일은 시작하지 않는다`,
	);
}
