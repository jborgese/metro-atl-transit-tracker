---
paths:
  - 'src/**/*.svelte'
  - 'src/**/*.svelte.ts'
  - 'src/routes/**/+*.ts'
  - 'src/hooks.server.ts'
  - 'src/lib/server/**/*.ts'
---

# Svelte Standards

Apply when writing or reviewing Svelte components (`.svelte`), rune modules (`.svelte.ts`), SvelteKit route files, `hooks.server.ts`, and server modules. This repo is on **Svelte 5.55** and **SvelteKit 2.59** (the versions in `package-lock.json`). This file is the canonical home of the runes-only policy; `CONTRIBUTING.md` links here. Design-quality criteria live in `.claude/rules/design-review.md`; testing guidance lives in `.claude/rules/testing.md`.

## Before Writing

- **Read the installed versions.** `package.json` declares ranges (`svelte` `^5.49.1`, `@sveltejs/kit` `^2.50.1`); `package-lock.json` records what is installed. Both packages add APIs in minor releases, so use an API only if the installed version has it. Do not upgrade either as a side effect of other work.
- **Check the docs, not memory, for anything version-sensitive.** If the session has the Svelte MCP server or the `svelte` plugin, look sections up with `list-sections` and `get-documentation`. svelte.dev documents the newest releases, including SvelteKit 3, which this repo is not on. Check each API's "available since" note, or the installed package's type definitions (`node_modules/@sveltejs/kit/types/index.d.ts`, `node_modules/svelte/types/index.d.ts`), against the installed version.
- **Not available here:** `{const ...}` declaration tags (Svelte 5.56), `src/env.ts` with `$app/env/*`, and `#lib/...` imports (SvelteKit 3).
- **Ask before enabling an experimental flag.** Experimental features can change in any release. This repo enables neither `compilerOptions.experimental.async` (`await` in components, Svelte 5.36+) nor `kit.experimental.remoteFunctions` (SvelteKit 2.27+).

## Reactivity

- **`$state` only for what the UI reacts to.** A value that no markup, `$derived`, or `$effect` reads is a plain variable. Use `$state.raw` for large values that are replaced, not mutated, such as API responses.
- **Mutation has one home.** Reactive state is declared with `let` and updated in place; that is how Svelte works, not a functional-style violation. `$state` makes plain objects and arrays deep proxies, so `arr.push(x)` and `obj.foo = bar` trigger updates without reassignment. Keep state local to the component or rune module that owns it, and keep everything computed from it pure.
- **Compute with `$derived`, never with an effect that assigns.** Use `$derived(expression)` for one expression and `$derived.by(() => { ... })` for more.
- **`$effect` is an escape hatch** for syncing with something outside Svelte, such as a DOM measurement, `document.body.style` toggles, or a third-party library. Do not update state inside one, and do not wrap its body in a browser check; effects never run on the server. Reach for the alternative first:

| Need                                                                           | Use                                                                                          |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| A value computed from state or props                                           | `$derived`                                                                                   |
| A response to user input                                                       | The event handler, or a function binding (`bind:value={() => value, setValue}`, Svelte 5.9+) |
| Setup and teardown tied to an element                                          | `{@attach ...}` (Svelte 5.29+)                                                               |
| One-time work when the component mounts, such as constructing the MapLibre map | `onMount` / `onDestroy` from `svelte` (the existing pattern in `MetroMap.svelte`)            |
| A listener on `window` or `document`                                           | `<svelte:window>` / `<svelte:document>`                                                      |
| Reading a reactive source outside Svelte                                       | `createSubscriber` from `svelte/reactivity`                                                  |
| Logging a value as it changes                                                  | `$inspect`                                                                                   |

```typescript
// ❌ state kept in sync by an effect
let total = $state(0);
$effect(() => {
  total = sumPrices(items);
});

// ✅ derived, in sync by construction
const total = $derived(sumPrices(items));
```

## Components

