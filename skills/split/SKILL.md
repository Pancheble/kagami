---
name: split
description: "Break a large issue into small ones that each fit in one session. Offers 2–3 ways to split; you choose."
license: MIT
---

> Source: https://github.com/mattpocock/skills (MIT, Matt Pocock), commit `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`, `skills/engineering/to-tickets/SKILL.md`. Full license text: `THIRD_PARTY_NOTICES`.
> Changes: splits one node issue, not a plan or a conversation. Instead of offering one proposal and refining it, offers 2–3 options with good/bad for each, and the human picks. The leaf template becomes AGENTS.md's goal, contracts to keep, done criteria and scope, and the scope lists file paths (the original avoids paths). The red contract tests in `contracts/<node>/` go in first as a PR, and the leaf issues are created after it is merged. The git branch moves to `leaf/<node>-split`, and the merge gets `--subject`. Moved into the kagami plugin and renamed to split, with an added path that splits a root with every field filled and no children into branches. `/setup-matt-pocock-skills`, the local-file mode and the `ready-for-agent` label were removed. Vertical slices and parallel change for wide refactors follow the original.

This is the split in step 5 of AGENTS.md "One round of work". AGENTS.md is the source of the rules, and they are not repeated here. Sections to read: "Splitting", "Leaf size", "Contract tests", `**split**` in "Record format", "Assigning".

Arguments: `$1` the node or root number, `$2` the target repository (if none, the current repository). Below, `R` is the target repository.

## 1. Read

- Read only the node issue and its parent issue with `gh issue view` (body and comments). Do not dig through other PRs
- If it already has children (`gh api repos/R/issues/<node>/sub_issues`), stop and say so. This skill splits only nodes and roots with no children
- If the node already meets the leaf conditions (AGENTS.md "Splitting"), say it "stays a leaf", and if the human agrees, change the `node` label to `leaf` and finish
- Read the code the node's goal touches. If you see a place to tidy first so the change is easy (prefactor), make that the first leaf

## 2. Offer options

Offer 2–3 ways to split and pick one to recommend. For each option:

- Leaf list: title, one line of the goal it covers, scope (files and folders), the leaves it waits on (blocked-by)
- Child contracts: the interfaces the leaves rely on from each other (function names, arguments, return values, data shapes)
- Good / bad

How to build the options (from the original):

- A leaf is a vertical slice. Not a horizontal slice that does one layer, but one path that runs all the way through, however narrow. A finished leaf can be checked on its own
- Keep leaf scopes from overlapping. Add blocked-by only for what really blocks
- A wide refactor (a mechanical change where one change breaks many call sites at once) is not cut vertically but chained as a parallel change: add the new way → leaves that move the call sites batch by batch (blocked-by the add) → remove the old way (blocked-by every move leaf)

Wait until the human picks. If they want an option changed, change it and offer it again.

## 3. Contracts to dev first

Write the picked option's contracts on the git branch `leaf/<node>-split` off dev in the target repository. If the current git branch is not that one (a `claude/...` one made by the app, etc.), move to it with `git fetch origin && git switch -c leaf/<node>-split origin/dev`.

1. A stub for each contract: only the shape, with the body `throw new Error("not implemented")`. Follow the repository's language and folder structure
2. Tests in `contracts/<node>/`: `name.contract.<ext>` for each contract, and an acceptance test `name.accept.<ext>` that checks the node's goal. Do not put `.test.` in the file names (the default test run would pick up the red tests and break CI)
3. Check that each file starts red with `node --test <file>`. Every single test must fail with the stub's "not implemented". If there is even one import failure, syntax error, missing test or pass, fix it. A test that checks "it throws" passes, because the stub throws too. Check the error type or message as well
4. Open a PR against dev. Title `test: #<node> <node name> contracts`, the TL;DR at the very top of the body (AGENTS.md "PR TL;DR format"; for Changed, run `node "${CLAUDE_PLUGIN_ROOT}/src/changed.ts" --issue <node>` in the target repository checkout), the red check results, `Refs #<node>`. The node is not closed, so do not use `Closes`
5. When CI is green, get the human's consent to merge and merge with `gh pr merge --squash --subject "<PR title> (#<PR number>)"`. Without `--subject`, the squash message can come out as the git branch's commit messages

Create the leaf issues after this PR is merged. A ready leaf must be buildable right away, so do not put a leaf in the tree whose contracts are not on dev.

## 4. Leaf issues and blocked-by

Create them in order, starting with the leaves that wait on nothing. Body:

```markdown
## Goal
The part of the parent's goal this leaf covers

## Contracts to keep
The contracts this leaf must not break. Which file in contracts/<node>/

## Done when
`node --test contracts/<node>/<file>` is green (+ the leaf's own tests)

## Scope
- Files and folders to touch
```

```bash
gh issue create -R R --title "<leaf title>" --label leaf --body-file <body>
id=$(gh api repos/R/issues/<leaf> --jq .id)
gh api repos/R/issues/<node>/sub_issues -X POST -F sub_issue_id=$id
# for each leaf it waits on (the id of the blocking one)
gh api repos/R/issues/<leaf>/dependencies/blocked_by -X POST -F issue_id=$(gh api repos/R/issues/<blocking-leaf> --jq .id)
```

If the labels are missing, do not create them by hand; create the same set as kagami with `node "${CLAUDE_PLUGIN_ROOT}/src/tree.ts" --repo R --labels`. When everything is created, check with `node "${CLAUDE_PLUGIN_ROOT}/src/tree.ts" --repo R --root <root>` that the children and blocked-by links are in place.

Then sync the board: `node "${CLAUDE_PLUGIN_ROOT}/src/board.ts" --repo R`. It puts the tree's issues on the GitHub Project boards linked to R and sets their Status (Todo / In Progress / Done). If it prints nothing (no board linked, nothing changed), say nothing. If it prints a line (what changed, or the `gh auth refresh -s project` hint), pass it on in one line, but show the `gh auth refresh -s project` hint at most once per session. If it fails, show the error as a one-line warning and carry on. The board never stops the work.

## 5. Record and finish

- On the node issue, add a `**split**` record (AGENTS.md format: the picked option, good/bad for each option, the child numbers, `contracts/<node>/`) and add the `split` label. Include the contract PR link too
- Unassign the node. The node stays open until all its children are closed. Do not edit the node body
- Do AGENTS.md "Before you finish" and say "You can clear the session now." The child leaves are done in the next session

## When splitting a root

A root with every field filled (when `node "${CLAUDE_PLUGIN_ROOT}/src/spec.ts" --repo R --root <root>` reports nothing missing) and no children is split into branches. Follow the steps above; only these differ.

- 1: Also read the root's plan document. The branch candidates `/kagami:plan` wrote down (goal, done criteria, try-it scenario) are the material for the options
- 2: Offer a list of branches instead of leaves. For each branch: title, goal, done criteria, a 3–5 step try-it scenario, the branches it waits on
- Skip 3. Contracts are written in `contracts/<branch>/` when the branch is split into leaves
- 4: Write the branch issues with the fields of `.github/ISSUE_TEMPLATE/branch.md`, create them with `--label node`, and attach them to the root as sub-issues. When the try-it scenario gives the recommendation order, write "while trying, this branch is recommendation 1, then …"
- 5: The `**split**` record and unassigning are done on the root. The root stays open until all its branches are closed
