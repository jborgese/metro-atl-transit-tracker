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
   Pass criteria: ESLint reports zero errors and no more warnings than the `--max-warnings` ceiling in the `lint` script in `package.json`. Every warning comes from a backlog rule demoted to `warn` in `eslint.config.cjs`. The ceiling only goes down: a PR that clears a backlog rule's warnings promotes that rule to `error` and lowers the ceiling by the same count.

3. Format Check
   Command: `npm run format:check`
   Pass criteria: Prettier reports every file it covers as formatted (`.prettierrc`, `.prettierignore`).

4. Unit Tests
   Command: `npm run test`
   Pass criteria: every Vitest test passes.

5. Schema Check
   Command: `npm run schema:check`
   Pass criteria:

- Local D1 migrations apply successfully.
- Required tables, indexes, and immutability triggers exist in `sqlite_master`.
- Expected SQL constraints for payload JSON validity and archive/history invariants are present.

6. Smoke Test
   Command: `npm run test:smoke`
   Pass criteria:

- Worker starts locally with Wrangler.
- Public read routes return valid responses.
- Project write/archive/restore flow succeeds end-to-end.

7. Integration Test
   Command: `npm run test:integration`
   Pass criteria:

- Mutation history ordering invariants hold for projects and goals.
- History immutability trigger rejects tampering attempts.

## Enforcement

- CI workflow file: `.github/workflows/ci-gates.yml`. The `Quality Checks` job runs typecheck, lint, format check, unit tests, and the schema check; `Smoke Test` and `Integration Test` run after it.
- Required status checks for `main`, enforced by the `main-protection` repository ruleset:
  - `Quality Checks`
  - `Smoke Test`
  - `Integration Test`
- The ruleset also requires PR branches to be up to date with `main` before merging, and blocks force-pushes to and deletion of `main`.
- Deployments must only run from commits where all required checks are green. Every push to `main` deploys to production through Cloudflare Workers Builds, which does not wait for GitHub checks (`AGENTS.md` → Deployment), so the ruleset is what enforces this.
- Emergency bypass is allowed only for incident response, with a follow-up fix and retroactive CI pass on the hotfix commit. Repository admins can bypass the ruleset when merging a PR, not by pushing to `main` directly.

## Local Preflight

Run the full gate locally before cutting a deploy candidate:

```bash
npm run ci:gate:full
```
