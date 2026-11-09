# Security policy

## Supported versions

Only the latest release gets security fixes. During the beta, that is the latest `v1.0.0-beta.*` tag.

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Report it privately through GitHub instead:

1. Go to the repository's **Security** tab
2. Click **Report a vulnerability**
3. Describe what is affected, how to reproduce it, and what an attacker could do

The report is visible only to you and the maintainers. You will get an answer on the advisory, and the fix and the advisory are published together once a fix is released.

Paths that matter most for security are the ones the guard runs: `src/guard.ts`, `src/run.ts`, and the workflows in `ci/` that kagami installs into other repositories.
