# AGENTS.md — metro-atl-transit-tracker

SvelteKit 2 app (Svelte 5 runes, TypeScript) that powers maitai.observer, a public transit-advocacy map and content hub for Metro Atlanta. It contains a MapLibre map, goals and history pages, an admin JSON editor, and JSON API endpoints backed by Cloudflare D1. It deploys to Cloudflare Workers and uses npm.

This file provides operational guidance for **all AI agents** (Cursor, Claude Code, Codex, Copilot, etc.). **Canonical coding patterns** live in [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md); area-specific rules live in `.claude/rules/*.md`. Human contributor conventions start in [`CONTRIBUTING.md`](CONTRIBUTING.md).

> **Public repo, live data.** This repository is public. `/admin` edits write straight to the production D1 database (`metro-atl-transit-prod`). `data/content/*.json` only seeds an empty database, so it can lag behind live content.

---

## Setup

**Prerequisites:** Node.js 22+ (CI uses Node 22; no version file is pinned), npm, and Wrangler (a dev dependency; run it with `npx wrangler`).

```bash
npm install
npm run d1:migrate:local   # apply migrations/d1 to the local D1 emulation
npm run dev
```

`.env.example` is the template for local config; the README's "Editor Auth" section explains each variable. Local development needs no Cloudflare login. Wrangler commands with `--remote` act on the Cloudflare account and need `npx wrangler login`; read Boundaries before running one.

---

## Commands

### Testing

- Unit and component tests (Vitest, colocated `src/**/*.test.ts`; component tests are `*.svelte.test.ts` and run in jsdom): `npm run test`. This runs `svelte-kit sync && vitest run`; extra arguments go to `vitest run`, e.g. `npm run test -- src/lib/server/content/handlers.test.ts`.
- Coverage: `npm run test:coverage`
- Smoke test (starts a local Wrangler worker, exercises the read/write happy path): `npm run test:smoke`
- Integration test (history ordering and immutability): `npm run test:integration`
- D1 schema check (tables, indexes, triggers): `npm run schema:check`
- Call Vitest through `npm run test` or `npx vitest run`; bare `vitest` starts watch mode.

### Development

- Dev server with Cloudflare platform emulation from `wrangler.jsonc`: `npm run dev`
- Build / preview: `npm run build`, `npm run preview`
- Typecheck (`svelte-check`): `npm run typecheck`
- Lint (ESLint): `npm run lint`
- Local gate: `npm run ci:gate` (typecheck, lint, test, schema check, smoke); `npm run ci:gate:full` adds integration. [`docs/ci-gate-policy.md`](docs/ci-gate-policy.md) defines the gates.
- Format: `npm run format` (Prettier with `prettier-plugin-svelte`; options in `.prettierrc`, exclusions in `.prettierignore`). `npm run format:check` lists unformatted files.

### Deployment

`npm run deploy` builds and runs `wrangler deploy` to production (the top level of `wrangler.jsonc`; staging is `env.staging`). Cloudflare Workers Builds is also connected to this repo, and **every push to `main`, including a PR merge, deploys to production** (`npx wrangler deploy`). Every other pushed branch, including PR branches, runs `npx wrangler versions upload`, which uploads a Worker version without deploying it (the `Workers Builds: metro-atl-transit-tracker` check). These triggers are set in the Cloudflare dashboard, not in this repo. Agents do not deploy or apply remote migrations; see Boundaries. Remote migration commands are in the README ("Cloudflare / D1 Operations"). Backup and restore runbooks are in [`docs/backup-retention-policy.md`](docs/backup-retention-policy.md).

---

## Project Structure

**Key areas:**

