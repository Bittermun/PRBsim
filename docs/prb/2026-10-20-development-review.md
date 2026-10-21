# PRBsim development critique and revised implementation playbooks

Review date: 2026-10-20. Scope: the proposed satellite thermal-history explorer, offline field-survey workflow, and coal-seam process simulator, checked against the current repository and external sources.

Stable reference codes are maintained in the [concept and strategy index](INDEX.md): A1-A3 identify development concepts, B1-B3 identify strategies, and L1-L7 identify recorded lessons. This review's original playbook labels A/B/C correspond to B1/B2/B3.

The recommendation is to establish what each development can legitimately demonstrate before building its full interface. Research value, operational reliability, and explanatory clarity need separate acceptance criteria, supported by shared data contracts.

This review changes documentation only. The proposed developments and the defects identified below have not been implemented or fixed.

## 1. Corrections to the previous recommendations

**A satellite chart is not automatically a useful pre-fire baseline.** Landsat 8/9 thermal measurements have a native 100 m sampling scale, delivered on a resampled 30 m grid. A displayed 30 m cell does not create independent thermal detail. A small hot feature can contribute to a mixed pixel, so this is neither a guarantee of vent detection nor a hard prohibition on detecting subpixel heat. Detectability requires evaluating feature size, thermal contrast, sampling, and noise. [USGS instrument and processing documentation](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-landsat-archives-landsat-8-9-operational-land-imager-and).

Collection 2 Surface Temperature also has documented vegetation/emissivity adjustment errors, cloud-related issues, and missing-data dependencies. This product does not process nighttime acquisitions. Those limitations are especially relevant when comparing vegetation before and after a burn. The initial deliverable should therefore be a detectability and confounding assessment. [USGS product limitations](https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature).

**An offline form is only one component of a reliable evidence workflow.** Capture, submission revisions, attachments, review decisions, publication, and reproducible exports are separate responsibilities. A successful CSV import does not establish that the source record or its photographs can be reconstructed later.

