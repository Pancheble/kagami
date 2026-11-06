// T12 spec check: when a planning conversation (/kagami:plan) ends, counts whether the root issue has every field of the root format.
// Counts only: it does not fill fields or check their content (the human checks content when trying a branch). If any are missing, go back to the planning conversation.
// The fields are the ## headings of .github/ISSUE_TEMPLATE/root.md (ITEMS_EN). It also reads the old Korean fields (ITEMS) (#93 parallel change step 1).
// "None" (or its old Korean form) counts as an answer the human decided. Only Risk paths must be "See CLAUDE.md", since its source is Risk paths in CLAUDE.md
// (it only checks that "CLAUDE.md" is there). Every list line of Success criteria needs "(check: <how>)" (or the old Korean form)
// (so the evaluator can run it when trying a branch)
// Run: node src/spec.ts --repo <target repo> --root <root> (runs as the human's gh account). Exit code 1 if anything is missing
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
// Old Korean fields. Same order as ITEMS_EN. Deleted in parallel change step 3, which removes reading the old fields
export const ITEMS = [
	"기획 문서",
	"성공 기준",
	"위험 경로",
	"평가자 준비물",
	"스택과 ADR",
	"안 할 것",
];

// Content per ## heading (HTML comments removed)
function sections(body: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const part of body
		.replace(/<!--[\s\S]*?-->/g, "")
		.split(/^## /m)
		.slice(1)) {
		const [head, ...rest] = part.split("\n");
		out.set(head.trim(), rest.join("\n").trimEnd()); // keep leading indentation: sub-lists are not criteria
	}
	return out;
}

// One line per missing item. Empty means all there. For each field, read the English one first, else the old Korean one.
// Reported field names and hints are always English (#107)
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
