// #51 leaf 1: reads the plugin setup. The repo root is the plugin (source "./" in marketplace.json).
// Reads .claude-plugin/plugin.json and marketplace.json, the frontmatter of skills/<name>/SKILL.md, and agents/<name>.md
// Contract: contracts/51/plugin.contract.ts, acceptance: contracts/51/plugin.accept.ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Skill = {
	name: string; // frontmatter name. /kagami:<name>
	description: string;
	license: string;
	model: boolean; // can the model call it: true unless disable-model-invocation: true is set
	keys: string[]; // every key written in the frontmatter
};
export type Agent = {
	name: string; // frontmatter name. kagami:<name>
	description: string;
	body: string; // the body below the frontmatter
};
export type Components = {
	plugin: string; // plugin.json name
	version: string; // plugin.json version
	marketplace: string; // marketplace.json name
	source: string; // source of this plugin's entry in marketplace.json
	skills: Skill[];
	agents: Agent[];
};

const read = (root: string, f: string) => readFileSync(join(root, f), "utf8");
// `key: value` lines between ---. Quotes around a value are stripped. Multi-line values are not used
function frontmatter(md: string): { fm: Record<string, string>; body: string } {
	const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
	const fm: Record<string, string> = {};
	for (const line of m?.[1].split("\n") ?? []) {
		const kv = line.match(/^([\w-]+):\s*(.*)$/);
		if (kv) fm[kv[1]] = kv[2].replace(/^(["'])(.*)\1$/, "$2");
	}
	return { fm, body: m ? md.slice(m[0].length) : md };
}
const dirs = (root: string, d: string) =>
	existsSync(join(root, d))
		? readdirSync(join(root, d), { withFileTypes: true })
		: [];

export function components(root: string): Components {
	const plugin = JSON.parse(read(root, ".claude-plugin/plugin.json"));
	const market = JSON.parse(read(root, ".claude-plugin/marketplace.json"));
	const skills = dirs(root, "skills")
		.filter(
			(e) =>
				e.isDirectory() && existsSync(join(root, "skills", e.name, "SKILL.md")),
		)
		.map((e) => {
			const { fm } = frontmatter(read(root, `skills/${e.name}/SKILL.md`));
			return {
				name: fm.name ?? e.name,
				description: fm.description ?? "",
				license: fm.license ?? "",
				model: fm["disable-model-invocation"] !== "true",
				keys: Object.keys(fm),
			};
		});
	const agents = dirs(root, "agents")
		.filter((e) => e.isFile() && e.name.endsWith(".md"))
		.map((e) => {
			const { fm, body } = frontmatter(read(root, `agents/${e.name}`));
			return {
				name: fm.name ?? e.name.slice(0, -3),
				description: fm.description ?? "",
				body,
			};
		});
	return {
		plugin: plugin.name,
		version: plugin.version,
		marketplace: market.name,
		source: market.plugins.find((p: { name: string }) => p.name === plugin.name)
			?.source,
		skills,
		agents,
	};
}
