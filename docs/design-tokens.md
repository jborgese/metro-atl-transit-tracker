# Design Tokens

## Purpose

The Atlanta-1996 design system is expressed as CSS custom properties on `:root` in [src/styles/global.css](../src/styles/global.css#L10). Components consume them via `var(--name)`. New surfaces should reuse a token rather than introducing a hex literal — drift is the failure mode this catalog exists to prevent.

## How to use

- In `.svelte` and `.css` files: `color: var(--text-on-dark); background: var(--surface-1);`
- In Tailwind utility contexts where no shade is a faithful match, use the token via arbitrary value: `bg-[color:var(--surface-1)]` or `border-[color:var(--border-subtle)]`.
- Do not hardcode brand hexes outside [global.css](../src/styles/global.css) and [src/utils/statusHelpers.ts](../src/utils/statusHelpers.ts) (see "Status badges" below).

## Color scheme: dark-only

The site is dark-only by design (UI/UX U-13). The commitment is declared in two places so the browser knows before our CSS loads:

- `<meta name="color-scheme" content="dark">` in [src/app.html](../src/app.html) — applied during initial paint, before `global.css` parses.
- `color-scheme: dark` on `:root` in [global.css:11](../src/styles/global.css#L11) — keeps the hint in CSS for any environment that ignores the meta tag.

This makes the UA render scrollbars, native form controls, and autofill highlights in dark mode for every visitor, regardless of OS-level `prefers-color-scheme`. There is intentionally no `@media (prefers-color-scheme: light)` override; adding one would mean designing a full second token palette and re-verifying contrast on the [statusHelpers.ts](../src/utils/statusHelpers.ts) status fills, which is out of scope for the current product. Revisit only if a light theme becomes a real product requirement.

## Tokens

### Brand (6)

| Token | Value | Use when |
| --- | --- | --- |
| `--atl-green` | `#33514D` | Primary surface base (aliased by `--surface-0`); body background. |
| `--atl-bronze` | `#7E6E4F` | Source for the alpha-derived border tokens; accent strokes. |
| `--atl-red` | `#a73a32` | "Ongoing" status; destructive/alert accents. |
| `--atl-magenta` | `#a32f65` | "Funding application" status; secondary accent. |
| `--atl-blue` | `#4280c4` | Default link color (`a {}`); "planning" status. |
| `--atl-lavender` | `#8a62b0` | "Public outreach" status; tertiary accent. |

### Neutrals / text (4)

| Token | Value | Use when |
| --- | --- | --- |
| `--text-on-dark` | `#F3F2EE` | Default body text on dark surfaces; link hover. |
| `--text-muted` | `#C6CBC6` | Secondary copy, captions, helper text on dark surfaces. |
| `--text-dim` | `#9FA7A2` | Tertiary text (timestamps, metadata) on dark surfaces. |
| `--text-on-light` | `#1F1F1F` | Text on high-luminance backgrounds — see "Status badges" below. |

### Surfaces (3)

| Token | Value | Use when |
| --- | --- | --- |
| `--surface-0` | `var(--atl-green)` | Page background. |
| `--surface-1` | `rgba(18, 32, 30, 0.78)` | Panels, cards, modal interiors over the map or busy backgrounds. |
| `--surface-2` | `rgba(18, 32, 30, 0.92)` | Modal sheets, dropdowns — denser overlay above `--surface-1`. |

### Borders & shadows (4)

| Token | Value | Use when |
| --- | --- | --- |
| `--border-subtle` | `rgba(126, 110, 79, 0.30)` | Default panel borders, table dividers. |
| `--border-strong` | `rgba(126, 110, 79, 0.55)` | Focus rings, active selections, emphasized borders. |
| `--shadow-1` | `0 6px 18px rgba(0, 0, 0, 0.35)` | Cards and panels resting on the map. |
| `--shadow-2` | `0 10px 30px rgba(0, 0, 0, 0.45)` | Modals and dropdowns. |

### Typography (3)

Inter and Merriweather are loaded via `<link rel="preconnect">` + `<link rel="stylesheet">` in [src/app.html](../src/app.html) (per Phase 4 U-10).

| Token | Stack | Use when |
| --- | --- | --- |
| `--font-sans` | Inter, system-ui, … | Default UI text. |
| `--font-serif` | Merriweather, Georgia, … | Editorial headings; methodology copy. |
| `--font-mono` | ui-monospace, SFMono, … | Code, IDs, raw payloads. |

### Layout (5)

| Token | Value | Use when |
| --- | --- | --- |
| `--content-max` | `72rem` | Outer wrapper max-width. |
| `--content-narrow` | `44rem` | Reading-width prose blocks. |
| `--content-padding` | `clamp(1rem, 4vw, 2.5rem)` | Horizontal page padding. |
| `--section-gap` | `clamp(1.5rem, 3vw, 2.75rem)` | Vertical rhythm between sections. |
| `--header-gap` | `clamp(0.75rem, 2vw, 1.25rem)` | Space inside header rows. |

## Status badges (cross-reference)

Status-badge fill colors are **not** CSS tokens. They live in [src/utils/statusHelpers.ts](../src/utils/statusHelpers.ts) so the SVG/legend renderers and the `.svelte` consumers share one source.

| Status | Fill (`getStatusColor`) | Aliases CSS token? | Text (`getStatusTextColor`) |
| --- | --- | --- | --- |
| `planning` | `#4280c4` | `--atl-blue` | `--text-on-light` (`#1F1F1F`) |
| `public-outreach` | `#8a62b0` | `--atl-lavender` | `--text-on-light` |
| `funding-application` | `#a32f65` | `--atl-magenta` | `#fff` |
| `implementation` | `#c4a042` | (bespoke gold) | `--text-on-light` |
| `completed` | `#2d8659` | (bespoke green) | `--text-on-light` |
| `ongoing` | `#a73a32` | `--atl-red` | `#fff` |

Why dark text on the four light fills: WCAG 1.4.3 AA requires ≥ 4.5:1, and the gold/lavender/green/blue badges fall under that against `#fff`. See the comment block at [statusHelpers.ts:39-41](../src/utils/statusHelpers.ts#L39).

When adding a new status, update both [statusHelpers.ts](../src/utils/statusHelpers.ts) and the legend in [MethodologyModal.svelte](../src/components/svelte/MethodologyModal.svelte), and verify contrast against the chosen text color.

## When to add a new token

Add a token when **both** are true:

1. Two or more components need the same value.
2. A plausible future change to that value should propagate everywhere at once.

A one-off shade in a single component is fine inline. Promote it to a token only when the second consumer appears.
