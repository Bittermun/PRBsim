# Powder River Basin Coal-Fire Evidence Explorer - Site Setup & Specification

## Research Project Context
This application is an auditable, local geospatial case-study explorer for independent research on subterranean coal-seam fires and surface wildfire interactions in the Powder River Basin (Montana and Wyoming), centered on the 2024 Remington Wildfire study area.

## Core Research Question
> *Do surface vegetation wildfires generate new, persistent coal-seam fires, which can subsequently reignite surface vegetation?*

## Key Technical Specifications
- **Stack**: Vanilla TypeScript, Vite, MapLibre GL JS, maplibre-contour DEM.
- **Entry Points**: `index.html` (Primary Root Application), `prb.html` (Alias).
- **Style Architecture**: OpenFreeMap Positron (restrained vector default) + MapLibre-contour DEM (vector contours + raster hillshading).
- **Data Layers**:
  - Remington Wildfire Perimeter (NIFC WFIGS, 196,368.1 acres, SHA256: `af295a61e05085ef7c0c1b483c6f131a473f3050c26563be4ce03be5922ebfae`).
  - PRB Coal & Clinker Stratigraphy (USGS NCRA PP 1625-A & MBMG, SHA256: `e53cf41b9efea0380f2d77d7bebe1005a746535ee3f4bb0fe2ff9cf082c50dd3`).
  - Synthetic Validation Fixtures (Quarantined in `synthetic_fixtures.json`, SHA256: `083ebda153f31ba6d8be30ba2ca6e7710c632832bc93d6e5a6fef95b7fa25501`).
- **Data Gap Status**: State and county inventories of verified subsurface active combustion vents are not currently available in public GIS repositories. The application renders an explicit, honest Data Gap notice rather than inventing plausible observations.
