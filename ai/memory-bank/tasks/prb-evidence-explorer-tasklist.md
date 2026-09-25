# Powder River Basin Coal-Fire Evidence Explorer Development Tasks

## Specification Summary
**Original Requirements**: 
"Implement a local, reviewable **Powder River Basin coal-fire evidence explorer**, initially for the Remington Fire study area. The question is whether vegetation fires generate additional persistent coal fires, which can subsequently ignite vegetation. Wider emissions, water, and Canadian boreal concerns are unproven research motivations, not results to illustrate as facts... Do not claim that existing coal-fire emissions or water effects can only be studied after proving new ignition... Do not push, publish, enable deployment, contact anyone, create paid accounts, or upload datasets to third parties without authorization... Please remove the Great Depression simulation, this is for a research project, please recheck criteria of initial project."

**Technical Stack**: 
- MapLibre GL JS v4
- maplibre-contour v0.1 (Terrarium DEM hillshade + vector contours)
- TypeScript v5 + Vite v5
- Node.js built-in test runner (`node:test`, `node:assert/strict`)
- OpenFreeMap Positron (restrained vector basemap)

**Target Timeline**: Immediate research implementation & audit.

---

## Initial Project Criteria Audit & Status

| Phase & Requirement | Exact Specification Criterion | Status | Implementation Details & References |
| :--- | :--- | :--- | :--- |
| **Authority & Guardrails** | No remote push, no publishing, no deployment activation, no contacting anyone, no paid accounts, no third-party data uploads. | **VERIFIED** | Local-only execution; `.github/workflows/deploy.yml` disabled from auto-publishing; no telemetry. |
| **Scientific Invariant 1** | *New Detection $\neq$ New Ignition*: Newly discovered coal combustion vent or thermal anomaly after a wildfire does not prove wildfire causation without pre-fire baseline. | **VERIFIED** | Enforced in `src/prb/data/types.ts` (`detectionMethod`, `confidenceNotes`), `EvidencePanel.ts`, `docs/prb/methods.md`. |
| **Scientific Invariant 2** | *Multi-Vent Grouping Uncertainty*: Multiple surface gas or thermal fissures may connect to a single underground combustion body; do not conflate into distinct fires. | **VERIFIED** | Implemented with nullable `siteId` on observations; unit test verifies multi-vent preservation; UI highlights shared site groups. |
| **Scientific Invariant 3** | *Spatial Overlap $\neq$ Causality*: Co-location of wildfire with coal stratigraphy does not demonstrate ignition direction, fracture propagation, or connectivity. | **VERIFIED** | Disclaimers on map and inspector; no artificial causal vectors or inferred underground channels. |
| **Scientific Invariant 4** | *Survey Absence $\neq$ Absence of Fire*: Unsurveyed areas must be labeled unknown, not fire-free. Negative surveys require explicit footprint and detection limits. | **VERIFIED** | Negative surveys recorded with instrument limits in `Survey`; unsurveyed area rendering avoids false-negative assumption. |
| **Scientific Invariant 5** | *Honest Data Gaps & No Fabricated Data*: If no public active vent inventory exists, show honest unavailable-data state. Synthetic fixtures quarantined behind toggle. | **VERIFIED** | Real dataset displays verified perimeter and geology; synthetic fixtures isolated in `synthetic_fixtures.json` behind explicit UI switch (`isSynthetic: true`). |
| **Data Feasibility** | Audit MBMG, MTBS, Custer County DES, NIFC WFIGS. Produce manifest with SHA256 checksums, CRS, transformations. | **VERIFIED** | Manifest at `public/data/prb/remington/manifest.json` with SHA256 hashes (`af295a61...`, `e53cf41b...`); raw inputs in `raw/`; preparation script in `scripts/prb/prepare_data.py`. |
| **Data Request Draft** | Prepare inquiry for state/county agencies, labeled DRAFT NOT SENT. | **VERIFIED** | `docs/prb/data_request_draft.md` formatted and explicitly watermarked `DRAFT - NOT SENT`. |
| **Architecture & Separation** | Separate `SourceReference`, `Site`, `Observation`, `Survey`, `FirePerimeter`, `GeologicalFeature`. Pure selection function safe from timezone shifts. | **VERIFIED** | Domain types in `src/prb/data/types.ts`; pure deterministic filtering in `src/prb/data/select.ts`; tests in `tests/prb/evidence.test.js`. |
| **Visual Cartography** | Restrained Positron default; 2D north-up default + 35° oblique toggle; no CRT overlays, ripples, stocks, or danger effects; reduced motion honored. | **VERIFIED** | `src/prb/map/styles.ts`, `src/prb/style.css`; CRT, ripples, tickers completely eliminated. |
| **Style Lifecycle Guard** | Idempotent research overlay mounting strictly on `style.load` with layer-existence checks (`map.getSource()`). | **VERIFIED** | Implemented in `src/prb/map/layers.ts` `onStyleReload()` with `hasSource`/`hasLayer` guards. |
| **Great Depression Purge** | Remove all macroeconomic simulations, stock tickers, trade bureau, and legacy demo entries. | **VERIFIED** | `index.html` is the primary PRB Explorer root; `src/main.ts` delegates to `prb/main`; all old simulation directories deleted. |
| **Outputs & Exports** | GeoJSON export, CSV export, printable Evidence Brief summary with caveats and SHA256 checksums. | **VERIFIED** | `ExportDialog.ts` generates validated GeoJSON, CSV, and popup printable brief window. |

