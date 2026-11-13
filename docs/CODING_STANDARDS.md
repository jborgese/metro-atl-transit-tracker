# Coding Standards

**Audience:** engineers and AI agents implementing features in this repo.

**Purpose:** capture established, repeated repo patterns so new work follows the system we already have instead of inventing parallel conventions.

This is a standards guide, not a claim that every legacy file already follows these patterns. Existing one-offs and older patterns are called out in **Legacy And Intentional Inconsistencies**.

## How To Use This

### Precedence

1. The user's request, or a spec for the task in `docs/specs/`.
2. This file for cross-cutting coding patterns.
3. Area-specific rules: `.claude/rules/*.md`.
4. Agent prompts (such as the `final-reviewer` agent) for workflow, not normative coding style.
5. Skills for specialized domains.

Agent-specific guidance stays in that agent's own files: area rules in `.claude/rules/`, Claude Code notes in `CLAUDE.md`. Type placement lives in [`CONTRIBUTING.md`](../CONTRIBUTING.md); styling tokens live in [`docs/design-tokens.md`](design-tokens.md).

### Canonical References

| Surface | Default anchors | Specialized or legacy anchors |
|---------|-----------------|-------------------------------|
| CRUD API endpoint | `src/routes/api/projects/+server.ts` wiring `makeCollectionHandlers` from `src/lib/server/content/handlers.ts` | `src/routes/api/feedback/+server.ts`: public, unauthenticated write with its own limiter; `src/routes/api/me/+server.ts`: hand-written handlers |
| Server domain module | `src/lib/server/content/` (validators → service → repository; `store.ts` is its public barrel) | `src/lib/server/feedback/`: smaller and flatter, reuses `getDb` from `content/repository.ts` |
| Auth | `src/lib/server/auth/editor.ts` (`requireEditorActor`, `requireAuthenticatedIdentity`) | — |
| Page data | `src/routes/+page.ts`: universal `load` with SvelteKit `fetch` and a static fallback | `src/routes/admin/+page.server.ts`: auth-gated server `load` |
| Component | `src/components/svelte/FeedbackModal.svelte`: runes, `$bindable` prop, `Portal`, POST to the API | `src/routes/admin/+page.svelte`, `src/components/svelte/GoalsTable.svelte`: oversized, see Legacy |
| Map | `src/lib/map/` (`initMetroMap.ts` and layer helpers) | MapLibre lifecycle in `src/components/svelte/MetroMap.svelte` |
| Shared types | `src/types/<domain>.ts` + barrel `src/types/index.ts` | `src/components/svelte/types.ts`, `src/lib/map/types.ts`: local types, see Legacy |
| Migration | `migrations/d1/0003_feedback.sql` | — |
| Styles | Tokens in `src/styles/global.css` ([`design-tokens.md`](design-tokens.md)) | Status colors in `src/utils/statusHelpers.ts` |

## Universal Standards

- Open the canonical reference for the layer you are touching.
- Copy the file layout, naming, and test shape from the nearest sibling feature.
- Check shared modules before writing a new helper: `src/utils/`, `src/types/`, `src/lib/map/`, and `src/lib/server/content/http.ts` (request parsing, error mapping).
- Extend shared modules only when reuse is real and the change is within scope. Ask before changing the public API's routes or response shapes.
- Keep the smallest diff that satisfies the task. Do not drive-by refactor legacy code.
- Shared services and components serve every consumer. Do not add consumer-specific branches to them; put consumer-specific behavior in the consumer, or extend the service through a generic mechanism (e.g. a strategy parameter).
- Encapsulate domain rules where every client can reuse them (e.g. which permissions a role grants). Clients ask for the result; they do not re-derive the rule.

### Functional Style

We favor a functional programming style. Most other guidance in this file falls out of these fundamentals:

