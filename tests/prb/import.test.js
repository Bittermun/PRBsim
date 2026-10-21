import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { filterEvidence } from '../../src/prb/data/select.ts';

const intake = await import('../../src/prb/data/import.ts').catch(() => null);

function createStore(storage = null) {
    assert.equal(typeof intake?.EvidenceImportStore, 'function', 'Local evidence intake store must exist');
    return new intake.EvidenceImportStore(bundled(), { storage });
}

function bundled() {
    return {
        manifest: {
            studyArea: 'Controlled test only', generatedAt: '2026-10-20', coreQuestion: 'Testing only',
            datasets: [{ id: 'bundled-source', name: 'Bundled test source', publisher: 'Tests', retrievalDate: '2026-10-20',
                url: 'https://example.org', license: 'Test only', crs: 'EPSG:4326', spatialAccuracy: 'Unknown', limitations: 'Test only',
                rawSha256: 'bundled-original', processedSha256: 'bundled-processed', hashVerified: true, isSynthetic: false }],
            dataGapsChecklist: [], auditedSources: []
        },
        syntheticSources: [], wildfirePerimeters: [], geologicalFeatures: [],
        sites: [{ id: 'bundled-site', name: 'Existing test site', coalSeam: 'Unknown', groupingUncertainty: 'unresolved_multi_vent',
            groupingNotes: '', boundaryGeometry: null, isSynthetic: false }],
        observations: [], surveys: []
    };
}

function polygon() {
    return { type: 'Polygon', coordinates: [[[-106.3, 45], [-106.2, 45], [-106.2, 45.1], [-106.3, 45.1], [-106.3, 45]]] };
}

function packageFixture({ revision = 1, synthetic = false, packageId = 'controlled-test' } = {}) {
    return {
        schemaVersion: 1, packageId, revision, isSynthetic: synthetic,
        sources: [{ id: 'source', name: 'Controlled input, not a field inventory', publisher: 'Unit test fixture', retrievalDate: '2026-10-20',
            url: 'https://example.org/test', license: 'Test only', crs: 'EPSG:4326', spatialAccuracy: 'Unknown', limitations: 'In-memory test only',
            isSynthetic: synthetic, hashVerified: true, rawSha256: 'claimed-not-verified', processedSha256: 'claimed-not-verified' }],
        sites: [{ id: 'site', name: 'Controlled site', coalSeam: 'Unknown', groupingUncertainty: 'confirmed_single_body',
            groupingNotes: 'Original grouping claim', boundaryGeometry: polygon(), isSynthetic: synthetic }],
        observations: [{ id: 'observation', siteId: 'site', label: 'Controlled observation', observationDate: '2024-08-01', datePrecision: 'day',
            status: 'field_confirmed', evidenceMethods: ['ground_thermocouple'], accuracyMeters: 12, sourceId: 'source', notes: 'Original note',
            isSynthetic: synthetic, geometry: { type: 'Point', coordinates: [-106.25, 45.05] } }],
        surveys: [{ id: 'survey', surveyName: 'Controlled negative survey', surveyDate: '2024-07-01', method: 'Test protocol',
            result: 'no_thermal_anomaly_detected', sourceId: 'source', notes: 'Method-limited report', isSynthetic: synthetic, geometry: polygon() }]
    };
}

class MemoryStorage {
    values = new Map();
    readError = false;
    writeError = false;
    removeError = false;
    getItem(key) { if (this.readError) throw new Error('SecurityError'); return this.values.get(key) ?? null; }
    setItem(key, value) { if (this.writeError) throw new Error('QuotaExceededError'); this.values.set(key, value); }
    removeItem(key) { if (this.removeError) throw new Error('SecurityError'); this.values.delete(key); }
}

async function applyFixture(store, fixture = packageFixture()) {
    const preview = await store.preview(JSON.stringify(fixture));
    assert.equal(preview.valid, true, JSON.stringify(preview.issues));
    return store.apply(preview);
}

