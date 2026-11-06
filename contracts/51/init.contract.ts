// #51 잎 5 (init)의 약속: 빈 새 저장소에 깔 파일·라벨·브랜치. kagami 파일은 플러그인 루트에서 그대로 복사, AGENTS.md만 버전 줄을 단다
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { riskPaths } from "../../src/guard.ts";
import { plan } from "../../src/init.ts";
import { stamp, version } from "../../src/version.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REPO = "Pancheble/kagami";
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const TEMPLATES = ["root", "branch", "node", "leaf"].map(
	(t) => `.github/ISSUE_TEMPLATE/${t}.md`,
);

test("깔 파일은 이것뿐이다", () => {
	assert.deepEqual(
		Object.keys(plan(ROOT, { repo: REPO }).files).sort(),
		[
			"AGENTS.md",
			"CONTRIBUTING.md",
			"CLAUDE.md",
			".claude/settings.json",
			".github/workflows/kagami-guard.yml",
			...TEMPLATES,
		].sort(),
	);
});

test("AGENTS.md는 버전 줄을 단 복사본, CONTRIBUTING.md와 이슈 템플릿은 그대로", () => {
	const { files } = plan(ROOT, { repo: REPO });
	assert.equal(files["AGENTS.md"], stamp(read("AGENTS.md"), version(ROOT)));
	for (const f of ["CONTRIBUTING.md", ...TEMPLATES])
		assert.equal(files[f], read(f), f);
});

test("CLAUDE.md: @AGENTS.md, Risk paths 기본값 다섯, 세션을 열면 /kagami:next", () => {
	const md = plan(ROOT, { repo: REPO }).files["CLAUDE.md"];
	assert.ok(md.includes("@AGENTS.md"));
	assert.deepEqual(riskPaths(md), [
		".github/workflows/",
		".claude/",
		"AGENTS.md",
		"CLAUDE.md",
		".env*",
	]);
	assert.ok(md.includes("/kagami:next"));
});

test("settings.json: 마켓플레이스 kagami를 ref로 고정하고 플러그인을 켠다. ref 기본은 v<version>", () => {
	const settings = (ref?: string) =>
		JSON.parse(plan(ROOT, { repo: REPO, ref }).files[".claude/settings.json"]);
	const source = (ref: string) => ({ source: "github", repo: REPO, ref });
	const s = settings();
	assert.deepEqual(
		s.extraKnownMarketplaces.kagami.source,
		source(`v${version(ROOT)}`),
	);
	assert.equal(s.enabledPlugins["kagami@kagami"], true);
	assert.deepEqual(
		settings("dev").extraKnownMarketplaces.kagami.source,
		source("dev"),
	);
});

test("가드 워크플로는 kagami를 같은 ref로 받는다", () => {
	const yml = (ref?: string) =>
		plan(ROOT, { repo: REPO, ref }).files[".github/workflows/kagami-guard.yml"];
	assert.ok(yml().includes(`repository: ${REPO}`));
	assert.ok(yml().includes(`ref: v${version(ROOT)}`));
	assert.ok(!yml().includes("ref: dev"));
	assert.ok(yml("dev").includes("ref: dev"));
});

test("라벨 9개(기록 7 + node, leaf)와 dev 브랜치 하나", () => {
	const p = plan(ROOT, { repo: REPO });
	assert.deepEqual(
		[...p.labels].sort(),
		[
			"node",
			"leaf",
			"needs-decision",
			"split",
			"contract-change",
			"blocked",
			"off-recommendation",
			"spec-gap",
			"discovered",
		].sort(),
	);
	assert.equal(p.branch, "dev");
});
