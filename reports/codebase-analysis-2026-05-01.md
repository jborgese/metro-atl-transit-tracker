# Codebase Analysis — metro-atl-transit-tracker

**Repo:** metro-atl-transit-tracker
**Generated:** 2026-05-01
**Scope:** All tracked source under [src/](../src/), [scripts/](../scripts/), [migrations/](../migrations/), [.github/workflows/](../.github/workflows/), and root-level configs. Generated artifacts (`node_modules/`, `.svelte-kit/`, `.wrangler/`, `public/data/`, `static/data/`) excluded.
**Tooling used:** `git ls-files`, `git log`, `wc -l`, `awk`, ripgrep (Grep), file reads. `cloc` not installed (Info finding F-13).

---

## Executive summary

- **Stack at a glance:** SvelteKit 2.50 (Svelte 5.49) + TypeScript on Cloudflare Workers via `@sveltejs/adapter-cloudflare`, with Cloudflare D1 (SQLite) as the system of record, MapLibre GL for geospatial UI, Tailwind 4 for styling, and Cloudflare Access (JWT via `jose`) plus an in-memory rate limiter for write-path auth. Small repo (~50 source files, ~8.4k LOC of source) with a single D1 migration and a hand-rolled smoke + integration harness in place of unit tests.
- **Auth & write path are the strong center.** [src/hooks.server.ts](../src/hooks.server.ts), [src/lib/server/auth/editor.ts](../src/lib/server/auth/editor.ts), and [src/lib/server/content/store.ts](../src/lib/server/content/store.ts) are coherent, defensively coded, and consistent in style — RBAC by env-CSV, immutable history table enforced by SQL triggers, optional editor-token mode for tests. This is the part of the codebase a new contributor should trust.
- **The lint config is broken under ESLint 9.** Both [.eslintrc.cjs](../.eslintrc.cjs) (legacy, extends `recommended`) and [eslint.config.cjs](../eslint.config.cjs) (flat, *empty rules*) are present. ESLint 9 only consults the flat config, so `npm run lint` is effectively a no-op. The CI gate passes lint trivially. (F-01, 🟠.)
- **A few large UI modules are absorbing most of the churn.** [src/components/svelte/MetroMap.svelte](../src/components/svelte/MetroMap.svelte) (40 commits in 6 months, 450 LOC), [src/lib/server/content/store.ts](../src/lib/server/content/store.ts) (1,483 LOC), and [src/routes/admin/+page.svelte](../src/routes/admin/+page.svelte) (1,293 LOC) are the obvious refactor candidates. None of them have automated tests at the unit level.
- **Layout has a quirk worth knowing on day one:** [src/pages/](../src/pages/) is a leftover from the project's pre-SvelteKit Astro origin. SvelteKit routes in [src/routes/](../src/routes/) are thin wrappers that re-export from `../pages/`. [src/pages/methodology.svelte](../src/pages/methodology.svelte) currently has no route pointing at it (F-08, 🟢).

---

## Findings table

