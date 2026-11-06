// #51 잎 1: kagami 버전. 정본은 .claude-plugin/plugin.json의 version 하나다.
// 대상 저장소 AGENTS.md 맨 첫 줄에 `<!-- kagami v<version> -->`로 찍는다. init이 찍고(stamp) next가 읽는다(stamped)
// 계약: contracts/51/version.contract.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LINE = /^<!-- kagami v(\S+) -->\n/;

// plugin.json의 version
export function version(root: string): string {
	return JSON.parse(
		readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8"),
	).version;
}

// md 맨 위에 버전 줄을 단다. 이미 있으면 그 줄을 바꾼다(버전 줄은 늘 하나)
export function stamp(md: string, version: string): string {
	return `<!-- kagami v${version} -->\n${md.replace(LINE, "")}`;
}

// 첫 줄의 버전. 없으면 undefined
export function stamped(md: string): string | undefined {
	return md.match(LINE)?.[1];
}
