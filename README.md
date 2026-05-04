# Metro ATL Transit Tracker

Public, data-driven transit advocacy map and content hub for Metro Atlanta.

## Stack

- SvelteKit + Svelte 5
- MapLibre GL
- Tailwind CSS
- Cloudflare Workers + D1 (`projects`, `goals`, `content_history`, `user_profiles`)
- Cloudflare Access (editor auth)
- Cloudflare native rate-limit binding for write protection

## Current Capabilities

- Interactive Metro Atlanta county map (MapLibre) with county detail panel
- Public goals table grouped by county, plus regional goals
- Nested related projects under goals with source links/status badges
- Public history page at `/history` (create/update/archive/restore events)
- Admin JSON editor at `/admin` for projects/goals (create, update, archive, restore)
- Soft-delete archive model with immutable D1-backed content history
- Server-side payload validation for writes (Zod)
- Per-identity display name overrides (`user_profiles`) shown on `/history` and admin views
- Write-route rate limiting via Cloudflare's native ratelimit binding (globally enforced)
- OpenAPI 3.1 spec published at `/api/openapi.json` (generated from Zod schemas)
- Automatic D1 seeding on empty DBs from `data/content/*` (fallbacks to legacy metadata files)

## Pages

- `/` public map + goals view
- `/history` public change log
- `/admin` admin JSON editor
- `Methodology` is exposed from the site header as a modal UI

## Content + Seed Files

Primary seed/bootstrap data (used to initialize an empty D1):

- `data/content/projects.json`
- `data/content/goals.json`
- `data/content/history.json`

Fallback seed sources (used if canonical seed arrays are empty):

- `src/data/geo/projects-metadata.json`
- `src/data/geo/goals-metadata.json`

Important behavior:

- Admin edits at `/admin` write to D1 immediately and do not automatically write back to `data/content/*.json`.
- This can create intentional drift between live D1 content and repository seed files until you export/sync data manually.

Policies/runbooks:

- `docs/ci-gate-policy.md`
- `docs/backup-retention-policy.md`
- `docs/design-tokens.md`

## API Routes

Read routes (public):

- `GET /api/projects?includeArchived=true|false`
- `GET /api/projects/:id?includeArchived=true|false` (defaults to `true` when omitted)
- `GET /api/goals?includeArchived=true|false`
- `GET /api/goals/:id?includeArchived=true|false` (defaults to `true` when omitted)
- `GET /api/history?entityType=project|goal&entityId=<id>&limit=<n>`
- `GET /api/openapi.json` (OpenAPI 3.1 spec, cached for 5 min)

Authenticated routes (no special scope, any authenticated identity):

- `GET /api/me` — returns `{ identity, actor, display_name }` for the current user
- `PUT /api/me` — upsert/clear `display_name` (pass `null` or empty string to clear)

Write routes (auth required):

- `POST /api/projects` (`content:edit`)
- `PATCH /api/projects/:id` (`content:edit`)
- `DELETE /api/projects/:id` (`content:archive`, archive/soft-delete)
- `POST /api/projects/:id/restore` (`content:archive`)
- `POST /api/goals` (`content:edit`)
- `PATCH /api/goals/:id` (`content:edit`)
- `DELETE /api/goals/:id` (`content:archive`, archive/soft-delete)
- `POST /api/goals/:id/restore` (`content:archive`)

Notes:

- List endpoints return `{ data: [...], meta: { count } }`.
- Item endpoints return `{ data: {...} }`.
- History supports filtering by `entityType`, `entityId`, and `limit`.

## Editor Auth

Write routes require auth via Cloudflare Access JWT (default) or a local/CI token mode.

Cloudflare Access mode:

- Set `CF_ACCESS_TEAM_DOMAIN` (example: `your-team.cloudflareaccess.com`)
- Set `CF_ACCESS_AUD` (single value or comma-separated audiences)
- Send `cf-access-jwt-assertion` header or `CF_Authorization` cookie (both are injected by Cloudflare Access)
- Actor is derived from claims in this order: `email`, `common_name`, `name`, `sub`
- Display name in UI is overridden by `user_profiles.display_name` when set (see `PUT /api/me`)

Local/CI token mode (tests only):

- Set `EDITOR_TOKEN_AUTH_ENABLED=true`
- Set `EDITOR_API_TOKEN=<token>`
- Send `x-editor-token: <token>`
- Honored only when the request hostname is `localhost`/`127.0.0.1`/`0.0.0.0`/`::1` or no `cf-ray` edge header is present — refused on real Cloudflare edge requests even if the env vars are set

Optional RBAC allowlists (CSV, case-insensitive):

- `CF_ACCESS_RBAC_EDITORS` -> `content:edit`
- `CF_ACCESS_RBAC_ARCHIVERS` -> `content:archive`
- `CF_ACCESS_RBAC_ADMINS` -> all current scopes (`content:edit`, `content:archive`)
- If no RBAC allowlists are configured, any authenticated Access user can perform writes

Example `.env`:

```env
PUBLIC_MAPTILER_KEY=your_maptiler_key_here
CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
CF_ACCESS_AUD=your-access-audience-tag
CF_ACCESS_RBAC_EDITORS=editor1@example.com,editor2@example.com
CF_ACCESS_RBAC_ARCHIVERS=archiver1@example.com
CF_ACCESS_RBAC_ADMINS=admin1@example.com
WRITE_RATE_LIMIT_ENABLED=true
```

