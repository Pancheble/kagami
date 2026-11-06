// #51 잎 1: 플러그인 구성 읽기. 저장소 루트가 곧 플러그인이다(marketplace.json의 source "./").
// .claude-plugin/plugin.json·marketplace.json, skills/<이름>/SKILL.md의 frontmatter, agents/<이름>.md를 읽는다
// 계약: contracts/51/plugin.contract.ts, 인수: contracts/51/plugin.accept.ts

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

export function components(_root: string): Components {
	throw new Error("not implemented");
}
