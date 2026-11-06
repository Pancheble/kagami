# 0002. TypeScript without a build step

Status: Accepted

## Context

kagami ships scripts (the CI guard, `next`, `init` and others) that run inside target repos and in CI. They read and write GitHub issues, labels and pull requests.

## Decision

- Scripts are TypeScript that runs on Node 24 or later without a build step (`node src/x.ts`).
- GitHub access goes through the `gh` CLI.

## Considered options

### TypeScript run directly by Node 24+

- Good, because there is no build output to produce, ship or keep in sync.
- Bad, because syntax that Node cannot strip is not allowed (see below).

## Consequences

- Node only strips types, so syntax that is not erasable cannot be used: no `enum`, no `namespace`, no constructor parameter properties.
- Imports carry the `.ts` extension.
- `package.json` requires Node `>=24`.
- Anything that talks to GitHub needs `gh` installed and signed in.
