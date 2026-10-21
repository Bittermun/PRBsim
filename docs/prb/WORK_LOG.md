# PRBsim working memory and learning log

This is the assistant's project record. It preserves user intent, evidence, successful and unsuccessful approaches, corrections, and follow-up questions. The user does not need to use its reference codes. The [index](INDEX.md) holds stable IDs; the [development review](2026-10-20-development-review.md) holds the earlier detailed critique.

## 2026-10-20: user clarification, combined fire evidence, and software reuse

**User intent.** The reference system is for the assistant to remember and learn from previous work. The user wants plain-language answers to questions about combining surface and underground fire records, using existing software, and adding further features through that approach.

**Correction to the previous response.** The index was presented too much as a vocabulary for the user to learn. Its primary role is now explicit: internal continuity. Record both successful and unsuccessful outcomes, not just a list of ideas. Root project guidance points future work to these notes.

### Questions to account for

| Question | Working answer | Remaining check |
| --- | --- | --- |
| Are we essentially overlaying surface-fire information and underground-fire reports? | Yes. A core capability is to put surface boundaries, dated underground-fire observations, and relevant geological context on the same map and timeline. Matching location and time makes relationships inspectable; overlap alone does not determine which fire caused which. | Acquire suitable underground records and define their dates, spatial precision, counting units, and coverage. Preserve the static final-footprint meaning of the currently bundled perimeter. |
| Do underground reports or inventories exist? | Yes, there are mapped surveys and inventories with differing scopes. The previously verified Remington reporting identifies a specific mapping group. OSMRE's public e-AMLIS inventory concerns legacy mining impacts and includes both unresolved and reclaimed problems; it is not a comprehensive inventory of natural coal-seam fires. | No complete, georeferenced public Remington underground-fire inventory has been acquired or validated in this review. Check primary data access and permissions rather than infer absence from unsuccessful searches. |
| Can existing tools and GitHub code supply more capabilities? | Yes. Reuse already underpins the project's MapLibre mapping and Turf geometry. Verified candidate tools cover satellite-catalog searches, document parsing, and geophysical simulation/inversion. Their documented capabilities do not establish suitability for PRBsim's actual inputs. | Test a small representative input, inspect maintenance and licensing, evaluate output quality and integration cost, and retain version information before adopting a dependency. |
| Does reverse engineering let us reconstruct underground activity? | Reading public code can recover or adapt its methods. In geophysics, inversion estimates underground properties from measurements; it requires actual measurements and assumptions. It does not produce a direct photograph of a coal fire or establish that a subsurface feature is burning. | Determine whether suitable resistivity or other geophysical observations exist, and whether alternative underground structures could explain them. |

### Evidence checked in this turn

