---
name: to-tickets
description: "자식이 없는 노드 이슈 하나를 잎으로 쪼갠다: 안 2~3개와 득실, 사람이 고름, 빨간 계약 테스트 PR, 자식 잎 이슈와 blocked-by, split 기록."
disable-model-invocation: true
argument-hint: "[노드 이슈 번호] [대상 저장소 owner/name]"
---

> 출처: https://github.com/mattpocock/skills (MIT, Matt Pocock), 커밋 `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`, `skills/engineering/to-tickets/SKILL.md`. 라이선스 전문: `.claude/skills/LICENSE-mattpocock`.
> 고친 점: 계획·대화가 아니라 노드 이슈 하나를 쪼갠다. 안을 하나 내고 고쳐 가는 대신 안 2~3개를 득실과 함께 내고 사람이 고른다. 잎 템플릿을 AGENTS.md의 목표·지킬 약속·끝 기준·범위로 바꾸고, 범위에 파일 경로를 적는다(원문은 경로를 피한다). `contracts/<노드>/`의 빨간 계약 테스트를 PR로 먼저 넣고, 머지된 뒤에 잎 이슈를 만든다. `/setup-matt-pocock-skills`, 로컬 파일 방식, `ready-for-agent` 라벨은 뺐다. 수직 조각과 넓은 리팩터의 병렬 변경은 원문을 따른다.

사람이 부르는 스킬이다. AGENTS.md "한 번 일하는 순서" 5의 쪼개기다. 규칙은 AGENTS.md가 기준이고 여기에 다시 쓰지 않는다. 볼 절: "쪼개기", "잎 크기", "계약 테스트", "기록 형식"의 `**split**`, "할당".

인자: `$1` 노드 번호, `$2` 대상 저장소(없으면 지금 저장소). 아래에서 `R`은 대상 저장소다.

## 1. 읽기

- 노드 이슈와 부모 이슈만 `gh issue view`로 읽는다(본문과 댓글). 다른 PR은 뒤지지 않는다
- 자식이 이미 있으면(`gh api repos/R/issues/<노드>/sub_issues`) 멈추고 알린다. 이 스킬은 자식 없는 노드만 쪼갠다
- 노드가 이미 잎 조건(AGENTS.md "쪼개기")을 만족하면 "그대로 잎"이라고 말하고, 사람이 동의하면 `node` 라벨을 `leaf`로 바꾸고 끝낸다
- 노드의 목표가 닿는 코드를 읽는다. 쉽게 바꿀 수 있게 먼저 손볼 곳(prefactor)이 보이면 그걸 첫 잎으로 둔다

## 2. 안 내기

쪼개는 안 2~3개를 내고 추천 하나를 고른다. 안마다:

- 잎 목록: 제목, 맡는 목표 한 줄, 범위(파일·폴더), 기다리는 잎(blocked-by)
- 자식끼리의 약속: 잎들이 서로 기대는 인터페이스(함수 이름, 인자, 반환, 데이터 모양)
- 좋은 점 / 대가

안을 짜는 법(원문):

- 잎은 수직 조각이다. 한 층만 하는 가로 조각이 아니라, 좁아도 끝까지 이어진 길 하나를 만든다. 끝난 잎은 혼자서 확인할 수 있다
- 잎끼리 범위가 겹치지 않게 한다. 기다림은 진짜로 막는 것만 단다
- 넓은 리팩터(한 번 바꾸면 많은 호출처가 같이 깨지는 기계적 변경)는 수직으로 자르지 않고 병렬 변경으로 잇는다: 새 방식 추가 → 호출처를 묶음별로 옮기는 잎들(추가에 blocked-by) → 옛 방식 지우기(옮기는 잎 모두에 blocked-by)

사람이 고를 때까지 기다린다. 고친 안을 원하면 고쳐서 다시 낸다.

## 3. 계약을 먼저 dev에

고른 안의 약속을 대상 저장소의 dev 위 브랜치 `leaf/<노드>-split`에 쓴다.

1. 약속마다 스텁: 모양만 있고 몸통은 `throw new Error("not implemented")`. 저장소의 언어와 폴더 구조를 따른다
2. `contracts/<노드>/`에 테스트: 약속마다 `이름.contract.<확장자>`, 노드 목표를 확인하는 인수 테스트 `이름.accept.<확장자>`. 파일 이름에 `.test.`를 넣지 않는다(기본 테스트가 빨강을 집어 CI가 깨진다)
3. 처음엔 빨강인지 파일마다 `node --test <파일>`로 본다. 테스트 하나하나가 스텁의 "not implemented"로 실패해야 한다. 불러오기 실패, 문법 에러, 테스트 없음, 통과가 하나라도 있으면 고친다
4. PR을 dev로 연다. 제목 `test: #<노드> <노드 이름> 계약`, 본문 맨 위 TL;DR(AGENTS.md "PR TL;DR 형식", Changed는 대상 저장소 체크아웃에서 `node <kagami>/src/changed.ts --issue <노드>`), 빨강 확인 결과, `Refs #<노드>`. 노드는 닫지 않으니 `Closes`를 쓰지 않는다
5. CI가 초록이면 사람에게 머지 동의를 받고 `gh pr merge --squash`로 머지한다

잎 이슈는 이 PR이 머지된 뒤에 만든다. 준비된 잎은 바로 구현할 수 있어야 하므로, 계약이 dev에 없는 잎을 트리에 두지 않는다.

## 4. 잎 이슈와 기다림

기다림이 없는 잎부터 차례로 만든다. 본문:

```markdown
## 목표
부모 목표 중 이 잎이 맡는 것

## 지킬 약속
이 잎이 깨면 안 되는 약속. contracts/<노드>/의 어느 파일인지

## 끝 기준
`node --test contracts/<노드>/<파일>` 가 초록 (+ 잎 자신의 테스트)

## 범위
- 건드릴 파일·폴더
```

```bash
gh issue create -R R --title "<잎 제목>" --label leaf --body-file <본문>
id=$(gh api repos/R/issues/<잎> --jq .id)
gh api repos/R/issues/<노드>/sub_issues -X POST -F sub_issue_id=$id
# 기다리는 잎마다 (막는 쪽의 id)
gh api repos/R/issues/<잎>/dependencies/blocked_by -X POST -F issue_id=$(gh api repos/R/issues/<막는 잎> --jq .id)
```

라벨이 없으면 손으로 만들지 말고 `node <kagami>/src/tree.ts --repo R --labels`로 kagami와 같은 세트를 만든다. 다 만들고 `node <kagami>/src/tree.ts --repo R --root <뿌리>`로 자식과 기다림이 걸렸는지 본다.

## 5. 기록하고 끝내기

- 노드 이슈에 `**split**` 기록(AGENTS.md 형식: 고른 안, 안마다 좋은 점/대가, 자식 번호, `contracts/<노드>/`)을 달고 `split` 라벨을 붙인다. 계약 PR 링크도 적는다
- 노드 할당을 푼다. 노드는 자식이 다 닫힐 때까지 열려 있다. 노드 본문은 고치지 않는다
- AGENTS.md "끝내기 전에"를 하고 "클리어해도 돼요"라고 알린다. 자식 잎은 다음 세션에서 한다
