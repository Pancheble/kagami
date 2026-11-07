// #52 leaf A's contract: files for going public. MIT LICENSE, and an English README.md and a Korean README.ko.md that link to each other and show how to install
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("LICENSE is MIT, Copyright (c) 2026 baekchan", () => {
	const l = read("LICENSE");
	assert.ok(l.includes("MIT License"), "not MIT");
	assert.ok(l.includes("Copyright (c) 2026 baekchan"), "copyright line");
});

test("README.md (English) and README.ko.md (Korean) link to each other", () => {
	assert.ok(read("README.md").includes("README.ko.md"), "README.md → ko");
	const ko = read("README.ko.md");
	assert.ok(ko.includes("README.md"), "README.ko.md → en");
	assert.match(ko, /[가-힣]/, "README.ko.md is not Korean");
});

test("both READMEs show how to install: the Pancheble/kagami marketplace and /kagami:init", () => {
	for (const f of ["README.md", "README.ko.md"]) {
		const md = read(f);
		assert.ok(md.includes("Pancheble/kagami"), `${f}: marketplace`);
		assert.ok(md.includes("/kagami:init"), `${f}: /kagami:init`);
	}
});
