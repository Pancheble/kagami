// #119: every record marker a skill leaves must be listed in AGENTS.md "Record format"
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (f: string) =>
	readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const section = (md: string, title: string) =>
	md.split(/^## /m).find((s) => s.startsWith(`${title}\n`)) ?? "";

// A record marker starts a line or follows a backtick: `**blocked** …`. Bold words inside prose are not records
const markers = (md: string) =>
	[...md.matchAll(/(?:^|`)\*\*([a-z][a-z-]*(?: [a-z-]+)*)\*\*/gm)].map(
		(m) => m[1],
	);

test("every record marker the skills leave is in AGENTS.md Record format", () => {
	const format = section(read("AGENTS.md"), "Record format");
	const used = new Set(
		readdirSync(new URL("../skills/", import.meta.url)).flatMap((s) =>
			markers(read(`skills/${s}/SKILL.md`)),
		),
	);
	assert.ok(used.has("trying a branch"), [...used].join(", "));
	for (const m of used) assert.ok(format.includes(`**${m}**`), m);
});

test("trying a branch is a marker only, with no label", () => {
	const format = section(read("AGENTS.md"), "Record format");
	assert.match(format, /`trying a branch` (?:is|are) (?:a )?markers? only/);
	assert.match(format, /^\*\*trying a branch\*\* .*\(the human\)/m);
});
