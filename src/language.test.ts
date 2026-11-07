// #117: the English of AGENTS.md and the skills must not decide the language the agent talks to the human in
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (f: string) =>
	readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const section = (md: string, title: string) =>
	md.split(/^## /m).find((s) => s.startsWith(`${title}\n`)) ?? "";

test("AGENTS.md Language: talk in the human's language, for everything the human reads, field names as written", () => {
	const lang = section(read("AGENTS.md"), "Language");
	assert.match(lang, /in the language they write in/);
	assert.match(lang, /even though this document and the skills are in English/);
	for (const shown of ["recommendations", "plan notice", "PR TL;DR"])
		assert.ok(lang.includes(shown), shown);
	assert.match(lang, /has not written anything yet/);
	assert.match(lang, /`Where:`/);
	assert.match(lang, /`## Goal`/);
});

test("/kagami:next reads AGENTS.md Language before its first answer", () => {
	assert.match(read("skills/next/SKILL.md"), /Sections to read: "Language"/);
});
