# Spatiotemporal Evidence Inspector — Proposal Review and Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` if implementation is requested. Steps use checkbox syntax. This document is a review deliverable, not authorization to implement the feature or a scientifically validated attribution model.

**Goal:** Let researchers inspect spatial and temporal relationships without converting missing evidence, map proximity, or first detection into causal attribution.

**Architecture:** A pure, deterministic evidence-assessment module consumes filtered, provenance-checked records. One application selection state drives the inspector, a static map target, and a separately identified analysis section in reports. Existing observation records remain unchanged.

**Tech stack:** Existing vanilla TypeScript, MapLibre GL JS, Node >=24, TypeScript-strip Node tests, Vite. No new runtime dependencies for the first release.

**Spec:** The corrected design and evidence rules in sections 3–5 of this document. This is a consolidated review and proposed plan; the original AI's two claimed design files are absent from the inspected checkout.

## 1. Review outcome

**Recommendation: retain the interaction concept, replace the causal engine.** The proposal identifies a useful question but promises scientific conclusions its inputs cannot establish. The current application can support an auditable relationship inspector. It cannot support numerical causal probabilities.

### What is sound

- A pure evaluation module is appropriate and easy to test independently of the map.
- Map selection, an inspector card, and a reproducible evidence brief are useful integrations.
- Comparing observation dates with incident dates is useful when the reference event is accurately named.
- Source references, synthetic quarantine, and missing-data explanations should accompany every derived result.
- A future evidence-acquisition phase can improve the research value without changing the basic interaction.

### Corrections required before implementation

| Original proposal | Review | Corrected requirement |
| --- | --- | --- |
| Normalized scores labeled P(wildfire→seam), P(seam→wildfire), P(independent) | Normalizing hand-picked weights does not establish probabilities or a Bayesian model. No priors, likelihoods, calibration dataset, or validation procedure are supplied. | No percentages, winning hypothesis, or causal-confidence badge. Show measured relationships and missing evidence. |
| Discovery date used as fire arrival at the selected location | Incident discovery is not local fire arrival. The bundled perimeter is a retrospective final footprint. | Name any calculable delta `daysFromIncidentDiscovery`; keep `localFireArrivalDate` unavailable in v1. |
| Post-fire observation becomes “post-fire induced” | Observation time is not ignition time. More post-fire search effort can expose previously undetected combustion. | Label “observed after incident discovery”; causal direction remains unresolved. |
| Deep perimeter interior means high residence time | Distance from an outer boundary does not measure duration, severity, heat transfer, or whether an internal location burned. | Report footprint relation and approximate boundary distance only. |
| Boundary means high ember convection | The final boundary supplies no convection or firebrand measurements. | Remove that mechanistic interpretation. |
| 500 m thermal-conduction and 2,000 m ember-transport rings | Neither radius is established by the supplied evidence. Isotropic rings do not model those mechanisms. | Omit physical-range rings in v1. Optional later circles must be labeled user-selected reference distances. |
| Three competing hypotheses are exhaustive | Wildfire-induced onset and later surface reignition can occur in one sequence. Pre-existing combustion, newly exposed vents, and detection bias are additional explanations. | Treat pathways as non-exclusive research questions, without normalization. |
| Works on a point of origin or county borders | No separate origin-point or county-boundary evidence dataset is bundled in the inspected data model. A basemap feature is not an acquired research observation. | Use only bundled research records and explicitly user-selected coordinates. |
| Clinker overlap establishes chronic active combustion | Clinker provides geological context; it does not by itself date or verify a presently active fire. Bundled geology is schematic. | Show context with provenance and coverage limits; never promote fixture intersections to empirical support. |
| Nearby aligned vents yield realistic underground acreage/volume | Surface proximity does not establish subsurface connectivity, depth, or thickness. | Preserve existing grouping uncertainty. Do not infer underground area or consumption. |
| About 150 lines, zero dependencies, clean integration | Omits geometry edge cases, provenance, selection lifecycle, exports, accessibility, and browser verification. | Estimate by independently verifiable tasks, not line count. |

