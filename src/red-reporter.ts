// 처음엔 빨강 검사용 node:test 리포터: 스위트 말고 테스트마다 {name, ok, error} 한 줄 JSON.
// 건너뛴 테스트(skip·todo)는 test:pass로 와서 빨강이 아닌 것으로 친다
import type { TestEvent } from "node:test/reporters";

export default async function* (source: AsyncIterable<TestEvent>) {
	for await (const e of source) {
		if (e.type !== "test:pass" && e.type !== "test:fail") continue;
		if (e.data.details.type === "suite") continue;
		const err = e.type === "test:fail" ? e.data.details.error : undefined;
		yield `${JSON.stringify({
			name: e.data.name,
			ok: e.type === "test:pass",
			error: String(err?.cause ?? err ?? ""),
		})}\n`;
	}
}
