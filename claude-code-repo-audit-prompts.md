# Claude Code Prompts: Repo Analysis Suite

A reusable set of agentic prompts for stack-agnostic codebase analysis, health checks, security review, FOSS framework recommendations, and UI/UX standards conformance. Each prompt is designed as a slash command (drop into `.claude/commands/`) that produces a structured markdown report with severity-rated findings.

## Common conventions

### Severity rubric

All prompts share this severity scale:

- 🔴 **Critical** — Exploitable security flaw, data loss risk, or production-breaking bug. Ship a fix this week.
- 🟠 **High** — Significant defect, accessibility blocker, or material maintainability problem. Plan within the sprint.
- 🟡 **Medium** — Quality concern, performance issue, or technical debt with measurable cost. Schedule into the next quarter.
- 🟢 **Low** — Polish, minor consistency issues, or nice-to-have improvements. Tackle opportunistically.
- ℹ️ **Info** — Observation worth recording but not actionable on its own.

### Report skeleton

Every prompt outputs a `reports/<topic>-<YYYY-MM-DD>.md` file with this structure:

- `# <Report Title>` — H1 with the topic.
- **Header block:** Repo name, generated date (ISO), scope (files/dirs analyzed), tooling used (linters, scanners).
- **Executive summary** — 3–5 plain-language bullets a tech lead reads first.
- **Findings table** — columns: ID, Severity, Title, Location, Source.
- **Detailed findings** — one block per finding with: severity, where (path:line), evidence (snippet or tool output), why it matters, fix (concrete recommendation, ideally with example diff), reference link.
- **Recommended next steps** — ordered, ~5 items, each tied to a finding ID.

### Operating principles

These come from the Claude Code best practices docs and field-tested patterns:

1. **Read-only by default.** Analysis prompts must not modify source code unless explicitly invoked with a `--fix` argument.
2. **Plan first.** Each prompt requests a brief plan before execution, so the approach is reviewable before any diff exists.
3. **Use subagents for fan-out.** When scanning many files, dispatch subagents so the main context stays clean.
4. **Cite tool output.** Findings must reference the actual command/tool/line that produced them, not paraphrased recall.
5. **Stack-agnostic.** Prompts detect ecosystem (Node, Python, Go, Rust, Java/Kotlin, .NET, etc.) before invoking ecosystem-specific tools.

---

## 1. `/analyze-codebase` — Architecture & convention map

~~~markdown
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
~~~

---

## 2. `/check-health` — Code quality & maintainability

~~~markdown
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
~~~

---

## 3. `/security-scan` — OWASP-aligned vulnerability sweep

~~~markdown
---
name: security-scan
description: Identify security vulnerabilities mapped to OWASP Top 10 (2025) and surface dependency, secret, and misconfiguration risks.
disable-model-invocation: true
---

You are a security engineer performing a non-destructive review aligned to the **OWASP Top 10:2025** categories: A01 Broken Access Control (now includes SSRF), A02 Security Misconfiguration, A03 Software Supply Chain Failures, A04 Cryptographic Failures, A05 Injection, A06 Insecure Design, A07 Authentication Failures, A08 Software & Data Integrity Failures, A09 Logging & Monitoring Failures, A10 Mishandling of Exceptional Conditions.

Produce `reports/security-$(date +%Y-%m-%d).md`. Do not modify source files. Do not exfiltrate secrets if any are found — redact them in the report.

## Step 1 — Plan & tool detection
Detect ecosystem and choose available tools. Recommended:
- **SAST:** `semgrep --config=auto --json` (works across many languages).
- **Dependency vulnerabilities:** `npm audit --json`, `pip-audit -f json`, `osv-scanner --format=json -r .`, `cargo audit --json`, `govulncheck ./...`, `trivy fs --format json .`.
- **Secrets:** `gitleaks detect --no-git --report-format json` or `trufflehog filesystem --json .`.
- **IaC misconfig (if present):** `trivy config .` or `checkov -d . -o json`.
- **Container (if Dockerfile/compose present):** `trivy config Dockerfile`, `hadolint Dockerfile`.

For each tool not installed, record a gap (Info) and continue.

