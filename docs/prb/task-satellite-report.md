# Satellite scene discovery: implementation and evidence

Checked 2026-10-20 America/Los_Angeles (2026-10-21 UTC). References: A1, B1, B4, L4. This implements scene discovery, not thermal analysis or coal-fire detection. The controller owns shared work-log/index updates and final integration checks.

## Official source contract

- [Earth Search root](https://earth-search.aws.element84.com/v1): public STAC 1.0 catalog operated by Element 84; advertises POST/GET item search, query and sort conformance.
- [Landsat collection](https://earth-search.aws.element84.com/v1/collections/landsat-c2-l2): collection `landsat-c2-l2`, Landsat Collection 2 Level-2. Its metadata credits NASA/USGS as producers and Element 84 as processor. Metadata includes scene acquisition dates, platform and whole-scene `eo:cloud_cover`.
- Endpoint: `POST https://earth-search.aws.element84.com/v1/search`. Request includes `collections`, `[west,south,east,north]` bbox, inclusive UTC datetime interval, cloud query, limit and descending acquisition-time sort. No service credentials are used.
- [USGS product description](https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products) is linked for source attribution. Scene links use canonical Earth Search item metadata and safe HTTPS USGS/DOI links supplied by the catalog. No raster assets or thumbnails are requested.

Official root and collection metadata were read directly using Firecrawl. Search excerpts were insufficient and included an unrelated GitHub result. The API HTML retrieval returned `INVALID_ARGUMENT`, and `/api` provided no useful body in a separate request; these were not treated as API-contract evidence. The catalog's advertised contract was then reproduced by the live POST below.

## Integration API

`src/prb/ui/SatellitePanel.ts` exports `SatellitePanel`:

```ts
new SatellitePanel(container: HTMLElement | string, options?: {
    getCurrentBbox?: () => SatelliteBbox | null;
    initialQuery?: Partial<SatelliteQuery>;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
});
panel.setBbox([west, south, east, north]);
panel.cancel();
panel.destroy();
```

An ID string resolves an existing document element. Construction does not search. Map bounds are copied only when requested. `destroy` cancels the request and removes the panel. Public scene-discovery controls and a polite live status remain independent of map/other tools. Data is rendered with `textContent`; source links use fixed labels, safe HTTPS provider allowlists, `noopener noreferrer` and no referrer.

`src/prb/data/satellite.ts` exports `SatelliteQuery`, `SatelliteBbox`, `SatelliteScene`, `SatelliteSearchResult`, `SatelliteSearchError`, `validateSatelliteQuery`, `buildSatelliteSearch`, `parseSatelliteResults`, `safeSatelliteSourceUrl`, `searchSatelliteScenes` and `SatelliteSearchSession`.

`SatelliteQuery` contains `bbox`, `startDate`, `endDate`, `maxCloudCover`, optional `limit` (default 30; 1–100). Dates must be real `YYYY-MM-DD` calendar dates; intervals must be ordered. Bbox must have positive width/height within geographic limits; antimeridian areas require separate queries. Cloud percentages must be finite 0–100.

`searchSatelliteScenes(query, { signal?, fetchImpl?, timeoutMs? })` performs one public metadata request; timeout defaults to 20 seconds, at most 60 seconds. Transfer is capped at 8 MiB and one bounded page is parsed. Invalid IDs/dates/bounds/clouds/collections are excluded; metadata outside requested filters and duplicates are counted separately. Result fields include the immutable query, scenes, received/rejected/filtered/duplicate/omitted counts, optional catalog match count and `hasMore`. Counts mean validated metadata records, never usable pixels. Pagination is reported and never followed automatically.

`SatelliteSearchSession` owns `search(query)` and `cancel()`: a new search or cancel rejects older work even if the transport ignores abort. Panel edits also cancel and invalidate earlier results. Remote errors are sanitized, and empty responses remain distinct from invalid metadata or network failure.

Panel styling hooks: `.research-tool.satellite-panel`, `.satellite-form`, `.tool-fields.satellite-bounds`, `.tool-fields.satellite-filters`, `.tool-actions`, `.satellite-status[data-state]`, `.satellite-results`, `.tool-note`, `.tool-warning`, `.tool-table-scroll`, `.satellite-scenes`. Shared styles/entrypoints are left to integration.

## Verification observed

| Check | Observed result |
| --- | --- |
| Deterministic adapter tests, `node --experimental-strip-types --test tests/prb/satellite.test.js` | Initial unimplemented adapter: 18 failing tests. After implementation: **18 passed**, 0 failed. Covers query/date/bbox/limit validation, real response values, empty/malformed metadata, safe URLs, server-filter rechecks, duplicate/order/page bounds, no credentials, HTTP/network/JSON/oversize errors, timeout, cancel and stale responses. |
| Focused real-panel browser tests, `npx playwright test e2e/satellite-panel.spec.ts --reporter=line` | Empty panel initially failed the expected visible heading assertion. Implemented panel: **5 passed**. Covers labeled controls/map callback/no automatic search, untrusted text/links, empty/invalid/network states, cancel/late responses and edits during a pending search. |
| TypeScript, `npx tsc --noEmit` | Exit 0, no diagnostics. |
| Whole unit-suite snapshot, `npm test` | **89 tests: 87 passed, 2 failed** in concurrent import-agent work: `import.test.js` “a synthetic package cannot become empirical through a later revision” and “the downloadable example is explicitly synthetic and can be previewed without fabricated empirical claims.” Both were reported to the controller; all satellite tests passed. This is a dated intermediate snapshot, not the final integrated-suite result. |

Playwright emitted its existing `NO_COLOR`/`FORCE_COLOR` environment warning. No satellite application errors were observed in passing focused tests.

## Separately logged live probes

Request: bbox `[-106.5,44.75,-105.7,45.5]`, `2024-08-01T00:00:00Z/2024-10-01T23:59:59.999Z`, scene cloud ≤30%, limit 3, collection `landsat-c2-l2`, sort `properties.datetime` descending.

1. **Raw metadata probe — 2026-10-21T01:27:06.198Z:** HTTP 200; response `Access-Control-Allow-Origin: *`; 22 matched, 3 returned. This proved the POST metadata contract and header, not browser access by itself.
2. **Real Chromium-origin probe — 2026-10-21T01:36:14.250Z:** production `searchSatelliteScenes` ran from `http://localhost:5173` with real cross-origin fetch/preflight and no interception of the remote service. **1 browser test passed**; 22 matched, 3 received, 0 rejected.

| Scene ID | Acquisition UTC | Whole-scene cloud |
| --- | --- | --- |
| `LC09_L2SP_035029_20240930_02_T1` | 2024-09-30T17:48:23.000778Z | 2.57% |
| `LC09_L2SP_035028_20240930_02_T1` | 2024-09-30T17:47:59.109763Z | 0.37% |
| `LC08_L2SP_036029_20240929_02_T1` | 2024-09-29T17:54:26.473588Z | 1.86% |

The live browser check is saved separately in `e2e/satellite-live.spec.ts`, skipped unless `PRB_LIVE_CATALOG=1`. Run in PowerShell with `$env:PRB_LIVE_CATALOG = '1'; npx playwright test e2e/satellite-live.spec.ts --reporter=line`. Deterministic fixtures do not call the catalog. Neither live probe downloaded rasters.

## Limits and next useful check

Availability, counts and CORS behavior are service observations at the stated time. Service changes/offline use can fail without disabling other tools. This first slice shows a bounded page, not an exhaustive scene inventory. Rectangular scene overlap and whole-scene cloud percentages do not establish clear coverage of the selected ground, valid temperature pixels, nighttime availability, thermal anomalies, or underground combustion. No pixel masks, raster processing, temperature values, scientific inference or site-specific validation were implemented.

Next: controller verifies the mounted Research tools dialog and responsive styling, then records final integrated test results in project memory. A later thermal-analysis feasibility study must independently inspect actual pixel masks, product availability and confounders before making temperature or fire claims.
