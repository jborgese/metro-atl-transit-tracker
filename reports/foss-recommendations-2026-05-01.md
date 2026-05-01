# FOSS Recommendations — metro-atl-transit-tracker

**Repo:** metro-atl-transit-tracker
**Generated:** 2026-05-01
**Scope:** Hand-rolled or thin-glue capabilities across [src/](../src/), [scripts/](../scripts/), and CI workflows.

---

## Executive summary

The codebase is already well-served by mature FOSS at every architectural layer that "matters most" — SvelteKit (HTTP, SSR), Svelte (UI), Tailwind 4 (styling), MapLibre GL (mapping), Zod (validation), `jose` (JWT). Persistence is raw SQL on Cloudflare D1, deliberately so. The places where FOSS could meaningfully replace bespoke code are concentrated in three categories:

1. **Test infrastructure** — the largest single opportunity. The 597 lines under [scripts/](../scripts/) implementing a wrangler-dev-based HTTP harness can be replaced by `@cloudflare/vitest-pool-workers`, the **official** Cloudflare-supported runner that boots Workers/D1 in isolates per test rather than per CI job. This addresses [reports/health-2026-05-01.md H-02](health-2026-05-01.md#h-02--%F0%9F%9F%A0-no-automated-unit-tests-coverage-cannot-be-measured) and [H-08](health-2026-05-01.md#h-08--%F0%9F%9F%A1-integration-scripts-gate-the-pipeline-at-30-min) in one swap.
2. **Type safety against D1** — the inline `D1Database` / `D1PreparedStatement` interfaces in [src/lib/server/content/store.ts:21-35](../src/lib/server/content/store.ts#L21) duplicate types that already exist in `@cloudflare/workers-types` (currently in the lockfile transitively). Switching imports is a one-line fix that also unlocks the official `D1Result` / `D1ExecResult` shapes.
3. **Rate limiting** — the per-isolate `Map<string, Bucket>` in [src/hooks.server.ts:16](../src/hooks.server.ts#L16) is documented as best-effort but is the only thing standing between a misconfigured `EDITOR_API_TOKEN` (see [reports/security-2026-05-01.md S-02](security-2026-05-01.md#s-02--%F0%9F%9F%A0-editor_api_token-fallback-path-is-reachable-in-production-a07)) and a brute-force loop. Cloudflare's own first-party `RateLimit` binding (Workers Rate Limiting API, GA Nov 2024) replaces it natively, no extra deps.

Beyond these, two medium opportunities — **Drizzle ORM** for the D1 layer and **`sveltekit-rate-limiter`** as a lighter alternative to the Cloudflare binding — and three low-priority polish swaps. Two opportunities I considered and rejected: `pino` (the existing 43-line scoped logger is fine), `date-fns` / `dayjs` (the dateFormat helpers use native `Intl.DateTimeFormat`, which is the right choice).

**Top-5 prioritized adoption queue:**

| # | Opportunity                                                | Severity   | Effort | Replaces                                                                       |
| - | ---------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------ |
| 1 | `@cloudflare/vitest-pool-workers` + `vitest`               | 🟠 High    | M      | [scripts/test-utils/](../scripts/test-utils/), smoke + integration harness     |
| 2 | Cloudflare native `RateLimit` binding (or `@upstash/ratelimit`) | 🟠 High | S      | hand-rolled rate limiter in [hooks.server.ts](../src/hooks.server.ts)         |
| 3 | `@cloudflare/workers-types` (declare directly)             | 🟡 Medium  | S      | inline `D1Database` types in [store.ts](../src/lib/server/content/store.ts)    |
| 4 | Drizzle ORM (D1 driver)                                    | 🟡 Medium  | L      | most of the SQL in [store.ts](../src/lib/server/content/store.ts) (1,483 LOC)  |
| 5 | `@asteasolutions/zod-to-openapi` (auto-generate API docs)  | 🟢 Low     | S      | the manual Zod schemas would also become an OpenAPI spec for free              |

---

## Step 1 — What this repo *does* (capability inventory)

| Capability                  | Today's implementation                                                                                                                            | Disposition           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| HTTP routing & SSR          | SvelteKit 2 + `@sveltejs/adapter-cloudflare`                                                                                                      | Framework — keep      |
| UI                          | Svelte 5 (in legacy idioms — see `/analyze-codebase` F-06)                                                                                        | Framework — keep      |
| Styling                     | Tailwind 4 + `@tailwindcss/typography`                                                                                                            | Framework — keep      |
| Mapping                     | MapLibre GL 5                                                                                                                                     | Library — keep        |
| Validation                  | Zod 4 (schemas in [store.ts:161-227](../src/lib/server/content/store.ts#L161))                                                                    | Library — keep        |
| Auth (JWT verification)     | `jose` 6 + Cloudflare Access JWKS                                                                                                                 | Library — keep        |
| Persistence                 | Cloudflare D1 (SQLite) — raw SQL with prepared statements                                                                                         | **Hand-rolled**       |
| Migrations                  | `wrangler d1 migrations apply` + 1 `.sql` file                                                                                                    | Tooling — keep        |
| Schema check (drift)        | [scripts/check-d1-schema.mjs](../scripts/check-d1-schema.mjs) (167 LOC, parses `wrangler d1 execute` JSON)                                        | **Hand-rolled glue**  |
| Tests (smoke + integration) | [scripts/test-utils/cloudflare-test-utils.mjs](../scripts/test-utils/cloudflare-test-utils.mjs) (263 LOC) + smoke (121) + integration (213)       | **Hand-rolled**       |
| Rate limiting               | In-memory `Map` per isolate ([hooks.server.ts](../src/hooks.server.ts))                                                                           | **Hand-rolled**       |
| Logging (client)            | [src/utils/logger.ts](../src/utils/logger.ts) (43 LOC, scoped logger)                                                                             | Hand-rolled (small)   |
| Logging (server)            | Raw `console.warn` with structured-object args ([editor.ts:229](../src/lib/server/auth/editor.ts#L229), [:252](../src/lib/server/auth/editor.ts#L252)) | Hand-rolled (small) |
| Date formatting             | [src/utils/dateFormat.ts](../src/utils/dateFormat.ts) (40 LOC, native `Intl.DateTimeFormat` + relative-time helper)                               | Hand-rolled (small)   |
| Org-logo build              | [scripts/build-org-logos.js](../scripts/build-org-logos.js) (uses `sharp` + `png-to-ico`)                                                         | Glue — keep           |
| Backup workflow             | [.github/workflows/backup-snapshots.yml](../.github/workflows/backup-snapshots.yml) (314 LOC)                                                     | Hand-rolled (workflow)|
| Provenance / audit history  | Append-only `content_history` D1 table + SQL triggers (see [migrations/d1/0001_init_content_schema.sql:51-61](../migrations/d1/0001_init_content_schema.sql#L51)) | **Hand-rolled** (good) |
| CRUD route boilerplate      | 7 × `+server.ts` files, ~40% line-duplicated (see `/check-health` H-05)                                                                           | **Hand-rolled glue**  |

---

## Step 2 — Hand-rolled opportunities at a glance

| Capability                 | LOC under maintenance | Has tests? | Buggy / stale signals               | Worth a swap? |
| -------------------------- | --------------------- | ---------- | ----------------------------------- | ------------- |
| Test harness               | 597 (test-utils + smoke + integration) | The harness *is* the tests | 35-min CI timeouts (H-08) | **Yes — F-01** |
| D1 persistence layer       | 1,483 ([store.ts](../src/lib/server/content/store.ts))               | Integration only | Three functions over CC 15 (`/check-health` H-06) | **Yes — F-04** |
| D1 type declarations       | ~30 (in store.ts)                                                    | n/a       | Drift risk vs. official types       | **Yes — F-03** |
| Rate limiter               | ~150 ([hooks.server.ts](../src/hooks.server.ts))                     | Integration only | Per-isolate weakness ([reports/security-2026-05-01.md S-06](security-2026-05-01.md#s-06--%F0%9F%9F%A1-in-memory-rate-limiter-is-per-isolate)) | **Yes — F-02** |
| Schema drift check         | 167 ([check-d1-schema.mjs](../scripts/check-d1-schema.mjs))          | self        | Hasn't been exercised against a 2nd migration yet | Borderline — F-04 absorbs |
| Client logger              | 43 ([logger.ts](../src/utils/logger.ts))                             | None       | None                                | **No** — too small |
| Date formatting helpers    | 40 ([dateFormat.ts](../src/utils/dateFormat.ts))                     | None       | None                                | **No** — `Intl` is correct |
| CRUD route boilerplate     | ~150 across 7 files                                                  | Integration | jscpd 40% duplication (H-05)        | Local helper > FOSS — F-05 |

---

## Step 3 — Recommendations

### F-01 — 🟠 Replace the smoke/integration test harness with `@cloudflare/vitest-pool-workers`

**Replaces:** [scripts/test-utils/cloudflare-test-utils.mjs](../scripts/test-utils/cloudflare-test-utils.mjs) (263), [scripts/smoke-content-api.mjs](../scripts/smoke-content-api.mjs) (121), [scripts/integration-content-api.mjs](../scripts/integration-content-api.mjs) (213) — **597 LOC under maintenance.**

**Why this repo:** The current harness manually `spawn`s `wrangler dev`, polls `/api/history?limit=1` for readiness ([smoke-content-api.mjs:46-48](../scripts/smoke-content-api.mjs#L46)), and runs HTTP probes against the live process. Each CI job pays the build + boot cost (~3 minutes before any test runs); CI gives smoke 30 minutes and integration 35 minutes ([reports/health-2026-05-01.md H-08](health-2026-05-01.md#h-08--%F0%9F%9F%A1-integration-scripts-gate-the-pipeline-at-30-min)). The `@cloudflare/vitest-pool-workers` package runs each test in a Workers isolate **with the same D1 binding** the production code uses, so SQL-level integration coverage works without booting `wrangler dev`. It also unlocks unit tests against pure functions in [store.ts](../src/lib/server/content/store.ts), [hooks.server.ts](../src/hooks.server.ts), and [http.ts](../src/lib/server/content/http.ts) — directly addressing [reports/health-2026-05-01.md H-02](health-2026-05-01.md#h-02--%F0%9F%9F%A0-no-automated-unit-tests-coverage-cannot-be-measured).

**Candidates:**

| Library                                | License    | Maintenance signal                                                                                              | Why it fits                                                                                                  |
| -------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **`@cloudflare/vitest-pool-workers`** + **`vitest`** | MIT (both) | First-party Cloudflare; verify maintenance status via `gh repo view cloudflare/workers-sdk --json` (this monorepo houses it). Vitest itself is one of the most actively maintained JS test runners. | Designed precisely for this: D1, KV, R2, queues are bound just like in `wrangler.jsonc`. SvelteKit + Vite already in the tree — Vitest reuses the Vite config. |
| `miniflare` directly + `vitest`        | MIT        | Same maintainer (Cloudflare).                                                                                   | More flexible but you build the harness yourself; no longer recommended after `vitest-pool-workers` shipped.  |
| Stick with HTTP-only + supertest       | MIT        | Mature.                                                                                                         | Does not address the unit-test gap; doesn't speed up CI.                                                     |

**Adoption cost:** **M.** ~½ day to wire the pool config, port one smoke test, and remove the spawn-wrangler harness. Migration strategy: **strangler fig** — keep [scripts/integration-content-api.mjs](../scripts/integration-content-api.mjs) running until 90% of its assertions are duplicated as Vitest specs, then delete.

**Risks:**
- The local D1 instance the pool creates is per-test by default; teardown semantics differ from a long-running `wrangler dev`. Tests that depend on global state ordering need `beforeEach` resets.
- Vitest config has to share `vite.config.js`'s aliases (`$lib`, `@/types`) — usually a one-line `defineConfig` extension.

**References:**
- `@cloudflare/vitest-pool-workers`: <https://www.npmjs.com/package/@cloudflare/vitest-pool-workers>
- Cloudflare docs: "Write your first test" — Workers / Vitest integration.

---

### F-02 — 🟠 Replace the per-isolate rate limiter with Cloudflare's native `RateLimit` binding

**Replaces:** [src/hooks.server.ts:10-117](../src/hooks.server.ts#L10) — module-scope `Map<string, RateLimitBucket>` plus `parsePositiveInt`, `consumeWriteLimit`, `applyRateLimitHeaders`, and the periodic `maybeSweepBuckets` GC.

**Why this repo:** The current limiter is documented as best-effort ([.env.example:18](../.env.example#L18)) but is the only client-side bound on credential brute-forcing if [reports/security-2026-05-01.md S-02](security-2026-05-01.md#s-02--%F0%9F%9F%A0-editor_api_token-fallback-path-is-reachable-in-production-a07) is unaddressed. Each Cloudflare isolate has its own `Map`, so a determined attacker hitting different colos sees independent buckets.

**Candidates:**

| Library / approach                              | License    | Maintenance signal                       | Why it fits                                                                                                                                          |
| ----------------------------------------------- | ---------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare native `RateLimit` binding**       | n/a (platform-provided; no library to license-check) | First-party, GA since Nov 2024. Verify current status via the Cloudflare Workers changelog. | Zero extra deps. Add a `unsafe.bindings` block to [wrangler.jsonc](../wrangler.jsonc); `event.platform.env.WRITE_LIMITER.limit({ key })` returns `{ success }`. Globally consistent across isolates. |
| `@upstash/ratelimit` (`@upstash/ratelimit-cloudflare` for Workers) | MIT | Active. Verify via `gh repo view upstash/ratelimit-js --json`. | Sliding-window / token-bucket. Backs onto Upstash Redis or a Durable Object. Best when you already have Upstash infra; otherwise overkill.            |
| `sveltekit-rate-limiter`                        | MIT        | Active SvelteKit-community lib.           | A drop-in for the existing approach, **also per-isolate by default** — solves the ergonomics, not the global-consistency problem. Use only if F-02 is too much. |
| Build a Durable Object yourself                 | n/a        | Cloudflare-supported pattern.             | Maximum control; ~30 LOC of DO code. Fine if you already have DOs. Adds a binding and a small cost.                                                 |

**Recommended:** the **native `RateLimit` binding**. It is the lowest-cost path to truly global limits.

**Adoption cost:** **S.** Roughly 30 LOC of changes:
1. Add to [wrangler.jsonc](../wrangler.jsonc):
   ```jsonc
   "unsafe": {
     "bindings": [
       { "name": "WRITE_LIMITER", "type": "ratelimit", "namespace_id": "1001",
         "simple": { "limit": 30, "period": 60 } }
     ]
   }
   ```
2. In [hooks.server.ts](../src/hooks.server.ts) replace `consumeWriteLimit(...)` with `await event.platform.env.WRITE_LIMITER.limit({ key: getClientKey(event) })`.
3. Delete the `Map`, the GC sweep, and `parsePositiveInt`. Keep `applyRateLimitHeaders` for the response shape.

**Risks:**
- Native binding has fixed buckets per binding. Multiple bucket policies require multiple bindings.
- It's still in `unsafe.bindings` in some SDK versions — check the current Wrangler release notes when implementing.
- Local development with `wrangler dev` may not enforce the binding identically; document the gap.

**References:**
- Cloudflare docs: Workers Rate Limiting API.
- `@upstash/ratelimit`: <https://github.com/upstash/ratelimit-js>.
- `sveltekit-rate-limiter`: <https://github.com/ciscoheat/sveltekit-rate-limiter>.

---

### F-03 — 🟡 Use `@cloudflare/workers-types` directly instead of inline D1 type aliases

**Replaces:** [src/lib/server/content/store.ts:21-35](../src/lib/server/content/store.ts#L21) — inline `D1ResultSet`, `D1PreparedStatement`, `D1Database` interfaces.

**Why this repo:** The package is **already in the lockfile** (transitively via `wrangler` and `@sveltejs/adapter-cloudflare`). The inline types are a cast-target (`return candidate as unknown as D1Database;` at [store.ts:..](../src/lib/server/content/store.ts)), which means any D1 API change gets caught only at runtime. The official types include `D1Result<T>`, `D1ExecResult`, and the full `D1PreparedStatement` shape (including `raw`, `first` overloads, `run` typing).

**Candidates:**

| Library                          | License    | Maintenance signal                                         | Why it fits                                                                            |
| -------------------------------- | ---------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **`@cloudflare/workers-types`**  | MIT (Apache-2.0 OR MIT) | First-party, weekly releases (the version currently resolved is `4.20260219.0`). | Zero new transitive deps. Drop-in replacement.                                         |
| `cloudflare:workers` ambient     | n/a        | Same maintainer.                                           | Available without import via the `compatibility_date` runtime, but explicit imports are cleaner for IDE go-to-def. |

**Adoption cost:** **S.** ~5 minutes:
1. Add to [package.json](../package.json) devDependencies: `"@cloudflare/workers-types": "^4.20260219.0"`.
2. In [tsconfig.json](../tsconfig.json), the SvelteKit-generated config already pulls them, but make it explicit:
   ```json
   { "extends": "./.svelte-kit/tsconfig.json", "compilerOptions": { "types": ["@cloudflare/workers-types"] } }
   ```
3. Delete the inline `D1Database` / `D1PreparedStatement` / `D1ResultSet` types in [store.ts:21-35](../src/lib/server/content/store.ts#L21). Replace `getDb`'s `as unknown as D1Database` with a real type narrow.

**Risks:** essentially none — it's the upstream type for the API the code already uses.

**References:** <https://www.npmjs.com/package/@cloudflare/workers-types>.

---

### F-04 — 🟡 Adopt Drizzle ORM for the D1 layer

**Replaces:** Most SQL in [src/lib/server/content/store.ts](../src/lib/server/content/store.ts) — the constants `INSERT_PROJECT_SQL`, `UPDATE_PROJECT_SQL`, etc., the manual `.bind()` parameter ordering, and the row-mapping helpers `rowToProject`, `rowToGoal`, `rowToHistoryEvent`. Schema definition becomes a single TypeScript file that also generates the migration.

**Why this repo:** The hand-rolled SQL is correct but verbose. The current migration story is "1 SQL file + 1 schema-drift script" ([scripts/check-d1-schema.mjs](../scripts/check-d1-schema.mjs), 167 LOC) — Drizzle's `drizzle-kit generate` and `drizzle-kit migrate` cover both. Drizzle has a **first-class D1 driver** and is one of the few ORMs that maps cleanly to D1's prepare/bind/batch model (no connection pool fiction). The Zod schemas already on file ([store.ts:192-226](../src/lib/server/content/store.ts#L192)) can be generated from the Drizzle table schema via `drizzle-zod`, eliminating the create/patch schema duplication.

**Candidates:**

| Library          | License   | Maintenance signal                                                     | Why it fits                                                                                                                                |
| ---------------- | --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Drizzle ORM** + `drizzle-kit` | Apache-2.0 | Very active. Verify via `gh repo view drizzle-team/drizzle-orm --json`. | Native D1 adapter, schema-first TypeScript, generates migrations + types + Zod schemas. SQLite-compatible (D1 is SQLite). Lightweight runtime. |
| Kysely + `kysely-d1`            | MIT        | Stable, smaller community.                                              | Query-builder rather than ORM; thinner abstraction, very strong types. No migration tooling included.                                      |
| Prisma                          | Apache-2.0 | Industry standard, but D1 support is preview-only and adds a Rust binary engine that does not run in Workers natively. | Skip — not a fit for D1/Workers.                                                                                                            |

**Adoption cost:** **L.** Real migration:
1. Create `db/schema.ts` describing `projects`, `goals`, `content_history` (matches [migrations/d1/0001_init_content_schema.sql](../migrations/d1/0001_init_content_schema.sql)).
2. `drizzle-kit generate` produces a migration file matching the existing one.
3. Refactor [store.ts](../src/lib/server/content/store.ts) one operation at a time, replacing `db.prepare(INSERT_PROJECT_SQL).bind(...)` with `db.insert(projects).values(...)`.
4. Replace `drizzle-zod` for the create/patch schemas, removing duplicate Zod definitions.
5. Retire [scripts/check-d1-schema.mjs](../scripts/check-d1-schema.mjs); use `drizzle-kit migrate --dialect=sqlite` in CI.

**Strategy:** **strangler fig.** Drizzle and raw `db.prepare()` calls coexist on the same D1 binding. Migrate one operation per PR.

**Risks:**
- D1's `db.batch()` semantics differ slightly across Drizzle versions — verify the version of `drizzle-orm/d1` you adopt supports the exact batching pattern in [store.ts:912-944](../src/lib/server/content/store.ts#L912) (insert + history append in one transaction).
- `content_history` immutability is currently enforced by SQL triggers in the migration; Drizzle is migration-aware but the trigger needs to live in a raw SQL file. Drizzle supports `drizzle-kit` "custom" SQL migrations, so this still works — verify before committing.
- The 1,483 LOC of `store.ts` is the most complex code in the repo; refactoring it touches the auth+write hot path.

**References:** <https://orm.drizzle.team/docs/get-started/d1-new>, <https://orm.drizzle.team/docs/zod>.

---

### F-05 — 🟡 Build a small typed CRUD-handler helper (NOT a FOSS swap)

**Note:** This is the only "opportunity" in the report where I am explicitly recommending **not** to adopt FOSS. tRPC, Hono, NestJS, SvelteKit-style "endpoint" libraries (`sveltekit-superforms` for forms, etc.) all exist and would absorb the duplication flagged in [reports/health-2026-05-01.md H-05](health-2026-05-01.md#h-05--%F0%9F%9F%A1-goal-and-project-server-ts-handlers-are-40-48-duplicated). **None of them is a fit here:**

- **tRPC** — would replace SvelteKit's `+server.ts` routing. The browser client also has to be ported. ~10× the effort.
- **Hono** — would replace SvelteKit on the server. Same problem.
- **`sveltekit-superforms`** — solves a different problem (form validation), not generic CRUD.

The cleanest fix is the local helper proposed in [reports/health-2026-05-01.md H-05](health-2026-05-01.md#h-05--%F0%9F%9F%A1-goal-and-project-server-ts-handlers-are-40-48-duplicated): `makeCollectionHandlers<T>(store)` and `makeItemHandlers<T>(store)` in `src/lib/server/content/`, returning `{ GET, POST, PATCH, DELETE }`. ~40 LOC of new code, ~80 LOC removed. Recorded here so it doesn't get pulled into a future FOSS recommendation by mistake.

---

### F-06 — 🟢 `@asteasolutions/zod-to-openapi` for free API documentation

**Replaces:** Currently nothing — there is no API documentation. Since Zod schemas already define every input shape, OpenAPI generation is essentially free.

**Why this repo:** Future contributors and any external integrators benefit from a discoverable spec. A `GET /api/openapi.json` endpoint generated from the existing `projectCreateSchema` / `projectPatchSchema` / etc. costs ~30 LOC to wire, no schema duplication.

**Candidates:**

| Library                                | License   | Maintenance signal                                                            | Why it fits                                                                  |
| -------------------------------------- | --------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **`@asteasolutions/zod-to-openapi`**   | MIT       | Active; verify via `gh repo view asteasolutions/zod-to-openapi --json`.        | Decorator-free, registers existing Zod schemas; exposes `.generateDocument()`.|
| `zod-openapi`                          | MIT       | Active alternative.                                                           | Similar surface; pick whichever the team prefers.                            |

**Adoption cost:** **S.** ~30 LOC + a new `+server.ts` for `/api/openapi.json`.

**Risks:** none material.

**References:** <https://github.com/asteasolutions/zod-to-openapi>.

---

## Considered and rejected

| Capability                       | Library considered           | Why rejected                                                                                                                                  |
| -------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-side structured logging   | `pino` (MIT)                 | The existing scoped logger ([src/utils/logger.ts](../src/utils/logger.ts), 43 LOC) is fine. Cloudflare Observability ingests structured `console.warn` directly — `pino` adds no clarity here, and its serializers don't compose well with Workers. |
| Date formatting                  | `date-fns` / `dayjs` / `luxon` | [src/utils/dateFormat.ts](../src/utils/dateFormat.ts) is 40 LOC of native `Intl.DateTimeFormat` with a hand-rolled relative-time helper. `Intl` is the right answer for i18n; an external lib would *increase* bundle size for less correctness. |
| HTTP framework swap              | `hono`, `tRPC`               | Already on SvelteKit; swap would replace 90% of the code for no architectural gain.                                                         |
| Observability                    | `@sentry/sveltekit`          | The Cloudflare Workers Observability binding (already enabled in [wrangler.jsonc:7-9](../wrangler.jsonc#L7)) covers the same ground without a new vendor. Add Sentry only if a *user-facing* error capture + release tracking is wanted. |
| Test runner alternatives          | `playwright` (browser), `cypress`  | Both are E2E browser testers — different layer from the API integration tests in scope here. Useful later for the admin UI, not for replacing [scripts/integration-content-api.mjs](../scripts/integration-content-api.mjs). |
| Auth library swap                | `lucia-auth`, `auth.js`      | Cloudflare Access already provides MFA-backed SSO; the JWT verification in [editor.ts](../src/lib/server/auth/editor.ts) is ~260 LOC of correct, defensive code. Swapping in another auth lib would *add* surface, not reduce it. |

---

## Effort × impact matrix

```
       │  S effort         │  M effort               │  L effort
───────┼───────────────────┼─────────────────────────┼──────────────────
🟠 High │  F-02 RateLimit   │  F-01 vitest-pool       │
       │  binding          │                         │
───────┼───────────────────┼─────────────────────────┼──────────────────
🟡 Med  │  F-03 workers-    │                         │  F-04 Drizzle
       │  types            │                         │  ORM
───────┼───────────────────┼─────────────────────────┼──────────────────
🟢 Low  │  F-06 zod-to-     │                         │
       │  openapi          │                         │
```

The bottom-left quadrant — F-02 and F-03 — is "do this week." F-01 is a multi-day project but eliminates two `/check-health` 🟠 findings (H-02, H-08) plus 597 LOC of bespoke harness. F-04 is the largest investment but the highest long-term lever, because it absorbs the dominant complexity in the repo ([store.ts](../src/lib/server/content/store.ts)) and replaces an in-house schema-drift scanner.
