# Task 2: local evidence intake handoff

Implementation/check date: 2026-10-20. References: A2, B2, B4, L5, L7–L9. This is a functioning local file-intake module and standalone panel, with deterministic validation/storage tests. It is not direct ODK API integration, acquisition of a primary underground inventory, independent source verification, or scientific validation of imported reports.

## Files and integration contract

Owned changes:

- `src/prb/data/import.ts`: package schema, strict validation, normalization, immutable dataset merge, revisions, original bytes, browser-local persistence and recovery.
- `src/prb/ui/ImportPanel.ts`: accessible preview/apply/reset panel, synthetic sample link, live operation status, storage notices, per-revision original downloads and saved-archive recovery.
- `tests/prb/import.test.js` and `tests/prb/import-ui.test.js`: 29 focused tests.
- `public/data/prb/templates/synthetic-evidence-package.json`: unmistakably synthetic example with two invented reports, one invented survey footprint and zero-accuracy normalization.
- `docs/prb/local-evidence-format.md`: input fields, units, exact revision policy, limits, storage behavior and supported claims.

No main entrypoint, shared domain types, existing EvidencePanel, styles, package files, staging or commits were changed by this task. The controller owns integration and final browser verification.

```ts
const store = new EvidenceImportStore(bundledDataset, {
  // Omit storage for browser localStorage; null explicitly selects session-only.
  storage: optionalStorage,
  storageKey: 'prbsim.local-evidence.v1'
});
const restored = await store.restore();
publishDataset(restored.dataset);
const panel = new ImportPanel(container, {
  store,
  sampleUrl: `${baseUrl}data/prb/templates/synthetic-evidence-package.json`,
  onDatasetChange(dataset, operation) { publishDataset(dataset); }
});
```

`EvidenceImportStore` exports:

| API | Result/meaning |
| --- | --- |
| `preview(string \| Uint8Array \| ArrayBuffer)` | `Promise<ImportPreview>`; no dataset publication. Includes `valid`, `action` (`add`, `replace`, `noop`, `reject`), optional identity/revision/synthetic/hash, `counts`, `sourceNames`, `issues` and `warnings`. |
| `apply(preview)` | `Promise<ImportApplyResult>` with `ok`, dataset copy, persistence, message, issues and action (`added`, `replaced`, `noop`, `rejected`). Only an authentic preview created by this store is accepted. Current revisions are rechecked at apply. |
| `restore()` | `Promise<ImportRestoreResult>` with the common result fields plus `restoredPackages`. Explicitly call it before initially publishing the dataset. Preview/apply also ensure restoration has been checked. Repeated calls do not overwrite active session data. |
| `reset()` | `Promise<ImportResetResult>` with common fields plus `removedPackages`. Removes imported records/history only, invalidates outstanding previews, and attempts to remove only the import storage key. |
| `getDataset()` | Independent copy of the current merged dataset. |
| `getHistory()` | Independent array of all original revisions, including inactive ones. Fields: packageId, revision, sha256, importedAt, originalBase64. |
| `getPersistence()` | `{ status: 'persistent' \| 'session-only' \| 'corrupt', message }`. The message explains any recovery/save limitation. |
| `getSavedArchive()` | Untouched storage string or null; includes corrupt storage for recovery without overwriting it. |
| `originalRevisionBytes(revision)` | Exported Base64 decoder returning the exact original bytes, including a BOM and whitespace. |

The panel mounts itself in its constructor, publishes successful apply/reset results through the callback, and provides `refresh()` and `destroy()`. The callback also fires for an unchanged duplicate and a session-only apply. Restore remains an integration responsibility. Persistence warnings are both displayed beside the file control and included in the live operation announcement after apply/reset.

Active local-package count: `new Set(store.getHistory().map(r => r.packageId)).size`. Revision count: `store.getHistory().length`. Runtime record IDs start `local:<packageId>:record:`; source IDs start `local:<packageId>:source:`. Real local sources append to manifest datasets; synthetic local sources append to syntheticSources. Imported observations always have `status: 'unverified_report'` and visible local-unreviewed labels. Known synthetic packages cannot change their synthetic designation between revisions.

## Preservation and trust rules

