## Type declaration placement

- **Canonical location:** Put shared, reusable TypeScript types in `src/types/` (one file per domain, e.g. `src/types/map.ts`).
- **Barrel:** Add a barrel `src/types/index.ts` exporting domain files for convenient imports: `import { Foo } from '@/types'`.
- **Aliases:** Use `tsconfig.json` `baseUrl` / `paths` and SvelteKit `alias` so `@/types` resolves in editor and build.
- **Type-only module:** Keep `src/types` type-only (avoid exporting runtime code) to prevent circular dependencies.
- **Migration shim:** If migrating, use a short-lived compatibility shim, but prefer direct imports from the canonical location and remove shims once updated.

Following this ensures a single source-of-truth for types and makes imports consistent and discoverable for contributors.

## Svelte 5 idiom: runes only

This repo is on Svelte 5 and uses **runes** in every component. Legacy mode (`export let`, `$:`, `on:eventName`, `<slot />`, `createEventDispatcher`) is being phased out — do not introduce new uses. New components must be runes-only; touched components should be migrated to runes in the same PR when practical.

The decision is recorded here because the indecision is what costs: mixing idioms across the codebase makes it harder to read, and ESLint's `no-useless-assignment` rule misfires on `$:` reactive declarations (8 false positives at the time of writing — see [reports/action-plan-2026-05-01.md](reports/action-plan-2026-05-01.md)).

### Mapping (Svelte 4 → Svelte 5)

| Legacy idiom                                                  | Runes equivalent                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `export let foo`                                              | `let { foo } = $props()`                                                                               |
| `export let foo = 'default'`                                  | `let { foo = 'default' } = $props()`                                                                   |
| `export let foo: Foo` (typed)                                 | `let { foo }: { foo: Foo } = $props()`                                                                 |
| `export let open = false` (parent uses `bind:open`)           | `let { open = $bindable(false) } = $props()`                                                           |
| Mutable `let count = 0` re-assigned at runtime                | `let count = $state(0)`                                                                                |
| `$: doubled = count * 2`                                      | `let doubled = $derived(count * 2)`                                                                    |
| `$: { document.title = title }` (side-effect)                 | `$effect(() => { document.title = title })`                                                            |
| `on:click={handler}`                                          | `onclick={handler}`                                                                                    |
| `on:click|preventDefault={fn}`                                | `onclick={(e) => { e.preventDefault(); fn(e); }}`                                                      |
| `<slot />`                                                    | `let { children } = $props()` + `{@render children?.()}`                                               |
| `<slot name="header" />`                                      | `let { header } = $props()` + `{@render header?.()}`                                                   |
| `createEventDispatcher` + `dispatch('select', detail)`        | Callback prop: `let { onselect }: { onselect?: (detail: T) => void } = $props()`; call `onselect?.(detail)` |
| Parent: `<Child on:select={handler} />`                       | Parent: `<Child onselect={handler} />`                                                                 |

### What stays unchanged

- `bind:this={el}` for DOM/component refs.
- `bind:value={x}`, `bind:checked={x}` for two-way form bindings (when the child prop is `$bindable`).
- `onMount` / `onDestroy` from `'svelte'` (still supported; `$effect(() => () => cleanup())` is the runes alternative but the lifecycle hooks remain valid for top-level mount/unmount work — e.g. MapLibre construction).
- `tick()` from `'svelte'`.
- `<svelte:head>`, `<svelte:window>`, `<svelte:body>`.

### Rules of thumb

- **Computed values use `$derived`, never `$effect`.** `$effect` is for true side effects: DOM measurement, subscriptions, MapLibre lifecycle, `document.body.style.overflow` toggles. If the body is `x = expression`, it should be `$derived`.
- **`$state` is a deep proxy for plain objects and arrays.** `arr.push(x)` and `obj.foo = bar` both trigger reactivity. You don't need to reassign to mutate.
- **Don't reach for `bind:this` to call child methods.** Prefer callback props or `$bindable` state. `export function` exposed via `bind:this` still works, but it couples parent and child.
- **Run `npm run typecheck` after migrating a component** — Svelte 5's prop typing through `$props()` catches mismatches the legacy `export let` chain often hid.

### Lint

The `--max-warnings=140` ceiling in `package.json` is intentionally above current count to absorb the runes migration's churn. Once every component is on runes and the `no-useless-assignment` false positives clear, ratchet the ceiling down — do that as a separate follow-up PR, not as part of any single component migration.

## Styling

Brand colors, surfaces, typography, and layout primitives are CSS custom properties on `:root` in [src/styles/global.css](src/styles/global.css). See [docs/design-tokens.md](docs/design-tokens.md) for the catalog and usage guidance — including the cross-reference for status badge colors, which live in [src/utils/statusHelpers.ts](src/utils/statusHelpers.ts) instead of as CSS tokens.
