// T7 지키는 장치: 순차 머지(merge)는 dev로 가는 유일한 문이고, 문을 열기 전에 하네스가 판정한다.
// 판정은 PR이 아니라 하네스의 코드로 한다. 그래서 PR이 워크플로를 고쳐도 피할 수 없다.
// 무료 개인 비공개 저장소에서는 브랜치 보호와 룰셋을 못 쓴다(403). 이 파일은 위험 경로다(CLAUDE.md의 Risk paths).
// rebase한 HEAD를 origin/dev와 비교한다:
//   계약 테스트 수정 감지: 기존 계약·인수 테스트를 고치거나 지웠으면 막고, 그 계약을 정한 노드로 보낸다
//   래칫: dev에서 초록이던 계약·인수 테스트가 HEAD에서 빨강이거나 사라졌으면 FAIL
//   사실 계산: 위험 경로(dev의 CLAUDE.md 목록), 지운 테스트, 새 의존성을 센다
//   보안 계산 검사: 바뀐 코드를 Biome security 규칙으로 본다
// 판정은 PR 댓글로 남긴다. 위험 경로·지운 테스트·보안 지적이 있으면 CI 뒤에 사람의 /승인을 기다린다
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { firstLine, type Opts, quiet, type Run } from "./leaf.ts";
import { noKey } from "./session.ts";

export const TESTS = /\.(accept|contract)\.[cm]?[jt]sx?$/;
const REPORTER = new URL("./red-reporter.ts", import.meta.url).href;
const BIOME = fileURLToPath(
	new URL("../node_modules/.bin/biome", import.meta.url),
);
const POLL = 60_000;
const HUMAN = ["OWNER", "MEMBER", "COLLABORATOR"]; // author_association

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
// own: 이 PR이 고쳐도 되는 계약의 노드(재계획의 병렬 변경만). wait: 위험 경로 대기 댓글 id.
// 그 뒤에 달린 /승인만 센다. 코드가 바뀌어 다시 평가하면 비운다
export type Gate = { own?: number; wait?: number };
// fix가 있으면 고칠 것이 있다는 뜻. stop이면 다시 해도 소용없다(바로 막힘).
// owners는 깨는 변경 제안: 그 계약들을 정한 노드에서 재계획한다
export type Failed = {
	why: string;
	fix?: string;
	stop?: boolean;
	owners?: number[];
};