test('preview does not publish records; apply keeps local claims unreviewed and bundled data intact', async () => {
    const store = createStore();
    const preview = await store.preview(JSON.stringify(packageFixture()));
    assert.equal(preview.valid, true);
    assert.deepEqual(preview.counts, { sources: 1, sites: 1, observations: 1, surveys: 1 });
    assert.equal(store.getDataset().observations.length, 0);
    const result = await store.apply(preview);
    assert.equal(result.ok, true);
    assert.equal(result.action, 'added');
    assert.equal(result.dataset.sites[0].id, 'bundled-site');
    assert.equal(result.dataset.manifest.datasets[0].hashVerified, true);
    const observation = result.dataset.observations[0];
    assert.equal(observation.status, 'unverified_report');
    assert.match(observation.label, /local unreviewed report/i);
    assert.match(observation.notes, /Original supplied status: field_confirmed/);
    assert.match(observation.notes, /Original note/);
    assert.equal(result.dataset.sites[1].groupingUncertainty, 'unresolved_multi_vent');
    assert.match(result.dataset.sites[1].groupingNotes, /confirmed_single_body/);
});

test('package SHA-256 describes exact imported bytes and never adopts supplied verification flags', async () => {
    const store = createStore();
    const bytes = Buffer.from(`\uFEFF${JSON.stringify(packageFixture(), null, 2)}\n`, 'utf8');
    const expected = createHash('sha256').update(bytes).digest('hex');
    const preview = await store.preview(bytes);
    assert.equal(preview.sha256, expected);
    const applied = await store.apply(preview);
    const source = applied.dataset.manifest.datasets[1];
    assert.equal(source.rawSha256, expected);
    assert.equal(source.hashVerified, false);
    assert.equal(source.processedSha256, '');
    assert.match(source.limitations, /original package bytes/i);
    assert.match(source.limitations, /not.*agency verification/i);
    assert.deepEqual(Buffer.from(intake.originalRevisionBytes(store.getHistory()[0])), bytes);
});

test('an identical current revision is a no-op without extra records, history, or storage writes', async () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    await applyFixture(store);
    const before = storage.getItem(intake.IMPORT_STORAGE_KEY);
    const result = await applyFixture(store);
    assert.equal(result.action, 'noop');
    assert.equal(result.dataset.observations.length, 1);
    assert.equal(store.getHistory().length, 1);
    assert.equal(storage.getItem(intake.IMPORT_STORAGE_KEY), before);
});

test('same-revision changed bytes and stale revisions reject atomically', async () => {
    const store = createStore();
    await applyFixture(store);
    const conflict = await store.preview(`${JSON.stringify(packageFixture())}\n`);
    assert.equal(conflict.valid, false);
    assert.match(conflict.issues[0].message, /same revision.*different|conflict/i);
    await applyFixture(store, packageFixture({ revision: 2 }));
    const stale = await store.preview(JSON.stringify(packageFixture()));
    assert.equal(stale.valid, false);
    assert.match(stale.issues[0].message, /stale|older/i);
    assert.equal((await store.apply(stale)).ok, false);
    assert.equal(store.getHistory().length, 2);
    assert.equal(store.getDataset().observations.length, 1);
});

test('new revisions replace their active records and preserve originals plus unrelated packages', async () => {
    const store = createStore();
    await applyFixture(store);
    await applyFixture(store, packageFixture({ packageId: 'other-package' }));
    const next = packageFixture({ revision: 2 });
    next.observations[0].id = 'replacement-observation';
    next.observations[0].notes = 'Revised note';
    const result = await applyFixture(store, next);
    assert.equal(result.action, 'replaced');
    assert.equal(result.dataset.observations.length, 2);
    assert.ok(result.dataset.observations.some(row => row.id.includes('replacement-observation')));
    assert.ok(result.dataset.observations.some(row => row.id.includes('other-package')));
    assert.equal(store.getHistory().length, 3);
    assert.match(new TextDecoder().decode(intake.originalRevisionBytes(store.getHistory()[0])), /Original note/);
});

