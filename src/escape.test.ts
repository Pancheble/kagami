import assert from "node:assert/strict";
import { test } from "node:test";
import { record } from "./escape.ts";
import type { Run } from "./leaf.ts";

// 가짜 GitHub: escape 이슈와 라벨을 기억한다
// lag: 목록이 방금 만든 이슈를 아직 못 본다(시험 저장소에서 일어났다)
function fake(
	before: { number: number; labels: string[] }[] = [],
	lag = false,
) {
	const issues = [...before];
	const calls: string[] = [];
	const run: Run = async (cmd, args) => {
		calls.push([cmd, ...args].join(" "));
		if (
			args[0] === "api" &&
			args.includes("POST") &&
			args[1].endsWith("/issues")
		) {
			const number = 100 + issues.length;
			issues.push({
				number,
				labels: args
					.filter((a) => a.startsWith("labels[]="))
					.map((a) => a.slice(9)),
			});
			return JSON.stringify({ number });
		}
		// 종류별 목록은 REST로 읽는다(gh issue list는 검색 색인이라 방금 만든 이슈가 늦게 잡힌다)
		const list = args[2]?.match(
			/^repos\/o\/kagami\/issues\?labels=([^&]+)&state=all/,
		);
		if (args[0] === "api" && args[1] === "--paginate" && list)
			return issues
				.slice(0, lag ? -1 : undefined)
				.filter((i) => i.labels.includes(decodeURIComponent(list[1])))
				.map((i) => `${i.number}\n`)
				.reverse()
				.join("");
		return "";
	};
	return { calls, run, issues };
}

const o = { repo: "o/kagami" };

test("escape는 하네스 저장소에 escape 이슈를 한 줄로 만들고 종류를 라벨로 단다", async () => {
	const { calls, run, issues } = fake();
	const r = await record(
		{
			...o,
			kind: "래칫",
			text: "dev에 의존성이 없어 래칫이 빨강을 봐줬다",
			from: "o/r#33",
		},
		run,
	);
	assert.deepEqual(r, { issue: 100, same: [100] });
	const post =
		calls.find((c) => c.startsWith("gh api repos/o/kagami/issues -X POST")) ??
		"";
	assert.match(
		post,
		/-f title=escape: dev에 의존성이 없어 래칫이 빨강을 봐줬다/,
	);
	assert.match(post, /- 종류: 래칫/);
	assert.match(post, /- 어디서: o\/r#33/);
	assert.deepEqual(issues[0].labels, ["escape", "escape:래칫"]);
	// 라벨은 필요할 때 만든다
	assert.ok(calls.includes("gh label create escape -R o/kagami"));
	assert.ok(calls.includes("gh label create escape:래칫 -R o/kagami"));
	// 두 번째까지는 알리지 않는다
	assert.ok(!calls.some((c) => c.startsWith("gh issue comment")));
});

test("같은 종류가 3번 쌓이면 장치를 넣을 차례라고 새 이슈에 댓글로 남긴다. 다른 종류는 세지 않는다", async () => {
	const { calls, run } = fake([
		{ number: 1, labels: ["escape", "escape:래칫"] },
		{ number: 2, labels: ["escape", "escape:claim"] },
		{ number: 3, labels: ["escape", "escape:래칫"] },
	]);
	const r = await record({ ...o, kind: "래칫", text: "또 봐줬다" }, run);
	assert.deepEqual(r, { issue: 103, same: [1, 3, 103] });
	assert.ok(
		calls.includes(
			"gh issue comment 103 -R o/kagami --body 같은 종류(래칫)가 3번 쌓였다: #1, #3, #103. 장치를 넣을 차례다 (9 빈틈: 옛 하네스와 새 하네스로 막힌 티켓을 돌려 비교한다)",
		),
		calls.join("\n"),
	);
	const post = calls.find((c) => c.includes("-X POST")) ?? "";
	assert.match(post, /- 어디서: 없음/);
});

test("목록이 방금 만든 이슈를 아직 못 봐도 그 이슈는 센다", async () => {
	const { calls, run } = fake(
		[
			{ number: 1, labels: ["escape", "escape:래칫"] },
			{ number: 2, labels: ["escape", "escape:래칫"] },
		],
		true,
	);
	const r = await record({ ...o, kind: "래칫", text: "세 번째" }, run);
	assert.deepEqual(r, { issue: 102, same: [1, 2, 102] });
	assert.ok(calls.some((c) => c.startsWith("gh issue comment 102")));
});
