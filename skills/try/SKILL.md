---
name: try
description: "Try a finished group of work yourself. If it's good, close it; if not, create the fixes."
license: MIT
---

This is trying a branch, from step 5 of AGENTS.md "One round of work". AGENTS.md is the source of the rules and they are not repeated here. Sections to read: "Trying a branch", "Assigning", "Record format", and the tags in "Git branches and merging".

Arguments: `$1` the branch number, `$2` the target repository (the current repository if omitted). Below, `R` is the target repository and `B` is the branch.

## 0. Start

- The git commands below use the current repository's origin. If `gh repo view --json nameWithOwner --jq .nameWithOwner` is not R, stop and say to call this again from a clone of R

- Find the root: `gh api repos/R/issues/B/parent --jq .number` is the root, and the root's parent must be 404 (B is a node right under the root). Otherwise stop and say so
- Read the tree with `node ${CLAUDE_PLUGIN_ROOT}/src/tree.ts --repo R --root <root>` and check that every leaf under B is closed. If any leaf is open, stop and say so
- If B is not assigned, assign the person who picked it, as in AGENTS.md "Assigning"
- Read "Done when" and "Try-it scenario" in B's body. If either is missing, stop and say so
- Pin the commit to try: `git fetch origin && git rev-parse origin/dev`. Below, this is `C`. Even if dev moves during the try, look at C

## 1. Evaluator check

Tell the evaluator agent `kagami:evaluator` that this is trying a branch, and give it B's number, the done criteria and commit C. It is not a leaf diff, so tell it not to look at the scope and TL;DR fields and to judge only the done criteria.

- On PASS, go to 2
- On FAIL, make a leaf to fix each failed done criterion (see "New leaf" below) and end here. Leave B open

## 2. How to run, and the scenario

Write it so the human can follow it themselves. Do not run the scenario for the human.

- How to run: how to get commit C (git branch or worktree), and the install and run commands. Take them from the target repository's CLAUDE.md "Commands"
- Scenario: copy the steps from B's body in order. Add one line per step on what to look at
- If the scenario has a step that looks at the recommendations (`/kagami:next`), add that during the try, trying B is recommendation 1. If the scenario assumes B is already closed and lists the next work as 1, read it as "during the try B is 1, next is …" (#50 spec-gap)

## 3. The human's answer

Wait until the human has tried it and answers in their own words. Do not add questions that lead the answer.

## 4. Sort into three and confirm

Sort the answer into one of three and confirm it in one line. Example: "I heard needs fixes: the list is not sorted by date. Is that right?" Do not go to 5 until the human says it is right.

- **It's fine:** it works as the scenario says and it is what the human wanted
- **Needs fixes:** it is what the human wanted, but something is wrong or missing
- **Not what I wanted:** the spec itself (done criteria, scenario, root) is not what the human wanted

If the answer mixes two, split it per item and confirm each.

## 5. Result

### It's fine

1. Decide the version: if the current repository has `.claude-plugin/plugin.json`, it is its `version`. Otherwise ask the human. When you ask, show `git tag -l 'v*' --sort=-v:refname | head -3`, and the default answer is "before 1.0.0 (no tag)"
2. Collect the leaf PR titles: for each closed leaf under B in the tree, get the PR numbers with `gh issue view <leaf> -R R --json closedByPullRequestsReferences`, and keep only one of any duplicate PR. Call `gh pr view <PR> -R R --json title,mergedAt` for each PR, drop PRs that were not merged, and order them by mergedAt
3. Call `node ${CLAUDE_PLUGIN_ROOT}/src/try.ts <version> <title>...`. The output is `{tag?, notes, prerelease, main}` JSON
4. If there is no tag (before 1.0.0), go to 5 without a tag or Release
5. If there is a tag:
   - If `git ls-remote --tags origin <tag>` already has it, stop. Propose making a new leaf that bumps the version
   - `git tag <tag> C && git push origin <tag>`. For the tag push, the permission prompt is the human's consent. If it is refused, delete the local tag and stop
   - Write notes to a file and run `gh release create <tag> -R R --verify-tag --title <tag> --notes-file <file>`. If `prerelease` is true (a tailed version such as `1.0.0-beta.1`), add `--prerelease` so the Release is marked Pre-release
   - If `main` is true (a plain release such as `1.0.0`), move main to the tag commit: `git push origin C:refs/heads/main`. The first one creates main. For this push, the permission prompt is the human's consent. If it is refused or rejected (main is not behind C), say so in one line and carry on: the tag and Release stay. A beta (`main` false) does not move main
6. Add the trying-a-branch record to B and close it with `gh issue close B -R R`, then sync the board as in "New leaf" below

```markdown
**trying a branch** it's fine (the human). <closing without a tag or Release since this is before v1.0.0 | tag <tag>, Release <link>>
- 1. Evaluator: <n> lines of done criteria PASS (dev <first 7 chars of C>)
- Scenario 1: <what the human saw>
- …
```

### Needs fixes

- For each thing to fix, make a new leaf under B (see "New leaf" below). Leave B open
- Add `**trying a branch** needs fixes (the human). <the human's answer>. → #<new leaf>...` to B

### Not what I wanted

- Offer 2–3 options for changing the spec, with good/bad for each, and pick one to recommend. If the root has to change, write `/kagami:plan` in that option
- Add a `**needs-decision**` record (AGENTS.md format) to B and put the `needs-decision` label on it. Leave B open
- If the human answers on the spot, follow up with `**answer**` and remove the label

## New leaf

Make it in `/kagami:split`'s leaf format (Goal, Contracts to keep, Done when, Scope). In Done when, write a test that checks the failed done criterion, or the symptom the human saw, again.

```bash
gh issue create -R R --title "<leaf title>" --label leaf --body-file <body>
id=$(gh api repos/R/issues/<leaf> --jq .id)
gh api repos/R/issues/B/sub_issues -X POST -F sub_issue_id=$id
```

Then sync the board: `node "${CLAUDE_PLUGIN_ROOT}/src/board.ts" --repo R`. It puts the tree's issues on the GitHub Project boards linked to R and sets their Status (Todo / In Progress / Done). If it prints nothing (no board linked, nothing changed), say nothing. If it prints a line (what changed, or the `gh auth refresh -s project` hint), pass it on in one line, but show the `gh auth refresh -s project` hint at most once per session. If it fails, show the error as a one-line warning and carry on. The board never stops the work.

Make the leaves and stop there. In the next session, `/kagami:next` recommends implementing them.