- **Props are live values.** Destructure them from `$props()` with an explicit type: `let { goals }: { goals: Goal[] } = $props()`. Anything computed from a prop uses `$derived`; a plain variable computed from a prop goes stale when the prop changes.
- **Do not mutate props.** Report changes through callback props. Use `$bindable` only for components whose purpose is a two-way value, such as a modal's `open` (`FeedbackModal.svelte`).
- **Events are callback props.** Listeners are plain attributes (`onclick={...}`), and a component tells its parent something by calling a function prop (`onselect?.(detail)`).
- **Do not call child methods through `bind:this`.** Prefer callback props or `$bindable` state; `bind:this` stays fine for DOM and MapLibre element references.
- **Content is passed as snippets.** Declare with `{#snippet}`, render with `{@render children?.()}`, and type snippet props as `Snippet<[Args]>`.
- **Key `{#each}` blocks** with a stable unique id, never the index. Some existing blocks are unkeyed (`svelte/require-each-key` is a lint-backlog warning); key the ones you write or touch.
- **`{#key}` sparingly.** It destroys and recreates its content; use it to replay transitions, not to force recomputation.
- **Styles stay scoped** and use the design tokens ([`docs/design-tokens.md`](../../docs/design-tokens.md)). Pass dynamic values with `style:--name={value}`, and let a parent theme a child through CSS custom properties (`<Child --color="red" />`). Use `:global` only to reach markup you do not own, such as MapLibre's.
- **Conditional classes** use `class:` directives, as existing components do.

## Shared State And Logic

- **Reusable reactive logic lives in a rune module** (`.svelte.ts`): a function or class that owns `$state` and exposes it. None exist yet.
- **Export state as an object or through accessors.** A `$state` variable that is reassigned cannot be exported; export an object whose properties change, a class instance with `$state` fields, or getter functions.
- **State that belongs to one user goes in context, not module scope.** This app server-renders on Workers, where module-level state is shared by every request the isolate handles, so one user's data can reach the next. Create typed context with `createContext` (Svelte 5.40+).
- **No stores.** Runes replace them, and the repo has none.
- **Pure logic stays in plain `.ts` modules** (`src/utils/`, `src/lib/map/`). Mappers, validation, and calculations use no runes and are tested without rendering.

## Runes Only

Every component is in runes mode. Do not introduce legacy syntax, in new files or changed ones. A component is in either runes mode or legacy mode, so one legacy line puts the whole file in legacy mode.

| Legacy                                                | Current                                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `let count = 0` as implicit state                     | `let count = $state(0)`                                                             |
| `$:` statements                                       | `$derived`; `$effect` only when nothing else fits                                   |
| `export let foo`, `$$props`, `$$restProps`            | `let { foo }: { foo: Foo } = $props()`, with `...rest` for the remainder            |
| `export let open` bound by the parent (`bind:open`)   | `let { open = $bindable(false) } = $props()`                                        |
| `on:click={...}`                                      | `onclick={...}`                                                                     |
| `on:click\|preventDefault={fn}`                       | `onclick={(e) => { e.preventDefault(); fn(e); }}`                                   |
| `createEventDispatcher`; parent `on:select`           | Callback prop `onselect`; parent passes `onselect={handler}`                        |
| `<slot>`, named slots, `$$slots`, `<svelte:fragment>` | `{#snippet}` and `{@render}`                                                        |
| `<svelte:component this={C}>`                         | `<C>`                                                                               |
| `<svelte:self>`                                       | Import the component into itself                                                    |
| `use:action`                                          | `{@attach ...}` for new code; framework-provided actions such as `use:enhance` stay |

These are unchanged in runes mode: `bind:this`, `bind:value`/`bind:checked` (to a `$bindable` prop or element), `onMount`/`onDestroy`, `tick()`, `{@const}`, `<svelte:head>`, `<svelte:window>`, and `<svelte:body>`.

## TypeScript

- Use `<script lang="ts">`. `vite.config.js` passes `vitePreprocess()` without `script: true`, so Svelte compiles component TypeScript itself and accepts only type-level features: no `enum`, no constructor parameter properties.
- Type component references as `Component<Props>`, and read another component's props with `ComponentProps`.
- A component that wraps a native element extends that element's attribute type from `svelte/elements` (for example `HTMLButtonAttributes`) and spreads the rest props onto it.
- Type-check with `npm run typecheck` (`svelte-kit sync && svelte-check`), which covers `.svelte` files.