**A conduction demonstration is not yet a combustion simulator.** A prescribed surface heat pulse can illustrate heat penetration and cooling. Sustained combustion additionally requires heat generation, fuel consumption, and oxygen supply. Surface reignition introduces further processes involving vegetation and weather. The previously cited coupled-process paper studies a mining-influenced, steeply inclined seam in Xinjiang; its field comparison does not validate Remington predictions. [Primary research and validation setting](https://www.mdpi.com/2571-6255/9/10/440).

**A checksum verifies correspondence to expected bytes.** It does not establish source authenticity, positional accuracy, methodological validity, or the truth of a causal claim. Retain the existing checksum checks while showing scientific review and source attribution separately.

**The three playbooks are complementary priorities, rather than complete interchangeable architectures.** They should share identifiers, provenance, uncertainty conventions, design tokens, and export semantics. Their computational pipelines and user workflows can differ.

## 2. Repository findings and their scope

| Finding | Evidence and impact | Required implementation response |
| --- | --- | --- |
| Progression filtering uses incident lifecycle dates rather than the polygon snapshot date. | `src/prb/data/select.ts:104`. An in-memory diagnostic with snapshots dated 2024-08-23 and 2024-09-01 returned both for a 2024-08-24-only window. This becomes consequential when progression data are added; the existing final-footprint display is a separate, intentionally static behavior. | Define two explicit operations: snapshots within an interval, and latest available snapshot at or before a selected time. Neither may show a future snapshot as current. Preserve the final footprint as labeled retrospective context. |
| Evidence-gap text is hard-coded. | `src/prb/data/assessment.ts:251` and `:289`. A diagnostic supplied progression snapshots and a matching pre-fire negative survey; the output still said there were no progression records and no pre-fire coverage, and retained the January 2025 final-footprint caveat. These were synthetic diagnostic inputs, so their presence must be reported as synthetic rather than as empirical support. | Derive checklist states from available records, provenance, applicability, and quality. Distinguish missing, outside the comparison window, synthetic only, present but unsuitable, and usable evidence. Presence alone must not satisfy a scientific requirement. |
| Coarse observation dates are filtered as exact days. | `src/prb/data/select.ts:118` passes `observationDate` and `endDate` without using `datePrecision`. A month-precision August observation stored as August 1 disappears from an August 15–31 window. | Represent uncertainty about event time explicitly. A month/year date can possibly overlap a window without implying activity throughout that whole month/year. Show the distinction between possible and certain temporal overlap. |
| Timeline limits are tied to the original case window. | `src/prb/ui/TimelineControl.ts:22` caps date inputs at 2025-12-31; the scrubber and playback use August–November 2024. The month buttons shift 30 days. | Derive selectable bounds from the loaded release and selected comparison. Give event history, observation filtering, and simulation elapsed time separate controls. Implement calendar-month shifts or label the existing shifts as 30 days. |
| The schema does not yet carry the operational evidence proposed for fieldwork. | `src/prb/data/types.ts:62` and `:118` lack structured instrument readings, units, calibration references, attachment identities, review history, and survey detection thresholds. The status union also combines verification categories and activity categories. | Add versioned measurement, survey-protocol, review, attachment, and activity fields through a documented migration. Keep verification level separate from whether a feature is active or cooled. |
| Browser checks are present but absent from continuous integration. | `.github/workflows/deploy.yml` runs unit tests and the production build; `package.json` separately defines `test:e2e`. | Add a focused browser job with the required browser runtime. Verify exported contents, temporal behavior, unavailable data, and failures, alongside interface visibility. |

The repository's synthetic-data quarantine, runtime validation, deterministic assessment functions, and export safeguards are useful foundations to preserve.

## 3. Source audit

The September 11, 2025 Montana Free Press article supports the attribution of the reported 107 burning seams to Cory Cheguis and CM Thermal and Fire, LLC. It also describes mapping work dating to 2022. That is a specific data-holder lead; it does not establish that the Remington area had pre-fire coverage, that coordinates are available for redistribution, or that 107 vents represent 107 independent newly ignited combustion bodies. The manifest should cite the actual article instead of the publication homepage. [Original reporting](https://montanafreepress.org/2025/09/11/smoldering-in-plain-sight-how-coal-seam-mapping-is-helping-mitigate-fire-risk-across-the-state/).

The February 2026 Montana DES/county mapping bulletin mentioned in the repository remains unverified in this review. An exact-description search and an official-site follow-up did not identify it. This does not demonstrate that it does not exist. Keep its unverified status, and require an actual document, identifier, or discovery record before treating it as an acquired primary source.

## 4. Hard questions and working answers

| Question | Answer and implementation consequence |
| --- | --- |
| What observation would actually distinguish new wildfire-induced combustion from a pre-existing fire? | Post-fire detection alone cannot do so. Seek time-resolved local fire exposure, a pre-fire baseline with stated sensitivity and coverage, subsequent field-confirmed combustion, and a physically plausible pathway. Even this is evidence to assess competing explanations, not an automatic causal score. |
| Can Landsat settle that question by itself? | No. It can test for detectable surface thermal patterns subject to product limitations and confounders. Absence of a satellite anomaly does not establish absence of underground combustion. Its useful product may be candidate areas and coverage gaps. |
| What would make us stop the satellite branch? | Insufficient usable observations, unresolved artifacts or controls, or target signals that cannot be distinguished at the available measurement scale. Record that outcome and redirect effort toward primary inventories or suitable field/aerial measurements. Set decision criteria before evaluating the pilot. |
| Are 107 mapped seams 107 independent coal fires? | The public article does not resolve that. Preserve source feature IDs and the original counting terminology. Make vent-to-site grouping a versioned hypothesis with supporting continuity evidence and uncertainty. Report vents, site hypotheses, and independently confirmed bodies separately. |
| Does a negative survey mean an area is coal-fire-free? | No. It means the specified method found no qualifying anomaly in its effective coverage during the stated interval and conditions. Store detection threshold, instrument, coverage, and relevant conditions. A walked track or enclosing polygon alone does not establish uniform detection over the interior. |
| Is a GPS accuracy value a guaranteed positional boundary? | No. ODK documents an estimated 68% confidence radius, and zero can identify a manually placed or mock-provider position. Preserve original semantics; map unknown accuracy to unknown, retain capture method, and account separately for perimeter uncertainty. [ODK geospatial semantics](https://docs.getodk.org/form-question-types/#capturing-geospatial-data). |
| How do we know imported records represent edits rather than duplicates? | Retain the external submission's logical identity and each version identity, scoped to source project and form. Re-importing an unchanged version is a no-op; a changed version creates a traceable revision. ODK explicitly distinguishes logical submission identity from version IDs and rejects stale updates. [ODK submission versioning](https://docs.getodk.org/central-api-submission-management/). |
| How can a model be trustworthy before Remington measurements exist? | Verify numerical implementation against analytical or independent reference problems. Validate physical predictions only against appropriate measurements, and reserve separate observations for evaluation after calibration. Until then, describe the model as a mechanism demonstration and expose its assumptions and applicability limits. |
| Can public deployment remain static while surveyors collaborate privately? | Yes. Maintain an operational source of submissions and publish reviewed, permitted snapshots into the static explorer. A live collaboration backend is needed only when shared editing or synchronization becomes a requirement. Never embed operational service credentials into public browser assets. |
| Can a fast slider change cause the map and export to describe different runs? | It can in a future asynchronous implementation unless prevented. Bind each request/result to an immutable analysis identity. Ignore obsolete worker results and export the exact inputs and result being displayed. The current synchronous assessment does not itself demonstrate this future race. |

## 5. Shared implementation foundation

Keep the existing TypeScript, Vite, and MapLibre foundation initially. Introduce focused domain modules with typed inputs, pure transformations, and explicit source adapters. Split the evidence panel only where a feature's responsibility requires it; avoid a project-wide framework migration as a prerequisite.

Define a versioned analysis context containing the dataset-release identity, selected geometry, comparison windows, quality rules, parameter values, and method version. Use it consistently for calculations, tables, maps, and exports. Canonical serialization must be defined before deriving content-based run identities. Distinguish exact reproduction of an archived output from numerical recomputation within a declared tolerance.

Evolve the schema additively with migration tests. Preserve current `isSynthetic` behavior while adding explicit distinctions for raw observations, derived products, and model outputs. Record verification/review state separately from combustion activity. Each numerical measurement needs a quantity, value, unit, method, time, instrument reference, and uncertainty or explicit unknown. Each grouped site needs an attributable grouping decision.

Keep source acquisition time, event time, measurement time, report publication time, and polygon snapshot time distinct. In the research workflow, the baseline comparison must remain explicitly available even when a display filter hides some observations; report this as analysis context rather than quietly changing the scientific basis when a timeline moves.

Use one visual language across the three developments: shared typography and controls; consistent evidence-state labels; explicit units and date precision; accessible textual alternatives; and visible distinctions between observation, inference, and simulation. Workflow-specific density can vary. Map color alone must not carry review or evidence status.

## 6. Revised playbook A: research through falsifiable questions

**Best fit:** satellite analysis and scientific evaluation of model results.

1. State the question and the alternatives before processing data. Example: does a selected region show persistent surface thermal contrast after the wildfire, beyond comparable seasonal and surface-cover effects? Do not substitute a claim of new underground ignition.
2. Audit source identity, access, redistribution rights, measurement scale, acquisition dates, and usable coverage. For the reported seam inventory, investigate the named mapper's survey definitions and whether any Remington-area pre-fire coverage exists.
3. Run a small data-feasibility pilot before building the full viewer. Inventory real scenes and quality masks, valid pixel counts/area, gaps, observation times, and candidate comparison areas. Evaluate sensitivity to cloud exclusion, season, surface cover, and processing choices. Synthetic injections can test processing mechanics; they do not supply missing field truth.
4. Produce a reproducible processing package. Archive scene/product IDs and versions, spatial reference, masks, scale/offset conversion, control-selection rules, algorithm version, and intermediate statistics. Check raster computations in an appropriate projected grid; preserve original georeferencing. Preprocess large rasters outside the interactive browser and publish only the products needed for the viewer.
5. Add the interface once the pilot establishes useful output. Display a map and linked chart with visible valid-observation coverage, uncertainty, and comparison definitions. Invalid or missing samples remain gaps; they must not become zero temperatures or continuous interpolated evidence.
6. Release a limited result with permitted claims and an explicit stopping decision. A defensible finding of insufficient evidence is a valid research outcome.

**First deliverable:** a scene-coverage/detectability report and one reproducible analysis for an explicitly selected area, using actual available data.

**Acceptance:** an independent rerun reproduces the archived result within declared tolerances; invalid pixels are excluded correctly; the output changes transparently when controls or quality rules change; all displayed claims stay within the pilot's demonstrated scope.

**Stop or redirect:** do not build a regional coal-fire detector if the pilot cannot distinguish relevant signals or obtain adequate reference observations. Target UAV/field data or inventory acquisition instead.

## 7. Revised playbook B: operations through preserved evidence and review

**Best fit:** field surveys and acquisition of verification data for the satellite and simulation branches.

1. Agree on a field protocol and review policy before finalizing the form. Define a vent versus a site, required measurements and units, location-capture methods, negative-survey coverage, and what permits a record to be called field-confirmed.
2. Use ODK Collect for capture and the existing ODK submission infrastructure where available. Begin with an exported evidence package rather than requiring a new live integration. Full offline map viewing in PRBsim is separate work: its current basemaps, fonts, and terrain are remotely supplied.
3. Preserve original submission data, form version, logical/version IDs, and attachments as an immutable intake package. Confirm that expected attachments are present. Hash originals and keep source-file-to-observation mappings. For later API integration, preserve the same package boundary and keep credentials outside the public viewer.
4. Normalize in a staging area. Convert ODK latitude/longitude ordering to GeoJSON longitude/latitude; preserve the raw position and reported accuracy semantics. Zero from manual placement is not perfect accuracy. Validate units, timestamps/time zones, precision, geometry, source references, and parent-site references before publication.
5. Import with explicit transactional boundaries. Repeated identical versions do nothing. New versions preserve previous revisions. Conflicts and incomplete attachments stay pending for review. Reject an invalid batch atomically, or explicitly identify each accepted/rejected record under a documented partial-import policy; do not silently publish a half-complete batch.
6. Review and publish an authorized snapshot. Separate operational approval from scientific verification. Carry review and grouping decisions into the release. Publish precise locations only when the data owner's terms permit them.

**Interface:** a compact capture flow; separate collected, uploaded, imported, reviewed, and published states; a review queue showing raw versus normalized values and revision differences. Verify the design on intended field devices and with actual users.

**First deliverable:** one complete survey package, including media and a negative-survey record, imported twice without duplication and then re-imported as a traceable edited version.

**Acceptance:** interrupted capture recovers; missing media blocks the relevant publication step; units and coordinate order survive round trips; unchanged re-imports are no-ops; stale versions do not overwrite newer decisions; exports identify the exact reviewed release.

**Stop or redirect:** if there is no survey partner or lawful data access, deliver an importer/protocol demonstrator using clearly labeled fixtures rather than presenting it as a verified inventory.

## 8. Revised playbook C: simulation through staged physical capability

**Best fit:** the process simulator and educational explanations.

1. Declare a claim boundary for each model stage. Stage 1: heat penetration/cooling under a prescribed boundary condition. Stage 2: simplified reactive heat release with finite fuel and oxygen transport. Subsequent stages may examine relevant structural or surface-fuel processes only with suitable measurements and parameters.
2. Verify a simple conduction problem first. Check dimensions and units, analytical reference solutions, energy balance, grid and time-step convergence, and numerical stability. This verifies the solver's implementation, not the Remington ignition hypothesis.
3. Expand to a representative two-dimensional section only when the previous checks hold. Make geometry, initial conditions, boundary conditions, parameter sources, and validity ranges explicit. A second spatial dimension does not itself add combustion physics.
4. Add reaction and transport with separate tests. Check fuel/oxygen accounting, physically admissible concentrations, heat-release behavior, boundary fluxes, and limiting cases. Perform sensitivity and identifiability analysis: if multiple parameter combinations fit the same observations, report that ambiguity.
5. Calibrate against appropriate measurements and evaluate against independent observations. Do not adopt constants or geometry from the Xinjiang study as established PRB values. Until local validation exists, label scenarios as illustrative rather than calibrated site forecasts.
6. Implement interactive execution through a small model interface. Use bounded job sizes, run IDs, progress, cancellation, and stale-result rejection. A worker improves interface responsiveness; it does not establish numerical speed, correctness, or physical validity. Choose browser execution versus precomputed results after measuring representative workload.
7. Present side-by-side scenarios with the same temperature scale and elapsed-time reference. Save the complete setup, solver/method version, grid/time step, parameter values, and output. Provide accessible numeric summaries alongside animation.

**First deliverable:** a verified heat-transport demonstration with reproducible scenario comparison, accurately named for the physics it includes.

**Acceptance:** agreement with independent benchmark solutions under stated tolerances; convergent results; documented conservation checks; reproducible saved scenarios; cancellation and rapid parameter changes cannot replace the current result with an obsolete run.

**Stop or restrict claims:** when parameters or geometry are unidentifiable, keep the feature as a mechanism explorer. Do not issue ignition dates, probabilities, or operational risk maps on the strength of an illustrative heat animation.

## 9. Order of work and verification record

Recommended order: correct temporal/evidence semantics and exact source links; establish shared analysis and import contracts; run a small satellite feasibility pilot while investigating primary inventory availability; develop the field intake/review slice when a partner or dataset is available; then build the staged simulation demonstrator. Major investment in each branch depends on its own demonstrated value.

Prefer small vertical slices that produce an inspectable result. Put regression cases for future snapshots, coarse dates, dynamic evidence states, import versions, and stale asynchronous results next to the responsible module. Add browser checks for complete user flows and exported contents. Reserve numerical and scientific validation for independent reference cases, not merely tests that repeat the implementation.

Verification performed on the current application source during this review:

- `npm test`: 29 tests passed, 0 failed.
- `npm run build`: type checking and the production build succeeded.
- Separate in-memory diagnostic probes reproduced the progression-date and static-checklist problems, and demonstrated the coarse-date filtering behavior. Fixtures were not added to empirical application data.
- Existing browser/device checks, actual Landsat scene processing, field operations, and numerical simulation benchmarks were not executed in this review.

Passing current tests does not establish the scientific validity of a future feature. The report records the decision criteria and validation still needed for each branch.
