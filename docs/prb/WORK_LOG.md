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

## 2026-11-22 — Montana DES bulletin and survey intake check

Located the February 2026 Montana DES bulletin identified in L7. It reports
that a subcontractor completed thermal mapping of the Short Draw and Remington
burn scars under a grant awarded to Custer County DES in 2022. Its figure of
more than 1,300 mapped active seams covers eastern Montana. Flight footprints,
survey dates, counting definitions, site records, and pre-fire coverage remain
outstanding. [Montana DES bulletin](https://prod-des.mt.gov/Mitigation/Mitigation-Minute-Feb-2026.pdf)

Custer County's engineering solicitation covers coal seam mitigation in four
counties. The county's mitigation specialist description calls for geospatial
field records, photo metadata, and an audit trail for contractor work. These
records identify an opportunity to ask for a dated survey footprint and a
repeat survey for one treatment site. Access to a site record and a field
comparison are pending. [County solicitation](https://custercountymt.gov/news-announcements/coal-seam-fire-mitigation/) ·
[Mitigation specialist description](https://custercountymt.gov/wp-content/uploads/2026/03/Coal-Seam-Mitigation-Specialist.pdf)

On Node 24.12.0 at `f198949`, the import, assessment import provenance, and
local export tests passed 33 of 33 checks. One Chromium workbench check passed
for a survey-only import beyond the incident dates, including visibility
after reload. The checks used fixture data and cover software behavior.
## 2026-11-22 — Survey comparison and public evidence checks

Added the survey comparison workbench (A4). It uses existing JSON intake and
preserves the active package revision and original bytes' SHA-256 in the report.
In the fictional example, area A has results on both dates, B has unknown
follow-up status, and C has a follow-up result only. One survey produces a
baseline with comparison pending. The HTML and JSON exports report scope and
review status. Field usability still depends on effective coverage, acquisition
conditions, and the original survey records. [Format and replay](local-evidence-format.md#compare-reported-survey-footprints)

Verification at base commit `f198949` with the working-tree changes, Node
24.12.0 and Chromium/SwiftShader. `npm test` passed 114 tests, `npm run build`
passed, and `npm run test:e2e` passed 25 tests with two opt-in live tests
skipped. The new workbench test applied the fixture, checked synthetic-mode
quarantine and all three coverage regions, compared the JSON after reload, checked
the printable output, and confirmed stable IDs and a changed checksum at the
next revision. Unit tests covered an interior gap and edge-only contact.

The Richard Spring study reproduced 171,130.09 acres within Rosebud County
using the federal perimeter and Census boundary. The state and federal cause
records use different levels of detail. The county's 128,403-acre aggregate
needs an incident list and acreage definition before reconciliation. [Source comparison and calculation](richard-spring-case.md)

The Kanderfirn drone validation raster yielded 7,149 numeric cells and 5,139
unknown cells in a selected 128 × 96 window. Re-rasterizing the exported
GeoJSON reproduced all 12,288 mask classifications. The thermal result is a
coverage example. [Source, figure, and replay](thermal-coverage-example.md)

A separate Landsat check looked at a 64 × 64 window inside the Richard Spring
footprint at 106.477676° W, 45.716311° N. All 4,096 August 4 pixels passed a
screen for finite recorded temperature and the Landsat QA flags for fill,
cloud, shadow, snow, and water. On September 5, all 4,096 pixels were flagged
cloud or dilated cloud even though temperature values were present. An
alternative August 29 image had 4,090 cells pass the same preliminary screen.
The screen establishes data availability for this window. It leaves surface
comparability, matched reference areas, and any interpretation of anomalies
for a separate study. [August 4 scene](https://planetarycomputer.microsoft.com/api/stac/v1/collections/landsat-c2-l2/items/LC08_L2SP_036028_20210804_02_T1) · [September 5 scene](https://planetarycomputer.microsoft.com/api/stac/v1/collections/landsat-c2-l2/items/LC08_L2SP_036028_20210905_02_T1) · [August 29 scene](https://planetarycomputer.microsoft.com/api/stac/v1/collections/landsat-c2-l2/items/LC08_L2SP_035028_20210829_02_T1) · [USGS product guide](https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature)

## 2026-11-23 — Two-client publication and matched surface temperature

Implemented read-only dated GeoJSON publication (A5). The publisher reuses the
evidence import validator, stages complete bytes before replacing `current`,
preserves the prior archive, and records source license, review status, stable
record IDs, input SHA-256, and change reasons. PRBsim displays the current release
as a purple overlay. Synthetic observations still require the synthetic toggle.
Unreviewed published observations have a separate layer identity and stay out
of the local evidence assessment. [Publication replay](observation-publication.md)

Chromium and QGIS 3.44.16 with the OGR provider both requested revisions 1 and 2
from the same loopback HTTP server. The first had two fictional points. After
PRBsim's **Reload layer** and `QgsVectorLayer.reload()` on the existing QGIS layer,
both clients showed the correction to `practice-a` and removed `practice-b`.
Each client could still read the first immutable release. The test checked the
request user agents and both response hashes, exact QGIS coordinates and
attributes, actual browser map pixels, and the visible withdrawal reason. A
missing change reason and an attempted rollback left the current release intact.
The QGIS render-timer settings are documented and the check exercised the
data reload operation directly. The replay writes `publication-verification.json` to the test output.

At base commit `f198949` with these working-tree changes, Node 24.12.0 unit
tests passed 114 of 114 and the production build passed. All 28 Playwright
checks passed in Chromium with SwiftShader, including the live cartography
and Earth Search probes. The publication test used Docker QGIS as its second
consumer. The server was local, and the tested releases were synthetic.
Field publication and use by a second organization remain unobserved.

For Richard Spring, the outside reference ring and interior supplied **14,838**
unique matched Landsat pairs from August 4 and 29, 2021 (L23). The temperature
change averaged −13.13°C inside and −15.43°C in the matched ring. The paired
difference was +2.29°C. An independent read of the paired CSV checked coordinates
for reuse, distance and all four covariate thresholds, the four ST_QA values
per row, and the reported mean. The script and artifacts preserve which cells
passed screening and which locations were matched. This comparison concerns
daytime surface temperature. Geology, complete fire history in the reference
ring, and underground combustion were outside the recorded inputs. [Sources and replay](richard-spring-case.md#matched-landsat-surface-temperature)
