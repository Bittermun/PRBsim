# PRBsim research index

Created 2026-10-20. The [work log](WORK_LOG.md) records dated evidence and
verification. The [development review](2026-10-20-development-review.md)
records the source audit and diagnostics that preceded the workbench.

## Workbench references

| Code | Topic | Implemented workbench coverage |
| --- | --- | --- |
| **A1** | Satellite scene metadata | Landsat scene metadata search by area, date, and cloud cover. Temperature-pixel processing is outside the implemented scope. |
| **A2** | Local evidence import | Browser-local JSON evidence intake with original-byte preservation, revision tracking, and recovery. Imported reports are unreviewed. |
| **A3** | Heat conduction | Illustrative one-dimensional heat conduction with two-depth comparison and an exact-run JSON export. The solver covers conduction under prescribed conditions. |

## Method references

| Code | Method discussed in the research records |
| --- | --- |
| **B1** | Reproducible research and independent checks |
| **B2** | Evidence provenance, original records, and review |
| **B3** | Physical modeling with separate verification and validation |
| **B4** | Evaluation of existing software and integration behavior |

The October 20 review originally labeled B1, B2, and B3 as A, B, and C.
The table above records their stable cross-references.

## Recorded findings

| Code | Finding or lesson | Evidence state | Relevant references |
| --- | --- | --- | --- |
| **L1** | Progression filtering previously used incident lifecycle dates, which could include a future fire-boundary snapshot. | Fixed with mapDate interval selection; red/green regression and final integrated checks passed. | A1, B1 |
| **L2** | The earlier checklist repeated fixed missing-data messages even with matching test records. | Implemented source-aware availability checks and method v2; baseline adequacy and causation remain unresolved. | A1, A2, A3, B1, B2 |
| **L3** | Earlier filtering could interpret a month- or year-precision observation as an exact day. | Fixed with possible/certain event-time overlap and calendar tests; neither implies continuous activity. | A1, A2, B1, B2 |
| **L4** | Satellite temperature measurements have limits involving feature size, vegetation changes, clouds, and missing observations. A chart alone does not establish underground ignition. | Documented source limitations; local data feasibility remains untested. | A1, B1 |
| **L5** | A zero location-accuracy value in ODK can identify manual placement or a mock provider. | Importer converts zero to unknown, retains original bytes/claim and explains the conversion; regression checked. | A2, B2 |
| **L6** | Correct heat-transfer calculations do not establish a validated combustion model or prove what happened at Remington. | Model-scope distinction; local physical validation remains outstanding. | A3, B1, B3 |
| **L7** | Original reporting names Cory Cheguis and CM Thermal and Fire as the mapping group behind the reported 107 seams. The separate February 2026 bulletin remains unverified. | Reporting attribution checked; primary inventory, counting definitions, access, and bulletin remain unresolved. | A1, A2, B1, B2 |
| **L8** | Map and timeline overlays can show where records overlap. Interpretation depends on the records' dates, positional uncertainty, source scope, and surveyed coverage. Location overlap alone cannot determine causal direction. | User question recorded; data and interpretation requirements identified. | A1, A2, B1, B2 |
| **L9** | Existing inventories have different coverage rules. A legacy-mining inventory cannot stand in for all naturally burning coal seams or establish a complete current Remington inventory. | Official inventory scope checked; primary Remington inventory remains unacquired. | A1, A2, B1, B4 |
| **L10** | The software review identified documented catalog, extraction, and inversion methods. The catalog integration was tested in PRBsim. | Native STAC adapter reproduced catalog access without adding Python; Docling, PySTAC Client and SimPEG remain unintegrated candidates. | A1, A2, A3, B3, B4 |
| **L11** | An earlier importer allowed a new revision to change a synthetic package's designation. | Failing regression reproduced and fixed at preview/apply and archive restoration; original designation retained across revisions. | A2, B2 |
| **L12** | A stale importing window could overwrite another window's saved originals before the conflict guard was added. | Failing regression fixed with a pre-save archive conflict guard. The conflict guard checks one browser-local archive. | A2, B2 |
| **L13** | An export can silently overstate trust even when the on-screen imported report is correctly unreviewed. | Corrected static verified/agency labels and provenance, retained synthetic-source metadata, and passed focused export plus integrated browser checks. | A1, A2, B1, B2 |
| **L14** | A survey-only import can be invisible if date-window expansion considers observations alone. | Corrected date expansion/restoration and notices; independent and final browser apply/reload checks passed. | A2, B1, B2 |
| **L15** | Fixed decimal places can display valid small depths, times and grid spacing as zero or make distinct comparisons look identical. | Independent review drove adaptive significant digits and a red/green small-unit rendering check. The depth plot uses one shared result range and separately states the surface boundary. | A3, B1, B3 |
| **L16** | An assessment with stable record IDs needs the original import checksum to identify its exact revision. | Added optional original-package checksum and scope to local v2 input references; real import-v1/import-v2 assessment CSV regression passes without promoting verification. | A2, A3, B1, B2 |
| **L17** | A selected observation card can retain obsolete possible-date-overlap text when filters or revisions change. | Reproduced independently in Chromium; fixed and rechecked partial/full/partial month changes. | A1, A2, B1 |
| **L18** | Passing map-control tests does not prove that a dependency upgrade still draws evidence, or that local overlays survive pending terrain tiles. | Corrected worker setup, style readiness and unavailable font stack. Three pixel regressions, live terrain/label probes and a built-production worker/perimeter smoke check passed. | A1, A2, B1, B4 |
| **L19** | Interpolating a discontinuous surface boundary into shallow time-zero readings can contradict the exact prescribed initial condition. | Reproduced 403°C instead of 15°C at 0.005 m; corrected positive-depth initial readouts/peaks and added a first-cell resolution warning. Numerical/rendering tests and built-production download check passed. | A3, B1, B3 |
