// #82: 설치 화면과 `/` 목록의 description은 영어(한글 없음). 문구가 표와 같은지는 평가자가 diff로 본다
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { components } from "./plugin.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const json = (f: string) =>
	JSON.parse(
		readFileSync(new URL(`../.claude-plugin/${f}`, import.meta.url), "utf8"),
	);

test("설치 화면·스킬·에이전트 description은 비어 있지 않고 한글이 없다", () => {
	const plugin = json("plugin.json");
	const market = json("marketplace.json");
	const c = components(ROOT);
	const all: [string, string][] = [
		["plugin.json", plugin.description],
		["marketplace.json", market.description],
		["marketplace.json plugins[0]", market.plugins[0].description],
		...c.skills.map((s): [string, string] => [
			`skills/${s.name}`,
			s.description,
		]),
		...c.agents.map((a): [string, string] => [
			`agents/${a.name}`,
			a.description,
		]),
	];
	for (const [where, d] of all) {
		assert.ok(d?.trim(), `${where}: 비어 있다`);
		assert.doesNotMatch(d, /[ㄱ-ㆎ가-힣]/, `${where}: 한글이 있다`);
	}
});