JSON file validation checks arrays, required metadata/types, IDs, real dates, allowed enums, source/site references, EPSG:4326 geometry, synthetic consistency, duplicate records and resource bounds. Both `validateGeometry` and `validateDatasetIntegrity` from `load.ts` are reused. The supplied statuses/enums are validated before normalization. Rejection publishes nothing, and restoration validates all revisions before publishing any.

Normalization preserves original observation status in notes and all supplied data in original-file history. It converts zero accuracy to unknown with an explanation and changes site grouping to unresolved while preserving its original claim. Real-mode filtering excludes synthetic imports. A source's `rawSha256` identifies the actual input-file bytes; `processedSha256` is empty and `hashVerified` false. Limitations explicitly separate that checksum from agency/source verification and normalized-record hashing.

The current byte-identical revision is a no-op. Same revision with changed bytes (including whitespace) conflicts; older revisions are rejected. A newer full revision replaces only that package's active records and keeps older originals. Namespacing prevents overwriting bundled IDs; a deliberately matching bundled namespace is still rejected by integrity checks. Public copies and opaque preview ownership prevent caller mutation from changing private records.

Storage uses one bounded localStorage envelope. Missing/unavailable storage and quota/access failures allow clearly labeled session-only operation. Corrupt storage restores no imports, remains untouched for download, and prevents subsequent writes until reset. Save failure can leave an older persistent revision; the UI explains this. A detected archive change by another browser session rejects apply instead of replacing unseen originals. This is a conflict guard, not synchronized collaborative editing. Reset failure clears the in-session view but explicitly warns that saved imports may return on reload.

## Test-first record and fresh checks

All commands ran in `C:/Users/msunw/.codex/worktrees/coal-evidence-workbench/PRBsim`.

1. Wrote the intake/storage/rendering tests before implementation. `node --experimental-strip-types --test tests/prb/import.test.js tests/prb/import-ui.test.js` reported **22 failures**, each asserting the absent intake store or preview renderer. Implemented the module and renderer: **22/22 passed**; TypeScript check also passed.
2. Added recovery, collision, coordinate-budget, sample and synthetic-revision checks. Observed **26/28 pass, 2 fail**: a synthetic package could change to empirical in a newer revision, and the sample file did not exist. Added the synthetic revision guard (also applied during restoration) and synthetic sample: **28/28 passed**.
3. Added a stale-browser-session regression. Observed **28/29 pass, 1 fail** because an out-of-date session could overwrite the newer saved archive. Added a pre-save archive snapshot check: **29/29 passed**.
4. Fresh final module checkpoint: `npm test` reported **90 tests passed, 0 failed** across the complete suite available at that checkpoint. `npm run build` exited **0**, using TypeScript and Vite 5.4.21. This checkpoint precedes the integration owner's later dependency remediation and UI integration; it is not a claim about later workspace states.

Focused checks cover exact-byte SHA-256/BOM recovery, current duplicates, stale/conflicting/new revisions, unrelated packages, synthetic quarantine, zero accuracy, malformed arrays/metadata/dates/enums/geometry, out-of-range coordinates, duplicate/missing IDs, oversized input and coordinate budgets, copied/mutated previews, raw-history restoration, corruption, access/quota/removal failure, stale saved archives and HTML escaping. A valid original larger than 1 MiB was also imported, downloaded and restored successfully.

## Limits and next useful checks

The input format supports the existing domain schema, not structured calibration/measurements/attachments, photo uploads, direct ODK synchronization, shared review or a verified publication workflow. Basic geometry validation does not prove complete polygon topology or meaningful survey coverage. Checksums are not authenticity guarantees. Browser quota may be lower than the application bounds (2 MiB/file, 5,000 records/file, 100,000 coordinate positions/file, 50 revisions and 8 MiB originals/history). Use one active importing tab; this is not a cross-tab transaction protocol.

The next useful check is the controller's real browser flow: preview/apply the synthetic sample; confirm it is hidden from real evidence; re-import it unchanged; apply an edited revision; reload and recover originals; simulate unavailable/quota/corrupt storage; remove imports; verify map, records, timeline, provenance and exports all refresh without promoting local claims. That integrated browser flow was not run by this module agent. No new empirical inventory or independently reviewed field evidence was acquired.
