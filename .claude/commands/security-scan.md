---
description: Identify security vulnerabilities mapped to OWASP Top 10 (2025) and surface dependency, secret, and misconfiguration risks.
argument-hint: [optional path to scope the scan]
disable-model-invocation: true
allowed-tools: Bash(npm audit:*), Bash(npx semgrep:*), Bash(semgrep:*), Bash(npx osv-scanner:*), Bash(osv-scanner:*), Bash(gitleaks:*), Bash(trufflehog:*), Bash(trivy:*), Read, Glob, Grep
---

You are a security engineer performing a non-destructive review aligned to the **OWASP Top 10:2025** categories: A01 Broken Access Control (now includes SSRF), A02 Security Misconfiguration, A03 Software Supply Chain Failures, A04 Cryptographic Failures, A05 Injection, A06 Insecure Design, A07 Authentication Failures, A08 Software & Data Integrity Failures, A09 Logging & Monitoring Failures, A10 Mishandling of Exceptional Conditions.

Produce `reports/security-<today's date, YYYY-MM-DD>.md`. Do not modify source files. Do not exfiltrate secrets if any are found — redact them in the report. Work autonomously end-to-end.

If `$ARGUMENTS` is provided, limit the scan to that path and say so in the report's scope line.

@.claude/snippets/project-context.md

The attack surface to prioritize: API endpoints in `src/routes/**/+server.ts` and server logic in `src/lib/server`, JWT/session handling built on `jose`, raw SQL against D1 (parameterization is the line of defense), the rate-limiting implementation, the admin page, and Cloudflare config (`wrangler.jsonc` — bindings, secrets, routes). `.env.example` documents expected secrets; verify no real values are committed.

## Step 1 — Automated scanners
Run what is available; these are independent, so run them in parallel (background Bash or one subagent per scanner):
- **SAST:** `semgrep --config=auto --json` (or `npx semgrep`).
- **Dependency vulnerabilities:** `npm audit --json`; `osv-scanner --format=json -r .` or `trivy fs --format json .` if installed.
- **Secrets:** `gitleaks detect --report-format json` (scan git history too, not just the working tree) or `trufflehog filesystem --json .`.
- **Config:** review `wrangler.jsonc` manually — plaintext secrets in `vars`, overly broad bindings, missing security headers in the app's responses.

For each tool not installed and not fetchable, record a gap (Info) and continue.

## Step 2 — Manual review augmenting the scanners
Scanners miss design-level issues. Specifically inspect:
- Authentication flows: JWT signing/verification with `jose` (algorithm confusion, missing `exp`/`aud` checks, weak secrets), session handling, password storage if any (A07, A04).
- Authorization at every protected endpoint — IDOR patterns, especially around `user_profiles` and admin routes. SvelteKit pitfall: checks done only in `+layout.server.ts` do not protect API `+server.ts` endpoints; verify each endpoint guards itself (A01).
- Server-side fetches taking user-controlled URLs (A01/SSRF) — feed-fetching code is the place to look.
- Injection: every D1 query must use bound parameters, never string interpolation; also check HTML rendering with `{@html}` in Svelte components (A05).
- Input handling at trust boundaries — confirm Zod schemas actually gate every endpoint's input, including query params and route params (A05, A06).
- Rate limiting: can it be bypassed (per-IP behind Cloudflare needs `CF-Connecting-IP`, not `X-Forwarded-For`)? (A06).
- Build/CI integrity: pinned GitHub Actions, lockfile policy (A03, A08).
- Logging: are auth failures, access denials, and admin actions logged? Are PII or secrets in logs? (A09).
- Error handling: stack traces or internal paths leaked to users (A10).

## Step 3 — Report
Use the shared rubric below, mapping each finding to its OWASP category. Each finding must include:
- The tool output or file:line evidence.
- The exact OWASP A0X:2025 category.
- Whether it appears in any SBOM/CVE record (link to the advisory).
- A concrete fix, including an example patch when feasible.

Critical (🔴) is reserved for: confirmed RCE/SQLi/auth bypass paths, exposed secrets currently in the working tree or git history, or known-exploited CVEs in production deps.

End with: (1) a one-paragraph executive summary suitable for sharing with non-security stakeholders, and (2) a remediation queue ordered by (severity × exploit likelihood).

@.claude/snippets/report-format.md
