@AGENTS.md

# Project

kagami 방식(the kagami workflow)으로 일한다. 규칙은 위에서 불러온 `AGENTS.md`, 이유는 `docs/design.md`를 본다.

# Commands

- 설치: `npm ci`
- 타입체크: `npm run typecheck`
- 린트·포맷 검사: `npm run lint` (고치기: `npx biome check --write .`)
- 테스트: `npm test` (`src/**/*.test.ts`, node:test)
- 계약·인수 테스트: `npm run contracts` (`contracts/**/*.ts`. 쪼갠 직후엔 아직 안 닫힌 잎의 계약이 빨갛다. CI는 돌리지 않는다)
- 넷 다: `npm run check`
- TypeScript는 빌드 없이 `node src/x.ts`로 바로 돈다. 그래서 enum·namespace·생성자 파라미터 프로퍼티처럼 지워지지 않는 문법은 못 쓰고, import에 `.ts` 확장자를 붙인다

# Risk paths (여기 걸리면 동작 시나리오를 써서 사람 승인)

- `.github/workflows/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, `.env*` (kagami:init이 까는 기본값)
- `.claude/settings.json`, `.claude/agents/` (`.claude/`에 들지만 따로 적어 둔다)
- `ci/` (대상 저장소에 까는 워크플로. 팀 저장소의 CI가 된다)
- `src/run.ts` (명령 실행 sh와, 가드가 대상 저장소 코드를 인증 없이 돌리는 noKey)
- `src/guard.ts` (CI 가드: PR마다 계약 수정·래칫·위험 경로를 판정해 빨강·초록·표시로 보인다)
- `hooks/` (dev 직접 push를 막는 git pre-push hook)
- `skills/`, `agents/`, `.claude-plugin/` (플러그인 kagami의 스킬·평가자·마켓플레이스. `.claude/agents/`의 보호를 새 위치로 옮긴다)
- 이 목록 자체 (백틱으로 적은 경로만 사실 계산이 읽는다. 목록이 바뀌면 그것도 위험 경로로 센다)

# Rules

- `.env` 등 비밀값 파일은 읽거나 커밋하지 않는다. 필요한 변수는 `.env.example`에 이름만 적는다
- cwc-long-running-agents에서 가져온 파일은 Apache-2.0 출처를 파일 머리에 적는다
