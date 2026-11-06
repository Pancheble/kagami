// #51 leaf 1's contract: the version source is plugin.json version, on the first line of AGENTS.md as `<!-- kagami v<version> -->` (init stamps it, next reads it)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { stamp, stamped, version } from "../../src/version.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

test("version is the version in plugin.json", () => {
	const v = version(ROOT);
	const json = JSON.parse(
		readFileSync(join(ROOT, ".claude-plugin/plugin.json"), "utf8"),
	);
	assert.equal(v, json.version);
});

test("stamp puts the version line first and leaves the rest as is", () => {
	assert.equal(
		stamp("# AGENTS.md\nbody\n", "0.0.0"),
		"<!-- kagami v0.0.0 -->\n# AGENTS.md\nbody\n",
	);
});

test("replaces an existing version line. There is always one version line", () => {
	const once = stamp("# AGENTS.md\n", "0.0.0");
	assert.equal(stamp(once, "1.2.3"), "<!-- kagami v1.2.3 -->\n# AGENTS.md\n");
});

test("stamped reads the version on the first line, undefined if none", () => {
	assert.equal(stamped(stamp("# AGENTS.md\n", "1.2.3")), "1.2.3");
	assert.equal(stamped("# AGENTS.md\n"), undefined);
	assert.equal(stamped("# AGENTS.md\n<!-- kagami v1.0.0 -->\n"), undefined);
});
