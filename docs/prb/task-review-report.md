# Independent workbench review

Review date: 2026-10-20 America/Los_Angeles (2026-10-21 UTC). Reviewed the managed `coal-evidence-workbench` checkout based on `a000a63`. References: A1–A3, B1–B4, L1–L6/L8. The reviewer changed no product files or dependencies.

## Outcome

No unresolved P1/P2 finding remains within the agreed first implementation after the corrections below. The reviewer recommends proceeding to the controller's final original-checkout synchronization and verification. This review does not establish scientific field validation or a remotely completed CI run.

## Findings and corrections

| Finding | Impact | Correction and evidence |
| --- | --- | --- |
| P1: Real-mode GeoJSON and printable source classifications promoted new local reports to verified/agency evidence. | Unreviewed local claims could acquire a stronger apparent status in exported artifacts. | Export descriptions now count actual records, retain local-unreviewed status and identify original-package hashes separately from processed-file checks. Three focused export tests independently passed. |
| P2: Synthetic source metadata was absent from synthetic exports; coarse-date offsets could print “No observation date.” | Exported provenance was incomplete and date uncertainty was misdescribed. | Synthetic exports retain source attribution/checksums while real exports exclude synthetic sources. Month/year offsets state their precision limitation. Source review plus focused export/browser checks cover the changes. |
| P2: Survey-only intake outside incident dates stayed hidden after apply/reload. | A valid package appeared ineffective, and observation-only notices failed to explain the hidden survey. | Timeline expansion/restoration and notices now include surveys. Independent Chromium check showed the 2026-10-15 controlled survey after both apply and reload, with the matching timeline end date. |
| P2: Small valid heat depths/grid spacing/times rounded to zero. | Distinct comparison depths and positive numerical units became indistinguishable. | Adaptive significant-digit formatting preserves their values; the new rendering regression independently passed. |
| P2: Assessment CSV identified local inputs only by unchanged IDs and an empty processed checksum. | A saved assessment could not identify which imported revision's original bytes it used. | Version-2 input references now carry `originalPackageSha256` and `checksumScope: original_local_package`, with local verification remaining false and archived v1 compatibility retained. Both focused provenance regressions independently passed. |
| P2: A selected observation card retained its earlier possible-date-overlap notice. | Card and recomputed table/assessment could disagree after changing dates. | Independently reproduced in Chromium, then rechecked partial → full month → partial: notice true → false → true. The fix changes only the timing notice, preserving form/focus state. |
| P2: Interpolating the imposed surface step heated positive-depth readouts at time zero. | Valid 0.005/0.01 m depths incorrectly started at 403/306 °C instead of the prescribed 15 °C. | Exact initial readouts now use ambient at every positive depth; only the surface uses its boundary value. Later interpolation is unchanged, with a first-cell resolution warning in UI/export. Independent 17/17 heat tests and direct initial/surface/zero-pulse probes passed. |
| P1: Evidence overlays waited for all background-map tiles before mounting. | A slow/pending remote tile could hide the perimeter initially or after a basemap switch. | MapLibre source review confirmed specification readiness differs from full tile readiness. Initial readiness is remembered before file loading; switches use specification-ready events with sequence guards and fresh styles. Integration's three actual-pixel regressions and separate live Positron/contour check passed. |

The controller also identified keyboard interaction beneath the dialog and weak chart contrast/scale. Final code stops modal keystrokes reaching the timeline and pauses playback on open. The final heat chart uses a shared depth-temperature scale, contrasting solid/dashed traces, and explicitly states the imposed surface pulse separately.

## Independent verification

These are the reviewer's runs, distinct from module-owner reports and the final integration suite:

- Core checkpoint: import, satellite, temporal regressions and heat tests — **66 passed, 0 failed**.
- Local-export regressions — **3 passed, 0 failed**.
- New assessment-import provenance and heat rendering checks — **5 passed, 0 failed**.
- Heat checks after chart changes — **15 passed, 0 failed**; after the final initial-condition correction — **17 passed, 0 failed**, plus direct shallow/surface/zero-pulse and warning/export probes.
- Separate real Chromium checks: selected-card date changes; survey-only apply/reload; real heat worker; downloaded JSON versus displayed settings/results; final shared chart axis/boundary text; mobile dialog overflow — all passed.
- Final heat desktop/mobile screenshots were visually inspected. No page script errors were observed in that browser check. Screenshots were generated under ignored `test-results/review-final-heat-*.png`.
- `npm audit --json` independently reported **0 vulnerabilities** after dependency remediation.
- Local MapLibre 6 source and final CI/browser configuration were reviewed. A first attempt to use integration's already-stopped server returned connection refused; it was a review setup issue. A separate strict-port review server was used afterward, then stopped; port 5176 closure was confirmed.

Integration-owner checkpoint (separate from the reviewer's runs): **110/110 unit tests**, production build exit 0, audit 0, whitespace check exit 0, and full Chromium **24 passed / 2 intentionally skipped live checks**. The separate opt-in live cartography check passed Positron and contour perimeter rendering, actual hillshade, and glyph HTTP 200 with an empty recorded network/console failure list. [Integration handoff](task-integration-report.md) explicitly identifies this checkpoint as preceding the final initial-condition correction. The controller owns the final complete check after copying into the original project.

## Claim limits and remaining work

This is a useful first implementation, with software and numerical checks at the stated scope. Satellite search discovers scene metadata; it does not process temperature rasters or detect underground combustion. Local intake preserves attributed, unreviewed reports; it does not supply an acquired primary inventory, direct ODK capture, source authentication or a completed scientific review workflow. The heat lab solves an illustrative one-dimensional conduction problem; its analytical agreement does not validate coal combustion, ignition or Remington field behavior.

No verified underground observation inventory or new field measurements were acquired by this review. Cross-tab storage checks are a conflict guard, not collaborative transactions. Polygon checks are structural, not full topology/survey-quality validation. Public satellite and map services remain external dependencies. The next scientific checks still require real source packages, measured/calibrated properties, observational sensitivity and independent field comparison.
