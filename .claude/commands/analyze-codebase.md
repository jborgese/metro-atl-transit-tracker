---
description: Produce a structured architecture and convention overview of this repository.
argument-hint: [optional path to scope the analysis]
disable-model-invocation: true
allowed-tools: Bash(git log:*), Bash(git ls-files:*), Bash(npx cloc:*), Bash(find:*), Bash(wc:*), Read, Glob, Grep
---

You are a senior staff engineer doing a first-week orientation on this codebase. Produce `reports/codebase-analysis-<today's date, YYYY-MM-DD>.md`. Do not modify any source files. Work autonomously end-to-end — no plan approval needed.

If `$ARGUMENTS` is provided, limit the analysis to that path and say so in the report's scope line.

@.claude/snippets/project-context.md

## Step 1 — Inventory
- Total LOC by language (use `npx cloc .` excluding `node_modules`; fall back to `git ls-files | xargs wc -l` grouped by extension).
- Top-level package layout and inferred architectural style — pay attention to the client/server split (`src/lib/server` vs the rest) and how routes map to API endpoints.
- Build/test/lint entry points a new dev would actually run (start from the `package.json` scripts and `scripts/` directory; verify rather than assume).
- Public API surface: enumerate `src/routes/**/+server.ts` endpoints and how they relate to the generated OpenAPI spec.
- External integrations: D1, any Cloudflare bindings in `wrangler.jsonc`, and third-party data sources (e.g., transit/GTFS feeds under `data/` or fetched at runtime).

For broad sweeps (e.g., cataloguing all routes or components), dispatch parallel Explore subagents rather than reading file-by-file.

## Step 2 — Conventions
- Naming, formatting, and import conventions actually observed (not what a style guide claims). Note Svelte 5 runes usage vs legacy patterns.
- Test pyramid shape: unit (Vitest) vs smoke vs integration scripts — ratios and what each layer actually covers.
- Error handling and logging idioms, especially in `src/lib/server` and API endpoints.
- Configuration and secret management approach (`wrangler.jsonc`, `.env.example`, platform env access).

## Step 3 — Risk surface
- Hot files: high-churn areas via `git log --since="6 months ago" --pretty=format: --name-only | sort | uniq -c | sort -rn | head -30`.
- Hot-and-large: correlate churn with LOC — these are top refactor candidates.
- Modules with no tests.

## Step 4 — Report
Use the shared severity rubric and report skeleton below. Findings here will mostly be 🟡/🟢/ℹ️ — this is a map, not a bug report. Mark Critical only for things like missing CI, no tests at all, or vendored secrets.

End with a "Where would I start reading?" section: 5 files in suggested reading order for a new contributor.

@.claude/snippets/report-format.md
