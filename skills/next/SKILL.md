---
name: next
description: "At the start of a session, recommend 2–3 things to work on next and start the one you pick."
license: MIT
---

AGENTS.md "세션을 열면"과 "한 번 일하는 순서" 1~5다. 규칙은 AGENTS.md가 기준이고 여기에 다시 쓰지 않는다. 볼 절: "트리 읽는 법", "세션을 열면", "할당", "기록 형식".

인자: `$1` 대상 저장소(없으면 지금 저장소). 아래에서 `R`이다.

## 0. 모으기

- `R`을 정한다: 인자가 없으면 `gh repo view --json nameWithOwner --jq .nameWithOwner`
- 뿌리를 찾는다. 부모 없고 `leaf`가 아닌 열린 이슈 중 뿌리 템플릿 칸(`## 기획 문서` 등)이 하나라도 있는 것의 번호 배열이 나온다. 하나도 없으면 새 뿌리를 세우자고(`/kagami:plan`) 알리고 끝낸다
- 뿌리마다 `--root`를 붙여 다시 부른다. 스크립트는 GitHub를 읽기만 한다

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/next.ts" --repo R
node "${CLAUDE_PLUGIN_ROOT}/src/next.ts" --repo R --root <뿌리>
```

출력은 JSON이다.

- `ready`: 준비된 일 `{number, kind}`. kind는 `build`(잎 구현), `split`(자식 없는 노드 쪼개기. 뿌리면 큰 가지로 쪼개기), `plan`(칸이 빠진 뿌리 기획 대화), `try`(잎이 다 닫힌 큰 가지 확인)
- `stale`: 할당된 채 3일 동안 활동이 없는 이슈
- `waiting`: `needs-decision` 라벨이 붙은 열린 이슈
- `drift`: 있으면 `R`의 AGENTS.md 첫 줄 kagami 버전(`repo`)과 플러그인 버전(`plugin`)이 다르다. `repo`가 없으면 버전 줄이 없다. `dev: false`면 `R`에 dev 브랜치가 없다
- `leftover`: 준비된 일마다 남은 잎 브랜치(`leaf/<번호>-*`)

## 1. 정리

추천하기 전에 한다.

- **drift**: 있으면 한 줄로 알린다. 예: "AGENTS.md는 kagami v0.1.0, 플러그인은 v0.2.0이에요." `repo`가 없으면 "AGENTS.md에 kagami 버전 줄이 없어요"라고 알린다. `dev: false`면 "dev 브랜치가 없어요. `/kagami:init`으로 깐 저장소인지 봐 주세요"라고 알린다. 고치지 않고 넘어간다
- **waiting**: 이슈마다 `gh issue view <번호> -R R --comments`로 마지막 `**needs-decision**` 기록과 그 뒤 댓글을 읽는다. 누가 썼든 답으로 본다
  - 답이 있으면 한 줄로 확인한다. 예: "#12는 ②로 답했어요(이유: …). 맞나요?" 맞으면 그 `**needs-decision**` 댓글 끝에 ` → **answer** <고른 것> (사람). 이유: …`를 이어 쓰고(`gh api -X PATCH repos/R/issues/comments/<id> -f body=…`, 고칠 수 없으면 `**answer**`로 시작하는 새 댓글) `gh issue edit <번호> -R R --remove-label needs-decision`
  - 답이 없으면 물은 것과 선택지를 다시 보여 주고 묻는다. 답하면 위와 같이 남긴다. 지금 답하지 않으면 그대로 둔다
- **stale**: 이슈마다 할당된 사람을 풀고(`gh issue edit <번호> -R R --remove-assignee <login>`) `**released** @<login>. 이유: 3일 활동 없음`을 단다. 푼 이슈는 다시 준비될 수 있으니 스크립트를 한 번 더 부르고 2로 간다

## 2. 추천

준비된 일 중 성격이 다른 2~3개를 이유와 함께 낸다. 자기 추천을 1번에 둔다. "뭘 하고 싶어?"를 먼저 묻지 않는다.

- `try`가 있으면 그 큰 가지 확인이 1번이다(확인 중에는 그 큰 가지가 추천 1번)
- 뿌리의 `split`은 "뿌리를 큰 가지로 쪼개기"로 적는다
- 성격이 다르다 = kind가 다르거나, 같은 kind라도 다른 큰 가지에 있거나 건드리는 범위가 다르다. 같은 큰 가지의 비슷한 잎을 나란히 내지 않는다
- 번호마다 `gh issue view <번호> -R R`로 제목과 목표를 읽고 이유를 쓴다. 다른 PR은 뒤지지 않는다
- 준비된 일이 없으면 그렇게 말하고, 열린 일이 무엇을 기다리는지(할당, blocked-by, `blocked`) 한 줄씩 알린다

```markdown
1. #<번호> <제목> (<잎 구현 | 쪼개기 | 뿌리를 큰 가지로 쪼개기 | 기획 대화 | 큰 가지 확인>) — 추천. <이유>
2. #<번호> <제목> (<…>) — <이유>
3. …
```

## 3. 고름

사람이 고를 때까지 기다린다. 추천 밖의 것을 고르면 고른 이슈에 `**off-recommendation** 추천은 #…이었고 #…을 골랐다. 이유: …`를 달고 `off-recommendation` 라벨을 붙인다. 이유를 모르면 한 번 묻는다.

## 4. 할당

- 할당 직전에 `gh issue view <번호> -R R --json state,assignees`로 다시 읽는다. 닫혔거나 누가 가져갔으면 알리고 2로 돌아간다
- `gh issue edit <번호> -R R --add-assignee @me`
- 고른 일에 `leftover` 브랜치가 있으면 브랜치마다 `git fetch origin && git diff --stat origin/dev...origin/<브랜치>`와 이슈의 기록(`**blocked**`, `**released**`)을 보여 주고, 이어갈지 처음부터 할지 묻는다. 이어가면 그 브랜치에서 시작하고, 원래 작성자가 다른 사람이면 커밋에 `Co-authored-by:`를 남긴다

## 5. 넘기기

고른 일의 kind로 스킬을 부른다.

- `build` → `/kagami:build <번호>`
- `split` → `/kagami:split <번호>`
- `try` → `/kagami:try <번호>`
- `plan` → `/kagami:plan`은 사람만 부른다. 사람에게 `/kagami:plan`을 치라고 알린다
