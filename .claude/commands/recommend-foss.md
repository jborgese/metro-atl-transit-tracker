---
name: recommend-foss
description: Analyze what this codebase does and recommend FOSS frameworks/libraries that could replace bespoke code or fill gaps.
disable-model-invocation: true
---

You are a pragmatic tech lead deciding where to swap in well-maintained FOSS instead of carrying bespoke code. Produce `reports/foss-recommendations-$(date +%Y-%m-%d).md`. Do not modify source files.

## Step 1 — Inventory what the repo *does*
Identify the major capabilities the codebase implements (e.g., HTTP routing, auth, background jobs, validation, observability, feature flags, retries, caching, file uploads, WebSocket, search, scheduling, state machines). For each, note whether it is:
- Built on a well-known framework (e.g., Express, FastAPI, Spring, Actix).
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
- **Why it fits this repo** — referencing a specific module or pain point.
- **Adoption cost** — rough effort estimate (S/M/L) and rollout strategy (replace, run in parallel, strangler fig).
- **Risks** — lock-in, migration cost, runtime size, transitive deps.

Bias toward libraries that are already in the dependency tree's neighborhood (e.g., if the project uses Pydantic, prefer FastAPI ecosystem libs).

## Step 4 — Report
Use the shared rubric, but here severity reflects *opportunity magnitude*:
- 🟠 **High** — replacing bespoke code that is buggy, security-relevant, or actively costing dev time.
- 🟡 **Medium** — solid bespoke code but a FOSS option would reduce maintenance.
- 🟢 **Low** — minor convenience swap.

End with a top-5 prioritized adoption queue with an effort/impact matrix.

## Report skeleton
- `# <Report Title>` — H1 with the topic.
- **Header block:** Repo name, generated date (ISO), scope (files/dirs analyzed), tooling used (linters, scanners).
- **Executive summary** — 3–5 plain-language bullets a tech lead reads first.
- **Findings table** — columns: ID, Severity, Title, Location, Source.
- **Detailed findings** — one block per finding with: severity, where (path:line), evidence (snippet or tool output), why it matters, fix (concrete recommendation, ideally with example diff), reference link.
- **Recommended next steps** — ordered, ~5 items, each tied to a finding ID.
