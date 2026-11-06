# 0003. Releases and tag pinning

Status: Accepted

## Context

Target repos run kagami's skills, evaluator and CI guard. They need to know which version of kagami they run.

## Decision

- A release is three things kept in step: the `version` in `plugin.json`, a git tag `v*`, and a GitHub Release.
- Target repos pin kagami to a tag ref.
- The first release is `v1.0.0`. Before it, branches are closed without tags: even when trying a branch ends with "it's fine", there is no tag and no GitHub Release.

## Considered options

### Pin target repos to a release tag

- Good, because every target repo runs a known, fixed version.
- Good, because a release is always a version a human tried (see [0004](0004-single-dev-trunk.md)).

## Consequences

- Cutting a release means updating `plugin.json`, pushing a `v*` tag and creating the GitHub Release together.
- A release is made when trying a branch ends with "it's fine": that commit gets the tag, and the Release description lists the PR titles of the branch's leaves.
- Until `v1.0.0`, trying uses the `dev` ref instead of a tag.
