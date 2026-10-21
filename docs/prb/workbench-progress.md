# Implementation progress: workbench-plan.md

All five first-slice implementation tasks are complete. Final verification ran in the original project, C:/Users/msunw/Downloads/PRBsim, after the last heat correction: **112 unit tests passed; 24 browser tests passed and 2 live-service tests intentionally skipped; production build passed; dependency audit reported zero vulnerabilities; whitespace check passed.** A separate built-production smoke check verified real perimeter pixels, both workers and corrected shallow-depth JSON output with no recorded errors.

Work used managed checkout coal-evidence-workbench, branch codex/evidence-workbench, starting at a000a63. User implementation/skills/multi-agent authorization was explicit. Prior original-checkout changes were retained and rechecked by hash before synchronization; 55 implementation/document files were copied back with path and content checks. The user subsequently authorized this milestone's commit and push to origin/main; see WORK_LOG.md for the publication checks and deferred interface/elevation/wind ideas.

| Task | Status and evidence |
| --- | --- |
| 1. Temporal/evidence reliability | Complete: snapshot map dates, coarse-date uncertainty, source-aware availability, method v2, calendar timeline and exact original-revision references. [Report](task-temporal-report.md). |
| 2. Local evidence intake | Complete: atomic preview/apply, normalization, original history, revisions, persistence/recovery and synthetic quarantine. 29 focused checks at module handoff. [Report](task-import-report.md). |
| 3. Satellite discovery | Complete: bounded public STAC search and panel, 18 adapter/5 panel checks plus a separately successful actual browser-origin catalog query. No temperature processing. [Report](task-satellite-report.md). |
| 4. Heat lab | Complete: bounded conduction/worker, analytical benchmarks, shared-scale plot/tables, exact-run download and shallow-grid/initial-condition corrections. 17 focused checks. [Report](task-heat-report.md). |
| 5. Integration and verification | Complete: accessible Research tools, full dataset refresh, accurate exports/notices, responsive styles, browser CI and dependency migration. [Integration checkpoint](task-integration-report.md), [independent review](task-review-report.md), [final original-project checks](WORK_LOG.md). |

All implementers and the independent reviewer have finished. Root reviewed desktop/mobile/map screenshots and recorded actual outcomes, corrected mistakes and scientific limits in INDEX.md and WORK_LOG.md. The review found no unresolved P1/P2 item within the agreed first implementation.

Dependency remediation replaced MapLibre 4 with 6.15.0 and Vite 5 with 7.3.7, plus patched transitives: eight initial audit findings became zero. Actual rendering checks caught explicit worker setup, specification-versus-tile readiness and unavailable fonts; fixes passed pixel regressions and separate live terrain/label probes. The final build retains a vendor-size advisory, documented in the work log.

Scientific work remains separate: no verified underground inventory acquired; imported records are unreviewed; satellite scene discovery is not thermal analysis; verified one-dimensional conduction is not combustion or site-specific validation. Direct field capture, attachments/shared review, full offline delivery and additional physics remain outside this first slice. The stable A/B/L index and work log identify the next evidence-driven investigations.
