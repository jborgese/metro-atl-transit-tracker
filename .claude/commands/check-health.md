---
description: Score the maintainability of the repo and surface technical debt with evidence.
argument-hint: [optional path to scope the audit]
disable-model-invocation: true
allowed-tools: Bash(npx eslint:*), Bash(npx madge:*), Bash(npx depcheck:*), Bash(npx ts-prune:*), Bash(npx jscpd:*), Bash(npm outdated:*), Bash(npm run test:coverage:*), Bash(npm run check:*), Read, Glob, Grep
---

You are running a code health audit. Produce `reports/health-<today's date, YYYY-MM-DD>.md`. Do not modify source files. Work autonomously end-to-end.

If `$ARGUMENTS` is provided, limit the audit to that path and say so in the report's scope line.

@.claude/snippets/project-context.md

## Step 1 — Run the scanners
Use the project's own gates first — they are ground truth:
- `npm run check` (svelte-check/typecheck) — any errors are findings.
- `npx eslint . --format json` — note that `npm run lint` passes with up to **140 warnings**; the size and composition of that warning backlog is itself a debt signal worth tabulating by rule.
- `npm run test:coverage` — report % by directory.
- `npm run schema:check` — D1 schema drift.

Then the generic scanners:
- `npx madge --circular src` (circular dependencies)
- `npx depcheck` (unused dependencies)
- `npx ts-prune` (unused exports; expect some false positives from SvelteKit's generated entry points — filter those out)
- `npx jscpd src` (duplication)
- `npm outdated --json` (dependency freshness)

These scanners are independent — run them in parallel (background Bash or subagents). If a tool is not installed and `npx` cannot fetch it, document the gap as an Info-level finding and continue with what is available.

## Step 2 — Metrics
Capture and tabulate:
- **Cyclomatic complexity** — top 20 functions by complexity. Flag anything >15 as 🟡, >25 as 🟠.
- **File size** — top 20 files by LOC (include `.svelte` files). Flag >500 LOC as 🟡, >1000 as 🟠.
- **Duplication** — flag >5% duplication as 🟡.
- **Dead code** — unused exports, unreferenced files, unused dependencies.
- **Circular dependencies** — any cycle is at minimum 🟡.
- **Test coverage** — % by package; call out untested code in `src/lib/server` specifically, since that's the API/data layer.
- **Dependency freshness** — count of outdated direct dependencies, with those >1 major version behind highlighted as 🟠.
- **TODO/FIXME/HACK density** — `rg -c '(TODO|FIXME|HACK|XXX)'` per directory.

## Step 3 — Report
Use the shared rubric below. Each finding must include the actual tool output or file:line evidence. Group findings by category (Complexity, Duplication, Dependencies, Tests, Dead code, Comments-as-debt).

End with a **Maintainability Index estimate** (Excellent/Good/Fair/Poor) with a one-paragraph justification, and a **top 5 highest-ROI fixes** list ranked by (impact ÷ effort).

@.claude/snippets/report-format.md