### Ranking the three options

1. **Evidence inspector plus evidence-acquisition checklist:** most useful now, because it exposes exactly what is calculable and what blocks the core inference.
2. **Site-grouping review tools:** useful after audited vent data arrive. Existing `CoalFireSite` and `groupObservationsBySite` already address the counting issue; add review support before automated connectivity inference.
3. **Wind/terrain scenario visualization:** separate exploratory work after weather and fuel inputs and a model-validation protocol exist. Rendered hillshade and contours alone are not a terrain sampling or firebrand transport engine. The stated 240°/25 mph historical default and 300–800°C vent range require site-specific sources before adoption.

## 2. Observed repository baseline (2026-10-03)

- `manifest.json` declares one empirical WFIGS final perimeter and no acquired empirical coal-fire inventory or local geological vectors.
- Perimeter metadata explicitly identifies map date 2025-01-15 and `retrospective_final_footprint`.
- Geological features and coal-fire/survey fixtures are synthetic. Runtime byte hashes and referential validation are already implemented.
- The manifest records general/specific incident cause as Natural / Lightning with investigation flag 0. Preserve this source-reported record and its qualification; geometry-derived suggestions must not overwrite it.
- `npm run build`: passed. Vite reported the existing large-chunk warning.
- `npm test`: passed, 10 tests across 4 suites.
- Neither `docs/superpowers/specs/2026-10-01-bidirectional-causal-attribution-design.md` nor `docs/superpowers/plans/2026-10-01-bidirectional-causal-attribution.md` exists in this checkout. This review assesses the pasted proposal, not those unseen artifacts.

### Actual integration anchors

Line numbers below describe the inspected baseline and will shift after edits. Use function names as durable anchors.

| File and current anchor | Required integration |
| --- | --- |
| `src/prb/data/types.ts`, existing domain interfaces | Reuse record/source types; put new derived types in `assessment.ts` to avoid expanding acquisition schemas unnecessarily. |
| `src/prb/data/load.ts:208`, `validateDatasetIntegrity`; `:457`, `loadPRBEvidenceData` | Preserve source checks and hash verification. No data-file edits required for v1. |
| `src/prb/data/select.ts`, `filterEvidence` | Assess only the active filtered evidence; disclose that this is a filtered view, not an exhaustive search. |
| `src/prb/map/layers.ts:161`, `initEvidenceLayers`; `:427`, unified click handler | Extend the existing click dispatch. Do not add a competing canvas listener. |
| `src/prb/ui/EvidencePanel.ts:71`, `setOnFeatureSelect`; `:145`, `updateFilteredData`; `:187`, `selectFeature` | Add typed location-assessment rendering and coordinate-entry callbacks; preserve feature cards and selection reconciliation. |
| `src/prb/main.ts:77`, active filtered data; `:93`, table callback; `:108`, layer mount; `:122`, timeline callback; `:159`, basemap switch | Centralize assessment selection, recomputation, clearing, and style rehydration. |
| `src/prb/ui/ExportDialog.ts:86`, `buildExportGeoJson`; `:194`, `buildExportCsv`; `:328`, `buildStaticBriefHtml` | Keep empirical features intact. Add separately identified analysis metadata/brief content and a dedicated assessment CSV builder. |
| `src/prb/ui/ExportDialog.ts:675`, `:689`, `:704`, browser helpers | Pass the reconciled assessment through download/print helpers; do not assess ad hoc during serialization. |
| `tests/prb/evidence.test.js` | Preserve existing hash, quarantine, grouping, temporal-role, escaping, and export regressions. |

## 3. Corrected design and scope

### First-release user flow

