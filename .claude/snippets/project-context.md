# Project context (known — do not spend time re-detecting)

Canonical source for setup, commands, and project structure: `AGENTS.md`. This is a short summary of it; update both together.

- SvelteKit 3 + Svelte 5 (runes) app deployed to Cloudflare Workers via `@sveltejs/adapter-cloudflare`; config in `wrangler.jsonc`. Cloudflare D1 database with migrations in `migrations/` (`npm run d1:migrate:local`, schema check via `npm run schema:check`).
- TypeScript throughout (strict, `noUncheckedIndexedAccess`). Scoped Svelte styles on CSS custom-property tokens for styling (no utility-class framework). Zod for validation, `@asteasolutions/zod-to-openapi` for the API spec. `jose` for JWT handling. MapLibre GL for the map UI.
- Layout: `src/routes` (pages + API endpoints), `src/lib` (incl. `src/lib/server` for server-only code and `src/lib/map`), `src/components`, `src/layouts`, `src/utils`, `src/types`, `scripts/` (build + smoke/integration test scripts), `data/`, `static/`.
- Tests: Vitest (`npm run test`: server code in Node, components in jsdom with `@testing-library/svelte`; coverage via `npm run test:coverage`), smoke tests (`npm run test:smoke`), integration tests (`npm run test:integration`).
- Quality gates: `npm run ci:gate` = typecheck (`svelte-check`) + lint (`eslint`, warnings capped by `--max-warnings` in `package.json`) + Prettier format check + unit tests + schema check + smoke tests.
- Environment note: this machine is Windows. The listed shell commands are POSIX-style — run them through the Bash tool rather than translating to PowerShell.
