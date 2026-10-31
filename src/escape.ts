// T9 escapes(9 빈틈): 머지 뒤에 발견한 문제를 하네스 저장소에 escape 이슈로 한 줄씩 남긴다.
// 아직 안 일어난 문제는 미리 막지 않고 여기 적는다. 같은 종류가 3번 쌓이면 그때 장치를 넣는다.
// 파일이 아니라 이슈로 둔다: 여러 사람·기계가 동시에 적어도 부딪히지 않고, 종류별 횟수는 라벨로 센다.
// 실행: node src/escape.ts --harness <봇 계정> --repo <하네스 저장소> --kind <종류> [--from <어디서>] "<한 줄>"
import { parseArgs } from "node:util";
import { firstLine, quiet, type Run, sh } from "./leaf.ts";
import { harness } from "./session.ts";

export const SAME = 3; // 같은 종류가 이만큼이면 장치를 넣을 차례

export async function record(
	o: { repo: string; kind: string; text: string; from?: string },
	run: Run,
): Promise<{ issue: number; same: number[] }> {
	const label = `escape:${o.kind}`;
	for (const l of ["escape", label])
		await quiet(run("gh", ["label", "create", l, "-R", o.repo]));
	const { number }: { number: number } = JSON.parse(
		await run("gh", [
			"api",
			`repos/${o.repo}/issues`,
			"-X",
			"POST",
			"-f",
			`title=escape: ${firstLine(o.text)}`,
			"-f",
			`body=${o.text}\n\n- 종류: ${o.kind}\n- 어디서: ${o.from ?? "없음"}\n`,
			"-f",
			"labels[]=escape",
			"-f",
			`labels[]=${label}`,
		]),
	);
	const same = (
		JSON.parse(
			await run("gh", [
				"issue",
				"list",
				"-R",
				o.repo,
				"--label",
				label,
				"--state",
				"all",
				"--json",
				"number",
				"--limit",
				"1000",
			]),
		) as { number: number }[]
	)
		.map((i) => i.number)
		.sort((a, b) => a - b);
	if (same.length >= SAME)
		await run("gh", [
			"issue",
			"comment",
			String(number),
			"-R",
			o.repo,
			"--body",
			`같은 종류(${o.kind})가 ${same.length}번 쌓였다: ${same.map((k) => `#${k}`).join(", ")}. 장치를 넣을 차례다 (9 빈틈: 옛 하네스와 새 하네스로 막힌 티켓을 돌려 비교한다)`,
		]);
	return { issue: number, same };
}

if (import.meta.main) {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			repo: { type: "string" },
			kind: { type: "string" },
			from: { type: "string" },
			harness: { type: "string" },
		},
	});
	const text = positionals.join(" ").trim();
	if (!values.repo || !values.kind || !text)
		throw new Error('--repo, --kind와 "<한 줄>"이 필요하다');
	await harness(values.harness, sh);
	const r = await record(
		{ repo: values.repo, kind: values.kind, text, from: values.from },
		sh,
	);
	console.log(JSON.stringify(r));
}
