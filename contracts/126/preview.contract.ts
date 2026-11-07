// #126 leaf G's contract: the social preview image is in the repo (the human uploads it in Settings). PNG 1280x640, under 1MB (GitHub's recommendation and limit)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

test(".github/social-preview.png: PNG 1280x640, under 1MB", () => {
	const png = readFileSync(join(ROOT, ".github/social-preview.png"));
	assert.ok(
		png.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
		"not a PNG",
	);
	assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1280, 640]);
	assert.ok(png.length < 1024 * 1024, `${png.length} bytes`);
});
