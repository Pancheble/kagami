// #86 leaf X's contract: the accept-all experiment is not in the product. The experiment plan lives only in root #49 "decision 7", and records during the experiment are left by hand
// product = text the plugin ships or init installs in the target repo
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { plan } from "../../src/init.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const walk = (p: string): string[] =>
	statSync(join(ROOT, p)).isDirectory()
		? readdirSync(join(ROOT, p)).flatMap((e) => walk(join(p, e)))
		: [p];
const GONE = /not-what-i-wanted|accept-all|전부 수락/i;

test("product text has no not-what-i-wanted or accept-all (English or Korean)", () => {
	const files: [string, string][] = [
		...["AGENTS.md", "CONTRIBUTING.md", "skills", "agents"]
			.flatMap(walk)
			.map((f): [string, string] => [f, readFileSync(join(ROOT, f), "utf8")]),
		...Object.entries(plan(ROOT, { repo: "Pancheble/kagami" }).files).map(
			([f, body]): [string, string] => [`init:${f}`, body],
		),
	];
	const hits = files.flatMap(([f, body]) =>
		body
			.split("\n")
			.filter((l) => GONE.test(l))
			.map((l) => `${f}: ${l.slice(0, 80)}`),
	);
	assert.deepEqual(hits, []);
});
