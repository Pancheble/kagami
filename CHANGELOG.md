# Changelog

Each entry lists the leaf PR titles that went into the release, as in its GitHub Release.

## 1.0.0-beta.3 (2026-11-09)

Install kagami into a repository that already has code (`/kagami:init --existing`), published as a Pre-release.

- feat: 이미 코드가 있는 저장소에 install (--existing) (#170)
- docs: init 스킬·README에 기존 저장소 안내 (#169)
- test: #165 이미 코드가 있는 저장소에 깔기 계약 (#168)

## 1.0.0-beta.2 (2026-11-09)

GitHub Project board, community files and social preview, published as a Pre-release.

- fix: init --board가 이미 연결된 보드가 있으면 새로 만들지 않기 (#163)
- feat: 트리 이슈를 연결된 GitHub Project 보드에 동기화 (#161)
- feat: init이 GitHub Project 보드를 만들거나 잇기 (--project, --board) (#159)
- test: #155 GitHub Project 보드에 과정 보이기 계약 (#158)
- chore: add social preview image (#154)
- docs: add community files (CHANGELOG, SECURITY, CODE_OF_CONDUCT, dependabot, CODEOWNERS) (#149)
- docs: ci/guard.yml 머리 주석에서 read token 문구 지우기 (#148)

## 1.0.0-beta.1 (2026-11-09)

First beta, published as a Pre-release.

- feat: 가드가 토큰 없이 kagami 받기 (#141)
- feat: try marks a tailed version as Pre-release (#140)
- chore: kagami 저장소 PR에도 가드 돌리기 (#138)
- docs: add LICENSE and English/Korean READMEs (#142)
- chore: init.ts 주석에서 시크릿 단계 지우기 (#143)
- chore: bump plugin version to 1.0.0-beta.1 (#144)
- feat: add beta feedback issue template (#146)
