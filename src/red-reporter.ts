// node:test reporter for the red-first check: one JSON line {name, ok, error} per test, not per suite.
// Skipped tests (skip, todo) arrive as test:pass and count as not red
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
