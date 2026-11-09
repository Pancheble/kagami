// #165 acceptance test (node goal): /kagami:init on a repo that already has code and commits. Existing files, main and issues stay as they are;
// the kagami files, 9 labels, a dev branch with one commit and a board appear. Real git, fake gh (contracts/165/repo.ts, contracts/155/github.ts)
// Not checked here (leaf done criteria): the skill guide, the push and the default branch change the human does, README FAQ
import assert from "node:assert/strict";
import { test } from "node:test";
import { linked } from "../../src/board.ts";
import { init, plan } from "../../src/init.ts";
import { github } from "../155/github.ts";
import { gh, R, ROOT, repo } from "./repo.ts";

test("existing repo: init --existing installs beside the code and links a board; nothing existing changes", async () => {
	const mine = {
		"README.md": "# app\n",
		"src/main.c": "int main(void) { return 0; }\n",
		"CLAUDE.md": "Build with make.\n",
		"CONTRIBUTING.md": "Ask first.\n",
	};
	const r = repo(mine);
	const board = github();
	const g = gh(board.run);

	const out = await init(
		r.dir,
		{ root: ROOT, ref: "dev", existing: true },
		g.run,
	);

	assert.equal(out.target, R);
	assert.ok(out.board);
	assert.deepEqual(await linked(R, board.run), [
		{ owner: "o", number: out.board },
	]);
	assert.equal(g.labels.length, 9);
	assert.ok(!g.calls.some((c) => c[1] === "issue"));

	assert.equal(r.git("rev-parse", "main"), r.main);
	assert.equal(r.git("rev-parse", "dev~1"), r.main);
	for (const f of ["README.md", "src/main.c", "CONTRIBUTING.md"])
		assert.equal(r.read(f), mine[f as keyof typeof mine], f);
	assert.ok(r.read("CLAUDE.md").startsWith(mine["CLAUDE.md"]));
	assert.ok(r.read("CLAUDE.md").includes("@AGENTS.md"));
	for (const f of Object.keys(plan(ROOT, { repo: R }).files))
		assert.ok(r.read(f).length > 0, f);
	assert.equal(r.git("status", "--porcelain"), "");
});