1. A feature click continues to show its existing evidence card.
2. A point observation additionally shows its spatial relationship to available perimeters and day-precision timing relative to incident discovery.
3. An empty-map click or validated longitude/latitude form inspects a **user-selected coordinate**, not a new coal-fire record. It has no observation date or coal-fire status.
4. Polygon observations retain their full evidence cards. V1 displays “point relationship not evaluated for polygon geometry.” A table bounding-box center used for navigation must never become an observation coordinate.
5. One static target marks the selected query coordinate. No animation or physical ignition buffers.
6. The inspector presents source-backed context and missing evidence. Its conclusion is “Causal direction unresolved from available evidence.”
7. The printable brief can include that assessment, with the query origin and limitations. Default observation CSV retains its existing schema; a separate assessment CSV carries derived metrics.

### Evidence rules

- **Inside a final footprint:** means inside the mapped polygon, not verified local burning, residence time, severity, ignition, or active subsurface combustion.
- **Outside a final footprint:** means outside that polygon, not outside the study area and not confirmed unburned.
- **No matching geological polygon:** means no matching acquired context in the active view, not no coal. Even with real vectors, absence cannot be inferred without coverage metadata.
- **Survey intersection:** report the dated survey record and result. No-thermal-anomaly detection is not proof of no subsurface fire; existing survey metadata do not encode complete sensitivity or detection limits.
- **No active observation:** means none in the current filter. Do not infer absence of fire or exhaustive absence of records.
- **Known coordinate uncertainty:** report the supplied accuracy separately. An accuracy disk touching the boundary makes the relationship uncertain with respect to the observation location, but is not a statistical confidence interval.
- **Unknown coordinate uncertainty:** preserve null, mark uncertainty unknown, and label containment as nominal-coordinate geometry only.
- **Hash verification:** verifies byte identity against the manifest, not independent truth or precision of a scientific interpretation.
- **Synthetic influence:** any assessment that uses a fixture record, synthetic parent site, or synthetic source is synthetic-influenced and visibly labeled. Mode alone is insufficient to identify influence; track actual input references.
- **Dates:** exact deltas require `datePrecision === 'day'`. Month/year precision produces null and a specific caveat in v1. `endDate` is an observation interval and `lastObservedDate` a follow-up observation; neither supplies ignition onset.
- **Local arrival:** always unavailable in v1. Even future progression snapshots may only bracket arrival, subject to mapping intervals, geometry quality, and unburned islands.
- **Persistence and later reignition:** cannot be established by a single post-fire observation; the full research chain needs separately sourced longitudinal combustion and surface-ignition records.

### Explicit exclusions

No posterior probabilities, confidence percentages, ignition chronology reconstructed from the final polygon, hard-coded geographic risk zones, inferred underground fronts, consumed coal volume, arbitrary origin pins, or changes to checked-in data bytes/hashes.

## 4. Proposed interfaces

Create `src/prb/data/assessment.ts` with the following public contract. Imports are type-only from `types.ts` and `select.ts`; pure tests must not import MapLibre or a DOM.

```ts
export type LonLat = [number, number];
export type AssessmentSelection =
  | { kind: 'coordinate'; coordinate: LonLat }
  | { kind: 'observation'; observationId: string };

export interface InputReference {
  recordId: string;
  sourceId: string;
  processedSha256: string;
  hashVerified: boolean;
  isSynthetic: boolean;
}

export interface PerimeterRelationship {
  perimeterId: string;
  nominalRelation: 'inside' | 'outside' | 'boundary';
  approximateBoundaryDistanceMeters: number;
  coordinateUncertainty: 'unknown' | 'boundary_overlap' | 'no_boundary_overlap';
  localFireArrivalDate: null;
  daysFromIncidentDiscovery: number | null;
  temporalReference: 'incident_discovery';
}

export interface LocationAssessment {
  schemaVersion: 1;
  methodVersion: 'prb-evidence-context-v1';
  selection: AssessmentSelection;
  coordinate: LonLat;
  queryOrigin: 'user_selected_coordinate' | 'observation_record';
  accuracyMeters: number | null;
  observationDate: string | null;
  observationDatePrecision: 'day' | 'month' | 'year' | null;
  observationEndDate: string | null;
  lastObservedDate: string | null;
  filterWindow: { startDate: string; endDate: string; includeSynthetic: boolean };
  relationships: PerimeterRelationship[];
  geologicalRecordIds: string[];
  surveyRecordIds: string[];
  inputReferences: InputReference[];
  syntheticInfluence: boolean;
  causalConclusion: 'unresolved';
  caveats: string[];
}

export function assessLocation(
  selection: AssessmentSelection,
  filtered: FilteredEvidenceResult,
  manifest: EvidenceManifest,
  filter: FilterState,
  syntheticSources?: DatasetSource[]
): LocationAssessment | null;
```

