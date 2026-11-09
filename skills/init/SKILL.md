---
name: init
description: "Install kagami into a new empty repository: rules, issue templates, labels, a CI guard, and a GitHub Project board in one go."
license: MIT
disable-model-invocation: true
---

This is a skill the human calls. It turns one new empty repository into a repository that works the kagami workflow. The AGENTS.md it installs is the source of the rules.

Arguments (`$ARGUMENTS`, all optional): the kagami ref the target repository pins (if none, see 1 below); `--project <number>` to link a board the repository owner already has (for example one an assignment hands out) instead of making a new one; `--board` when the repository already uses kagami and only needs a board.

## 0. Start

- The current folder must be a clone of the target repository. Say its name with `gh repo view --json nameWithOwner --jq .nameWithOwner`. If that fails, stop, and tell the human to create an empty repository on GitHub, clone it, and call this again from there
- Handle only new empty repositories (no commits, no files other than `.git`). Do not handle a repository that already has code. The script refuses it too, but check first and stop if it is not empty
- With `--board`, skip the empty check and steps 1–3: run `node "${CLAUDE_PLUGIN_ROOT}/src/init.ts" --board [--project <number>]` and go to 4

## 1. Pick the ref

- If there is `$1`, use it
- If not, look at the version in `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. If it is `1.0.0` or higher, use the script's default (the `v<version>` tag). If it is lower, there is no tag, so say in one line that you will use `dev`, and pass `dev`

## 2. Install

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/init.ts" --ref <ref> [--project <number>]
```

- This command writes the target repository's `.claude/settings.json` and `.github/workflows/kagami-guard.yml` and creates labels on GitHub. Say beforehand that a permission prompt may appear. The permission prompt is the human's consent
- What it does: writes the files, creates 9 labels (`gh label create --force`), puts HEAD on `dev`, and makes the first commit `chore: kagami init`. It does not push
- If it refuses (there are commits or files, or it is not a git repository), pass on its message and stop. Do not fix things and run it again
- After the first commit it does the board step (4 below). A failed board step does not undo the install

## 3. What the human does

Show the steps below and let the human run them. Do not run them yourself.

1. `git push -u origin dev`: the only push that goes straight to dev. It is the first git branch pushed, so dev becomes the default git branch. After this, changes reach dev only through leaf PRs
2. Open a new session in this folder and answer that you trust it, and the kagami marketplace and plugin in `.claude/settings.json`. Claude Code registers a marketplace that a repository's settings declare for the first time in the background after the session starts, so this first session has no `/kagami:*` yet. Open another session, or run `/reload-plugins` in this one. Then run `/kagami:next`; with no root yet, it tells you to set up the first one with `/kagami:plan`. A teammate's first session after cloning is the same

## 4. The board

- No `--project`: it makes a public GitHub Project board under the repository owner, titled with the repository name, and links it to the repository. With `--project <number>`: it links that board of the repository owner only, without making one or changing its visibility. `--project` finds boards of the repository owner only
- The board is not written into the repository. The kagami skills find the boards linked to the repository and put the tree's issues on them
- If it prints `No board linked`, pass on the reason it printed above that line. If the reason is the missing `project` scope, have the human run `gh auth refresh -s project`, then run `node "${CLAUDE_PLUGIN_ROOT}/src/init.ts" --board` (with the same `--project`) yourself. Everything else is already installed; do not run the install again
- `--board` without `--project` makes a new board each time. If the repository already has a linked board, do not run it again

When it is done, show the list of installed files, the number of labels, the git branch, the ref, and the board number (or that no board was linked) all at once.
