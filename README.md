# Metro ATL Transit Tracker

Public, data-driven map and content hub for transit advocacy in Metro Atlanta.

## Stack

- SvelteKit + Svelte 5
- MapLibre GL
- Tailwind CSS
- D1-backed content API (server routes)

## What Changed

This repo now has a first-pass admin-ready content architecture:

- Public pages read projects/goals through `/api/*` instead of direct JSON imports.
- Content is persisted in Cloudflare D1 (`projects`, `goals`, `content_history`).
- Archive/restore is soft-delete (`is_archived`, `archived_at`, `archived_by`).
- Every write appends an immutable history event in D1.
- `/history` is a public, browsable change log.
- `/admin` provides a lightweight JSON editor for projects/goals.

## Content Files

Seed/bootstrap data files:

- `data/content/projects.json`
- `data/content/goals.json`
- `data/content/history.json`

Seed/fallback sources:

- `src/data/geo/projects-metadata.json`
- `src/data/geo/goals-metadata.json`

## API Routes

Public read routes:

- `GET /api/projects?includeArchived=true|false`
- `GET /api/projects/:id`
- `GET /api/goals?includeArchived=true|false`
- `GET /api/goals/:id`
- `GET /api/history?entityType=project|goal&entityId=<id>&limit=200`

Editor write routes:

- `POST /api/projects`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id` (archive)
- `POST /api/projects/:id/restore`
- `POST /api/goals`
- `PATCH /api/goals/:id`
- `DELETE /api/goals/:id` (archive)
- `POST /api/goals/:id/restore`

## Editor Auth

Write routes require Cloudflare Access JWT validation.

Cloudflare Access mode:

- Set `CF_ACCESS_TEAM_DOMAIN` (example: `your-team.cloudflareaccess.com`).
- Set `CF_ACCESS_AUD` (single value or comma-separated audiences).
- Send Access assertion header `cf-access-jwt-assertion` (typically added by Cloudflare Access).
- Actor is derived from Access claims (`email`, `common_name`, `name`, then `sub`).

Optional RBAC allowlists (CSV, case-insensitive):

- `CF_ACCESS_RBAC_EDITORS` grants `content:edit` (create/update).
- `CF_ACCESS_RBAC_ARCHIVERS` grants `content:archive` (archive/restore).
- `CF_ACCESS_RBAC_ADMINS` grants all current scopes (`content:edit`, `content:archive`) and reserves `admin:users` for future endpoints.
- If no RBAC allowlists are set, all authenticated Access users retain existing write permissions.

Example `.env` values:

```env
PUBLIC_MAPTILER_KEY=your_maptiler_key_here
CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
CF_ACCESS_AUD=your-access-audience-tag
CF_ACCESS_RBAC_EDITORS=editor1@example.com,editor2@example.com
CF_ACCESS_RBAC_ARCHIVERS=archiver1@example.com
CF_ACCESS_RBAC_ADMINS=admin1@example.com
WRITE_RATE_LIMIT_ENABLED=true
WRITE_RATE_LIMIT_REQUESTS=30
WRITE_RATE_LIMIT_WINDOW_SECONDS=60
```

## Write Payload Validation

Create and update payloads for projects and goals are schema-validated server-side before persistence.

- Invalid payloads return `400`.
- Server-managed archive fields (`is_archived`, `archived_at`, `archived_by`) are rejected on create/update payloads.
- Archive and restore must go through dedicated endpoints.

## Write Route Rate Limits

All `/api/*` write methods (`POST`, `PUT`, `PATCH`, `DELETE`) are protected by a fixed-window limiter.

- Default policy: `30` requests per `60` seconds per client IP.
- Limiting is in-memory per runtime instance (best-effort). Use Cloudflare WAF rate limits for global enforcement.
- 429 responses include `Retry-After`.
- Write responses include:
  - `RateLimit-Limit`
  - `RateLimit-Remaining`
  - `RateLimit-Reset`
  - `RateLimit-Policy`
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

Environment controls:

- `WRITE_RATE_LIMIT_ENABLED=true|false`
- `WRITE_RATE_LIMIT_REQUESTS=<positive integer>`
- `WRITE_RATE_LIMIT_WINDOW_SECONDS=<positive integer>`

## Admin + History UI

- Admin portal: `/admin`
- Public change history: `/history`

## Local Development

```bash
npm install
npx wrangler d1 migrations apply metro-atl-transit-prod --local
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

## Cloudflare Note

`/api/*` read/write routes now require a `DB` D1 binding at runtime.

- `npm run dev` now uses adapter-cloudflare platform emulation with `wrangler.jsonc`, so `/api/*` can read/write D1 in local SvelteKit dev.
- Local D1 dev with Wrangler Worker runtime: `npx wrangler dev --local`
- Remote D1 dev: `npx wrangler dev --remote`
- Apply migrations:
  - local: `npx wrangler d1 migrations apply metro-atl-transit-prod --local`
  - staging: `npx wrangler d1 migrations apply metro-atl-transit-staging --env staging --remote`
  - prod: `npx wrangler d1 migrations apply metro-atl-transit-prod --remote`
