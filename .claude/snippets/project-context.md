# Project context (known — do not spend time re-detecting)

- SvelteKit 2 + Svelte 5 (runes) app deployed to Cloudflare Workers via `@sveltejs/adapter-cloudflare`; config in `wrangler.jsonc`. Cloudflare D1 database with migrations in `migrations/` (`npm run d1:migrate:local`, schema check via `npm run schema:check`).
- TypeScript throughout (strict, `noUncheckedIndexedAccess`). Tailwind CSS 4 for styling. Zod for validation, `@asteasolutions/zod-to-openapi` for the API spec. `jose` for JWT handling. MapLibre GL for the map UI.
- Layout: `src/routes` (pages + API endpoints), `src/lib` (incl. `src/lib/server` for server-only code and `src/lib/map`), `src/components`, `src/layouts`, `src/utils`, `src/types`, `scripts/` (build + smoke/integration test scripts), `data/`, `static/`.
- Tests: Vitest with `@cloudflare/vitest-pool-workers` (`npm run test`, coverage via `npm run test:coverage`), smoke tests (`npm run test:smoke`), integration tests (`npm run test:integration`).
- Quality gates: `npm run ci:gate` = typecheck (`svelte-check`) + lint (`eslint`, currently allows up to 140 warnings) + unit tests + schema check + smoke tests.
- Environment note: this machine is Windows. The listed shell commands are POSIX-style — run them through the Bash tool rather than translating to PowerShell.
