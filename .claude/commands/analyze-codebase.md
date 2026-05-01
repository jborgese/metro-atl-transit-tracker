---
name: analyze-codebase
description: Produce a structured architecture and convention overview of this repository.
disable-model-invocation: true
---

You are a senior staff engineer doing a first-week orientation for a codebase you have never seen before. Produce a `reports/codebase-analysis-$(date +%Y-%m-%d).md` file. Do not modify any source files.

## Step 1 — Plan
Before any analysis, list:
- The detected primary language(s), package manager(s), and build system(s) (run `cat package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `*.csproj`, etc. as applicable).
- The directories you will sample first.
- Whether you will dispatch subagents (recommended for repos >200 source files).

Pause and present the plan before running tools.

## Step 2 — Inventory
- Total LOC by language (use `cloc` if available; otherwise `find` + `wc -l`).
- Top-level package layout and inferred architectural style (monolith, monorepo, layered, hexagonal, microservices, etc.).
- Build/test/lint entry points (the actual scripts a new dev would run).
- Public API surface (HTTP routes, RPC contracts, exported library functions, CLI commands).
- External integrations (DBs, queues, cloud services).

## Step 3 — Conventions
- Naming, formatting, and import conventions actually observed (not what a style guide claims).
- Test pyramid shape (unit/integration/e2e ratios; framework names).
- Error handling and logging idioms.
- Configuration and secret management approach.

## Step 4 — Risk surface
- Hot files: areas with high churn (use `git log --since="6 months ago" --pretty=format: --name-only | sort | uniq -c | sort -rn | head -30`).
- Hot-and-large: correlate churn with LOC — these are top refactor candidates.
- Modules with no tests.

## Step 5 — Report
Use the shared severity rubric and report skeleton. Findings here will mostly be 🟡/🟢/ℹ️ — this is a map, not a bug report. Mark Critical only for things like missing CI, no tests at all, or vendored secrets.

End with a "Where would I start reading?" section: 5 files in suggested reading order for a new contributor.

## Severity rubric
- 🔴 **Critical** — Exploitable security flaw, data loss risk, or production-breaking bug. Ship a fix this week.
- 🟠 **High** — Significant defect, accessibility blocker, or material maintainability problem. Plan within the sprint.
- 🟡 **Medium** — Quality concern, performance issue, or technical debt with measurable cost. Schedule into the next quarter.
- 🟢 **Low** — Polish, minor consistency issues, or nice-to-have improvements. Tackle opportunistically.
- ℹ️ **Info** — Observation worth recording but not actionable on its own.

## Report skeleton
- `# <Report Title>` — H1 with the topic.
- **Header block:** Repo name, generated date (ISO), scope (files/dirs analyzed), tooling used (linters, scanners).
- **Executive summary** — 3–5 plain-language bullets a tech lead reads first.
- **Findings table** — columns: ID, Severity, Title, Location, Source.
- **Detailed findings** — one block per finding with: severity, where (path:line), evidence (snippet or tool output), why it matters, fix (concrete recommendation, ideally with example diff), reference link.
- **Recommended next steps** — ordered, ~5 items, each tied to a finding ID.
