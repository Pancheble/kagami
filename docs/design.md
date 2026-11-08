# kagami design

2026-11-04 · baekchan

The human holds the flow, and only decisions that are hard to undo go up to the human. The tree lives in GitHub issues, and the work happens in Claude Code conversations. The rules themselves are in [AGENTS.md](../AGENTS.md); this document explains why they look the way they do.

## Background

kagami started out aiming for full autonomy, with the human stepping in at only a few points. The main lesson: the boundary for asking the human is not "how vs. what" but "is it easy to undo?". The story is in [stage 0 history](history/stage-0.md).

## Principles

AI is an amplifier; the human owns what they want and the responsibility for it. Gaps appear no matter who does the work, and fixing them is the work.

1. **The human holds the flow.** The human picks the next piece of work. The Claude Code conversation holds the flow, and GitHub holds the tree (sub-issues, blocked-by) and the records
2. **Hard-to-undo decisions go to the human.** The AI decides the rest and records it in the PR's `Decided`
3. **Text the human reads answers two questions first.** Where are we in the tree, and what are we building this time. If it was explained simply and the human still skips it without reading, that is the human's responsibility
4. **Records live in issues.** When a conversation ends, its decisions vanish with it. So questions and answers, and changed contracts, go on the issue, where the next session or another person can pick them up
5. **Rules live in repository docs.** They are written in `AGENTS.md`, not only in Claude Code skills, so everyone reads the same document whatever agent they use
6. **Keep enforcement minimal.** Use what already exists (Claude Code permission prompts, CI). Add a blocking safeguard only when the same problem has happened three times
7. **Structure it as if there were many from the start.** Humans and agents are each one worker in the tree. The count just happens to be 1

## One round of work

One piece of work you picked, finished in one session. The root is assumed to have been set up beforehand with `/kagami:plan` (the planning conversation) and to have passed the spec check.

1. **Open:** open a Claude Code session and point it at the repository
2. **Recommend:** Claude Code reads the tree and offers 2–3 pieces of work that can be done now, each of a different kind, with reasons. For example: the one that finishes fastest, the one that unblocks the most other work, a blocked one that needs the human's judgment. It does not open with "what do you want to do?"
3. **Pick:** the human picks. If none of the three fits, find one through conversation and record it as `off-recommendation`. The picked work is assigned to the person who picked it (see "Assigning and taking over" below)
4. **Plan notice:** show the background, then what will be done this time, briefly. If it follows the ticket, keep going without stopping. If it departs from the ticket or involves a decision for the human, ask with options and wait
5. **Build:** `/kagami:build` writes the tests first. Ambiguities the spec does not cover are asked on the spot
6. **Evaluate:** an evaluator agent without write access judges the work against the done criteria and scope. On FAIL, fix and try again; after 3 FAILs, stop and tell the human
7. **PR:** the title follows Conventional Commits (`feat:`, `fix:` …), the body starts with a TL;DR, and includes `Closes #<leaf number>`
8. **Consent and merge:** when CI is green, show the TL;DR. When the human agrees in the conversation, Claude Code squash-merges. One leaf becomes one `dev` commit, and the PR title becomes that commit message. `gh pr merge` is never auto-allowed, so the Claude Code permission prompt is the human's consent
9. **Record and finish:** questions and answers go on the work's issue, changed contracts on the parent issue, newly found work as new issues. Then clear the session

### Trying a branch

When every leaf of a branch is closed, the human tries it out. The branch issue stays open until the try is done, and it lists the done criteria and a 3–5 step try-it scenario.

1. The evaluator checks the automatic done criteria. On FAIL, create leaves to fix it
2. Claude Code explains how to run it and walks through the scenario
3. The human tries it and answers in their own words
4. Claude Code sorts the answer into one of three and confirms it in one line
   - **It's fine:** put a release tag `v*` on that commit and create a GitHub Release (its description is the PR titles of that branch's leaves). Close the branch
   - **Needs fixes:** create new leaves under the branch
   - **Not what I wanted:** raise a proposal to change the spec as `needs-decision`

The first release is `v1.0.0`. Before `v1.0.0`, close without a tag: even when the answer is "it's fine", close only the branch, with no tag and no GitHub Release.

