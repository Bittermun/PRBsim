# PRBsim concept and strategy index

Created: 2026-10-20. Reference set: version 1.2.

These codes are primarily for the assistant's working memory, research notes, plans, and implementation records. The user can speak in ordinary language and does not need to learn them. **A means what we could build; B means how we would build it; L means a recorded lesson or finding.** Codes identify an item, not its priority or completion status. Consult the [work log](WORK_LOG.md) for user questions, what was tried, successful and unsuccessful outcomes, corrections, and next checks.

The concepts retain their original meanings. First implementation slices are implemented and verified under the user's explicit authorization; software completion and scientific validation are separate claims. The [implementation plan](workbench-plan.md), [progress record](workbench-progress.md), and [work log](WORK_LOG.md) distinguish actual results from remaining scientific work. The [development review](2026-10-20-development-review.md) remains the historical critique before these fixes.

## Development concepts: A

| Code | Name | Plain-language purpose | First useful deliverable |
| --- | --- | --- | --- |
| **A1** | Satellite thermal-history explorer | Look through past satellite temperature measurements to investigate changes before and after a wildfire. | A small assessment of usable observations and detectable signals, followed by one reproducible area comparison if the data support it. |
| **A2** | Offline field-survey system | Collect dependable field notes, locations, photographs, and measurements, including searches that found no unusual heat. | One complete survey package that can be imported repeatedly and revised without losing evidence or creating duplicates. |
| **A3** | Underground heat and combustion simulator | Explore how heat moves underground and, in later stages, how coal combustion could behave under stated conditions. | A checked heat-transport demonstration with saved, comparable scenarios. Combustion and site-specific prediction require further physics and validation. |

Verified first slices, 2026-10-20: A1 has public Landsat scene discovery, including a real browser-origin query; it does not process temperature pixels. A2 has browser-local JSON intake, source normalization, originals and revision recovery; it does not include direct ODK capture, photos, shared review, or an acquired Remington underground inventory. A3 has a bounded one-dimensional conduction solver, independent analytical checks, depth comparisons and exact-run JSON export. All three are mounted in Research tools. Independent review findings were corrected; final original-project checks passed 112 unit tests, 24 browser tests and a production build, with zero dependency audit findings. Two ordinary-suite live-service checks are intentionally opt-in; separately recorded live probes passed. This does not establish scientific field validation.

## Development strategies: B

| Code | Name | Main rule | Workflow and strongest fit |
| --- | --- | --- | --- |
| **B1** | Reproducible research | Ask an answerable question, check the evidence, and make the result repeatable. | Question -> feasibility check -> repeatable analysis -> interface -> continue or redirect. Primary fit: A1; also scientific evaluation of A2 evidence and A3 results. |
| **B2** | Preserved evidence and review | Keep original records and make every correction and publication decision traceable. | Collect -> archive -> normalize -> review -> publish. Primary fit: A2; also managing reference measurements for A1 and A3. |
| **B3** | Staged physical modeling | Start with a simple model that can be checked, then add physical processes in justified steps. | Benchmark heat transport -> expand geometry -> add combustion processes -> compare with independent measurements. Primary fit: A3; also explaining assumptions to users. |
| **B4** | Reuse and verify existing software | Adapt suitable existing tools while checking their fit, outputs, maintenance, and license requirements. | Identify a component -> inspect its documented method -> try representative data -> check results and failure cases -> integrate through a small adapter. Applies across A1-A3. Candidate tools and unresolved requirements are recorded in the work log. |

All strategies share consistent terminology, units, uncertainty labels, source records, and accessible interface controls. Their layouts can suit different tasks: a map/chart workspace for A1, a short capture flow and review queue for A2, and comparable animated cross-sections for A3.

The earlier development review called its playbooks **A, B, and C**. Those historical labels correspond to **B1, B2, and B3**, respectively. Use the new codes in future work to avoid confusing a concept with a strategy.

## Recorded lessons and findings: L

These entries preserve what was learned; they do not indicate that a fix or proposed feature has been completed. Supporting details for L1-L7 are in the development review; newer findings are recorded in the work log.

