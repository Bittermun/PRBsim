# Data Sources, Provenance & Remington Evidence Matrix

All spatial datasets and non-spatial case-study records in the **Powder River Basin (PRB) Coal-Fire Evidence Explorer** are tracked in `public/data/prb/remington/manifest.json` with SHA256 checksums verified at runtime via the Web Crypto API (`crypto.subtle.digest('SHA-256', ...)`).

---

## 1. Verified Empirical Geospatial Layer (Default Real Mode)

### 2024 Remington Wildfire Final Perimeter (`wfigs-remington-2024`)
- **Publisher**: National Interagency Fire Center (NIFC) / Wildland Fire Interagency Geospatial Services (WFIGS)
- **Dataset Portal**: [NIFC Open Data — WFIGS Interagency Perimeters](https://data-nifc.opendata.arcgis.com/)
- **IRWIN ID**: `{2B136641-8C91-4C70-960D-64E05BC390E4}`
- **Unique Fire Identifier**: `2024-WYSHX-240442`
- **Burned Area**: `196,368.1 GIS Acres`
- **Event & Polygon Timestamps**:
  - **Discovery Date (`attr_FireDiscoveryDateTime`)**: `2024-08-22`
  - **Containment Date (`attr_ContainmentDateTime`)**: `2024-09-21`
  - **Control Date (`attr_ControlDateTime`)**: `2024-11-12`
  - **Polygon Snapshot Date (`poly_PolygonDateTime` / `mapDate`)**: **`2025-01-15`**
  - **Temporal Role**: `retrospective_final_footprint` (Static retrospective final footprint; not a daily fire progression sequence)
- **Reported Cause in WFIGS**: `Natural / Lightning` (`attr_IsFireCauseInvestigated: 0`)
- **License**: Public Domain (U.S. Government Work, 17 U.S.C. § 105)
- **CRS**: `EPSG:4326` (WGS84)
- **Raw SHA256 (`raw/wfigs_remington_raw.geojson`)**: `3a4dd938a4733db4908cc783642448ec31e0aeeb4bca0f52e334c83089749986`
- **Processed SHA256 (`fire_perimeters.geojson`)**: `1c0f9dd951286449d08045278f27a39b150b960f39f52cf47d25a0808582cc72`

---

## 2. Quarantined Synthetic & Schematic Fixtures (`isSynthetic: true`)

These files are **excluded from default real-data views, tables, and real-mode exports** and are only loaded onto the map when the user explicitly enables the **Synthetic Validation Fixtures** toggle:

### Schematic Stratigraphic Context (`usgs-mbmg-prb-geology`)
- **File**: `public/data/prb/remington/geological_context.geojson`
- **Processed SHA256**: `e03ccd44b53361eacafc4ebffb89d999716cb96f38e86b26f6d15018823857aa`
- **Provenance**: Hand-constructed schematic bounding polygons in `scripts/prb/prepare_data.py` conceptually referencing USGS Professional Paper 1625-A and MBMG Fort Union Formation literature. Because they are not digitized USGS/MBMG vector features, they are quarantined with `isSynthetic: true`.

### Synthetic Validation Fixtures (`synthetic-validation-fixtures`)
- **File**: `public/data/prb/remington/synthetic_fixtures.json`
- **Processed SHA256**: `afe3f3a3107a11ade6fd080d4add9a86f42d813171cc388db5c4d0e327ae1288`
- **Purpose**: Tests multi-vent site grouping (`CoalFireSite`), interval filtering (`observationDate` through `endDate`), unknown coordinate precision (`accuracyMeters: null`), and bounded negative thermal survey footprints (`SurveyCoverageRecord`).

---

## 3. Phase 5 Research Artifact: Remington Case Study Evidence & Chronology Matrix (Non-Spatial)

Because no public GPS/IR point inventory of post-2024 coal-seam fires was acquired from the public agency repositories checked as of September 2026, PRBsim records post-fire coal activity leads in a structured, non-spatial evidence matrix rather than inventing point coordinates:

| Event Time | Report / Pub Time | Mapped Perimeter Time | Category | Claim / Reported Postfire Coal Activity | Survey Coverage, Pre-Fire Baseline & Grouping Uncertainty | Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `2024-08-22` | `2024-08-22` | `2025-01-15` | `verified_geospatial_record` | Remington Wildfire discovery in Sheridan County, WY, burning into Big Horn, Rosebud, and Powder River Counties, MT. Reported WFIGS cause: Natural / Lightning (`attr_IsFireCauseInvestigated=0`). | Final cumulative perimeter only (`196,368.1 acres`); no daily progression series or pre-August 2024 coal-fire baseline in WFIGS. | NIFC WFIGS (`{2B136641-8C91-4C70-960D-64E05BC390E4}`) |
| `2024-09-21` to `2024-11-12` | `2025-01-15` | `2025-01-15` | `verified_geospatial_record` | WFIGS containment (`2024-09-21`), control (`2024-11-12`), and final polygon snapshot (`poly_PolygonDateTime: 2025-01-15`). | Single retrospective final boundary snapshot (`2025-01-15`). | NIFC WFIGS (`2024-WYSHX-240442`) |
| `2024–2025` (post-fire survey period) | `2025-09` | Unpublished in public GIS | `attributed_secondary_report` | **Montana Free Press (Leigh Walden, Sept 2025)** reported 107 burning coal seams mapped in connection with the 2024 Remington Wildfire scar. Treated strictly as an **attributed secondary report**, not a verified count of newly ignited independent subsurface fires. | **Survey Coverage**: Primary GPS/IR tracklines and negative survey bounds unpublished.<br/>**Baseline**: Unresolved how many of the 107 thermal features were newly ignited in Aug 2024 vs. pre-existing smoldering seams.<br/>**Grouping**: Unresolved whether "107" counts individual fumaroles/vents along shared coal beds or independent subsurface combustion bodies. | Leigh Walden, *Montana Free Press* (Sept 2025) |
| `2025–2026` | `2026-02` | Primary dataset not yet acquired | `unverified_primary_source_lead` | **February 2026 Montana DES / County Mapping Bulletin** identified as a primary-source follow-up lead to trace the survey holder, coordinates, and methodology behind post-Remington coal-fire counts. | Primary GIS dataset not yet acquired in local repository; rendered strictly as a non-spatial research lead. | Montana DES (`https://des.mt.gov/`) |

### Separate Hydrological Research Branch Note — Meredith (2016)
- **Citation**: Meredith, E. (2016). *Coal aquifer contribution to streams in the Powder River Basin, Montana*. Journal of Hydrology / MBMG.
- **Scope & Epistemic Boundary**: Meredith (2016) uses water and strontium isotopes to quantify natural coal-bed aquifer baseflow contributions to Powder River Basin streams (Rosebud Creek, Tongue River, Otter Creek). It does **not** measure active coal-seam fire contaminant plumes or post-wildfire ash runoff. Accordingly, PRBsim never renders groundwater contamination plumes from coal-bearing stratigraphy polygons.
