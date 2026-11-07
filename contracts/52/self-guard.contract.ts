// #52 leaf E's contract: the kagami repo runs the kagami guard on its own PRs to dev. The guard code comes from dev, not from the PR (a PR must not judge itself), and no secret is used
// A PR that widens a contract on purpose: contract-change label + the file named on the TL;DR Changed: line → flagged instead of red (src/guard.ts allowed)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const yml = () =>
	readFileSync(join(ROOT, ".github/workflows/guard.yml"), "utf8");

test(".github/workflows/guard.yml runs src/guard.ts on PRs to dev with the guard code from dev", () => {
	const y = yml();
	assert.match(y, /pull_request:/, "pull_request");
	assert.match(y, /branches: \[dev\]/, "branches: [dev]");
	assert.match(y, /src\/guard\.ts --dir/, "guard.ts --dir");
	assert.match(
		y,
		/ref: (dev|\$\{\{ github\.base_ref \}\})/,
		"guard code checked out from dev",
	);
});

test(".github/workflows/guard.yml uses no secrets and only reads", () => {
	const y = yml();
	assert.ok(!y.includes("secrets."), "secrets.");
	assert.match(y, /contents: read/, "permissions contents: read");
});
