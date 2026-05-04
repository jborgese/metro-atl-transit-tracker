# Consolidated Action Plan — metro-atl-transit-tracker

**Generated:** 2026-05-01
**Source reports:**
- [codebase-analysis-2026-05-01.md](codebase-analysis-2026-05-01.md)
- [health-2026-05-01.md](health-2026-05-01.md)
- [security-2026-05-01.md](security-2026-05-01.md)
- [foss-recommendations-2026-05-01.md](foss-recommendations-2026-05-01.md)
- [uiux-audit-2026-05-01.md](uiux-audit-2026-05-01.md)

This is a deduplicated, ordered punch list. Each item names the source finding(s) and the rationale for its position. Phase numbers are sequencing — items inside a phase can be parallelized.

---

## Phase 0 — Install tooling so later phases have a safety net ✅ (executed 2026-05-01, commit 5f79636)

These come first because they make every subsequent phase faster and the regressions easier to catch.

- [x] **Install `@cloudflare/workers-types` as a direct devDependency**
      `npm i -D @cloudflare/workers-types`. Do **not** add it to [tsconfig.json](../tsconfig.json) `compilerOptions.types` — its globals (`Request`/`Response`/`WebSocket`/`EventTarget`) conflict with the DOM lib that SvelteKit needs for Svelte components (verified: 64 typecheck errors when added globally). Server files should import the types directly when wanted, e.g. `import type { D1Database } from '@cloudflare/workers-types'` in [src/lib/server/content/store.ts](../src/lib/server/content/store.ts). The actual swap from inline `D1Database` declarations to imports lands in Phase 5 alongside the `store.ts` split.
      **Source:** FOSS F-03. Already in the lockfile transitively; this just makes the dependency explicit.
- [x] **Install `@types/geojson`**
      `npm i -D @types/geojson`. [src/types/map.ts](../src/types/map.ts) imports `Feature`/`FeatureCollection` from `geojson` but the package is currently resolved transitively via `maplibre-gl`.
      **Source:** Health H-09.
- [x] **Install Vitest + `@cloudflare/vitest-pool-workers`**
      `npm i -D vitest @vitest/coverage-v8 @cloudflare/vitest-pool-workers`. Created [vitest.config.ts](../vitest.config.ts) using the SvelteKit Vite plugin (so `$lib`/`@/types` aliases resolve), `src/**/*.{test,spec}.ts` glob, v8 coverage. The Workers-pool integration config gets added in Phase 5 when integration tests actually need it.
      **Source:** FOSS F-01 (replaces Health H-02 + H-08).
