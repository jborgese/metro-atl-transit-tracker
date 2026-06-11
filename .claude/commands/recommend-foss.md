---
description: Analyze what this codebase does and recommend FOSS frameworks/libraries that could replace bespoke code or fill gaps.
argument-hint: [optional capability or path to focus on]
disable-model-invocation: true
allowed-tools: Bash(gh repo view:*), Bash(gh search:*), Bash(npm view:*), Read, Glob, Grep, WebSearch, WebFetch
---

You are a pragmatic tech lead deciding where to swap in well-maintained FOSS instead of carrying bespoke code. Produce `reports/foss-recommendations-<today's date, YYYY-MM-DD>.md`. Do not modify source files. Work autonomously end-to-end.

If `$ARGUMENTS` is provided, focus the analysis on that capability or path and say so in the report's scope line.

@.claude/snippets/project-context.md

The dependency tree is deliberately small (jose, zod, maplibre-gl, tailwindcss at runtime), so expect a fair amount of hand-rolled capability. Likely candidates to inspect: auth/session handling (built on `jose`), rate limiting, GTFS/transit feed ingestion and parsing, caching layers, the D1 query layer (raw SQL vs a query builder like Drizzle, which has first-class D1 support), and OpenAPI route wiring. Constraint that shapes every recommendation: **the runtime is Cloudflare Workers** — candidates must work without Node-only APIs.

## Step 1 — Inventory what the repo *does*
Identify the major capabilities the codebase implements (e.g., HTTP routing, auth, validation, observability, retries, caching, scheduling, data ingestion, search). For each, note whether it is:
- Built on a well-known framework (SvelteKit itself covers routing/SSR).
- Glued together with smaller libs.
- Hand-rolled.

## Step 2 — Identify hand-rolled or thin-glue capabilities
For each hand-rolled capability that has a mature FOSS alternative:
- Estimate LOC under maintenance.
- Estimate test coverage of that bespoke code.
- List any signals it is buggy or stale (TODOs, recent fixes, "we should replace this" comments).

## Step 3 — Recommend candidates
For each opportunity, list 2–3 FOSS candidates with:
- **License** (MIT/Apache-2.0/BSL/AGPL — flag anything that may not be permissive).
- **Maintenance signal** — last release, GitHub stars trend, open-vs-closed issue ratio. Use `gh repo view <owner>/<repo> --json` if `gh` is available, otherwise note "verify maintenance status".
- **Workers compatibility** — verified, claimed, or unknown.
- **Why it fits this repo** — referencing a specific module or pain point.
- **Adoption cost** — rough effort estimate (S/M/L) and rollout strategy (replace, run in parallel, strangler fig).
- **Risks** — lock-in, migration cost, bundle/runtime size (Workers have CPU and size limits), transitive deps.

Bias toward libraries already in the dependency tree's neighborhood (Zod-native, SvelteKit-native, Cloudflare-native).

## Step 4 — Report
Use the shared skeleton below. Severity here reflects *opportunity magnitude*, not defect severity:
- 🟠 **High** — replacing bespoke code that is buggy, security-relevant, or actively costing dev time.
- 🟡 **Medium** — solid bespoke code but a FOSS option would reduce maintenance.
- 🟢 **Low** — minor convenience swap.

End with a top-5 prioritized adoption queue with an effort/impact matrix.

@.claude/snippets/report-format.md
