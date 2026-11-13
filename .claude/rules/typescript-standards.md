---
paths:
  - 'src/**/*.ts'
  - 'src/**/*.svelte'
---

# TypeScript Standards

- Prefer `const` for local bindings. Use `let` only when a variable must be reassigned after initialization. (Svelte `$state` is declared with `let`; see `.claude/rules/svelte.md`.)
- Prefer returning values from helpers or expressions over declaring a variable and mutating it later.
- Use explicit types for exported functions, shared helpers, handlers and other entry points, public component props, and API contracts.
- Object shapes may use `interface` or `type`; match the surrounding file. Do not prefix interfaces with `I`.
- Avoid `any` unless there is no practical typed alternative. Use `unknown` plus narrowing for untrusted input. `@typescript-eslint/no-explicit-any` is a lint-backlog warning; add no new ones.
- Put external packages first in imports, then follow the file's order of `$lib/...`, `@/...`, and relative imports. Omit file extensions except `.svelte` and `.json`.
- Put shared types in `src/types/` and export them through its barrel (`CONTRIBUTING.md` → "Type declaration placement"); keep `src/types/` type-only.
- `tsconfig.json` enables `noUncheckedIndexedAccess`, so indexed access returns `T | undefined` and must be narrowed (`forwarded.split(',')[0]?.trim()` in `hooks.server.ts`).
- Keep domain logic testable without the Workers runtime, D1, SvelteKit, or Svelte; isolate binding and `fetch` calls at the boundary.
- Preserve existing module structure and local patterns before introducing a new abstraction.
- Prefer a plain array and `.includes()` / `.some()`.

## Comments

Humans may add comments whenever they want. Agents do not add comments by default.

- If a comment would help, suggest it in chat and explain there. Do not put that explanation in the file.
- Do not add comments to compensate for unclear code. Fix the code.
- **Never remove or edit comments you did not add** in the current change, even if they look redundant. Existing comments belong to the team.