test('namespacing prevents different packages with reused external IDs from colliding', async () => {
    const store = createStore();
    await applyFixture(store);
    const result = await applyFixture(store, packageFixture({ packageId: 'other-package' }));
    const observations = result.dataset.observations;
    assert.notEqual(observations[0].id, observations[1].id);
    assert.notEqual(observations[0].sourceId, observations[1].sourceId);
    assert.notEqual(observations[0].siteId, observations[1].siteId);
});

test('synthetic imports stay quarantined from real-mode filtering', async () => {
    const store = createStore();
    const result = await applyFixture(store, packageFixture({ synthetic: true }));
    assert.equal(result.dataset.observations[0].isSynthetic, true);
    assert.equal(result.dataset.sites[1].isSynthetic, true);
    assert.equal(result.dataset.syntheticSources.length, 1);
    const filtered = filterEvidence(result.dataset, { startDate: '2024-01-01', endDate: '2025-01-01', includeSynthetic: false,
        allowedStatuses: ['unverified_report'] });
    assert.equal(filtered.observations.length, 0);
    assert.equal(filtered.surveys.length, 0);
});

test('mixed package/source/record synthetic flags reject instead of weakening quarantine', async () => {
    for (const kind of ['sources', 'sites', 'observations', 'surveys']) {
        const store = createStore();
        const fixture = packageFixture({ synthetic: true });
        fixture[kind][0].isSynthetic = false;
        const preview = await store.preview(JSON.stringify(fixture));
        assert.equal(preview.valid, false, kind);
        assert.equal((await store.apply(preview)).ok, false);
        assert.equal(store.getHistory().length, 0);
    }
});

test('zero accuracy becomes unknown with an explanation; negative or string accuracy rejects', async () => {
    const store = createStore();
    const fixture = packageFixture();
    fixture.observations[0].accuracyMeters = 0;
    const preview = await store.preview(JSON.stringify(fixture));
    assert.match(preview.warnings.join(' '), /zero.*unknown/i);
    const result = await store.apply(preview);
    assert.equal(result.dataset.observations[0].accuracyMeters, null);
    assert.match(result.dataset.observations[0].notes, /zero.*unknown/i);
    for (const invalid of [-1, '0']) {
        fixture.observations[0].accuracyMeters = invalid;
        assert.equal((await store.preview(JSON.stringify(fixture))).valid, false);
    }
});

test('malformed record arrays and missing source metadata reject the whole package', async () => {
    for (const key of ['sources', 'sites', 'observations', 'surveys']) {
        const store = createStore();
        const fixture = packageFixture();
        fixture[key] = {};
        const preview = await store.preview(JSON.stringify(fixture));
        assert.equal(preview.valid, false, key);
        assert.equal((await store.apply(preview)).ok, false);
        assert.equal(store.getDataset().observations.length, 0);
    }
    for (const key of ['publisher', 'url', 'license', 'spatialAccuracy', 'limitations', 'retrievalDate']) {
        const fixture = packageFixture();
        delete fixture.sources[0][key];
        assert.equal((await createStore().preview(JSON.stringify(fixture))).valid, false, key);
    }
});

test('unsafe attribution URLs, invalid metadata dates, unknown fields, and malformed record types reject', async () => {
    const mutations = [
        f => { f.sources[0].url = 'javascript:alert(1)'; },
        f => { f.sources[0].url = 'https://user:secret@example.org'; },
        f => { f.sources[0].retrievalDate = '2024-02-30'; },
        f => { f.sources[0].crs = 'EPSG:3857'; },
        f => { f.revision = 1.1; },
        f => { f.revision = 0; },
        f => { f.schemaVersion = 2; },
        f => { f.isSynthetic = 'false'; },
        f => { f.packageId = '../unsafe'; },
        f => { f.observations[0].id = ''; },
        f => { f.observations[0].label = {}; },
        f => { f.observations[0].evidenceMethods = 'ground_thermocouple'; },
        f => { f.observations[0].status = 'made_up'; },
        f => { f.observations[0].typoField = 123; },
        f => { f.sites[0].boundaryGeometry = false; }
    ];
    for (const mutate of mutations) {
        const fixture = packageFixture();
        mutate(fixture);
        const preview = await createStore().preview(JSON.stringify(fixture));
        assert.equal(preview.valid, false, JSON.stringify(fixture));
        assert.ok(preview.issues.length > 0);
    }
});