## Step 2 — Manual review augmenting the scanners
Scanners miss design-level issues. Specifically inspect:
- Authentication flows: session handling, password storage, MFA, account lockout (A07).
- Authorization checks at every protected endpoint — look for IDOR patterns (A01).
- Server-side fetches that take user-controlled URLs (A01, formerly SSRF).
- Cryptographic primitives: hashing of passwords (must be Argon2id/scrypt/bcrypt), TLS config, randomness sources (A04).
- Input handling at trust boundaries — query/template/command construction (A05).
- Build/CI integrity: pinned actions, signed artifacts, lockfile policy (A03, A08).
- Logging: are auth failures, access denials, and admin actions logged? Are PII or secrets in logs? (A09).
- Error handling: are stack traces or internal paths leaked to users? (A10).

## Step 3 — Report
Use the shared rubric, mapping each finding to its OWASP category. Each finding must include:
- The tool output or file:line evidence.
- The exact OWASP A0X:2025 category.
- Whether it appears in any SBOM/CVE record (link to the advisory).
- A concrete fix, including an example patch when feasible.

Critical (🔴) is reserved for: confirmed RCE/SQLi/auth bypass paths, exposed secrets currently in the working tree, or known-exploited CVEs in production deps.

End with: (1) a one-paragraph executive summary suitable for sharing with non-security stakeholders, and (2) a remediation queue ordered by (severity × exploit likelihood).
~~~

---

## 4. `/recommend-foss` — FOSS framework opportunities

~~~markdown
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
~~~

---

## 5. `/audit-uiux` — Accessibility, performance & modern UI standards

~~~markdown
---
name: audit-uiux
description: Audit the frontend against WCAG 2.2 AA, Core Web Vitals (INP/LCP/CLS), and current responsive/component-system patterns.
disable-model-invocation: true
---

You are a senior frontend engineer auditing UI/UX standards. If this repo has no frontend code, produce a one-paragraph report saying so and stop. Otherwise produce `reports/uiux-audit-$(date +%Y-%m-%d).md`. Do not modify source files.

## Step 1 — Detect & plan
- Identify the framework (React/Vue/Svelte/Angular/Next/Nuxt/Remix/SolidStart/etc.) and the styling approach (Tailwind, CSS Modules, styled-components, vanilla, design system).
- Identify whether a component library or design system is in use (shadcn/ui, Radix, MUI, Chakra, Mantine, Ark UI, etc.).
- Note the build target (SPA, SSR, SSG, hybrid) — this changes how Core Web Vitals are measured and fixed.

## Step 2 — Accessibility (WCAG 2.2 AA — ISO/IEC 40500:2025)
Static review (since runtime audit may not be possible):
- Run `eslint-plugin-jsx-a11y` rules if a JS/TS frontend; equivalent linters for other frameworks.
- Run `axe-linter`, `pa11y-ci`, or `lighthouse --only-categories=accessibility` in headless mode if the dev server can be started.
- Manually scan for: missing `alt`, missing `<label>` associations, color used as the only conveyance, focus traps, missing skip links, reliance on `<div onClick>`, missing semantic landmarks, form errors not announced to assistive tech.
- Check the **9 new WCAG 2.2 success criteria** specifically:
  - 2.4.11 Focus Not Obscured (Minimum) — AA
  - 2.4.12 Focus Not Obscured (Enhanced) — AAA
  - 2.4.13 Focus Appearance — AAA
  - 2.5.7 Dragging Movements — AA
  - 2.5.8 Target Size (Minimum) — AA, 24×24 CSS px target
  - 3.2.6 Consistent Help — A
  - 3.3.7 Redundant Entry — A
  - 3.3.8 Accessible Authentication (Minimum) — AA
  - 3.3.9 Accessible Authentication (Enhanced) — AAA

## Step 3 — Core Web Vitals (current thresholds, 75th-percentile field data)
Apply Google's published "good" thresholds:
- **LCP:** ≤ 2.5s
- **INP:** ≤ 200ms (replaced FID in March 2024)
- **CLS:** ≤ 0.1

Static analysis:
- Find LCP risks: hero images without `width`/`height`, large above-the-fold JS bundles, render-blocking CSS, missing `fetchpriority="high"` on the LCP image, `loading="lazy"` on above-the-fold images.
- Find INP risks: synchronous heavy work in event handlers, large component trees with no memoization, third-party scripts loaded eagerly, long tasks not yielded with `scheduler.yield()` or `setTimeout(..., 0)`.
- Find CLS risks: images/videos/iframes without dimensions, late-injected ads/banners with no reserved space, web fonts without `font-display: swap` and matched fallback metrics (`size-adjust`, `ascent-override`).