Return null when a selected observation is hidden or has polygon geometry. Invalid coordinate input throws the existing `ValidationError`. Unknown source references or unverified empirical inputs fail closed with `ValidationError`; missing evidence collections produce an assessment with empty arrays and caveats. Referenced parent-site synthetic status contributes to `syntheticInfluence`; its source provenance is carried by the observation because sites have no `sourceId`.

Relationships are per perimeter, sorted by ID. Do not silently select the nearest polygon as the authoritative incident. Geology and survey matches are also sorted; if multiple units overlap, preserve all IDs rather than choosing one formation. Deterministic output contains no wall-clock timestamp; exporters may add `exportedAt`.

Create `src/prb/data/geometry.ts`:

```ts
export function classifyPointInGeometry(
  point: LonLat, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
): 'inside' | 'outside' | 'boundary';
export function approximateBoundaryDistanceMeters(
  point: LonLat, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
): number;
```

Containment handles exterior rings, holes, multipolygons, vertices, and edges. Define a 0.01 m numerical boundary tolerance; label this a computational tolerance, never source accuracy. Distances include all rings, including hole boundaries. Use a query-centered local equirectangular projection, Earth radius 6,371,000 m, radians, and cosine of the query latitude; never run planar distances directly on degree pairs. Supported metric envelope for v1: coordinates and geometries within longitude −110° to −102°, latitude 43° to 47°. Reject out-of-envelope metric queries explicitly instead of extrapolating. This envelope is a computational restriction, not the study-area boundary.

Before accepting the approximation, check independent reference distances over the supported envelope, including diagonal and far-separated segments. Require error ≤ max(2 m, 1% of reference distance). If it fails, narrow and disclose the supported envelope or adopt a validated geodesic implementation; do not relax the threshold silently. Reference values must come from an independent documented method, not the production helper. Round UI distance to 10 m and include “approximate”; exported numeric values retain calculation precision and method metadata, without implying measurement precision.

## 5. Research questions displayed alongside the metrics

Use three unranked questions, each with required evidence and what is missing:

| Pathway question | Evidence needed beyond current metrics |
| --- | --- |
| Did surface fire initiate or reactivate subsurface combustion? | Local exposure/arrival constraints, pre-fire detection coverage and sensitivity, verified post-fire combustion, physical pathway evidence, and alternative explanations. |
| Did subsurface combustion ignite a particular surface fire? | Verified active combustion before that surface event, event location/time and investigation records, plausible documented mechanism, fuel/weather context, alternatives. Distinguish initial Remington ignition from later separate surface fires. |
| Was combustion already present, exposed, or newly detected? | Pre-fire site records, repeat surveys, geological context, survey effort and visibility changes, grouping metadata. These explanations can coexist. |

Do not declare a pathway contradicted merely because one required input is absent. No selected coordinate in the current real dataset can answer these causal questions.

## Global constraints

- Node >=24; vanilla TypeScript, no React/JSX/Tailwind.
- Preserve checked-in datasets and SHA256 values.
- Real views/exports exclude fixture-derived assessments.
- Existing final perimeter stays static across the timeline; no pseudo-progression.
- Use existing CSS tokens and readable light/dark theme states; do not rely on color alone.
- Preserve original source-reported cause, source limitations, grouping uncertainty, and null accuracy.
- Run `npm run build` and `npm test` before claiming implementation complete.

