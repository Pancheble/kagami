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

## Why kagami

Just telling the AI "do it" is fast at first. Then you open the code to fix something, and neither you nor the AI knows why it ended up this way. So the fix takes forever.

Alone, your decisions vanish with the chat. On a team, the work gets split loosely, nobody knows what the others are building, and the code collides where the pieces meet. Either way, it comes down to how the work was split.

This is how kagami splits it:

- **The work becomes a tree.** The AI proposes ways to split it, and you pick one. Only what is up next gets split
- **The promises between pieces come first, as tests.** When work is split, the tests that run are written first, so pieces built apart still fit, and CI tells you when they collide
- **Who is doing what, and why it was decided, stays in the issue.** It stays at that spot in the tree, so the next session or a teammate can pick it up

It is slower than "just do it." In exchange, the fix later doesn't take forever. It is not a tool for letting the AI run alone for longer.

**Evidence:** we are building the same project twice, once by handing everything to the AI and once the kagami way. We will fill in the results here when they are in (still checking).

### How it differs from similar tools

Similar tools split work too. The goal is different. The tools below split work to run several AI agents together, or to turn a spec into tasks; kagami splits it so that you hold the flow and several people can work together.

| | Where the work lives | When it is split | Who takes a piece | Promises between pieces |
|---|---|---|---|---|
| [CCPM](https://github.com/automazeio/ccpm) | GitHub issues and `.claude/epics/` files | PRD → epic → tasks, one epic at a time | Agents running in parallel | `depends_on` and `conflicts_with` in task files, each agent scoped to its own files |
| [Spec Kit](https://github.com/github/spec-kit) | `specs/<feature>/tasks.md` in the repo | Spec → plan → tasks, one feature at a time | An agent; `[P]` tasks can run in parallel | `contracts/` interface docs from the plan step, and contract-test tasks |
| [BMad Method](https://github.com/bmad-code-org/BMAD-METHOD) | Planning docs in the repo and the epic's `tickets.toml` | An epic is sliced into stories up front; the rest are re-sliced when problems show | An agent, one story at a time; epics with clear boundaries in parallel | Architecture doc and shared contracts, integration checks at each epic boundary |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | `openspec/changes/<change>/tasks.md` in the repo | Per change: proposal → specs → design → tasks | An agent (`/opsx:apply`) | Not verified |
| [Claude Code agent teams](https://code.claude.com/docs/en/agent-teams) (experimental) | Local task list in `~/.claude/tasks/` | By the lead agent, as it goes | Teammate agents that claim tasks themselves | Dependencies between tasks, a different set of files for each teammate |
| [Marcus](https://github.com/painted-porch/marcus) | A shared kanban board | Marcus splits what you describe | Several agents that pull tasks from the board | Interface contracts between domains (types, API shapes), made before splitting |
| **kagami** | A tree of GitHub issues | Only the node that is up next; the AI proposes 2–3 ways, you pick | You and your Claude Code session, one leaf per session | Tests that run, written in `contracts/<node number>/` when splitting; the CI guard blocks a contract that was green and turned red |

Setting contracts before splitting is a known method. kagami borrowed it from [Marcus's contract-first decomposition](https://github.com/painted-porch/marcus/blob/main/docs/source/concepts/contract-first-decomposition.md) and [a post by James Phoenix](https://understandingdata.com/posts/contracts-parallelize-agents/). This and the other borrowed methods (ADR/MADR, trunk-based development, parallel change and more) are in the [methodology map](docs/design.md#methodology-map).

<sub>Checked against each tool's official README and docs on 2026-11-08: [CCPM README](https://github.com/automazeio/ccpm#readme), [Spec Kit README](https://github.com/github/spec-kit#readme) and [templates](https://github.com/github/spec-kit/tree/main/templates), [BMad Method README](https://github.com/bmad-code-org/BMAD-METHOD#readme) and [Choose a Planning Path](https://docs.bmad-method.org/plan/choose-a-planning-path/), [OpenSpec README](https://github.com/Fission-AI/OpenSpec#readme), [Claude Code agent teams docs](https://code.claude.com/docs/en/agent-teams), [Marcus README](https://github.com/painted-porch/marcus#readme). If something is wrong, tell us in Issues.</sub>

> [!NOTE]
> kagami is in **beta** (`v1.0.0-beta.3`). Things will break. Tell us what you hit in [Issues](https://github.com/Pancheble/kagami/issues).

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
| `/kagami:init` | Install kagami into a repository, new or existing: rules, issue templates, labels, and a CI guard |
| `/kagami:plan` | Turn what you want to build into a goal issue through conversation |
| `/kagami:next` | Recommend 2–3 things to work on next and start the one you pick |
| `/kagami:split` | Break a large issue into pieces that each fit in one session |
| `/kagami:build` | Build one leaf test-first, get the evaluator's verdict, and open a PR |
| `/kagami:test` | The red → green → refactor loop that `build` runs |
| `/kagami:try` | Try a finished branch yourself; close it if it's good, create fixes if not |

## FAQ

**Can I add it to an existing project?**
Yes. Run `/kagami:init` in a clone of it. It does not overwrite your files (it appends to `CLAUDE.md`, merges `.claude/settings.json`, and stops if there is an `AGENTS.md`), makes `dev` from your default branch, and asks you to make `dev` the default branch after pushing. Your existing issues stay outside the tree.

**Does it work for a team?**
Yes. Each person picks work from the same issue tree, and picked work is assigned so nobody else's session recommends it.

**Do I need GitHub?**
Yes. The tree lives in GitHub issues, and PRs go through a CI guard.

**Does it work with agents other than Claude Code?**
The rules are plain text in `AGENTS.md`, but the commands are Claude Code skills.

## License

[MIT](LICENSE). Parts of the skills are adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT); see [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
