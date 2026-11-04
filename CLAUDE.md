@AGENTS.md

# Project

가운데 방식으로 일한다. 규칙은 위에서 불러온 `AGENTS.md`, 이유는 `docs/harness/가운데 설계.md`를 본다.

# Commands

- 설치: `npm ci`
- 타입체크: `npm run typecheck`
- 린트·포맷 검사: `npm run lint` (고치기: `npx biome check --write .`)
- 테스트: `npm test` (`src/**/*.test.ts`, node:test)
- 셋 다: `npm run check`
- TypeScript는 빌드 없이 `node src/x.ts`로 바로 돈다. 그래서 enum·namespace·생성자 파라미터 프로퍼티처럼 지워지지 않는 문법은 못 쓰고, import에 `.ts` 확장자를 붙인다

# Risk paths (여기 걸리면 동작 시나리오를 써서 사람 승인)

- `src/promote.ts` (main을 옮기는 스크립트: 8 보고서의 /맞다 판정과 main fast-forward)
- `.claude/settings.json`, `.claude/agents/`
- `.github/workflows/`
- `ci/` (대상 저장소에 까는 워크플로. 팀 저장소의 CI가 된다)
- `prompts/` (세션 역할 프롬프트)
- `src/session.ts` (세션 인증 제거와 역할마다 거는 권한 플래그)
- `src/guard.ts` (dev로 가는 유일한 문: 순차 머지와 그 앞의 판정)
- `hooks/` (구현 세션에 거는 hook 스크립트. 도구 호출을 막을 수 있다. main push를 막는 git pre-push hook)
- 이 목록 자체 (백틱으로 적은 경로만 사실 계산이 읽는다. 목록이 바뀌면 그것도 위험 경로로 센다)

# Rules

- `.env` 등 비밀값 파일은 읽거나 커밋하지 않는다. 필요한 변수는 `.env.example`에 이름만 적는다
- cwc-long-running-agents에서 가져온 파일은 Apache-2.0 출처를 파일 머리에 적는다