`dev` is the only development git branch, and tags mark the points where the human tried the work. The only kind of tag is the release tag `v*`; old states are pointed to by commit hash. Tag pushes are never auto-allowed, so the Claude Code permission prompt is the human's consent. Once the repository is public, `main` exists only as a pointer to the latest `v*` release (see [ADR 0004](adr/0004-single-dev-trunk.md)).

## The state of the work sets the role

Roles are not handed out to people or agents in advance. The state of the picked work sets the session's role, and when the role is done, the session ends.

| State of the picked work | Role | What is used | What remains |
|---|---|---|---|
| Root with empty fields | Planning conversation | `/kagami:plan`, spec check | Plan document, root issue |
| Node with no children | Split | Tree-aware split (`/kagami:split`) | Child leaf issues, contract tests |
| Ready leaf | Build | `/kagami:build` | PR and TL;DR |
| Built leaf, before the PR | Evaluation | Evaluator agent without write access, inside the build session | Verdict returned to the session |
| Branch with every leaf closed | Trying a branch | Evaluator's verification + the human's scenario | It's fine / needs fixes / not what I wanted |
| Blocked work | Look again | Don't continue; new session | One line: "blocked because…" |
| Question that needs the human's answer | Answer | The human | Question and answer on the issue |
| Merge | Consent | The human (Claude Code permission prompt) | `dev` commit |

The "parent" is the node issue, not a live session. A parent session kept alive piles up context and becomes a middleman between the human and the children. In [stage 0](history/stage-0.md), that was exactly the problem: the human saw the parent session's summary instead of the originals.

## Text the human reads

The human reads only two kinds of text. Both open with the same two lines: "where are we now, and what are we building". The human does not read diffs.

**Plan notice** (before building, under ten lines)

```markdown
Where: <root> › <branch> › #<leaf number> <name>
Why: why this work (2–3 lines)
Scope: what will be done this time (within 3 lines)
Done when: done criteria
Decide: (only when needed) 2–3 options, good/bad, one recommendation
```

Without `Decide`, the notice only informs and work continues. It stops only when `Decide` is there. Choosing requires reading, so the human reads only when they must. Field names stay in English; write the content in the language your team uses.

**PR TL;DR** (top of the PR body)

```markdown
Where: <root> › <branch> › #<leaf number>
What: what was done (within 3 lines)
Changed: new issues / plan changes / contract changes / risk paths touched / new dependencies / deleted tests
Decided: only what the AI decided on its own, and why
```

- **Facts are computed.** A script counts `Changed` (new issues, changed contract tests, risk paths, dependencies, deleted tests)
- **The AI writes only the "why"**
- **The evaluator also checks that the TL;DR matches the diff.** Anything left out is a FAIL. This guards against self-reporting, where the builder summarizes its own work

## Decisions that go to the human

The test is "is it easy to undo?". If it is, the AI decides and records it. If not, it asks with options. Below is the starting list; add to it when a real case comes up where the human thinks "I should have known about this".

- **Visible behavior:** what users see or feel changes (e.g. password login → magic link)
- **Contracts between parts:** contract tests, data formats, where state lives
- **Permissions and security:** authentication, permissions, secrets, risk paths
- **Stack and overall structure:** language, framework, database, repository layout. Kept as ADRs in [docs/adr/](adr/)
- **Change of scope:** departing from the ticket or doing something listed as out of scope

When asking, give 2–3 options, each with a "good / bad" sentence, and pick one recommendation. This is the same format as MADR's "Good, because / Bad, because".

### Handling framing bias

Preferences are formed while options are being presented (Lichtenstein & Slovic). So when the AI sets the frame, the human's choice drifts toward the range the AI laid out. Delegating reduces regret but blurs responsibility (Anderson 2003, 2023 meta-analysis).

- **Recommendations are deliberately of different kinds.** When all three look alike, the bias grows
- **Record "none of the three".** Where the human steps outside the recommendations is where the AI's frame missed something

## Session lifetime and leaf size

One picked piece of work = one session. A new session must be able to start knowing nothing of earlier conversations, by reading only the work's issue and its parent issue.

- **Move things out before finishing:** questions and answers → the work's issue, changed contracts → the parent issue, newly found work → new issues, and the fact that the pick was off the recommendations, if it was. Then clear
- **spec-gap:** if information was needed that the ticket and parent issue did not have, leave `**spec-gap**` on the issue. As these pile up, they show what splitting tends to miss
- **When blocked, don't continue:** leave `**blocked**`, unassign, and start over in a new session. If something has to be done to unblock it, create a new issue + blocked-by
- **The exception is the planning conversation:** it runs for days, so sessions break, but the plan document holds the state, so that is fine

