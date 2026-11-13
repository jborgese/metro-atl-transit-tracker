# Coding Standards

**Canonical document:** [`docs/CODING_STANDARDS.md`](../../docs/CODING_STANDARDS.md)

Read it before implementing features in this repo. It encodes established patterns (handlers, server modules, components, APIs, legacy/intentional inconsistencies, testing matrix) and links to area-specific rules — do not reinvent parallel conventions.

**Precedence:** user request/spec → `CODING_STANDARDS.md` → area rule (`.claude/rules/`) → agent role → skills.

**Quick anchors:** new API resource = `src/routes/api/projects/+server.ts` + `src/lib/server/content/handlers.ts`; server domain module = `src/lib/server/content/`; bound-parameter SQL = `src/lib/server/content/repository.ts`; component = `src/components/svelte/FeedbackModal.svelte`; migration = `migrations/d1/0003_feedback.sql`.
