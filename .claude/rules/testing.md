---
paths:
  - 'src/**/*.test.ts'
  - 'src/**/*.spec.ts'
  - 'scripts/smoke-content-api.mjs'
  - 'scripts/integration-content-api.mjs'
  - 'scripts/test-utils/**'
---

# Testing Standards (Vitest)

Apply when writing or reviewing tests. Cross-cutting principles (test logic at the lowest level, assert the observable contract, skip tests that do not prove behavior) and the layer-by-layer matrix live in `docs/CODING_STANDARDS.md` → Testing Matrix.

## General

- When running `vitest` directly, always use `npx vitest run`, which avoids watch mode.
- Unit tests are colocated next to the module as `*.test.ts` and run in Node (the `server` project in `vitest.config.ts`). Component and rune-module tests are `*.svelte.test.ts` and run in jsdom (the `client` project). Smoke and integration checks are Node scripts in `scripts/` that run against a local Wrangler worker and local D1.
- Add or update tests in the same PR as the feature or fix.
- Commands: `npm run test` (all unit tests), `npm run test -- <path>` (one file), `npm run test:coverage`, `npm run test:smoke`, `npm run test:integration`.

## What to Test

- **Do** test business logic (calculations, transformations, validation) in isolation.
- **Do** test entry-point behavior (handlers, routes): correct results for valid input, and the workflow-appropriate failure for invalid input (the HTTP status and `{ message }` body).
- **Do** test data transformations and mapping functions.
- **Do** test edge cases: null/undefined inputs, empty arrays, missing fields.
- **Avoid** testing library internals (D1, Zod, `jose`) — fake at the boundary.
- **Avoid** tests that do not prove behavior — restating source, asserting constants, or adding coverage for its own sake. If the change has no branching, mapping, or failure path to exercise, skip a new test.
- **Avoid** unit tests for trivial pass-throughs — a one-line wrapper around an existing API with no branching does not need its own test.

| Module                    | What to test                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| Utils and mappers         | Correct output for various inputs, edge cases, and error throwing                          |
| Validators                | Accepted and rejected payloads, including forbidden fields                                 |
| Handlers and routes       | Status codes, response body shape, auth and permission failures, body-size and JSON errors |
| Hooks (`hooks.server.ts`) | Headers set, redirects, and rejected requests for each branch                              |

## Mocking

- **Do** fake infrastructure at the lowest useful boundary: D1, rate-limiter and email bindings, auth, and modules that reach the network.
- **Do** use `vi.fn()` for mock functions and `vi.spyOn()` for spying.
- **Avoid** over-mocking — prefer testing real business logic with mocked infrastructure boundaries.
- **Avoid** mocking internal utilities or external libraries unless needed to isolate the behavior under test.

### Handler and route tests

The repo's handlers come in two shapes, and each has its own test pattern:

- **Handler factories** (`makeCollectionHandlers(store)` and siblings in `src/lib/server/content/handlers.ts`): pass a fake store whose methods are `vi.fn()`. Mock only auth with `vi.mock('$lib/server/auth/editor')`. See `handlers.test.ts`.
- **Hand-written `+server.ts` handlers**: `vi.mock` the domain modules they import, then `await import('./+server')`. Pass a hand-built `RequestEvent` whose `platform.env` holds a fake `DB` and limiter where the handler reads them. See `src/routes/api/feedback/feedback.test.ts` and `src/routes/api/me/me.test.ts`.
- Declare mock functions with `vi.hoisted` so they exist when the hoisted `vi.mock` factory runs.
- **Do** reset mocks in `beforeEach` (`mockClear()` plus a default `mockImplementation`, or `vi.clearAllMocks()`), so cases do not share state.

A factory test has this shape; `makeEvent` builds a minimal `RequestEvent`, as in `handlers.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireEditorActor = vi.hoisted(() => vi.fn(async () => 'tester@example.test'));
vi.mock('$lib/server/auth/editor', () => ({ requireEditorActor }));

const { makeCollectionHandlers } = await import('./handlers');

beforeEach(() => {
  requireEditorActor.mockClear();
});

it('returns the list with a count', async () => {
  const store = { list: vi.fn(async () => [{ id: 'a' }]), create: vi.fn() };
  const { GET } = makeCollectionHandlers(store);
  const res = await GET(makeEvent());
  expect(await res.json()).toEqual({ data: [{ id: 'a' }], meta: { count: 1 } });
});
```

## Structure And Assertions

- Use `describe` / `it` blocks with names that explain behavior, not implementation. Structure each test as arrange-act-assert.
- Group tests by scenario or function under test.
- Prefer one `toEqual` on the whole object/array over a run of single-property checks — it documents the full shape and catches unexpected properties. Use `toMatchObject` for partial matches.
- Assert separate concerns individually (status code, headers, and body are different concerns).
- Combine assertions that share the same setup and describe one behavior; do not write three tests with identical setup to check three fields of the same output. Keep tests separate when inputs, scenarios, or interactions differ.

```typescript
// ✅
expect(result).toEqual({ status: 'planning', county: 'cobb', isArchived: false });

// ❌
expect(result.status).toBe('planning');
expect(result.county).toBe('cobb');
expect(result.isArchived).toBe(false);
```

## Avoiding Flaky Tests

- **Avoid** tests that depend on execution order or shared mutable state.
- **Avoid** tests that rely on timing or speed of execution.
- **Do** clean up mocks and side effects in `beforeEach` or `afterEach`.
- **Do** use `async/await` correctly for asynchronous assertions.

## Svelte UI

Component tests use `@testing-library/svelte` in jsdom. Name the file `<Component>.svelte.test.ts` next to the component; `src/components/svelte/FeedbackModal.svelte.test.ts` is the reference.

- **Do** move logic out of the component before testing it, into a pure `.ts` module (`src/utils/`, `src/lib/map/`), and test that module. Render a component to test what a visitor sees and does: rendered states, form flows, the request a submit sends.
- **Do** query by role and label (`getByRole`, `getByLabelText`), and drive the component with the `fireEvent` helpers from `@testing-library/svelte`, which wait for Svelte to update.
- **Do** stub `fetch` with `vi.stubGlobal` (undo it with `vi.unstubAllGlobals()` in `afterEach`) and assert the request the component sends, not its internal state.
- jsdom has no layout, canvas, or WebGL, so MapLibre does not run there. Test map logic in `src/lib/map/` as plain TypeScript, check map behavior manually with `npm run dev`, and say in the PR what you checked.
- Rune modules (`.svelte.ts`) use the same `*.svelte.test.ts` naming, so Svelte compiles the runes in them. Wrap code that creates effects in `$effect.root`, call `flushSync()` before asserting, and call the cleanup function it returns.
