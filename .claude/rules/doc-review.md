---
paths:
  - "*.md"
  - "docs/**/*.md"
  - ".claude/**/*.md"
  - ".github/**/*.md"
---

# Documentation Review

## Writing

- Write for a human skimming the repo. Make docs structured and navigable without dropping context a contributor needs to act correctly.
- Prefer short overviews, clear ownership, and links to deeper docs over long explanatory blocks.
- Do not confuse skimmable with shallow. Preserve the decisions, prerequisites, commands, and gotchas needed for safe execution.
- Use small Mermaid diagrams when relationships, flows, dependencies, or rollout sequences are clearer visually than in prose.
- Use emoji/status markers sparingly when they make state or verdicts faster to scan; avoid decorative emoji in headings.
- Keep relative path lists ordered by path unless another order is clearly more useful.

## Placement

- Keep root `AGENTS.md` concise. Prefer directory-level pointers over file-by-file references unless a document is a canonical operating guide.
- Put durable plans under `docs/specs/` (see `docs/specs/README.md`). When creating or materially revising specs, follow the `epic-planning` skill (provided by the agent-guardrails plugin) for the expected design-doc structure.
- Policies and runbooks (CI gates, backup and restore, design tokens) go under `docs/`. Human-contributor conventions go in `CONTRIBUTING.md`, and API, auth, and Cloudflare operations in `README.md`. Audit output lands in `reports/`, written by `.claude/commands/`.
- One canonical home per policy or workflow — link from `AGENTS.md` and rules; do not copy the same inventories or enforcement details into multiple files.

## Adding Guidance

- Before adding guidance, check whether an existing rule already covers the principle. If it does, sharpen that rule in place instead of appending a new one.
- New guidance must state the principle, not the scenario that prompted it. If the bullet needs the triggering example (a specific library, API, or ticket) to make sense, generalize further or don't add it.
- Cross-cutting docs stay generic; avoid anchoring guidance to a single recent incident or ticket.
- Apply the scale test: if every incident added a bullet like this one, would the doc still be maintainable? Rules files are principles, not scenario catalogs. Only add specific scenarios when they are common enough to be worth documenting, when the example is particularly instructive or memorable, or when the principle is complex enough to need a concrete example.

## Before Finalizing

- After meaningful documentation, prompt, setup, or rule changes, re-read your doc diff for clarity, placement, duplication, and verbosity.