**Leaf size is measured by the length of the text the human reads.** A filling context window is too late a signal. A leaf that cannot be explained simply is also too big for the human to check.

| When | Signal | What to do |
|---|---|---|
| Before starting | The plan's `Scope` is over 3 lines | Propose splitting before starting |
| While working | Files outside the scope are needed, or the changed line count grows (`git diff --stat`) | Stop and tell the human |
| After finishing | The TL;DR's `What` is over 3 lines, or FAILs kept repeating | Record that next time it should be split smaller |

When a split is needed, that session turns the leaf into a node, creates child leaf issues, and ends. The children are picked one at a time in later sessions.

### Assigning and taking over

So that the same work is never picked up twice, even with many people from the start, the GitHub assignee shows "who is working on it".

- **Assign:** all picked work, not only leaves (splits and planning conversations too), is assigned to the person who picked it. Claude Code re-reads the issue just before assigning, and if someone took it in the meantime, recommends again. Assigned work drops out of "ready"
- **Unassign:** when the PR is merged, the issue closes. If the PR is closed without merging, or `blocked` is left, or the work has had no activity (leaf branch push, PR, issue comment) for 3 days while assigned, unassign it. Claude Code sweeps stale assignments when a session opens. Every unassign leaves `**released**`
- **Take over:** if an old leaf branch remains for the picked leaf, Claude Code shows its diff and issue records, and the human chooses whether to continue it or start over. When continuing someone else's work, credit it with `Co-authored-by:`. This matches the "take over" practice in Rust and Kubernetes

## Safeguards that remain

The human is in the conversation, so there is no question of whether an approval really came from a human. Claude Code creates issues and PRs under the human's own account.

| Safeguard | What it does |
|---|---|
| Claude Code permission prompt | `gh pr merge` is never auto-allowed, so the human consents before every merge |
| CI guard | Detects edits to existing contract tests, ratchet (once green, stays green). Shows up as a check on the PR |
| Spec check | Counts whether every field of the root is filled |
| Evaluator agent | Judges done criteria, scope, and TL;DR without write access |
| Contract tests | `contracts/<node number>/`, red at first, leaves can only widen them |

## Methodology map

Almost nothing here is new. Proven methods are woven into the tree and the human's flow.

