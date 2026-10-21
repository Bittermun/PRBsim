import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EvidenceImportStore } from '../../src/prb/data/import.ts';
import { filterEvidence } from '../../src/prb/data/select.ts';
import { assessLocation } from '../../src/prb/data/assessment.ts';
import { buildAssessmentCsv } from '../../src/prb/ui/ExportDialog.ts';

function bundled() {
    return {
        manifest: { studyArea: 'Controlled test only', generatedAt: '2026-10-20', coreQuestion: 'Testing provenance only',
            datasets: [{ id: 'bundled-background', name: 'Bundled background test source', publisher: 'Unit test fixture',
                retrievalDate: '2026-10-20', url: 'https://example.org/background', license: 'Test only', crs: 'EPSG:4326',
                spatialAccuracy: 'Unknown', limitations: 'In-memory test only', isSynthetic: false,
                rawSha256: 'bundled-original', processedSha256: 'bundled-processed', hashVerified: true }],
            dataGapsChecklist: [], auditedSources: [] },
        syntheticSources: [], wildfirePerimeters: [], geologicalFeatures: [], sites: [], observations: [], surveys: []
    };
}

function packageFixture(revision) {
    return {
        schemaVersion: 1, packageId: 'assessment-revision-test', revision, isSynthetic: false,
        sources: [{ id: 'source', name: 'Controlled input, not a field inventory', publisher: 'Unit test fixture', retrievalDate: '2026-10-20',
            url: 'https://example.org/test', license: 'Test only', crs: 'EPSG:4326', spatialAccuracy: 'Unknown',
            limitations: 'In-memory test only', isSynthetic: false, hashVerified: true,
            rawSha256: 'untrusted-supplied-original', processedSha256: 'untrusted-supplied-processed' }],
        sites: [{ id: 'site', name: 'Controlled site', coalSeam: 'Unknown', groupingUncertainty: 'unresolved_multi_vent',
            groupingNotes: 'Test only', boundaryGeometry: null, isSynthetic: false }],
        observations: [{ id: 'observation', siteId: 'site', label: 'Controlled observation', observationDate: '2024-08-01',
            datePrecision: 'day', status: 'unverified_report', evidenceMethods: ['historical_record'], accuracyMeters: null,
            sourceId: 'source', notes: `Original revision ${revision}; not empirical test evidence`, isSynthetic: false,
            geometry: { type: 'Point', coordinates: [-106.25, 45.05] } }],
        surveys: []
    };
}

// Decode actual RFC 4180 cells so quoted JSON commas/quotes are checked as a
// saved CSV consumer sees them, rather than inspecting the assessment object alone.
function csvRows(csv) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < csv.length; i++) {
        const char = csv[i];
        if (char === '"') {
            if (quoted && csv[i + 1] === '"') { cell += '"'; i++; }
            else quoted = !quoted;
        } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
        else if (char === '\r' && csv[i + 1] === '\n' && !quoted) {
            row.push(cell); rows.push(row); row = []; cell = ''; i++;
        } else cell += char;
    }
    assert.equal(quoted, false, 'Exported CSV must close every quoted field');
    assert.equal(cell, '', 'Exported CSV must end with CRLF');
    return rows;
}

function exportedReferences(dataset) {
    const filter = { startDate: '2024-08-01', endDate: '2024-08-01', includeSynthetic: false,
        allowedStatuses: ['unverified_report'] };
    const filtered = filterEvidence(dataset, filter);
    const assessment = assessLocation({ kind: 'observation', observationId: filtered.observations[0].id },
        filtered, dataset.manifest, filter, dataset.syntheticSources, { dataset });
    assert.ok(assessment);
    const rows = csvRows(buildAssessmentCsv(assessment));
    const referencesColumn = rows[0].indexOf('Input_References_JSON');
    assert.notEqual(referencesColumn, -1);
    return JSON.parse(rows[1][referencesColumn]);
}

test('assessment CSV identifies exact original import bytes across revisions with the same source and record IDs', async () => {
    const store = new EvidenceImportStore(bundled(), { storage: null });
    const exports = [];
    const expectedHashes = [];
    for (const revision of [1, 2]) {
        const bytes = Buffer.from(`${revision === 1 ? '\uFEFF' : ''}${JSON.stringify(packageFixture(revision), null, 2)}\n`, 'utf8');
        expectedHashes.push(createHash('sha256').update(bytes).digest('hex'));
        const preview = await store.preview(bytes);
        assert.equal(preview.valid, true, JSON.stringify(preview.issues));
        const result = await store.apply(preview);
        assert.equal(result.ok, true);
        exports.push(exportedReferences(result.dataset));
    }
    assert.notEqual(expectedHashes[0], expectedHashes[1]);
    assert.equal(exports[0].length, 1);
    assert.equal(exports[1].length, 1);
    assert.equal(exports[0][0].recordId, exports[1][0].recordId);
    assert.equal(exports[0][0].sourceId, exports[1][0].sourceId);
    for (let i = 0; i < exports.length; i++) {
        assert.equal(exports[i][0].originalPackageSha256, expectedHashes[i]);
        assert.equal(exports[i][0].checksumScope, 'original_local_package');
        assert.equal(exports[i][0].processedSha256, '');
        assert.equal(exports[i][0].hashVerified, false);
    }
    assert.equal(exports[0][0].originalPackageSha256, expectedHashes[0], 'A saved older CSV retains its original revision identity');
});

test('bundled and archived v1 references retain their existing processed-file checksum semantics', () => {
    const dataset = bundled();
    const source = { ...packageFixture(1).sources[0], id: 'bundled-source', rawSha256: 'a'.repeat(64),
        processedSha256: 'bundled-processed', hashVerified: true };
    dataset.manifest.datasets.push(source);
    dataset.sites.push(packageFixture(1).sites[0]);
    dataset.observations.push({ ...packageFixture(1).observations[0], sourceId: source.id });
    const references = exportedReferences(dataset);
    assert.deepEqual(references, [{ recordId: 'observation', sourceId: 'bundled-source', processedSha256: 'bundled-processed',
        hashVerified: true, isSynthetic: false }]);

    const filter = { startDate: '2024-08-01', endDate: '2024-08-01', includeSynthetic: false, allowedStatuses: ['unverified_report'] };
    const archived = assessLocation({ kind: 'observation', observationId: 'observation' }, filterEvidence(dataset, filter),
        dataset.manifest, filter);
    archived.methodVersion = 'prb-evidence-context-v1';
    const rows = csvRows(buildAssessmentCsv(archived));
    assert.equal(rows[1][rows[0].indexOf('Method_Version')], 'prb-evidence-context-v1');
    assert.deepEqual(JSON.parse(rows[1][rows[0].indexOf('Input_References_JSON')]), references);
});
