// #51 잎 5: /kagami:init이 빈 새 저장소에 깔 것. plan은 무엇을 깔지 계산만 하고, install이 쓰기와 gh·git 호출을 한다
// root는 kagami 플러그인 루트(${CLAUDE_PLUGIN_ROOT}). AGENTS.md·CONTRIBUTING.md·이슈 템플릿·ci/guard.yml은 거기서 읽는다
// 계약: contracts/51/init.contract.ts
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { type Run, sh } from "./run.ts";
import { ensureLabels } from "./tree.ts";
import { stamp, version } from "./version.ts";

export type Plan = {
	files: Record<string, string>; // 대상 저장소 경로 → 내용
	labels: string[]; // 만들 라벨 이름(tree.ts LABELS와 같은 9개. init.test.ts가 맞춰 본다)
	branch: string; // 만들 브랜치(dev 하나)
};

const KAGAMI = "Pancheble/kagami";
const TEMPLATES = ["root", "branch", "node", "leaf"].map(
	(t) => `.github/ISSUE_TEMPLATE/${t}.md`,
);
const LABELS = [
	"node",
	"leaf",
	"needs-decision",
	"split",
	"contract-change",
	"blocked",
	"off-recommendation",
	"spec-gap",
	"discovered",
];
// 위험 경로 기본값(뿌리 #49 정한 것 6). 프로젝트별 경로는 /kagami:plan에서 더한다. Risk paths 절 안에는 경로 말고 백틱을 쓰지 않는다
const CLAUDE_MD = `@AGENTS.md

# Project

Work the kagami workflow. The rules are in \`AGENTS.md\`, imported above. When you open a session, pick ready work with \`/kagami:next\`.

# Commands

List the check commands (typecheck, lint, test, and the one that runs them all), one per line. The evaluator and /kagami:build check with these. If empty, /kagami:build asks the human.

# Risk paths (a change here needs a behavior scenario and the human's approval)

- \`.github/workflows/\`
- \`.claude/\`
- \`AGENTS.md\`
- \`CLAUDE.md\`
- \`.env*\`
- This list itself (the guard reads only paths written in backticks. Add project paths in /kagami:plan)
`;

// repo: kagami 저장소(owner/name). ref: 대상 저장소가 고정할 kagami ref. 없으면 `v<plugin.json version>`
export function plan(
	root: string,
	{ repo, ref = `v${version(root)}` }: { repo: string; ref?: string },
): Plan {
	const read = (f: string) => readFileSync(join(root, f), "utf8");
	const settings = {
		extraKnownMarketplaces: {
			kagami: { source: { source: "github", repo, ref } },
		},
		enabledPlugins: { "kagami@kagami": true },
	};
	// ci/guard.yml의 kagami checkout 단계(repository 다음 줄이 ref)만 바꾼다
	const guard = read("ci/guard.yml").replace(
		/repository: \S+\n(\s+)ref: \S+/,
		`repository: ${repo}\n$1ref: ${ref}`,
	);
	return {
		files: {
			"AGENTS.md": stamp(read("AGENTS.md"), version(root)),
			"CONTRIBUTING.md": read("CONTRIBUTING.md"),
			"CLAUDE.md": CLAUDE_MD,
			".claude/settings.json": `${JSON.stringify(settings, null, "\t")}\n`,
			".github/workflows/kagami-guard.yml": guard,
			...Object.fromEntries(TEMPLATES.map((t) => [t, read(t)])),
		},
		labels: LABELS,
		branch: "dev",
	};
}

// dir의 빈 새 저장소(.git 말고 아무것도 없고 커밋 없음)에 깐다. 아니면 아무것도 하지 않고 거부한다
// 라벨, 파일 쓰기, HEAD를 dev로 두고 첫 커밋까지. push와 저장소 비밀은 사람이 한다(skills/init/SKILL.md). 대상 저장소 이름을 낸다
export async function install(
	dir: string,
	{ root, ref }: { root: string; ref?: string },
	run: Run,
): Promise<string> {
	if (!existsSync(join(dir, ".git")))
		throw new Error(`git 저장소가 아니다: ${dir}`);
	const extra = readdirSync(dir).filter((f) => f !== ".git");
	if (extra.length)
		throw new Error(`빈 새 저장소만 깐다. 이미 있는 것: ${extra.join(", ")}`);
	const head = await run(
		"git",
		["rev-parse", "--verify", "-q", "HEAD"],
		dir,
	).then(
		() => true,
		() => false,
	);
	if (head) throw new Error("빈 새 저장소만 깐다. 커밋이 이미 있다");

	const target = (
		await run(
			"gh",
			["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
			dir,
		)
	).trim();
	// 라벨을 먼저: 권한이 없어 실패해도 폴더는 빈 채로 남아 다시 돌릴 수 있다(--force라 두 번 만들어도 된다)
	await ensureLabels(target, run);
	const p = plan(root, { repo: KAGAMI, ref });
	for (const [f, body] of Object.entries(p.files)) {
		mkdirSync(dirname(join(dir, f)), { recursive: true });
		writeFileSync(join(dir, f), body);
	}
	await run("git", ["symbolic-ref", "HEAD", `refs/heads/${p.branch}`], dir);
	await run("git", ["add", "-A"], dir);
	await run("git", ["commit", "-q", "-m", "chore: kagami init"], dir);
	return target;
}

// node src/init.ts [--ref <ref>] [--dir <대상 저장소>]  (dir 기본은 지금 폴더)
if (import.meta.main) {
	const { values } = parseArgs({
		options: { ref: { type: "string" }, dir: { type: "string" } },
	});
	const root = fileURLToPath(new URL("../", import.meta.url));
	const target = await install(
		values.dir ?? process.cwd(),
		{ root, ref: values.ref },
		sh,
	);
	console.log(`${target}에 깔았다. dev에 첫 커밋까지 했고 push는 아직이다`);
}
