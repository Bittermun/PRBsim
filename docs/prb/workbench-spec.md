# Evidence workbench: first implementation

The user authorized implementation, testing, skills, and multi-agent execution on 2026-10-20. This specification makes the previously discussed first useful slices concrete. Work proceeds without another permission round. Existing project notes and scientific limitations remain authoritative.

## Deliverables

1. Correct progression dates, coarse observation dates, context-dependent evidence messages, and data-driven timeline bounds. Final wildfire footprints remain visibly retrospective context. Causal conclusions remain unresolved.
2. Import local underground-observation packages with source metadata, sites, observations, and survey footprints. Preview before applying. Validate atomically, preserve synthetic quarantine, mark local observations as unreviewed reports, handle zero accuracy as unknown, prevent duplicate imports, preserve revision history, reject stale/conflicting revisions, and allow recovery from locally stored originals. No imported package may overwrite bundled records or claim independent source verification.
3. Search a public STAC satellite catalog for Landsat scenes by area/date/cloud cover. Show dates, scene quality, provider links, usable-result counts, explicit no-results/error/cancel states, and the distinction between scene discovery and underground-fire detection. No invented temperature values or nighttime availability.
4. A heat-transport lab with parameter controls, two depth/scenario comparisons, an accessible numeric summary, reproducible JSON export, cancellation/stale-result protection, and an analytically benchmarked solver. Clearly label stage-one conduction, illustrative parameters, and absence of combustion/site-specific validation.
5. One accessible Research tools dialog linking Imports, Satellite scenes, and Heat lab. Preserve the existing map, records, provenance, exports, and four evidence-panel tabs. Dynamic notices must distinguish bundled, synthetic, and local unreviewed evidence.
6. Targeted unit tests, browser flows for all tools, and browser checks in CI. Save actual results and limitations in working memory.

## Shared constraints

- Keep TypeScript/Vite/MapLibre and current dependencies initially. Use explicit units, real calendar dates, source attribution, and escaped/untrusted input handling.
- Public/static operation, no service credentials in browser assets, no unrequested publication or external messages.
- Never fabricate empirical observation locations or turn satellite scenes/geological polygons into confirmed coal fires. Samples must be unmistakably synthetic.
- Imported originals and revisions are local user data. Provide clear persistence/session-only behavior and a way to remove imported records without deleting bundled data.
- Tests must exercise meaningful failure modes and independent numerical references, with observed failing cases before fixes.
- Agents own disjoint files. No concurrent git staging/committing and no edits to another agent's files without coordination. The controller integrates only after module contracts are known; a fresh review checks the final changes.

## Module boundaries

- Temporal agent: `src/prb/data/select.ts`, `src/prb/data/assessment.ts`, `src/prb/ui/TimelineControl.ts`, focused regression tests. Preserve compatible current exported APIs; add optional context/bounds helpers if needed.
- Import agent: new `src/prb/data/import.ts`, `src/prb/ui/ImportPanel.ts`, import tests, synthetic sample package and import-format documentation. Publish the exported integration contract early. Do not edit shared types, entrypoint, main styles, or existing evidence panel.
- Satellite agent: new `src/prb/data/satellite.ts`, `src/prb/ui/SatellitePanel.ts`, satellite tests and source notes. Publish the exported integration contract early. Do not edit shared entrypoint/styles.
- Heat agent: new heat model/worker and `src/prb/ui/HeatLab.ts`, independent numerical tests. Publish the integration contract early. Do not edit shared entrypoint/styles.
- Integration: entrypoint, dialog shell/style, evidence-panel dataset refresh as needed, dynamic badges, import restoration/removal, browser tests, CI, README, and memory updates.

## Acceptance cases

Future snapshots cannot appear as earlier snapshots; month/year dates preserve possible overlap without invented duration; synthetic records do not satisfy real-evidence requirements; source-specific caveats reflect actual data; current empirical perimeter remains available as retrospective context.

Importing the same package twice creates no extra records; edited revisions are traceable; missing source metadata, invalid dates/geometry, collisions, oversized input, stale revisions, and missing or unavailable storage are handled explicitly. Failed imports do not partially mutate the active dataset. Original source claims are preserved without automatic promotion to confirmed status.

Satellite results are validated, dates/cloud coverage are labeled accurately, untrusted links are safe, later searches replace earlier ones, and remote failure does not disable the rest of the app. A live public-service probe is separate from deterministic fixtures.

The heat solver respects initial/boundary conditions, remains bounded, rejects invalid/excessive inputs, converges against an analytical heat-diffusion reference, and exports the exact displayed run. The interface never describes conduction results as verified combustion predictions.