test('calendar errors and inverted observation dates reject before publication', async () => {
    const mutations = [
        f => { f.observations[0].observationDate = '2024-02-30'; },
        f => { f.observations[0].endDate = '2024-07-31'; },
        f => { f.observations[0].lastObservedDate = '2024-07-31'; },
        f => { f.surveys[0].surveyDate = '2024-13-01'; }
    ];
    for (const mutate of mutations) {
        const fixture = packageFixture();
        mutate(fixture);
        assert.equal((await createStore().preview(JSON.stringify(fixture))).valid, false);
    }
});

test('malformed, unsupported, unclosed, and out-of-range geometry rejects atomically', async () => {
    const geometries = [
        null, { type: 'LineString', coordinates: [[-106, 45], [-105, 46]] },
        { type: 'Point', coordinates: [181, 45] }, { type: 'Point', coordinates: [-106, '45'] },
        { type: 'Point', coordinates: [-106, 45, 'bad altitude'] },
        { type: 'Polygon', coordinates: [[[-106, 45], [-105, 45], [-105, 46], [-106, 46]]] },
        { type: 'Polygon', coordinates: [[[-106, 45], [-106, 45], [-106, 45], [-106, 45]]] }
    ];
    for (const geometry of geometries) {
        const store = createStore();
        const fixture = packageFixture();
        fixture.observations[0].geometry = geometry;
        assert.equal((await store.preview(JSON.stringify(fixture))).valid, false, JSON.stringify(geometry));
        assert.equal(store.getDataset().observations.length, 0);
    }
});

test('duplicate IDs and missing parent/source references reject without partial records', async () => {
    const mutations = [
        f => { f.observations.push(structuredClone(f.observations[0])); },
        f => { f.surveys[0].id = 'observation'; },
        f => { f.sources.push(structuredClone(f.sources[0])); },
        f => { f.observations[0].siteId = 'missing'; },
        f => { f.observations[0].sourceId = 'missing'; }
    ];
    for (const mutate of mutations) {
        const store = createStore();
        const fixture = packageFixture();
        mutate(fixture);
        const preview = await store.preview(JSON.stringify(fixture));
        assert.equal(preview.valid, false);
        assert.equal((await store.apply(preview)).ok, false);
        assert.equal(store.getHistory().length, 0);
    }
});

test('oversized, malformed JSON, invalid UTF-8, and excessive record counts reject without storage changes', async () => {
    const store = createStore();
    for (const input of ['{bad json', new Uint8Array([0xff]), 'x'.repeat(2 * 1024 * 1024 + 1)]) {
        assert.equal((await store.preview(input)).valid, false);
    }
    const fixture = packageFixture();
    fixture.observations = Array.from({ length: 5001 }, (_, index) => ({ ...fixture.observations[0], id: `row-${index}` }));
    assert.equal((await store.preview(JSON.stringify(fixture))).valid, false);
    assert.equal(store.getHistory().length, 0);
});

test('apply rejects copied previews and rechecks revision ordering after preview', async () => {
    const store = createStore();
    const oldPreview = await store.preview(JSON.stringify(packageFixture()));
    assert.equal((await store.apply({ ...oldPreview })).ok, false);
    await applyFixture(store, packageFixture({ revision: 2 }));
    const staleResult = await store.apply(oldPreview);
    assert.equal(staleResult.ok, false);
    assert.equal(store.getHistory().length, 1);
    assert.equal(store.getHistory()[0].revision, 2);
});

test('caller mutations cannot alter private stored records or trusted preview contents', async () => {
    const store = createStore();
    const preview = await store.preview(JSON.stringify(packageFixture()));
    preview.counts.observations = 999;
    preview.packageId = 'fake';
    const result = await store.apply(preview);
    assert.equal(result.dataset.observations.length, 1);
    result.dataset.observations[0].status = 'field_confirmed';
    store.getHistory()[0].originalBase64 = 'bad';
    assert.equal(store.getDataset().observations[0].status, 'unverified_report');
    assert.notEqual(store.getHistory()[0].originalBase64, 'bad');
});