- `.claude/`: area rules (`rules/`), user-invoked audit commands (`commands/`), and the snippets those commands inline (`snippets/`)
- `data/content/`: seed JSON for an empty D1 database (projects, goals, history)
- `docs/`: CI gate, backup, and design-token policies; this coding standard; specs
- `migrations/d1/`: D1 SQL migrations, numbered `NNNN_description.sql`
- `reports/`: audit reports written by `.claude/commands/`
- `scripts/`: smoke, integration, and schema-check scripts plus asset build utilities
- `src/components/svelte/`: Svelte components
- `src/data/`: static geo metadata (fallback seed) and the generated `src/data/static/orgLogos.ts`
- `src/layouts/`: `BaseLayout.svelte`, which pages import directly (there is no `+layout.svelte`)
- `src/lib/map/`: MapLibre setup and layer helpers, plain TypeScript called from components
- `src/lib/server/`: server-only code: `auth/` (Cloudflare Access JWT, `requireEditorActor`), `content/` (projects, goals, history, profiles), `feedback/`, `openapi/`
- `src/routes/`: pages (`/`, `/history`, `/admin`) and JSON API endpoints under `src/routes/api/`
- `src/styles/global.css`: design tokens (CSS custom properties) and the Tailwind imports
- `src/types/`: shared, type-only declarations with a barrel at `src/types/index.ts`
- `src/utils/`: isomorphic helpers (status colors, date formatting, logger, county lookup)
- `static/`: assets SvelteKit serves as-is

**Domain vocabulary:**

- **Project**: a transit project (status, county, sources), stored in the D1 `projects` table.
- **Goal**: an advocacy goal, grouped by county or regional, with related projects nested under it (`goals` table).
- **Status**: a project stage: `planning`, `public-outreach`, `funding-application`, `implementation`, `completed`, `ongoing`. Colors live in `src/utils/statusHelpers.ts`.
- **Content history**: the append-only `content_history` event log. Every write adds an event; D1 triggers block updates and deletes.
- **Archive / restore**: soft delete through the `is_archived`, `archived_at`, and `archived_by` fields. These fields change only through the dedicated archive and restore endpoints.
- **Editor / actor**: an authenticated Cloudflare Access identity. Permissions are `content:edit` and `content:archive`, granted through the optional `CF_ACCESS_RBAC_*` allowlists.
- **Seed content**: `data/content/*.json` (falling back to `src/data/geo/*-metadata.json`), loaded only into an empty database. Live content is D1.

**Navigation hints:**

- New API resource? Add `src/routes/api/<resource>/+server.ts`. Wire it to a domain module in `src/lib/server/<domain>/`, the way `api/projects` wires `makeCollectionHandlers` from `src/lib/server/content/handlers.ts`. Validate input with Zod in that domain's `validators.ts`. Register the schema in `src/lib/server/openapi/spec.ts`.
- New component? `src/components/svelte/`, following `.claude/rules/svelte.md`.
- Schema change? Add the next-numbered file in `migrations/d1/`, and extend `scripts/check-d1-schema.mjs` when it adds a required table, index, or trigger.
- New shared type? `src/types/<domain>.ts`, exported through the barrel (`CONTRIBUTING.md` → "Type declaration placement").
- New color, surface, or spacing value? Reuse or add a token per [`docs/design-tokens.md`](docs/design-tokens.md).

---

## Code Style

Follow [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md) for cross-cutting patterns (functional style, TypeScript, writing for human reviewers, testing, canonical file index). Use area rules for depth:

| Surface                                              | Rule                                      |
| ---------------------------------------------------- | ----------------------------------------- |
| Functional style                                     | `.claude/rules/functional-programming.md` |
| TypeScript                                           | `.claude/rules/typescript-standards.md`   |
| UI design                                            | `.claude/rules/design-review.md`          |
| Svelte / SvelteKit (including the runes-only policy) | `.claude/rules/svelte.md`                 |
| Unit tests                                           | `.claude/rules/testing.md`                |
| Documentation edits                                  | `.claude/rules/doc-review.md`             |

**Repo-specific reminders:**

