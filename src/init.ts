// #51 잎 5: /kagami:init이 빈 새 저장소에 깔 것. plan은 무엇을 깔지 계산만 한다(쓰기와 gh 호출은 CLI가 한다)
// root는 kagami 플러그인 루트(${CLAUDE_PLUGIN_ROOT}). AGENTS.md·CONTRIBUTING.md·이슈 템플릿·ci/guard.yml은 거기서 읽는다
// 계약: contracts/51/init.contract.ts

export type Plan = {
	files: Record<string, string>; // 대상 저장소 경로 → 내용
	labels: string[]; // 만들 라벨 이름(tree.ts LABELS와 같은 9개)
	branch: string; // 만들 브랜치(dev 하나)
};

// repo: kagami 저장소(owner/name). ref: 대상 저장소가 고정할 kagami ref. 없으면 `v<plugin.json version>`
export function plan(_root: string, _o: { repo: string; ref?: string }): Plan {
	throw new Error("not implemented");
}
