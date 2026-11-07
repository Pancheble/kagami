// #51 leaf 1 (plugin skeleton) contract: the repo root is the plugin kagami, the frontmatter of the four moved skills, the evaluator agent
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { components } from "../../src/plugin.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
// standard frontmatter (name, description, license) + Claude Code's disable-model-invocation (init and plan only)
const KEYS = ["name", "description", "license", "disable-model-invocation"];

test("plugin and marketplace are named kagami, and the repo root is the plugin", () => {
	const c = components(ROOT);
	assert.equal(c.plugin, "kagami");
	assert.equal(c.marketplace, "kagami");
	assert.equal(c.source, "./");
	// SemVer; a pre-release tail is allowed for the beta (1.0.0-beta.1, widened in #52)
	assert.match(c.version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
});

test("four moved skills: only the human calls plan; the model can call split, build and test", () => {
	const by = new Map(components(ROOT).skills.map((s) => [s.name, s]));
	for (const n of ["plan", "split", "build", "test"]) assert.ok(by.has(n), n);
	assert.equal(by.get("plan")?.model, false);
	for (const n of ["split", "build", "test"])
		assert.equal(by.get(n)?.model, true, n);
});

test("skill frontmatter uses only the agreed keys and has description and license", () => {
	for (const s of components(ROOT).skills) {
		assert.deepEqual(
			s.keys.filter((k) => !KEYS.includes(k)),
			[],
			s.name,
		);
		assert.ok(s.description, s.name);
		assert.ok(s.license, s.name);
	}
});

test("the evaluator agent calls changed.ts inside the plugin", () => {
	const ev = components(ROOT).agents.find((a) => a.name === "evaluator");
	assert.ok(ev, "no evaluator");
	// biome-ignore lint/suspicious/noTemplateCurlyInString: the variable name exactly as Claude Code substitutes it
	assert.ok(ev.body.includes("${CLAUDE_PLUGIN_ROOT}/src/changed.ts"));
});