// 계약·인수 테스트 파일마다 node --test를 따로 돌려 테스트 하나하나의 결과를 읽는다. 결과는 리포터가 파일에 쓴다.
// 세션이 쓴 코드를 돌리니 인증 없는 환경에서 돌린다. 파일이 불러와지지 않으면 결과가 비어 있다
export async function results(
	files: string[],
	cwd: string,
	run: Run,
): Promise<Map<string, Row[]>> {
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
export function riskPaths(md: string): string[] {
	const sec = md.split(/^#+ /m).find((s) => s.startsWith("Risk paths"));
	return sec ? [...sec.matchAll(/`([^`]+)`/g)].map((m) => m[1]) : [];
}
// ponytail: 앞부분 일치만. 글롭이 필요하면 path.matchesGlob
const under = (f: string, p: string) =>
	p.endsWith("/") ? f.startsWith(p) : f === p;
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
// 재계획의 병렬 변경은 자기 노드의 계약 테스트(인수 테스트는 아님)를 고치거나 지울 수 있다
const mine = (f: string, own?: number) =>
	own !== undefined &&
	f.startsWith(`contracts/${own}/`) &&
	/\.contract\./.test(f);
const ownerOf = (f: string) => Number(f.match(/^contracts\/(\d+)\//)?.[1] ?? 0);

export type Facts = {
	contracts: string[]; // 고치거나 지운 기존 계약·인수 테스트
	risk: string[]; // 건드린 위험 경로
	deleted: string[]; // 지운 테스트
	deps: string[]; // 새 의존성
};
type Side = { md: string; pkg: string }; // CLAUDE.md와 package.json

// 사실 계산: git diff --name-status --no-renames의 출력과 양쪽 CLAUDE.md·package.json으로 센다.
// 위험 경로 목록은 dev 쪽을 쓴다. PR이 목록에서 자기 경로를 빼도 걸리고, 목록을 바꾼 것 자체가 위험 경로다
export function facts(
	status: string,
	base: Side,
	head: Side,
	own?: number,
): Facts {
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
			.filter(([s, f]) => s !== "A" && TESTS.test(f) && !mine(f, own))
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
// push HEAD:dev의 fast-forward가 비교한 dev가 그새 바뀌지 않았음을 보장한다
export async function ratchet(
	wt: string,
	run: Run,
	own?: number,
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
		mine(f, own) ? [] : rs.filter((r) => r.ok).map((r) => key(f, r)),
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

// 판정: 막힘(fail)이면 머지하지 않는다. wait면 CI 뒤에 /승인을 기다린다. report는 PR 댓글 본문
async function judge(wt: string, run: Run, own?: number) {
	const show = (ref: string, f: string) =>
		run("git", ["show", `${ref}:${f}`], wt).catch(() => "");
	const status = await run(
		"git",
		["diff", "--name-status", "--no-renames", "origin/dev", "HEAD"],
		wt,
	);
	const f = facts(
		status,
		{
			md: await show("origin/dev", "CLAUDE.md"),
			pkg: await show("origin/dev", "package.json"),
		},
		{
			md: await show("HEAD", "CLAUDE.md"),
			pkg: await show("HEAD", "package.json"),
		},
		own,
	);
	const changed = status
		.split("\n")
		.filter((l) => l && !l.startsWith("D"))
		.map((l) => unquote(l.split("\t")[1]));
	// 계약을 고쳤으면 막힌다. 래칫은 돌리지 않는다
	const r = f.contracts.length
		? { broken: [], kept: 0 }
		: await ratchet(wt, run, own);
	const sec = await security(changed, wt, run);
	let fail: Failed | undefined;
	if (f.contracts.length) {
		const diff = await run(
			"git",
			["diff", "origin/dev", "HEAD", "--", ...f.contracts],
			wt,
		);
		fail = {
			why: `기존 계약·인수 테스트를 고쳤다: ${f.contracts.join(", ")}`,
			fix: `기존 계약·인수 테스트(${f.contracts.join(", ")})는 고치거나 지우지 마. 약속을 깨야 하면 그 계약을 정한 노드의 재계획이 정한다\n\n${diff}`,
			stop: true,
			owners: [...new Set(f.contracts.map(ownerOf))].filter(Boolean),
		};
	} else if (r.broken.length)
		fail = {
			why: `래칫: dev에서 초록이던 계약·인수 테스트가 깨졌다 (${r.broken.length}개)`,
			fix: `dev에서 초록이던 계약·인수 테스트가 빨강이 됐거나 사라졌다. 고쳐:${items(r.broken)}`,
		};
	const wait = !fail && f.risk.length + f.deleted.length + sec.length > 0;
	const word = fail
		? `막힘 — ${fail.why}`
		: wait
			? "사람 승인 대기 — 위험 경로·지운 테스트·보안 지적이 있다. 하네스 계정이 아닌 사람이 이 PR에 /승인 댓글을 달면 머지한다"
			: "통과";
	const report = [
		`지키는 검사: ${word}`,
		"",
		`- 계약·인수 테스트 수정:${items(f.contracts)}`,
		`- 래칫: dev에서 초록 ${r.kept}개 중 깨진 것:${items(r.broken)}`,
		`- 위험 경로:${items(f.risk)}`,
		`- 지운 테스트:${items(f.deleted)}`,
		`- 보안 계산 검사:${items(sec)}`,
		`- 새 의존성:${items(f.deps)}`,
	].join("\n");
	return { fail, wait, report };
}

// 이슈·PR 댓글을 쓴 사람과 함께 끝까지 읽는다
export type Said = {
	id: number;
	user: string;
	type: string; // User · Bot
	assoc: string; // author_association
	body: string;
};
export const said = async (repo: string, n: number, run: Run) =>
	(
		await run("gh", [
			"api",
			"--paginate",
			`repos/${repo}/issues/${n}/comments?per_page=100`,
			"--jq",
			".[] | {id, user: .user.login, type: .user.type, assoc: .author_association, body}",
		])
	)
		.split("\n")
		.filter(Boolean)
		.map((l): Said => JSON.parse(l));
// 사람의 판정(/승인, 8의 /맞다 등)은 하네스 계정이 아닌 사람(협업자 이상)이 단 것만 센다.
// PR의 워크플로가 bot으로 단 댓글도 세지 않는다. 하네스와 사람이 같은 계정이면 판정할 수 없다(자기 채점 금지)
export const byHuman = (c: Said, account: string) =>
	c.user.toLowerCase() !== account &&
	c.type === "User" &&
	HUMAN.includes(c.assoc);

// 사람의 /승인: 대기 댓글(wait) 뒤에 사람이 단 "/승인"만 센다
async function approve(
	pr: number,
	wait: number,
	o: Opts,
	run: Run,
): Promise<Failed | undefined> {
	for (;;) {
		if (
			(await said(o.repo, pr, run)).some(
				(c) =>
					c.id > wait &&
					byHuman(c, o.account) &&
					firstLine(c.body.trim()) === "/승인",
			)
		)
			return;
		const state = await run("gh", [
			"pr",
			"view",
			String(pr),
			"-R",
			o.repo,
			"--json",
			"state",
			"--jq",
			".state",
		]);
		if (state.trim() !== "OPEN")
			return {
				why: `위험 경로 대기 중에 PR이 닫혔다 (${state.trim()})`,
				stop: true,
			};
		await sleep(o.poll ?? POLL);
	}
}

async function waitChecks(pr: number, o: Opts, run: Run, cwd: string) {
	// push 직후엔 체크가 아직 안 잡혀 있을 수 있다
	for (let tries = 0; ; tries++) {
		try {
			return await run(
				"gh",
				["pr", "checks", String(pr), "-R", o.repo, "--watch", "--fail-fast"],
				cwd,
			);
		} catch (e) {
			if (tries >= 30 || !String(e).includes("no checks reported")) throw e;
			await sleep(10_000);
		}
	}
}

// 순차 머지: 잠금 대신 dev의 fast-forward가 잠금이다. 그 사이 dev가 움직이면 push가 거절된다.
// rebase한 뒤 판정하고(PR 댓글), 막히면 멈춘다. 통과면 CI, 위험하면 /승인, 그다음 force 없이 dev로.
// 실패면 이유를 돌려준다
export async function merge(
	pr: number,
	wt: string,
	o: Opts,
	run: Run,
	g: Gate = {},
): Promise<Failed | undefined> {
	await run("git", ["fetch", "origin", "dev"], wt);
	try {
		await run("git", ["rebase", "origin/dev"], wt);
	} catch (e) {
		await quiet(run("git", ["rebase", "--abort"], wt));
		return { why: `dev에 rebase하면 충돌난다\n\n${e}` };
	}
	const j = await judge(wt, run, g.own);
	const said: { id: number } = JSON.parse(
		await run("gh", [
			"api",
			`repos/${o.repo}/issues/${pr}/comments`,
			"-X",
			"POST",
			"-f",
			`body=${j.report}`,
		]),
	);
	if (j.fail) return j.fail;
	if (j.wait) g.wait ??= said.id;
	await run("git", ["push", "--force-with-lease"], wt);
	try {
		await waitChecks(pr, o, run, wt);
	} catch (e) {
		return { why: "CI 실패", fix: `CI가 실패했다. 고쳐:\n${e}` };
	}
	if (j.wait && g.wait) {
		const no = await approve(pr, g.wait, o, run);
		if (no) return no;
	}
	try {
		await run("git", ["push", "origin", "HEAD:dev"], wt); // force 없이
	} catch (e) {
		return { why: `dev가 그새 움직여 fast-forward가 거절됐다\n\n${e}` };
	}
}
