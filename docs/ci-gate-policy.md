# CI Gate Policy

## Purpose

Define the minimum automated checks that must pass before a commit is eligible for deployment.

## Required Gates

The following gates are blocking. Any failure blocks deployment.

1. Typecheck
Command: `npm run typecheck`
Pass criteria: `svelte-check` reports zero errors.

2. Lint
Command: `npm run lint`
Pass criteria: ESLint exits cleanly with zero warnings.

3. Schema Check
Command: `npm run schema:check`
Pass criteria:
- Local D1 migrations apply successfully.
- Required tables, indexes, and immutability triggers exist in `sqlite_master`.
- Expected SQL constraints for payload JSON validity and archive/history invariants are present.

4. Smoke Test
Command: `npm run test:smoke`
Pass criteria:
- Worker starts locally with Wrangler.
- Public read routes return valid responses.
- Project write/archive/restore flow succeeds end-to-end.

5. Integration Test
Command: `npm run test:integration`
Pass criteria:
- Mutation history ordering invariants hold for projects and goals.
- History immutability trigger rejects tampering attempts.

## Enforcement

- CI workflow file: `.github/workflows/ci-gates.yml`
- Required status checks for protected deployment branches:
  - `Quality Checks`
  - `Smoke Test`
  - `Integration Test`
- Deployments must only run from commits where all required checks are green.
- Emergency bypass is allowed only for incident response, with a follow-up fix and retroactive CI pass on the hotfix commit.

## Local Preflight

Run the full gate locally before cutting a deploy candidate:

```bash
npm run ci:gate:full
```
