# AGENTS.md

Every agent working in this repository reads this document first. The human holds the flow; the agent finishes the one piece of work that was picked, leaves records, and ends. This workflow is written for Claude Code.

## Language

- Talk to the human in the language they write in, even though this document and the skills are in English. This covers everything the human reads: recommendations, the plan notice, questions and options, the PR TL;DR, and what you say at the end
- If the human has not written anything yet (a session that opens with a slash command such as `/kagami:next`), use the language the tree's issues and records are written in
- Keep names that code reads or people search for exactly as written: record markers, label names, issue field names (`## Goal` and so on), the field names of the plan notice and the PR TL;DR (`Where:`, `Changed:` and so on), commands and paths. Write what goes in them in the human's language

## Reading the tree

- The tree lives only in GitHub issues. Root › branch › node › leaf are linked as sub-issues, and waiting is linked with blocked-by
- The root has the plan document link, success criteria and how to check them, risk paths, evaluator setup, stack and ADRs, and what is out of scope
- A node issue has its goal, the child contracts, and a record of contract changes
- A leaf issue has its goal, contracts to keep, done criteria, and scope (the files and folders it touches)
- "Ready" = open, every blocked-by is closed, and assigned to no one
- When you start a piece of work, read its issue and its parent issue. Do not dig through other PRs

## One round of work

1. **Clean up:** do "When you open a session" below
2. **Recommend:** offer 2–3 ready pieces of work of different kinds, with reasons. Put your own recommendation first. Do not open with "What do you want to do?"
3. **Pick:** the human picks. If they pick something outside the recommendations, leave an `off-recommendation` record
4. **Assign:** assign the person who picked it, as in "Assigning" below
5. **Role:** the state of the picked work sets the role. A root with empty fields is a planning conversation (`/kagami:plan`), a node with no children is a split (see "Splitting" below), a ready leaf is a build, a branch with every leaf closed is a try (see "Trying a branch" below), and a root with every branch closed is closed (`/kagami:next` confirms in one line, then closes it)
6. **Plan notice:** show it in the format below. If there is no `Decide`, go ahead
7. **Build:** write the tests first with `/kagami:build`. Ask on the spot about anything ambiguous the spec does not cover
8. **Evaluate:** have the evaluator agent (`kagami:evaluator`, no write access) judge the done criteria, scope, and TL;DR. On FAIL, fix it and evaluate again. After 3 FAILs, stop and tell the human
9. **PR:** title it as in "Commits and PRs" below, put the TL;DR at the very top, and open it against dev
10. **Merge:** when CI is green, show the TL;DR, and when the human agrees, merge with `gh pr merge --squash --subject "<PR title> (#<PR number>)"`
11. **Record and finish:** do "Before you finish" below, and say "You can clear the session now."

## When you open a session

Before recommending, clean up two things.

- Read the comments on issues labeled `needs-decision`. If there is an answer (in a session or on GitHub, from anyone), confirm it with the human in one line, then leave `**answer**` and remove the label. If there is no answer, ask again
- Find work that has been assigned with no activity for 3 days, unassign it, and leave a `**released**` record. Activity is any of: a leaf branch push, a PR (opened, committed to, commented on), or an issue comment

## Assigning

- Assign every picked piece of work, not only leaves (splits and planning conversations too). Assign one person only
- Re-read the issue just before assigning. If someone else took it in the meantime, say so and recommend again
- When to unassign: when the PR is merged, the issue closes, so leave it. If the PR is closed without merging or `blocked` is left, unassign and leave `**released**`. Unassign stale assignments in "When you open a session"
- If an old leaf branch (`leaf/<number>-*`) remains for the picked leaf, show its diff and the issue records, and ask the human whether to continue it or start over. If you continue and the original author is someone else, credit them with `Co-authored-by:` in the commit

## Plan notice format

```markdown
Where: <root> › <branch> › #<number> <name>
Why: why this work (2–3 lines)
Scope: what will be done this time (within 3 lines)
Done when: done criteria
Decide: (only when needed) 2–3 options, good/bad, one recommendation
```

## What to ask the human

For decisions that are hard to undo, ask with options and wait. Decide the rest yourself and record it in the PR's `Decided`.

- Behavior users see changes
- Contracts between parts change: contract tests, data formats, where state lives
- Permissions and security: authentication, permissions, secrets, risk paths listed in the root
- Stack and overall structure
- You need to depart from the ticket or do something listed as out of scope

## Splitting

- When you pick a node with no children, or a leaf is too big and has to be split, offer 2–3 ways to split it with good/bad for each, and pick one recommendation
- When the human picks, create the child leaf issues (goal, contracts to keep, done criteria, scope) and the blocked-by links, and write the child contracts in `contracts/<node number>/` first
- Leaf conditions: finishes in one session · done criteria exist as tests · scope is clear. If it already meets these, do not split it; say it "stays a leaf". A branch right under the root never stays a leaf: keep it a node and create one child leaf, so the branch is still tried
- Record the chosen option and the rejected ones on the node issue as a `**split**` record, and finish

