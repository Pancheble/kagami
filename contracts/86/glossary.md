# #86 용어표 (번역 잎 T1·T2와 칸 이름 잎 H가 같이 지킨다)

본문을 영어로 옮길 때 이 표의 영어를 쓴다. 표에 없는 말은 뜻대로 옮기고, 같은 말을 파일마다 다르게 옮기지 않는다. 표를 바꿔야 하면 멈추고 사람에게 묻는다(계약 변경).

## 그대로 두는 것

- 기록 표시어와 라벨 이름: `**needs-decision**`, `**answer**`, `**split**`, `**contract-change**`, `**blocked**`, `**off-recommendation**`, `**spec-gap**`, `**discovered**`, `**released**`, 라벨 `node`, `leaf`
- 명령·경로·브랜치 이름: `/kagami:*`, `kagami:evaluator`, `leaf/<n>-<name>`, `dev`, `v*`, `archive/*`, `contracts/<n>/`
- 출처 줄의 원문 경로와 URL(mattpocock/skills, cwc-long-running-agents)

## 파일 이름

새로 만들거나 옮기는 파일·폴더 이름은 영어 소문자-하이픈(`docs.contract.ts`). 설계 문서의 최종 이름과 `docs/harness/archive/`를 어디로 옮길지(또는 지우고 `archive/*` 태그로만 남길지)는 T2에서 사람에게 묻는다. 정해지면 이 표에 더한다(계약 넓힘). 옛 경로 `docs/harness/가운데 설계.md`는 Z가 지울 때까지 영어 포인터로 남는다

## AGENTS.md "기록 형식"에 넣을 문장

> Markers and label names stay exactly as written. Write the record body in the language your team uses.

(`english.accept.ts`가 "the language your team uses"를 찾는다)

## 이슈 칸 이름 (코드가 읽는다. H가 바꾸고, 옛 한국어 칸도 계속 읽는다)

| 템플릿 | 한국어(옛) | English |
|---|---|---|
| root | 기획 문서 | Plan document |
| root | 성공 기준 | Success criteria |
| root | 위험 경로 | Risk paths |
| root | 평가자 준비물 | Evaluator setup |
| root | 스택과 ADR | Stack and ADRs |
| root | 안 할 것 | Out of scope |
| branch, node, leaf | 목표 | Goal |
| branch | 끝 기준 | Done when |
| branch | 써 볼 시나리오 | Try-it scenario |
| node | 인수 테스트 | Acceptance test |
| branch, node | 자식끼리의 약속 | Child contracts |
| branch, node | 바뀐 약속 | Contract changes |
| leaf | 지킬 약속 | Contracts to keep |
| leaf | 끝 기준 테스트 / 끝 기준 | Done when |
| leaf | 범위 | Scope |
| leaf | 기다릴 티켓 | Waits on |

칸 안의 값: `확인:` → `check:` (성공 기준 줄 `- <criterion> (check: <how>)`), `CLAUDE.md 참고` → `See CLAUDE.md`, `없음` → `None`. 템플릿 이름: 뿌리 Root, 큰 가지 Branch, 노드 Node, 잎 Leaf.

## 용어

| 한국어 | English |
|---|---|
| "가운데 방식으로 일한다" | "work the kagami workflow" (필요하면 "you choose, AI builds"). "가운데"를 이름으로 옮기지 않는다. 자율 다이얼(L1~L4)은 구현된 적이 없으니 본문에서 뺀다 |
| 트리 · 뿌리 · 큰 가지 · 노드 · 잎 | tree · root · branch · node · leaf |
| (git 브랜치) | 늘 "git branch", "leaf branch", 또는 `dev`로 쓴다. 맨 "branch"는 큰 가지다 |
| 트렁크 | trunk |
| 준비됨 | ready |
| 할당 / 할당 풀기 | assign / unassign |
| 기다림 (blocked-by) | blocked-by |
| 쪼개기 | split |
| 큰 가지 확인 | trying a branch |
| 기획 대화 | planning conversation |
| 계획 알림 | plan notice |
| 끝 기준 | done criteria (칸 제목은 "Done when") |
| 지킬 약속 · 자식끼리의 약속 | contracts to keep · child contracts |
| 계약 테스트 · 인수 테스트 | contract test · acceptance test |
| 병렬 변경 | parallel change |
| 수직 조각 | vertical slice |
| 평가자 | evaluator |
| 래칫 | ratchet |
| 위험 경로 | risk paths |
| 기록 · 표시어 | record · marker |
| 사람 | the human |
| 첫 실전 1회차 "전부 수락" · 2회차 "가운데" | accept-all run · normal run (`docs/history/`·ADR에서만 쓴다. 제품 본문에는 없다: `product.contract.ts`) |
| 괜찮다 / 고칠 게 있다 / 원한 게 달랐다 | it's fine / needs fixes / not what I wanted |
| 막혔을 때 | when blocked |
| "클리어해도 돼요" | "You can clear the session now." |
