// #51 잎 1: 플러그인 구성 읽기. 저장소 루트가 곧 플러그인이다(marketplace.json의 source "./").
// .claude-plugin/plugin.json·marketplace.json, skills/<이름>/SKILL.md의 frontmatter, agents/<이름>.md를 읽는다
// 계약: contracts/51/plugin.contract.ts, 인수: contracts/51/plugin.accept.ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Skill = {
	name: string; // frontmatter name. /kagami:<name>
	description: string;
	license: string;
	model: boolean; // 모델이 부를 수 있나: disable-model-invocation: true가 없으면 true
	keys: string[]; // frontmatter에 적힌 키 전부
};
export type Agent = {
	name: string; // frontmatter name. kagami:<name>
	description: string;
	body: string; // frontmatter 아래 본문
};
export type Components = {
	plugin: string; // plugin.json name
	version: string; // plugin.json version
	marketplace: string; // marketplace.json name
	source: string; // marketplace.json의 이 플러그인 항목 source
	skills: Skill[];
	agents: Agent[];
};

const read = (root: string, f: string) => readFileSync(join(root, f), "utf8");
// --- 사이의 `키: 값` 줄. 값의 앞뒤 따옴표는 뗀다. 여러 줄 값은 쓰지 않는다
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