## Review focus

1. Polygon observations must not be reduced to navigation centers for analysis (tasks 2, 4).
2. Changing fixture mode/date filters must clear hidden-record assessment and its target/export state (tasks 3, 4, 5).
3. Overlapping features and basemap reloads must yield one click result and restore one target (task 3).
4. Holes, boundaries, uncertain coordinates, and coarse dates must not produce falsely exact conclusions (tasks 1, 2).
5. A user query and schematic context must never appear as a verified coal-fire record (tasks 2, 4, 5).

## 6. Implementation tasks

### Task 1: Geometry with an explicit approximation contract

**Files:** Create `src/prb/data/geometry.ts`, `tests/prb/geometry.test.js`.
**Consumes:** Existing GeoJSON types and `validateCoordPair`/`validateGeometry` validation patterns.
**Produces:** The two geometry signatures in section 4.

- [ ] Write tests for inside/outside/boundary, holes, multipolygon parts, repeated vertices, zero-length segments, and invalid/non-finite coordinates. Assert hole interiors are outside and hole edges boundary.
- [ ] Add independently sourced metric reference cases and the error threshold in section 4; document reference method and values in the test file. Include an unsupported-envelope rejection.
- [ ] Run `node --experimental-strip-types --test tests/prb/geometry.test.js`; confirm tests fail because helpers are absent.
- [ ] Implement the minimal helpers and validate their supported inputs.
- [ ] Repeat the targeted test command; require every case to pass.

### Task 2: Evidence assessment without causal scoring

**Files:** Create `src/prb/data/assessment.ts`, `tests/prb/assessment.test.js`.
**Consumes:** Task 1 helpers, `FilteredEvidenceResult`, manifest/source records, filter state.
**Produces:** `assessLocation` and section 4 types.

- [ ] Assert current real mode yields context for a user coordinate, null observation timing/local arrival, empty empirical geology/survey matches, and `causalConclusion === 'unresolved'`.
- [ ] Assert exact day delta is relative to discovery only; month/year dates produce null; interval end/last-observed values never become ignition times.
- [ ] Assert point accuracy overlapping a boundary is flagged; null accuracy remains unknown. Cover empty/multiple perimeters and overlapping geology IDs.
- [ ] Assert synthetic source, observation, parent site, or matched geology influence propagates. Reject unverified empirical/source-missing input. Hidden or polygon observations return null.
- [ ] Run the targeted assessment tests and observe failure before implementation.
- [ ] Implement the pure assessment with stable ordering, referenced hashes, explicit filtered-view caveats, and no scores. Run targeted tests to pass.

### Task 3: One selection path and resilient map target

**Files:** Modify `src/prb/map/layers.ts`, `src/prb/main.ts`; create `tests/prb/assessment-map.test.js`.
**Consumes:** Task 2 assessment, current feature-click priority and basemap mounting.
**Produces:** Optional third argument `coords: [number, number]` on the existing feature-click callback; optional fourth `onEmptyMapClick` argument on `initEvidenceLayers`; `initAssessmentLayers(map)` and `setAssessmentTarget(map, coordinate: LonLat | null)`.

- [ ] Use a lightweight MapLibre mock to assert only one click handler after repeated mounts; preserve observation → survey → perimeter → geology priority. Assert empty hits trigger the coordinate callback, including when no evidence layers exist yet.
- [ ] Implement the extension inside the existing unified handler. Feature hits return after dispatch; assessment target is excluded from hit-priority layers. Its source is a user-query overlay, not a coal-fire source.
- [ ] Add one `AssessmentSelection | null` and one `LocationAssessment | null` in `main.ts`. One function resolves input, assesses, renders, and updates the target. Clear a hidden observation immediately when filters change; recompute coordinate queries against the new active view.
- [ ] Recreate target source/layers after style changes, then reapply current selection. Keep coordinate-query callbacks bound once through the existing handler management.
- [ ] Run mock tests. Manually verify repeated basemap switches, overlap clicks, filtering, and target clearing in a browser during task 6.

