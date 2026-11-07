// #52 leaf D's contract: plugin.json version is 1.0.0 or above (the beta is 1.0.0-beta.1), so init pins the v<version> tag and try tags it
// Not pinned to one version: later releases keep this green (ratchet)
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { version } from "../../src/version.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

test("plugin.json version is SemVer 1.0.0 or above (a pre-release tail allowed)", () => {
	const v = version(ROOT);
	assert.match(v, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, v);
	assert.ok(Number.parseInt(v, 10) >= 1, v);
});