| Code | Finding or lesson | Evidence state | Relevant references |
| --- | --- | --- | --- |
| **L1** | A future fire-boundary snapshot can appear in an earlier selected window because progression filtering uses incident lifecycle dates. | Fixed with mapDate interval selection; red/green regression and final integrated checks passed. | A1, B1 |
| **L2** | The evidence checklist repeats fixed missing-data messages even when matching test records are supplied. It needs to distinguish missing, synthetic, unsuitable, and usable evidence. | Implemented source-aware availability checks and method v2; baseline adequacy and causation remain unresolved. | A1, A2, A3, B1, B2 |
| **L3** | Month/year date uncertainty is not reflected in observation filtering. A stored date can be treated as an exact day. | Fixed with possible/certain event-time overlap and calendar tests; neither implies continuous activity. | A1, A2, B1, B2 |
| **L4** | Satellite temperature measurements have limits involving feature size, vegetation changes, clouds, and missing observations. A chart alone does not establish underground ignition. | Documented source limitations; local data feasibility remains untested. | A1, B1 |
| **L5** | A zero location-accuracy value in ODK can identify manual placement or a mock provider; it must not automatically become perfect accuracy. | Importer converts zero to unknown, retains original bytes/claim and explains the conversion; regression checked. | A2, B2 |
| **L6** | Correct heat-transfer calculations do not establish a validated combustion model or prove what happened at Remington. | Model-scope distinction; local physical validation remains outstanding. | A3, B1, B3 |
| **L7** | Original reporting names Cory Cheguis and CM Thermal and Fire as the mapping group behind the reported 107 seams. The separate February 2026 bulletin remains unverified. | Reporting attribution checked; primary inventory, counting definitions, access, and bulletin remain unresolved. | A1, A2, B1, B2 |
| **L8** | Overlaying surface and underground records is a core project capability. Dates, positional uncertainty, source scope, and surveyed coverage must accompany overlaps; location overlap alone does not determine causal direction. | User question recorded; data and interpretation requirements identified. | A1, A2, B1, B2 |
| **L9** | Existing inventories have different coverage rules. A legacy-mining inventory cannot stand in for all naturally burning coal seams or establish a complete current Remington inventory. | Official inventory scope checked; primary Remington inventory remains unacquired. | A1, A2, B1, B4 |
| **L10** | Existing code offers useful capabilities, but documented functionality is not a tested PRBsim integration. Underground inversion also requires actual measurements and explicit assumptions. | Native STAC adapter reproduced catalog access without adding Python; Docling, PySTAC Client and SimPEG remain unintegrated candidates. | A1, A2, A3, B3, B4 |
| **L11** | A newer file revision must not change a known synthetic package into empirical evidence. | Failing regression reproduced and fixed at preview/apply and archive restoration; original designation retained across revisions. | A2, B2 |
| **L12** | A stale importing browser window can overwrite another window's newer saved originals. | Failing regression fixed with a pre-save archive conflict guard. This is local storage, not atomic collaborative editing; prefer one importing tab. | A2, B2 |
| **L13** | An export can silently overstate trust even when the on-screen imported report is correctly unreviewed. | Corrected static verified/agency labels and provenance, retained synthetic-source metadata, and passed focused export plus integrated browser checks. | A1, A2, B1, B2 |
| **L14** | A survey-only import can be invisible if date-window expansion considers observations alone. | Corrected date expansion/restoration and notices; independent and final browser apply/reload checks passed. | A2, B1, B2 |
| **L15** | Fixed decimal places can display valid small depths, times and grid spacing as zero or make distinct comparisons look identical. | Independent review drove adaptive significant digits and a red/green small-unit rendering check. The depth plot uses one shared result range and separately states the surface boundary. | A3, B1, B3 |
| **L16** | An assessment with stable record IDs needs the original import checksum to identify its exact revision. | Added optional original-package checksum and scope to local v2 input references; real import-v1/import-v2 assessment CSV regression passes without promoting verification. | A2, A3, B1, B2 |
| **L17** | A selected observation card can retain obsolete possible-date-overlap text when filters or revisions change. | Reproduced independently in Chromium; fixed and rechecked partial/full/partial month changes. | A1, A2, B1 |
| **L18** | Passing map-control tests does not prove that a dependency upgrade still draws evidence, or that local overlays survive pending terrain tiles. | Corrected worker setup, style readiness and unavailable font stack. Three pixel regressions, live terrain/label probes and a built-production worker/perimeter smoke check passed. | A1, A2, B1, B4 |
| **L19** | Interpolating a discontinuous surface boundary into shallow time-zero readings can contradict the exact prescribed initial condition. | Reproduced 403°C instead of 15°C at 0.005 m; corrected positive-depth initial readouts/peaks and added a first-cell resolution warning. Numerical/rendering tests and built-production download check passed. | A3, B1, B3 |

## Examples of using the references

- **"Expand A1 using B1."** Develop the satellite concept through a small, repeatable feasibility investigation.
- **"Plan A2 using B2, including L5."** Design the field-data workflow with preserved originals, revision history, and correct location-accuracy handling.
- **"Apply B1 and B3 to A3."** Check that the model answers a useful scientific question while adding physical complexity in stages.
- **"Revisit L1 before adding progression data to A1."** Address the known future-snapshot problem before relying on the new timeline behavior.

An example learning record based on the existing review:

| Review date | References | What was observed | What changes next |
| --- | --- | --- | --- |
| 2026-10-20 | A1 / B1 / L1 | An August 24-only diagnostic returned a September 1 snapshot. | Define snapshot-selection rules and add a regression check before introducing real progression data. The defect is identified, not fixed. |

## Keeping the index useful

1. **Keep meanings stable.** A1 always identifies the satellite concept, even as its design improves. Do not reuse a retired code for something else.
2. **Append new items.** Use the next unused number within each group; never renumber existing items to make room for a new one.
3. **Record refinements.** Add a dated note explaining the question or change, supporting evidence, conclusion, and next action. Link the affected codes.
4. **Separate evidence from progress.** Mark whether an idea is proposed, under investigation, implemented, or superseded. Record whether a finding is documented, reproduced, resolved, or still uncertain; implementation alone does not establish scientific validation.
5. **Preserve history.** Link a replacement from any superseded entry. Link implementation work, tests, and new research back to these codes so later work can build on the earlier reasoning.

This file is the canonical reference for the codes. Consult it together with the latest work-log entry when resuming project work. Keep the historical review as evidence of what was known and checked at that stage.

## User feedback for the next iteration — 2026-10-20

The user approved committing and pushing the current milestone. Preserve these follow-up ideas without treating them as already implemented:

- Reduce screen space occupied by panels/tabs; support minimizing and hiding them while keeping an obvious way to restore them.
- Explore elevation features beyond the existing terrain/contour view; clarify the desired measurements or interaction before implementation.
- Explore wind information. Define its source, observation/forecast time, units and display separately from any proposed effect on the physical model.

These refinements can support A1–A3 through B1/B4. They do not change the existing concept or strategy IDs, and they are not blockers for the approved milestone.
