import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { sh } from "./leaf.ts";
import { red } from "./split.ts";

// 진짜 node --test로 돌린다. 쪼개기가 만들 법한 contracts/7/ 아래 파일들
function repo(files: Record<string, string>) {
	const dir = mkdtempSync(join(tmpdir(), "red-"));
	for (const [f, body] of Object.entries(files)) {
		mkdirSync(join(dir, f, ".."), { recursive: true });
		writeFileSync(join(dir, f), body);
	}
	return dir;
}
// git ls-files 대신 파일 목록을 돌려주는 실행기. 나머지는 진짜 sh.
// 바깥 node --test가 물려주는 NODE_TEST_CONTEXT가 있으면 안쪽 node --test가 리포터를 안 써서 뺀다
const runIn =
	(files: string[]) => (cmd: string, args: string[], cwd?: string) =>
		cmd === "git"
			? Promise.resolve(files.join("\n"))
			: sh("env", ["-u", "NODE_TEST_CONTEXT", cmd, ...args], cwd);

const stub = `export function add() { throw new Error("not implemented"); }\n`;
const contract = `import { test } from "node:test";
import assert from "node:assert/strict";
import { add } from "../../src/add.js";
test("add는 합을 돌려준다", () => assert.equal(add(1, 2), 3));
test("add는 음수도 더한다", () => assert.equal(add(-1, -2), -3));
`;

test("테스트 하나하나가 not implemented로 실패하면 빨강이다", async () => {
	const files = ["contracts/7/add.contract.js"];
	const dir = repo({ "src/add.js": stub, [files[0]]: contract });
	const r = await red(7, dir, runIn(files));
	assert.equal(r.ok, true, r.report);
	assert.match(r.report, /add는 합을 돌려준다/);
	assert.match(r.report, /add는 음수도 더한다/);
});

test("파일 안에 통과하는 테스트가 하나라도 있으면 빨강이 아니다", async () => {
	const files = ["contracts/7/add.contract.js"];
	const dir = repo({
		"src/add.js": stub,
		[files[0]]: `${contract}test("늘 통과", () => {});\n`,
	});
	const r = await red(7, dir, runIn(files));
	assert.equal(r.ok, false);
	assert.match(r.report, /늘 통과/);
});

test("불러오기 실패로 인한 빨강은 통과가 아니다", async () => {
	const files = ["contracts/7/add.contract.js"];
	const dir = repo({ [files[0]]: contract }); // 스텁이 없다
	const r = await red(7, dir, runIn(files));
	assert.equal(r.ok, false, r.report);
});

test("문법 에러로 인한 빨강은 통과가 아니다", async () => {
	const files = ["contracts/7/add.accept.js"];
	const dir = repo({ "src/add.js": stub, [files[0]]: "test((" });
	assert.equal((await red(7, dir, runIn(files))).ok, false);
});

test("not implemented가 아닌 이유로 실패하면 빨강이 아니다", async () => {
	const files = ["contracts/7/add.accept.js"];
	const dir = repo({
		"src/add.js": `export function add() { return 0; }\n`,
		[files[0]]: contract,
	});
	assert.equal((await red(7, dir, runIn(files))).ok, false);
});

test("테스트가 없는 파일, 테스트 파일이 없는 노드는 빨강이 아니다", async () => {
	const files = ["contracts/7/empty.contract.js"];
	const dir = repo({ [files[0]]: "" });
	assert.equal((await red(7, dir, runIn(files))).ok, false);
	assert.equal((await red(7, dir, runIn([]))).ok, false);
});

test("contracts/<노드>/의 계약·인수 테스트 파일만 돌린다", async () => {
	const files = [
		"contracts/7/add.contract.js",
		"contracts/7/leaves.json",
		"contracts/7/helper.js",
	];
	const dir = repo({
		"src/add.js": stub,
		[files[0]]: contract,
		[files[1]]: "{}",
		[files[2]]: "throw new Error('돌리면 안 된다')",
	});
	assert.equal((await red(7, dir, runIn(files))).ok, true);
});