- Write short, declarative functions with no side effects. Break large functions into small, readable, individually testable units.
- Avoid mutable variables. Prefer `const`, expressions, and returning new values over declaring and mutating. Svelte `$state` is the exception; see `.claude/rules/svelte.md`.
- Avoid imperative loops for data transforms. Prefer `map`/`filter`/`flatMap`. (`for...of` with `await` is still fine for ordered, sequential side effects such as migrations.)
- Handle "zero, one, or many" as a list, not a branch. Build the list of work (a one-item list for the default case) and run one pipeline over it (`map` → `Promise.all` → `flat`). Don't branch on `length` or special-case a single item:

  ```typescript
  // ❌ special-cases one item
  const linked = ids.length === 1 ? await findLinked(ids[0]) : (await Promise.all(ids.map(findLinked))).flat();

  // ✅ one pipeline over the list
  const linked = (await Promise.all(ids.map(findLinked))).flat();
  ```

- Keep side effects (D1 queries, bindings, network, IO) at the boundary; keep domain logic pure.

### TypeScript

See `.claude/rules/typescript-standards.md` for the full rule.

| Topic | Standard |
|-------|----------|
| Bindings | Prefer `const` in new code. Use `let` only for actual reassignment. Do not churn unrelated legacy lines that still use `let`. |
| Types | Explicit types on exports, handlers, public props, and API contracts. `tsconfig.json` enables `noUncheckedIndexedAccess`. |
| Object shapes | `interface` or `type` — match the surrounding file. No `I` prefix. |
| Unknown input | Prefer `unknown` plus narrowing over `any`. Do not spread loosely typed legacy shapes (e.g. `Record<string, any>` blobs) into new code. |
| Imports | External packages first; then match the file's order of `$lib/...`, `@/...`, and relative imports. Omit file extensions except `.svelte` and `.json`. |
| Domain logic | Keep business rules testable without the Workers runtime, D1, SvelteKit, or Svelte. |
| Collections | Prefer a plain array and `.includes()` / `.some()`. |

### Write For Human Reviewers

Every diff is read by a person before it merges. Optimize for their time:

- **Do** name functions for what they do or return — a reader should predict the output from the name (`getRelatedGoals`, `parseIncludeArchived`, `isRecord`). **Don't** use vague verbs like `handle`, `process`, or `manage` unless dispatching is genuinely all the function does.
- **Agents:** don't add comments by default. Suggest them in chat if one would help. **Humans** may comment whenever they want. Full policy: `.claude/rules/typescript-standards.md`.
- **Don't** add defensive code for states that cannot happen: `try/catch` around calls that should fail loudly, `??`/`?.` fallbacks on values the types guarantee, or validation of trusted internal inputs. Validate at system boundaries (user input, external APIs) only. Invariants you can rely on:
  - A rule enforced once (form validation, service check, domain hook) does not need repeating in every layer.
  - A prop or param with exactly one caller is required, not optional.
  - Handlers built by the factories in `src/lib/server/content/handlers.ts` already call `requireEditorActor` for writes; do not re-check auth in endpoints built on them.
  - `requireEditorActor` either returns the actor or throws 401/403/503; do not null-check its result.
  - `readJsonBody` (`src/lib/server/content/http.ts`) already rejects empty, oversized (64 KB), and invalid-JSON bodies.
  - Service functions take `unknown` input and parse it with the domain's Zod helpers (`createProject` calls `toProjectCreate`). Code after that parse works with typed values; do not re-validate them.
- **Do** fail loudly on unexpected input. Throw (or return a 4xx at an API boundary) instead of defaulting, synthesizing placeholder values, or returning an empty result that hides the problem.
- **Don't** leave AI tells: JSDoc blocks on internal helpers, `// Step 1:` scaffolding comments, options/params nothing passes, re-exported aliases, or dead branches "for future use." If a reviewer would ask "why is this here?", remove it.

### Function And File Size

Line counts are signals, not rules. Split when a unit becomes hard to review or mixes responsibilities.

- The bright line: if a function needs a section comment to stay readable, extract a named helper instead — that is a trigger, not a judgment call. Past roughly 30–40 lines, assume the function is doing more than one job.
- One responsibility per function. Name each extracted helper for its output so call sites read as a sentence.
- Thin entry points (`+server.ts` handlers, `load` functions) are often under about 50 lines; most API routes here are a single line that wires a handler factory.
- Integration modules may exceed 200 lines when they keep one coherent responsibility.
- UI pages can be larger than components, but new flows should extract child components, `.ts` helpers, and submit functions instead of growing one page indefinitely.
- Tests may be longer than production files when they cover handler paths or UI states.

