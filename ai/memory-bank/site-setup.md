# Powder River Basin Coal-Fire Evidence Explorer - Site Setup & Specification

## Research Project Context
This application is an auditable, local geospatial case-study explorer for independent research on subterranean coal-seam fires and surface wildfire interactions in the Powder River Basin (Montana and Wyoming), centered on the 2024 Remington Wildfire study area.

## Core Research Question
> *Do surface vegetation wildfires generate new, persistent coal-seam fires, which can subsequently reignite surface vegetation?*

## Key Technical Specifications
- **Stack**: Vanilla TypeScript, Vite, MapLibre GL JS, maplibre-contour DEM (Node.js `>=24.0.0`).
- **Entry Points**: `index.html` (Primary Root Application), `prb.html` (Alias).
- **Style Architecture**: OpenFreeMap Positron (restrained vector default) + MapLibre-contour DEM (vector contours + raster hillshading).
- **Data Layers**:
  - **Verified Empirical Default Layer**: Remington Wildfire Final Perimeter (NIFC WFIGS, 196,368.1 acres, polygon snapshot `mapDate: 2025-01-15`, `temporalRole: 'retrospective_final_footprint'`, processed SHA256: `1c0f9dd951286449d08045278f27a39b150b960f39f52cf47d25a0808582cc72`, raw SHA256: `3a4dd938a4733db4908cc783642448ec31e0aeeb4bca0f52e334c83089749986`).
  - **Quarantined Schematic Stratigraphy Fixtures**: `geological_context.geojson` (`isSynthetic: true`, SHA256: `e03ccd44b53361eacafc4ebffb89d999716cb96f38e86b26f6d15018823857aa`) — hand-constructed illustrative polygons excluded from default real mode.
  - **Quarantined Synthetic Validation Fixtures**: `synthetic_fixtures.json` (`isSynthetic: true`, SHA256: `afe3f3a3107a11ade6fd080d4add9a86f42d813171cc388db5c4d0e327ae1288`).
- **Data Gap & Chronology Status**: No verified subsurface coal-fire GPS/IR point inventory was acquired from the public repositories checked as of September 2026. The application renders an explicit Data Gap notice and the non-spatial **Remington Case Study Evidence & Chronology Matrix** (documenting WFIGS timestamps, the Sept 2025 Montana Free Press report of 107 burning seams as attributed secondary reporting, the Feb 2026 MT DES bulletin lead, and the Meredith 2016 hydrology note) rather than inventing plausible point observations.
