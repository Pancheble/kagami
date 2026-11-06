// #51 잎 1의 약속: 버전 정본은 plugin.json version, AGENTS.md 첫 줄 `<!-- kagami v<version> -->` (init이 찍고 next가 읽는다)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { stamp, stamped, version } from "../../src/version.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

test("version은 plugin.json의 version이다", () => {
	const v = version(ROOT);
	const json = JSON.parse(
		readFileSync(join(ROOT, ".claude-plugin/plugin.json"), "utf8"),
	);
	assert.equal(v, json.version);
});

test("stamp는 맨 첫 줄에 버전 줄을 달고 나머지는 그대로 둔다", () => {
	assert.equal(
		stamp("# AGENTS.md\n본문\n", "0.0.0"),
		"<!-- kagami v0.0.0 -->\n# AGENTS.md\n본문\n",
	);
});

test("이미 버전 줄이 있으면 바꾼다. 버전 줄은 늘 하나다", () => {
	const once = stamp("# AGENTS.md\n", "0.0.0");
	assert.equal(stamp(once, "1.2.3"), "<!-- kagami v1.2.3 -->\n# AGENTS.md\n");
});

test("stamped는 첫 줄의 버전을 읽고, 없으면 undefined", () => {
	assert.equal(stamped(stamp("# AGENTS.md\n", "1.2.3")), "1.2.3");
	assert.equal(stamped("# AGENTS.md\n"), undefined);
	assert.equal(stamped("# AGENTS.md\n<!-- kagami v1.0.0 -->\n"), undefined);
});