The actual write rate limit (requests/period) is configured on the `WRITE_LIMITER`
binding in `wrangler.jsonc` (`unsafe.bindings`) — not via env vars.

See `.env.example` for the full local config template.

## Validation + History Guarantees

- Project/goal create/update payloads are schema-validated server-side
- Invalid payloads return `400`
- Server-managed archive fields (`is_archived`, `archived_at`, `archived_by`) are rejected on create/update
- Archive/restore must use dedicated endpoints
- Every successful write appends a `content_history` event
- D1 triggers enforce history immutability (update/delete blocked on `content_history`)

## Write Rate Limits

All `/api/*` write methods (`POST`, `PUT`, `PATCH`, `DELETE`) are rate-limited via
the Cloudflare native `WRITE_LIMITER` ratelimit binding (configured in `wrangler.jsonc`).

- Default: `30` requests / `60` seconds, keyed on `cf-connecting-ip` (falls back to
  `x-forwarded-for`, then `getClientAddress()`, then the literal `unknown`)
- Globally enforced by the Cloudflare runtime — not best-effort/per-isolate
- Cross-origin writes are rejected with `403` before the limiter runs
- `429` responses include `Retry-After: 60`
- Write responses include rate-limit headers:
  - `RateLimit-Limit`, `RateLimit-Policy`, `X-RateLimit-Limit` (always)
  - `RateLimit-Remaining: 0`, `X-RateLimit-Remaining: 0` (when blocked)
- If the binding is not provisioned (e.g., bare `wrangler dev` without `unsafe.bindings`),
  the limiter fails open — route-level auth still gates writes

Environment controls:

- `WRITE_RATE_LIMIT_ENABLED=true|false` (kill switch only; defaults to enabled)
- Limit + window are configured on the `WRITE_LIMITER` binding's `simple` block in `wrangler.jsonc`

## Local Development

Prereqs: Node.js 22+, npm, Wrangler.

```bash
npm install
npm run d1:migrate:local
npm run dev
```

Build / preview:

```bash
npm run build
npm run preview
```

Notes:

- `npm run dev` uses SvelteKit + Cloudflare adapter emulation and reads D1 bindings from `wrangler.jsonc`
- If `PUBLIC_MAPTILER_KEY` is missing, the map still loads with a fallback style

## Cloudflare / D1 Operations

`/api/*` routes require a `DB` D1 binding at runtime.

Local/remote dev:

- `npx wrangler dev --local`
- `npx wrangler dev --remote`

Migrations:

- Local: `npm run d1:migrate:local`
- Local (raw): `npx wrangler d1 migrations apply metro-atl-transit-prod --local`
- Staging: `npx wrangler d1 migrations apply metro-atl-transit-staging --env staging --remote`
- Prod: `npx wrangler d1 migrations apply metro-atl-transit-prod --remote`

Deploy:

- `npm run deploy`

## Testing and CI Gates

Local quality/test commands:

- `npm run typecheck`
- `npm run lint`
- `npm run schema:check` (verifies D1 schema, indexes, triggers)
- `npm run test:smoke` (Wrangler local worker + read/write happy path)
- `npm run test:integration` (history ordering + immutability checks)
- `npm run test:all`
- `npm run test` (vitest unit tests)
- `npm run ci:gate` (typecheck + lint + test + schema + smoke)
- `npm run ci:gate:full` (adds integration)

CI workflows:

- `.github/workflows/ci-gates.yml`
- `.github/workflows/backup-snapshots.yml`

`ci-gates.yml` runs three jobs:

- `Quality Checks`
- `Smoke Test`
- `Integration Test`

## Backup and Recovery Operations

Automated backup workflow: `.github/workflows/backup-snapshots.yml`

What it does:

- Snapshots `data/content/*` on merges to `main` and nightly
- Exports D1 prod + staging nightly
- Uploads artifacts and durable backups to Cloudflare R2
- Optionally configures R2 lifecycle + object lock rules (manual dispatch mode)

Timing/sync notes:

- R2 is used for backups, not live runtime reads/writes from the app.
- D1 exports are uploaded to R2 when the backup workflow runs (nightly schedule or manual dispatch when D1 export is enabled), not on each admin edit.
- A `main` branch push can snapshot `data/content/*` and upload to R2 without exporting D1, so recent admin-only D1 changes may not be reflected in that backup run.

See `docs/backup-retention-policy.md` for:

- Required GitHub secrets/variables
- Retention targets
- D1 export/restore runbooks
- Time-travel restore steps

## Utility Scripts

- `npm run build:org-logos` generates `src/data/static/orgLogos.ts` from county metadata + `public/logos`
- `scripts/check-d1-schema.mjs` validates schema objects and immutability triggers
- `scripts/smoke-content-api.mjs` and `scripts/integration-content-api.mjs` run local Wrangler-backed API checks
- `scripts/convert-favicon.js <image-path>` rebuilds `static/favicon.ico` and `static/favicon.svg`

## Contributing

See `CONTRIBUTING.md`.