test('stored originals restore all revisions and only the newest active records', async () => {
    const storage = new MemoryStorage();
    const initial = createStore(storage);
    await applyFixture(initial);
    const next = packageFixture({ revision: 2 });
    next.observations[0].notes = 'Updated record';
    await applyFixture(initial, next);
    const restored = createStore(storage);
    const result = await restored.restore();
    assert.equal(result.ok, true);
    assert.equal(result.restoredPackages, 1);
    assert.equal(restored.getHistory().length, 2);
    assert.equal(result.dataset.observations.length, 1);
    assert.match(result.dataset.observations[0].notes, /Updated record/);
});

test('corrupt storage and changed stored hashes restore nothing and retain originals for recovery', async () => {
    const storage = new MemoryStorage();
    storage.values.set('prbsim.local-evidence.v1', '{corrupt json');
    const corrupted = createStore(storage);
    const result = await corrupted.restore();
    assert.equal(result.ok, false);
    assert.equal(result.persistence.status, 'corrupt');
    assert.equal(result.dataset.observations.length, 0);
    await applyFixture(corrupted);
    assert.equal(storage.getItem(intake.IMPORT_STORAGE_KEY), '{corrupt json');
    await corrupted.reset();
    assert.equal(storage.getItem(intake.IMPORT_STORAGE_KEY), null);

    const valid = createStore(storage);
    await applyFixture(valid);
    const saved = JSON.parse(storage.getItem(intake.IMPORT_STORAGE_KEY));
    saved.revisions[0].sha256 = '0'.repeat(64);
    storage.setItem(intake.IMPORT_STORAGE_KEY, JSON.stringify(saved));
    const tampered = await createStore(storage).restore();
    assert.equal(tampered.ok, false);
    assert.equal(tampered.dataset.observations.length, 0);
});

test('unavailable and quota-limited storage report session-only results without losing in-session originals', async () => {
    const unavailable = new MemoryStorage();
    unavailable.readError = true;
    const store = createStore(unavailable);
    assert.equal((await store.restore()).persistence.status, 'session-only');
    const first = await applyFixture(store);
    assert.equal(first.ok, true);
    assert.equal(first.persistence.status, 'session-only');
    assert.match(first.persistence.message, /session|reload/i);
    assert.equal(store.getHistory().length, 1);

    const quota = new MemoryStorage();
    const quotaStore = createStore(quota);
    await applyFixture(quotaStore);
    quota.writeError = true;
    const next = await applyFixture(quotaStore, packageFixture({ revision: 2 }));
    assert.equal(next.ok, true);
    assert.equal(next.persistence.status, 'session-only');
    assert.match(next.persistence.message, /quota|save|storage/i);
    assert.equal(quotaStore.getHistory().length, 2);
    assert.equal((await createStore(quota).restore()).dataset.observations.length, 1);
});

test('reset removes imports only and explains removal failure without claiming persistent deletion', async () => {
    const storage = new MemoryStorage();
    storage.values.set('unrelated-app', 'keep');
    const store = createStore(storage);
    await applyFixture(store);
    storage.removeError = true;
    const limited = await store.reset();
    assert.equal(limited.dataset.sites[0].id, 'bundled-site');
    assert.equal(limited.dataset.observations.length, 0);
    assert.match(limited.persistence.message, /return.*reload|reload.*return/i);
    storage.removeError = false;
    await store.reset();
    assert.equal(storage.getItem(intake.IMPORT_STORAGE_KEY), null);
    assert.equal(storage.getItem('unrelated-app'), 'keep');
    assert.equal(store.getHistory().length, 0);
});