## Layer Standards

### Backend

The backend is SvelteKit `+server.ts` endpoints and server `load` functions running on Cloudflare Workers. There are no queue consumers or scheduled handlers. Server code lives in `src/lib/server/<domain>/`. D1 comes from `getDb(event)` in `src/lib/server/content/repository.ts`; other bindings come from `event.platform.env`.

- Keep handlers thin: parse input, call domain logic, format the response. Domain logic lives in functions that take typed inputs, return typed outputs, and are testable without the Workers runtime.
- Get D1 through `getDb(event)` instead of reading `platform.env.DB` in new handlers.
- Mappers and transforms are pure functions, not classes (`src/lib/server/content/mappers.ts`).
- Grow file layout on demand: start in the entry file; when it is hard to review, extract domain-named siblings; move to `{domain}/` folders only when a cohesive domain or external API appears. Do not create domain folders or many sibling files upfront.
- Error strategy follows the workflow: throw contextual errors where failure should stop the flow; log, continue, and isolate partial failures in best-effort paths (feedback email delivery logs the failure and still returns 201); otherwise match the result shape of sibling handlers in the same workflow.
- Log failures with enough context to debug them, without logging secrets or sensitive payloads.

### Infrastructure

There is no infrastructure-as-code tool. Cloudflare configuration is `wrangler.jsonc`: production at the top level, staging under `env.staging`. It holds the `DB` (D1), `SEND_EMAIL`, `WRITE_LIMITER`, and `FEEDBACK_LIMITER` bindings and the public `vars`. Changes to it need approval (`AGENTS.md` → Ask before).

- Read environment-specific values from `$env/dynamic/*` or `event.platform.env`, not literals. `hooks.server.ts` is an intentional exception; see Legacy.
- Renaming a binding or changing a `database_id` repoints live resources; treat it as a production change.

### UI

Svelte 5 components in runes mode live in `src/components/svelte/`, and pages live in `src/routes/`. Pages wrap themselves in `src/layouts/BaseLayout.svelte`. Styling is Tailwind 4 utilities plus scoped `<style>` blocks that use the tokens in `src/styles/global.css` ([`design-tokens.md`](design-tokens.md)). There is no component library. Modals render through `src/components/svelte/Portal.svelte`.

Design-quality review criteria live in `.claude/rules/design-review.md`, and Svelte specifics in `.claude/rules/svelte.md`. The cross-cutting rules:

- **Thin pages.** Keep page shells thin; extract child components, pure `.ts` helpers, and submit functions.
- **Pure helpers.** Data transforms are pure functions in their own module, testable without rendering (`src/utils/projectRelations.ts`, `src/lib/map/`).
- **One styling approach.** Tailwind utilities and token-based scoped styles; do not introduce another (CSS modules, a CSS-in-JS library, a second framework). No inline styles except rare layout cases; pass dynamic values with `style:--name`.
- **API calls out of markup and effects.** Page data loads in a `load` function with the `fetch` it receives. Writes and on-demand reads call the JSON API with `fetch` from event handlers or `onMount`, as `FeedbackModal.svelte` and the admin page do. There is no shared API client or error-monitoring service.
- **Types.** Domain types are hand-written in `src/types/content.ts`, and the Zod schemas live in each domain's `validators.ts`; nothing infers one from the other, so change both together. Component-local prop types may stay in the component.
- **Derived values, not effects.** Compute read-only values with `$derived` or a pure helper, never with an `$effect` that assigns.
- **Stacking.** There is no z-index scale yet. Read the values the existing overlays use (`Portal.svelte` and the modals) before picking one, and do not add a new tier without need.

## APIs And Data

### API Error Handling

Handlers are SvelteKit `+server.ts` functions. Domain code throws `ContentStoreError(status, message)` from `src/lib/server/content/errors.ts`. There is no central error middleware and no `handleError` hook.

