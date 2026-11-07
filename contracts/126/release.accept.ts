// #126 acceptance test (branch goal): v1.0.0 is out. CHANGELOG has a plain 1.0.0 entry, the community files and preview are in, try moves main for plain releases, no marketplace name clash
// Not checked here (the try checks them): the v1.0.0 tag, Release and main on one commit, description and topics, the beta feedback leaves
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { finish } from "../../src/try.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const has = (f: string) => existsSync(join(ROOT, f));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("CHANGELOG.md has a plain 1.0.0 entry", () => {
	assert.match(read("CHANGELOG.md"), /^#+ .*\b1\.0\.0\b(?!-)/m);
});

test("the public face is in: community files and social preview", () => {
	for (const f of [
		"SECURITY.md",
		"CODE_OF_CONDUCT.md",
		".github/dependabot.yml",
		".github/CODEOWNERS",
		".github/social-preview.png",
	])
		assert.ok(has(f), f);
});

test("v1.0.0 moves main and is not a Pre-release", () => {
	const r = finish("1.0.0", []) as { main?: boolean; prerelease?: boolean };
	assert.deepEqual([r.main, r.prerelease], [true, false]);
});

test("no kagami marketplace name clash in the kagami repo", () => {
	const s = JSON.parse(read(".claude/settings.json"));
	assert.notEqual(
		s.extraKnownMarketplaces?.kagami?.source?.source,
		"directory",
	);
});
