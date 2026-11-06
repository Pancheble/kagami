# 0004. A single `dev` trunk, with tags for tried versions

Status: Accepted

## Context

All work happens on leaf branches and is squash-merged into one trunk. The repo also needs to record which commits a human actually tried, and keep old states around.

## Decision

- `dev` is the single trunk and the only git branch for development.
- "The moment a human tried it" is marked with a tag, not a git branch.
- There are two kinds of tags: release `v*` (a commit where trying a branch ended with "it's fine"; one tag is one release) and archive `archive/*`.
- Tag pushes are never allowed automatically. The permission prompt is the human's consent.

The original decision was to have no `main` at all. A later answer on #49 revised it: `main` is created when the repo goes public, not as a git branch for development but only as a pointer to the latest `v*` release, guarded by a ruleset once the repo is public. The human's reason: each release is moved onto `main` when it comes out, so releases stay tidy. The details are decided when #52 is split.

## Considered options

### One `dev` git branch plus tags

- Good, because there is one git branch to work on and protect.
- Good, because a tag marks exactly the commit a human tried.

### Fast-forward a second git branch `main` from `dev`

- Bad, because it needs another git branch, and a hook to guard it.

## Consequences

- Leaf PRs target `dev`, and nobody pushes to `dev` directly.
- Old states are kept as `archive/*` tags: `archive/t0` (T0, `dade1d8`, which existed only on the old `main`) and `archive/stage0-autonomy` (the former `stage0-autonomy` git branch).
- Every tag push, release or archive, goes through a permission prompt.
- Once public, `main` only follows the latest `v*` release and is not a place to develop.
