---
name: init
description: "Install kagami into a new empty repository: rules, issue templates, labels, and a CI guard in one go."
license: MIT
disable-model-invocation: true
---

사람이 부르는 스킬이다. 빈 새 저장소 하나를 가운데 방식 저장소로 만든다. 규칙은 깔리는 AGENTS.md가 기준이다.

인자: `$1` 대상 저장소가 고정할 kagami ref(없으면 아래 1).

## 0. 시작

- 지금 폴더가 대상 저장소를 클론한 곳이어야 한다. `gh repo view --json nameWithOwner --jq .nameWithOwner`로 이름을 말한다. 실패하면 멈추고, GitHub에 빈 저장소를 만들어 클론한 곳에서 다시 부르라고 알린다
- 빈 새 저장소만 다룬다(커밋 없음, `.git` 말고 파일 없음). 이미 코드가 있는 저장소는 다루지 않는다. 스크립트도 거부하지만, 먼저 보고 아니면 멈춘다

## 1. ref 정하기

- `$1`이 있으면 그것을 쓴다
- 없으면 `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`의 version을 본다. `1.0.0` 이상이면 스크립트 기본(`v<version>` 태그)을 쓴다. 그보다 낮으면 태그가 없으니 `dev`를 쓴다고 한 줄로 말하고 `dev`를 준다

## 2. 깔기

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/init.ts" --ref <ref>
```

- 이 명령은 대상 저장소의 `.claude/settings.json`과 `.github/workflows/kagami-guard.yml`을 쓰고 GitHub에 라벨을 만든다. 권한 창이 뜰 수 있다고 미리 말한다. 권한 창이 사람의 동의다
- 하는 것: 파일 쓰기, 라벨 9개(`gh label create --force`), HEAD를 `dev`로 두고 첫 커밋 `chore: kagami init`. push는 하지 않는다
- 거부되면(커밋이나 파일이 있음, git 저장소가 아님) 그 메시지를 전하고 멈춘다. 고쳐서 다시 돌리지 않는다

## 3. 사람이 할 것

아래를 보여 주고 사람이 직접 돌리게 한다. 대신 돌리지 않는다.

1. `git push -u origin dev`: dev로 바로 가는 유일한 push다. 처음 올린 브랜치라 dev가 기본 브랜치가 된다. 이후는 잎 PR로만 dev에 합친다
2. `gh secret set KAGAMI_READ_TOKEN -R <대상 저장소>`: kagami가 비공개인 동안 가드가 kagami를 받는 읽기 토큰(Pancheble/kagami만 Contents: Read인 fine-grained 토큰). 토큰 값은 사람이 넣는다. 묻거나 받지 않는다
3. 새 세션을 열어 `.claude/settings.json`의 마켓플레이스 kagami와 플러그인을 믿는다고 답한다. 그다음 `/kagami:plan`으로 첫 뿌리를 세운다

끝나면 깐 파일 목록, 라벨 수, 브랜치, ref를 한 번에 보여 준다.
