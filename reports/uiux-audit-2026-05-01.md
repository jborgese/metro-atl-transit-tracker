# UI/UX Audit — metro-atl-transit-tracker

**Repo:** metro-atl-transit-tracker
**Generated:** 2026-05-01
**Scope:** All `.svelte` components, [src/styles/global.css](../src/styles/global.css), [src/app.html](../src/app.html), [src/layouts/BaseLayout.svelte](../src/layouts/BaseLayout.svelte). Static analysis only — no Lighthouse / axe-core run because no dev server was started for this audit.
**Tooling used:** ripgrep, manual file read, asset byte-size via `stat`. `eslint-plugin-jsx-a11y` not applicable to Svelte; the equivalent (`eslint-plugin-svelte`'s a11y rules) is bundled into the recommended config but is **not currently enforced** because the lint gate is broken (see [reports/health-2026-05-01.md H-01](health-2026-05-01.md#h-01--%F0%9F%9F%A0-eslint-9-flat-config-has-empty-rules-lint-is-a-ci-no-op)). Two `<!-- svelte-ignore -->` comments in [src/components/svelte/MetroMap.svelte:379-380](../src/components/svelte/MetroMap.svelte#L379) confirm the rules *would* fire if enabled.

---

## Executive summary

This is a small public-data SvelteKit app on Cloudflare Workers, served as a server-side-rendered hybrid. Most of the basics are right: there is a skip link, semantic landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`), labelled forms, `:focus-visible` styling, container queries, alt text on every `<img>`, a real ARIA dialog with `aria-modal`, and a documented status-color legend in the methodology page. The codebase shows real attention to a11y in places — the project-card pattern (`role="button"` + `tabindex="0"` + Space/Enter handler that ignores nested links) is implemented carefully four times across [GoalsTable.svelte](../src/components/svelte/GoalsTable.svelte).

The audit surfaces four 🟠 issues, all addressable in a single sprint:

1. **Color contrast on status badges fails WCAG 1.4.3 AA** for at least the *implementation* (`#c4a042` on white) state, which renders as ~2.4:1 on text that is uppercase, 0.7em, and weight 600 — small text by WCAG 1.4.3 sizing, requiring 4.5:1.
2. **No `<img>` in the codebase carries `width`/`height`** (verified: `grep` for `width=`/`height=`/`loading=`/`fetchpriority=` returned only the viewport meta tag). Combined with a **244 KB header logo** loaded eagerly and an external Google Fonts `@import` that blocks first paint, this puts LCP and CLS in "needs improvement" territory by default.
3. **The methodology dialog does not trap focus or restore it on close.** It uses `role="dialog"` + `aria-modal="true"` and Escape-to-close, which is most of the work — but pressing Tab from inside the modal will move focus into the page underneath, and closing the modal does not return focus to the "Methodology" trigger.
4. **No `prefers-reduced-motion` query anywhere.** Eight CSS transitions (modest durations, all ≤200ms) plus `scroll-behavior: smooth` on `<html>` are unconditionally applied, which violates WCAG 2.3.3 in cases of user-initiated motion.

The site is dark-themed without an explicit light-mode design — that's a deliberate choice ("Atlanta 1996 Design Tokens" in [global.css:9](../src/styles/global.css#L9)) and not a defect; flagged 🟢 only because a `prefers-color-scheme` token would improve the OS-integration story for users who don't want a dark site.

**Top 3 fixes to ship this sprint:**

1. Darken `.project-status` badge text (or pin a per-badge `color` based on luminance of the background) to fix the contrast failure on the *implementation* and *completed* states. (U-01)
2. Add `width`, `height`, `loading="lazy"` (or `eager` + `fetchpriority="high"` for the header logo) to every `<img>`; resize the header logo from 244 KB to <30 KB. (U-02, U-03)
3. Implement focus trap + initial-focus + focus-restore in [MethodologyModal.svelte](../src/components/svelte/MethodologyModal.svelte). ~25 LOC. (U-04)

**Definition of done checklist** for future PRs is at the end of the report.

---

## Step 1 — Detect & plan

| Aspect            | Detected                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Framework         | Svelte 5.49 + SvelteKit 2.50 (Svelte-4 idioms — no runes, see `/analyze-codebase` F-06)                  |
| Styling           | Tailwind 4 (`@tailwindcss/typography`) + ~443 LOC in [src/styles/global.css](../src/styles/global.css) (CSS variables for "Atlanta 1996 Design Tokens"). MapLibre's stylesheet imported globally. |
| Component library | None — bespoke components in [src/components/svelte/](../src/components/svelte/)                        |
| Build target      | SSR via `@sveltejs/adapter-cloudflare`. `data-sveltekit-preload-data="hover"` on `<body>` ([app.html:9](../src/app.html#L9)). |
| Asset pipeline    | Logos in `static/`. Fonts via Google Fonts CSS `@import` (no self-host). Favicons baked.                 |

---

## Step 2 — Accessibility (WCAG 2.2 AA — ISO/IEC 40500:2025)

### What works well

| Feature                         | Where                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Skip link                       | [BaseLayout.svelte:23-25](../src/layouts/BaseLayout.svelte#L23) — moves to `#content`, styled to appear on focus only ([global.css:377-402](../src/styles/global.css#L377)) |
| Semantic landmarks              | [BaseLayout.svelte:27-49](../src/layouts/BaseLayout.svelte#L27) — `<header>`, `<nav aria-label="Primary">`, `<main id="content">`, `<footer>` |
| Labelled primary nav            | `<nav aria-label="Primary">`                                                                                            |
| Section landmark on the map     | [MetroMap.svelte:371](../src/components/svelte/MetroMap.svelte#L371) — `<section aria-label={title}>`                  |
| Alt text on every `<img>`       | All four `<img>` tags carry `alt` (BaseLayout, MetroCountyPanel × 3)                                                  |
| Modal pattern                   | [MethodologyModal.svelte](../src/components/svelte/MethodologyModal.svelte) — `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + Escape handler + close button with `aria-label="Close"` |
| Tablist pattern (admin)         | [admin/+page.svelte:486-503](../src/routes/admin/+page.svelte#L486) — `role="tablist" aria-label="Content type"` with `role="tab" aria-selected={...}` |
| Keyboard-activatable cards      | [GoalsTable.svelte:35-41,233-239](../src/components/svelte/GoalsTable.svelte#L35) — `role="button"` + `tabindex="0"`, handler accepts both Space and Enter, ignores activation when target is a nested `<a>` |
| `:focus-visible` styling        | [global.css:362-366](../src/styles/global.css#L362), [GoalsTable.svelte:773-775](../src/components/svelte/GoalsTable.svelte#L773), MetroMap close button |
| Live region for messages        | [admin/+page.svelte:481](../src/routes/admin/+page.svelte#L481) — `<p role="status">`                                  |
| Color is not the only conveyance for status | Status text label is rendered alongside the colored badge ([statusHelpers.ts:1-18](../src/utils/statusHelpers.ts#L1)) |
| Form labels                     | All admin inputs are wrapped in `<label>` (implicit association — valid)                                                |
| External link safety            | `rel="noopener noreferrer"` consistently applied on `target="_blank"` links                                            |
| `aria-hidden` on decorative glyphs | The `→` arrows in project-card headers ([GoalsTable.svelte:242](../src/components/svelte/GoalsTable.svelte#L242))    |

### Where it falls short

#### Color contrast (1.4.3 — Level AA) — 🟠 U-01

The `.project-status` badge in [GoalsTable.svelte:777-786](../src/components/svelte/GoalsTable.svelte#L777) fixes `color: #fff` and lets the background be set inline from `getStatusColor(status)` ([statusHelpers.ts:20-37](../src/utils/statusHelpers.ts#L20)). Computed contrast against white text:

| Status                | Background | Contrast vs. `#fff` | Required for "small text" (≤18.66 px or <14 px @700) | WCAG 1.4.3 verdict |
| --------------------- | ---------- | ------------------- | ------------------------------------------------------ | ------------------ |
| `planning`            | `#4280c4`  | ≈ 3.6 : 1           | 4.5 : 1                                                | **fail**           |
| `public-outreach`     | `#8a62b0`  | ≈ 3.7 : 1           | 4.5 : 1                                                | **fail**           |
| `funding-application` | `#a32f65`  | ≈ 5.5 : 1           | 4.5 : 1                                                | pass               |
| `implementation`      | `#c4a042`  | ≈ 2.4 : 1           | 4.5 : 1                                                | **fail (worst)**   |
| `completed`           | `#2d8659`  | ≈ 3.7 : 1           | 4.5 : 1                                                | **fail**           |
| `ongoing`             | `#a73a32`  | ≈ 5.0 : 1           | 4.5 : 1                                                | pass               |

Badge font is 0.7em with `font-weight: 600` and `text-transform: uppercase` — by WCAG sizing this is "normal text" (the 14pt-bold-or-18pt threshold for "large text" is not met). Four of six states fail. `implementation` is the worst because the gold background is high-luminance.

#### Focus management in dialogs (2.4.3, 2.4.11, 2.4.12) — 🟠 U-04

[MethodologyModal.svelte](../src/components/svelte/MethodologyModal.svelte) sets up the dialog correctly *as markup* (`role="dialog"`, `aria-modal`, `aria-labelledby`, `tabindex="-1"` on the backdrop, Escape to close, click-outside to close). It does **not**:

- Move focus into the dialog when it opens (initial-focus is the rest of the page, not `<button class="modal-close">`).
- Trap Tab inside the dialog. Pressing Tab from the close button moves focus to the next focusable element in DOM order — which is in the page underneath, since the modal is rendered through a `Portal` ([Portal.svelte](../src/components/svelte/Portal.svelte)) but the underlying page is not `inert`-ed.
- Restore focus to the `<button>Methodology</button>` trigger when the dialog closes (closes on Escape, click-outside, or close button).

This is a WCAG 2.4.3 (Focus Order, A) failure and a 2.4.11 (Focus Not Obscured (Minimum), AA — new in 2.2) at risk because the obscured focus indicator is now on an element behind the modal backdrop.

#### `prefers-reduced-motion` not respected (2.3.3 AAA, also a 1990 best practice) — 🟡 U-05

`grep` for `prefers-reduced-motion` returns 0 hits across `src/`. The codebase has:

- `html { scroll-behavior: smooth; }` ([global.css:51](../src/styles/global.css#L51)) — applies to all anchor jumps, including the county-jump nav in [GoalsTable.svelte:154](../src/components/svelte/GoalsTable.svelte#L154).
- 8 transition declarations, all ≤200ms, mostly `color` and `opacity`.
- Map pan/zoom is interactive (user-driven), so MapLibre's animations are out of scope for 2.3.3.

2.3.3 (Animation from Interactions) is AAA, not AA — but combining `scroll-behavior: smooth` with no opt-out is something the WAI-WCAG-22 New criteria document explicitly calls out as low-cost-to-fix.

#### Map "Application" role — 🟡 U-06

[MetroMap.svelte:381-388](../src/components/svelte/MetroMap.svelte#L381) declares `role="application"` on the MapLibre container. The two `<!-- svelte-ignore a11y-no-noninteractive-tabindex -->` and `<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->` comments suggest this was a workaround. `role="application"` tells screen readers to **stop intercepting keys** and pass them to the application — only correct for fully-custom keyboard-handled widgets. The `aria-describedby` instructions ("press Enter to highlight the county at the center") describes one keystroke; the rest of MapLibre's keyboard map is not exposed.

`role="application"` is rarely the right call on a public map. Either drop it (rely on MapLibre's built-in canvas keyboard handling, which already supports arrow-pan and `+`/`-` zoom and is exposed to AT) or expand the `aria-describedby` instructions to cover the full keyboard map.

#### `<button role="tab">` without `aria-controls` — 🟡 U-07

[admin/+page.svelte:486-503](../src/routes/admin/+page.svelte#L486) declares a tablist with two tabs but no `aria-controls` pointing to the corresponding tabpanel, and the rendered list/editor regions below do not declare `role="tabpanel"`. WAI-ARIA Authoring Practices for the Tabs pattern requires this association. Functional today; semantic gap that screen-reader users will notice.

#### New WCAG 2.2 success criteria

| Criterion                                              | Level | Static-review verdict                                                                                                                           |
| ------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.4.11 Focus Not Obscured (Minimum)                    | AA    | At-risk via U-04. Dialog can leave focus visible *outside* the modal.                                                                            |
| 2.4.12 Focus Not Obscured (Enhanced)                   | AAA   | Not in scope for AA target.                                                                                                                      |
| 2.4.13 Focus Appearance                                | AAA   | Not in scope for AA target.                                                                                                                      |
| 2.5.7 Dragging Movements                               | AA    | Map pan is dragging-based but MapLibre also exposes keyboard pan. Pass.                                                                          |
| 2.5.8 Target Size (Minimum) — 24×24 CSS px             | AA    | Site-nav links: `padding: 0.35rem 0.75rem` ≈ 5.6px × 12px padding plus text — total ≥24×24 ✅. Modal close button (`&times;`) — needs measurement; the rendered `&times;` glyph is small but the `<button>` itself is in `position: absolute right-2 top-2` with default browser button sizing (~32px square) — likely passes. **County panel close button on the map** is `class="ml-2 ... rounded absolute right-2 top-2"` with `&times;` text only — likely **fails 24×24** without explicit padding. **U-08**. |
| 3.2.6 Consistent Help                                  | A     | No persistent "Help" mechanism is offered. The Methodology dialog is a help-equivalent and is consistently in the primary nav across pages. Pass. |
| 3.3.7 Redundant Entry                                  | A     | Pass — only the admin form has multiple inputs and they are independent.                                                                          |
| 3.3.8 Accessible Authentication (Minimum)              | AA    | Cloudflare Access provides the authentication path. The admin token field is `type="password"` with `autocomplete="off"` ([+page.svelte:464-466](../src/routes/admin/+page.svelte#L464)) — that disables password-manager assistance. Per 3.3.8, *cognitive function tests must not be required*. The token-mode is test-only and does not require a memorized challenge, but `autocomplete="off"` on a paste-target field disables a useful assist. **U-09** (🟢).        |

---

## Step 3 — Core Web Vitals (current "good" thresholds: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1)

This was a static review (no Lighthouse run). Field-data CWV requires real-user monitoring; the analysis below identifies the **fix-before-deploy risks** that would appear in a Lighthouse lab run.

### LCP risks — 🟠 U-02 / 🟡 U-10

The above-the-fold paint on `/` is the header logo + the map container. The map container has explicit dimensions (`clamp(18rem, 45vh, 34rem)` — [MetroMap.svelte:32-33](../src/components/svelte/MetroMap.svelte#L32)) so it does not contribute to CLS, but it is also unlikely to be the LCP element since MapLibre boots after JS. The LCP element on first paint is therefore likely the **header logo**.

| Risk                                                                                               | Where                                                                                                              | Fix                                                                                                |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Header logo is 244 KB ([static/mai-tai-logo.png](../static/mai-tai-logo.png), 243,477 bytes)        | [BaseLayout.svelte:30](../src/layouts/BaseLayout.svelte#L30)                                                       | Compress to ≤30 KB; convert to AVIF/WebP with PNG fallback. Add `width`/`height`. Add `fetchpriority="high"` for the LCP candidate. |
| `@import url('https://fonts.googleapis.com/...')` is render-blocking                                | [global.css:4](../src/styles/global.css#L4)                                                                        | Replace with `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` + `<link rel="stylesheet" ...>` in [app.html](../src/app.html). Or self-host the WOFF2 with `font-display: swap`. **Notable:** the URL already passes `&display=swap` so FOIT is avoided. |
| One large org logo at 523 KB ([static/logos/abettercobb.png](../static/logos/abettercobb.png))      | [src/data/static/orgLogos.ts](../src/data/static/orgLogos.ts)                                                       | Compress + convert. Lazy-load (it appears only inside the county panel after user interaction).     |
| No `Cache-Control: max-age=...` configuration in the repo                                           | Cloudflare default is reasonable; explicit policy preferred                                                          | Set asset cache headers in [src/hooks.server.ts](../src/hooks.server.ts) for `/static/*`.            |

### INP risks — 🟢 (no obvious failures)

- No heavy synchronous work in event handlers found.
- Project cards are 4 nested copies of similar markup with `each` blocks — [GoalsTable.svelte:229-572](../src/components/svelte/GoalsTable.svelte#L229) — 957 LOC of this component. With ~30 projects in [src/data/geo/projects-metadata.json](../src/data/geo/projects-metadata.json), Svelte's reactivity is not in danger. If the dataset grows past ~500 records, virtualization becomes necessary.
- No third-party scripts loaded eagerly.
- Map interactions are MapLibre's responsibility — generally meet INP on modern hardware.

### CLS risks — 🟠 U-03

- **No `<img>` carries `width`/`height`.** Verified: `grep -nE "loading=|fetchpriority=|width=|height=|decoding=" src/components src/layouts src/pages` returns *only* the viewport meta tag in [BaseLayout.svelte:16](../src/layouts/BaseLayout.svelte#L16). Every image renders at intrinsic size after download — a guaranteed CLS event for the header logo, the org logos in `MetroCountyPanel`, and any future image.
- The map container *does* reserve space via `clamp(18rem, 45vh, 34rem)` — good.
- Modal mounts via `Portal` with backdrop covering full viewport (`position: fixed`-equivalent presumed) — does not shift surrounding content.
- `@import url('https://fonts.googleapis.com/...?display=swap')` — fallback-to-Inter via the `font-family` stack ([global.css:37](../src/styles/global.css#L37)) means the font swap will reflow text once. Without `size-adjust` / `ascent-override`, this is a minor CLS event on first load. Self-hosting and matching metrics is the standard fix.

---

## Step 4 — Modern UI/UX patterns

| Pattern                                  | Status                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Documented design system                 | Partial — CSS variables in [global.css:9-47](../src/styles/global.css#L9) form a token system but there is no developer doc. 🟢 U-11 |
| Dark mode                                | Site is dark-only by default. No `prefers-color-scheme: light` handling. By design, but flag 🟢 because OS-integration is missing.  |
| `prefers-reduced-motion`                 | **Not respected anywhere.** See U-05.                                                                                          |
| Mobile-first responsive baseline         | Yes — `clamp()` used throughout for fluid sizing; container queries used for table responsiveness ([global.css:217,229](../src/styles/global.css#L217)). |
| Container queries                        | Used in 2 places. 🟢 (would benefit from more usage in the admin panel; current admin layout uses media queries only).             |
| Semantic HTML                            | Strong — landmarks, `<table>` for tabular data, `<details>`/`<summary>` for collapsible token-auth, `<article>` for the methodology body. |
| Loading / empty / error states           | Mixed. Admin has a `loading` flag and a `message` live region. The home page has [+page.ts](../src/routes/+page.ts) with a static fallback if the API fails — silent failure to the user. 🟢 U-12. |
| Keyboard-first interaction               | Yes for cards and modals (with the dialog focus-trap caveat in U-04).                                                           |
| `:focus-visible` styling                 | Yes throughout; outlines explicitly removed and replaced with `box-shadow` rings.                                              |
| Tap target size (2.5.8)                  | Mostly fine; one likely fail (U-08).                                                                                           |
| Skeletons / placeholders                 | None. Admin shows raw `loading…` text only.                                                                                    |
| `data-sveltekit-preload-data="hover"`    | Enabled ([app.html:9](../src/app.html#L9)) — reduces perceived navigation latency.                                              |

---

## Findings table

| ID    | Severity   | Title                                                                          | Vital / Criterion                                                              |
| ----- | ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| U-01  | 🟠 High    | `.project-status` badge fails contrast for 4 of 6 states                       | WCAG 1.4.3 Contrast (Minimum) — Level AA                                       |
| U-02  | 🟠 High    | Header logo is 244 KB and missing `width`/`height`/`fetchpriority`             | LCP                                                                            |
| U-03  | 🟠 High    | No `<img>` in the codebase carries `width`/`height` or `loading=`              | CLS                                                                            |
| U-04  | 🟠 High    | Methodology dialog: no focus trap, no initial focus, no focus restore          | WCAG 2.4.3 Focus Order — Level A; 2.4.11 Focus Not Obscured — Level AA         |
| U-05  | 🟡 Medium  | `prefers-reduced-motion` not respected anywhere                                | WCAG 2.3.3 Animation from Interactions — Level AAA (best practice for AA)      |
| U-06  | 🟡 Medium  | Map uses `role="application"` with insufficient keyboard documentation         | WCAG 4.1.2 Name, Role, Value — Level A                                         |
| U-07  | 🟡 Medium  | Admin `role="tab"` buttons missing `aria-controls`; no `role="tabpanel"`       | WAI-ARIA Authoring Practices — Tabs pattern                                    |
| U-08  | 🟡 Medium  | County-panel close button likely under 24×24 CSS px                            | WCAG 2.5.8 Target Size (Minimum) — Level AA (new in 2.2)                        |
| U-09  | 🟢 Low     | Admin token field uses `autocomplete="off"`                                    | WCAG 3.3.8 Accessible Authentication — Level AA (new in 2.2)                    |
| U-10  | 🟡 Medium  | Google Fonts loaded via render-blocking `@import`                              | LCP / CLS                                                                      |
| U-11  | 🟢 Low     | Design tokens are present but not documented                                   | UX consistency                                                                 |
| U-12  | 🟢 Low     | Home-page falls back to bundled JSON silently when D1 fetch fails              | UX feedback                                                                    |
| U-13  | 🟢 Low     | No `prefers-color-scheme` handling — site is dark-only                         | UX                                                                             |
| U-14  | ℹ️ Info    | Two `<!-- svelte-ignore a11y-* -->` comments in MetroMap                       | meta                                                                           |
| U-15  | ℹ️ Info    | `eslint-plugin-svelte` recommended (incl. a11y rules) is silently disabled     | tooling — see [reports/health-2026-05-01.md H-01](health-2026-05-01.md#h-01--%F0%9F%9F%A0-eslint-9-flat-config-has-empty-rules-lint-is-a-ci-no-op) |

---

## Detailed findings

### U-01 — 🟠 Status badge contrast failure (WCAG 1.4.3 — AA)

- **Where:** [src/components/svelte/GoalsTable.svelte:777-786](../src/components/svelte/GoalsTable.svelte#L777) (CSS), [src/utils/statusHelpers.ts:20-37](../src/utils/statusHelpers.ts#L20) (color tokens), used four times across the same file (lines 244, 350, 459, 565).
- **Evidence:** Badge style is `color: #fff` against a dynamic background; four of six backgrounds compute contrast below 4.5:1 against white. `implementation` (`#c4a042`) is ≈ 2.4:1 — well below the threshold even for "large text" (3:1).
- **Why it matters:** The status badge is the primary affordance for understanding what state a project is in. Users with low vision or who view the page in bright sunlight cannot reliably read the badge.
- **Fix (any of these):**
  1. Pin `.project-status { color: #1F1F1F; }` (the existing `--text-on-light` token) for high-luminance backgrounds (gold, possibly green and lavender) and keep `#fff` for dark backgrounds. Switching dynamically is straightforward in CSS:
     ```svelte
     <span
       class="project-status"
       style="--bg: {getStatusColor(project.status)}; background: var(--bg); color: {getContrastingText(project.status)}">
       {statusLabel(project.status)}
     </span>
     ```
     where `getContrastingText` returns `'#1F1F1F'` for `implementation` and `'#fff'` otherwise.
  2. Or darken every status color to a luminance that gives ≥ 4.5:1 against white. Track in the `Atlanta 1996 Design Tokens` doc.
  3. Or add a 1px outline to every badge (`outline: 1px solid rgba(0,0,0,0.5)`) to break up the colored block — softer fix, still helps.

### U-02 — 🟠 LCP: header logo size & missing fetchpriority

- **Where:** [src/layouts/BaseLayout.svelte:30](../src/layouts/BaseLayout.svelte#L30): `<img src="/mai-tai-logo.png" alt="MAI TAI" class="site-logo" />`. File is **243,477 bytes** ([static/mai-tai-logo.png](../static/mai-tai-logo.png)).
- **Evidence:** `stat -c '%s' static/mai-tai-logo.png` → `243477`. No `width`/`height`/`fetchpriority` on the tag.
- **Why it matters:** Header logos are typical LCP candidates on simple landing pages. Even on fast networks a 244 KB blocking transfer between domain handshake and first paint costs hundreds of ms; on a slow 3G median connection (Lighthouse default) it shifts LCP into "needs improvement" territory by itself.
- **Fix:**
  1. Compress and convert: `npx @squoosh/cli --webp '{}'  static/mai-tai-logo.png` (target ≤30 KB) and serve a `<picture>` with WebP/AVIF + PNG fallback.
  2. Add `width="120" height="40"` (or whatever the rendered intrinsic ratio is) and `fetchpriority="high"` to the `<img>`.
  3. Consider replacing the PNG with the existing SVG `mai-tai-logo-transparent.png` (also 242 KB) or, ideally, a true SVG.

### U-03 — 🟠 CLS: no `<img>` has `width`/`height`

- **Where:** All four `<img>` tags in [src/](../src/) (BaseLayout × 1, MetroCountyPanel × 3).
- **Evidence:** `grep -nE "loading=|fetchpriority=|width=|height=|decoding=" src/components src/layouts src/pages` returns only the viewport meta tag.
- **Why it matters:** Without explicit dimensions, the browser cannot reserve layout space before the image bytes arrive. Each load triggers a layout shift. The org logos in [src/data/static/orgLogos.ts](../src/data/static/orgLogos.ts) are loaded conditionally inside [MetroCountyPanel.svelte](../src/components/svelte/MetroCountyPanel.svelte) when a county is selected — which is mid-interaction, so they contribute to **INP** and **CLS** simultaneously.
- **Fix:** For each `<img>` in [MetroCountyPanel.svelte](../src/components/svelte/MetroCountyPanel.svelte), add explicit `width`/`height` attributes (PanelLogo size is fixed by CSS `class="panel-logo"`; mirror that in the markup). Set `loading="lazy"` for the org logos — they only render after county selection. Set `loading="eager"` and `fetchpriority="high"` for the BaseLayout logo. Consider adding a `<style>` rule that enforces aspect-ratio: `.site-logo { aspect-ratio: 3 / 1; }`.

### U-04 — 🟠 Modal focus management

- **Where:** [src/components/svelte/MethodologyModal.svelte](../src/components/svelte/MethodologyModal.svelte) (also affects [Portal.svelte](../src/components/svelte/Portal.svelte) and the trigger in [BaseLayout.svelte:35](../src/layouts/BaseLayout.svelte#L35)).
- **Evidence:** No `focus()` call on open, no Tab-key handler that cycles focus among descendants, no `inert` attribute applied to siblings of the portal, no focus-restore in the `close()` function.
- **Why it matters:** A keyboard user opens the modal, Tabs once to leave the close button, and is now focused on a `<a class="site-nav-link" href="/history">` (or wherever in the page below) without the dialog closing. WCAG 2.4.3, 2.4.11, and ARIA dialog semantics all require this not happen.
- **Fix:** Add ~25 LOC to [MethodologyModal.svelte](../src/components/svelte/MethodologyModal.svelte):
  ```svelte
  <script lang="ts">
    let dialog: HTMLDivElement;
    let lastFocused: HTMLElement | null = null;
    let modalContent: HTMLDivElement;

    $: if (typeof document !== 'undefined') {
      if (open) {
        lastFocused = document.activeElement as HTMLElement;
        document.body.style.overflow = 'hidden';
        // After Svelte mounts, focus the close button:
        Promise.resolve().then(() => modalContent?.querySelector('button')?.focus());
      } else {
        document.body.style.overflow = '';
        lastFocused?.focus();
      }
    }

    function trapTab(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !modalContent) return;
      const focusables = modalContent.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, textarea, select'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  </script>

  <svelte:window on:keydown={(e) => { handleKeydown(e); trapTab(e); }} />
  ```
  And use `bind:this={modalContent}` on the inner `<div class="modal-content">`.

### U-05 — 🟡 `prefers-reduced-motion` not respected

- **Where:** Global. Affected: `html { scroll-behavior: smooth }` ([global.css:51](../src/styles/global.css#L51)) and 8 transitions across `global.css` and component scoped styles.
- **Fix:** Add a single global block at the end of [global.css](../src/styles/global.css):
  ```css
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    *, *::before, *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
  }
  ```

### U-06 — 🟡 Map `role="application"` weakens screen-reader access

- **Where:** [src/components/svelte/MetroMap.svelte:381-388](../src/components/svelte/MetroMap.svelte#L381).
- **Fix:** Drop `role="application"` and let MapLibre's canvas handle keyboard interaction with the default screen-reader behavior. If the custom `Enter`-to-select-center-county is wanted, expose it as a real button alongside the map (`<button on:click={selectCenteredCounty}>Select county at map center</button>`) instead of relying on a hidden keystroke.

### U-07 — 🟡 Admin tablist missing `aria-controls`

- **Where:** [src/routes/admin/+page.svelte:486-503](../src/routes/admin/+page.svelte#L486).
- **Fix:**
  ```svelte
  <button role="tab" aria-selected={dataset === 'project'} aria-controls="content-list" id="tab-project" class="..." on:click={() => setDataset('project')}>Projects ({projects.length})</button>
  <button role="tab" aria-selected={dataset === 'goal'} aria-controls="content-list" id="tab-goal" class="..." on:click={() => setDataset('goal')}>Goals ({goals.length})</button>
  ...
  <div id="content-list" role="tabpanel" aria-labelledby={dataset === 'project' ? 'tab-project' : 'tab-goal'}>...</div>
  ```

### U-08 — 🟡 County panel close button target size

- **Where:** [src/components/svelte/MetroMap.svelte:401](../src/components/svelte/MetroMap.svelte#L401): `<button bind:this={closeBtn} aria-label="Close county panel" class="ml-2 text-neutral-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 rounded absolute right-2 top-2" on:click={closePanel}>&times;</button>`. Tailwind classes set color, ring, position — but no explicit `w-6 h-6` / `min-w-6 min-h-6` / `p-1`. The `&times;` glyph alone at default body font is ~14×14 px.
- **Fix:** Add `class="... w-8 h-8 flex items-center justify-center"` (32×32 CSS px) or similar. WCAG 2.5.8 minimum is 24×24.

### U-09 — 🟢 `autocomplete="off"` on the admin token field

- **Where:** [src/routes/admin/+page.svelte:466](../src/routes/admin/+page.svelte#L466).
- **Why it matters:** WCAG 3.3.8 (Accessible Authentication, Minimum) discourages requiring users to memorize/type long credentials. `autocomplete="off"` forbids password managers from filling the field. Since the token is by design test-only and pasted in, `autocomplete="off"` is defensible — but `autocomplete="current-password"` gives a better experience for repeat testers and is still safe.
- **Fix:** `autocomplete="current-password"` on the password input; keep `autocomplete="off"` on the actor name field.

### U-10 — 🟡 Render-blocking Google Fonts `@import`

- **Where:** [src/styles/global.css:4](../src/styles/global.css#L4): `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&family=Merriweather:wght@300;400;700&display=swap');`.
- **Why it matters:** A CSS `@import` is render-blocking; a `<link rel="stylesheet">` in `<head>` is render-blocking too but allows preconnect. Self-hosted WOFF2 with `font-display: swap` and matched fallback metrics (`size-adjust`) gives the best LCP and CLS scores.
- **Fix (incremental):**
  1. Replace `@import` with `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />` + `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?...&display=swap" />` in [src/app.html](../src/app.html).
  2. Long-term: download Inter and Merriweather WOFF2, host under [static/fonts/](../static/fonts/), reference via `@font-face` with `font-display: swap` and `size-adjust` / `ascent-override` to match Inter/Merriweather metrics to the system fallback.

### U-11 — 🟢 Design tokens not documented

- **Where:** [src/styles/global.css:9-47](../src/styles/global.css#L9).
- **Fix:** Add a short note to [README.md](../README.md) or [docs/](../docs/) listing the tokens and when each is used. Optional but improves consistency on future PRs.

### U-12 — 🟢 Silent fallback when D1 fetch fails

- **Where:** [src/routes/+page.ts:19-32](../src/routes/+page.ts#L19) — `loadCollection` returns `fallback` on any non-2xx or thrown error, with no user-visible signal.
- **Fix:** Pass a `usingFallback: boolean` flag in the page data and render a small banner when true ("Showing cached snapshot — live data temporarily unavailable").

### U-13 — 🟢 No `prefers-color-scheme` handling

- **Where:** Global. Site is dark-themed unconditionally.
- **Fix:** If a light theme is wanted, add token overrides under `@media (prefers-color-scheme: light)`. If not, leave as-is — this is recorded only because the OS-level signal is silently ignored today.

### U-14 — ℹ️ `<!-- svelte-ignore -->` directives

- **Where:** [src/components/svelte/MetroMap.svelte:379-380](../src/components/svelte/MetroMap.svelte#L379) — `a11y-no-noninteractive-tabindex` and `a11y-no-noninteractive-element-interactions`. Both are specifically the rules `eslint-plugin-svelte`'s recommended config would fire on the `role="application"` block. This is a *meta* finding: when [reports/health-2026-05-01.md H-01](health-2026-05-01.md#h-01--%F0%9F%9F%A0-eslint-9-flat-config-has-empty-rules-lint-is-a-ci-no-op) is fixed, U-06 will appear as a lint warning automatically.

### U-15 — ℹ️ `eslint-plugin-svelte` a11y rules silently disabled

- See cross-reference above. Restoring lint coverage gets you `eslint-plugin-svelte`'s a11y rules (a Svelte equivalent of `jsx-a11y`) for free.

---

## Recommended next steps (top 5, tied to finding IDs)

1. **U-01:** fix status-badge contrast (1 hr).
2. **U-02 + U-03:** compress the header logo, add `width`/`height`/`loading=` attrs across all `<img>` (2 hr).
3. **U-04:** focus trap + restore in MethodologyModal (1 hr).
4. **U-10 + U-05:** preconnect/preload fonts; self-host as a follow-up; add `prefers-reduced-motion` block (1 hr).
5. **U-08 + U-07:** target sizes + tablist `aria-controls` cleanup (30 min).

---

## Definition of Done — UI/UX checklist for PRs

Attach this to PR templates after fixing the 🟠 set:

- [ ] Every new `<img>` has `width`, `height`, and either `loading="lazy"` or `loading="eager"` + `fetchpriority="high"` for above-the-fold.
- [ ] Image bytes ≤ 30 KB (or justified larger).
- [ ] Every interactive element is reachable by keyboard and has a visible `:focus-visible` style.
- [ ] No `<div onClick>` without `role="button"` + `tabindex="0"` + Space and Enter handlers.
- [ ] Every dialog moves focus inward, traps Tab, and restores focus on close.
- [ ] Every form input has an associated `<label>` (implicit or `for=`).
- [ ] Color is not the only signal for state — text or icon accompanies it.
- [ ] All foreground/background combinations meet WCAG AA contrast (4.5:1 normal text, 3:1 large/UI components).
- [ ] Tap targets are ≥ 24×24 CSS pixels.
- [ ] `prefers-reduced-motion` is respected for new motion.
- [ ] If touching a route, `LCP` candidate has explicit dimensions and the LCP image has `fetchpriority="high"`.
- [ ] No new console.error/warn at page load.