- Throw `ContentStoreError` with the HTTP status for expected failures in domain code; auth helpers throw SvelteKit `error()` directly.
- Wrap each handler body in `try { ... } catch (err) { toHttpError(err); }`. `toHttpError` (`src/lib/server/content/http.ts`) converts a `ContentStoreError` to SvelteKit `error()` and rethrows anything else, including SvelteKit's own `error()` and `redirect()`.
- Error bodies are `{ message }`. The `ErrorResponse` schema in `src/lib/server/openapi/spec.ts` documents the shape.

### API Layering

| Layer | Responsibility | Here |
|-------|----------------|------|
| Route handlers | Parse/validate the request, call a service, shape the response. No DB calls or heavy business logic. | `src/routes/api/**/+server.ts`, usually wiring a factory from `handlers.ts` |
| Handler factories | Shared GET/POST/PATCH/DELETE/restore handlers over a store, with auth and body parsing | `src/lib/server/content/handlers.ts` |
| Services | Business logic and orchestration (seeding, history events, archive rules) | `src/lib/server/content/service.ts`, exposed through `stores.ts` |
| Data modules | SQL constants, queries, batching | `src/lib/server/content/repository.ts`, `src/lib/server/feedback/store.ts` |
| DB client | The D1 binding | `getDb(event)` in `repository.ts` |
| Hooks | `www` redirect, security headers, cross-origin write rejection, write rate limit; no authorization | `src/hooks.server.ts` |
| Auth | Access JWT verification and RBAC, called inside each handler | `src/lib/server/auth/editor.ts` |
| Validation | Request schemas (Zod), parsed inside the service and also registered in the OpenAPI spec | `src/lib/server/<domain>/validators.ts`, `src/lib/server/openapi/spec.ts` |

`/api/me` and `/api/history` are hand-written and call the domain modules directly. Outside `src/lib/server/content/`, import from `store.ts` (the content barrel) or the specific module a sibling route already uses.

### Data Access

- Data-access modules take domain objects and IDs, never storage-specific keys, so the backing store can change without touching callers. Keep key construction inside the data layer.
- A table set with an owning data module gets its new queries there, not in a consumer.
- SQL user values are always bound parameters (`.bind()` with `?1`-style placeholders); dynamic fragments are for structure only. Do not add interpolated filters.
- Persisted models hold persisted data. Form-only fields belong on the UI form type; display copy and UI-only helpers stay in the UI.
- Content writes go through the service so every change appends a `content_history` event. D1 triggers reject updates and deletes on `content_history`.

### Migrations

Migrations are `migrations/d1/NNNN_description.sql`, zero-padded and sequential (`0001_init_content_schema.sql`, `0003_feedback.sql`). Wrangler applies them in filename order. There is no generator. Apply them locally with `npm run d1:migrate:local`, and verify with `npm run schema:check`.

- Schema changes go in a new migration file; do not edit an applied migration.
- When a migration adds a table, index, or trigger the app depends on, add it to `expectedObjects` in `scripts/check-d1-schema.mjs`.
- Seed content is not a migration. `data/content/*.json` loads only into an empty database (`src/lib/server/content/seeding.ts`); live content changes go through the admin editor or the API.
- Against production D1, prefer targeted or conditional writes, and ask first (`AGENTS.md` → Ask before).

## Testing Matrix

| Layer | Runner | Location | Mock at |
|-------|--------|----------|---------|
| Server modules (handlers, validators, mappers, OpenAPI spec) | Vitest in Node (`npm run test`) | Colocated `src/lib/server/**/*.test.ts` | `vi.mock` on `$lib/server/...` boundaries such as `auth/editor`; fake stores passed to the handler factories |
| API routes | Vitest | Colocated `src/routes/api/**/<name>.test.ts` | `vi.mock` on domain modules; a hand-built `RequestEvent` with a fake D1 and limiter in `platform.env` |
| Hooks | Vitest | `src/hooks.server.test.ts` | Hand-built `RequestEvent` |
| Smoke | Node script + local Wrangler worker | `scripts/smoke-content-api.mjs` | Nothing; real local worker and local D1 |
| Integration | Node script + local Wrangler worker | `scripts/integration-content-api.mjs` | Nothing |
| Schema | Node script | `scripts/check-d1-schema.mjs` | Nothing |
| Components | None; there is no component-test harness | — | — |