## Step 4 — Modern UI/UX patterns
Check for: a documented design system, dark mode support, `prefers-reduced-motion` respect, mobile-first responsive baseline, container queries usage where appropriate, semantic HTML over div soup, error/empty/loading states for async UI, keyboard-first interaction patterns, `:focus-visible` styling.

## Step 5 — Report
Use the shared rubric, with these mappings:
- 🔴 **Critical** — Any WCAG 2.2 AA failure that blocks assistive tech users from completing core tasks; LCP > 4s or INP > 500ms on the main flow.
- 🟠 **High** — Other AA failures; LCP/INP/CLS in "needs improvement"; missing keyboard support on important interactions.
- 🟡 **Medium** — AAA-only failures, modern-pattern gaps, minor visual inconsistencies.
- 🟢 **Low** — Polish.

For every accessibility finding, cite the exact WCAG 2.2 success criterion (e.g., "2.5.8 Target Size (Minimum) — Level AA"). For every performance finding, cite which Core Web Vital it affects.

End with: (1) the top 3 fixes to ship this sprint, and (2) a "definition of done" checklist the team can attach to PRs.
~~~

---

## How to use these as slash commands

1. Copy each `~~~markdown ... ~~~` block above (the body, not the section header) into its own file under `.claude/commands/` in your repo — e.g., `.claude/commands/analyze-codebase.md`.
2. The frontmatter `name:` becomes the slash invocation: `/analyze-codebase`, `/check-health`, etc.
3. `disable-model-invocation: true` keeps these from auto-firing — they run only when you explicitly invoke them, which is appropriate for analyses with side effects (writing report files).
4. For repos large enough that a single context will run out of room, instruct Claude in-session to "use subagents to fan out the file scans" before invoking the command.
5. `/check-health` and `/security-scan` overlap intentionally on dependency freshness — if you run both, dedupe in the executive summary.

---

## Sources & standards referenced

**Claude Code patterns**
- Anthropic, *Best Practices for Claude Code* — slash command structure, plan-first patterns, subagent guidance, `disable-model-invocation` semantics. <https://code.claude.com/docs/en/best-practices>
- Anthropic, *Prompting best practices (Claude API docs)* — agentic prompt structure for self-correction and iteration. <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices>

**Security**
- OWASP Foundation, *OWASP Top 10:2025* — current categories including A03 Software Supply Chain Failures (new) and SSRF folded into A01 Broken Access Control. <https://owasp.org/Top10/>

**Accessibility**
- W3C, *Web Content Accessibility Guidelines (WCAG) 2.2* — current Recommendation since 5 October 2023, now also ISO/IEC 40500:2025. <https://www.w3.org/TR/WCAG22/>
- W3C WAI, *What's New in WCAG 2.2* — the 9 added success criteria. <https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/>

**Performance**
- web.dev, *Defining Core Web Vitals thresholds* — current LCP / INP / CLS "good" cutoffs and the 75th-percentile field-data evaluation method. <https://web.dev/articles/defining-core-web-vitals-thresholds>
- web.dev, *Interaction to Next Paint (INP)* — replaced FID as a Core Web Vital in March 2024.

**Tooling referenced inside the prompts**
- Semgrep — pattern-based SAST, multi-language. <https://semgrep.dev>
- Gitleaks — secret scanning. <https://github.com/gitleaks/gitleaks>
- OSV-Scanner — cross-ecosystem dependency vulnerability scanning, backed by the OSV database. <https://google.github.io/osv-scanner/>
- Trivy — IaC, container, and dependency scanning. <https://trivy.dev>
- ESLint plugin `jsx-a11y` — React accessibility lint rules. <https://github.com/jsx-eslint/eslint-plugin-jsx-a11y>
- axe-core / pa11y / Lighthouse — runtime accessibility & Core Web Vitals.
- madge, depcheck, ts-prune, jscpd, ruff, vulture, radon, staticcheck, clippy, cargo-outdated, cargo-udeps — code health.
