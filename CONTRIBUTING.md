## Type declaration placement

- **Canonical location:** Put shared, reusable TypeScript types in `src/types/` (one file per domain, e.g. `src/types/map.ts`).
- **Barrel:** Add a barrel `src/types/index.ts` exporting domain files for convenient imports: `import { Foo } from '@/types'`.
- **Aliases:** Use `tsconfig.json` `baseUrl` / `paths` and SvelteKit `alias` so `@/types` resolves in editor and build.
- **Type-only module:** Keep `src/types` type-only (avoid exporting runtime code) to prevent circular dependencies.
- **Migration shim:** If migrating, use a short-lived compatibility shim, but prefer direct imports from the canonical location and remove shims once updated.

Following this ensures a single source-of-truth for types and makes imports consistent and discoverable for contributors.

## Svelte 5: runes only

Every component uses **runes**. Legacy syntax (`export let`, `$:`, `on:eventName`, `<slot />`, `createEventDispatcher`) is not accepted in new or changed code. The policy, the Svelte 4 → 5 mapping, and the rules of thumb live in [.claude/rules/svelte.md](.claude/rules/svelte.md).

The lint warning ceiling (`--max-warnings` in `package.json`) is tracked under "Legacy And Intentional Inconsistencies" in [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md).

## Styling

Brand colors, surfaces, typography, and layout primitives are CSS custom properties on `:root` in [src/styles/global.css](src/styles/global.css). See [docs/design-tokens.md](docs/design-tokens.md) for the catalog and usage guidance — including the cross-reference for status badge colors, which live in [src/utils/statusHelpers.ts](src/utils/statusHelpers.ts) instead of as CSS tokens.
