# Shared report format

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