- [x] **Remove unused `@tailwindcss/vite` dep**
      Verified Tailwind 4 is consumed via `@import "tailwindcss/preflight"` in [global.css:1-2](../src/styles/global.css#L1) and the PostCSS-driven [tailwind.config.ts](../tailwind.config.ts).
      **Source:** Health H-10.
- [x] **Add [.github/dependabot.yml](../.github/dependabot.yml)** — weekly Monday updates for `npm` + `github-actions`, with grouped PRs (svelte, eslint, tailwind, vitest, cloudflare clusters).
      Enables Phase 2 + 3 (S-08) to stay current automatically.
- [ ] **(Optional, audit environment) Install `cloc`, `semgrep`, `gitleaks` locally**
      `winget install AlDanial.Cloc returntocorp.semgrep gitleaks.gitleaks`. Future audits (and any CI SAST job) become richer.
      **Source:** Codebase F-13, Security S-13.

---

## Phase 1 — Restore the CI safety net ✅ (executed 2026-05-01, commit 3dea744)

The lint gate is a no-op today and there is no unit-test framework. Fixing both before patching dependencies (Phase 2) means breaking changes get caught.

- [x] **Port real ESLint rules into [eslint.config.cjs](../eslint.config.cjs)**
      Pulls in `@typescript-eslint/eslint-plugin/recommended`, `eslint-plugin-svelte/flat/recommended`, `eslint-config-prettier`, plus core `js.configs.recommended`. Browser/platform globals (`window`, `URL`, `fetch`, `requestAnimationFrame`, etc.) declared explicitly. Stylistic-backlog rules demoted to **warn** (`@typescript-eslint/no-explicit-any`, `svelte/require-each-key`, `svelte/no-navigation-without-resolve`, `svelte/infinite-reactive-loop`, `@typescript-eslint/no-unsafe-function-type`). Final state: **0 errors, 125 warnings**.
      **Source:** Codebase F-01 / Health H-01. Cascades into UI/UX U-14, U-15 (a11y rules silently disabled today).
- [x] **Delete legacy [.eslintrc.cjs](../.eslintrc.cjs)**
      **Source:** Codebase F-05.
- [x] **Set `--max-warnings=130`** in [package.json](../package.json) `lint` script (current count 125, set 5 above for headroom).
      Ratchet target: get the 41 `no-explicit-any` warnings to zero, then drop the ceiling. Tracked as a Phase-2-or-later cleanup PR.
- [x] **Wire a Vitest starter suite** — 40 tests across 3 files, runs in 224 ms:
      - [src/lib/server/content/store.validation.test.ts](../src/lib/server/content/store.validation.test.ts) — `projectCreateSchema`, `projectPatchSchema`, `goalCreateSchema`, `goalPatchSchema`, plus `assertNoForbiddenWriteFields`.
      - [src/hooks.server.test.ts](../src/hooks.server.test.ts) — `consumeWriteLimit`, `parsePositiveInt` (allow/decrement/exhaust/per-IP/`x-forwarded-for` fallback).
      - [src/lib/server/content/http.test.ts](../src/lib/server/content/http.test.ts) — `parseIncludeArchived`, `parseLimit`, `toHttpError`.
      Required minor source changes: added `export` to `projectCreateSchema`, `projectPatchSchema`, `goalCreateSchema`, `goalPatchSchema`, `assertNoForbiddenWriteFields` in [store.ts](../src/lib/server/content/store.ts), and `parsePositiveInt`, `consumeWriteLimit` in [hooks.server.ts](../src/hooks.server.ts).
      **Source:** Codebase F-02 / Health H-02.
- [x] **Add `npm test` (and `npm run test:watch`/`npm run test:coverage`) and put it in `ci:gate`** between `lint` and `schema:check`.
      **Source:** Health H-02.

---

## Phase 2 — Patch the dependency tree ✅ (executed 2026-05-01, commit be9ee1a)

Run *after* Phase 1 because the safety net catches the bumps. Several of these directly close security findings.

- [x] **`npm audit fix`** — vulnerability count went 14 (1L/7M/6H) → 3 (3L/0M/0H). All highs and moderates closed. Closes Svelte SSR XSS (GHSA-qgvg-pr8v-6rr3, GHSA-phwv-c562-gvmh), SvelteKit handle-hook DoS (GHSA-3f6h-2hrp-w5wx), Vite path traversal (GHSA-4w7w-66w2-5vf9, GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583), undici/wrangler chain (multiple). The 3 remaining lows are chained `cookie` → `@sveltejs/kit` → `@sveltejs/adapter-cloudflare`; no non-breaking fix path until upstream kit drops the vulnerable cookie dep — Dependabot (Phase 0) will catch that.
      **Source:** Security S-01 / Health H-03.
- [x] **All non-major bumps via `npm update`** — `@sveltejs/kit` 2.52→2.59, `svelte` 5.53→5.55, `svelte-check`, `wrangler` 4.67→4.87, `maplibre-gl`, `jose`, `zod`, `prettier`, `tailwindcss`, `@tailwindcss/typography`, `eslint-plugin-svelte`, `svelte-eslint-parser`, `@typescript-eslint/*`.
      **Source:** Health H-03.
- [x] **Major bumps applied in sequence** with `ci:gate` verification between each:
      - `eslint` 9.39.4 → 10.3.0 — drop-in, same 125 warnings.
      - `vite` 7.3.2 → 8.0.10 + `@sveltejs/vite-plugin-svelte` 6.2.4 → 7.0.0 — **had to be combined** because the plugin 7.0.0 declares `vite ^8` as a peer. Required `--legacy-peer-deps` for one install transition (the outgoing `vite-plugin-svelte-inspector@5` was pinned to plugin 6); resolved cleanly afterward.
      - `typescript` 5.9.3 → 6.0.3 — surfaced 8 typecheck errors: SvelteKit's `event.params.id` is now correctly typed `string | undefined`. Applied non-null assertion `event.params.id!` at the 7 callsites in [src/routes/api/projects/[id]/+server.ts](../src/routes/api/projects/%5Bid%5D/+server.ts), [src/routes/api/goals/[id]/+server.ts](../src/routes/api/goals/%5Bid%5D/+server.ts), and the two `restore/+server.ts` files. The dynamic route literally cannot match without `id`, so the assertion is correct; the proper guard lives with H-05's CRUD handler extraction in Phase 5.
      Final state: `npm outdated` returns nothing — every direct dep on its latest published version.
      **Source:** Health H-03.

### Phase 2 fix-up — CI regression caught after push (commit be9ee1a)

The local install of Vite 8 + plugin 7 used `--legacy-peer-deps` to clear a transition-time inspector pin, which left `svelte-preprocess@6.0.3` in the tree even though it declares `peerOptional typescript@"^5.0.0"` (we're on TS 6.0.3). `npm ci` is strict about peer deps in CI by default, so all three workflows that run `npm ci` failed: **CI Gates / Quality Checks**, **Workers Builds**, and **Backup Snapshots**. Smoke + Integration were skipped because `quality-checks` is their `needs:` parent.

- [x] **Drop `svelte-preprocess`** in favor of the built-in `vitePreprocess()` from `@sveltejs/vite-plugin-svelte`. The previous [svelte.config.js](../svelte.config.js) called `preprocess()` with no arguments — it produced nothing that the modern Vite plugin doesn't already provide. `svelte-preprocess` is in maintenance mode (last release 6.0.3, June 2024) and won't update to TS 6.
- [x] **Regenerate `package-lock.json`** from a clean state (deleted `node_modules` + `package-lock.json`, ran `npm install` with no flags).
- [x] **Verified `npm ci --dry-run`** — `up to date in 308ms`, no peer-dep errors.

After the first push fixed Workers Builds + Backup Snapshots, **Quality Checks still failed at the Lint step** with `Cannot find module '@eslint/js'`. The flat config's `require('@eslint/js')` resolved locally because the package was present in the developer's user-level `node_modules` (likely from a prior global ESLint install) and Node falls back to parent-directory `node_modules` during resolution. CI's clean checkout has no such fallback. Fix:

- [x] **Add `@eslint/js` as a direct devDependency** so [eslint.config.cjs](../eslint.config.cjs) finds it through the project's local `node_modules`.
- [x] **Demote `no-useless-assignment` to `warn`** in [eslint.config.cjs](../eslint.config.cjs) — the local `@eslint/js@10.0.1` introduced 8 new errors from this rule, all false positives on Svelte's `let x = []; $: x = computeFromState();` reactive-declaration pattern that ESLint's static analyzer can't see through. Will become legible after the Svelte 5 runes migration (Codebase F-06, Phase 5).
- [x] **Bump `--max-warnings=130` → `140`** in [package.json](../package.json) to absorb the 8 new `no-useless-assignment` warnings.

---

## Phase 3 — Security hardening ✅ (executed 2026-05-01)

These are the application-code fixes for the OWASP findings. Phase 1's tests caught regressions during the migration.

- [x] **S-02 (🟠) — Gate the `EDITOR_API_TOKEN` fallback path by environment.**
      [editor.ts](../src/lib/server/auth/editor.ts) now wraps the token-mode block with `isTestEnvironment(event)` (hostname ∈ `{localhost, 127.0.0.1, 0.0.0.0, ::1}`). On a deployed hostname, even with the env vars set, the code falls through to the Access JWT path and emits a structured warn log naming the rejected hostname.
- [x] **S-05 (🟡) — Use constant-time compare for the editor token.**
      Replaced `presentedToken !== editorToken` with `safeEqualString()` backed by `node:crypto.timingSafeEqual` (`nodejs_compat` enabled in [wrangler.jsonc:5](../wrangler.jsonc#L5)).
- [x] **S-03 (🟠) — Add an explicit CSRF Origin check** in [hooks.server.ts](../src/hooks.server.ts) for write methods on `/api/`. `isCrossOriginWrite()` rejects with 403 when the `Origin` header is present and its host differs from `event.url.host`. Bypassed (intentionally) when no Origin is sent (curl / wrangler / smoke tests) — auth still gates writes at the route level.
- [x] **S-11 (🟢) — Body-size limit before `JSON.parse`.**
      New `readJsonBody(event, maxBytes = 64 * 1024)` helper in [http.ts](../src/lib/server/content/http.ts) checks both declared `content-length` and actual byte length. Wired into all four write handlers (POST/PATCH × projects/goals). 6 unit tests added.
- [x] **S-10 (🟢) — Redacted env var names from 503 message.**
      Now `Authentication is not configured.` (instead of naming `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`).
- [x] **S-07 (🟡) — Security headers** added in [hooks.server.ts](../src/hooks.server.ts) `applySecurityHeaders()`, applied to every response: `Strict-Transport-Security` (2 years, includeSubDomains, preload), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (geolocation/camera/microphone all denied), and a `Content-Security-Policy-Report-Only` covering MapTiler, Google Fonts, and Cloudflare Access. Report-only first; team can flip to enforcing once telemetry confirms nothing breaks.
- [x] **S-08 (🟡) — Pinned GitHub Actions to commit SHAs** in [ci-gates.yml](../.github/workflows/ci-gates.yml) and [backup-snapshots.yml](../.github/workflows/backup-snapshots.yml). All `actions/checkout@v6`, `actions/setup-node@v6`, `actions/upload-artifact@v7` references now use `@<sha> # v<major>` format. Dependabot config from Phase 0 will keep them current.
- [x] **F-02 FOSS / S-06 / Codebase F-07 (🟠 combined) — Replaced the per-isolate rate limiter with Cloudflare's native `RateLimit` binding.**
      Added `unsafe.bindings` blocks to [wrangler.jsonc](../wrangler.jsonc) (prod namespace 1001, staging 1002, both `simple: { limit: 30, period: 60 }`). [hooks.server.ts](../src/hooks.server.ts) now calls `event.platform.env.WRITE_LIMITER.limit({ key })` via a `checkWriteRateLimit()` helper that fails open when the binding is absent (e.g., local dev without `unsafe.bindings`). Removed the in-memory `Map`, `maybeSweepBuckets`, `consumeWriteLimit`, and `parsePositiveInt`. Removed `WRITE_RATE_LIMIT_REQUESTS` / `WRITE_RATE_LIMIT_WINDOW_SECONDS` from `vars` (limits live on the binding). Updated [.env.example](../.env.example). 9 new unit tests for `checkWriteRateLimit` + `getClientKey`.
- [ ] **S-04 (🟡) — Add a Cloudflare alert policy** for `[editor-auth] 401` rate exceeding a threshold from one IP. Configured via the Cloudflare dashboard / API — out of scope for code commits. Do this after S-02 ships so the alert isn't noisy with token-mode 401s.

**Verification:** `npm run typecheck` 0 errors, `npm test` **48 / 48 pass** (was 40), `npm run lint` 0 errors / 133 warnings, `npm ci --dry-run` clean.

---

## Phase 4 — UI/UX accessibility ✅ (executed 2026-05-01)

- [x] **U-01 (🟠) — Status-badge contrast.**
      New `getStatusTextColor()` in [statusHelpers.ts](../src/utils/statusHelpers.ts) returns `#1F1F1F` for the four high-luminance backgrounds (`planning`, `public-outreach`, `implementation`, `completed`) and keeps `#fff` for the dark ones (`funding-application`, `ongoing`). Threaded through all four callsites in [GoalsTable.svelte](../src/components/svelte/GoalsTable.svelte), [ProjectDetailModal.svelte](../src/components/svelte/ProjectDetailModal.svelte), and the legend in [MethodologyModal.svelte](../src/components/svelte/MethodologyModal.svelte).
- [x] **U-02 + U-03 (🟠) — Image attributes and weight.**
      Compressed via `sharp`: `mai-tai-logo.png` 238 KB → **39 KB** (palette PNG); generated `mai-tai-logo.webp` (25 KB) and `mai-tai-logo.avif` (17 KB) siblings; `mai-tai-logo-transparent.png` 236 KB → 83 KB; `static/logos/abettercobb.png` 511 KB → **21 KB**. [BaseLayout.svelte](../src/layouts/BaseLayout.svelte) now serves `<picture>` with AVIF + WebP + PNG fallback, plus `width="712" height="712" loading="eager" fetchpriority="high" decoding="async"`. [MetroCountyPanel.svelte](../src/components/svelte/MetroCountyPanel.svelte) panel logos got `width="160" height="64" loading="lazy" decoding="async"` (3 callsites).
- [x] **U-04 (🟠) — Modal focus management** in [MethodologyModal.svelte](../src/components/svelte/MethodologyModal.svelte). Captures `lastFocused` on open, focuses the close button on mount, traps Tab forward + Shift+Tab back across the focusable subtree, restores focus on close. Escape and click-outside still close.
- [x] **U-10 (🟡) — Replaced render-blocking `@import`** of Google Fonts in [global.css](../src/styles/global.css) with `<link rel="preconnect">` (×2) + `<link rel="stylesheet">` in [src/app.html](../src/app.html). Self-host follow-up tracked in Phase 6.
- [x] **U-05 (🟡) — `prefers-reduced-motion` block** added at the end of [global.css](../src/styles/global.css). Zeroes transitions/animations and disables `scroll-behavior: smooth`.
- [x] **U-08 (🟡) — County-panel close button** at [MetroMap.svelte:401](../src/components/svelte/MetroMap.svelte#L401) now has `w-8 h-8 flex items-center justify-center text-xl leading-none` (32 × 32 CSS px, WCAG 2.5.8 PASS).
- [x] **U-07 (🟡) — Admin tablist** in [admin/+page.svelte:486-503](../src/routes/admin/+page.svelte#L486) now wires `id="tab-project"` / `id="tab-goal"` and `aria-controls="content-list-panel"` on each tab; the search + list region beneath is wrapped in `<div id="content-list-panel" role="tabpanel" aria-labelledby={dataset === 'project' ? 'tab-project' : 'tab-goal'}>`.
- [x] **U-06 (🟡) — Dropped `role="application"`** on the map. The wrapper `<div class="map-container">` no longer carries `role`/`tabindex`/`on:keydown`/`aria-describedby`. The custom Enter-to-select-center keystroke is now a visible `<button>Select county at map center</button>` overlaid in the top-right of the map. The two `svelte-ignore a11y-*` directives at [MetroMap.svelte:379-380](../src/components/svelte/MetroMap.svelte#L379) (cross-ref UI/UX U-14) are also gone.
- [x] **U-09 (🟢) — `autocomplete="current-password"`** on the admin token field at [admin/+page.svelte](../src/routes/admin/+page.svelte).
- [x] **U-12 (🟢) — Surfaced the D1 fallback signal.**
      [src/routes/+page.ts](../src/routes/+page.ts) now returns `{ projects, goals, usingFallback }`; [pages/index.svelte](../src/pages/index.svelte) renders a `role="status"` banner above the map when the live API failed. Banner styling added to [global.css](../src/styles/global.css) using existing tokens.

**Verification:** `npm run typecheck` 0 errors, `npm test` 48 / 48 pass, `npm run lint` 0 errors / 135 warnings (`--max-warnings=140`).

---

## Phase 5 — Refactor for maintainability

Lands after Phase 1's tests are in place so the structural change is safe.

- [x] **Health H-04 / Codebase F-03 / FOSS F-04 (🟠) — Split [src/lib/server/content/store.ts](../src/lib/server/content/store.ts) into focused modules** ✅ (executed 2026-05-01).
      Final layout in [src/lib/server/content/](../src/lib/server/content/) — 6 files (4 from the action plan + `errors.ts` for cycle elimination + `seeding.ts` for lifecycle separation):
      - [errors.ts](../src/lib/server/content/errors.ts) (9 LOC) — `ContentStoreError` only, zero deps.
      - [validators.ts](../src/lib/server/content/validators.ts) (207 LOC) — All Zod schemas, `parseSchema`, `to*Create`/`to*Patch`/`to*Seed`, `assertNoForbiddenWriteFields`, `selectProjectSeeds`/`selectGoalSeeds`, `isMissingTableError`/`isUniqueConstraintError`, `parseIntSafe`, `asSeedArray`, `SEED_ACTOR`/`FORBIDDEN_MUTATION_FIELDS`/`ID_PATTERN`.
      - [mappers.ts](../src/lib/server/content/mappers.ts) (300 LOC) — `nowIso`, `isRecord`, `cloneRecord`, `parseJsonObject`, `ensureProvenance`, `applyArchiveFields`, `normalizeEntityForStorage`, `rowToProject`/`rowToGoal`/`rowToHistoryEvent`, `toHistoryJson`, `buildHistoryEvent`, `toSeedHistoryEvent`, `extractRunChanges`. Owns the storage row types `StoredEntityRow`/`StoredHistoryRow`/`StoredCountsRow`/`StoredEntityWrite` and `StoreEvent`.
      - [repository.ts](../src/lib/server/content/repository.ts) (126 LOC) — All SQL constants (`SELECT_ENTITY_COLUMNS`, `INSERT_*_SQL`, `UPDATE_*_SQL`), `DB_BINDING_NAME`, `D1_LOCAL_MIGRATION_CMD`, `SEED_BATCH_SIZE`, `getDb`, `executeInBatches`, `findProjectRow`, `findGoalRow`. Wires `import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'` (closes the Phase 0 deferred follow-up — inline aliases gone).
      - [seeding.ts](../src/lib/server/content/seeding.ts) (209 LOC) — `seedPromise` singleton, `ensureSeeded(db)` orchestrator, plus the three split seeders `seedProjectsIfEmpty(db, count)` / `seedGoalsIfEmpty(db, count)` / `seedHistoryIfEmpty(db, count)` extracted from the CC-27 IIFE. Each returns `D1PreparedStatement[]`; orchestrator concatenates and calls `executeInBatches` once. Seed JSON imports moved here.
      - [service.ts](../src/lib/server/content/service.ts) (710 LOC) — All 13 public CRUD operations + `listHistory`. Each calls `ensureSeeded(db)` from `seeding.ts` at the top.
      - [store.ts](../src/lib/server/content/store.ts) (36 LOC) — Pure barrel. Explicit named re-exports of the 18-name public surface (1 error class, 4 schemas, `assertNoForbiddenWriteFields`, 13 CRUD functions). All 9 external callers unchanged.
      DAG (one-way, no cycles): `errors → validators → mappers → repository → seeding → service → store (barrel)`.
- [x] **Health H-06 (partial — store.ts side) — Reduced cyclomatic complexity** of two functions in the same PR.
      - ✅ `seedPromise` IIFE (was CC 27) → split into `seedProjectsIfEmpty` / `seedGoalsIfEmpty` / `seedHistoryIfEmpty` in [seeding.ts](../src/lib/server/content/seeding.ts), each ~5-10 LOC and easily testable. The orchestrator `ensureSeeded` is now ~20 LOC vs. the original 150-LOC IIFE.
      - ✅ `toSeedHistoryEvent` (was CC 20) → moved to [mappers.ts](../src/lib/server/content/mappers.ts) where it sits next to `buildHistoryEvent`. Body unchanged for now; the natural follow-up (extract `parseEntityType`/`parseAction`/`parseTimestamp` guard helpers) is light work for a follow-up PR.
      - ⏭️ `requireEditorActor` (CC 22) at [editor.ts:203](../src/lib/server/auth/editor.ts#L203) — separate file, separate PR.
      Verification: `npm run typecheck` 520 files / 0 errors, `npm test` **48 / 48 pass** unchanged, `npm run lint` 0 errors / 134 warnings (was 135 — the schema imports through the barrel cleared one redundant warning).
- [x] **Health H-05 / FOSS F-05 — Extract `makeCollectionHandlers<T>(store)` + `makeItemHandlers<T>(store)`** ✅ (executed 2026-05-04).
      New [src/lib/server/content/handlers.ts](../src/lib/server/content/handlers.ts) (~110 LOC) defines a `ContentStore<T>` interface (6 methods) and three factories: `makeCollectionHandlers<T>(store)` returns `{ GET, POST }`, `makeItemHandlers<T>(store)` returns `{ GET, PATCH, DELETE }`, `makeRestoreHandler<T>(store)` returns `{ POST }`. New [src/lib/server/content/stores.ts](../src/lib/server/content/stores.ts) wires the 12 service functions into `projectStore` and `goalStore` so route files import a single symbol per entity. The S-11 body-size limit is absorbed by the factory's `readJsonBody(event)` call (default 64 KB cap from [http.ts](../src/lib/server/content/http.ts)). The Phase 2 `event.params.id!` non-null assertions are replaced with an explicit `requireId()` guard that throws `ContentStoreError(400, 'missing id')`.
      The six entity route files (projects + goals × collection/item/restore) are now 3-line thin wrappers — e.g. `export const { GET, POST } = makeCollectionHandlers(projectStore)`. Net change: route files dropped from ~194 LOC to ~24 LOC; new factory + stores ~135 LOC; **net −60 LOC** with 0% project↔goal handler duplication remaining. The history endpoint at [src/routes/api/history/+server.ts](../src/routes/api/history/+server.ts) is intentionally untouched (unique pattern, no duplication).
      New [src/lib/server/content/handlers.test.ts](../src/lib/server/content/handlers.test.ts) — 12 vitest cases covering: collection GET/POST shape and `includeArchived` defaulting, S-11 enforcement (70 KB body → 413), item GET archived-by-default behavior, missing-id 400 guard, permission strings (`content:edit` for create/update, `content:archive` for archive/restore), and `ContentStoreError` → SvelteKit `error()` conversion. Auth is mocked at the `$lib/server/auth/editor` boundary via `vi.mock` + `vi.hoisted`.
      Verification: `npm run typecheck` 523 files / 0 errors, `npm test` **60 / 60 pass** (was 48), `npm run lint` 0 errors / 134 warnings (unchanged from H-04).
- [x] **Health H-11 — Extract `clearHover()` and `setHover(id)`** in [src/lib/map/addMetroCountyLayers.ts](../src/lib/map/addMetroCountyLayers.ts) ✅ (executed 2026-05-04). Implemented as nested closures inside `addMetroCountyLayers` that close over `hoveredFeatureId` and the fixed `"ga-counties"` source — keeps callsites tiny and avoids exporting helpers nothing else uses. All 5 self-clones (3 inside `onMove`/`onLeave`, 2 inside `keyboardActivate`) collapsed: `onLeave`'s body is now `clearHover(); map.getCanvas().style.cursor = "";`. Surfaced one latent bug in the process — `keyboardActivate` previously called `setFeatureState` with a possibly-undefined `f.id` (the `Feature` typing exposes this once the call goes through the typed helper); guarded with `if (f.id === undefined) return;`. Verification: `npm run typecheck` 523 files / 0 errors, `npm test` **60 / 60 pass**, `npm run lint` 0 errors / 134 warnings (unchanged).
- [x] **Codebase F-06 — Pick a Svelte 5 idiom** ✅ (executed 2026-05-04). Decision: **runes-forward, full migration**. Documented in a new "Svelte 5 idiom: runes only" section in [CONTRIBUTING.md](../CONTRIBUTING.md) covering the Svelte 4 → Svelte 5 mapping (`export let` → `$props()`, `$:` → `$derived`/`$effect`, `on:event` → `onevent`, `<slot />` → `{@render children?.()}`, `createEventDispatcher` → callback props), what stays unchanged (`bind:this`, `bind:value`, `onMount`, `tick`, `<svelte:head>`/`<svelte:window>`), and the rule that computed values use `$derived` (not `$effect`). Lint ratchet deferred to a follow-up PR per the bullet's wording.
      All **15** `.svelte` files in [src/](../src/) migrated in a single coordinated change:
      - **Trivial leaves:** [DebugBadge](../src/components/svelte/DebugBadge.svelte), [Portal](../src/components/svelte/Portal.svelte) (`<slot />` → `Snippet`), [MetroCountyPanel](../src/components/svelte/MetroCountyPanel.svelte), [methodology](../src/pages/methodology.svelte), [routes/+page](../src/routes/+page.svelte), [history/+page](../src/routes/history/+page.svelte).
      - **`bind:open` pair:** [MethodologyModal](../src/components/svelte/MethodologyModal.svelte) (`open` is now `$bindable(false)`) + [BaseLayout](../src/layouts/BaseLayout.svelte). Also flipped the deprecated `<script context="module">` to `<script module>` in BaseLayout.
      - **Deleted dead components:** `ProjectsTable.svelte` and `ProjectFilters.svelte` had zero importers in [src/](../src/) — leftovers from an earlier UI iteration. Removed in the F-06 follow-up (2026-05-04) along with the dead state in MetroMap.svelte (`countyMetadata` write-only `$state`, `_relatedProjectsFiltered` underscore-prefixed unused derived, `selectedModes` always-empty array that only fed the unused derived).
      - **Dispatcher chain:** [ProjectDetailModal](../src/components/svelte/ProjectDetailModal.svelte), [GoalsTable](../src/components/svelte/GoalsTable.svelte), [MetroMap](../src/components/svelte/MetroMap.svelte) + their consumer [pages/index](../src/pages/index.svelte). Five `createEventDispatcher` instances replaced with callback props (`onclose`, `onclearCounty`, `onselectProject`, `oncountySelected`, etc.). MetroMap's imperative `clearSelection()` API kept as `export function`, still accessed via `bind:this={mapRef}` from [pages/index.svelte](../src/pages/index.svelte).
      - **Hotspot:** [admin/+page](../src/routes/admin/+page.svelte) — 24 mutable `let` declarations + `$:` reactive blocks rewritten as `$state` and `$derived`, 12 `on:click` and 1 `on:input` directive rewritten as event attributes. Phase 4 a11y wiring (U-07 tabpanel ids `tab-project`/`tab-goal` + `aria-controls="content-list-panel"`) preserved.
      - **`bind:this` reactivity:** all DOM/component refs that get re-read by `$effect` (`closeButton`, `modalContent` in modals; `mapRef` in pages/index; `panelEl`, `closeBtn` in MetroMap) declared with `$state(...)` to silence Svelte 5's `non_reactive_update` warning.
      Verification: `npm run typecheck` 523 files / **0 errors, 0 warnings**; `npm test` **60 / 60 pass** (unchanged); `npm run lint` 0 errors / **114 warnings** (down from 135 — 21 cleared, well under the `--max-warnings=140` ceiling); `npm run schema:check` passes; `npm run build` 204 SSR + 194 client modules compile cleanly. Dev-server SSR smoke confirmed `/`, `/history`, `/api/projects`, `/api/goals` return 200; `/admin` returns 503 without auth (pre-existing Phase 3 S-10 behavior, identical to pre-migration) and 200 with `EDITOR_TOKEN_AUTH_ENABLED=true` + `x-editor-token` header (UI markers `Admin Portal`, `tab-project`, `tab-goal`, `content-list-panel` all present in SSR output). Repo-wide grep for `export let `, `createEventDispatcher`, `<slot`, `on:[event]=`, `^\s+\$:`, `context="module"` returns zero hits across `src/**/*.svelte`.

      **Dead-code follow-up (2026-05-04):** `npm run typecheck` 521 files / 0 errors, `npm test` 60 / 60, `npm run lint` 0 errors / 108 warnings.
      Stale comment to clean up in a follow-up: [eslint.config.cjs:113-116](../eslint.config.cjs#L113) and [eslint.config.cjs:148-149](../eslint.config.cjs#L148) demote `no-useless-assignment` to warn "until the Svelte 5 runes migration makes the reactivity legible to ESLint" — that migration has now landed, so the demotion can be re-evaluated when the lint ratchet is done.
- [x] **Codebase F-08 + F-09 — Resolve `pages/`↔`routes/` indirection** ✅ (executed 2026-05-04).
      Inlined the body of `src/pages/index.svelte` directly into [src/routes/+page.svelte](../src/routes/+page.svelte) (relative import paths unchanged — both files sit at `src/<dir>/` depth, so `../layouts/`, `../components/svelte/`, and `@/types/content` all resolve identically). The data prop now uses `PageData` from `./$types` instead of an inline structural type. Deleted `src/pages/index.svelte`, the orphaned `src/pages/methodology.svelte`, and the now-empty `src/pages/` directory — `MethodologyModal` already renders the same content (in fact a richer version with the status-color table) via the header button in [BaseLayout.svelte:56](../src/layouts/BaseLayout.svelte#L56), and nothing in the repo linked to `/methodology`, so adding a route would just have created an unreachable page.
      Verification: `npm run typecheck` **519 files / 0 errors, 0 warnings** (was 523 — the 4-file drop accounts for the 2 deleted `.svelte` sources plus their generated `.d.ts` shims), `npm test` **60 / 60 pass** (unchanged), `npm run lint` 0 errors / **108 warnings** (down from 114, well under the `--max-warnings=140` ceiling). `npm run build` was blocked locally by stale `wrangler dev` / `workerd` processes holding `.svelte-kit/cloudflare` open — a pre-existing Windows file lock unrelated to this change; CI's clean checkout exercises the build.

---

## Phase 6 — Optional / longer term

Run when capacity allows. Not on the critical path.

- [ ] **FOSS F-06 (🟢) — `@asteasolutions/zod-to-openapi`** generates an OpenAPI spec from the existing Zod schemas. ~30 LOC + a new `+server.ts` for `/api/openapi.json`.
- [ ] **Codebase F-11 — Add a real `compilerOptions` block** to [tsconfig.json](../tsconfig.json) (e.g., `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) once the team picks a strictness level.
- [x] **UI/UX U-11 — Documented the design tokens** in new [docs/design-tokens.md](../docs/design-tokens.md) (executed 2026-05-04). Catalog covers all 22 `:root` tokens from [global.css:10-48](../src/styles/global.css#L10) grouped as brand / neutrals / surfaces / borders+shadows / typography / layout, with a "use when" note per token. Cross-references the status badge colors in [src/utils/statusHelpers.ts](../src/utils/statusHelpers.ts) (which are JS constants, not CSS tokens) plus the WCAG 1.4.3 rationale for the dark-text inversions on the four light fills. Linked from [CONTRIBUTING.md](../CONTRIBUTING.md) (new "Styling" subsection) and the README "Policies/runbooks" list.
- [ ] **UI/UX U-13 — Decide on `prefers-color-scheme: light`.** Site is dark-only by design; either commit explicitly or add a light-mode token override.
- [ ] **Codebase F-10 — Decide policy on Cloudflare Access AUD/team-domain in [wrangler.jsonc](../wrangler.jsonc).** Already safe to commit (validation parameters, not credentials); this is a documentation/clarity decision, not a security one.
- [ ] **Security S-09 — Per-tester token actor logging.** Only relevant if S-02's environment gate isn't fixed; if S-02 ships, this becomes moot.

---

## Items intentionally skipped

These were findings in the source reports but do not get an action item, by design:

| Item | Why skipped |
| --- | --- |
| Codebase F-12, F-13, F-14; Health H-13 | Info-only observations (linear history, `cloc` not installed, zero TODO markers). |
| Health H-07 | **Invalidated.** ts-prune flagged [src/lib/map/](../src/lib/map/) exports as dead, but it doesn't traverse `.svelte` imports — the audit caught at [MetroMap.svelte:6-23](../src/components/svelte/MetroMap.svelte#L6) that those modules *are* imported. The original H-07 finding is wrong. |
| Security S-12, S-14, S-15, S-16 | Info-only positives (no SSRF surface, all SQL parameterized, etc.). |
| UI/UX U-14, U-15 | Surface automatically as lint warnings once Phase 1's ESLint is restored. |
| FOSS F-04 — Drizzle ORM for D1 | **Considered, not adopted (2026-05-04).** Quality-of-life refactor, not on the critical path. The post-Phase-5 raw-SQL store is verbose but correct; H-04 split + H-05 handler factories already removed the worst duplication. Two parts of the original recommendation also do not apply: `drizzle-kit generate` cannot replace [0001_init_content_schema.sql](../migrations/d1/0001_init_content_schema.sql) (already deployed under wrangler's `d1_migrations` tracker; the `json_valid` CHECK constraints + `RAISE(ABORT)` immutability triggers don't roundtrip cleanly), and `drizzle-zod` does not replace the existing Zod schemas (they validate the JSON payload shape stored in `payload_json`, not the SQL row shape — different layers, no duplication to remove). Revisit if a stream of schema evolution lands; the right shape would be wrangler-managed migrations as source of truth + a Drizzle schema as a type-only mirror, strangler-fig per operation. |

---

## Suggested follow-ups

After Phase 5 lands, schedule a `/loop`-driven recurring review:
- Quarterly: `/check-health` + `/security-scan` to catch new advisories and complexity growth.
- After any major dep bump: `/audit-uiux` to catch CWV regressions.
- Annually: `/recommend-foss` to revisit ecosystem fit.