---

## Completed Development Tasks

### [x] Task 1: Complete Great Depression Simulation Purge
**Description**: Fully eradicate the legacy 1929 Great Depression simulation files, UI components, scenario JSONs, and references.
**Acceptance Criteria**:
- `src/engine/`, `src/data/`, `src/visual/`, `src/ui/`, `src/style.css`, `public/data/scenarios/` removed.
- `index.html` transformed into the root PRB Coal-Fire Evidence Explorer.
- `src/main.ts` replaced with clean bootstrap delegating to `src/prb/main.ts`.
- Zero references to "Great Depression", "1929", "StockTicker", "FlightDeck", "rippleEffect" in application code.
- `README.md` updated to describe solely the PRB Evidence Explorer research project.

### [x] Task 2: Pure Evidence Domain Data Model & Ingestion
**Description**: Define immutable research data types and ingestion validator with integrity checks.
**Acceptance Criteria**:
- Distinct entities for `SourceReference`, `Site`, `Observation`, `Survey`, `FirePerimeter`, `GeologicalFeature`, and `DatasetManifest`.
- Geometry validation rejects malformed coordinates.
- Identifier validation catches duplicate IDs.
- Temporal validation rejects impossible date sequences (`startDate > endDate`).
- Separation of `reportedCondition`, `verificationStatus`, and `analystNotes`.

### [x] Task 3: Deterministic Timezone-Neutral Selection Engine
**Description**: Pure filtering logic for temporal windows and status criteria without browser timezone drift.
**Acceptance Criteria**:
- ISO calendar strings (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`) normalized without `new Date()` timezone offset shifts.
- Forward and backward stepping produces identical record sets.
- Last-observed status clearly flagged without assuming ongoing burning.

### [x] Task 4: Cartographic Engine & Idempotent Layer Manager
**Description**: MapLibre GL JS integration with restrained OpenFreeMap Positron default and MapLibre-contour DEM.
**Acceptance Criteria**:
- Idempotent overlay re-mounting strictly on `style.load` without tile-stream re-render loops.
- Topographic DEM contours and hillshading available as optional basemap theme.
- 2D Planimetric default with smooth 35° oblique perspective toggle.
- Category-specific symbology for thermal observations, vents, negative surveys, and fire scar polygons.

### [x] Task 5: Multi-Tab Research Evidence Panel & Scrubber Dock
**Description**: Accessible user interface containing inspector, tabular records, data gaps checklist, and manifest.
**Acceptance Criteria**:
- Evidence Inspector displays full provenance, measurement methods, and uncertainty caveats.
- Tabular records view allows direct inspection without clicking small symbols.
- Data Gaps & Limits tab explains empirical absence of fire vs absence of survey.
- Manifest tab displays verified SHA256 hashes and license terms.
- Timeline scrubber dock supports calendar range selection and synthetic fixture isolation toggle.

### [x] Task 6: Data Export & Printable Evidence Brief
**Description**: Export utilities for research dissemination and auditability.
**Acceptance Criteria**:
- GeoJSON export downloads clean FeatureCollection of filtered records.
- CSV export flattens observations with provenance and coordinates.
- Printable Evidence Brief opens dedicated window with study area metadata, caveats, and SHA256 checksums.

### [x] Task 7: Automated Test Suite & Production Build Verification
**Description**: Rigorous unit tests and production build verification.
**Acceptance Criteria**:
- `npm test` runs 6 unit test suites covering date normalization, duplicate detection, geometry validation, date ordering, and grouping preservation (100% pass).
- `npm run build` compiles `dist/` with 0 errors and 0 type warnings.
- Browser subagent verification confirms root `index.html` loads cleanly without console errors or legacy artifacts.

---

## Quality Requirements Checklist
- [x] No background processes in any commands — never append `&`
- [x] No automatic server startup commands assumed
- [x] Responsive layout with WCAG AA compliant contrast in light and dark modes
- [x] Safe DOM manipulation (no unescaped external input injection)
- [x] Synthetic test fixtures strictly quarantined behind toggle (`isSynthetic: true`)
- [x] Verified SHA256 checksums on all processed datasets

## Technical Notes
- **Hosting**: Configured for relative subpath hosting (`base: './'`).
- **Dependencies**: `maplibre-gl` (^4.0.0), `maplibre-contour` (^0.1.0), `typescript` (^5.0.0), `vite` (^5.0.0).
- **Study Area**: 2024 Remington Wildfire scar (Montana/Wyoming border, 196,368.1 acres).
