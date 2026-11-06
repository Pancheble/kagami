// #86 leaf P's contract: the plan changes field of the TL;DR Changed line is not left as the blank placeholder
// One of two ways (the human picks in the leaf): changed.ts counts plan changes and prints no placeholder, or the evaluator FAILs a TL;DR with the placeholder left
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("plan changes: changed.ts counts it, or the evaluator FAILs a leftover placeholder", () => {
	const counted = !read("src/changed.ts").includes("(직접)");
	const caught = read("agents/evaluator.md")
		.split("\n")
		.some((l) => l.includes("(직접)") && l.includes("FAIL"));
	assert.ok(
		counted || caught,
		"changed.ts still prints the placeholder and the evaluator does not catch it",
	);
});
