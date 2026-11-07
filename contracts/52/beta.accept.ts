// #52 acceptance test (branch goal): what the public beta needs is in place. Public files, token-free guard, the guard on kagami's own PRs, Pre-release in try, a 1.x version
// Not checked here (the try checks them): repo public, dev ruleset, sandbox secret deleted, gitleaks 0, tag and Release on one commit
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { finish } from "../../src/try.ts";
import { version } from "../../src/version.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const has = (f: string) => existsSync(join(ROOT, f));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("a newcomer can read it: LICENSE, THIRD_PARTY_NOTICES, README.md, README.ko.md", () => {
	for (const f of [
		"LICENSE",
		"THIRD_PARTY_NOTICES",
		"README.md",
		"README.ko.md",
	])
		assert.ok(has(f), f);
});

test("guards run without a token: target repos' guard and kagami's own guard", () => {
	assert.ok(
		!read("ci/guard.yml").includes("KAGAMI_READ_TOKEN"),
		"ci/guard.yml",
	);
	assert.ok(has(".github/workflows/guard.yml"), "own guard");
});

test("the beta can ship: version 1.x, and try marks a tailed version as Pre-release", () => {
	const v = version(ROOT);
	assert.ok(Number.parseInt(v, 10) >= 1, v);
	const r = finish("1.0.0-beta.1", []) as {
		tag?: string;
		prerelease?: boolean;
	};
	assert.deepEqual([r.tag, r.prerelease], ["v1.0.0-beta.1", true]);
});
