# Temporal and assessment task report

Date: 2026-10-20. References: A1/A2, B1/B2, L1/L2/L3. Scope: implemented software regressions and deterministic unit checks; no new empirical observations or scientific causal validation.

## Changes

- Progression snapshots use their own `mapDate` and inclusive interval membership. An earlier/later snapshot is not silently substituted for a selected date. Retrospective final footprints remain static context.
- Month/year observations use earliest/latest possible calendar dates, including leap years. A partial-period match is **possible**, and a window enclosing all possible event dates is **certain**. Neither means continuous activity. Only an explicit `endDate` denotes a reported duration; original records are unchanged.
- Assessments derive applicable evidence messages, source references, map-date caveats, and reported causes from actual inputs. Missing, hidden, synthetic-only, unsuitable, and available records are distinguished. A matching negative-survey polygon does not establish baseline adequacy: protocol, detection limit, effective coverage, and conditions remain unassessed. All pathways and causal conclusions stay unresolved.
- New assessments identify method `prb-evidence-context-v2`; archived v1 objects remain type compatible. Repeat-visit detection groups date extrema by site rather than comparing every observation pair.
- Timeline day/month stepping, scrubber, playback, reset, input bounds, and perimeter labels use loaded dates. Month stepping clamps to the target calendar month's length. One-day datasets and invalid/inverted inputs are covered.

## Integration contracts

`src/prb/data/dates.ts` exports:

```ts
interface TimelineBounds {
    minDate: string;
    maxDate: string;
    focusStartDate?: string;
    focusEndDate?: string;
    perimeterLabel?: string;
}
deriveTimelineBounds(dataset, includeSynthetic = false): TimelineBounds | null;
observationDateInterval(observation): {
    startDate: string; endDate: string; datePrecision: 'day' | 'month' | 'year'; representsDuration: boolean;
};
observationWindowMatch(observation, startDate, endDate): 'possible' | 'certain' | null;
```

The timeline preserves `setDateWindow`, `setIncludeSynthetic`, `setOnChange`, and `destroy`. It adds an optional constructor bound (`new TimelineControl(containerId, bounds?)`) and `setBounds(bounds)`. Supply derived bounds at initial load and after dataset/synthetic changes. Without supplied bounds, the control deliberately has a one-day current-date placeholder. First bounds use the incident focus; later updates clamp the current window. Identical bounds/window updates do not recursively emit filter changes. Scrubber values now mean integer UTC-day offsets, not percentages. Perimeter labels are inserted through `textContent`.

`filterEvidence` returns additive optional `observationTemporalMatches: Record<string, 'possible' | 'certain'>`. The controller can use this for record labels. `assessLocation` retains its five arguments and adds optional sixth argument `{ dataset: PRBEvidenceDataset }`; full context distinguishes filtered-out comparison records while keeping synthetic quarantine. Context records used are identified in `inputReferences`, and active `surveyRecordIds` remain restricted to the displayed view. Optional pathway `evidenceChecks` provides `evidenceId`, `state`, `recordIds`, and `description`. State is availability/suitability, never a causal verdict.

Point observations match the exact nominal query coordinate; polygon evidence uses containment. No arbitrary matching radius is invented. Coarse-date selected observations have explicit timing caveats. Multiple applicable incident discovery dates use conservative pre/post cutoffs, and incident discovery never becomes local flame-front arrival.

## Observed verification

| Check | Before changes | After changes |
| --- | --- | --- |
| Initial temporal/assessment regressions | 0/8 passed: future snapshot appeared; coarse dates disappeared; fixed evidence/caveat text persisted. | 8/8 passed. |
| Dataset/timeline regressions | 0/4 passed: missing bounds API and fixed 2024 scrub/month behavior. | 4/4 passed. |
| Method identity and repeated-date work regression | 0/2 passed: method still v1; 160,000 date reads for 200 same-day observations. | 2/2 passed; grouped check stays under the explicit linear-work guard. |
| Covering command below | Recorded failing cases above. | 27/27 passed; exit 0. |
| `npm run build` | Not used as red check. | TypeScript and Vite production build passed; exit 0. |

Covering command:

```powershell
node --experimental-strip-types --test tests/prb/temporal-regressions.test.js tests/prb/dates-timeline.test.js tests/prb/assessment.test.js tests/prb/assessment-export.test.js tests/prb/assessment-ui.test.js
```

A full `npm test` was also run while sibling modules were still being finalized: 87/89 passed. The two failures were both in in-progress import work: **a synthetic package cannot become empirical through a later revision**, and **the downloadable example is explicitly synthetic and can be previewed without fabricated empirical claims** (example not yet created at that instant). All temporal, assessment, existing evidence/export/geometry, and satellite tests passed in that run. These results are a dated intermediate snapshot, not a claim about final integrated status.

## Remaining work and limitations

The controller still must wire the bounds and full assessment context and display possible/certain overlap in its evidence UI; browser verification belongs to integration. A latest-snapshot-at-or-before operation is not implemented: this filter is explicitly inclusive interval selection. Baseline sensitivity, survey completeness, source authenticity, physical site behavior, and causal direction remain scientifically unresolved. No files were staged or committed, and no sibling-owned implementation files were changed.

## Independent-review follow-up: imported revision identity

Date: 2026-10-20. Related lesson: L13 (preserving trust and provenance in exports). The reviewer found that assessment CSV references retained a local record/source ID but no original checksum: imported `processedSha256` is intentionally empty and local IDs are reused across revisions. A saved assessment therefore could not distinguish the exact imported originals used.

`InputReference` now adds compatible optional `originalPackageSha256` and `checksumScope: 'original_local_package'` for sources in the importer's `local:<package>:source:<source>` namespace with a SHA-256 original digest. The digest comes from the importer's computed `source.rawSha256`; it identifies original package bytes, including formatting/BOM bytes. It is not copied into `processedSha256`. Local references always retain `hashVerified: false`. Bundled references keep their existing processed-file checksum semantics, and archived v1 objects need no new fields.

The new `tests/prb/assessment-import-provenance.test.js` imports revision 1 and then revision 2 of the same package, keeping logical source/record IDs unchanged while changing original bytes. It decodes the actual CSV `Input_References_JSON` cell and compares each revision's digest with independently computed SHA-256 values, checks original-package scope, and verifies the processed hash remains empty and verification false. It also checks bundled and archived v1 compatibility. An initially incomplete test fixture lacked the loader's required bundled source; that setup was corrected before observing the genuine red regression: the CSV original-package digest was `undefined` instead of the expected SHA-256. After the focused change, both new tests passed.

Fresh verification for this follow-up:

```powershell
node --experimental-strip-types --test tests/prb/assessment-import-provenance.test.js tests/prb/assessment.test.js tests/prb/assessment-export.test.js
npx tsc --noEmit
```

Result: 12/12 focused tests passed; TypeScript reported no errors. The full suite was not repeated during this scoped follow-up. Only `assessment.ts`, the new test, and this report were changed. No source authenticity or independent scientific validation is implied by the original-byte identity, and no files were staged or committed.
