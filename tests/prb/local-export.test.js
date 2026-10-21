import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceImportStore } from '../../src/prb/data/import.ts';
import { filterEvidence } from '../../src/prb/data/select.ts';
import { buildExportGeoJson, buildStaticBriefHtml } from '../../src/prb/ui/ExportDialog.ts';

async function imported(synthetic = false) {
    const dataset = {
        manifest: { studyArea: 'In-memory export test', generatedAt: '2026-10-20', coreQuestion: 'Test only', dataGapsChecklist: [], auditedSources: [], datasets: [{
            id: 'bundled', name: 'Bundled source fixture', publisher: 'Test', retrievalDate: '2026-10-20', url: 'https://example.org', license: 'Test',
            crs: 'EPSG:4326', spatialAccuracy: 'Unknown', limitations: 'Test only', rawSha256: 'test', processedSha256: 'test', hashVerified: true, isSynthetic: false
        }] },
        wildfirePerimeters: [], observations: [], geologicalFeatures: [], sites: [], surveys: [], syntheticSources: []
    };
    const store = new EvidenceImportStore(dataset, { storage: null });
    const pkg = {
        schemaVersion: 1, packageId: 'export-check', revision: 1, isSynthetic: synthetic,
        sources: [{ id: 'source', name: 'Test local source', publisher: 'In-memory fixture', retrievalDate: '2026-10-20', url: 'https://example.org/test',
            license: 'Test only', crs: 'EPSG:4326', spatialAccuracy: 'Unknown', limitations: 'In-memory test, no measured field record', isSynthetic: false }],
        sites: [{ id: 'site', name: 'Test grouping', coalSeam: 'Unknown', groupingUncertainty: 'unresolved_multi_vent', groupingNotes: 'Test only', boundaryGeometry: null, isSynthetic: false }],
        observations: [{ id: 'report', siteId: 'site', label: 'Test supplied claim', observationDate: '2026-10-19', datePrecision: 'day',
            status: 'field_confirmed', evidenceMethods: ['visual_smoke'], accuracyMeters: null, sourceId: 'source', notes: 'Supplied claim only', isSynthetic: false,
            geometry: { type: 'Point', coordinates: [-106.2, 45] } }], surveys: []
    };
    for (const records of [pkg.sources, pkg.sites, pkg.observations]) for (const record of records) record.isSynthetic = synthetic;
    const preview = await store.preview(JSON.stringify(pkg));
    assert.equal(preview.valid, true, JSON.stringify(preview.issues));
    const result = await store.apply(preview);
    assert.equal(result.ok, true);
    const window = { startDate: '2026-10-01', endDate: '2026-10-20', includeSynthetic: synthetic, allowedStatuses: ['unverified_report'] };
    return { dataset: result.dataset, filtered: filterEvidence(result.dataset, window), window, sha: preview.sha256 };
}

test('real-mode GeoJSON keeps imported reports unreviewed and describes actual records', async () => {
    const { dataset, filtered, window } = await imported();
    const json = JSON.parse(buildExportGeoJson(filtered, dataset.manifest, window, dataset.syntheticSources));
    assert.equal(json.features[0].properties.status, 'unverified_report');
    assert.match(json.metadata.syntheticWarning, /local unreviewed/i);
    assert.doesNotMatch(json.metadata.syntheticWarning, /Verified empirical dataset only|1 WFIGS|0 verified coal-fire points/);
    assert.equal(json.metadata.evidenceSummary.localUnreviewedObservations, 1);
    assert.equal(json.metadata.evidenceSummary.wildfirePerimeters, 0);
});

test('synthetic exports retain source provenance and original hash without leaking into real mode', async () => {
    const { dataset, filtered, window, sha } = await imported(true);
    const json = JSON.parse(buildExportGeoJson(filtered, dataset.manifest, window, dataset.syntheticSources));
    assert.equal(json.metadata.datasets.find(source => source.id === 'local:export-check:source:source')?.rawSha256, sha);
    const brief = buildStaticBriefHtml(filtered, dataset.manifest, window, '', '', null, dataset.syntheticSources);
    assert.match(brief, new RegExp(sha));
    assert.match(brief, /Synthetic \/ Schematic Fixture/);
    const realWindow = { ...window, includeSynthetic: false };
    const real = JSON.parse(buildExportGeoJson(filterEvidence(dataset, realWindow), dataset.manifest, realWindow, dataset.syntheticSources));
    assert.equal(real.metadata.datasets.some(source => source.id.startsWith('local:')), false);
    assert.equal(real.features.length, 0);
});

test('printable brief preserves local source class and original package hash meaning', async () => {
    const { dataset, filtered, window, sha } = await imported();
    const html = buildStaticBriefHtml(filtered, dataset.manifest, window, '');
    assert.match(html, /Local unreviewed source/i);
    assert.doesNotMatch(html, /Contains 1 official WFIGS|0 verified coal-fire point/);
    const localRow = html.match(/<tr>\s*<td><strong>Test local source[^]*?<\/tr>/)?.[0];
    assert.ok(localRow);
    assert.doesNotMatch(localRow, /Empirical Agency Record/);
    assert.match(html, /original package SHA-?256/i);
    assert.match(html, new RegExp(sha));
    assert.match(html, /does not verify.*claims/i);
    assert.match(html, /1 local unreviewed observation report/i);
});