## SvelteKit

- **Server code stays on the server.** Secrets, D1 access, and private environment variables live in server-only modules: files named `*.server.ts` or modules in a `server/` directory (`#lib/server/...`). SvelteKit refuses to bundle those, or `$app/env/private`, into client code. Whatever a `load` function returns is sent to the browser, so return only what the page needs.
- **Pick the `load` by what it needs.** Server `load` (`+page.server.ts`) for auth and private data, as `src/routes/admin/+page.server.ts` does. Universal `load` (`+page.ts`) for public data and fetching this app's own API, as `src/routes/+page.ts` does. Call the `fetch` that `load` receives, not the global one.
- **`load` is pure.** It returns data; it never writes to module state.
- **No waterfalls.** Start independent requests together (`Promise.all` in `src/routes/+page.ts`), and call `await parent()` after your own requests unless you need its result first.
- **Page data is reactive.** Page components are reused across navigations, so anything computed from `data` uses `$derived`: `const projects = $derived(data.projects)`.
- **Mutations are JSON endpoints.** Writes are `+server.ts` handlers under `src/routes/api/`, validated with Zod and authorized inside the handler; the repo has no form actions. Components call them with `fetch` from event handlers. Add new writes the same way, following `docs/CODING_STANDARDS.md` → API Error Handling.
- **`error()` and `redirect()` throw on their own.** `error(status, body)` takes a message string or an `App.Error` object (`{ message }`) as `body`, and SvelteKit answers it without calling `handleError`. Existing code writes `throw error(...)`, which is equivalent; match the file. If you call either, or a helper that does (`requireEditorActor`), inside `try`, the `catch` must rethrow what it does not handle, as `toHttpError` does.
- **Unexpected errors** reach `handleError`, which sees only errors that are not `error()`/`redirect()`. This repo defines no `handleError` hook, so SvelteKit logs the error with `console.error` and answers with the message "Internal Error".
- **Authorize where the data is read.** Each write handler and auth-gated server `load` calls `requireEditorActor(event, permission)` or `requireAuthenticatedIdentity(event)` itself; the factories in `src/lib/server/content/handlers.ts` already do. `hooks.server.ts` does not authorize. A guard in a layout `load` does not protect `+server.ts` endpoints and does not run on every navigation.
- **App state comes from `$app/state`** (`page`, `navigating`, `updated`; SvelteKit 2.12+). `$app/stores` is deprecated. The repo imports neither today. State that should survive a reload or be shareable goes in the URL, as the selected project does on `/`.
- **Route types come from `./$types`.** Pages use `PageData`, `PageLoad`, and `PageServerLoad`; the installed version also generates `PageProps`. API handlers in this repo are typed with `RequestHandler` from `@sveltejs/kit`; match the file.
- **Environment.** Variables come from `$env/dynamic/private` and `$env/dynamic/public` (for example `PUBLIC_MAPTILER_KEY`). Cloudflare bindings come from `event.platform.env`: `DB` (D1, through `getDb`), `WRITE_LIMITER`, `FEEDBACK_LIMITER`, and `SEND_EMAIL`. Public values are declared in `wrangler.jsonc` `vars`, and `.env.example` documents local ones.
- **Imports.** `#lib/...` (with the `.ts` extension, declared in `package.json` `imports`) and the `@/...` alias from `vite.config.js` work; SvelteKit 3 no longer provides `$lib/...`. Which style a file uses varies, so match the file (`docs/CODING_STANDARDS.md` → Legacy).

## Checks And Tooling

- After changing Svelte code, run `npm run typecheck` and `npm run lint`, and fix what they report (type errors, accessibility warnings, unused CSS) without adding to the lint backlog. Do not add `svelte-ignore` comments to get past a warning; the repo has none.
- If the session has the official Svelte tooling (the `svelte` plugin or the Svelte MCP server, both from `sveltejs/ai-tools`), run `svelte-autofixer` on each component you wrote or changed, and repeat until it reports nothing. If it is not available, do not install or `npx` it on your own; tell the user it exists.
- Prettier formats `.svelte` files through `prettier-plugin-svelte`, loaded in `.prettierrc`; run `npm run format` rather than formatting markup by hand.
