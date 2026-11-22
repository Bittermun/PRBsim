# PRBsim research and development log

The [index](INDEX.md) links topics, methods, and findings. The
[development review](2026-10-20-development-review.md) records source checks
and diagnostics that preceded the workbench.

## 2026-10-20 — Surface and underground evidence review

- The map and timeline can compare records with different dates, location
  precision, and coverage. The bundled wildfire perimeter is a retrospective
  final snapshot. Record overlap alone cannot establish which fire caused which.
- NIFC publishes interagency fire-perimeter products. OSMRE's e-AMLIS describes
  land and water affected by eligible legacy mining activity. The inventories
  have different scopes. [NIFC Open Data](https://data-nifc.opendata.arcgis.com/) · [OSMRE e-AMLIS](https://www.osmre.gov/programs/e-amlis)
- The September 2025 article attributes the reported 107 seams to Cory Cheguis
  and CM Thermal and Fire. The review acquired no primary Remington coordinates
  or survey inventory. The count's grouping and pre-fire coverage were unresolved.
  [Original reporting](https://montanafreepress.org/2025/09/11/smoldering-in-plain-sight-how-coal-seam-mapping-is-helping-mitigate-fire-risk-across-the-state/)
- The software review inspected the documented STAC search API in PySTAC
  Client, PDF/table extraction in Docling, and resistivity inversion in
  SimPEG. Inversion estimates underground properties from observations and
  model assumptions. The review used documentation and ran no new
  integration or inversion. [PySTAC Client](https://pystac-client.readthedocs.io/en/stable/usage.html) · [Docling](https://github.com/docling-project/docling/blob/main/README.md) · [SimPEG](https://simpeg.xyz/)

## 2026-10-20: implementation and independent review checkpoint

This workbench checkpoint on `codex/evidence-workbench` covered satellite
metadata discovery, local evidence intake, and an illustrative conduction solver.

**Implemented modules and intermediate evidence.** Temporal/assessment fixes passed 27 covering checks and a build. Import intake passed 29 focused checks and a then-current full suite of 90/90. Satellite discovery passed 18 adapter and five standalone browser checks. These are dated module checkpoints, not final integrated results. Details: [temporal report](task-temporal-report.md), [import report](task-import-report.md), [satellite report](task-satellite-report.md).

**Actual external capability reproduced.** A production browser fetch to the public Earth Search Landsat collection returned 22 scene metadata matches, three requested records, and zero rejected records for the recorded Remington-area/date/cloud query at 2026-10-21T01:36:14.250Z. The browser-origin check exercised real cross-origin access. It downloaded no temperature rasters and establishes neither clear ground coverage nor underground combustion. The live test is separate from deterministic fixtures and disabled by default.

**What testing and review caught.** The importer initially allowed a known synthetic package to become real in a newer revision (L11), and a stale window to overwrite newer saved originals (L12). Failing regressions reproduced both before correction. Temporal review caught an unnecessarily quadratic repeat-visit scan; grouped date extrema replaced pairwise comparisons. Independent review found stale export trust labels (L13) and a survey-only import visibility gap (L14). The next dated checkpoint records their resolution.

**Model work.** The first conduction solver is checked against independent analytical step/pulse references, including Python's mathematical complementary error function used to check a hand-entered reference value. An initially stable but insufficiently accurate time step missed the fine-grid benchmark by 0.056°C; reducing the Fourier ratio from 0.45 to 0.2 passed that check. Numerical correctness under these assumptions does not validate soil properties, moisture changes, coal oxidation, fuel ignition, or Remington history (L6).

## 2026-10-20: first slices completed and verified in the original project

**Outcome.** Research tools now contains local evidence intake, public Landsat scene discovery and the illustrative conduction lab. Imported packages update map layers, selected records, assessments, timeline, source cards, notices and exports together. Preview, original-byte downloads, revisions, duplicate rejection, reload, removal, corruption recovery and quota/session-only behavior are implemented. Synthetic examples remain quarantined and local claims remain unreviewed. The stable A/B reference meanings are unchanged; implementation and lessons are now indexed separately from scientific validation.

**Independent review and corrections.** The [final review](task-review-report.md) records all actionable findings and their resolutions. Important catches were export trust inflation (L13), survey-only visibility (L14), small units rounded to zero (L15), missing original-revision identity in assessment CSV (L16), stale selected-card timing (L17), and incorrect shallow time-zero heat samples (L19). The latter reproduced 403°C at 0.005 m instead of the known 15°C initial condition; corrected readouts and a grid-resolution warning now pass 17 focused heat checks. The solver's default analytical agreement alone would not have exposed that off-grid display boundary.

**Actual drawing versus working controls (L18).** Passing 20 earlier browser flows did not establish that the upgraded map drew evidence. An actual-pixel test exposed a missing MapLibre worker setup. Pending terrain tiles separately prevented local overlays from mounting; initial and switched styles now mount after the style specification is ready. A real service probe also caught a font-stack HTTP 404; the provider's supported Noto Sans stack returned 200 after correction. Pixel on/off checks, delayed-tile regressions and a separate live Positron/terrain/hillshade/glyph check now pass. The [integration report](task-integration-report.md) preserves the failures, fixes, source documentation and earlier checkpoint without replacing it with later counts.

The implementation was copied into the original checkout after checking paths
and file hashes. The [integration report](task-integration-report.md) and
[heat lab record](task-heat-report.md) describe the integrated tools.

### Final verification from the original project

These checks ran after the shallow-depth correction.

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

Desktop heat, satellite, phone import and actual map screenshots were inspected. The heat plot now shows both depths on one readable result scale and states the imposed surface temperature separately. The smoke check used the built preview at `http://localhost:5173/`. The build reported a MapLibre vendor-size advisory (about 1.13 MB minified / 309 kB gzip). Public catalog, map and terrain availability remain external service dependencies.

### What remains scientifically unestablished

- No verified Remington underground-fire inventory or new field measurements were acquired. The synthetic training file supplies no empirical evidence; local imported reports require source and method review.
- Scene metadata availability is working. Raster temperature processing, usable-pixel masks, controlled pre/post comparisons and detection sensitivity remain future research.
- Local intake is working. Direct field capture/ODK synchronization, attachments, shared review and complete offline application delivery are not implemented.
- One-dimensional conduction is mathematically checked within stated assumptions. Combustion, oxygen, fluid transport, moisture/phase changes, layered geology, ignition and site-specific predictions require additional equations, independent benchmarks and actual measurements.

## 2026-10-20 — Workbench publication

Commit `c2fefc7` records the workbench milestone. Publication checks recorded
112 passing unit tests, a passing build, 24 passing browser checks with two
opt-in checks skipped, and zero findings in the dependency audit.

## 2026-10-30 — Workbench and source review

**Inspection and fresh evidence.** Read this index, the current work-log entries, README, package scripts and the ResearchWorkbench entry points at commit `c2fefc711b70872770f511af43596d682b3b36df`. Fresh selected checks of `heat.test.js`, `import.test.js` and `assessment-import-provenance.test.js` passed: 42 checks, exit 0. No new build, browser rendering check, live catalog query, thermal-raster processing or field measurement was performed. Earlier complete-suite/browser results remain dated October 20, not new results for this review.

The inspected checkout wired the three Research tools panels directly into the
host. Selected tests exercised the existing heat solver and local import and
export paths. The USGS Collection 2 documentation describes a surface-temperature
product with cloud, emissivity, missing-data, and target-size limitations.
[USGS Collection 2 surface temperature](https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature)
