---
name: try
description: "잎이 다 닫힌 큰 가지 하나를 사람이 써 보고 확인한다: 평가자 확인, 실행 방법과 시나리오 안내, 답을 셋(괜찮다 / 고칠 게 있다 / 원한 게 달랐다)으로 나눠 되묻기, 닫기·새 잎·needs-decision."
license: MIT
---

AGENTS.md "한 번 일하는 순서" 5의 확인이다. 규칙은 AGENTS.md가 기준이고 여기에 다시 쓰지 않는다. 볼 절: "큰 가지 확인", "할당", "기록 형식", "브랜치와 머지"의 태그.

인자: `$1` 큰 가지 번호, `$2` 대상 저장소(없으면 지금 저장소). 아래에서 `R`은 대상 저장소, `B`는 큰 가지다.

## 0. 시작

- 아래 git 명령은 지금 저장소의 origin을 쓴다. `gh repo view --json nameWithOwner --jq .nameWithOwner`가 R이 아니면 멈추고, R을 클론한 곳에서 다시 부르라고 알린다

- 뿌리를 찾는다: `gh api repos/R/issues/B/parent --jq .number`가 뿌리이고, 뿌리의 parent는 404여야 한다(B가 뿌리 바로 아래 노드). 아니면 멈추고 알린다
- `node ${CLAUDE_PLUGIN_ROOT}/src/tree.ts --repo R --root <뿌리>`로 트리를 읽고 B 아래 잎이 다 닫혔는지 본다. 열린 잎이 있으면 멈추고 알린다
- B가 할당되지 않았으면 AGENTS.md "할당"대로 고른 사람을 할당한다
- B 본문의 "끝 기준"과 "써 볼 시나리오"를 읽는다. 둘 중 하나가 없으면 멈추고 알린다
- 확인할 커밋을 정한다: `git fetch origin && git rev-parse origin/dev`. 아래에서 `C`다. 확인하는 동안 dev가 움직여도 C를 본다

## 1. 평가자 확인

평가자 에이전트 `kagami:evaluator`에게 큰 가지 확인이라고 말하고 B 번호, 끝 기준, 커밋 C를 준다. 잎 diff가 아니니 범위와 TL;DR 칸은 보지 말고 끝 기준만 판정하라고 한다.

- PASS면 2로 간다
- FAIL이면 걸린 끝 기준마다 고칠 잎을 만들고(아래 "새 잎") 여기서 끝낸다. B는 열어 둔다

## 2. 실행 방법과 시나리오 안내

사람이 직접 따라 할 수 있게 적는다. 사람 대신 시나리오를 돌리지 않는다.