For what to test and how, use `.claude/rules/testing.md`.

Cross-cutting principles, whatever the layer:

- **Test logic at the lowest level.** Extract mappers, calculations, and branching into pure functions and test those directly. Do not render a component or invoke a handler just to reach logic that could be a testable util.
- **Assert the observable contract, not the implementation.** Tests should survive a refactor that preserves behavior. Avoid asserting internal call sequences, private state, or intermediate shapes the caller never sees.
- **Small functions make cheap tests.** If a unit is hard to test, that is usually a size/coupling signal — split the function rather than building elaborate test setup around it.
- **Skip tests that do not prove behavior.** Do not add a test just because code changed. If it only restates source, would pass whether or not anything works, or would not catch a regression a reviewer cares about, leave it out.
- **Import, don't copy.** Tests import the code under test from its source module; never paste a copy of production logic into a test file. Delete skipped tests and tests for removed code in the same change.

## Legacy And Intentional Inconsistencies

Agents should read this section before copying a nearby file.

When no row covers the case: match the file or folder you are editing, use the canonical reference for new files, and do not migrate legacy code outside the task's scope.

| Area | Existing inconsistency | What to do |
|------|------------------------|------------|
| Lint ceiling | `npm run lint` runs with `--max-warnings=140`, but [`ci-gate-policy.md`](ci-gate-policy.md) says lint passes with zero warnings. The ceiling was raised to absorb the runes migration and `no-useless-assignment` false positives on `$:` ([`reports/action-plan-2026-05-01.md`](../reports/action-plan-2026-05-01.md)). That migration is done. Several rules are demoted to `warn` as a backlog in `eslint.config.cjs` (`svelte/require-each-key`, `svelte/no-navigation-without-resolve`, `@typescript-eslint/no-explicit-any`, and others). | Add no new warnings, and do not raise the ceiling. Lowering it and promoting the backlog rules is a separate PR. |
| Import aliases | Three styles coexist. Routes and server code import `src/lib` as `$lib/...`. `@/...` (an alias for `src/` in `svelte.config.js`) is used for `src/types` and `src/utils`. Components reach `src/lib/map`, other components, and layouts by relative path (`../../lib/map/initMetroMap`, `../../layouts/BaseLayout.svelte`), and `validators.ts` imports seed JSON through deep relative paths. | Match the file you are editing; in a new file, copy its nearest sibling. Do not rewrite existing imports. |
| CI vs local gate | `.github/workflows/ci-gates.yml` does not run `npm run test` (Vitest); `npm run ci:gate` does. CI does run the integration test, which `ci:gate` leaves to `ci:gate:full`. | Run `npm run test` locally. Changing the workflow is a separate, approved change. |
| Formatting | Prettier 3 is installed with no config, no format script, and no `prettier-plugin-svelte`. Most code uses single quotes and semicolons, while `src/lib/map/` and `MetroMap.svelte` use double quotes. Prettier's defaults use double quotes, so the agent-guardrails Prettier-on-edit hook (Claude Code) requotes every single-quoted `.ts` file it touches. It leaves `.svelte` files alone because no parser is configured for them. | Match the surrounding file by hand. If a formatter rewrites lines you did not change, tell the user instead of committing the churn. |
| Type placement | `CONTRIBUTING.md` makes `src/types/` canonical for shared types. `src/components/svelte/types.ts` and `src/lib/map/types.ts` hold local types. | Put new shared types in `src/types/`; leave the local files alone. |
| Oversized components | `src/routes/admin/+page.svelte` (~1,500 lines) and `src/components/svelte/GoalsTable.svelte` (~970 lines) predate the size guidance. | Do not grow them. Put new sections in child components or `.ts` helpers within the task's scope; no drive-by splits. |
| Hardcoded host and limits | `src/hooks.server.ts` hardcodes the apex host (`maitai.observer`) and mirrors the `WRITE_LIMITER` limit (30 per 60 s) for response headers. | Keep these values in step with `wrangler.jsonc` when either changes. |
| `public/` vs `static/` | SvelteKit serves `static/`. `public/` is gitignored apart from two tracked favicons. `scripts/build-org-logos.js` still reads `public/logos` and `public/data/geo/`, and the README repeats `public/logos`. A fresh clone has neither; `static/` holds those files. | Put served assets in `static/`. Expect `npm run build:org-logos` to need a path fix before it runs. |
| Workers test pool | `@cloudflare/vitest-pool-workers` is installed, but `vitest.config.ts` does not use it, so unit tests run in Node and get no real D1. | Fake D1 and bindings in a hand-built `RequestEvent`, as the route tests do. Real D1 coverage belongs in the smoke and integration scripts. |
| z-index | Overlays use per-file values from `z-40` up to `200000`; there is no scale. | Reuse an existing overlay's value; propose a scale in its own change. |

