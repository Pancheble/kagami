---
name: next
description: "At the start of a session, recommend 2–3 things to work on next and start the one you pick."
license: MIT
---

This is AGENTS.md "When you open a session" and steps 1–5 of "One round of work". AGENTS.md is the source of the rules, and they are not repeated here. Sections to read: "Language" (this skill often gives a session's first answer, after only a slash command), "Reading the tree", "When you open a session", "Assigning", "Record format".

Arguments: `$1` the target repository (if none, the current repository). It is `R` below.

## 0. Gather

- Set `R`: if there is no argument, `gh repo view --json nameWithOwner --jq .nameWithOwner`
- Find the roots. The output is an array of the numbers of open issues that have no parent, are not `leaf`, and have at least one root template field (`## Plan document` etc.). If there are none, say to set up a new root (`/kagami:plan`) and finish
- Call it again with `--root` for each root. The script only reads GitHub

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/next.ts" --repo R
node "${CLAUDE_PLUGIN_ROOT}/src/next.ts" --repo R --root <root>
```

The output is JSON.

- `ready`: ready work `{number, kind}`. kind is `build` (build a leaf), `split` (split a node with no children; for a root, split it into branches), `plan` (planning conversation for a root with empty fields), `try` (try a branch with every leaf closed)
- `stale`: issues assigned with no activity for 3 days
- `waiting`: open issues labeled `needs-decision`
- `drift`: if present, the kagami version on the first line of `R`'s AGENTS.md (`repo`) differs from the plugin version (`plugin`). If `repo` is missing, there is no version line. If `dev: false`, `R` has no `dev` git branch
- `leftover`: the leaf branches (`leaf/<number>-*`) left over for each piece of ready work

## 1. Clean up

Do this before recommending.

- **drift**: if present, say it in one line. Example: "AGENTS.md is on kagami v0.1.0, the plugin is v0.2.0." If `repo` is missing, say "AGENTS.md has no kagami version line". If `dev: false`, say "There is no dev git branch. Check whether this repository was set up with `/kagami:init`". Do not fix it; move on
- **waiting**: for each issue, read the last `**needs-decision**` record and the comments after it with `gh issue view <number> -R R --comments`. Count it as an answer whoever wrote it
  - If there is an answer, confirm it in one line. Example: "#12 was answered with ② (reason: …). Is that right?" If it is, append ` → **answer** <what was picked> (the human). Reason: …` to the end of that `**needs-decision**` comment (`gh api -X PATCH repos/R/issues/comments/<id> -f body=…`; if it cannot be edited, a new comment starting with `**answer**`) and run `gh issue edit <number> -R R --remove-label needs-decision`
  - If there is no answer, show the question and its options again and ask. If they answer, record it as above. If they do not answer now, leave it
- **stale**: for each issue, unassign the assignee (`gh issue edit <number> -R R --remove-assignee <login>`) and add `**released** @<login>. Reason: no activity for 3 days`. An unassigned issue may become ready again, so call the script once more and go to 2
- **board**: last, sync the board with `node "${CLAUDE_PLUGIN_ROOT}/src/board.ts" --repo R`. It puts the tree's issues on the GitHub Project boards linked to R and sets their Status (Todo / In Progress / Done). If it prints nothing (no board linked, nothing changed), say nothing. If it prints a line (what changed, or the `gh auth refresh -s project` hint), pass it on in one line. If it fails, show the error as a one-line warning and carry on. The board never stops the work

## 2. Recommend

Offer 2–3 ready pieces of work of different kinds, with reasons. Put your own recommendation first. Do not open with "What do you want to do?".

- If there is a `try`, trying that branch is number 1 (while it is being tried, that branch is recommendation 1)
- Write a root's `split` as "split the root into branches"
- Of different kinds = a different kind, or the same kind but in a different branch or touching a different scope. Do not list similar leaves of the same branch side by side
- For each number, read the title and goal with `gh issue view <number> -R R` and write the reason. Do not dig through other PRs
- If there is no ready work, say so, and say in one line each what the open work is waiting on (assignment, blocked-by, `blocked`)

```markdown
1. #<number> <title> (<build a leaf | split | split the root into branches | planning conversation | trying a branch>) — recommended. <reason>
2. #<number> <title> (<…>) — <reason>
3. …
```

## 3. Pick

Wait until the human picks. If they pick something outside the recommendations, add `**off-recommendation** Recommended #…; picked #…. Reason: …` to the picked issue and add the `off-recommendation` label. If you do not know the reason, ask once.

## 4. Assign

- Just before assigning, re-read it with `gh issue view <number> -R R --json state,assignees`. If it is closed or someone took it, say so and go back to 2
- `gh issue edit <number> -R R --add-assignee @me`, then sync the board again (as in 1) so the picked work shows In Progress
- If the picked work has `leftover` git branches, for each one show `git fetch origin && git diff --stat origin/dev...origin/<leaf-branch>` and the issue's records (`**blocked**`, `**released**`), and ask whether to continue it or start over. If you continue, start from that git branch, and if the original author is someone else, leave `Co-authored-by:` in the commit

## 5. Hand off

Call the skill for the picked work's kind.

- `build` → `/kagami:build <number>`
- `split` → `/kagami:split <number>`
- `try` → `/kagami:try <number>`
- `plan` → only the human calls `/kagami:plan`. Tell the human to type `/kagami:plan`
