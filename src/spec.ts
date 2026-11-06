// T12 명세 점검: 기획 대화(/kagami:plan)가 끝날 때 뿌리 이슈에 뿌리 형식의 칸이 다 있는지 센다.
// 세기만 한다: 칸을 채우거나 내용이 맞는지 보지 않는다(내용은 큰 가지 확인에서 사람이 본다). 빠지면 기획 대화로 돌아간다.
// 칸은 .github/ISSUE_TEMPLATE/root.md의 ## 제목(ITEMS_EN). 옛 한국어 칸(ITEMS)도 읽는다(#93 병렬 변경 1단계).
// "None"(옛 "없음")은 사람이 정한 답으로 센다. Risk paths만은 정본이 CLAUDE.md의 Risk paths라 "See CLAUDE.md"여야 한다
// ("CLAUDE.md"가 있는지만 본다). Success criteria는 목록 한 줄마다 "(check: <방법>)"(옛 "확인:")이 있어야 한다
// (큰 가지 확인에서 평가자가 돌려볼 수 있게)
// 실행: node src/spec.ts --repo <대상 저장소> --root <뿌리> (사람 gh 계정으로 돈다). 빠진 게 있으면 종료 코드 1
import { parseArgs } from "node:util";
import { num, type Run, sh } from "./run.ts";

export const ITEMS_EN = [
	"Plan document",
	"Success criteria",
	"Risk paths",
	"Evaluator setup",
	"Stack and ADRs",
	"Out of scope",
];
// 옛 한국어 칸. ITEMS_EN과 같은 순서. 옛 칸 읽기를 지우는 병렬 변경 3단계에서 지운다
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

// 빠진 항목마다 한 줄. 비면 다 있다. 칸마다 영어 칸을 먼저, 없으면 옛 한국어 칸을 읽는다.
// 알리는 칸 이름과 힌트는 늘 영어다(#107)
export function check(body: string): string[] {
	const s = sections(body);
	const get = (i: number) => s.get(ITEMS_EN[i]) ?? s.get(ITEMS[i]);
	const missing: string[] = [];
	ITEMS_EN.forEach((item, i) => {
		const text = get(i);
		if (text === undefined) missing.push(`${item}: missing`);
		else if (!text) missing.push(`${item}: empty`);
		else if (i === 2 && !text.includes("CLAUDE.md"))
			missing.push(
				`${item}: the source of truth is Risk paths in CLAUDE.md. Write only "See CLAUDE.md" here`,
			);
	});
	const criteria = get(1);
	const goals = (criteria ?? "")
		.split("\n")
		.map((l) => l.match(/^(?:[-*]|\d+\.)\s+(.*)/)?.[1])
		.filter((l) => l !== undefined);
	if (criteria && !goals.length)
		missing.push(`${ITEMS_EN[1]}: no list (- <criterion> (check: <how>))`);
	goals.forEach((g, i) => {
		if (!/check:|확인:/.test(g))
			missing.push(`${ITEMS_EN[1]} ${i + 1} "${g}": no check method`);
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
		},
	});
	if (!values.repo || !values.root)
		throw new Error("--repo and --root are required");
	const root = num("--root", values.root, 1);
	const missing = check(await readRoot(values.repo, root, sh));
	if (!missing.length) console.log(`Spec check #${root}: nothing missing`);
	else {
		console.log(
			`Spec check #${root}: items missing. Go back to the planning conversation\n${missing.map((m) => `- ${m}`).join("\n")}`,
		);
		process.exitCode = 1;
	}
}