- 실행 방법: 커밋 C를 받는 법(브랜치·worktree), 설치와 실행 명령. 대상 저장소 CLAUDE.md "Commands"에서 가져온다
- 시나리오: B 본문의 단계를 번호대로 옮긴다. 단계마다 무엇을 보면 되는지 한 줄씩 붙인다
- 시나리오에 추천(`/kagami:next`)을 보는 단계가 있으면, 확인 중에는 B 확인이 추천 1번이라고 덧붙인다. B가 닫힌 뒤를 가정해 다음 일을 1번으로 적었으면 "확인 중에는 B가 1번, 다음이 …"로 바꿔 읽는다(#50 spec-gap)

## 3. 사람의 답

사람이 써 보고 말로 답할 때까지 기다린다. 묻는 말을 덧붙여 답을 이끌지 않는다.

## 4. 셋으로 나누고 되묻기

답을 셋 중 하나로 나누고 한 줄로 되묻는다. 예: "고칠 게 있다로 들었어요: 목록이 날짜순이 아니다. 맞나요?" 사람이 맞다고 할 때까지 5로 가지 않는다.

- **괜찮다:** 시나리오대로 되고 원한 것이다
- **고칠 게 있다:** 원한 것은 맞는데 어딘가 틀리거나 모자라다
- **원한 게 달랐다:** 명세(끝 기준·시나리오·뿌리) 자체가 원한 것이 아니다

답에 둘이 섞였으면 항목마다 나눠 되묻는다.

## 5. 결과

### 괜찮다

1. version을 정한다: 지금 저장소에 `.claude-plugin/plugin.json`이 있으면 그 `version`이다. 없으면 사람에게 묻는다. 물을 때 `git tag -l 'v*' --sort=-v:refname | head -3`을 보여 주고, 기본 답은 "1.0.0 전(태그 없음)"이다
2. 잎 PR 제목을 모은다: 트리에서 B 아래 닫힌 잎마다 `gh issue view <잎> -R R --json closedByPullRequestsReferences`로 PR 번호를 얻고, 겹친 PR은 하나만 남긴다. PR마다 `gh pr view <PR> -R R --json title,mergedAt`을 부르고, 머지되지 않은 PR은 뺀 뒤 mergedAt 순서로 늘어놓는다
3. `node ${CLAUDE_PLUGIN_ROOT}/src/try.ts <version> <제목>...`을 부른다. 출력은 `{tag?, notes}` JSON이다
4. tag가 없으면(1.0.0 전) 태그와 Release 없이 5로 간다
5. tag가 있으면:
   - `git ls-remote --tags origin <tag>`에 이미 있으면 멈춘다. 버전을 올리는 잎을 새로 만들자고 제안한다
   - `git tag <tag> C && git push origin <tag>`. 태그 push는 권한 창이 사람의 동의다. 거절되면 로컬 태그를 지우고 멈춘다
   - notes를 파일에 쓰고 `gh release create <tag> -R R --verify-tag --title <tag> --notes-file <파일>`
6. B에 확인 기록을 달고 `gh issue close B -R R`로 닫는다

```markdown
**큰 가지 확인** 괜찮다 (사람). <v1.0.0 전이라 태그와 Release 없이 닫는다 | 태그 <tag>, Release <링크>>
- 1. 평가자: 끝 기준 <몇> 줄 PASS (dev <C 앞 7자>)
- 시나리오 1: <사람이 본 것>
- …
```

### 고칠 게 있다

- 고칠 것마다 B 아래 새 잎을 만든다(아래 "새 잎"). B는 열어 둔다
- B에 `**큰 가지 확인** 고칠 게 있다 (사람). <사람의 답>. → #<새 잎>...`을 단다

### 원한 게 달랐다

- 명세를 바꾸는 안 2~3개를 좋은 점/대가와 함께 내고 추천 하나를 고른다. 뿌리를 고쳐야 하면 그 안에 `/kagami:plan`을 적는다
- B에 `**needs-decision**` 기록(AGENTS.md 형식)을 달고 `needs-decision` 라벨을 붙인다. B는 열어 둔다
- 사람이 그 자리에서 답하면 `**answer**`를 이어 쓰고 라벨을 없앤다

### not-what-i-wanted

전부 수락 회차(`docs/harness/가운데 설계.md` "첫 실전 계획" 1회차)에서 답이 "괜찮다"가 아니면, 그 회차의 첫 답인지 본다. 트리 댓글에 `**not-what-i-wanted**`가 아직 없으면 첫 답이다. 첫 답이면 B에 남긴다(라벨 없음).

```markdown
**not-what-i-wanted** <사람의 답>. <고칠 게 있다 / 원한 게 달랐다> → #<새 잎 또는 B>
```

지금이 전부 수락 회차인지 이슈와 문서로 알 수 없으면 사람에게 한 번 묻는다.

## 새 잎

`/kagami:split`의 잎 형식(목표, 지킬 약속, 끝 기준, 범위)으로 만든다. 끝 기준에는 걸린 끝 기준이나 사람이 본 증상을 다시 확인하는 테스트를 적는다.

```bash
gh issue create -R R --title "<잎 제목>" --label leaf --body-file <본문>
id=$(gh api repos/R/issues/<잎> --jq .id)
gh api repos/R/issues/B/sub_issues -X POST -F sub_issue_id=$id
```

잎은 만들고 끝낸다. 구현은 다음 세션에서 `/kagami:next`가 추천한다.
