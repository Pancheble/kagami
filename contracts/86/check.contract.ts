// #86 잎 #84의 약속: npm run check가 contracts/**의 계약·인수 테스트까지 돈다
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const scripts: Record<string, string> = JSON.parse(
	readFileSync(join(ROOT, "package.json"), "utf8"),
).scripts;

// check에서 npm run <x> / npm test로 닿는 스크립트 본문 전부
function reach(name: string, seen = new Set<string>()): string[] {
	if (seen.has(name) || !scripts[name]) return [];
	seen.add(name);
	const body = scripts[name];
	const next = [...body.matchAll(/npm (?:run ([\w:-]+)|(test)\b)/g)].map(
		(m) => m[1] ?? m[2],
	);
	return [body, ...next.flatMap((n) => reach(n, seen))];
}

test("check에서 닿는 스크립트가 contracts/의 테스트를 돌린다", () => {
	const bodies = reach("check");
	assert.ok(bodies.length, "check 스크립트가 없다");
	assert.ok(
		bodies.some((b) => /node --test\b.*contracts\//.test(b)),
		bodies.join(" | "),
	);
});
