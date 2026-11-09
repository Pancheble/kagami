# CONTRIBUTING

This project works the kagami workflow. The human owns what they want and the responsibility for it; Claude Code (CC) is the tool that amplifies it. The rules agents follow are in `AGENTS.md`. This document holds only what the human needs to know.

## Where the work is

Work is managed as a tree of GitHub issues: root › branch › node › leaf. One leaf is one PR. "Ready" means open, everything it waits on (blocked-by) is closed, and assigned to no one. It is computed from the tree, so it is not marked separately.

## How one round of work goes

1. Open a CC session. CC cleans up answered `needs-decision` issues and stale assignments, then recommends 2–3 leaves of different kinds, with reasons. CC's top recommendation is number 1.
2. Pick one. The issue is assigned to you, and other people's CC no longer recommends it. You can pick outside the recommendations. If you do, CC leaves the reason in an `off-recommendation` record.
3. Read the plan notice (`Where / Why / Scope / Done when / Decide`). CC stops only when there is a `Decide`.
4. CC builds it, an evaluator agent without write access checks the done criteria and scope, and then CC opens the PR.
5. Read the PR's TL;DR (`Where / What / Changed / Decided`). When CI is green, agree in the session. The merge permission prompt is that consent. Leaf PRs are squash-merged.
6. Close the session. Do the next piece of work in a new session.

## Trying a branch

A branch with every leaf closed is something you try out yourself. The branch issue stays open until the try is done. The evaluator agent checks the automatic done criteria, and CC explains how to run it and walks you through the try-it scenario. When you try it and answer in your own words, CC sorts the answer into one of three and confirms it in one line.

- **It's fine:** a release tag `v*` and a GitHub Release are created on that commit, and the branch is closed. The tag push permission prompt is your consent
- **Needs fixes:** new leaves are created under the branch
- **Not what I wanted:** a proposal to change the spec is raised as `needs-decision`

The first release is `v1.0.0`. Before `v1.0.0`, close without a tag: even when the answer is "it's fine", close only the branch, with no tag and no GitHub Release.

## Assigning and taking over

- If assigned work has no activity (leaf branch push, PR, issue comment) for 3 days, the next session unassigns it. It is also unassigned when the PR is closed without merging or `blocked` is left. Every unassign leaves a `**released**` record on the issue.
- If you are letting go of the work, you can unassign it yourself.
- If you pick a leaf that still has an old leaf branch, CC shows the remaining diff and records and asks whether to continue it or start over. If you continue someone else's work, the original author is credited with `Co-authored-by:`.

## What the human decides

CC does not make decisions that are hard to undo on its own; it raises them to the human: visible behavior; contracts, data formats and where state lives; permissions, security and risk paths; stack and overall structure; changes of scope. CC offers 2–3 options with good/bad and one recommendation, and the human picks. The same goes for splitting a node into leaves.

## What we don't do

- Do not push directly to dev. All work happens on dev and leaf branches, and the points where the human tried the work are marked with release tags `v*`, the only kind of tag.
- Do not commit to main or open a PR to it. main only points at the latest plain release: `/kagami:try` moves it to the tag commit of a release with no tail (`v1.0.0`), never for a beta. dev stays the default branch.
- Do not do two leaves in one session.
- Do not quietly edit contract tests (`contracts/`). If you changed one, it must be in the TL;DR's `Changed`, and CI flags it separately.

## Naming commits and PRs

- Leaf branch: `leaf/<number>-<short-name>`
- PR title: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). After the squash, it becomes the dev commit message
- PR body: `Closes #<leaf number>`

## Reading the records

A record is an issue comment, and it gets a label of the same name as the bold marker on its first line.

| Label | Meaning | What you do |
|---|---|---|
| `needs-decision` | Waiting for your answer | Answer, in a session or in an issue comment. The next session's CC reads the comment, confirms it in one line, leaves `**answer**`, and removes the label |
| `split` | How the node was split and who picked | Just read it |
| `contract-change` | A contract was widened or changed step by step | See whether it affects other leaves |
| `blocked` | Blocked. If something has to be done to unblock it, a new issue is linked with blocked-by | It comes up in the next session's recommendations |
| `off-recommendation` | Why something else was picked instead of a recommendation | Just read it |
| `spec-gap` | A fact found while building that the ticket did not have | See whether the scope should change |
| `discovered` | An issue newly found and created along the way | See where it belongs in the tree |

`released` (why the work was unassigned) leaves only a record, with no label.

## Developing kagami itself

This repository is the `kagami` marketplace and is also built with the kagami workflow. Target repositories declare the GitHub marketplace under the name `kagami`. If this repository declared a folder marketplace under the same name, opening a session on one side would replace the user-scope `kagami` marketplace with the other side's source. So `.claude/settings.json` here declares no marketplace. It only enables `kagami@kagami`, and sessions here use the kagami you have installed.

- Install the released plugin once at user scope: `claude plugin marketplace add Pancheble/kagami`, then `claude plugin install kagami@kagami`
- To try skills, agents or hooks from your working tree, start the CLI with `claude --plugin-dir .`. It loads this folder's plugin for that session only
- Do not add a marketplace named `kagami` to `.claude/settings.json`. `contracts/126/marketplace.contract.ts` checks this

## More reading

- `AGENTS.md`: the full set of rules CC follows
- `docs/design.md`: why we work this way
