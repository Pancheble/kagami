# Stage 0: how kagami got here

kagami did not start as the workflow described in [the design doc](../design.md). It started as an attempt at a fully autonomous harness. This page summarizes that attempt, what it taught, and how the current design came out of it. The original documents are kept in git tags (see [Where the originals are](#where-the-originals-are)).

## Stage 0: the autonomous harness

Stage 0 was built as tickets T0 to T12. The goal was full autonomy: the human sets a root spec and then joins only at steps 1, 2 and 8 of an eight-step flow. Everything else was meant to be done by AI and judged by scripts and tests.

The original 8 steps were:

| Step | What happened | Who |
|---|---|---|
| 1 Root spec | A long planning conversation turns what the human wants into a root issue with success criteria | the human + AI |
| 2 Branch | AI offers 2–3 ways to split the root; child contracts and contract tests come first | AI proposes, the human picks |
| 3 Split | Nodes are split into leaf tickets only when ready leaves run low | AI |
| 4 Pick a leaf | A script picks the nearest ready leaf and claims it | script |
| 5 Leaf loop | A fresh session implements, the evaluator judges, CI runs, a merge queue lands it on `dev`. If a risk path was touched, the human approves a behavior scenario first | AI, evaluator, CI (the human on risk paths) |
| 6 Stuck | Start over in a new session; after three failures, replan at the parent node | AI |
| 7 Parent done | When all children close, the parent closes | script |
| 8 Root review | The evaluator writes a report; the human tries the result and answers right / wrong / do it differently | evaluator, the human |

Step 8, where the human tries the result, is the one part that survived almost unchanged. It became [trying a branch](../design.md).

In four days stage 0 produced about 20 PRs and close to 20 mechanisms: a claim-and-heartbeat system, a three-layer failure loop, automatic replanning, a contract ratchet, a guard that waited for `/approve` comments, a report session that read `/right`, `/wrong` and `/differently` comments, stop and steer files, a script that fast-forwarded `main`, a bot account, and more. But the human never held the flow. Instead of the originals, the human saw only the summaries written by a long-running parent session.

## What it taught

1. **What is not measured is not kept.** All five success criteria for stage 0 were about mechanisms running (a branch closes with the human joining four times or fewer, a PR that edits a contract test is blocked, a stop file stops the loop, and so on). None of them said "the human knows each decision before moving on", so nothing protected it.
2. **The boundary was wrong.** Stage 0 drew the line as "AI decides how, the human decides what". Hard-to-undo structural decisions slipped into the "how" side: keeping state in GitHub comments, how to interpret a `/differently` command, a loop that keeps running on its own. The question should have been "is it easy to undo?"
3. **No real work was ever done.** Most mechanisms guarded against problems that had never happened. The harness only ever ran on toy functions in a test repository.

The complexity was the price of autonomy, not the price of having a harness.

## Principles the design used to cite

Stage 0 was built from a separate catalog of harness building blocks (the "block catalog", kept outside this repository). The design doc used to cite three of its principles:

- **Principle 1:** the human does not read diffs. People read short, structured text instead (today: the plan notice and the PR TL;DR).
- **Principle 4:** do not pre-build guards for problems that have not happened. Most stage 0 mechanisms broke it.
- **Principle 5:** the line is reversibility: what is hard to undo goes to the human. (The block catalog ties human checks on risk paths such as auth, payments and data deletion to principles 5 and 6.)

## What changed

**Mission command was dropped.** Stage 0 modeled replanning on mission command (Auftragstaktik): intent comes from above, method from the field. In kagami terms, AI could change how a node was built but not what it was for. That line missed hard-to-undo decisions that look like "how". It was replaced by one question: is it easy to undo? If yes, AI decides and records it under `Decided` in the PR. If no, the human chooses from 2–3 options.

**No bot account, no approval comments.** Stage 0 needed a bot account so the guard could tell a human's `/approve` comment apart from one the harness wrote itself. In kagami the human is in the conversation, so there is nothing to tell apart. Claude Code creates issues and PRs with the human's own account, and the permission prompt before `gh pr merge` or a tag push is the human's approval.

**The flow moved into the conversation.** Instead of a loop that runs by itself, each session does one chosen piece of work: recommend, the human picks, build, evaluate, PR, merge with the human's consent. GitHub keeps the tree and the records; the conversation holds the flow.

## The transition

The move from the autonomous harness to kagami was itself run the kagami way. Claude Code read the existing code and offered 2–3 transition plans. Each plan listed, file by file, what to keep, fix, archive or delete, with a reason for each. The human chose.

What survived is small: the evaluator with no write access (from cwc-long-running-agents), contract tests under `contracts/<n>/`, the CI guard (contract edits and the ratchet, without the approval wait), and the spec check for root issues. The rest was archived.

One warning came with it: beware of using something just because it exists.

## Where the originals are

The original documents were removed from `dev`. They are only in tags:

- [`archive/stage0-autonomy`](https://github.com/Pancheble/kagami/tree/archive/stage0-autonomy/docs/harness): the last commit that still had the autonomous code (leaf, session, split, replan, close, promote and others), before it was removed from `dev` in #31. Under `docs/harness/` it holds the first version of the current design doc, and under `docs/harness/archive/` the three stage 0 documents:
  - the overall harness flow (the 8 steps, guards, trunk and leaf picking, replanning)
  - the block list (every mechanism with the step it served and when it switches on)
  - the stage 0 plan (the spec check, the ticket table T0–T12 with every decision made along the way, and the plan for stages 1 and 2)
- [`archive/t0`](https://github.com/Pancheble/kagami/tree/archive/t0): the end of T0, where `main` used to point. It has earlier versions of the three documents, directly under `docs/harness/`; the stage 0 plan there predates the decisions made in T1 to T12.

All of them are in Korean.
