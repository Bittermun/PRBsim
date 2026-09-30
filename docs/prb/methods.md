# Scientific Methodology & Data Architecture

## 1. Core Epistemic Design

The **PRB Coal-Fire Evidence Explorer** is designed around a single scientific requirement: **separating verified empirical observations from hypotheses, secondary reporting, and synthetic validation fixtures**.

In coal-fire and wildfire research, four methodological errors frequently distort conclusions:
1. **Conflating Multiple Vents with Independent Ignitions**: A single subterranean coal-seam combustion front often vents through dozens of surface fissures along a fractured clinker bench. Treating each fumarole or thermal pixel as an independent coal-seam fire inflates fire counts.
2. **Conflating Unsurveyed Areas with Absence of Fire**: Absence of reported vents in an unsurveyed ranching drainage does not mean absence of subsurface combustion. Only bounded negative thermal surveys establish absence of detectable surface thermal anomalies at a specific time.
3. **Conflating First Post-Fire Detection with New Ignition**: Discovering a smoldering coal seam after a surface wildfire passes over does not prove the surface wildfire ignited the seam unless a pre-fire thermal baseline or physical ignition pathway is established.
4. **Conflating a Final Cumulative Perimeter with Daily Fire Spread**: An official final wildfire polygon (such as the WFIGS Remington perimeter mapped on `2025-01-15`) represents the cumulative outer footprint of the burn scar, not day-by-day fire front progression.

---

## 2. Relational Domain Model (`src/prb/data/types.ts`)

1. **`DatasetSource`**: Provenance record containing publisher, license, retrieval date, spatial accuracy, limitations, and `processedSha256`. At runtime, `loadPRBEvidenceData` (`src/prb/data/load.ts`) computes the SHA-256 digest of fetched file bytes via `crypto.subtle.digest('SHA-256', buffer)` and throws a `ValidationError` on any mismatch.
2. **`WildfirePerimeterRecord`**: Stores `discoveryDate` (`2024-08-22`), `containmentDate` (`2024-09-21`), `controlDate` (`2024-11-12`), polygon snapshot `mapDate` (`2025-01-15`), and `temporalRole` (`retrospective_final_footprint`). Because `temporalRole` is `retrospective_final_footprint`, `filterEvidence` (`src/prb/data/select.ts`) keeps the perimeter visible across timeline dates as static spatial context rather than animating it as fake daily spread.
3. **`CoalFireSite` & `CoalFireObservation`**: Groups individual surface vents (`CoalFireObservation`) under a parent `CoalFireSite` with explicit `groupingUncertainty` (`confirmed_single_body`, `inferred_connected_seam`, or `unresolved_multi_vent`). Missing coordinate precision is preserved as `accuracyMeters: null` (`±unknown`) and never defaulted to `50m`.
4. **`RemingtonCaseChronology`**: Non-spatial source-linked evidence matrix in `manifest.json` documenting verified WFIGS dates alongside attributed secondary reporting (Sept 2025 Montana Free Press report of 107 burning seams), primary-source follow-up leads (Feb 2026 MT DES bulletin), and separate hydrological context (Meredith 2016).
