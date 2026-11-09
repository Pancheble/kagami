// #165 leaf B (guide) contract: the init skill handles a repo with code through --existing, and the README FAQ says it can
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (f: string) =>
	readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("init skill: passes --existing for a repo with code, and has the human switch the default branch to dev after the push", () => {
	const md = read("skills/init/SKILL.md");
	assert.ok(md.includes("--existing"));
	const human = md.slice(md.indexOf("## 3. What the human does"));
	const at = [
		"git push -u origin dev",
		"gh repo edit --default-branch dev",
	].map((s) => human.indexOf(s));
	assert.ok(at[0] >= 0 && at[1] > at[0], `${at}`);
	assert.doesNotMatch(md, /Do not handle a repository that already has code/);
});

test("README FAQ: existing projects are no longer 'not yet'", () => {
	assert.doesNotMatch(read("README.md"), /existing project\?\*\*\nNot yet/);
	assert.doesNotMatch(read("README.ko.md"), /아직은 아니에요/);
});