- Imports: `$lib/...`, `@/...`, and relative paths coexist; match the file you are editing (`docs/CODING_STANDARDS.md` → Legacy).
- Styling is Tailwind 4 utilities plus the CSS custom-property tokens in `src/styles/global.css`. Do not add hex literals ([`docs/design-tokens.md`](docs/design-tokens.md)). The site is dark-only.
- Every API input is validated with Zod; responses are `{ data }` for items and `{ data, meta: { count } }` for lists.
- D1 queries use bound parameters (`.bind()`) only.
- Content writes go through the content service so they append a history event; never write the content tables directly.
- Code runs on Cloudflare Workers (`nodejs_compat` enabled); a new dependency must run there.
- Prettier owns formatting (single quotes, semicolons, 2-space indent, 100-column lines). Run `npm run format` instead of formatting by hand.

---

## Git Workflow

See [`.claude/rules/github-operations.md`](.claude/rules/github-operations.md) for branch naming and GitHub workflow.

- Keep the local default branch (`main`) current and branch from it, unless asked otherwise.
- Target PRs to the default branch, unless asked to stack onto or target a different branch.
- **Branch names:** `chore/short-description` (or ask the user). The repo has no issue tracker, so there are no ticket-key branches.
- Keep commits and PRs focused; avoid bundling unrelated changes.
- Write descriptive commit messages; no WIP commits in final PRs.
- All required CI checks must pass before a PR can merge. `.github/workflows/ci-gates.yml` runs three jobs on every PR and on pushes to `main`. **Quality Checks** runs typecheck, lint, unit tests, and schema check; **Smoke Test** and **Integration Test** follow it. The `main-protection` ruleset requires all three, so changes reach `main` only through a PR with green checks.

Pushes to `main` also trigger `.github/workflows/backup-snapshots.yml`, which snapshots `data/content/*` to R2, and a Cloudflare Workers Build that deploys to production (see Deployment).

---

## Boundaries

**✅ Always:**

- Keep changes scoped — only modify what directly supports the task
- When moving or removing logic, or changing a response shape, find every consumer of the old location and update all of them in the same change
- For doc edits, prefer the smallest diff that restores accuracy; do not remove correct content or restructure docs unless it is stale or the user explicitly asks for a rewrite (`.claude/rules/doc-review.md`)
- Create or update a spec in `docs/specs/` only when the user asks for one or the work meets the bar in `docs/specs/README.md`; do not commit planning notes or scratch specs alongside feature work
- When a change introduces a new shared pattern (package, module, middleware, error type, or helper others should follow), update `docs/CODING_STANDARDS.md` or the relevant area rule in the same change
- Write focused automated tests for new logic, utility functions, and meaningful UI workflow changes when coverage adds real value
- Run `npm run ci:gate` before calling code changes done

**⚠️ Ask before:**

- Adding new external dependencies
- Changing the public JSON API's routes or response shapes (published at `/api/openapi.json`)
- Changing `wrangler.jsonc` (bindings, routes, rate limits, vars), Cloudflare Access or RBAC configuration, or `.github/workflows/`
- **Any mutation against the Cloudflare account.** This covers D1 `INSERT`/`UPDATE`/`DELETE` or DDL, remote migrations, R2 put or delete, Worker deploys, and secret changes. On production (`metro-atl-transit-prod` D1, prod Workers, R2 backup buckets), describe the exact call and get approval for each action, even when the task implies it. Prefer a staging dry run or a migration or script the user runs. On staging (`metro-atl-transit-staging`), say what you will run before running it. Read-only queries, R2 listings, and Worker or observability inspection need no approval. This applies to Wrangler and to the Cloudflare MCP servers in `.mcp.json`.

**🚫 Never:**

- Commit credentials, `.env*` files, or any secrets
- Modify generated output (`node_modules/`, `.svelte-kit/`, `build/`, `.wrangler/`)
- Deploy to shared non-production environments or production without explicit user confirmation
- Push large speculative refactors without user confirmation
- Push, commit, or post to external systems (GitHub, issue trackers, chat, etc.) unless the user explicitly asked for that action in the current message
- Add comments to code unless the user asked — suggest them in chat instead; leave existing comments alone (`.claude/rules/typescript-standards.md`)

---

## Decision quality and communication

When you finish a task, your **summary should explain your reasoning**, not only what changed. Developers use this to trust the solution and review it efficiently.

