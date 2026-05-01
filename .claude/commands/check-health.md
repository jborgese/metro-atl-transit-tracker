---
name: check-health
description: Score the maintainability of the repo and surface technical debt with evidence.
disable-model-invocation: true
---

You are running a code health audit. Produce `reports/health-$(date +%Y-%m-%d).md`. Do not modify source files.

## Step 1 — Detect ecosystem & install scanners
Detect language(s), then prepare scanner commands. Examples:
- **JS/TS:** `npx eslint . --format json`, `npx madge --circular .`, `npx depcheck`, `npx ts-prune`, `npm outdated --json`.
- **Python:** `ruff check . --output-format=json`, `vulture .`, `pip list --outdated --format=json`, `radon cc -j .`.
- **Go:** `go vet ./...`, `staticcheck ./...`, `go list -u -m all`.
- **Rust:** `cargo clippy --message-format=json`, `cargo outdated`, `cargo udeps`.
- **Java/Kotlin:** `./gradlew dependencyUpdates` or `mvn versions:display-dependency-updates`, plus SpotBugs/Detekt if configured.

If a tool is not installed, document the gap as an Info-level finding and continue with what is available.

## Step 2 — Metrics
Capture and tabulate:
- **Cyclomatic complexity** — top 20 functions by complexity. Flag anything >15 as 🟡, >25 as 🟠.
- **File size** — top 20 files by LOC. Flag >500 LOC as 🟡, >1000 as 🟠.
- **Duplication** — use `jscpd` if available, otherwise grep for repeated blocks. Flag >5% duplication as 🟡.
- **Dead code** — unused exports, unreferenced files.
- **Circular dependencies** — any cycle is at minimum 🟡.
- **Test coverage** — run the project's coverage script if present; report % by package.
- **Dependency freshness** — count of outdated direct dependencies, with the count of those >1 major version behind highlighted as 🟠.
- **TODO/FIXME/HACK density** — `rg -c '(TODO|FIXME|HACK|XXX)'` per directory.

## Step 3 — Report
Use the shared rubric. Each finding must include the actual tool output or file:line evidence. Group findings by category (Complexity, Duplication, Dependencies, Tests, Dead code, Comments-as-debt).

End with a **Maintainability Index estimate** (Excellent/Good/Fair/Poor) with a one-paragraph justification, and a **top 5 highest-ROI fixes** list ranked by (impact ÷ effort).

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
