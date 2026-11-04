// T12 명세 점검(1 뿌리 명세): 기획 대화가 끝날 때 뿌리 이슈에 하네스 형식의 칸이 다 있는지 센다.
// 세기만 한다: 칸을 채우거나 내용이 맞는지 보지 않는다(내용은 8에서 사람이 본다). 빠지면 기획 대화로 돌아간다.
// 칸은 .github/ISSUE_TEMPLATE/root.md의 ## 제목. "없음"은 사람이 정한 답으로 센다. 성공 기준은 목록 한 줄마다
// "(확인: <방법>)"이 있어야 한다(8에서 평가자가 돌려볼 수 있게)
// 실행: node src/spec.ts --harness <봇 계정> --repo <대상 저장소> --root <뿌리>. 빠진 게 있으면 종료 코드 1
import { parseArgs } from "node:util";
import { num, type Run, sh } from "./run.ts";
import { harness } from "./session.ts";

export const ITEMS = [
	"기획 문서",
	"성공 기준",
	"위험 경로",
	"평가자 준비물",
	"스택과 ADR",
	"안 할 것",
];

// ## 제목마다 내용(HTML 주석은 뺀다)
function sections(body: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const part of body
		.replace(/<!--[\s\S]*?-->/g, "")
		.split(/^## /m)
		.slice(1)) {
		const [head, ...rest] = part.split("\n");
		out.set(head.trim(), rest.join("\n").trimEnd()); // 앞 들여쓰기는 남긴다: 하위 목록은 기준이 아니다
	}
	return out;
}

// 빠진 항목마다 한 줄. 비면 다 있다
export function check(body: string): string[] {
	const s = sections(body);
	const missing: string[] = [];
	for (const item of ITEMS) {
		const text = s.get(item);
		if (text === undefined) missing.push(`${item}: 칸이 없다`);
		else if (!text) missing.push(`${item}: 비었다`);
	}
	const goals = (s.get("성공 기준") ?? "")
		.split("\n")
		.map((l) => l.match(/^(?:[-*]|\d+\.)\s+(.*)/)?.[1])
		.filter((l) => l !== undefined);
	if (s.get("성공 기준") && !goals.length)
		missing.push("성공 기준: 목록(- 기준 (확인: 방법))이 없다");
	goals.forEach((g, i) => {
		if (!g.includes("확인:"))
			missing.push(`성공 기준 ${i + 1} "${g}": 확인 방법이 없다`);
	});
	return missing;
}

export const readRoot = async (repo: string, root: number, run: Run) =>
	(
		await run("gh", [
			"issue",
			"view",
			String(root),
			"-R",
			repo,
			"--json",
			"body",
			"--jq",
			".body",
		])
	).trimEnd();

if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			repo: { type: "string" },
			root: { type: "string" },
			harness: { type: "string" },
		},
	});
	if (!values.repo || !values.root)
		throw new Error("--repo와 --root가 필요하다");
	const root = num("--root", values.root, 1);
	await harness(values.harness, sh);
	const missing = check(await readRoot(values.repo, root, sh));
	if (!missing.length) console.log(`명세 점검 #${root}: 다 있다`);
	else {
		console.log(
			`명세 점검 #${root}: 빠진 항목이 있다. 기획 대화로 돌아간다\n${missing.map((m) => `- ${m}`).join("\n")}`,
		);
		process.exitCode = 1;
	}
}
