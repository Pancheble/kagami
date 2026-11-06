// #86 leaf #85's contract: the plugin icon meets claude plugin validate's conditions. Square PNG, 512–2048px, under 2MB. Location is plugin.json icon, else .claude-plugin/icon.png
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

test("icon: square PNG, 512–2048px per side, under 2MB", () => {
	const manifest = JSON.parse(
		readFileSync(join(ROOT, ".claude-plugin/plugin.json"), "utf8"),
	);
	const path = join(ROOT, manifest.icon ?? ".claude-plugin/icon.png");
	assert.ok(existsSync(path), `no icon: ${path}`);
	const png = readFileSync(path);
	assert.ok(
		png.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
		"not a PNG",
	);
	const w = png.readUInt32BE(16);
	const h = png.readUInt32BE(20);
	assert.equal(w, h, "not square");
	assert.ok(w >= 512 && w <= 2048, `side ${w}px`);
	assert.ok(png.length < 2 * 1024 * 1024, `${png.length} bytes`);
});
