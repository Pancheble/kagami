// #51 leaf 1: the kagami version. The single source is version in .claude-plugin/plugin.json.
// Stamped on the very first line of the target repo's AGENTS.md as `<!-- kagami v<version> -->`. init stamps it (stamp) and next reads it (stamped)
// Contract: contracts/51/version.contract.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LINE = /^<!-- kagami v(\S+) -->\n/;

// version in plugin.json
export function version(root: string): string {
	return JSON.parse(
		readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8"),
	).version;
}

// Puts the version line at the top of md. If one is there, replaces that line (there is always one version line)
export function stamp(md: string, version: string): string {
	return `<!-- kagami v${version} -->\n${md.replace(LINE, "")}`;
}

// The version on the first line. undefined if none
export function stamped(md: string): string | undefined {
	return md.match(LINE)?.[1];
}
