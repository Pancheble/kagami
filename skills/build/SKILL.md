---
name: build
description: "Implement one kagami leaf issue test-first, get the evaluator's verdict, and open a PR to dev."
license: MIT
---

> 출처: https://github.com/mattpocock/skills (MIT, Matt Pocock), 커밋 `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`, `skills/engineering/implement/SKILL.md`. 라이선스 전문: `skills/LICENSE-mattpocock`.
> 고친 점: `/code-review`를 평가자 에이전트 판정으로 바꾸고, AGENTS.md의 계획 알림·멈춤 조건·PR 형식에 맞췄다. 시작할 때 `leaf/<번호>-` 브랜치로 옮기는 단계를 넣었다. kagami 플러그인으로 옮기며 이름을 build로, 부르는 tdd를 test로 바꿨다.

인자: 잎 이슈 번호. 사람이 준 잎 이슈를 구현한다. 규칙은 `AGENTS.md`가 기준이고, 여기는 구현 단계(AGENTS.md "한 번 일하는 순서" 6~9)를 한 자리에 모은 것이다.

## 시작

- 잎 이슈와 부모 이슈를 `gh issue view`로 읽고 잎 제목을 말한다. 번호가 애매하면 묻는다. 다른 PR은 뒤지지 않는다
- 지금 브랜치가 `leaf/<번호>-`로 시작하지 않으면(앱이 만든 `claude/...` 등) `git fetch origin && git switch -c leaf/<번호>-<짧은-이름> origin/dev`로 옮긴다. 그래야 `node "${CLAUDE_PLUGIN_ROOT}/src/changed.ts"`가 `--issue` 없이 잎 번호를 읽는다
- AGENTS.md "계획 알림 형식"(Where/Why/Scope/Done when/Decide)으로 계획을 보여 준다. `Decide`가 있을 때만 멈추고 답을 기다린다. 없으면 바로 진행한다
- 테스트할 seam(test 스킬의 "Seams")을 `Scope`에 적는다. 계획 알림이 멈추지 않고 진행해도(Decide 없음) seam은 합의한 것으로 본다. test에서 다시 묻지 않는다
- `Scope`가 3줄을 넘으면 시작하기 전에 쪼개자고 제안한다
- 검사 명령은 대상 저장소 CLAUDE.md의 "Commands" 절에서 읽는다. 패키지 매니저나 명령 이름을 짐작하지 않는다. 절이 없거나 검사 명령이 비었으면 사람에게 묻고, 받은 명령을 이 잎에 쓰고 평가자에게도 넘긴다. 사람이 "이 저장소엔 검사 명령이 없다"고 분명히 답하면 그 답(원문)을 평가자에게 넘긴다. 이 질문과 답은 잎 이슈에 `**needs-decision**` → `**answer**`로 남긴다. CLAUDE.md는 위험 경로라 고치지 않고, Commands에 적자고 제안만 한다

## 구현

- 가능한 곳은 미리 합의한 seam에서 Skill 도구로 "kagami:test"를 부른다
- Commands의 타입체크와 단일 테스트 파일은 자주 돌리고, 끝에 Commands의 전체 검사를 한 번 돌린다
- 명세에 없는 애매한 부분은 그 자리에서 묻는다. 되돌리기 어려운 결정(AGENTS.md "사람에게 묻는 것")은 선택지로 묻고 기다린다. 나머지는 정하고 PR의 `Decided`에 남긴다
- 잎 이슈의 범위 밖 파일이 필요해지거나 `git diff --stat origin/dev...HEAD`의 바뀐 줄 수가 커지면 멈추고 사람에게 알린다

## 평가

- 슬라이스가 다 초록이면 리팩터링하고 Commands의 전체 검사를 다시 돌린다
- 끝나면 평가자 에이전트(`kagami:evaluator`, 쓰기 권한 없음)에게 끝 기준, 범위, TL;DR 초안을 주고 판정받는다. Commands가 비어 사람에게 받은 검사 명령이나 "없다"는 답이 있으면 그것도 준다
- FAIL이면 고치고 다시 판정받는다. 3번 FAIL이면 멈추고 사람에게 알린다(AGENTS.md "막혔을 때")

## 커밋과 PR

- 작업을 현재 잎 브랜치에 커밋하고 push한다. dev에 직접 push하지 않는다
- PR은 dev로 연다. 제목은 Conventional Commits(`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), 본문 맨 위에 AGENTS.md "PR TL;DR 형식"의 TL;DR, 그 아래 `Closes #<잎 번호>`
- `Changed`는 `git diff`와 `gh`로 세서 채우고, `Decided`만 직접 쓴다
- 머지는 이 스킬이 하지 않는다. CI가 초록이면 TL;DR을 보여 주고 사람의 동의를 기다린다(AGENTS.md 10~11)
