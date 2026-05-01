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

## Report skeleton
- `# <Report Title>` — H1 with the topic.
- **Header block:** Repo name, generated date (ISO), scope (files/dirs analyzed), tooling used (linters, scanners).
- **Executive summary** — 3–5 plain-language bullets a tech lead reads first.
- **Findings table** — columns: ID, Severity, Title, Location, Source.
- **Detailed findings** — one block per finding with: severity, where (path:line), evidence (snippet or tool output), why it matters, fix (concrete recommendation, ideally with example diff), reference link.
- **Recommended next steps** — ordered, ~5 items, each tied to a finding ID.
