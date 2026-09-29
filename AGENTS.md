# PRBsim — Powder River Basin Coal-Fire Evidence Explorer

## 1. Domain & Scientific Integrity Invariants
This repository is an auditable, local geospatial case-study explorer for independent research on subterranean coal-seam fires and surface wildfire interactions in the Powder River Basin (Montana and Wyoming), centered on the 2024 Remington Wildfire study area.

- **Core Research Question**: *Do surface vegetation wildfires generate new, persistent coal-seam fires, which can subsequently reignite surface vegetation?*
- **Strict Epistemic & Data Integrity Rules**:
  1. **Never fabricate or extrapolate GIS observations**: When state/county inventories of verified subsurface active combustion vents have gaps, render an explicit, honest **Data Gap Notice** rather than inventing plausible points.
  2. **Quarantine Synthetic Fixtures**: Synthetic validation fixtures must remain strictly quarantined in `synthetic_fixtures.json` (`SHA256: 083ebda153f31ba6d8be30ba2ca6e7710c632832bc93d6e5a6fef95b7fa25501`) and must never be mixed into verified empirical layers without explicit quarantine badges.
  3. **Verified Empirical Layers**:
     - Remington Wildfire Perimeter (NIFC WFIGS, 196,368.1 acres, `SHA256: af295a61e05085ef7c0c1b483c6f131a473f3050c26563be4ce03be5922ebfae`)
     - PRB Coal & Clinker Stratigraphy (USGS NCRA PP 1625-A & MBMG, `SHA256: e53cf41b9efea0380f2d77d7bebe1005a746535ee3f4bb0fe2ff9cf082c50dd3`)

## 2. Repository Map (12 Source Files — No External AST Graph Needed)
Because this repository is intentionally compact, read the relevant files directly rather than building complex abstractions:
- **Entry Points**: `index.html`, `prb.html`, `src/main.ts`, `src/prb/main.ts`
- **Data Layer (`src/prb/data/`)**:
  - `types.ts` — Core domain types, verification badges, and GeoJSON feature interfaces
  - `load.ts` — Dataset loading and provenance verification
  - `select.ts` — Filtering, temporal/spatial selection logic
- **Cartographic Layer (`src/prb/map/`)**:
  - `styles.ts` — OpenFreeMap Positron vector basemap + `maplibre-contour` DEM hillshading/contours
  - `layers.ts` — MapLibre GL JS layer definitions for geology, wildfire perimeters, surveys, and observations
- **UI Components (`src/prb/ui/`)**:
  - `EvidencePanel.ts`, `ExportDialog.ts`, `Legend.ts`, `TimelineControl.ts` (see `src/prb/ui/AGENTS.md` for UI rules)
- **Offline Data Prep (`scripts/prb/`)**:
  - `prepare_data.py` — Offline geospatial preprocessing script

## 3. Operational Commands & Verification
- **Typecheck & Build**: `npm run build` (`tsc && vite build`)
- **Unit Tests**: `npm test` (`node --experimental-strip-types --test tests/**/*.test.js`)
- **Dev Server**: `npm run dev` (`vite`)
- Always run `npm run build` and `npm test` before claiming any task is complete.
