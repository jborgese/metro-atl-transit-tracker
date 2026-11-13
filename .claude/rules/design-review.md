---
paths:
  - "src/**/*.svelte"
  - "src/routes/**/+page.ts"
  - "src/components/**/*.ts"
  - "src/lib/map/**/*.ts"
  - "src/utils/**/*.ts"
---

# Design-First Code Principles

Apply when writing or reviewing UI code: Svelte components and pages, page `load` functions, map helpers, and the shared helpers they call. Evaluate changes on design quality and change economics, not cosmetic cleanliness. Svelte-specific rules live in `.claude/rules/svelte.md`.

**Primary question:** Does this change make the system easier or harder to evolve?

## Evaluation Criteria

1. **State ownership and locality**: Is state owned at the lowest reasonable level?
2. **Separation of UI from business logic**: Can logic run without rendering?
3. **Component responsibility clarity**: Does each component have one clear purpose?
4. **Coupling and dependency direction**: Are components coupled by intent or structure?
5. **Change locality**: How many files change when requirements evolve?

## Red Flags To Avoid

### Critical

- Business logic inside component markup or in event handlers that also render
- State duplicated across multiple components
- `fetch` calls scattered through markup or `$effect` blocks — load page data in a `load` function, and call the API from event handlers, `onMount`, or a submit function
- Business rules coupled to the router or to component lifecycle

### Major

- Prop drilling through 3+ levels of components when context would be clearer
- State lifted to a parent when only one child needs it
- Components tightly coupled to parent state shape
- Boolean flag explosions controlling behavior
- Conditional logic for one feature scattered across many components

## Positive Patterns To Follow

- **State owned at the appropriate level** — a modal keeps its form fields and submit status in local `$state`, and exposes only `open` as a `$bindable` prop (`src/components/svelte/FeedbackModal.svelte`).
- **Pure business logic extracted from components** — relationships and status colors live in plain `.ts` modules testable without rendering (`src/utils/projectRelations.ts`, `src/utils/statusHelpers.ts`).
- **Third-party lifecycle kept out of markup** — MapLibre setup lives in `src/lib/map/` as plain functions that `MetroMap.svelte` calls from `onMount`.

## Key Questions

When writing or reviewing code, ask:

1. Where is state owned? Does it belong there?
2. Can core logic be tested without rendering a component?
3. If requirements change, how many files need updates?
4. Am I depending on stable abstractions or volatile implementation details?
5. Did I reduce complexity, or just move it to different files?
