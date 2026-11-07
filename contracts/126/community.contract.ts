// #126 leaf F's contract: the community files GitHub's Community Standards look for, plus dependabot and CODEOWNERS
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("SECURITY.md and CODE_OF_CONDUCT.md exist and are not empty", () => {
	for (const f of ["SECURITY.md", "CODE_OF_CONDUCT.md"])
		assert.ok(read(f).trim().length > 0, f);
});

test("CHANGELOG.md has an entry for the first beta 1.0.0-beta.1", () => {
	assert.match(read("CHANGELOG.md"), /^#+ .*1\.0\.0-beta\.1/m);
});

test(".github/dependabot.yml: version 2, updates npm and github-actions", () => {
	const y = read(".github/dependabot.yml");
	assert.match(y, /^version: 2$/m, "version: 2");
	for (const e of ["npm", "github-actions"])
		assert.match(y, new RegExp(`package-ecosystem: "?${e}"?`), e);
});

test(".github/CODEOWNERS has an owner for every file (a * line)", () => {
	assert.match(read(".github/CODEOWNERS"), /^\*\s+@\S+/m);
});
