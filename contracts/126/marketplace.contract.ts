// #126 leaf I's contract: the kagami repo's own .claude/settings.json does not register a directory marketplace under the name kagami,
// which target repos use for the GitHub marketplace (opening a target repo session overwrote the user-scope kagami marketplace)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

test(".claude/settings.json: no directory-source marketplace named kagami", () => {
	const s = JSON.parse(
		readFileSync(join(ROOT, ".claude/settings.json"), "utf8"),
	);
	const m = s.extraKnownMarketplaces?.kagami;
	assert.notEqual(m?.source?.source, "directory");
});
