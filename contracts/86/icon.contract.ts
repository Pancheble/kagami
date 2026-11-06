// #86 잎 #85의 약속: 플러그인 아이콘이 claude plugin validate의 조건을 지킨다. 정사각 PNG, 512~2048px, 2MB 미만. 위치는 plugin.json icon, 없으면 .claude-plugin/icon.png
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

test("아이콘: 정사각 PNG, 한 변 512~2048px, 2MB 미만", () => {
	const manifest = JSON.parse(
		readFileSync(join(ROOT, ".claude-plugin/plugin.json"), "utf8"),
	);
	const path = join(ROOT, manifest.icon ?? ".claude-plugin/icon.png");
	assert.ok(existsSync(path), `아이콘 없음: ${path}`);
	const png = readFileSync(path);
	assert.ok(
		png.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
		"PNG가 아니다",
	);
	const w = png.readUInt32BE(16);
	const h = png.readUInt32BE(20);
	assert.equal(w, h, "정사각이 아니다");
	assert.ok(w >= 512 && w <= 2048, `한 변 ${w}px`);
	assert.ok(png.length < 2 * 1024 * 1024, `${png.length}바이트`);
});
