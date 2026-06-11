---
description: Audit the frontend against WCAG 2.2 AA, Core Web Vitals (INP/LCP/CLS), and current responsive/component-system patterns.
argument-hint: [optional route or component path to scope the audit]
disable-model-invocation: true
allowed-tools: Bash(npx eslint:*), Bash(npx pa11y-ci:*), Bash(npx lighthouse:*), Read, Glob, Grep
---

You are a senior frontend engineer auditing UI/UX standards. Produce `reports/uiux-audit-<today's date, YYYY-MM-DD>.md`. Do not modify source files. Work autonomously end-to-end.

If `$ARGUMENTS` is provided, limit the audit to that route or component subtree and say so in the report's scope line.

@.claude/snippets/project-context.md

Frontend specifics for this audit: Svelte 5 components under `src/components` and `src/routes`, Tailwind CSS 4 utility styling (theme in `tailwind.config.ts` and `src/styles`), SSR on Cloudflare Workers (so Core Web Vitals are shaped by server render + hydration, not a pure SPA bundle), and MapLibre GL for the map — give the map's keyboard/screen-reader story explicit attention, since canvas-based maps are a common accessibility hole.

## Step 1 — Accessibility (WCAG 2.2 AA)
Static review (runtime audit may not be possible):
- `eslint-plugin-svelte` is installed — run `npx eslint .` and pull out its a11y warnings (this is the Svelte equivalent of `jsx-a11y`; do not suggest React tooling).
- If the dev server can be started (`npm run dev`), run `npx pa11y-ci` or `npx lighthouse --only-categories=accessibility` headless against key routes.
- Manually scan for: missing `alt`, missing `<label>` associations, color used as the only conveyance, focus traps, missing skip links, reliance on `<div onclick>`, missing semantic landmarks, form errors not announced to assistive tech.
- Check the **9 new WCAG 2.2 success criteria** specifically:
  - 2.4.11 Focus Not Obscured (Minimum) — AA
  - 2.4.12 Focus Not Obscured (Enhanced) — AAA
  - 2.4.13 Focus Appearance — AAA
  - 2.5.7 Dragging Movements — AA (map panning needs a non-drag alternative)
  - 2.5.8 Target Size (Minimum) — AA, 24×24 CSS px target (check map markers and stop pins)
  - 3.2.6 Consistent Help — A
  - 3.3.7 Redundant Entry — A
  - 3.3.8 Accessible Authentication (Minimum) — AA
  - 3.3.9 Accessible Authentication (Enhanced) — AAA

## Step 2 — Core Web Vitals (current thresholds, 75th-percentile field data)
Apply Google's published "good" thresholds:
- **LCP:** ≤ 2.5s
- **INP:** ≤ 200ms (replaced FID in March 2024)
- **CLS:** ≤ 0.1

Static analysis:
- LCP risks: hero/map imagery without `width`/`height`, large above-the-fold JS (MapLibre is heavy — check whether it's code-split or loaded eagerly on non-map routes), render-blocking CSS, missing `fetchpriority="high"` on the LCP image, `loading="lazy"` above the fold.
- INP risks: synchronous heavy work in event handlers (especially map move/zoom handlers and live-arrival polling), large unmemoized derived state, third-party scripts loaded eagerly, long tasks not yielded with `scheduler.yield()` or `setTimeout(..., 0)`.
- CLS risks: images/videos/iframes without dimensions, late-injected content with no reserved space (arrival boards, alerts banners), web fonts without `font-display: swap` and matched fallback metrics (`size-adjust`, `ascent-override`).

## Step 3 — Modern UI/UX patterns
Check for: a documented design system or token set, dark mode support, `prefers-reduced-motion` respect (map animations included), mobile-first responsive baseline (transit apps are mobile-dominant — weight this heavily), container queries where appropriate, semantic HTML over div soup, error/empty/loading states for async UI (arrivals, alerts), keyboard-first interaction patterns, `:focus-visible` styling.

## Step 4 — Report
Use the shared rubric below, with these mappings:
- 🔴 **Critical** — Any WCAG 2.2 AA failure that blocks assistive tech users from completing core tasks; LCP > 4s or INP > 500ms on the main flow.
- 🟠 **High** — Other AA failures; LCP/INP/CLS in "needs improvement"; missing keyboard support on important interactions.
- 🟡 **Medium** — AAA-only failures, modern-pattern gaps, minor visual inconsistencies.
- 🟢 **Low** — Polish.

For every accessibility finding, cite the exact WCAG 2.2 success criterion (e.g., "2.5.8 Target Size (Minimum) — Level AA"). For every performance finding, cite which Core Web Vital it affects.

End with: (1) the top 3 fixes to ship this sprint, and (2) a "definition of done" checklist the team can attach to PRs.

@.claude/snippets/report-format.md
