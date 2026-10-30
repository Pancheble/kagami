# Project

트리 하네스를 TypeScript로 만든다. 무엇을 만드는지는 `docs/harness/하네스 전체 흐름.md`, 부품은 `docs/harness/블록 목록.md`, 순서와 티켓은 `docs/harness/0단계.md`를 본다.

# Commands

- 설치: `npm ci`
- 타입체크: `npm run typecheck`
- 린트·포맷 검사: `npm run lint` (고치기: `npx biome check --write .`)
- 테스트: `npm test` (`src/**/*.test.ts`, node:test)
- 셋 다: `npm run check`
- TypeScript는 빌드 없이 `node src/x.ts`로 바로 돈다. 그래서 enum·namespace·생성자 파라미터 프로퍼티처럼 지워지지 않는 문법은 못 쓰고, import에 `.ts` 확장자를 붙인다

# Harness (0단계: 가벼운 티켓 루프)

- 티켓 하나 = 세션 하나 = PR 하나
- 구현: 테스트부터 쓴다
- 평가: `.claude/agents/evaluator.md` (Write/Edit 없음). NEEDS_WORK면 고치고 다시, 3번까지
- 머지: 평가 PASS + CI 초록이면 사람이 머지한다. 0단계는 PR까지만
- 트렁크는 `dev`. PR은 `dev`로. `main`에는 직접 커밋·push하지 않는다

# Risk paths (여기 걸리면 동작 시나리오를 써서 사람 승인)

- main을 옮기는 스크립트 (T11에서 생김)
- `.claude/settings.json`, `.claude/agents/`
- `.github/workflows/`

# Rules

- 한 번에 티켓 하나만 한다. 티켓 범위 밖의 파일은 건드리지 않는다
- 지금 필요 없는 추상화를 만들지 않는다
- 기존 설계가 새 요구사항과 충돌하면 패치하지 말고 알린다
- 완료 = 끝 기준대로 실제로 돌리고 증거를 남긴 것. 테스트를 고치거나 지워서 통과시키지 않는다
- `.env` 등 비밀값 파일은 읽거나 커밋하지 않는다. 필요한 변수는 `.env.example`에 이름만 적는다
- cwc-long-running-agents에서 가져온 파일은 Apache-2.0 출처를 파일 머리에 적는다

# 결정 규칙 (0단계)

- "어떻게"는 네가 정한다: 구현 방식, 파일 구조, 저장 위치, 형식, 순서.
  정한 건 PR의 "결정과 이유"에 남긴다. 판단이 애매하면 docs/harness의
  설계 문서와 블록 사전 원칙에 비춰 보고 정한다
- 사람에게는 이럴 때만 묻는다:
  1) docs/harness의 설계(흐름, 블록, 원칙)를 바꿔야 할 때
  2) "안 할 것"에 있는 걸 하거나, 티켓 범위를 넘어야 할 때
  3) 위험 경로(세션 권한, 인증, main 이동, CI)를 건드릴 때
  4) "일꾼 수만 1, 구조는 여럿일 때와 같게"를 지킬 수 없을 때
- 물을 땐 선택지 2~3개 + 득실 + 추천 하나
- 실제로 돌려서 찾은 문제는 고친다. 아직 안 일어난 문제를 미리 막는
  장치는 넣지 말고 escapes에 적는다. 같은 종류가 3번 쌓이면 그때 넣는다

# Gotchas

(Claude가 두 번 이상 실수한 것을 한 줄씩 추가)
