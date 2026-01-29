## Type declaration placement

- **Canonical location:** Put shared, reusable TypeScript types in `src/types/` (one file per domain, e.g. `src/types/map.ts`).
- **Barrel:** Add a barrel `src/types/index.ts` exporting domain files for convenient imports: `import { Foo } from '@/types'`.
- **Aliases:** Use `tsconfig.json` `baseUrl` / `paths` and Vite/Astro `resolve.alias` so `@/types` resolves in editor and build.
- **Type-only module:** Keep `src/types` type-only (avoid exporting runtime code) to prevent circular dependencies.
- **Migration shim:** If migrating, use a short-lived compatibility shim, but prefer direct imports from the canonical location and remove shims once updated.

Following this ensures a single source-of-truth for types and makes imports consistent and discoverable for contributors.
