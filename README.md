<p align="center">
  <img src=".claude-plugin/icon.png" alt="kagami" width="96">
</p>

<h1 align="center">kagami</h1>

<p align="center">
  The agent finishes the one piece you picked, leaves records, and stops. You hold the flow.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://github.com/Pancheble/kagami/releases"><img src="https://img.shields.io/github/v/release/Pancheble/kagami?include_prereleases&label=release" alt="Release"></a>
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-d97757" alt="Claude Code plugin">
</p>

<p align="center">
  <b>English</b> · <a href="README.ko.md">한국어</a>
</p>

<!-- Demo (30–60 s): /kagami:next recommends → you pick → build writes tests first → evaluator PASS → PR
<p align="center"><img src="docs/assets/demo.gif" alt="kagami demo" width="720"></p>
-->

## Why kagami

Coding agents change too much at once, you can't tell what they did, and the next session has forgotten everything.

kagami keeps the work small and on the record:

- **A tree of GitHub issues.** Goal › branch › node › leaf. The plan and every decision live in issues, so the next session (or a teammate) picks up where you left off
- **One session, one piece.** Claude recommends 2–3 pieces that are ready now. You pick one; it finishes that leaf and stops
- **Tests first.** Each leaf is built red → green → refactor against its done criteria
- **A separate evaluator.** An agent with no write access checks the done criteria and scope before the PR
- **You merge.** Hard-to-undo choices come to you as options. You read a short TL;DR and merge

> [!NOTE]
> kagami is in **beta** (`v1.0.0-beta.1`). Things will break. Tell us what you hit in [Issues](https://github.com/Pancheble/kagami/issues).

## Quick start

You need [Claude Code](https://docs.claude.com/en/docs/claude-code), Node 24+, and the [GitHub CLI](https://cli.github.com) (`gh auth login`).

1. Add the marketplace in Claude Code:
   ```
   /plugin marketplace add Pancheble/kagami
   ```
2. Install the plugin:
   ```
   /plugin install kagami@kagami
   ```
3. Create an empty repository on GitHub, clone it, open Claude Code there, and run:
   ```
   /kagami:init
   ```

Then `/kagami:plan` to set the goal, and `/kagami:next` every session after that.

## How it works

```
root (goal) › branch (something you can try) › node › leaf (one PR)
```

One round: `next` recommends → you pick → `build` writes tests first → the evaluator judges → PR to `dev` → you merge. When every leaf of a branch is closed, `try` walks you through trying it yourself.

The rules agents follow are in [AGENTS.md](AGENTS.md). Why they look that way: [docs/design.md](docs/design.md). What the human does: [CONTRIBUTING.md](CONTRIBUTING.md).

## Commands

| Command | What it does |
|---|---|
| `/kagami:init` | Install kagami into a new empty repository: rules, issue templates, labels, and a CI guard |
| `/kagami:plan` | Turn what you want to build into a goal issue through conversation |
| `/kagami:next` | Recommend 2–3 things to work on next and start the one you pick |
| `/kagami:split` | Break a large issue into pieces that each fit in one session |
| `/kagami:build` | Build one leaf test-first, get the evaluator's verdict, and open a PR |
| `/kagami:test` | The red → green → refactor loop that `build` runs |
| `/kagami:try` | Try a finished branch yourself; close it if it's good, create fixes if not |

## FAQ

**Can I add it to an existing project?**
Not yet. `/kagami:init` only sets up a new empty repository.

**Does it work for a team?**
Yes. Each person picks work from the same issue tree, and picked work is assigned so nobody else's session recommends it.

**Do I need GitHub?**
Yes. The tree lives in GitHub issues, and PRs go through a CI guard.

**Does it work with agents other than Claude Code?**
The rules are plain text in `AGENTS.md`, but the commands are Claude Code skills.

## License

[MIT](LICENSE). Parts of the skills are adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT); see [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
