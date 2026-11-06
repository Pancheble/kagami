---
name: test
description: "Test-first loop (red → green → refactor) that /kagami:build runs inside a kagami leaf issue. Not for general coding requests."
license: MIT
---

> Source: https://github.com/mattpocock/skills (MIT, Matt Pocock), commit `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`, `skills/engineering/tdd/SKILL.md`. Full license text: `THIRD_PARTY_NOTICES`.
> Changes: removed the dependencies on skills that do not exist here (`codebase-design`, `code-review`) and GLOSSARY.md, moved ADRs to the root issue's "Stack and ADRs", and moved refactoring to before the evaluator verdict. When moving into the kagami plugin, renamed it to test. The rest is as in the original.

# Test-Driven Development

TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.

When exploring the codebase, respect the ADRs listed under "Stack and ADRs" in the root issue. Tests here use `node:test` and `node:assert` (`src/**/*.test.ts`); the examples in tests.md use jest-style `expect` for illustration only.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.

Ask: "What's the public interface, and which seams should we test?" Give each proposed seam a one-line note on what it catches and what it misses.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** Do it after the slices are green and before the evaluator verdict (see the `build` skill), not inside the red → green cycle.
