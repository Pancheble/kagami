// T11 dev에서 main으로: 8 보고서에 사람이 단 첫 답이 /맞다면 보고서의 dev 커밋으로 main을 fast-forward한다.
// main을 옮기는 건 여기 하나뿐이다. 위험 경로다(CLAUDE.md의 Risk paths). 부르는 곳은 close.ts answers()
// 잠금은 따로 두지 않는다: force 없는 push라 main이 그 커밋의 조상이 아니면 git이 거절한다(dev의 순차 머지와 같다)
import { fileURLToPath } from "node:url";
import { byHuman, said } from "./guard.ts";
import type { Opts, Run } from "./leaf.ts";

// main 직접 커밋을 막는 git hook(pre-push)이 있는 곳. 하네스의 main push에도 건다
export const HOOKS = fileURLToPath(new URL("../hooks", import.meta.url));

// 8 보고서 이슈에 사람(byHuman)이 단 첫 답. 하네스 계정·bot·협업자 아닌 사람의 댓글은 세지 않는다
export async function first(
	repo: string,
	n: number,
	account: string,
	run: Run,
) {
	return (await said(repo, n, run))
		.filter((c) => byHuman(c, account))
		.map((c) => ({
			who: c.user,
			m: c.body.trim().match(/^\/(맞다|아니다|다르게|다시)(?:\s+([\s\S]*))?$/),
		}))
		.find((x) => x.m);
}

const yes = (p: Promise<unknown>) =>
	p.then(
		() => true,
		() => false,
	);

// /맞다: 보고서 본문의 "- dev: <커밋>"으로 main을 옮긴다. 그 커밋이 dev에 있어야 하고, force 없이 push한다.
// main이 이미 그 커밋을 품고 있으면(다른 /맞다가 더 앞선 커밋을 올림) 되돌리지 않고 ok
export async function promote(
	body: string,
	o: Pick<Opts, "dir">,
	run: Run,
): Promise<{ ok: boolean; done: string }> {
	const sha = body.match(/^- dev: (\S+)$/m)?.[1];
	if (!sha) return { ok: false, done: "보고서에 dev 커밋이 없다" };
	const git = (...a: string[]) => run("git", a, o.dir);
	// 원격 main. 아직 없으면 "": 첫 /맞다가 그 dev 커밋으로 main을 만든다(dev만 있는 새 저장소)
	const main = async () => {
		const at = (await git("ls-remote", "origin", "refs/heads/main")).split(
			"\t",
		)[0];
		if (at) await git("fetch", "origin", "main");
		return at;
	};
	await git("fetch", "origin", "dev");
	if (!(await yes(git("merge-base", "--is-ancestor", sha, "origin/dev"))))
		return { ok: false, done: `${sha}는 dev에 없는 커밋이다` };
	// 그 사이 다른 하네스가 main을 옮겨 거절되면 새 main에서 다시 본다. main이 그대로인데 거절되면 실패
	for (;;) {
		const before = await main();
		if (before && (await yes(git("merge-base", "--is-ancestor", sha, before))))
			return { ok: true, done: `dev ${sha}는 이미 main에 있다` };
		try {
			await git(
				"-c",
				`core.hooksPath=${HOOKS}`,
				"push",
				"origin",
				`${sha}:refs/heads/main`,
			); // force 없이
			return {
				ok: true,
				done: `main을 dev ${sha}로 옮겼다 (fast-forward, 전 main ${before || "없음"})`,
			};
		} catch (e) {
			if ((await main()) === before)
				return {
					ok: false,
					done: `main ${before}에서 dev ${sha}로 가는 push가 거절됐다\n\n${e}`,
				};
		}
	}
}
