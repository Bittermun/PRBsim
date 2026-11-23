# Publish and reload a PRBsim observation layer

The demonstration uses a read-only GeoJSON URL. PRBsim and QGIS both reload that URL after a change, and each dated release also has a permanent path. The two included releases are fictional and marked `synthetic`.

## Open the sample

From the PRBsim checkout on Node 24, run `npm run dev` and open the URL printed by Vite. Choose **Research tools → Published observations → Reload layer** to load the bundled second release. The table shows the corrected observation, its source, date precision, location uncertainty, review status, and the two change reasons. **Previous revision** opens the earlier file. To draw the purple points, enable **Synthetic Validation Fixtures** on the timeline.

## Replay both revisions in two maps

In a PowerShell terminal at the repository root, create revision 1 and start the local server. Use the same output directory for the publisher and server.

```powershell
$publication = Join-Path $env:TEMP 'prb-observations-local-demo'
node scripts/prb/publish_observations.ts examples/observation-publication/revision-1.json examples/observation-publication/release-1.json $publication
node scripts/prb/serve_observations.mjs $publication
```

In PRBsim, enter `http://127.0.0.1:8175/current.geojson` as the layer URL and select **Reload layer**. In QGIS on the same machine, open **Add Vector Layer**, choose **Protocol**, use the HTTP type, and enter the same URL. Check for `practice-a` and `practice-b` in the attribute table. [QGIS vector data sources](https://docs.qgis.org/3.44/en/docs/user_manual/managing_data_source/opening_data.html)

With the server running, publish revision 2 from a second terminal at the repository root.

```powershell
$publication = Join-Path $env:TEMP 'prb-observations-local-demo'
node scripts/prb/publish_observations.ts examples/observation-publication/revision-2.json examples/observation-publication/release-2.json $publication
```

Select **Reload layer** in PRBsim. In QGIS, a layer configured under **Properties → Rendering → Refresh layer at interval → Reload data** fetches the source on its configured interval. The integration test explicitly uses `QgsVectorLayer.reload()` on the existing layer in the same QGIS process. To reproduce that operation in the QGIS Python console, select the observation layer and run `iface.activeLayer().reload()`. [QGIS rendering settings](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_vector/vector_properties.html) · [QGIS vector layer API](https://api.qgis.org/api/3.44/classQgsVectorLayer.html#details)

In both clients, `practice-a` moves to 106.092° W, 45.039° N, its observation date becomes August 23, 2024 at day precision, and its positional uncertainty becomes 15 m. `practice-b` disappears from `current.geojson`. Both records can still be read from `http://127.0.0.1:8175/releases/1.geojson`.

The publisher rejects rolling the same directory back after revision 2. To begin another demonstration from revision 1, give both commands a fresh directory.

## Release contents and hosting

- Use the existing [evidence package format](local-evidence-format.md) for report data, plus a release notes JSON file with `releasedOn` and a `reasons` object keyed by changed record ID. Keep the layer ID and stable record IDs across revisions. Corrections and withdrawals require a reason.
- `current.geojson` points clients at the latest snapshot and asks caches to revalidate. `releases/<revision>.geojson` contains the exact archived bytes for a particular revision and may be cached permanently. The release metadata records its input-package SHA-256 and the preceding revision's SHA-256. Preserve the input package with the release records so the digest can be traced back to those exact bytes.
- Each feature carries source identity and URL, license, event date and precision, uncertainty when supplied, and the release and original-package identifiers. `synthetic` identifies a fictional demonstration. `unreviewed` identifies a reported observation awaiting review. The published layer shows the current snapshot across all event dates. Use the evidence importer for a local assessment that needs the original source package.
- For a shared deployment, serve the cleared release files over HTTPS with the same paths, content type, and cache behavior. Allow the PRBsim origin to read the files. Confirm who can share the coordinates, source details, corrections, and older versions and what license and attribution they require. The Wyoming State Geological Survey publishes dataset-specific metadata and cautions and provides a distribution example. A catalog listing would require a dataset owner and a publisher to accept the layer. [WSGS GIS distribution](https://main.wsgs.wyo.gov/gis)

## Reproduce the integration check

On Windows with Docker Desktop, use the pinned QGIS build. Chromium and QGIS connect to one local HTTP server. The container uses Docker's `host.docker.internal` alias to reach the Windows loopback listener.

```powershell
$env:PRB_QGIS_IMAGE = 'qgis/qgis:3.44.16@sha256:9747181506ed024cd805532a2bb301abfb45a2b1a681902e259d5a9f9baaf66f'
npm run test:e2e -- e2e/observation-publication.spec.ts
```

Open `publication-verification.json` in the test output to inspect HTTP requests, response hashes, and the QGIS records from both revisions and the archive. The browser check also captures the drawn layer and release details. The tested QGIS build printed `Update from remote service not supported` while opening the read-only source. The captured requests and records confirm that loading and reloading succeeded. The November 23 work log records the run. [Verification log](WORK_LOG.md)