- **Surface mapping:** NIFC publishes interagency fire-perimeter products. This is a usable source family for the surface layer, with each product's temporal meaning and completeness still needing inspection. [NIFC Open Data](https://data-nifc.opendata.arcgis.com/).
- **Underground/legacy mine inventory scope:** OSMRE describes e-AMLIS as an inventory of land and water affected by legacy coal mining, based on program field surveys and limited by program eligibility. Do not generalize its coverage to all naturally burning seams. [OSMRE inventory description](https://www.osmre.gov/programs/e-amlis).
- **Remington data-holder lead:** original reporting attributes 107 mapped burning seams to Cory Cheguis and CM Thermal and Fire. Reporting is evidence of the attributed claim, not acquisition of its coordinates or proof of 107 independent new combustion bodies. [Original September 2025 article](https://montanafreepress.org/2025/09/11/smoldering-in-plain-sight-how-coal-seam-mapping-is-helping-mitigate-fire-risk-across-the-state/).
- **Satellite-catalog searches:** PySTAC Client documents geographic bounding-box and date-window searches against compatible STAC services. Catalog access and an appropriate temperature-processing method are additional requirements. [Official usage documentation](https://pystac-client.readthedocs.io/en/stable/usage.html).
- **Document parsing:** Docling's repository documents PDF layout/table processing and OCR. A candidate report reader could use those capabilities, but extracting a number is different from validating its meaning. Preserve page/table references and require review before promoting extracted observations. The README also distinguishes its code license from individual model licenses. [Docling README](https://github.com/docling-project/docling/blob/main/README.md).
- **Geophysical inversion:** SimPEG documents geophysical simulations and inversion, including direct-current resistivity. This supports investigating a measurement-based subsurface-estimation feature; it is not a ready-made Remington coal-fire detector. [SimPEG documentation](https://simpeg.xyz/).

### What worked, failed, or changed

- **Worked:** official source descriptions clarified inventory scope; original repository files and project documentation established concrete reusable capabilities.
- **Tool issue and recovery:** GitHub read requests using `/repos/owner/repo/readme` were rejected as unsupported URL shapes. Supported `github.com/.../blob/main/README.md` URLs worked for Docling and PySTAC Client; SimPEG's repository metadata and official site were accessible. Use supported file URLs instead of treating this as a repository-permission or authentication problem.
- **Important uncertainty:** broad searches did not establish a complete public Remington underground inventory. Keep this as a data-acquisition question. Do not say that no such inventory exists anywhere.
- **Method improvement:** add B4, reuse and verification of existing software, as a strategy that can support all three concepts. Public code can reduce implementation work, while evidence and numerical validity still require their own checks.
- **Scope:** this turn reviewed sources and updated project notes. It did not install or integrate candidate libraries, acquire the primary underground inventory, run a geophysical inversion, fix earlier application defects, or repeat the earlier application test suite.

### Candidate features to investigate through reuse

These are possibilities, not approved implementation work or completed integrations.

| Candidate | Reusable foundation | Data or quality requirement | Related concepts |
| --- | --- | --- | --- |
| Broader surface/underground history comparison | Existing map/geometry code and source adapters | Dated underground observations; correct surface-perimeter snapshot semantics; clear evidence status | A1, A2 |
| Find relevant satellite observations automatically | PySTAC Client and a compatible catalog | Geographic/date coverage, data access, quality masks, and a separately validated temperature-analysis method | A1 |
| Turn older reports into a reviewable evidence table | Docling/OCR plus a reviewed extraction schema | Actual source pages, preserved citations, coordinate/date uncertainty, and checks for extraction errors; no invented coordinates | A1, A2 |
| Show where evidence is sparse or surveys have not covered | Existing geometry plus survey footprints and observation histories | Actual survey effort and detection limits; an evidence-gap map must not be presented as a fire-risk map | A1, A2 |
| Compare repeat visits and flag changes for review | Versioned observation records and field-survey tools | Comparable measurements, units, instruments, dates, and traceable revisions | A2, A3 |
| Estimate and display possible underground structure | SimPEG or another suitable inversion framework | Suitable geophysical measurements, modeling assumptions, uncertainty, and independent checks; electrical properties alone do not confirm fire | A3 |

### Next useful work

Choose one representative overlay case and establish the available primary underground records and their metadata. In parallel with data feasibility work, evaluate one reusable component on a small real input. Compare the actual benefit and failure modes with the existing implementation before proposing a larger integration. Keep the earlier temporal and evidence-checklist defects visible in any overlay plan.

## 2026-10-20: authorized implementation and independent review (in progress)

**Authorization and scope.** The user explicitly granted implementation, testing, skills and multi-agent permission. The [specification](workbench-spec.md) and [plan](workbench-plan.md) define first useful slices of A1–A3, not complete thermal analysis, a full field-capture platform, or a validated combustion predictor. Work is isolated in a managed checkout on `codex/evidence-workbench`. Original checkout changes were inspected and preserved; reviewed implementation will return there after verification.

**Implemented modules and intermediate evidence.** Temporal/assessment fixes passed 27 covering checks and a build. Import intake passed 29 focused checks and a then-current full suite of 90/90. Satellite discovery passed 18 adapter and five standalone browser checks. These are dated module checkpoints, not final integrated results. Details: [temporal report](task-temporal-report.md), [import report](task-import-report.md), [satellite report](task-satellite-report.md).

**Actual external capability reproduced.** A production browser fetch to the public Earth Search Landsat collection returned 22 scene metadata matches, three requested records, and zero rejected records for the recorded Remington-area/date/cloud query at 2026-10-21T01:36:14.250Z. The browser-origin check exercised real cross-origin access. It downloaded no temperature rasters and establishes neither clear ground coverage nor underground combustion. The live test is separate from deterministic fixtures and disabled by default.

**What testing and review caught.** The importer initially allowed a known synthetic package to become real in a newer revision (L11), and a stale window to overwrite newer saved originals (L12). Failing regressions reproduced both before correction. Temporal review caught an unnecessarily quadratic repeat-visit scan; grouped date extrema replaced pairwise comparisons. Independent final review has found stale export trust labels (L13) and a survey-only import visibility gap (L14); the integration owner is correcting these with focused regressions. Keeping input trust correct is insufficient if the exported document later overstates it.

**Model work.** The first conduction solver is checked against independent analytical step/pulse references, including Python's mathematical complementary error function used to check a hand-entered reference value. An initially stable but insufficiently accurate time step missed the fine-grid benchmark by 0.056°C; reducing the Fourier ratio from 0.45 to 0.2 passed that check. Numerical correctness under these assumptions does not validate soil properties, moisture changes, coal oxidation, fuel ignition, or Remington history (L6).

**Remaining before completion.** Finish the heat interface and shared Research tools dialog; verify map/records/timeline/provenance/export refresh; remediate the baseline dependency audit (eight findings, including one critical); run final unit/build/browser/audit checks; resolve independent-review findings; inspect actual desktop/mobile rendering; update this record with final outcomes and synchronize to the original checkout without overwriting intervening changes.

## 2026-10-20: first slices completed and verified in the original project

**Outcome.** Research tools now contains local evidence intake, public Landsat scene discovery and the illustrative conduction lab. Imported packages update map layers, selected records, assessments, timeline, source cards, notices and exports together. Preview, original-byte downloads, revisions, duplicate rejection, reload, removal, corruption recovery and quota/session-only behavior are implemented. Synthetic examples remain quarantined and local claims remain unreviewed. The stable A/B reference meanings are unchanged; implementation and lessons are now indexed separately from scientific validation.

**Independent review and corrections.** The [final review](task-review-report.md) records all actionable findings and their resolutions. Important catches were export trust inflation (L13), survey-only visibility (L14), small units rounded to zero (L15), missing original-revision identity in assessment CSV (L16), stale selected-card timing (L17), and incorrect shallow time-zero heat samples (L19). The latter reproduced 403°C at 0.005 m instead of the known 15°C initial condition; corrected readouts and a grid-resolution warning now pass 17 focused heat checks. The solver's default analytical agreement alone would not have exposed that off-grid display boundary.

**Actual drawing versus working controls (L18).** Passing 20 earlier browser flows did not establish that the upgraded map drew evidence. An actual-pixel test exposed a missing MapLibre worker setup. Pending terrain tiles separately prevented local overlays from mounting; initial and switched styles now mount after the style specification is ready. A real service probe also caught a font-stack HTTP 404; the provider's supported Noto Sans stack returned 200 after correction. Pixel on/off checks, delayed-tile regressions and a separate live Positron/terrain/hillshade/glyph check now pass. The [integration report](task-integration-report.md) preserves the failures, fixes, source documentation and earlier checkpoint without replacing it with later counts.

**Synchronization.** Before copying, the original checkout still had the expected base commit and only the five prior memory/README changes. Their SHA-256 values matched the saved inspection. The 55 implementation/document files were copied with destination-path checks and per-file hash comparison; original work was preserved. Dependencies were installed from the updated lockfile in `C:/Users/msunw/Downloads/PRBsim`. No changes were staged, committed to the user's branch, pushed or deployed.

### Final verification from the original project

These are the controller's complete checks **after** the last shallow-depth correction, distinct from earlier module and integration checkpoints.

| Check | Actual result |
| --- | --- |
| `npm ci` | Passed; 82 packages audited; zero findings. |
| `npm test` | **112 passed, 0 failed**, 14 suites; no skipped unit tests. |
| `npm run build` | Passed; TypeScript and Vite 7.3.7 emitted both MapLibre and heat worker assets. |
| `npm audit --audit-level=moderate` | **0 vulnerabilities**; exit 0. |
| `git diff --check` | Exit 0. |
| `npm run test:e2e -- --reporter=line` | **24 passed, 2 intentionally skipped live checks**, 26 total; 30.8 seconds; exit 0. |
| Separate smoke check of the **built production preview** | Passed: 5,519 actual perimeter pixels, real heat worker, downloaded shallow-depth initial values `[15, 15]`, visible/saved resolution warning, no recorded script/console/HTTP errors. A controlled neutral basemap isolates worker/overlay correctness from service availability. |

The browser suite includes seven legacy application flows, five standalone satellite flows, nine integrated workbench flows and three pixel-rendering checks. Live satellite and live cartography checks are opt-in; their separately successful runs remain recorded in the module/integration reports. Ordinary fixture tests are not represented as external-service evidence. Browser checks were run locally in Chromium; GitHub Actions is configured to run them, but no remote CI execution was initiated here.

Desktop heat, satellite, phone import and actual map screenshots were inspected. The heat plot now shows both depths on one readable result scale and states the imposed surface temperature separately. Production preview is running from the original project's built `dist` at `http://localhost:5173/`; future source changes require rebuilding or using the development server. The build has a MapLibre vendor-size advisory (about 1.13 MB minified / 309 kB gzip), not a build error. Public catalog, map and terrain availability remain external service dependencies.

### What remains scientifically unestablished

- No verified Remington underground-fire inventory or new field measurements were acquired. The synthetic training file supplies no empirical evidence; local imported reports require source and method review.
- Scene metadata availability is working. Raster temperature processing, usable-pixel masks, controlled pre/post comparisons and detection sensitivity remain future research.
- Local intake is working. Direct field capture/ODK synchronization, attachments, shared review and complete offline application delivery are not implemented.
- One-dimensional conduction is mathematically checked within stated assumptions. Combustion, oxygen, fluid transport, moisture/phase changes, layered geology, ignition and site-specific predictions require additional equations, independent benchmarks and actual measurements.

**Next useful investigation.** Obtain one genuine, permission-appropriate source package from a primary underground mapping/survey holder. Inspect its counting units, dates, coordinates, positional accuracy, methods, survey coverage and detection limits before treating overlaps as evidence of causal direction. For modeling, specify a case with measured properties/boundaries and independently test mesh/domain sensitivity before adding combustion physics. Software reuse remains a component strategy (B4), with actual output checks rather than documented capability alone.

## 2026-10-20: user-approved GitHub milestone and follow-up ideas

**User decision.** The user considers the current implementation ready to commit and push, with minor interface concerns deferred to the next iteration. The publication destination is the current `main` branch on `origin`, `https://github.com/Bittermun/PRBsim.git`. A fresh fetch showed local and remote main at the same starting commit, with no divergence. The existing project author identity is retained.

**Fresh publication checks.** Re-ran the complete checks for this milestone: 112/112 unit tests; production build exit 0 with both worker assets; 24 browser tests passed and two opt-in live-service checks skipped (35.6 seconds); dependency audit reported zero vulnerabilities. The known MapLibre vendor-size advisory remains. These are new checks for publication, separate from the earlier implementation checkpoints. Git commit history and remote references record the resulting published version.

**Next-iteration feedback to preserve.** Panels/tabs occupy too much screen space: investigate minimizing and hiding them with clear restoration controls. Explore additional elevation features beyond the existing terrain/contour view. Explore wind information with an explicit source, time and units, separating any display layer from changes to the physical model. These are recorded ideas, not implemented features or blockers for the approved milestone. Existing A1–A3/B1–B4 reference meanings and scientific evidence limits remain unchanged.
