---
name: plan
description: "Turn what you want to build into a project goal issue through conversation. Use when starting a project or changing its goal."
license: MIT
disable-model-invocation: true
---

# Planning conversation

Arguments: `$1` the plan document path, `$2` the target repository owner/name.

Run "Root with empty fields → planning conversation" from `docs/design.md`. Assign the root to the person who picked it and start (`AGENTS.md` "Assigning"). Do not wrap it up after a few questions. It may take days or weeks.

The plan document is the source, and the root issue is drawn from it. When changing anything, always change the plan document first.

## Who decides what

- The human decides the "what": success criteria, what is out of scope, risk paths (paths to add to Risk paths in the target repository's CLAUDE.md), the choice of stack. The AI offers options and their trade-offs; the human picks
- The AI does not fill fields in for the human. Leave the fields the human has not answered empty, and let the spec check report them as missing
- Whether the content is right is not judged here. The human checks that by trying it, when trying a branch with every leaf closed. The spec check only counts whether the fields exist (and for the risk paths field, whether it contains "CLAUDE.md")

## 1. Talk it through

Let the human say what they want to build, with no document format. Do not interrupt, and write what you hear into the plan document ($1; if none, ask the human for a path), keeping the intent as it is.

## 2. Self-grilling (up to 15 rounds)

One round:

1. Write the single most ambiguous or risky spot in the current plan document as a question
2. Write the AI's own answer to that question alongside it (grounds: the plan document, code, research)
3. Check whether the things decided so far contradict each other. If they do, make that the next question
4. Only when it is something only the human can decide (the what, priorities, taste, money and time), ask the human then. When asking, give 2–3 options, their trade-offs, and one recommendation

Finish before 15 rounds once you can judge. Each round, record the question, your own answer, and the human's answer (if any) in the plan document.

## 3. Find what already exists

Skim official features, open source and research. Take out of the plan what something existing can replace, and write it as "use this". Leave only the gaps as things to build.

## 4. Fold it into one plan document

It is not a design document but a record of refined intent. Keep only one document. When terms come up, collect them in the plan document's glossary.

When branch candidates show up, write each candidate's fields from `.github/ISSUE_TEMPLATE/branch.md` (Goal, Done when, a 3–5 step Try-it scenario) into the plan document. Do not put them in the root issue. When the root is split into branches, `/kagami:split` moves these fields into branch issues.

## 5. When it gets bloated, start over

If it grows heavy from only adding, rewrite it from scratch so only the plan remains. After rewriting, ask the human whether any intent went missing.

## 6. Draw the root issue only at the end

1. Draw the fields of `.github/ISSUE_TEMPLATE/root.md` from the plan document and write them to a body file (in a scratch folder or next to the plan document)
   - Plan document: a link or path to the source
   - Success criteria: one per line, `- <criterion> (check: <how>)`. Write them so the evaluator can run them ("logging in with a registered email shows the dashboard", not "login works")
   - Risk paths: write only "See CLAUDE.md". The single source is Risk paths in the target repository's `CLAUDE.md`. Project paths the human chose are added there in backticks (the defaults `.github/workflows/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, `.env*` are already there). Do not write paths in the root
   - Evaluator setup: test accounts, seed data
   - Stack and ADRs: what was chosen, why, the alternatives dropped
   - Out of scope
   - Write "None" in a field the human decided is "None". Leave fields that were not decided empty
2. The human posts the root issue from their own account (create it for a new root; edit the body when changing it). Show the command and let the human run it:
   `gh issue create -R <target-repo> --title "<root title>" --body-file <body-file>`
3. Run the spec check:
   `node "${CLAUDE_PLUGIN_ROOT}/src/spec.ts" --repo <target-repo> --root <root-number>` (runs with the human's gh account)
4. If it reports missing items, go around again from step 2 (self-grilling) with those items. Fix the plan document, draw it again, check it again
5. When it reports nothing missing, close the planning conversation. The next session recommends splitting this root into branches (`/kagami:split`)

## When trying a branch comes back "not what I wanted"

Read the reason comment left on the root, and go around from step 2 with that reason. Fix the plan document first, change the root issue body with step 6, then run the spec check again.
