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