**Include in summaries (when non-trivial):**

- **Goal** — what the user needed.
- **Approach chosen** — what you did and why it fits this repo.
- **Alternatives considered** — when a meaningful alternative existed; do not invent trade-off prose for changes with one obvious approach.
- **Tradeoffs** — pros/cons of the chosen approach vs alternatives; be honest about downsides.
- **Adversarial check** — how the change could fail, be bypassed, or confuse humans; what you did (or deliberately did not do) to mitigate that.
- **Residual risk / follow-ups** — anything still manual, untested, or environment-dependent.

**Format summaries for scanning, not reading:**

- **Outcome first** — the first line answers "what happened," bolded, before any reasoning.
- **Bullets over paragraphs** — one idea per bullet, with a bold lead-in so the eye can skip.
- **No paragraph over three sentences** — if it runs longer, break it up or bullet it.
- **Prose is for judgment, not narration** — a few plain sentences are welcome for nuance and risk. What changed (files, behavior) belongs in bullets; the play-by-play of how you got there ("first I read X, then searched Y") does not belong at all.
- **Show, don't reference** — when flagging a specific passage of code or docs, quote or cite the actual lines in the message; never make the reader open a file to understand the finding.
- **End with the ask** — anything needing user action goes in a clearly marked line at the end, not buried mid-paragraph. When the turn ends with open decisions, present them as structured multiple-choice questions (via the question tool when available, with a marked recommendation), not prose flags the user has to notice.
- **Context before every question** — before asking the user to choose, finish checking what you can verify yourself. Then, in the same message, explain what is being decided, why, and what each option changes, including its tradeoffs. The user sees only your message, not your reasoning.

**Keep solutions simple:**

- Prefer the **smallest change** that meets the request. Do not add files, abstractions, or duplicate policy in many places unless each layer has a clear job.
- Do not expand scope (extra refactors, drive-by fixes, new utilities) unless the user asked or it is required for correctness.
- Avoid **documentation sprawl** — one canonical location per concept; link out instead of repeating the same rules in five files.
- **Work with the framework, not around it.** If you find yourself encoding data or duplicating logic a library already handles (identity, equality, lifecycle), stop and use the mechanism it provides — a workaround can be a small diff and still be the wrong solution.
- If you notice you are "defending" complexity, step back and simplify first, then explain why what remains is necessary.

**Minimal-fix discipline (bug fixes and false positives):**

1. Before editing, state the smallest diff that fixes the reported case — implement that first.
2. Fix the reported input, not the problem class. One failing case is not a mandate to make parsing, validation, or error handling "robust."
3. Generalize only if the minimal fix demonstrably fails, and say why before doing it.

Stop and propose instead of implementing when a fix would add:

- a new parser, tokenizer, state machine, or character-by-character scanner
- a new allowlist/denylist, config surface, or lookup table
- more than ~15 changed production lines for a single reported bug (tests, types, and caller updates do not count against this)
- handling for inputs that have not actually occurred

A slightly broader heuristic beats correct-but-complex machinery. In guard/hook code specifically, a false positive costs one click — bias toward simple-and-occasionally-noisy over complex-and-precise.

**Abstraction heuristics (frontend and backend):**

- **Avoid thin pass-through wrappers in new code.** Do not add an exported function whose only job is renaming another API or prepending a fixed path when one call site could invoke the underlying API directly. Prefer direct calls, or a shared named constant when the same path is reused across features.
- **Extract on reuse or real complexity.** Add a util, component, or constant when shared by multiple call sites or when logic branches, validates, or maps.
- **No dead code.** Do not add helpers, page-object methods, tests, or hooks that nothing calls yet. If you add logic, ensure something in the same change uses it.

Over-eager agents bloat diffs, slow human review, and introduce regressions. When in doubt, do less and say why.

Code-level readability standards (comments, naming, function/file size) live in [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md) under "Write For Human Reviewers" — this section governs behavior while working; that one governs the code you leave behind.

---

## Agent Routing

