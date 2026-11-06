<!-- TL;DR first (AGENTS.md "PR TL;DR format"). Title: Conventional Commits, e.g. `feat: refresh login token`. -->

Where: <root> › <branch> › #<leaf>
What: what this PR does (3 lines max)
Changed: new issues / plan changes / contract changes / risk paths touched / new dependencies / deleted tests
Decided: only what you decided alone, and why

<!--
Changed: count it with `git diff` and `gh` (`node src/changed.ts` prints the line).
plan changes is the one item you fill in by hand: what changed in the leaf or parent issue's goal, scope or done criteria during this PR (which issue, and the **answer** if the human decided), or `None`.
If the placeholder from `src/changed.ts` is still there, the evaluator fails the PR.
Touched a risk path? Add a behavior scenario below.
-->

Closes #<leaf>
