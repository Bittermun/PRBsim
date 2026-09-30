# Scientific Limitations & Data Gaps Checklist

To maintain scientific integrity, the **PRB Coal-Fire Evidence Explorer** documents all data gaps and methodological limitations directly in the user interface (**Data Gaps & Matrix** tab) and in exported reports.

---

## 1. Summary of Data Gaps (2024 Remington Wildfire Study Area)

| Evidence Category | Current Repository Status | Sources Audited (Sept 2026) | Scientific Impact on Research Question |
| :--- | :--- | :--- | :--- |
| **Verified Post-2024 Subsurface Coal-Fire Point Inventory** | **NOT ACQUIRED FROM SOURCES CHECKED** | NIFC WFIGS, MT DNRC, BLM Montana/Dakotas Public GIS, MBMG Open-File Catalog, USGS ScienceBase | Default real-data mode contains **1** official wildfire perimeter and **0** verified coal-fire point observations. Secondary reporting (Montana Free Press, Sept 2025) describes 107 burning seams mapped after the Remington fire, and a Feb 2026 Montana DES mapping bulletin is noted as a primary-source lead, but no public coordinate inventory with precision and pre-fire baseline metadata has been acquired. |
| **Source-Backed Local Clinker & Coal Outcrop Vector Layer** | **NOT ACQUIRED IN REPOSITORY (Schematic Fixture Quarantined)** | USGS Professional Paper 1625-A & MBMG regional stratigraphy catalogs | Hand-constructed schematic polygons in `geological_context.geojson` are marked `isSynthetic: true` and excluded from default real-data views and real-mode exports so they cannot be mistaken for surveyed USGS/MBMG boundaries. |
| **Pre-Fire vs. Post-Fire Thermal Baseline (Pre-Aug 22, 2024)** | **MISSING SYSTEMATIC BASELINE IN ACQUIRED DATA** | LANDFIRE, USGS Coal Fields of the Conterminous US, Heffern & Coates (2004) | First post-fire detection of a smoldering seam cannot be equated with new ignition by the 2024 Remington Wildfire unless pre-fire absence or new ignition mechanism is independently established. |
| **Multi-Vent Subsurface Connectivity** | **UNRESOLVED IN SURFACE OBSERVATIONS** | Borehole thermometry, electrical resistivity, UAV FLIR literature | Multiple surface fumaroles along a clinker bench may stem from a single continuous underground combustion zone; counting individual vents inflates fire ignition counts. |

---

## 2. Why `0` Real Coal-Fire Observations and `0` Real Geology Polygons Are Rendered by Default

In default real mode (`includeSynthetic: false`), the map displays **only** the verified 2024 Remington Wildfire final perimeter (`196,368.1 acres`, WFIGS polygon timestamp `2025-01-15`). It does **not** plot synthetic vents, schematic geology bounding boxes, or approximate pins derived from news articles.

Researchers can inspect the **Data Gaps & Matrix** tab for the non-spatial **Remington Case Study Evidence & Chronology Matrix**, or toggle **Synthetic Validation Fixtures** on the timeline bar to test multi-vent grouping, interval filtering, and bounded negative survey rendering.
