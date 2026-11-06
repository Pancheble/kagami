// #82: descriptions on the install screen and in the `/` list are English (no Hangul). The evaluator checks the wording against the table in the diff
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

test("install screen, skill and agent descriptions are not empty and have no Hangul", () => {
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
		assert.ok(d?.trim(), `${where}: empty`);
		assert.doesNotMatch(d, /[ㄱ-ㆎ가-힣]/, `${where}: has Hangul`);
	}
});
