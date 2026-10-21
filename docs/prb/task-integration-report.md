# Research workbench integration report

Checked 2026-10-20 America/Los_Angeles. References: A1–A3, B1–B4, L1–L6, L8–L10. Workspace: `coal-evidence-workbench/PRBsim`, branch `codex/evidence-workbench`. No files were staged or committed; no deployment was performed.

## Implemented behavior

- **Research tools** opens a native modal dialog with Imports, Satellite scenes, and Heat lab tabs. Tabs support arrow/Home/End keys; Escape/Close returns focus to the opener. Modal keys do not operate the underlying timeline, and opening it pauses timeline playback. Leaving an asynchronous tool cancels its pending work. Forms and completed results remain available on return.
- Local original packages restore before the initial evidence view. Applying/revising/removing packages refreshes the map sources, records, selected inspector card, assessment context, source cards, data-gap context, date bounds, mode notice, and exports. Real observation **or survey-only** imports beyond incident dates expand the window on apply and reload. Synthetic imports remain quarantined until explicitly enabled.
- Records and assessments show possible coarse-date overlap. The selected card’s notice updates in both directions when a partial month becomes a whole-month window or vice versa, without replacing the coordinate form or moving keyboard focus.
- GeoJSON/print exports retain local unreviewed source classification and distinguish an original-package checksum from a processed-record checksum. Synthetic exports include their source metadata; real-mode exports exclude it. Coarse observation dates do not become missing dates or invented day offsets. The temporal owner separately added exact original-package identity to assessment references/CSV.
- Added theme-aware shared styling, narrow-screen dialog layouts, wrapping header actions, neutral observation/survey legend wording, and clear scientific scope notes. The four existing evidence-panel tabs, map controls, and export controls remain.
- CI now installs Chromium, runs browser workflows, and retains failure traces/screenshots. The browser server uses a dedicated strict port 5175 and cannot silently reuse another checkout’s server.

## Dependency and cartography findings

Initial installation reported **8 vulnerabilities**, including a critical MapLibre advisory. Upgraded `maplibre-gl` to **6.15.0**, Vite to **7.3.7**, and refreshed patched transitive dependencies using the ordinary non-forced audit fix. `npm audit --audit-level=moderate` then reported **0 vulnerabilities**. Vite 7 retains the project’s existing Rollup chunk configuration; a Vite 8 migration was unnecessary.

Actual rendering checks found failures that the earlier control-only browser checks missed:

1. **Map worker:** MapLibre 6 has no default export and requires an explicitly bundled worker URL in Vite. Type imports were corrected and the documented `?worker&url` / `setWorkerUrl` adapter now emits a separate production worker asset. The earlier browser console reported “Worker failed to load”; the real pixel check passed after correction. [Official MapLibre installation](https://maplibre.org/maplibre-gl-js/docs/), [v6 migration guide](https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/).
2. **Headless rendering:** the older software-rendering launch flag left the WebGL context lost. Chromium’s documented ANGLE/SwiftShader flags restored an actual WebGL2 context in the test harness. These flags apply to test Chromium only. [Chromium documentation](https://chromium.googlesource.com/chromium/src.git/+/refs/heads/main/docs/gpu/swiftshader.md).
3. **Evidence versus tile readiness:** local overlays disappeared during initial load or a basemap change while unrelated raster tiles were pending. Separate deterministic tests reproduced each failure. Initial style-specification readiness is now remembered before asynchronous local-data loading; switches use fresh styles and sequence-guarded specification-ready events. Local evidence no longer waits for every remote tile to finish. Stale style listeners are removed.
4. **Missing map labels:** the previously configured Open Sans/Arial font stack returned HTTP 404 from OpenFreeMap. Its published [Positron style](https://tiles.openfreemap.org/styles/positron) uses Noto Sans. Contour/place/observation labels now use Noto Sans Regular; the live font request changed from the observed 404 to 200.

These are software correctness and integration outcomes, not new geospatial evidence or scientific causal validation.

## Observed verification checkpoint

The complete checkpoint below ran **after the final integration, font, and legend changes**. A later independent review identified a shallow-depth initial-sample issue in the heat lab; the heat owner’s follow-up and the controller’s final whole-project verification are recorded separately. Do not present this 110-test checkpoint as the final post-follow-up result.

| Check | Observed result |
| --- | --- |
| `npm test` | **110 passed**, 0 failed; exit 0. |
| `npm run build` | TypeScript + Vite production build passed; both MapLibre and heat workers emitted; exit 0. |
| `npm audit --audit-level=moderate` | **0 vulnerabilities**; exit 0, after dependency stabilization. |
| `git diff --check` | Exit 0. |
| Full Chromium suite | **24 passed, 2 intentional live-service skips**, 26 total; 31.0 seconds; exit 0. |
| Separate final live cartography probe | **1 passed**; actual Positron perimeter, contour-theme perimeter and hillshade, and glyph HTTP 200; recorded network/console failures empty. |

The 24 ordinary browser checks comprise 7 existing application flows, 5 standalone satellite flows, 9 mounted workbench flows, and 3 graphical map checks. They cover preview-before-apply, exact original-byte download, duplicate no-op, revised records/history, survey-only visibility, reload/restoration/removal, synthetic quarantine, invalid/corrupt storage recovery, quota/session-only behavior, possible-date notice refresh, imported-source/assessment exports, satellite remote errors, a real heat worker and exact displayed-run download, modal keyboard isolation, phone scrolling, visible perimeter pixels/layer toggles, and delayed basemap tiles.

Meaningful failing cases were observed before their fixes: missing workbench entry point; local-source promotion in exports; synthetic brief provenance omission; stale selected-card timing; worker/render failures; initial/switch tile-readiness failures; and missing font glyphs. The first phone check expected a long preview’s Apply button to fit without scrolling; it was corrected to verify that the action can be scrolled into view while the header stays visible and no horizontal scrolling occurs.

## Visual checks and remaining limits

Visually inspected desktop heat and satellite views, the phone import preview/actions, and actual map perimeter output. The heat owner improved the shared chart range to show the calculated depth temperatures, with the imposed surface pulse stated separately. Screenshots are in ignored `test-results/`: `workbench-heat.png`, `workbench-satellite.png`, `workbench-mobile.png`, `map-perimeter.png`, `map-live-positron.png`, and `map-live-contour.png`.

The build retains a vendor-chunk size warning for MapLibre (approximately 1.13 MB minified / 309 kB gzip). Browser checks were executed locally in Chromium; the newly configured GitHub Actions job has not been executed here. Remote map/catalog availability remains service-dependent. The public catalog live probe was independently recorded by the satellite owner; ordinary checks do not require that service.

No verified underground inventory has been acquired. Local reports remain unreviewed, satellite discovery does not process temperature pixels, and the heat lab remains an illustrative one-dimensional conduction demonstration. Combustion, ignition probabilities, site calibration, complete offline field capture, and scientific validation are outside this first implementation.
