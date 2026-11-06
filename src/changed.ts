// PR TL;DR의 Changed 줄을 센다. guard.ts facts()가 세는 사실(계약, 위험 경로, 지운 테스트, 의존성)에 새 이슈만 더한다.
// 세기만 한다. plan changes와 Decided는 PR을 쓰는 쪽이 채운다
// 새 이슈 = 잎의 하위 이슈(쪼개기) + 잎 이슈의 **discovered** #N 기록(AGENTS.md 기록 형식)
// 실행: node src/changed.ts [--base origin/dev] [--issue <잎 번호>]  (잎 번호가 없으면 브랜치 leaf/<번호>-에서 읽는다)
import { parseArgs } from "node:util";
import { type Facts, facts } from "./guard.ts";
import { sh } from "./run.ts";

// 첫 줄이 **discovered** #N 으로 시작하는 댓글만 센다
export const newIssues = (sub: number[], comments: string[]): number[] => [
	...new Set([
		...sub,
		...comments.flatMap((c) => {
			const n = c.match(/^\*\*discovered\*\* #(\d+)/)?.[1];
			return n ? [Number(n)] : [];
		}),
	]),
];

const list = (xs: string[]) => (xs.length ? xs.join(", ") : "None");
// AGENTS.md "PR TL;DR 형식"의 칸 순서. facts()가 세는 지운 테스트는 맨 뒤에 붙인다
export const line = (f: Facts, issues: number[]) =>
	[
		`Changed: new issues ${list(issues.map((n) => `#${n}`))}`,
		"plan changes (manual)",
		`contract changes ${list(f.contracts)}`,
		`risk paths touched ${list(f.risk)}`,
		`new dependencies ${list(f.deps)}`,
		`deleted tests ${list(f.deleted)}`,
	].join(" / ");

if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			base: { type: "string", default: "origin/dev" },
			issue: { type: "string" },
		},
	});
	const git = (...a: string[]) => sh("git", a);
	const show = (ref: string, f: string) =>
		git("show", `${ref}:${f}`).catch(() => "");
	const side = async (ref: string) => ({
		md: await show(ref, "CLAUDE.md"),
		pkg: await show(ref, "package.json"),
	});
	const base = (await git("merge-base", values.base, "HEAD")).trim();
	const f = facts(
		await git("diff", "--name-status", "--no-renames", base, "HEAD"),
		await side(base),
		await side("HEAD"),
	);
	const n =
		values.issue ??
		(await git("branch", "--show-current")).match(/^leaf\/(\d+)-/)?.[1];
	if (!n) throw new Error("잎 번호를 모른다: --issue <번호>");
	const nums = (out: string) => out.split("\n").filter(Boolean).map(Number);
	const sub = nums(
		await sh("gh", [
			"api",
			"--paginate",
			`repos/{owner}/{repo}/issues/${n}/sub_issues`,
			"--jq",
			".[].number",
		]),
	);
	const comments: string[] = JSON.parse(
		await sh("gh", [
			"issue",
			"view",
			n,
			"--json",
			"comments",
			"--jq",
			"[.comments[].body]",
		]),
	);
	console.log(line(f, newIssues(sub, comments)));
}
