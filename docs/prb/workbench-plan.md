# Evidence workbench implementation plan

**Goal:** deliver usable first versions of the three reviewed developments, with evidence-safe imports and the known foundation defects corrected.

**Architecture:** independent pure data modules feed focused browser panels mounted in a shared dialog. The existing map remains the authoritative evidence view. Immutable inputs and explicit source states connect imports, assessments, and exports.

**Tech stack:** current TypeScript, Vite, MapLibre, Turf, node:test, Playwright, browser storage and worker APIs. Spec: [workbench-spec.md](workbench-spec.md).

**Authorization:** explicit user implementation/multi-agent permission. Independent modules run concurrently under disjoint ownership; integration and final review follow. No deployment or shared-branch push is part of this plan.

## Task 1: temporal/evidence reliability

- [x] Add and observe failing regressions for future snapshots, month/year precision, and stale evidence-gap text.
- [x] Correct temporal semantics and derive evidence messages from applicable source-aware data; keep causal conclusion unresolved.
- [x] Expose data-driven timeline bounds with consistent scrub/play/month-step behavior.
- [x] Run covering tests and report changed interfaces and results.

## Task 2: local evidence intake

- [x] Define source-aware JSON package and synthetic sample; write failing import/revision/validation tests.
- [x] Implement atomic preview/merge and original/revision storage without source-verification inflation.
- [x] Implement ImportPanel preview/apply/reset/storage states and publish integration callbacks.
- [x] Run covering tests and document format, limits, and review semantics.

## Task 3: satellite discovery

- [x] Verify the public catalog contract and write failing query/result/error/URL tests.
- [x] Implement a bounded, abortable STAC search with validated scene metadata.
- [x] Implement SatellitePanel with geographic/date/cloud controls and readable empty/error/results states.
- [x] Run deterministic tests and one separately recorded live-service query if available.

## Task 4: heat-transport lab

- [x] Define a bounded, unit-explicit conduction scenario and independent analytical reference tests.
- [x] Implement and verify the solver, convergence/limits, immutable run output, worker execution/cancellation, and JSON export.
- [x] Implement HeatLab controls and comparable profiles/numeric summaries with clear physical scope.
- [x] Run covering numerical tests and report the model's supported claims.

## Task 5: integration and browser checks

- [x] Mount the dialog and tools; connect imported datasets to map, records, assessments, timeline, badges, restoration, removal, and exports.
- [x] Add focused accessible/responsive styles; preserve legacy interface behavior.
- [x] Add browser tests for imports, repeat imports/revisions/removal, scene success/failure/stale results, heat run/export, and legacy map exports.
- [x] Add CI browser execution; assess and safely remediate any installation audit findings.
- [x] Run complete unit suite, production build, browser suite, independent final review, and covering fixes.
- [x] Bring reviewed changes back to the original project without overwriting intervening changes; update README/index/work log with actual outcomes and remaining data limitations.

## Review focus

Untrusted imported HTML/URLs/coordinates; local-state quota/corruption and partial merges; asynchronous stale responses; uncertain/coarse dates and synthetic influence; numerical correctness versus physical validation. Each responsible task owns its focused failure tests.
