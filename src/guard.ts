// CI 가드: PR 체크아웃의 HEAD(PR을 dev에 얹은 커밋)를 origin/dev와 비교해 판정(judge)하고 결과를 체크로 보인다.
// dev로 가는 문은 사람의 머지 동의다(AGENTS.md). 가드는 그 앞에 빨강·초록·표시를 보인다. 이 파일은 위험 경로다(CLAUDE.md의 Risk paths).
//   계약 테스트 수정 감지: 기존 계약·인수 테스트를 고치거나 지웠으면 막는다.
//     계약 정리: PR에 contract-change 라벨이 있고 본문 TL;DR의 Changed 줄에 그 계약 파일(*.contract.*)이 적혀 있으면 막지 않고 표시한다
//   래칫: dev에서 초록이던 계약·인수 테스트가 HEAD에서 빨강이거나 사라졌으면 FAIL
//   사실 계산: 위험 경로(dev의 CLAUDE.md 목록), 지운 테스트, 새 의존성을 센다
//   위험 경로 정본: PR 쪽 CLAUDE.md에 Risk paths 절이 없으면 막는다
//   보안 계산 검사: 바뀐 코드를 Biome security 규칙으로 본다
// 계약 정리·위험 경로·지운 테스트·보안 지적은 초록에 표시(경고)로 사람에게 보인다. GitHub에 쓰지 않는다(읽기 토큰)
// 실행: node src/guard.ts --dir <PR 체크아웃>  (origin/dev가 있어야 한다. 막힘이면 종료 코드 1)
//   라벨과 본문은 GITHUB_EVENT_PATH의 pull_request payload에서 읽는다. 로컬에선 같은 모양의 JSON 파일을 그 변수로 준다
import { appendFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, matchesGlob, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { noKey, quiet, type Run, sh } from "./run.ts";

export const TESTS = /\.(accept|contract)\.[cm]?[jt]sx?$/;
const REPORTER = new URL("./red-reporter.ts", import.meta.url).href;
const BIOME = fileURLToPath(
	new URL("../node_modules/.bin/biome", import.meta.url),
);

export type Row = { name: string; ok: boolean; error: string };

// git은 ASCII가 아닌 글자나 따옴표가 든 경로를 "..."로 감싸고 바이트를 \ooo로 적는다(core.quotePath).
// 안 풀면 한글 이름의 계약 테스트가 정규식과 앞부분 일치를 빠져나간다
export function unquote(p: string): string {
	if (!p.startsWith('"')) return p;
	const esc: Record<string, number> = {
		t: 9,
		n: 10,
		r: 13,
		'"': 34,
		"\\": 92,
		a: 7,
		b: 8,
		f: 12,
		v: 11,
	};
	const bytes: number[] = [];
	const body = p.slice(1, -1);
	for (let i = 0; i < body.length; i++) {
		if (body[i] !== "\\") {
			bytes.push(...Buffer.from(body[i]));
			continue;
		}
		const oct = body.slice(i + 1, i + 4);
		if (/^[0-7]{3}$/.test(oct)) {
			bytes.push(Number.parseInt(oct, 8));
			i += 3;
		} else bytes.push(esc[body[++i]] ?? body.charCodeAt(i));
	}
	return Buffer.from(bytes).toString("utf8");
}
// git이 내놓은 경로 목록 한 줄에 하나
export const paths = (out: string) =>
	out.split("\n").filter(Boolean).map(unquote);
// 막힘의 이유
export type Failed = { why: string };

// 대상 저장소의 의존성을 worktree에 깐다. 테스트를 돌리는 곳(results)은 모두 이 길로 간다.
// 대상 저장소의 코드를 받는 일이라 인증 없는 환경에서, 설치 스크립트(lifecycle)는 돌리지 않는다.
// lock 파일대로만 깐다(npm ci). 못 깔면 던진다: 판정할 수 없는 걸 통과로 보지 않는다
// ponytail: npm의 package-lock.json만. pnpm·yarn이나 lock 없는 저장소는 안 깐다(불러오기 실패로 빨강)
export async function install(wt: string, run: Run) {
	if (!existsSync(join(wt, "package-lock.json"))) return;
	await run(
		"npm",
		["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
		wt,
		noKey(),
	);
}

// 계약·인수 테스트 파일마다 node --test를 따로 돌려 테스트 하나하나의 결과를 읽는다. 결과는 리포터가 파일에 쓴다.
// PR의 코드를 돌리니 인증 없는 환경에서 돌린다. 파일이 불러와지지 않으면 결과가 비어 있다.
// 그 커밋의 lock 파일로 의존성을 먼저 깐다(PR과 dev의 lock이 다를 수 있다)
export async function results(
	files: string[],
	cwd: string,
	run: Run,
): Promise<Map<string, Row[]>> {
	if (files.length) await install(cwd, run);
	const tmp = mkdtempSync(join(tmpdir(), "rows-"));
	const out = new Map<string, Row[]>();
	for (const [k, f] of files.entries()) {
		const dest = join(tmp, `${k}.jsonl`);
		// 빨강이면 종료 코드가 0이 아니다
		await quiet(
			run(
				process.execPath,
				[
					"--test",
					`--test-reporter=${REPORTER}`,
					`--test-reporter-destination=${dest}`,
					f,
				],
				cwd,
				noKey(),
			),
		);
		out.set(
			f,
			existsSync(dest)
				? readFileSync(dest, "utf8")
						.split("\n")
						.filter(Boolean)
						.map((l) => JSON.parse(l))
				: [],
		);
	}
	return out;
}

// CLAUDE.md "Risk paths" 절에서 백틱으로 적은 경로만 읽는다. 말로 적은 줄(main을 옮기는 스크립트 등)은 계산하지 못한다
const section = (md: string) =>
	md.split(/^#+ /m).find((s) => s.startsWith("Risk paths"));
export function riskPaths(md: string): string[] {
	const sec = section(md);
	return sec ? [...sec.matchAll(/`([^`]+)`/g)].map((m) => m[1]) : [];
}
// 끝이 /면 그 폴더 아래, *가 있으면 글롭(*는 /를 넘지 않는다), 나머지는 이름이 똑같을 때
const under = (f: string, p: string) =>
	p.endsWith("/")
		? f.startsWith(p)
		: p.includes("*")
			? matchesGlob(f, p)
			: f === p;
const deps = (pkg: string): string[] => {
	try {
		const j = JSON.parse(pkg);
		return Object.keys({
			...j.dependencies,
			...j.devDependencies,
			...j.optionalDependencies,
			...j.peerDependencies,
		});
	} catch {
		return [];
	}
};
export type Facts = {
	contracts: string[]; // 고치거나 지운 기존 계약·인수 테스트
	risk: string[]; // 건드린 위험 경로
	deleted: string[]; // 지운 테스트
	deps: string[]; // 새 의존성
};
type Side = { md: string; pkg: string }; // CLAUDE.md와 package.json

// 사실 계산: git diff --name-status --no-renames의 출력과 양쪽 CLAUDE.md·package.json으로 센다.
// 위험 경로 목록은 dev 쪽을 쓴다. PR이 목록에서 자기 경로를 빼도 걸리고, 목록을 바꾼 것 자체가 위험 경로다
export function facts(status: string, base: Side, head: Side): Facts {
	const changes = status
		.split("\n")
		.filter(Boolean)
		.map((l) => {
			const [s, f] = l.split("\t");
			return [s, unquote(f)] as [string, string];
		});
	const list = riskPaths(base.md);
	const risk = changes
		.map(([, f]) => f)
		.filter((f) => list.some((p) => under(f, p)));
	if (riskPaths(head.md).join("\n") !== list.join("\n"))
		risk.push("CLAUDE.md의 위험 경로 목록");
	return {
		contracts: changes
			.filter(([s, f]) => s !== "A" && TESTS.test(f))
			.map(([, f]) => f),
		risk,
		deleted: changes
			.filter(
				([s, f]) => s === "D" && /\.(test|spec|contract|accept)\./.test(f),
			)
			.map(([, f]) => f),
		deps: deps(head.pkg).filter((d) => !deps(base.pkg).includes(d)),
	};
}

// 래칫: dev에서 초록이던 계약·인수 테스트는 HEAD에서도 초록이어야 한다. 빨강이 됐거나 사라졌으면 깨진 것이다.
// 아직 빨강인 건 봐준다. 통과 목록은 저장하지 않고 머지 때마다 dev에서 계산한다.
// skip: 계약 정리로 고친 파일. 그 파일만 빼고 나머지는 지킨다
export async function ratchet(
	wt: string,
	run: Run,
	skip: string[] = [],
): Promise<{ broken: string[]; kept: number }> {
	const list = async (ref: string) =>
		paths(
			await run(
				"git",
				["ls-tree", "-r", "--name-only", ref, "--", "contracts"],
				wt,
			),
		).filter((f) => TESTS.test(f));
	const files = await list("origin/dev");
	if (!files.length) return { broken: [], kept: 0 };
	const dev = `${wt}-dev`;
	await quiet(run("git", ["worktree", "remove", "--force", dev], wt));
	await run("git", ["worktree", "add", "--detach", dev, "origin/dev"], wt);
	let before: Map<string, Row[]>;
	try {
		before = await results(files, dev, run);
	} finally {
		await quiet(run("git", ["worktree", "remove", "--force", dev], wt));
	}
	const key = (f: string, r: Row) => `${f} › ${r.name}`;
	const green = [...before].flatMap(([f, rs]) =>
		skip.includes(f) ? [] : rs.filter((r) => r.ok).map((r) => key(f, r)),
	);
	const now = new Set(await list("HEAD"));
	const after = await results(
		[...before.keys()].filter(
			(f) => now.has(f) && green.some((k) => k.startsWith(`${f} › `)),
		),
		wt,
		run,
	);
	const ok = new Set(
		[...after].flatMap(([f, rs]) =>
			rs.filter((r) => r.ok).map((r) => key(f, r)),
		),
	);
	return { broken: green.filter((k) => !ok.has(k)), kept: green.length };
}

// 보안 계산 검사: 바뀐 코드 파일을 하네스의 Biome security 규칙(eval, 비밀값 등)으로 본다. 못 돌렸으면 그것도 지적이다
export async function security(
	files: string[],
	wt: string,
	run: Run,
): Promise<string[]> {
	const code = files.filter((f) => /\.[cm]?[jt]sx?$/.test(f));
	if (!code.length) return [];
	const dest = join(mkdtempSync(join(tmpdir(), "sec-")), "biome.json");
	await quiet(
		run(
			BIOME,
			[
				"lint",
				"--only=security",
				"--reporter=json",
				`--reporter-file=${dest}`,
				"--no-errors-on-unmatched",
				...code,
			],
			wt,
		),
	);
	if (!existsSync(dest)) return ["보안 계산 검사를 돌리지 못했다"];
	type D = {
		category: string;
		message: string;
		location: { path: string; start: { line: number } };
	};
	return (JSON.parse(readFileSync(dest, "utf8")).diagnostics as D[]).map(
		(d) =>
			`${d.location.path}:${d.location.start.line} ${d.category}: ${d.message}`,
	);
}

const items = (xs: string[]) =>
	xs.length ? xs.map((x) => `\n  - ${x}`).join("") : " 없음";

// PR의 라벨과 본문(GITHUB_EVENT_PATH의 pull_request)
export type Pr = { labels: string[]; body: string };
// 계약 정리로 허가된 파일: contract-change 라벨이 있고, 본문의 Changed: 줄에 그 경로가 낱말로 적힌 계약 테스트. 인수 테스트는 아니다
export const allowed = (contracts: string[], pr?: Pr) => {
	if (!pr?.labels.includes("contract-change")) return [];
	const words = new Set(
		pr.body
			.split("\n")
			.filter((l) => /^\s*Changed:/.test(l))
			.flatMap((l) => l.split(/[\s,]+/)),
	);
	return contracts.filter((f) => /\.contract\./.test(f) && words.has(f));
};

// 판정: 막힘(fail)이면 빨강. wait면 초록에 사람이 볼 것을 표시한다. report는 로그와 잡 요약 본문
export async function judge(wt: string, run: Run, pr?: Pr) {
	const show = (ref: string, f: string) =>
		run("git", ["show", `${ref}:${f}`], wt).catch(() => "");
	const status = await run(
		"git",
		["diff", "--name-status", "--no-renames", "origin/dev", "HEAD"],
		wt,
	);
	const head = {
		md: await show("HEAD", "CLAUDE.md"),
		pkg: await show("HEAD", "package.json"),
	};
	const f = facts(
		status,
		{
			md: await show("origin/dev", "CLAUDE.md"),
			pkg: await show("origin/dev", "package.json"),
		},
		head,
	);
	const changed = status
		.split("\n")
		.filter((l) => l && !l.startsWith("D"))
		.map((l) => unquote(l.split("\t")[1]));
	const tidy = allowed(f.contracts, pr);
	const bad = f.contracts.filter((c) => !tidy.includes(c));
	// 허가 없이 계약을 고쳤으면 막힌다. 래칫은 돌리지 않는다
	const r = bad.length ? { broken: [], kept: 0 } : await ratchet(wt, run, tidy);
	const sec = await security(changed, wt, run);
	let fail: Failed | undefined;
	// 위험 경로 정본은 CLAUDE.md의 Risk paths 하나다(뿌리 #49 정한 것 6). PR 쪽에서 못 찾으면 막는다
	if (section(head.md) === undefined)
		fail = {
			why: "CLAUDE.md에 Risk paths 절이 없다 (위험 경로 정본. `# Risk paths` 제목 아래 백틱으로 경로를 적는다)",
		};
	else if (bad.length)
		fail = {
			why: `기존 계약·인수 테스트를 고쳤다: ${bad.join(", ")}`,
		};
	else if (r.broken.length)
		fail = {
			why: `래칫: dev에서 초록이던 계약·인수 테스트가 깨졌다 (${r.broken.length}개)`,
		};
	const wait =
		!fail && tidy.length + f.risk.length + f.deleted.length + sec.length > 0;
	const word = fail
		? `막힘 — ${fail.why}`
		: wait
			? "사람이 볼 것 있음 — 계약 정리·위험 경로·지운 테스트·보안 지적이 있다. 체크는 초록이고, 사람이 보고 머지를 정한다"
			: "통과";
	const report = [
		`지키는 검사: ${word}`,
		"",
		`- 계약·인수 테스트 수정:${items(bad)}`,
		`- 계약 정리:${items(tidy)}`,
		`- 래칫: dev에서 초록 ${r.kept}개 중 깨진 것:${items(r.broken)}`,
		`- 위험 경로:${items(f.risk)}`,
		`- 지운 테스트:${items(f.deleted)}`,
		`- 보안 계산 검사:${items(sec)}`,
		`- 새 의존성:${items(f.deps)}`,
	].join("\n");
	return { fail, wait, report };
}

// CI 잡: judge를 PR 체크아웃에서 돌려 결과를 로그와 잡 요약에 보인다. 막힘이면 체크가 빨강, 표시면 초록에 경고
if (import.meta.main) {
	const { values } = parseArgs({
		options: { dir: { type: "string", default: "." } },
	});
	const ev = process.env.GITHUB_EVENT_PATH;
	const p = ev && JSON.parse(readFileSync(ev, "utf8")).pull_request;
	const pr: Pr | undefined = p && {
		labels: (p.labels ?? []).map((l: { name: string }) => l.name),
		body: p.body ?? "",
	};
	const j = await judge(resolve(values.dir), sh, pr);
	console.log(j.report);
	if (process.env.GITHUB_STEP_SUMMARY)
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${j.report}\n`);
	if (j.fail) process.exitCode = 1;
	else if (j.wait)
		console.log(
			"::warning::kagami 가드: 사람이 볼 것이 있다 (계약 정리·위험 경로·지운 테스트·보안 지적)",
		);
}
