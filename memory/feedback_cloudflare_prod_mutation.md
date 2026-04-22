---
name: Ask before Cloudflare prod mutation
description: Guardrail for Cloudflare MCP usage — read-only against prod D1/R2/Workers unless user approves a specific mutation
type: feedback
---

Against the `metro-atl-transit-tracker` Cloudflare account (prod D1 `metro-atl-transit-prod`, prod Workers, R2 backup buckets), default to read-only via the Cloudflare MCP servers. Do not run mutating calls (D1 INSERT/UPDATE/DELETE/DDL, R2 put/delete, Worker deploy/secret changes) without explicit per-action approval.

**Why:** User set this as a guardrail when enabling Cloudflare MCP (Bindings + Observability) on 2026-04-22. The Bindings server is write-capable; the user wants a human-in-the-loop checkpoint before touching live prod data.

**How to apply:**
- Read-only queries against prod D1, R2 listings, Worker/observability inspection — proceed without asking.
- Any mutation against prod — describe the exact call and ask first, even if the user's broader task implies it.
- Staging (`metro-atl-transit-staging`) is lower-risk; still surface mutations but don't require the same formal approval.
- If a task seems to require prod mutation, prefer suggesting a staging dry-run or a migration/script the user runs themselves.
