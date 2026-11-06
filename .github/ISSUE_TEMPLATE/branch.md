---
name: Branch
about: A node right under the root. When all its leaves are closed, the human tries it. Leaves go under it as sub-issues
title: ""
labels: node
---

## Goal

<!-- Which of the root's success criteria this branch covers. Only the human changes the "what" -->

## Done when

<!-- One per line. Write each so the evaluator can run its check. Step 1 of trying a branch (the evaluator) reads this -->

## Try-it scenario

<!-- 3–5 steps for the human to try. Number them, and for each step say what to do and what should show. When giving the recommendation order, write "while trying, this branch is recommendation 1, then …" (while it is being tried, trying this branch is recommendation 1) -->

## Child contracts

<!-- Interfaces the leaves rely on from each other, and the contract tests that keep them (contracts/<this issue number>/). Fill in when splitting into leaves -->

## Contract changes

<!-- Leave this empty. Each leaf that changes a contract leaves a `**contract-change** #<leaf> <what> <widened / parallel change step n>. PR #…` comment on this issue and adds the `contract-change` label (the record format in AGENTS.md). The body isn't edited, so several leaves can write at once without clashing -->
