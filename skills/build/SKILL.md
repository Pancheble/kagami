---
name: build
description: "Implement one kagami leaf issue test-first, get the evaluator's verdict, and open a PR to dev."
license: MIT
---

> Source: https://github.com/mattpocock/skills (MIT, Matt Pocock), commit `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`, `skills/engineering/implement/SKILL.md`. Full license text: `THIRD_PARTY_NOTICES`.
> Changes: replaced `/code-review` with the evaluator agent's verdict, and matched AGENTS.md's plan notice, stop conditions and PR format. Added a step that moves to a `leaf/<number>-` git branch at the start. When moving into the kagami plugin, renamed it to build and the tdd it calls to test.

Argument: the leaf issue number. Implement the leaf issue the human gave you. `AGENTS.md` is the source of the rules; this skill gathers the implementation steps (AGENTS.md "One round of work" 6–9) in one place.

## Start

- Read the leaf issue and its parent issue with `gh issue view` and say the leaf's title. If the number is unclear, ask. Do not dig through other PRs
- If the current git branch does not start with `leaf/<number>-` (for example a `claude/...` one the app made), move with `git fetch origin && git switch -c leaf/<number>-<short-name> origin/dev`. That way `node "${CLAUDE_PLUGIN_ROOT}/src/changed.ts"` reads the leaf number without `--issue`
- Show the plan in AGENTS.md "Plan notice format" (Where/Why/Scope/Done when/Decide). Stop and wait for an answer only when there is a `Decide`. Otherwise keep going
- Write the seams to test (the test skill's "Seams") in `Scope`. Even if the plan notice goes ahead without stopping (no Decide), the seams count as agreed. Do not ask again in test
- If `Scope` is longer than 3 lines, propose splitting before you start
- Read the check commands from the "Commands" section of the target repository's CLAUDE.md. Do not guess the package manager or command names. If the section is missing or has no check commands, ask the human, use the commands you get for this leaf, and pass them to the evaluator too. If the human clearly answers "this repository has no check commands", pass that answer (verbatim) to the evaluator. Record this question and answer on the leaf issue as `**needs-decision**` → `**answer**`. CLAUDE.md is a risk path, so do not edit it; only propose adding the commands to Commands

## Build

- Where you can, call "kagami:test" with the Skill tool at the seams agreed beforehand
- Run the typecheck and single test files from Commands often, and run the full check from Commands once at the end
- Ask about ambiguities the spec does not cover on the spot. Ask about hard-to-undo decisions (AGENTS.md "What to ask the human") with options and wait. Decide the rest and record it in the PR's `Decided`
- If you need files outside the leaf issue's scope, or the changed line count in `git diff --stat origin/dev...HEAD` grows large, stop and tell the human

## Evaluate

- When every slice is green, refactor and run the full check from Commands again
- When done, give the evaluator agent (`kagami:evaluator`, no write access) the done criteria, the scope and the draft TL;DR, and get its verdict. If Commands was empty and you got check commands or a "there are none" answer from the human, give that too
- On FAIL, fix and get a verdict again. After 3 FAILs, stop and tell the human (AGENTS.md "When blocked")

## Commits and PRs

- Commit the work to the current leaf branch and push. Do not push to dev directly
- Open the PR against dev. The title follows Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), the top of the body is the TL;DR in AGENTS.md "PR TL;DR format", and below it `Closes #<leaf number>`
- Fill `Changed` by counting with `git diff` and `gh`; write only `Decided` yourself
- The `plan changes (manual)` that `node "${CLAUDE_PLUGIN_ROOT}/src/changed.ts"` prints is a field you fill in yourself. If the goal, scope or done criteria of the leaf or parent issue changed during this PR, replace it with what changed (which issue, and the `**answer**` if the human decided it); otherwise replace it with `None`. If you leave `(manual)`, the evaluator catches it as a FAIL
- This skill does not merge. When CI is green, show the TL;DR and wait for the human's consent (AGENTS.md 10–11)
