# 0001. Ship kagami as a Claude Code plugin

Status: Accepted

## Context

kagami is a set of skills, an evaluator agent and scripts that a team installs into its own repo. It needs one way to be distributed and loaded by an agent.

## Decision

- kagami is a Claude Code plugin.
- The kagami repo itself is the marketplace. The marketplace in `marketplace.json` is named `kagami`.
- Claude Code is the only adapter.
- Each `SKILL.md` uses the open standard shape: `name`, `description`, `license`.

## Considered options

### Claude Code only

Chosen.

### Also build adapters for other agents

- Bad, because nobody uses them now.

## Consequences

- The workflow is written for Claude Code (`AGENTS.md` says so).
- Target repos install kagami from the `kagami` marketplace, and skills are called as `/kagami:*`.
- Adapters for other agents stay out of scope.