## Anti-Patterns

| Avoid | Do instead |
|-------|------------|
| A new `+server.ts` with inline CRUD logic for a content type | The `make*Handlers(store)` factories in `handlers.ts` |
| New fat handlers with D1 queries and domain logic inline | Queries in the domain's data module, logic in testable helpers under `src/lib/server/<domain>/` |
| Reading `platform.env.DB` inline in new code | `getDb(event)` |
| Authorization only in `hooks.server.ts` or a layout `load` | `requireEditorActor` / `requireAuthenticatedIdentity` inside each handler and server `load` |
| Writing content tables directly, or touching `content_history` rows | The content service, which appends the history event |
| Hardcoded environment values (URLs, resource IDs, addresses) | `$env/dynamic/*` and `event.platform.env` |
| String-interpolated SQL with user input | `.bind()` parameters and the query helpers in `repository.ts` |
| Hex literals or a second styling approach | Tailwind utilities and the tokens in `src/styles/global.css` |
| Copying a legacy feature as the scaffold for new work | The canonical reference for that layer |
| Production `data-testid` by default | Accessible names and semantic structure first |
| Unconditional data overwrites in production D1 | Targeted or conditional writes, approved first |
| Legacy Svelte syntax (`export let`, `$:`, `on:`, `<slot>`) | Runes; see `.claude/rules/svelte.md` |

## Quick Copy-From Index

### Backend

- `src/lib/server/content/handlers.ts` - shared endpoint factories with auth, body parsing, and error mapping
- `src/lib/server/content/http.ts` - `readJsonBody`, `toHttpError`, query-param parsing
- `src/lib/server/auth/editor.ts` - Access JWT verification, RBAC, `requireEditorActor`
- `src/routes/api/me/+server.ts` - hand-written GET/PUT handler with auth and validation
- `src/routes/api/feedback/+server.ts` - public write with a honeypot, its own rate limiter, and best-effort email

### APIs And Data

- `src/lib/server/content/validators.ts` - Zod create/patch schemas and forbidden-field checks
- `src/lib/server/content/repository.ts` - bound-parameter SQL and `getDb`
- `src/lib/server/openapi/spec.ts` - registering schemas and routes in the OpenAPI 3.1 spec
- `migrations/d1/0003_feedback.sql` - a recent, self-contained migration

### UI

- `src/components/svelte/FeedbackModal.svelte` - runes, `$bindable` prop, `Portal`, form submit to the API
- `src/routes/+page.ts` and `src/routes/+page.svelte` - universal `load` with fallback; page data through `$props()` and `$derived`
- `src/lib/map/initMetroMap.ts` - MapLibre setup kept out of components
- `src/utils/statusHelpers.ts` - shared status colors used by SVG and Svelte consumers

### Tests

- `src/lib/server/content/handlers.test.ts` - handler factories with a fake store and `vi.mock` on auth
- `src/routes/api/feedback/feedback.test.ts` - route test with a fake D1 and limiter in `platform.env`

## Maintenance

When conventions change:

1. Update the area-specific rule if detailed examples live there.
2. Update this file only when the pattern is cross-cutting or belongs in the canonical copy-from index.
3. Keep `AGENTS.md` focused on commands, boundaries, and routing.
4. Keep `.claude/rules/coding-standards.md` as a short always-applied pointer, not a duplicate of this file.