## Leaf size

- If the plan's `Scope` is over 3 lines, propose splitting before you start
- If, while working, you need files outside the scope or the changed line count grows large, stop and tell the human
- To split, turn that leaf into a node, create the child leaf issues, and finish. The children are done in later sessions

## Trying a branch

A branch with every leaf closed is tried out by the human. The branch issue stays open until the try is done, and it has done criteria and a 3–5 step try-it scenario.

1. The evaluator checks the automatic done criteria. On FAIL, create leaves to fix it
2. Explain how to run it and walk through the scenario
3. The human tries it and answers in their own words
4. Sort the answer into one of three and confirm it in one line
   - **It's fine:** put a release tag `v*` on that commit and create a GitHub Release (its description is the PR titles of that branch's leaves). Close the branch
   - **Needs fixes:** create new leaves under the branch
   - **Not what I wanted:** raise a proposal to change the spec as `needs-decision`

The first release is `v1.0.0`. Before `v1.0.0`, close without a tag: even when the answer is "it's fine", close only the branch, with no tag and no GitHub Release.

## PR TL;DR format

```markdown
Where: <root> › <branch> › #<number>
What: what was done (within 3 lines)
Changed: new issues / plan changes / contract changes / risk paths touched / new dependencies / deleted tests
Decided: only what you decided on your own, and why
```

Fill `Changed` by counting with `git diff` and `gh`; write only `Decided` yourself.

## Git branches and merging

- dev is the trunk. All work happens on a leaf branch `leaf/<number>-<short-name>` and is merged into dev through a PR
- Leaf PRs are squash-merged. One leaf is one dev commit
- Do not push directly to dev. Merge only with CI green + a TL;DR + the human's consent
- "When the human tried it" is marked with a release tag `v*` (the commit where trying a branch was "it's fine", one per release). Release tags are the only kind of tag
- main is not for work: it is a pointer to the latest plain release. When a try puts a tag with no tail (`v1.0.0`, not `v1.0.0-beta.1`), main is moved to that tag commit. Nobody commits to main or opens a PR to it. dev stays the default branch
- Tag pushes and main pushes are never auto-allowed. The permission prompt is the human's consent

## Commits and PRs

- Write PR titles in Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:` (e.g. `feat: refresh login token`). When squashed, this title becomes the dev commit message
- Put `Closes #<leaf number>` in the PR body
- Commit messages inside the git branch are free-form. If you took over someone else's work, leave `Co-authored-by:`

## Contract tests

- Child contracts live in `contracts/<node number>/`. Write them first when splitting; they must be red at first
- A leaf can only widen a contract. If an existing contract test has to be edited or deleted, stop and ask the human
- Make breaking changes as a parallel change: keep the old way and add the new way → move everything over → delete the old way

## Record format

A record is an issue comment whose first line starts with a bold marker. Markers and label names stay exactly as written. Write the record body in the language your team uses. Each marker gets a label of the same name: `needs-decision`, `split`, `contract-change`, `blocked`, `off-recommendation`, `spec-gap`, `discovered`. `released` and `trying a branch` are markers only, with no label. `needs-decision` is the only state label, so remove it once there is an answer.

```markdown
**needs-decision** <what was asked> ① … ② … → **answer** <what was picked> (the human). Reason: …
**split** Picked option <number> (the human). <good/bad for each option>. Children #…, contracts contracts/<number>/
**contract-change** #<leaf> <what> (<widened / parallel change step N>). PR #…
**blocked** <what did not work>. Tried: … Next: … (if something has to be done to unblock it) → #<new issue> (blocked-by)
**off-recommendation** Recommended #…; picked #…. Reason: …
**spec-gap** <what>. Found in: …
**discovered** #<new issue> <what>. Found in: …
**released** @<previous assignee>. Reason: <no activity for 3 days / PR closed / blocked>
**trying a branch** <it's fine / needs fixes> (the human). <tag and Release, or none before v1.0.0 / the human's answer. → #<new leaf>...>
```

## Before you finish

- What you asked and the answer → `**needs-decision**` on the work's issue
- Contract changes → `**contract-change**` on the parent issue
- New work found along the way → a new issue (`discovered` label) + `**discovered**` on the work's issue. Link the new issue as a sub-issue of the branch it belongs to: by default the parent of the work's issue (the root itself if the work is the root); if it fits no branch, under the root. Label it `leaf` if it meets the leaf conditions in "Splitting", otherwise `node`. Never leave it without a parent: `/kagami:next` does not see parentless issues
- If you needed information that the ticket and the parent issue did not have → `**spec-gap**`
- If something outside the recommendations was picked → `**off-recommendation**`

## When blocked

Do not continue. Leave a `**blocked**` record on the work's issue, add the `blocked` label, unassign, and tell the human. If something separate has to be done to unblock it (swapping a library, changing another leaf's contract, and so on), create that as a new issue and link it to the blocked leaf with blocked-by. Next time, start over in a new session.
