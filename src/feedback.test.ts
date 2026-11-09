// #145: the beta feedback issue template is only for the kagami repo. init does not install it in target repos
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { plan } from "./init.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FILE = ".github/ISSUE_TEMPLATE/feedback.md";

test("feedback template has labels: bug and the three fields", () => {
	assert.ok(existsSync(ROOT + FILE), "no feedback.md");
	const md = readFileSync(ROOT + FILE, "utf8");
	assert.match(md, /^labels: bug$/m);
	for (const h of ["What you did", "What happened", "Environment"])
		assert.match(md, new RegExp(`^## ${h}$`, "m"), h);
});

test("init does not install the feedback template", () => {
	const files = Object.keys(plan(ROOT, { repo: "Pancheble/kagami" }).files);
	assert.ok(!files.some((f) => f.includes("feedback")), files.join(", "));
});
