// #51 잎 2·3: /kagami:next가 세션을 열 때 보는 것. 고르기와 추천은 CC가 한다. 여기서는 세기만 한다
// 잎 2: ready(준비된 일과 종류). 잎 3: stale, waiting, drift, leftover와 CLI
// 계약: contracts/51/next.contract.ts

export type State = "open" | "closed";
// tree.ts Tree에서 쓰는 칸만. 잎 2가 Tree에 labels·body를 더하면 Tree를 그대로 넘길 수 있다
export type Issue = {
	number: number;
	title: string;
	state: State;
	kind: "node" | "leaf"; // leaf 라벨이 있으면 leaf
	labels: string[];
	body: string;
	assignees: string[];
	blockedBy: { number: number; state: State }[];
	children: Issue[];
};

// build: 준비된 잎 구현 / split: 자식 없는 노드 쪼개기(칸이 다 있고 자식 없는 뿌리 포함) / plan: 칸이 빠진 뿌리 기획 대화 / try: 잎이 다 닫힌 큰 가지 확인
export type Kind = "build" | "split" | "plan" | "try";
export type Ready = { number: number; kind: Kind };

// root는 뿌리 이슈. 큰 가지는 뿌리의 바로 아래 노드다. 트리 순서(앞순회)로 낸다.
// 모두 공통: 열림, 할당 없음, blocked 라벨 없음, blocked-by가 다 닫힘. 닫힌 이슈 아래는 보지 않는다
export function ready(_root: Issue): Ready[] {
	throw new Error("not implemented");
}

// 이슈 번호 → 마지막 활동 시각(ISO). 활동 = 할당된 때, 잎 브랜치 푸시, PR(열기·커밋·댓글), 이슈 댓글 중 가장 늦은 것. CLI가 모은다
export type Activity = Record<number, string>;

// 할당된 열린 이슈 중 마지막 활동이 now보다 3일(72시간) 넘게 앞선 것. activity에 없는 이슈는 판정하지 않는다
export function stale(_root: Issue, _activity: Activity, _now: Date): number[] {
	throw new Error("not implemented");
}

// 열린 이슈 중 needs-decision 라벨이 붙은 것
export function waiting(_root: Issue): number[] {
	throw new Error("not implemented");
}

// 대상 저장소 AGENTS.md 첫 줄의 버전(version.ts stamped)과 플러그인 버전이 다르면 둘을 낸다. 같으면 undefined
export function drift(
	_agentsMd: string,
	_plugin: string,
): { repo?: string; plugin: string } | undefined {
	throw new Error("not implemented");
}

// 이슈마다 남은 잎 브랜치(leaf/<번호>-*). branches는 브랜치 이름 목록(refs/heads/·origin/ 없이). 없는 이슈는 빼고 낸다
export function leftover(
	_numbers: number[],
	_branches: string[],
): Record<number, string[]> {
	throw new Error("not implemented");
}