| Method | Core idea | Where it is used here |
|---|---|---|
| [Construction of preference](https://www.abebooks.fr/9780521834285/Construction-Preference-Lichtenstein-Sarah-Editor-0521834287/plp) (Lichtenstein & Slovic) | Preferences are formed in the act of asking, and flip depending on how you ask | Planning conversation, recommendations of different kinds, recording framing bias |
| [Decision avoidance](https://research.tilburguniversity.edu/en/publications/the-psychology-of-doing-nothing-forms-of-decision-avoidance-resul/) (Anderson 2003), [2023 meta-analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC10575496) | Delegating lets you avoid responsibility, which reduces regret | Skipping without reading is the human's responsibility |
| ADR (Nygard), [MADR](https://ozimmer.ch/practices/2022/11/22/MADRTemplatePrimer.html) | Record options and "Good, because / Bad, because" for every decision | How the human is asked, the PR's `Decided`, stack ADRs in [docs/adr/](adr/) |
| Boehm's verification and validation | "Did we build it to spec?" differs from "Is it what we wanted?" | The evaluator verifies; the human validates at every branch |
| WBS, HTN, ADaPT | Break big work into a tree; split further only when stuck | Issue tree, split a leaf when it is too big |
| [Parnas (1972)](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html) | Divide by "reason to change" so parts collide less | Leaf scope |
| Kanban pull | Take work out only when someone is free to do it | Split only when needed |
| [Beads](https://www.morphllm.com/beads-agent-memory) | Pull only what can be done now from the dependency graph | Next-work recommendations, `discovered` |
| DORA, trunk-based development, feature flags | Keep git branches short, hide unfinished features, merge daily | One `dev` trunk, tags mark when the human tried it |
| [Not Rocket Science Rule](https://graphite.com/blog/bors-google-tap-merge-queue) | Only let in what was tested on top of the latest trunk | Merge only when CI is green |
| Contract-first decomposition ([Marcus](https://github.com/painted-porch/marcus/blob/main/docs/source/concepts/contract-first-decomposition.md), [James Phoenix](https://understandingdata.com/posts/contracts-parallelize-agents/)) | Set the contracts between pieces before splitting, so pieces built apart still fit | Splitting writes the child contracts in `contracts/<node number>/` first |
| Contract tests, parallel change (expand–contract) | Keep the old way, add the new way beside it, move everything, then delete the old | Changing contracts, ratchet |
| TDD red first | Confirm with a failure first that the test really checks something | Red at first |

## Shape of the records

Every record is an issue comment whose first line starts with a bold marker in English. Write the body in the language your team uses. Each marker gets a label of the same name so you can filter by them on GitHub: `needs-decision`, `split`, `contract-change`, `blocked`, `off-recommendation`, `spec-gap`, `discovered`. `released` and `trying a branch` are markers only, with no label. `needs-decision` is the only status label: when a session opens, Claude Code reads the comments on issues with this label; if there is an answer, it confirms it with the human in one line, leaves `**answer**`, and removes the label. If there is no answer, it asks again. So answers are cleaned up the same way whether they were given in a session or on GitHub. "Ready" is computed from the tree, so it is not a label.

| Marker | What | Where | Example |
|---|---|---|---|
| `needs-decision` | A question to the human and its answer | The work's issue | **needs-decision** What to return for an empty name? ① "hi, " ② an error ③ "hi, guest" → **answer** ③ (the human). Reason: an empty name is treated as a guest |
| `split` | A split decision | Node issue | **split** Picked option ② (the human). ① UI first: good, visible early / bad, the API gets changed twice. ② API first: good, contracts settle first / bad, visible later. Children #40 #41 #42, contracts `contracts/12/` |
| `contract-change` | A changed contract | Parent node issue | **contract-change** #41 added an optional argument `rememberMe` to `login()` (widening). PR #48 |
| `blocked` | Blocked. If something has to be done to unblock it, a new issue + blocked-by | The work's issue | **blocked** bcrypt native build fails. Tried: reinstall, node 22. Next: switch to a pure JS implementation → #52 (blocked-by) |
| `off-recommendation` | A pick outside the recommendations | The picked work's issue | **off-recommendation** Recommended #21, #24, #27; picked #30. Reason: I wanted to see note saving before login |
| `spec-gap` | Something the ticket did not have | The work's issue | **spec-gap** Session expiry time. Found in a comment on parent #12. Put it in the leaves at the next split |
| `discovered` | Newly found work | New issue (under the right parent) + a comment on the work's issue | **discovered** #55 password reset email. Found in: login failure screen |
| `released` (no label) | Why the work was unassigned | The work's issue | **released** @baekchan. Reason: no activity for 3 days |
| `trying a branch` (no label) | The human's answer after trying a branch | Branch issue | **trying a branch** needs fixes (the human). "The list doesn't refresh after saving". → #61 |

## Still open

- [x] Splitting: the AI offers 2–3 options with good/bad, and the human picks
- [x] How the CI guard gets kagami's code: it checks out kagami at the pinned tag ref without a token, since kagami is public ([#52](https://github.com/Pancheble/kagami/issues/52))
- [x] Shape of the records: each marker gets a label of the same name
- [x] Blocked: if something has to be done to unblock it, a new issue + blocked-by
- [x] Cleaning up `needs-decision`: when a session opens, Claude Code reads the comments; if there is an answer, it confirms it in one line, leaves `**answer**`, and removes the label. If not, it asks again
- [x] Assigning: assignee; unassign after 3 days of no activity, a closed PR, or blocked; `released` marker (no label); a leftover leaf branch is shown and the human chooses + `Co-authored-by:`
- [x] Commits: squash merge, PR titles in Conventional Commits, `Closes #` in the body
- [x] Names: labels, markers, and notice field names stay in English; content is written in the language your team uses
- [x] CONTRIBUTING: a short one for target projects now; one for the kagami repository when it goes public
- [ ] The list of decisions that go to the human: the current list is a proposal. Real cases will settle it

Whether the human knows the flow is the job of the plan notice and the TL;DR. It is not asked about or measured separately. Trying a branch also moves on with a single "OK" when it's fine. If "I should have known about this" keeps happening, add something then (principle 6).
