# PRBsim — Powder River Basin Coal-Fire Evidence Explorer

## 1. Domain & Scientific Integrity Invariants
This repository is an auditable, local geospatial case-study explorer for independent research on subterranean coal-seam fires and surface wildfire interactions in the Powder River Basin (Montana and Wyoming), centered on the 2024 Remington Wildfire study area.

- **Core Research Question**: *Do surface vegetation wildfires generate new, persistent coal-seam fires, which can subsequently reignite surface vegetation?*
- **Strict Epistemic & Data Integrity Rules**:
  1. **Never fabricate or extrapolate GIS observations**: When state/county inventories of verified subsurface active combustion vents have not been acquired from audited public repositories, render an explicit, honest **Data Gap Notice** and non-spatial **Evidence Matrix** rather than inventing plausible points.
  2. **Quarantine Synthetic & Schematic Fixtures**:
     - Synthetic validation fixtures (`synthetic_fixtures.json`, `SHA256: afe3f3a3107a11ade6fd080d4add9a86f42d813171cc388db5c4d0e327ae1288`) and hand-authored schematic geological polygons (`geological_context.geojson`, `SHA256: e03ccd44b53361eacafc4ebffb89d999716cb96f38e86b26f6d15018823857aa`) are marked `isSynthetic: true` and must never be mixed into default verified real-data views or real-mode exports.
  3. **Verified Empirical Layer (Default Real Mode)**:
     - Remington Wildfire Final Perimeter (NIFC WFIGS, 196,368.1 acres, polygon snapshot `mapDate: 2025-01-15`, `temporalRole: 'retrospective_final_footprint'`, processed `SHA256: 1c0f9dd951286449d08045278f27a39b150b960f39f52cf47d25a0808582cc72`, raw `SHA256: 3a4dd938a4733db4908cc783642448ec31e0aeeb4bca0f52e334c83089749986`).

## 2. Repository Map (12 Source Files — No External AST Graph Needed)
Because this repository is intentionally compact, read the relevant files directly rather than building complex abstractions:
- **Entry Points**: `index.html`, `prb.html`, `src/main.ts`, `src/prb/main.ts`
- **Data Layer (`src/prb/data/`)**:
  - `types.ts` — Core domain types, verification badges, and GeoJSON feature interfaces
  - `load.ts` — Dataset loading, Web Crypto SHA256 byte verification, and strict schema/referential validation
  - `select.ts` — Filtering, interval overlap, and synthetic quarantine logic
- **Cartographic Layer (`src/prb/map/`)**:
  - `styles.ts` — OpenFreeMap Positron vector basemap + `maplibre-contour` DEM hillshading/contours
  - `layers.ts` — MapLibre GL JS layer definitions and hit-priority click resolution
- **UI Components (`src/prb/ui/`)**:
  - `EvidencePanel.ts`, `ExportDialog.ts`, `Legend.ts`, `TimelineControl.ts` (see `src/prb/ui/AGENTS.md` for UI rules)
- **Offline Data Prep (`scripts/prb/`)**:
  - `prepare_data.py` — Deterministic offline geospatial preprocessing script

## 3. Operational Commands & Verification
- **Node Runtime**: Node.js `>=24.0.0`
- **Typecheck & Build**: `npm run build` (`tsc && vite build`)
- **Unit Tests**: `npm test` (`node --experimental-strip-types --test "tests/**/*.test.js"`)
- **Dev Server**: `npm run dev` (`vite`)
- Always run `npm run build` and `npm test` before claiming any task is complete.
