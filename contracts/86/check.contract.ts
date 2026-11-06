// #86 leaf #84's contract: npm run check also runs the contract and acceptance tests in contracts/**
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const scripts: Record<string, string> = JSON.parse(
	readFileSync(join(ROOT, "package.json"), "utf8"),
).scripts;

// every script body reached from check through npm run <x> / npm test
function reach(name: string, seen = new Set<string>()): string[] {
	if (seen.has(name) || !scripts[name]) return [];
	seen.add(name);
	const body = scripts[name];
	const next = [...body.matchAll(/npm (?:run ([\w:-]+)|(test)\b)/g)].map(
		(m) => m[1] ?? m[2],
	);
	return [body, ...next.flatMap((n) => reach(n, seen))];
}

test("a script reached from check runs the tests in contracts/", () => {
	const bodies = reach("check");
	assert.ok(bodies.length, "no check script");
	assert.ok(
		bodies.some((b) => /node --test\b.*contracts\//.test(b)),
		bodies.join(" | "),
	);
});
