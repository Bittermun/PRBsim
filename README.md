# Powder River Basin Coal-Fire Evidence Explorer

An auditable, local geospatial case-study explorer for independent research on subterranean coal-seam fires and surface wildfire interactions in the **Powder River Basin (Montana and Wyoming)**, centered on the **2024 Remington Wildfire** study area.

## Core Research Question

> *Do surface vegetation wildfires generate new, persistent coal-seam fires, which can subsequently reignite surface vegetation?*

Rather than presenting unverified points or speculative risk indices, this explorer enforces strict epistemic hygiene:
1. **Verified Empirical Record (Default Mode)**: Displays only the **2024 Remington Wildfire Final Perimeter** from NIFC WFIGS (`196,368.1 acres`, IRWIN ID `{2B136641-8C91-4C70-960D-64E05BC390E4}`, Unique Fire ID `2024-WYSHX-240442`, discovery date `2024-08-22`, containment `2024-09-21`, control `2024-11-12`, and polygon snapshot `poly_PolygonDateTime` **`2025-01-15`**). The polygon is labeled and exported as a **retrospective final footprint** (`retrospective_final_footprint`)—never animated as pseudo-daily fire spread.
2. **Explicit Data Gap & Non-Spatial Evidence Matrix**: Default real mode contains **0 verified coal-fire point observations** and **0 source-backed local geology polygons**. No public survey-grade GPS/IR coal-fire point inventory was acquired from the public catalogs checked as of September 2026. Secondary reporting (Montana Free Press, Sept 2025, reporting 107 burning seams mapped after the Remington fire) and primary-source follow-up leads (Feb 2026 Montana DES mapping bulletin) are documented in the non-spatial **Remington Case Study Evidence & Chronology Matrix** without inventing coordinates.
3. **Quarantined Synthetic & Schematic Fixtures**: Hand-constructed regional stratigraphy polygons (`geological_context.geojson`) and synthetic multi-vent/survey test cases (`synthetic_fixtures.json`) are strictly marked `isSynthetic: true` and excluded from default views, tables, and real-mode exports.

---

## Quick Start (Local Build & Run)

### Prerequisites
- **Node.js 24+** (`engines.node >= 24.0.0`, required for native `--experimental-strip-types` TypeScript test execution)
- **Python 3.10+** (optional, only required if regenerating offline GeoJSON and SHA256 manifests via `scripts/prb/prepare_data.py`)

### Installation & Development Server

```bash
# Install dependencies cleanly
npm ci

# Start local interactive development server (http://localhost:5173/)
npm run dev
```

Open `http://localhost:5173/` (or `http://localhost:5173/prb.html`) in any modern desktop browser.

### Verification, Testing & Production Build

```bash
# Run production automated unit tests (SHA256 verification, temporal model, schema/coordinate/referential validation, exports)
npm test

# Type-check and build static production bundle into dist/
npm run build

# Optional: Re-run offline data preparation & verify deterministic SHA256 checksums
python scripts/prb/prepare_data.py
```

### CI vs. Deployment
- `.github/workflows/deploy.yml` runs `verify` (`npm ci`, `npm test`, `npm run build` on Node 24) on pushes and pull requests to `main`.
- Automatic GitHub Pages deployment on push is **disabled**; deployment can only be triggered manually via `workflow_dispatch` with `deploy_pages: true`.

---

## Documentation & Scientific Methodology

Detailed documentation is maintained in `docs/prb/`:
- [`docs/prb/sources.md`](docs/prb/sources.md) — Provenance, SHA256 checksums, and the Phase 5 Remington Case Study Evidence & Chronology Matrix.
- [`docs/prb/methods.md`](docs/prb/methods.md) — Data model, retrospective perimeter semantics, multi-vent site grouping, and runtime SHA256 verification.
- [`docs/prb/limitations.md`](docs/prb/limitations.md) — Data gaps, pre-fire baseline ambiguity, multi-vent grouping uncertainty, and hydrology branch boundaries (Meredith 2016).
