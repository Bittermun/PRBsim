# Local evidence package format (schema 1)

This is an implemented intake workflow for user-supplied JSON files. It does not call ODK, retrieve a primary Remington inventory, verify a publisher, or scientifically review an observation. The downloadable [synthetic training package](../../public/data/prb/templates/synthetic-evidence-package.json) contains invented locations and reports; keep its synthetic flags true.

Open **Research tools → Imports**, choose a UTF-8 JSON file, review its preview and notices, then select **Apply previewed package**. Choosing a file alone does not publish records. **Remove local imports** removes only imported records and their local history; bundled records remain available.

## Package fields

| Field | Requirement |
| --- | --- |
| `schemaVersion` | Exactly `1`. |
| `packageId` | Stable external package identity: 1–80 ASCII letters, digits, dots, underscores or hyphens; first character must be a letter or digit. |
| `revision` | Positive safe integer. Increase it for every intentional change, including changed metadata. |
| `isSynthetic` | Explicit boolean. Every source, site, observation and survey must match it. It cannot change between revisions of one package. |
| `description` | Optional text, at most 8,000 characters. |
| `sources` | Required array of 1–100 attributed sources. |
| `sites`, `observations`, `surveys` | Required arrays, including when empty. Include at least one observation or survey. |

Unknown fields, wrong types, blank required text and null characters are rejected. Notes may be empty strings. All text fields are limited to 8,000 characters. The importer rejects the entire package when any record is invalid; it does not silently skip records.

Sources require `id`, `name`, `publisher`, `retrievalDate`, `url`, `license`, `crs`, `spatialAccuracy`, `limitations`, and `isSynthetic`. `retrievalDate` is a real calendar date in `YYYY-MM-DD` format. `crs` must be `EPSG:4326`. The attribution `url` must be an absolute HTTP(S) URL without embedded user credentials. Use truthful published attribution and describe unknown accuracy and coverage explicitly. The sample's reserved `example.invalid` URL is an unmistakable synthetic placeholder.

`rawSha256`, `processedSha256`, and `hashVerified` are optional source fields for preserving supplied claims. They are never adopted as verification. The imported runtime source receives the SHA-256 of the **actual original package bytes** in `rawSha256`, an empty `processedSha256`, and `hashVerified: false`. Its limitations explain that this checksum identifies the file and does not establish source authenticity, agency verification, normalized-record integrity, or scientific truth. The unchanged source claims remain recoverable in the original package.

## Records and spatial meaning

Site, observation and survey field names and enums follow [the existing domain types](../../src/prb/data/types.ts). IDs and references use the same restrictions as `packageId`. Record IDs must be unique across all three record arrays. Observations reference a site and a declared source within the package; surveys reference a declared source. Sources have their own unique IDs. Packages cannot reference or overwrite bundled records. Runtime IDs are namespaced as `local:<packageId>:record:<externalId>` and `local:<packageId>:source:<externalId>`; collisions with any existing record still reject the package.

Every observation requires `observationDate`, `datePrecision` (`day`, `month`, or `year`), a domain-valid supplied `status`, at least one supported `evidenceMethods` value, an explicit `accuracyMeters`, `notes`, and geometry. Optional `endDate` and `lastObservedDate` must be real ISO calendar dates on or after `observationDate`. Month/year precision preserves uncertainty about the event day; it does not claim continuous activity. Use a valid representative calendar date within that uncertain period.

Locations use GeoJSON longitude, latitude order. Observations accept Point or Polygon; survey footprints accept Polygon; site boundaries accept Polygon, MultiPolygon, or explicit `null`. Coordinates contain two or three finite numbers, longitude within −180…180 and latitude within −90…90. Polygon rings require at least four coordinates, closure, and nonzero area. The existing shared geometry and dataset-integrity checks run before publication. This is basic structural geometry validation; it is not a complete topology or survey-quality assessment.

`accuracyMeters` accepts a non-negative finite number or `null` for unknown. **Zero is converted to `null`**, with a preview notice and an observation note: zero can represent manual placement or a mock provider rather than perfect accuracy. The raw zero remains unchanged in original-file history. Negative numbers and numeric strings reject the package.

All imported observations receive status `unverified_report` and a visible “Local unreviewed report” label, regardless of their supplied status. The original status is retained in notes. Site grouping is normalized to `unresolved_multi_vent`, with its original grouping claim in grouping notes. Survey results remain attributed, unreviewed claims; a negative result does not establish a coal-fire-free area. Synthetic records keep `isSynthetic: true` and remain excluded from real-evidence mode.

## Revisions, originals and recovery

Re-importing the current revision with byte-identical content is a no-op. Different bytes at the same revision are a conflict, including formatting or whitespace changes; increase the revision for a deliberate change. An older revision is rejected even if it was once imported. A higher revision replaces only that package's active records; older original revisions and their SHA-256 values remain in history. Each revision must be a complete package, not a patch.

The importer stores original bytes in Base64 without changing UTF-8 BOMs, spacing or line endings. History records contain package identity, revision, file checksum, browser import timestamp and original bytes. All saved revisions are rehashed and revalidated before any restoration. Restoration is atomic: a damaged later revision does not leave earlier records partially restored. Checksums detect byte mismatch; someone with browser-storage access can edit both content and hashes, so they do not establish authenticity.

Normal persistence uses only browser `localStorage` under `prbsim.local-evidence.v1`. It does not upload files. Downloads in **Original package history** recover individual originals; **Download saved archive for recovery** preserves the untouched saved archive, including a corrupt archive. Archive JSON is a recovery envelope, not an evidence package: extract and decode a revision's `originalBase64` to recover its input file.

The panel reports unavailable storage, quota/access failures, and corrupt archives explicitly. Imports may continue in memory as session-only data. A failed save can leave an older saved revision for the next reload; download new originals before leaving. Corrupt saved bytes are retained and are not silently overwritten by new imports. Removing imports clears that archive when storage permits. If removal fails, the panel explains that saved imports may return on reload. Clearing browser data or using another browser loses local history unless it was downloaded.

Before saving, the importer also checks whether another browser session changed the saved archive since it was read. A detected change rejects the apply action and asks for a reload, preserving the newer archive. This is a local conflict guard, not collaborative editing or a cross-device synchronization protocol; use one active importing tab.

Bounds: 2 MiB per UTF-8 file, 5,000 records and 100,000 coordinate positions per package, 50 original revisions and 8 MiB original bytes across local history. Browser quota can be lower. These bounds keep the static explorer responsive; larger inventories require a separate preprocessing and review workflow.

The first version has no attachment transfer, instrument/calibration schema, shared editing, source review queue, direct service synchronization, or verified publication workflow. Preserve those original materials separately until their import/review requirements are implemented.