test('a synthetic package cannot become empirical through a later revision', async () => {
    const store = createStore();
    await applyFixture(store, packageFixture({ synthetic: true }));
    const preview = await store.preview(JSON.stringify(packageFixture({ revision: 2, synthetic: false })));
    assert.equal(preview.valid, false);
    assert.match(preview.issues[0].message, /synthetic.*change|change.*synthetic/i);
    assert.equal(store.getHistory().length, 1);
    assert.equal(store.getDataset().observations[0].isSynthetic, true);
});

test('large valid originals remain recoverable without stack or encoding failures', async () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    const text = JSON.stringify(packageFixture()) + ' '.repeat(1024 * 1024);
    const result = await store.apply(await store.preview(text));
    assert.equal(result.ok, true, JSON.stringify(result.issues));
    assert.equal(new TextDecoder().decode(intake.originalRevisionBytes(store.getHistory()[0])), text);
    const restored = await createStore(storage).restore();
    assert.equal(restored.ok, true, JSON.stringify(restored.issues));
    assert.equal(restored.dataset.observations.length, 1);
});

test('record namespaces also reject collisions with deliberately matching bundled IDs', async () => {
    assert.equal(typeof intake?.EvidenceImportStore, 'function');
    const base = bundled();
    base.sites[0].id = 'local:controlled-test:record:site';
    const store = new intake.EvidenceImportStore(base, { storage: null });
    const preview = await store.preview(JSON.stringify(packageFixture()));
    assert.equal(preview.valid, false);
    assert.equal((await store.apply(preview)).ok, false);
    assert.equal(store.getDataset().sites.length, 1);
});

test('a corrupt later saved original prevents all restoration, and raw archive recovery stays available', async () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    await applyFixture(store);
    await applyFixture(store, packageFixture({ revision: 2 }));
    const saved = JSON.parse(store.getSavedArchive());
    saved.revisions[1].packageId = 'wrong-package';
    const damaged = JSON.stringify(saved);
    storage.setItem(intake.IMPORT_STORAGE_KEY, damaged);
    const next = createStore(storage);
    const result = await next.restore();
    assert.equal(result.ok, false);
    assert.equal(next.getHistory().length, 0);
    assert.equal(result.dataset.observations.length, 0);
    assert.equal(next.getSavedArchive(), damaged);
});

test('excessive coordinates reject a file within the byte limit', async () => {
    const fixture = packageFixture();
    const ring = Array.from({ length: 100001 }, () => [0, 0]);
    ring[1] = [1, 0]; ring[2] = [1, 1]; ring[3] = [0, 1];
    fixture.observations[0].geometry = { type: 'Polygon', coordinates: [ring] };
    const preview = await createStore().preview(JSON.stringify(fixture));
    assert.equal(preview.valid, false);
    assert.match(preview.issues[0].message, /coordinate.*limit/i);
});

test('the downloadable example is explicitly synthetic and can be previewed without fabricated empirical claims', async () => {
    const sampleUrl = new URL('../../public/data/prb/templates/synthetic-evidence-package.json', import.meta.url);
    assert.equal(fs.existsSync(sampleUrl), true, 'A clearly synthetic sample package must be supplied');
    const sample = fs.readFileSync(sampleUrl);
    const preview = await createStore().preview(sample);
    assert.equal(preview.valid, true, JSON.stringify(preview.issues));
    assert.equal(preview.isSynthetic, true);
    assert.match(preview.sourceNames.join(' '), /SYNTHETIC/);
});

test('a stale browser session cannot overwrite an archive changed by another session', async () => {
    const storage = new MemoryStorage();
    const newerSession = createStore(storage);
    const staleSession = createStore(storage);
    await staleSession.restore();
    await applyFixture(newerSession);
    const saved = storage.getItem(intake.IMPORT_STORAGE_KEY);
    const preview = await staleSession.preview(JSON.stringify(packageFixture({ revision: 2 })));
    const result = await staleSession.apply(preview);
    assert.equal(result.ok, false);
    assert.match(result.issues[0].message, /another.*session|another.*window|changed.*reload/i);
    assert.equal(staleSession.getHistory().length, 0);
    assert.equal(storage.getItem(intake.IMPORT_STORAGE_KEY), saved);
});