### Task 4: Inspector and accessible coordinate input

**Files:** Modify `src/prb/ui/EvidencePanel.ts`, `src/prb/style.css`, `src/prb/main.ts`; create `tests/prb/assessment-ui.test.js`.
**Consumes:** Task 2 result and task 3 selection state.
**Produces:** Pure `renderLocationAssessmentHtml(assessment: LocationAssessment): string`; public `showLocationAssessment(assessment: LocationAssessment | null): void`; public `setOnCoordinateInspect(cb: (coordinate: LonLat) => void): void`.

- [ ] Assert rendered output labels user coordinates, final footprint, approximate distance, unknown accuracy, unresolved causal direction, fixture influence, and missing evidence. Assert no probability meter or “post-fire induced” conclusion.
- [ ] Render the assessment inside a dedicated inspector subsection; append to point-observation cards and use it alone for coordinate queries. Preserve feature selection ID/card behavior and existing tabs.
- [ ] Add longitude/latitude inputs with labels, finite/range validation, an inspect submit action, and a clear action invoking the central selection-clearing function. Keyboard users get the same assessment as map users. Escape text and sanitize source links using existing helpers.
- [ ] Preserve table navigation for polygon features without requesting point analysis; IDs, not displayed table coordinates, determine observation assessment.
- [ ] Run pure renderer tests including malicious labels and URLs; manually check focus, validation messages, and both themes in task 6.

### Task 5: Reproducible derived analysis in exports

**Files:** Modify `src/prb/ui/ExportDialog.ts`, `src/prb/main.ts`, `tests/prb/evidence.test.js`; create `tests/prb/assessment-export.test.js`.
**Consumes:** Current reconciled assessment, active filter/window, existing escaping helpers.
**Produces:** `buildAssessmentCsv(assessment: LocationAssessment): string`; optional trailing `assessment?: LocationAssessment | null` parameters on GeoJSON/brief builders and browser wrappers; pure `validateAssessmentForExport(assessment, filtered, filterState): void`.

- [ ] Test current exports without an assessment retain their behavior. Test GeoJSON adds assessment only under `metadata.locationAssessment`, never as an observation Feature or causal properties on empirical features.
- [ ] Validate assessment filter window/mode equals export scope, referenced records remain active, and fixture influence is disallowed in real mode. Reject stale/inconsistent input rather than silently exporting it. Tests call builders directly to verify this boundary, not only application wiring.
- [ ] Add a separately titled analysis section to the brief with query origin, coordinate, reference event, method version, input hashes, synthetic warning, caveats, and unresolved conclusion. Caption any visible target in the map snapshot.
- [ ] Implement separate assessment CSV: one row per perimeter relationship, or one context-only row if no perimeter exists. Include query origin/coordinate, observation fields, temporal reference, nominal relation, approximate distance, method version, filter scope, synthetic influence, JSON-encoded input references and caveats. Reuse `escapeCsvCell`; null stays blank. Keep default evidence CSV schema unchanged.
- [ ] Add an assessment-download action in the inspector enabled only for a current valid assessment; update browser wrappers consistently. Test stale fixture mode, changed date window, injection strings, and JSON round-tripping.
- [ ] Run targeted export tests plus the existing evidence suite.

### Task 6: Full flow verification and methods documentation

**Files:** Modify `docs/prb/methods.md`, `docs/prb/limitations.md`; revise source documentation only if new exact citations are added.
**Consumes:** Completed tasks 1–5.
**Produces:** Verified feature and clear user-facing limitations.

