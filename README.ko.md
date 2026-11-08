<p align="center">
  <img src=".claude-plugin/icon.png" alt="kagami" width="96">
</p>

<h1 align="center">kagami</h1>

<p align="center">
  에이전트는 고른 일 하나만 끝내고, 기록을 남기고, 멈춘다. 흐름은 사람이 쥔다.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://github.com/Pancheble/kagami/releases"><img src="https://img.shields.io/github/v/release/Pancheble/kagami?include_prereleases&label=release" alt="Release"></a>
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-d97757" alt="Claude Code plugin">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>한국어</b>
</p>

## 왜 kagami인가

코딩 에이전트는 한 번에 너무 많이 바꾸고, 무엇을 했는지 알기 어렵고, 다음 세션은 맥락을 다 잃어요.

kagami는 일을 작게 나누고 기록으로 남겨요.

- **GitHub 이슈 트리.** 목표 › 가지 › 노드 › 잎. 계획과 결정이 전부 이슈에 남아서 다음 세션(이나 팀원)이 이어받아요
- **한 세션에 한 조각.** 지금 할 수 있는 일 2~3개를 추천받고, 하나를 고르면 그 잎 하나만 끝내고 멈춰요
- **테스트 먼저.** 잎마다 끝 기준을 놓고 빨강 → 초록 → 정리 순서로 만들어요
- **따로 있는 평가자.** 쓰기 권한이 없는 에이전트가 PR 전에 끝 기준과 범위를 확인해요
- **머지는 사람이.** 되돌리기 어려운 선택은 선택지로 물어 와요. 짧은 TL;DR을 읽고 머지해요

> [!NOTE]
> kagami는 지금 **베타**(`v1.0.0-beta.1`)예요. 깨지는 곳이 있을 거예요. 겪은 일을 [Issues](https://github.com/Pancheble/kagami/issues)에 남겨 주세요.

## 빠른 시작

[Claude Code](https://docs.claude.com/en/docs/claude-code), Node 24 이상, 로그인된 [GitHub CLI](https://cli.github.com)(`gh auth login`)가 필요해요.

1. Claude Code에서 마켓플레이스를 더해요:
   ```
   /plugin marketplace add Pancheble/kagami
   ```
2. 플러그인을 설치해요:
   ```
   /plugin install kagami@kagami
   ```
3. GitHub에 빈 저장소를 만들어 클론하고, 그 폴더에서 Claude Code를 열어 실행해요:
   ```
   /kagami:init
   ```

그다음 `/kagami:plan`으로 목표를 정하고, 그 뒤로는 세션마다 `/kagami:next`로 시작해요.

## 어떻게 돌아가나

```
root(목표) › branch(써 볼 수 있는 덩어리) › node › leaf(PR 하나)
```

한 바퀴: `next`가 추천 → 사람이 고르기 → `build`가 테스트 먼저 → 평가자 판정 → `dev`로 PR → 사람이 머지. 가지의 잎이 다 닫히면 `try`가 직접 써 보는 걸 안내해요.

에이전트가 따르는 규칙은 [AGENTS.md](AGENTS.md), 규칙이 왜 이런지는 [docs/design.md](docs/design.md), 사람이 할 일은 [CONTRIBUTING.md](CONTRIBUTING.md)에 있어요(영어).

## 명령

| 명령 | 하는 일 |
|---|---|
| `/kagami:init` | 새 빈 저장소에 kagami 깔기: 규칙, 이슈 템플릿, 라벨, CI 가드 |
| `/kagami:plan` | 만들고 싶은 것을 대화로 목표 이슈로 만들기 |
| `/kagami:next` | 다음에 할 일 2~3개를 추천하고 고른 것을 시작하기 |
| `/kagami:split` | 큰 이슈를 한 세션에 끝나는 조각으로 나누기 |
| `/kagami:build` | 잎 하나를 테스트 먼저 만들고, 평가자 판정을 받고, PR 열기 |
| `/kagami:test` | `build`가 안에서 돌리는 빨강 → 초록 → 정리 반복 |
| `/kagami:try` | 다 만든 가지를 직접 써 보기. 괜찮으면 닫고, 아니면 고칠 일을 만들기 |

## 자주 묻는 것

**이미 있는 프로젝트에도 쓸 수 있나요?**
아직은 아니에요. `/kagami:init`은 새 빈 저장소만 받아요.

**팀으로 쓸 수 있나요?**
네. 모두 같은 이슈 트리에서 일을 고르고, 고른 일은 할당돼서 다른 사람 세션은 추천하지 않아요.

**GitHub가 꼭 있어야 하나요?**
네. 트리가 GitHub 이슈에 있고, PR은 CI 가드를 거쳐요.

**Claude Code 말고 다른 에이전트에서도 되나요?**
규칙은 `AGENTS.md`에 글로 있지만, 명령은 Claude Code 스킬이에요.

## 라이선스

[MIT](LICENSE). 스킬 일부는 [mattpocock/skills](https://github.com/mattpocock/skills)(MIT)에서 가져와 고쳤어요. [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)를 보세요.
