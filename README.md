# Metro ATL Transit Tracker

Public, data-driven map and content hub for transit advocacy in Metro Atlanta.

## Stack

- SvelteKit + Svelte 5
- MapLibre GL
- Tailwind CSS
- JSON-backed content API (server routes)

## What Changed

This repo now has a first-pass admin-ready content architecture:

- Public pages read projects/goals through `/api/*` instead of direct JSON imports.
- Content is persisted in `data/content/`.
- Archive/restore is soft-delete (`is_archived`, `archived_at`, `archived_by`).
- Every write appends an immutable event to `data/content/history.json`.
- `/history` is a public, browsable change log.
- `/admin` provides a lightweight JSON editor for projects/goals.

## Content Files

Canonical writable store:

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

## Editor Auth (Current)

Write routes are guarded by a shared token:

- Set `EDITOR_API_TOKEN` in server environment.
- Send header `x-editor-token: <token>`.
- Optional actor header: `x-editor-actor: <name>`.

Example `.env` values:

```env
PUBLIC_MAPTILER_KEY=your_maptiler_key_here
EDITOR_API_TOKEN=replace-with-random-secret
```

## Admin + History UI

- Admin portal: `/admin`
- Public change history: `/history`

## Local Development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

## Cloudflare Note

Current write persistence uses filesystem JSON (`data/content/*`), which is best for local/single-instance hosting.

Cloudflare Worker deploys use an in-memory content store seeded from repository JSON (read endpoints work, write changes are non-durable).

For durable Cloudflare production writes, next step is replacing the content store with a D1-backed store while keeping the same `/api/*` contract and history schema.