- [ ] Document metric envelope/error check, exact temporal reference, polygon limitation, fixture influence, separate query export, and required evidence before future attribution work.
- [ ] Run `npm run build` and `npm test`; require exit code 0 and no failing tests. These prove mechanics/regressions, not causal-model validity.
- [ ] Browser-check real mode coordinate selection and keyboard input; point and polygon fixture selection; switching back to real mode; timeline hiding; repeated basemap changes; layer toggles; clear action; GeoJSON, both CSV paths, and print brief including popup/download fallback.
- [ ] Confirm no inferred observation appears in records count, real exports, target legend, or printed provenance. Confirm a final footprint remains static throughout scrubbing.
- [ ] Review fixture-influenced screenshot and print content in light/dark themes; verify text labels, contrast, and keyboard focus.

## 7. Data acquisition and future claim gates

The next research investment should be acquiring primary records, not adding numerical confidence to current gaps.

| Missing input | Acquisition acceptance requirements | What it would enable |
| --- | --- | --- |
| Primary vent/site inventory | Raw agency file, exact download/citation, license, dates, coordinate precision, detection method, grouping definitions, hashes | Empirical spatial comparison and defensible vent/site counts |
| Pre-fire records and bounded negative surveys | Survey coverage/date, modality, effort, sensitivity and limitations | Constraints on pre-existing detection; still not absolute absence |
| Fire progression/local exposure | Timestamped primary perimeters or exposure products with uncertainty and temporal interpretation | Arrival brackets; no residence time from footprint depth alone |
| Local geology and coverage | Audited vectors, mapping scale, covered area, unit semantics | Real geological context; not direct confirmation of active combustion |
| Repeat combustion observations | Site identity, measurement methods, repeated dates, gaps and precision | Evidence for persistence rather than a single detection |
| Surface ignition investigations | Event ID, time/location, reported vs investigated cause, mechanism evidence and alternatives | Case-specific evaluation of later surface reignition |
| Connectivity/depth measurements | Boreholes/geophysics, seam geometry, uncertainty | Reviewed grouping or volume estimates only within measurement limits |

Any later probabilistic attribution phase needs a defined estimand/event, explicit alternatives, source-backed physical assumptions, priors and likelihoods or an independently calibrated statistical model, dependence handling, labeled validation cases, calibration/error assessment, sensitivity analysis, and scientific review. Until then, neither a weighted index nor normalized bars should be described as probabilities.

### Effort and release decision

Planning estimate: **4–7 focused developer days** for the corrected v1, including meaningful geometry references, map lifecycle, exports, and browser checks. This is a judgment estimate, not a measured guarantee; data acquisition is separate and has no reliable schedule yet. Release the inspector when the acceptance checks pass and missing inputs remain plainly visible. Defer wind corridors, automatic connectivity, and causal probabilities.

## 8. External source checks and limits of this review

- [USGS: Geologic history of natural coal-bed fires, Powder River basin, USA](https://www.usgs.gov/publications/geologic-history-natural-coal-bed-fires-powder-river-basin-usa) identifies substantial regional clinker from natural coal-bed fires. This supports caution against treating clinker as unique evidence of a recent wildfire-induced event; it does not date any selected local polygon.
- [NWCG: Crown Fire — Spotting Fire Behavior](https://www.nwcg.gov/publications/pms437/crown-fire/spotting-fire-behavior) describes spotting calculations involving wind and firebrand/vegetation conditions, and distinguishes ignition probability in receptive fuels. It does not support a universal 2,000 m coal-vent transport radius.
- Both sources were found through web search; direct page fetches returned timeout/403 during this review. The review uses the accessible search extracts only and does not claim a full-text literature review or verification of the proposal's site-specific temperatures/weather defaults.
- Local repository statements above are checks of acquired files and code, not a fresh audit of all currently available agency datasets. “Not acquired here” must not be rewritten as “does not exist.”

Self-review: design requirements map to tasks 1–6; types/signatures are consistent; five review-focus cases have assigned tests; no product code or data bytes changed for this planning request.