| ID    | Severity | Title                                                                | Location                                                                                                  | Source              |
| ----- | -------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------- |
| F-01  | 🟠 High   | ESLint 9 flat config has empty rules — lint is a CI no-op            | [eslint.config.cjs](../eslint.config.cjs) + [.eslintrc.cjs](../.eslintrc.cjs)                             | File read           |
| F-02  | 🟠 High   | No automated unit tests; only integration/smoke at the HTTP boundary | [scripts/](../scripts/), [package.json](../package.json)                                                  | `find` / scripts    |
| F-03  | 🟡 Medium | Large modules concentrate complexity                                 | [src/lib/server/content/store.ts](../src/lib/server/content/store.ts), admin page, GoalsTable             | LOC sort            |
| F-04  | 🟡 Medium | `MetroMap.svelte` is a churn hotspot (40 commits / 6 months)         | [src/components/svelte/MetroMap.svelte](../src/components/svelte/MetroMap.svelte)                         | `git log` churn     |
| F-05  | 🟡 Medium | Two ESLint configs (legacy + flat) co-exist; cleanup cliff           | repo root                                                                                                 | File read           |
| F-06  | 🟡 Medium | Code is on Svelte 5 but written in Svelte 4 idioms (no runes)        | all `.svelte` files                                                                                       | `rg` for runes      |
| F-07  | 🟡 Medium | In-memory rate limiter doesn't survive Worker isolate boundaries     | [src/hooks.server.ts:16](../src/hooks.server.ts#L16)                                                      | File read           |
| F-08  | 🟢 Low    | `src/pages/methodology.svelte` has no route referencing it           | [src/pages/methodology.svelte](../src/pages/methodology.svelte), [src/routes/](../src/routes/)            | `rg` import scan    |
| F-09  | 🟢 Low    | `pages/`-then-`routes/`-wrapper indirection is unusual for SvelteKit | [src/pages/](../src/pages/) ↔ [src/routes/](../src/routes/)                                              | File read           |
| F-10  | 🟢 Low    | `Cloudflare Access AUD` and team domain stored as `vars` in `wrangler.jsonc` | [wrangler.jsonc:11-12](../wrangler.jsonc#L11)                                                     | File read           |
| F-11  | 🟢 Low    | TypeScript config is one line — relies entirely on SvelteKit-generated tsconfig | [tsconfig.json](../tsconfig.json)                                                              | File read           |
| F-12  | ℹ️ Info   | Single linear-history branch (94 commits, no merges to date except #1) | `git log`                                                                                                | `git log`           |
| F-13  | ℹ️ Info   | `cloc` not installed in the environment used for this audit          | n/a                                                                                                       | `command -v cloc`   |
| F-14  | ℹ️ Info   | No TODO/FIXME/HACK markers anywhere in `src/` or `scripts/`          | repo-wide                                                                                                 | `rg` count          |

---

## Step 2 — Inventory

### Languages and lines (source files only, generated artifacts excluded)

| Extension | Files (tracked) | LOC   |
| --------- | --------------- | ----- |
| `.ts`     | 36              | 3,134 |
| `.svelte` | 15              | 4,208 |
| `.mjs`    | 4               |   764 |
| `.js`     | 5               |   207 |
| `.cjs`    | 2               |    67 |
| `.sql`    | 1               |    61 |
|           |                 |       |
| **Total source** |              | **8,441** |

(`package-lock.json` is 5,139 lines but excluded from source; PNG/SVG/JSON content files excluded.)

### Architectural style

A **monolithic SvelteKit application targeting Cloudflare Workers** with one D1 database. Layering is conventional for the framework:

- **Presentation:** [src/routes/](../src/routes/) (SvelteKit file-based routes), [src/components/svelte/](../src/components/svelte/), [src/layouts/BaseLayout.svelte](../src/layouts/BaseLayout.svelte).
- **Application/Data:** [src/lib/server/](../src/lib/server/) — auth, content store, HTTP error mapping. The `$lib` alias is used consistently from server code.
- **Domain types:** [src/types/](../src/types/) (shared between server and client) and [src/components/svelte/types.ts](../src/components/svelte/types.ts) (UI-only).
- **Persistence:** Cloudflare D1 via the `DB` binding declared in [wrangler.jsonc:34-41](../wrangler.jsonc#L34). Schema is one migration: [migrations/d1/0001_init_content_schema.sql](../migrations/d1/0001_init_content_schema.sql).
- **Static fallback:** Bundled JSON in [src/data/geo/](../src/data/geo/) and [data/content/](../data/content/) is used as a seed and as a load-fallback when the D1 fetch fails ([src/routes/+page.ts](../src/routes/+page.ts)).

The route hierarchy and the API surface together define a clean CRUD-with-history contract. There is no service abstraction layer beyond `store.ts` — write endpoints call the store directly.

### Build, test, lint entry points

From [package.json](../package.json):

| Command | What it actually does |
| ------- | --------------------- |
| `npm run dev` | `vite dev` (SvelteKit dev server). |
| `npm run build` | `svelte-kit sync && vite build` — emits `.svelte-kit/cloudflare/_worker.js` for Wrangler. |
| `npm run deploy` | Build, then `wrangler deploy`. |
| `npm run lint` | `eslint . --max-warnings=0` — currently a no-op (see F-01). |
| `npm run typecheck` (alias `check`) | `svelte-kit sync && svelte-check`. |
| `npm run schema:check` | Diffs migration SQL against local D1 introspection ([scripts/check-d1-schema.mjs](../scripts/check-d1-schema.mjs)). |
| `npm run test:smoke` | Builds, applies migrations, starts `wrangler dev`, hits the API ([scripts/smoke-content-api.mjs](../scripts/smoke-content-api.mjs)). |
| `npm run test:integration` | Same harness with deeper assertions ([scripts/integration-content-api.mjs](../scripts/integration-content-api.mjs)). |
| `npm run ci:gate` | `typecheck → lint → schema:check → smoke`. The CI workflow [.github/workflows/ci-gates.yml](../.github/workflows/ci-gates.yml) runs the same gates per-job. |
| `npm run d1:migrate:local` | Applies pending migrations to the local D1 instance. |
| `npm run build:org-logos` | Pre-generates org logo assets ([scripts/build-org-logos.js](../scripts/build-org-logos.js)). |

### Public API surface (HTTP routes)

Detected from [src/routes/](../src/routes/):

| Method+Path                                | Auth                      | File                                                                                                                          |
| ------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GET /` and `GET /history`                 | none (public read)        | [src/routes/+page.svelte](../src/routes/+page.svelte), [src/routes/history/+page.svelte](../src/routes/history/+page.svelte) |
| `GET /admin`                               | `content:edit` (page load)| [src/routes/admin/+page.server.ts](../src/routes/admin/+page.server.ts)                                                       |
| `GET /api/projects`                        | none                      | [src/routes/api/projects/+server.ts](../src/routes/api/projects/+server.ts)                                                   |
| `POST /api/projects`                       | `content:edit`            | same                                                                                                                          |
| `GET /api/projects/:id`                    | none                      | [src/routes/api/projects/[id]/+server.ts](../src/routes/api/projects/[id]/+server.ts)                                         |
| `PATCH /api/projects/:id`                  | `content:edit`            | same                                                                                                                          |
| `DELETE /api/projects/:id`                 | `content:archive`         | same                                                                                                                          |
| `POST /api/projects/:id/restore`           | `content:edit`            | [src/routes/api/projects/[id]/restore/+server.ts](../src/routes/api/projects/[id]/restore/+server.ts)                         |
| `GET/POST/PATCH/DELETE /api/goals(/...)`   | mirror of projects        | [src/routes/api/goals/](../src/routes/api/goals/)                                                                             |
| `GET /api/history`                         | none                      | [src/routes/api/history/+server.ts](../src/routes/api/history/+server.ts)                                                     |

All write endpoints flow through `requireEditorActor()` ([src/lib/server/auth/editor.ts:203](../src/lib/server/auth/editor.ts#L203)) and the in-memory rate limiter in [src/hooks.server.ts](../src/hooks.server.ts).

### External integrations

- **Cloudflare D1** — primary content store, binding `DB` ([wrangler.jsonc:34](../wrangler.jsonc#L34)).
- **Cloudflare Access** — JWT verification against `<team>.cloudflareaccess.com/cdn-cgi/access/certs` via remote JWKS ([editor.ts:64-69](../src/lib/server/auth/editor.ts#L64)).
- **Cloudflare Access cookies / `cf-access-jwt-assertion` header** — both accepted ([editor.ts:225-227](../src/lib/server/auth/editor.ts#L225)).
- **MapTiler** — base map style, key in `PUBLIC_MAPTILER_KEY`.
- **Custom domains** — `maitai.observer` (apex) and `www.maitai.observer` (redirected to apex by [hooks.server.ts:120-124](../src/hooks.server.ts#L120)). `workers_dev: false` and `preview_urls: false` are explicitly set.
- **GitHub Actions** — `ci-gates.yml` and `backup-snapshots.yml` (the latter is the largest CI file in the repo at 314 lines).

---

## Step 3 — Conventions

### Naming, formatting, imports

- **Filenames:** SvelteKit route files follow framework conventions (`+page.svelte`, `+server.ts`). Server modules use camelCase (`editor.ts`, `store.ts`, `http.ts`). Components are PascalCase Svelte single-file components.
- **Imports:** Server code uses the SvelteKit `$lib/` alias (`$lib/server/auth/editor`, `$lib/server/content/store`). Shared types use `@/types/...`. Some legacy imports use deep relative paths like `../../layouts/BaseLayout.svelte` ([src/pages/index.svelte](../src/pages/index.svelte), [src/routes/+page.svelte](../src/routes/+page.svelte)) — these reflect the Astro origin.
- **Indentation:** TypeScript files use 2-space indentation; `.svelte` files match. `.editorconfig` is present.
- **Formatter:** Prettier is a devDep; no `.prettierrc` is checked in, so defaults apply. ESLint config explicitly extends `prettier` to disable conflicting rules (in `.eslintrc.cjs`, which is no longer authoritative — see F-01).

### Test pyramid (as it actually exists)

There **is no unit-test layer.** Tests are two end-to-end scripts that boot `wrangler dev`, apply migrations, and hit the live HTTP surface:

- [scripts/smoke-content-api.mjs](../scripts/smoke-content-api.mjs) (~150 LOC) — happy-path CRUD + history.
- [scripts/integration-content-api.mjs](../scripts/integration-content-api.mjs) (213 LOC) — deeper assertions.
- Shared harness [scripts/test-utils/cloudflare-test-utils.mjs](../scripts/test-utils/cloudflare-test-utils.mjs) (263 LOC) — wraps `wrangler`, `npm`, and HTTP polling.

This is rigorous against the routing/auth/rate-limit/SQL boundaries but leaves all of [src/lib/server/content/store.ts](../src/lib/server/content/store.ts)'s validation branches and Svelte components untested in isolation. The integration tests are also expensive — the CI workflow gives them a 35-minute timeout. (See F-02.)

### Error handling and logging

- Server errors flow `ContentStoreError` (with HTTP status) → [http.ts:22 `toHttpError`](../src/lib/server/content/http.ts#L22) → SvelteKit `error()`. Each route is `try { ... } catch (err) { toHttpError(err); }`. Consistent and easy to follow.
- Auth failures log structured `console.warn` with `[editor-auth]` prefix and contextual fields ([editor.ts:229](../src/lib/server/auth/editor.ts#L229), [:252](../src/lib/server/auth/editor.ts#L252)). Cloudflare Workers Observability is `enabled: true` in [wrangler.jsonc:8](../wrangler.jsonc#L8).
- A scoped logger exists at [src/utils/logger.ts](../src/utils/logger.ts). Server code does not currently route through it — it uses raw `console.warn`.

### Configuration and secrets

- Secrets and identity-list config are sourced from `$env/dynamic/private` ([editor.ts:1](../src/lib/server/auth/editor.ts#L1), [hooks.server.ts:1](../src/hooks.server.ts#L1)). All env reads use `parsePositiveInt` / CSV parsing helpers — no `process.env` used directly.
- Public Map key is `PUBLIC_MAPTILER_KEY` (consumed client-side; the `PUBLIC_` prefix is correct for SvelteKit).
- Non-secret config lives in [wrangler.jsonc](../wrangler.jsonc) `vars` (team domain, AUD, rate-limit knobs) — these are appropriate to commit (F-10 only nudges to confirm they should not be `secret`s).
- `.env` is correctly gitignored (`.gitignore:28`); only `.env.example` is tracked.

---

## Step 4 — Risk surface

### Top 10 hot files (commits in last 6 months)

| Commits | File                                                                                                                          | LOC   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | ----- |
| 40      | [src/components/svelte/MetroMap.svelte](../src/components/svelte/MetroMap.svelte)                                             |   450 |
| 14      | [src/styles/global.css](../src/styles/global.css)                                                                             |   443 |
| 14      | [package.json](../package.json)                                                                                               |    51 |
| 12      | [src/components/svelte/GoalsTable.svelte](../src/components/svelte/GoalsTable.svelte)                                         |   957 |
| 12      | [README.md](../README.md)                                                                                                     |   248 |
| 10      | [.vscode/settings.json](../.vscode/settings.json)                                                                             | (gitignored — present in older commits) |
|  8      | [src/pages/index.svelte](../src/pages/index.svelte)                                                                           |   139 |
|  7      | `src/pages/index.astro`                                                                                                       | (deleted — Astro→Svelte port) |
|  6      | [src/lib/server/content/store.ts](../src/lib/server/content/store.ts)                                                         | 1,483 |
|  6      | [src/lib/server/auth/editor.ts](../src/lib/server/auth/editor.ts)                                                             |   261 |

### Hot-and-large (refactor candidates)

These files combine high churn with large LOC and have no isolated tests:

- **[src/components/svelte/MetroMap.svelte](../src/components/svelte/MetroMap.svelte)** — 40 commits × 450 LOC. Highest-priority candidate to break apart (e.g., extract layer initialization, event wiring, and county-bounds logic into modules under [src/lib/map/](../src/lib/map/), where partial extracts already exist).
- **[src/lib/server/content/store.ts](../src/lib/server/content/store.ts)** — 1,483 LOC, 6 commits. Consolidates schema validation (Zod), D1 prepare/run, history insertion, seeding, and provenance management. Could plausibly split into `validators.ts`, `mappers.ts` (row ↔ entity), `repository.ts` (D1 SQL), and `service.ts` (business operations).
- **[src/components/svelte/GoalsTable.svelte](../src/components/svelte/GoalsTable.svelte)** — 957 LOC, 12 commits.
- **[src/routes/admin/+page.svelte](../src/routes/admin/+page.svelte)** — 1,293 LOC. Single-file admin console; no churn metric here because it landed late, but its size alone is a flag.

### Modules with no tests (effectively all)

Because there is no unit-test framework, every module is "untested at the unit level." The integration scripts exercise:

- [src/hooks.server.ts](../src/hooks.server.ts) (rate limit headers, 429 path)
- [src/lib/server/auth/editor.ts](../src/lib/server/auth/editor.ts) (token-mode only — Access JWT path is exercised only in production)
- [src/lib/server/content/store.ts](../src/lib/server/content/store.ts) (CRUD, archive, restore, history)
- All `+server.ts` route handlers via HTTP

Notably untested even at integration level: every `.svelte` component, all of `src/lib/map/`, and the static-fallback path in [src/routes/+page.ts](../src/routes/+page.ts).

### Other risks worth a glance

- **`MAX_WARNINGS=0` lint with no rules enabled** ([package.json:11](../package.json#L11)) means the lint gate cannot fail today. Restoring real rules will likely surface a backlog.
- **In-memory rate limiter** ([hooks.server.ts:16](../src/hooks.server.ts#L16)) is per-isolate. On Cloudflare Workers, isolates are per-region/per-cold-start; an attacker hitting different colos sees independent buckets. Documented as "best-effort" in [.env.example:18-21](../.env.example#L18). Consider Durable Objects or KV for truly global limits if the threat model warrants.
- **Single migration since schema inception.** When the next migration lands, `npm run schema:check` will exercise its real value. Worth verifying the script's diff path before that day.

---

## Detailed findings

### F-01 — 🟠 ESLint 9 flat config has empty rules; lint is a CI no-op

- **Where:** [eslint.config.cjs](../eslint.config.cjs), with shadowed legacy [.eslintrc.cjs](../.eslintrc.cjs).
- **Evidence:** `eslint.config.cjs` has `rules: {}` for both `**/*.{js,ts}` and `**/*.svelte` blocks and does not extend any recommended config. ESLint 9 ignores `.eslintrc.cjs` once a flat config is present. `package.json:11` runs `eslint . --max-warnings=0`; with no rules active, no warnings are possible.
- **Why it matters:** The CI gate currently asserts "lint passed" without checking anything. The `prettier`, `@typescript-eslint/recommended`, and `plugin:svelte/recommended` rule sets that the legacy file extends are silently disabled in CI.
- **Fix:** Port the rule sets from `.eslintrc.cjs` into the flat config and delete the legacy file. Concretely, in [eslint.config.cjs](../eslint.config.cjs) import and spread `tseslint.configs.recommended`, `eslintPluginSvelte.configs['flat/recommended']`, and `eslintConfigPrettier`. Then run `npm run lint` locally and triage the backlog before re-enabling `--max-warnings=0`.
- **Reference:** ESLint 9 flat-config migration guide.

### F-02 — 🟠 No automated unit tests

- **Where:** Repo-wide. No Vitest/Jest/Playwright dependencies in [package.json](../package.json).
- **Evidence:** All testing is via the two `scripts/*.mjs` end-to-end harnesses. CI runs them in 30- and 35-minute jobs ([.github/workflows/ci-gates.yml:51,72](../.github/workflows/ci-gates.yml#L51)).
- **Why it matters:** Validation logic in [src/lib/server/content/store.ts](../src/lib/server/content/store.ts) (Zod schemas, archive-field invariants, provenance handling) is non-trivial and changes regularly. Component logic (filters, sort, county selection) is similarly logic-heavy. Unit tests would catch regressions in seconds instead of in a 30-minute boot-and-curl loop.
- **Fix:** Adopt Vitest (smallest install, native to Vite). Start with: (a) `store.ts` schema validation — pure-function test surface; (b) `hooks.server.ts` rate-limit helpers (`consumeWriteLimit`, `parsePositiveInt`); (c) the `parseIncludeArchived`/`parseLimit`/`toHttpError` helpers in `http.ts`. Keep the integration scripts as a separate, lower-frequency gate.
- **Reference:** Vitest + SvelteKit guide.

### F-03 — 🟡 Large modules concentrate complexity

- **Where:** [src/lib/server/content/store.ts](../src/lib/server/content/store.ts) (1,483 LOC), [src/routes/admin/+page.svelte](../src/routes/admin/+page.svelte) (1,293 LOC), [src/components/svelte/GoalsTable.svelte](../src/components/svelte/GoalsTable.svelte) (957 LOC).
- **Evidence:** LOC sort against tracked source.
- **Why it matters:** Any single function over ~500 LOC in a single file becomes a merge-conflict magnet on a multi-contributor repo and is hard to test piecewise.
- **Fix:** Sequence: split `store.ts` first (validators / mappers / repository / service), then the admin page (split editor pane, history pane, dataset switcher). The components can wait until the prior two are stable.

### F-04 — 🟡 `MetroMap.svelte` is the churn hotspot

- **Where:** [src/components/svelte/MetroMap.svelte](../src/components/svelte/MetroMap.svelte).
- **Evidence:** 40 commits in the last 6 months — 2.6× the next-most-changed source file. Companion logic already exists in [src/lib/map/](../src/lib/map/) (8 modules) but the Svelte component still owns much of the lifecycle.
- **Why it matters:** Hot files without tests are where bugs slip in. The infrastructure to extract logic already exists in `src/lib/map/`.
- **Fix:** Move the remaining imperative MapLibre lifecycle (init, layer add, event handlers) into `src/lib/map/` modules and keep the Svelte component as a thin shell that wires DOM → lib. Then add Vitest coverage for the lib functions.

### F-05 — 🟡 Two ESLint configs co-exist

- **Where:** [.eslintrc.cjs](../.eslintrc.cjs) and [eslint.config.cjs](../eslint.config.cjs).
- **Evidence:** Both files are tracked and non-empty. ESLint 9 prefers the flat config and ignores the legacy one when present.
- **Why it matters:** Cleanup cliff for any new contributor — they read `.eslintrc.cjs`, assume those rules apply, and are wrong.
- **Fix:** After F-01 is resolved (porting rules to flat config), delete `.eslintrc.cjs`. Single source of truth.

### F-06 — 🟡 Svelte 5 codebase, Svelte 4 idioms

- **Where:** All `.svelte` files (verified by ripgrep — zero uses of `$state(`, `$derived(`, `$effect(`, `$props(`).
- **Evidence:** [src/routes/admin/+page.svelte:10-27](../src/routes/admin/+page.svelte#L10) uses `let token = ''; let actor = 'admin'; ...` and `$:` reactive declarations — classic Svelte 4. The `package.json` pins `svelte: ^5.49.1`.
- **Why it matters:** Svelte 4 idioms still compile under Svelte 5 in legacy mode, but new Svelte 5 features (runes, fine-grained reactivity, snippets) are unavailable. Mixing the two later is more painful than picking now.
- **Fix:** Either (a) commit to runes for all *new* components and migrate hotspots opportunistically, or (b) explicitly document that this repo stays on Svelte-4-style for now. Pick one and write it down. The decision is more important than which way you decide.

### F-07 — 🟡 In-memory rate limiter is per-isolate

- **Where:** [src/hooks.server.ts:16](../src/hooks.server.ts#L16) (`const writeBuckets = new Map<string, RateLimitBucket>()`).
- **Evidence:** Module-scope `Map` in a Cloudflare Worker. The comment in [.env.example:18](../.env.example#L18) acknowledges "best-effort, in-memory."
- **Why it matters:** Each Worker isolate (often per-colo / per-cold-start) has its own bucket, so the effective global rate is an unknown multiple of `WRITE_RATE_LIMIT_REQUESTS`. Adequate against accidental floods, weak against deliberate distribution.
- **Fix:** If the threat model requires real global limits, move to Durable Objects (one DO per IP key) or to a KV-backed counter. Otherwise, leave a comment on the constant pointing to this finding so the next reader does not over-trust the limit.

### F-08 — 🟢 `methodology.svelte` has no route

- **Where:** [src/pages/methodology.svelte](../src/pages/methodology.svelte) (105 LOC).
- **Evidence:** `rg "from ['\"].*pages/methodology"` returns no hits across the repo. No `+page.svelte` under `src/routes/methodology/`.
- **Why it matters:** Either dead code or unfinished work. Either way, untracked intent.
- **Fix:** If the page is wanted, add `src/routes/methodology/+page.svelte` mirroring the `+page.svelte` ↔ `pages/index.svelte` pattern. If not, delete the file.

### F-09 — 🟢 `pages/`-then-`routes/` indirection is unusual

- **Where:** [src/pages/](../src/pages/) ↔ [src/routes/](../src/routes/).
- **Evidence:** [src/routes/+page.svelte](../src/routes/+page.svelte) is a 7-line wrapper that re-renders [src/pages/index.svelte](../src/pages/index.svelte). `git log --reverse` shows the project began as Astro (`Initialize Astro project with Svelte and Tailwind`) and was ported to SvelteKit; `src/pages/index.astro` was deleted along the way.
- **Why it matters:** Idiomatic SvelteKit puts page content directly in `+page.svelte`. New contributors will look in `routes/` first and not realize the actual content lives one folder over.
- **Fix:** Inline `pages/index.svelte` into `routes/+page.svelte` (and similarly for any other survivors). If migration was paused intentionally, add a one-line comment in [src/routes/+page.svelte](../src/routes/+page.svelte) noting "content lives in `../pages/index.svelte` pending migration."

### F-10 — 🟢 Access AUD and team domain in `vars`

- **Where:** [wrangler.jsonc:11-12](../wrangler.jsonc#L11) and the `staging` env block.
- **Evidence:** `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are set as `vars` (committed) rather than `secrets` (Wrangler-managed).
- **Why it matters:** Both of these are validation parameters, not credentials, so committing them is defensible (and Cloudflare's docs are inconsistent on this). Calling it out so the choice is deliberate.
- **Fix:** Either keep as-is and add a `# safe to commit — not a secret` comment, or move to `wrangler secret put` and out of source. Not actionable until policy is decided.

### F-11 — 🟢 Minimal `tsconfig.json`

- **Where:** [tsconfig.json](../tsconfig.json) (single line: `{ "extends": "./.svelte-kit/tsconfig.json" }`).
- **Evidence:** File read.
- **Why it matters:** All TS configuration is generated by `svelte-kit sync`. If `svelte-check` ever needs a stricter mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), there is no place to add it without editing generated config.
- **Fix:** Add a `compilerOptions` block to override generated values when the team picks strictness levels.

### F-12 — ℹ️ Linear history with one merged PR

- **Where:** repo-wide.
- **Evidence:** `git log --pretty=format:"%h" | wc -l` → 94. Only one merge commit (`50f4b45 Merge pull request #1 from jborgese/backup-snapshots`); everything else is direct-to-main.
- **Why it matters:** Pure observation of contributor model; relevant to anyone establishing review process. Not actionable.

### F-13 — ℹ️ `cloc` not installed

- **Where:** Audit environment.
- **Evidence:** `command -v cloc` returned non-zero.
- **Why it matters:** LOC numbers in this report came from `wc -l` (which counts blank/comment lines too). Numbers should be considered upper bounds on real source lines.
- **Fix:** `winget install AlDanial.Cloc` or `choco install cloc` for future audits.

### F-14 — ℹ️ Zero TODO/FIXME/HACK markers

- **Where:** repo-wide.
- **Evidence:** `rg -c '(TODO|FIXME|HACK|XXX)' src scripts` returned zero hits in both directories.
- **Why it matters:** Either the team is unusually disciplined about cleanup, or signals are being recorded elsewhere (commit messages, issues). Worth noting because the absence of these markers is itself a signal that the team has a different workflow for parking debt — confirm where that is, and any audit that relies on grep for debt density will under-count here.

---

## Recommended next steps

1. **Restore real lint coverage (F-01, F-05).** Port rule sets into [eslint.config.cjs](../eslint.config.cjs), delete `.eslintrc.cjs`, run `npm run lint` to surface the backlog, fix or `// eslint-disable-next-line`-with-justification on a per-line basis. Highest-leverage one-day cleanup.
2. **Add Vitest with a thin starter suite (F-02).** Three test files — `store.validation.test.ts`, `hooks.rate-limit.test.ts`, `http.helpers.test.ts` — and add `npm run test` to `ci:gate`. Buys real-time feedback on the most logic-heavy modules.
3. **Refactor `MetroMap.svelte` toward `src/lib/map/` (F-04).** The extraction pattern already exists; finish moving lifecycle code there and add unit tests for the lib functions in the same PR.
4. **Decide on Svelte 5 idiom (F-06)** and write the decision into [CONTRIBUTING.md](../CONTRIBUTING.md). Either is fine; the indecision is what costs.
5. **Resolve the `pages/`↔`routes/` migration (F-08, F-09).** Either inline the survivors into `routes/`, or add the missing `methodology` route, then remove the indirection. One short PR.

---

## Where would I start reading?

In order, for someone new contributing to this repo:

1. [README.md](../README.md) — the operational and conceptual overview is unusually thorough.
2. [src/hooks.server.ts](../src/hooks.server.ts) — small, self-contained, shows how requests enter the system, rate limit, and host-redirect.
3. [src/lib/server/auth/editor.ts](../src/lib/server/auth/editor.ts) — the auth model (Cloudflare Access JWT + RBAC + token escape-hatch). Read end-to-end before editing any write route.
4. [src/lib/server/content/store.ts](../src/lib/server/content/store.ts) — the canonical D1 layer and Zod schemas. Long, but it is *the* business-logic file.
5. [migrations/d1/0001_init_content_schema.sql](../migrations/d1/0001_init_content_schema.sql) — the data shape. Pair this with `store.ts`.