Use the smallest agent surface that fits the task. If a durable spec already exists in `docs/specs/`, read it before invoking domain-specific agents.
Before spawning subagents or running multiple independent/cross-model review passes, read [`docs/agents/agent-model-strategy.md`](docs/agents/agent-model-strategy.md).

The `epic-planning` skill and the `final-reviewer` agent are provided by the agent-guardrails plugin (Cursor and Claude Code).

| Situation                                                        | Primary Resource                                                                                                                  | Use It When                                                                                                     | Typical Follow-Up                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Large plan, migration, or phased rollout                         | `epic-planning` skill                                                                                                             | The work needs decisions, sequencing, validation, rollback, or multi-package coordination before implementation | `final-reviewer` once implemented              |
| Final implementation review                                      | `final-reviewer` agent                                                                                                            | The work is implemented and needs an objective merge-readiness review                                           | Fix findings, then re-review if needed         |
| Repo audit (architecture, health, security, UI/UX, FOSS options) | `.claude/commands/` (`/analyze-codebase`, `/check-health`, `/security-scan`, `/audit-uiux`, `/recommend-foss`); user-invoked only | The user asks for an audit report                                                                               | The report lands in `reports/<name>-<date>.md` |

For review passes, prefer role separation and `readonly` review before model separation; for high-risk validation, consider a different model family when available.

---

## When Stuck

1. Ask a clarifying question rather than guessing at scope or intent.
2. Propose a short plan before starting a large refactor or infrastructure change.
3. Suggest to the user to open a draft PR when uncertain about the right approach.
4. Use `docs/CODING_STANDARDS.md` to choose the right modern or legacy reference before copying an existing pattern.
5. Use the `Agent Routing` table above when the work needs deeper research or specialized help.

---

## Canonical References

| Topic                                                                        | Location                                                                                                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Coding standards (canonical patterns)**                                    | [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md)                                                                                 |
| Agent model strategy                                                         | [`docs/agents/agent-model-strategy.md`](docs/agents/agent-model-strategy.md)                                                           |
| API routes, editor auth, env vars, rate limits, Cloudflare and D1 operations | [`README.md`](README.md)                                                                                                               |
| Audit commands and report format                                             | [`.claude/commands/`](.claude/commands/), [`.claude/snippets/report-format.md`](.claude/snippets/report-format.md)                     |
| Backup, retention, and restore runbooks                                      | [`docs/backup-retention-policy.md`](docs/backup-retention-policy.md)                                                                   |
| CI gates                                                                     | [`docs/ci-gate-policy.md`](docs/ci-gate-policy.md)                                                                                     |
| Design review principles                                                     | [`.claude/rules/design-review.md`](.claude/rules/design-review.md)                                                                     |
| Design tokens and styling (Tailwind 4 + tokens)                              | [`docs/design-tokens.md`](docs/design-tokens.md)                                                                                       |
| Doc edits                                                                    | [`.claude/rules/doc-review.md`](.claude/rules/doc-review.md)                                                                           |
| Functional programming                                                       | [`.claude/rules/functional-programming.md`](.claude/rules/functional-programming.md)                                                   |
| Git branch naming and GitHub operations                                      | [`.claude/rules/github-operations.md`](.claude/rules/github-operations.md)                                                             |
| PR template / PR authoring                                                   | [`.claude/rules/pr-creation.md`](.claude/rules/pr-creation.md), [`.github/pull_request_template.md`](.github/pull_request_template.md) |
| Specs guide                                                                  | [`docs/specs/README.md`](docs/specs/README.md)                                                                                         |
| Svelte and SvelteKit standards, runes-only policy                            | [`.claude/rules/svelte.md`](.claude/rules/svelte.md)                                                                                   |
| Type declaration placement                                                   | [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                                                                   |
| TypeScript standards                                                         | [`.claude/rules/typescript-standards.md`](.claude/rules/typescript-standards.md)                                                       |
| Unit testing patterns                                                        | [`.claude/rules/testing.md`](.claude/rules/testing.md)                                                                                 |
