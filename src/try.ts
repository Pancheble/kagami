// #51 잎 4: /kagami:try의 "괜찮다" 마무리. 확인 답을 셋으로 나누는 것은 CC가 한다. 여기서는 태그를 달지와 Release 설명만 정한다
// v1.0.0 전에는 태그와 Release 없이 큰 가지만 닫는다(AGENTS.md "큰 가지 확인")
// 계약: contracts/51/try.contract.ts

// version은 plugin.json version. titles는 그 큰 가지 잎들의 PR 제목(머지 순서)
// tag: 달 태그(`v<version>`). 1.0.0보다 낮으면 없다. notes: Release 설명, 제목마다 "- <제목>" 한 줄
export function finish(
	version: string,
	titles: string[],
): { tag?: string; notes: string } {
	const notes = titles.map((t) => `- ${t}`).join("\n");
	return Number.parseInt(version, 10) >= 1
		? { tag: `v${version}`, notes }
		: { notes };
}

// node src/try.ts <version> [잎 PR 제목...] → {tag?, notes} JSON
if (import.meta.main) {
	const [version, ...titles] = process.argv.slice(2);
	if (!version) throw new Error("쓰는 법: node src/try.ts <version> [제목...]");
	console.log(JSON.stringify(finish(version, titles)));
}
