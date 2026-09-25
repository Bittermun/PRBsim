# Powder River Basin Coal-Fire Evidence Explorer (PRBsim)

This repository hosts an auditable, local geospatial case-study explorer evaluating the spatial and temporal interaction between surface vegetation wildfires and subterranean coal seam combustion in the Powder River Basin (Montana/Wyoming), focused on the **2024 Remington Wildfire** study area.

---

## 🔬 Scientific Question & Core Invariants

The primary research question is:
> *Do surface vegetation wildfires generate new, persistent coal-seam fires, which can subsequently reignite surface vegetation?*

### Scientific Guardrails Enforced in Software
1. **New Detection $\neq$ New Ignition**: A newly discovered coal combustion vent or thermal anomaly after a wildfire does not prove that the wildfire caused it. Pre-existing subterranean smolder can persist for decades undetected without a pre-fire baseline.
2. **Multi-Vent Grouping Uncertainty**: Multiple surface gas or thermal fissures may connect to a single underground combustion body. Surface vent counts are never silently conflated into independent fire counts.
3. **Spatial Overlap $\neq$ Causality**: Co-location of a wildfire perimeter with coal-bearing geology does not demonstrate ignition direction, fracture propagation, or hydraulic connectivity.
4. **Survey Absence $\neq$ Absence of Fire**: An unsurveyed region is explicitly labeled as *unknown/unsurveyed*, not *fire-free*. Negative surveys are recorded with explicit polygon footprints and instrument detection limits.
5. **Separation of Evidence Categories**: Initial narrative dispatch reports, verified physical measurements (thermocouple probes, CO/SO₂ gas detectors, calibrated FLIR), and scientific analyst interpretations are recorded in distinct fields.
6. **No Fabricated Data**: If no public active vent inventory exists, the explorer renders an honest empty/data-gap state. Synthetic test fixtures are strictly quarantined behind a developer toggle (`isSynthetic: true`).

---

## 🗺️ Application Entry Points

The primary root entry point is **[`index.html`](./index.html)** (`prb.html` is provided as an alias):
- **Clean 2D Planimetric & 35° Oblique Map**: MapLibre GL JS with OpenFreeMap Positron styling, vector contours, and hillshading from MapLibre-contour DEM.
- **Auditable Evidence Panel**: Multi-tab drawer displaying Record Details, Inspection Drawer, Records Table, Data Gaps Checklist, and Manifest with SHA256 checksums.
- **Deterministic Timeline Scrubber**: Pure calendar date selection with zero timezone jitter, stepping controls, and synthetic fixture quarantine switch.
- **Data Export**: Complete export of active records as GeoJSON, CSV, and a printable scientific Evidence Brief.

---

## 📦 Data Sources & Audited Repositories

| Dataset / Source | Publisher | Spatial / Temporal Coverage | License | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Remington Wildfire Final Perimeter** | [NIFC WFIGS](https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0) | 196,368.1 acres (WY/MT border); Aug–Nov 2024 | U.S. Public Domain | **Verified & Processed** (SHA256: `af295a61...`) |
| **PRB Coal & Clinker Stratigraphy** | [USGS NCRA PP 1625-A](https://pubs.usgs.gov/pp/p1625a/) & [MBMG](https://mbmg.mtech.edu/MontanaGeology/EnergyResources/coal.asp) | Northern PRB Tongue River Member & Clinker belts | Public Domain / Open Data | **Verified & Processed** (SHA256: `e53cf41b...`) |
| **Burn Severity (MTBS)** | [MTBS Project](https://www.mtbs.gov/project-overview) | Western US fires $\ge$ 1,000 acres | Public Domain | **Audited**: No subsurface vent records |
| **County Emergency Services** | [Custer County DES](https://custercountymt.gov/services/disaster-emergency-services/) | Custer County, MT | Public Information | **Audited**: Emergency alerts only; no GIS logs |
| **Subsurface Coal Fire Inventory** | Montana DEQ / BLM | Remington fire scar | N/A | **DATA GAP**: Not publicly available |

Full manifest and checksums are maintained in [`public/data/prb/remington/manifest.json`](./public/data/prb/remington/manifest.json).

---

## 🛠️ Quickstart & Local Development

### Prerequisites
- Node.js $\ge$ 18 (Node 20+ recommended)
- Python 3 (for optional reproducible data re-fetching)

### Installation
```bash
# Install dependencies from lockfile
npm ci

# Run unit tests (geometry validation, timezone-safe date filtering, multi-vent grouping)
npm test

# Start local development server
npm run dev

# Build production bundle (compiles both prb.html and index.html into dist/)
npm run build

# Preview production build locally
npm run preview
```

### Reproducible Data Preparation
To regenerate the vetted study area datasets from authoritative sources:
```bash
python scripts/prb/prepare_data.py
```

---

## 📚 Documentation
- [`docs/prb/methods.md`](./docs/prb/methods.md): Scientific methodology, constraints, and data model.
- [`docs/prb/sources.md`](./docs/prb/sources.md): Detailed audit of public geospatial datasets and limitations.
- [`docs/prb/limitations.md`](./docs/prb/limitations.md): Explicit statement of empirical data gaps for the Remington Fire.
- [`docs/prb/data_request_draft.md`](./docs/prb/data_request_draft.md): Draft information inquiry for county and state agencies (*Not sent*).

---

## ⚖️ License
This project is licensed under the [GNU General Public License v3.0 (GPLv3)](./LICENSE).
Data layers derived from US Government works (NIFC, USGS) are in the public domain. Basemaps provided via OpenFreeMap / OpenStreetMap contributors.
