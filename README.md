# Metro ATL Transit Tracker — Interactive Map 🚉

**Public, data-driven visualization of transit-relevant geography across Metro Atlanta.** The project centers on an interactive map that communicates county-level regions, governance context, and advocacy scope—intended for public education, analysis, and future data overlays.

---

## 🎯 Goal

Build a stable, product-grade, web-based map visualization focused on Metro Atlanta counties and related transit geography. The project is explicitly non-affiliated with any agency and designed to be extensible for adding transit agencies, projects, funding, and advocacy datasets.

---

## 🧱 Current Stack & Architecture

- **Framework:** Astro
- **Interactive islands:** Svelte (`client:visible`) ✅
- **Map rendering:** MapLibre GL JS
- **Basemap:** MapTiler Streets (set via `PUBLIC_MAPTILER_KEY` env var)
- **Styling:** Tailwind CSS + `src/styles/global.css` overrides
- **Logging:** scoped `createLogger` helper (environment-gated)
- **Data format:** GeoJSON (served statically)

---

## 🗂 Map Data Pipeline (Already Working)

- Source: US Census TIGER/Line shapefiles (2025)
- Conversion: `mapshaper` used to
  - Filter to Georgia (STATEFP === "13")
  - Simplify geometries for web performance
- Output: `src/data/geo/ga_counties.geojson` (served from `public/` / `src/data/geo/` depending on build)
- GeoJSON is fetched by the client and rendered with MapLibre.

---

## ✅ Current Map Behavior (Verified Working)

- Map loads centered on Atlanta, GA
- MapTiler basemap (streets & labels) renders with correct attribution
- County polygons render with semi-transparent fill, outlines, and color differentiation
- Layers are added without runtime errors
- `ResizeObserver` + delayed mount logic prevents zero-size container issues

---

## 🔍 Where We Left Off

The map is functional but needs refinement to be intentional, readable, and extensible. Planned, not-yet-applied improvements include:

- Refine county outline thickness and opacity for legibility
- Ensure county fill layers are inserted below labels and roads using `beforeId`
- Add hover affordances (cursor change and optional highlight)
- Implement data-driven color logic using `match` expressions keyed by FIPS / `GEOID`
- Prepare for future enhancements: tooltips, `feature-state`, selectable regions

> No changes beyond the working render have been applied yet.

---

## 🚫 Non-Goals (For Now)

- No backend or database yet
- No real-time transit feeds
- No agency endorsements or affiliations
- Avoid heavy UI frameworks beyond Tailwind

---

## 🛠️ Getting Started

1. Copy `.env.example` → `.env` and set your MapTiler key:

```env
PUBLIC_MAPTILER_KEY=your_maptiler_key_here
```

2. Install dependencies and run locally:

```bash
npm install
npm run dev
```

3. Build for production and preview:

```bash
npm run build
npm run preview
```

---

## 🔧 Key Files & Where to Look

- `src/lib/map/initMap.ts` — Map init and basemap setup
- `src/lib/map/addGeoJsonLayer.ts` — Adds county layers and styling
- `src/lib/map/countyStyles.ts` — County color and outline constants
- `src/data/geo/ga_counties.geojson` — Simplified county geometries
- `src/svelte/MetroMap.svelte` — Svelte island that mounts the map
- `src/pages/index.astro` — App shell and landing page
- `src/utils/logger.ts` — scoped logger helper

---

## ➡️ Next Steps (Implementation Plan)

1. Apply styling refinements to county outlines and fills (non-breaking)
2. Insert county fill layers below labels using `beforeId` placement
3. Add lightweight hover highlight + cursor affordance
4. Implement `match`-based color mapping keyed by `GEOID` for future datasets
5. Add small UX pieces: accessible attributions, keyboard-focusable features, and a test page for tooltip interactions

Work will be incremental, preserving the current stable render and adding tests where feasible.

---

## 🙏 Contributing

- Open an issue for feature requests or bugs
- Create focused PRs for small, testable changes

---

Licensed under the terms in `LICENSE` (if present). For questions, reach out via repo issues.
