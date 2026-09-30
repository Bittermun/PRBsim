/**
 * Production Automated Test Suite for PRB Coal-Fire Evidence Explorer
 *
 * Exercises production modules (`load.ts`, `select.ts`, `ExportDialog.ts`) against
 * the checked-in datasets in `public/data/prb/remington/` and controlled malformed fixtures.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    loadPRBEvidenceData,
    validateDatasetIntegrity,
    ValidationError
} from '../../src/prb/data/load.ts';
import {
    filterEvidence,
    isDateWithinWindow,
    groupObservationsBySite
} from '../../src/prb/data/select.ts';
import {
    buildExportGeoJson,
    buildExportCsv,
    buildStaticBriefHtml,
    escapeCsvCell
} from '../../src/prb/ui/ExportDialog.ts';
import {
    escapeHtml,
    sanitizeExternalUrl,
    formatFireCauseRecord
} from '../../src/prb/ui/EvidencePanel.ts';
import { buildLayerGeoJsons } from '../../src/prb/map/layers.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');

/**
 * Creates a deterministic local file-backed fetch implementation for testing
 * `loadPRBEvidenceData` against the real repository files in `public/`.
 */
function createLocalFetch(overrides = {}) {
    return async (urlStr) => {
        const cleanPath = String(urlStr).replace(/^https?:\/\/[^/]+/, '');
        if (Object.prototype.hasOwnProperty.call(overrides, cleanPath)) {
            const overrideVal = overrides[cleanPath];
            const text = typeof overrideVal === 'string' ? overrideVal : JSON.stringify(overrideVal);
            const buf = Buffer.from(text, 'utf-8');
            return {
                ok: true,
                status: 200,
                arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
                json: async () => JSON.parse(text)
            };
        }
        const diskPath = path.join(PUBLIC_DIR, cleanPath);
        if (!fs.existsSync(diskPath)) {
            return { ok: false, status: 404 };
        }
        const buf = fs.readFileSync(diskPath);
        return {
            ok: true,
            status: 200,
            arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
            json: async () => JSON.parse(buf.toString('utf-8'))
        };
    };
}

describe('PRB Production Data Loading & Provenance (Phase 1 & Phase 3)', () => {
    it('loads checked-in datasets, verifies SHA256 hashes, and marks schematic geology as synthetic', async () => {
        const prevFetch = globalThis.fetch;
        globalThis.fetch = createLocalFetch();
        try {
            const data = await loadPRBEvidenceData('');
            assert.equal(data.manifest.datasets.length, 3);
            for (const ds of data.manifest.datasets) {
                assert.equal(
                    ds.hashVerified,
                    true,
                    `Expected dataset ${ds.id} to have hashVerified=true`
                );
            }

            // Phase 1: Only 1 real wildfire perimeter; schematic geology is marked synthetic
            assert.equal(data.wildfirePerimeters.length, 1);
            assert.equal(data.wildfirePerimeters[0].isSynthetic, false);
            assert.equal(data.wildfirePerimeters[0].irwinId, '{2B136641-8C91-4C70-960D-64E05BC390E4}');
            assert.equal(data.wildfirePerimeters[0].uniqueFireId, '2024-WYSHX-240442');
            assert.equal(data.wildfirePerimeters[0].isFireCauseInvestigated, 0);
            assert.equal(data.wildfirePerimeters[0].mapDate, '2025-01-15');
            assert.equal(data.wildfirePerimeters[0].temporalRole, 'retrospective_final_footprint');
            assert.match(formatFireCauseRecord(data.wildfirePerimeters[0]), /Uninvestigated in WFIGS/);

            assert.equal(data.geologicalFeatures.length, 3);
            for (const g of data.geologicalFeatures) {
                assert.equal(
                    g.isSynthetic,
                    true,
                    `Geological fixture ${g.id} must be marked isSynthetic=true`
                );
            }

            // Phase 3: Missing accuracyMeters on syn-obs-003 stays null (never coerced to 50)
            const obs003 = data.observations.find(o => o.id === 'syn-obs-003');
            assert.ok(obs003, 'Expected syn-obs-003 to exist');
            assert.equal(obs003.accuracyMeters, null);

            // Phase 5: Non-spatial Remington Case Study Evidence Matrix is present in manifest
            assert.ok(data.manifest.remingtonCaseChronology);
            assert.ok(data.manifest.remingtonCaseChronology.entries.length >= 4);
        } finally {
            globalThis.fetch = prevFetch;
        }
    });

    it('enforces pure LF line endings across all checked-in dataset JSON/GeoJSON files for cross-platform SHA256 parity', () => {
        const filesToVerify = [
            'data/prb/remington/manifest.json',
            'data/prb/remington/fire_perimeters.geojson',
            'data/prb/remington/geological_context.geojson',
            'data/prb/remington/synthetic_fixtures.json',
            'data/prb/remington/raw/wfigs_remington_raw.geojson'
        ];
        for (const rel of filesToVerify) {
            const bytes = fs.readFileSync(path.join(PUBLIC_DIR, rel));
            assert.equal(
                bytes.includes(0x0d),
                false,
                `Expected ${rel} to use pure LF line endings (no CR 0x0d bytes) so SHA256 matches on Windows and Linux`
            );
        }
        assert.equal(
            fs.existsSync(path.join(PUBLIC_DIR, 'data/prb/remington/remington_fire_perimeter.geojson')),
            false,
            'Legacy duplicate remington_fire_perimeter.geojson should not exist in public/data/prb/remington/'
        );
    });

    it('throws ValidationError when fetched file bytes do not match manifest processedSha256', async () => {
        const prevFetch = globalThis.fetch;
        const rawPerim = JSON.parse(
            fs.readFileSync(path.join(PUBLIC_DIR, 'data/prb/remington/fire_perimeters.geojson'), 'utf-8')
        );
        rawPerim.metadata.title = 'Tampered Title';
        globalThis.fetch = createLocalFetch({
            '/data/prb/remington/fire_perimeters.geojson': rawPerim
        });
        try {
            await assert.rejects(
                () => loadPRBEvidenceData(''),
                (err) => err instanceof ValidationError && /SHA256 mismatch/i.test(err.message)
            );
        } finally {
            globalThis.fetch = prevFetch;
        }
    });
});

describe('PRB Temporal Model & Filtering (Phase 1 & Phase 2)', () => {
    it('excludes schematic geology, synthetic observations, and synthetic surveys in default real mode', async () => {
        const prevFetch = globalThis.fetch;
        globalThis.fetch = createLocalFetch();
        try {
            const data = await loadPRBEvidenceData('');
            const realFiltered = filterEvidence(data, {
                startDate: '2024-08-01',
                endDate: '2024-10-01',
                includeSynthetic: false,
                allowedStatuses: [
                    'field_confirmed',
                    'sensor_detection',
                    'unverified_report',
                    'extinguished',
                    'reignited_vegetation'
                ]
            });

            assert.equal(realFiltered.wildfirePerimeters.length, 1);
            assert.equal(realFiltered.observations.length, 0);
            assert.equal(realFiltered.sites.length, 0);
            assert.equal(realFiltered.surveys.length, 0);
            assert.equal(
                realFiltered.geologicalFeatures.length,
                0,
                'Schematic geological polygons must be excluded when includeSynthetic is false'
            );
            assert.equal(realFiltered.activeSyntheticCount, 0);

            const layerGeoJsons = buildLayerGeoJsons(realFiltered);
            assert.equal(layerGeoJsons.perimetersFc.features.length, 1);
            assert.equal(layerGeoJsons.geologyFc.features.length, 0);
            assert.equal(layerGeoJsons.observationsFc.features.length, 0);
            assert.equal(layerGeoJsons.surveysFc.features.length, 0);
            assert.equal(layerGeoJsons.sitesFc.features.length, 0);
        } finally {
            globalThis.fetch = prevFetch;
        }
    });

    it('regression test: selecting 2024-08-22 returns the Remington perimeter labeled as final footprint with mapDate 2025-01-15', async () => {
        const prevFetch = globalThis.fetch;
        globalThis.fetch = createLocalFetch();
        try {
            const data = await loadPRBEvidenceData('');
            const aug22 = filterEvidence(data, {
                startDate: '2024-08-22',
                endDate: '2024-08-22',
                includeSynthetic: false,
                allowedStatuses: ['field_confirmed', 'sensor_detection', 'unverified_report']
            });

            assert.equal(aug22.wildfirePerimeters.length, 1);
            const perim = aug22.wildfirePerimeters[0];
            assert.equal(perim.id, 'remington-perimeter-2024');
            assert.equal(perim.discoveryDate, '2024-08-22');
            assert.equal(perim.mapDate, '2025-01-15');
            assert.equal(perim.temporalRole, 'retrospective_final_footprint');

            // Verify that exports on 2024-08-22 also preserve final footprint semantics and mapDate 2025-01-15
            const geojsonStr = buildExportGeoJson(aug22, data.manifest, {
                startDate: '2024-08-22',
                endDate: '2024-08-22',
                includeSynthetic: false
            });
            const geojson = JSON.parse(geojsonStr);
            assert.equal(geojson.features.length, 1);
            assert.equal(geojson.features[0].properties.temporalRole, 'retrospective_final_footprint');
            assert.equal(geojson.features[0].properties.mapDate, '2025-01-15');

            const csvStr = buildExportCsv(aug22, data.manifest);
            assert.match(csvStr, /retrospective_final_footprint/);
            assert.match(csvStr, /2025-01-15/);
        } finally {
            globalThis.fetch = prevFetch;
        }
    });

    it('supports observation intervals (observationDate through endDate) and rejects inverted or invalid filter ranges', async () => {
        const prevFetch = globalThis.fetch;
        globalThis.fetch = createLocalFetch();
        try {
            const data = await loadPRBEvidenceData('');
            // syn-obs-001 has observationDate 2024-09-02 and endDate 2024-09-18
            const midInterval = filterEvidence(data, {
                startDate: '2024-09-10',
                endDate: '2024-09-12',
                includeSynthetic: true,
                allowedStatuses: ['sensor_detection', 'field_confirmed', 'unverified_report']
            });
            assert.ok(
                midInterval.observations.some(o => o.id === 'syn-obs-001'),
                'Expected syn-obs-001 (2024-09-02..2024-09-18) to match interval window 2024-09-10..2024-09-12'
            );

            // Inverted date range must throw ValidationError
            assert.throws(
                () =>
                    filterEvidence(data, {
                        startDate: '2024-10-01',
                        endDate: '2024-08-01',
                        includeSynthetic: false,
                        allowedStatuses: ['field_confirmed']
                    }),
                (err) => err instanceof ValidationError && /Inverted date window/i.test(err.message)
            );

            // Impossible calendar date in filter range must throw ValidationError
            assert.throws(
                () => isDateWithinWindow('2024-09-01', '2024-02-30', '2024-09-15'),
                (err) => err instanceof ValidationError
            );

            // Inverted record interval (recordEndDate < dateStr) must throw ValidationError
            assert.throws(
                () => isDateWithinWindow('2024-09-18', '2024-09-01', '2024-09-30', '2024-09-02'),
                (err) => err instanceof ValidationError && /Inverted record interval/i.test(err.message)
            );
        } finally {
            globalThis.fetch = prevFetch;
        }
    });
});

describe('PRB Strict Schema, Coordinate, Date, Enum, and Referential Integrity Validation (Phase 3)', () => {
    it('rejects [999, 999], NaN/non-finite coordinates, unclosed polygon rings, impossible dates, duplicate IDs, invalid enums, and unknown sourceId/siteId', async () => {
        const prevFetch = globalThis.fetch;
        globalThis.fetch = createLocalFetch();
        const baseData = await loadPRBEvidenceData('');
        globalThis.fetch = prevFetch;

        const cloneBase = () => structuredClone(baseData);

        // 1. Out-of-bounds coordinates [999, 999]
        {
            const bad = cloneBase();
            bad.observations[0].geometry.coordinates = [999, 999];
            assert.throws(
                () => validateDatasetIntegrity(bad),
                (err) => err instanceof ValidationError && /Longitude|Coordinate/i.test(err.message)
            );
        }

        // 2. Non-finite coordinates [NaN, 45]
        {
            const bad = cloneBase();
            bad.observations[0].geometry.coordinates = [Number.NaN, 45.0];
            assert.throws(
                () => validateDatasetIntegrity(bad),
                (err) => err instanceof ValidationError && /non-finite/i.test(err.message)
            );
        }

        // 3. Unclosed polygon ring
        {
            const bad = cloneBase();
            bad.surveys[0].geometry.coordinates = [[
                [-106.05, 45.08],
                [-105.95, 45.08],
                [-105.95, 45.15],
                [-106.05, 45.15] // not closed!
            ]];
            assert.throws(
                () => validateDatasetIntegrity(bad),
                (err) => err instanceof ValidationError && /not closed/i.test(err.message)
            );
        }

        // 4. Impossible calendar date (2024-02-30)
        {
            const bad = cloneBase();
            bad.observations[0].observationDate = '2024-02-30';
            assert.throws(
                () => validateDatasetIntegrity(bad),
                (err) => err instanceof ValidationError && /Invalid calendar date/i.test(err.message)
            );
        }

        // 5. Duplicate IDs
        {
            const bad = cloneBase();
            bad.observations.push({ ...structuredClone(bad.observations[0]) });
            assert.throws(
                () => validateDatasetIntegrity(bad),
                (err) => err instanceof ValidationError && /Duplicate/i.test(err.message)
            );
        }

        // 6. Unknown sourceId reference (must throw ValidationError, not console.warn)
        {
            const bad = cloneBase();
            bad.observations[0].sourceId = 'non-existent-source-999';
            assert.throws(
                () => validateDatasetIntegrity(bad),
                (err) => err instanceof ValidationError && /unknown sourceId/i.test(err.message)
            );
        }

        // 7. Unknown siteId reference
        {
            const bad = cloneBase();
            bad.observations[0].siteId = 'non-existent-site-999';
            assert.throws(
                () => validateDatasetIntegrity(bad),
                (err) => err instanceof ValidationError && /unknown siteId/i.test(err.message)
            );
        }

        // 8. Invalid enum values (status, temporalRole, unitType, groupingUncertainty, survey result)
        {
            const badStatus = cloneBase();
            badStatus.observations[0].status = 'made_up_status';
            assert.throws(
                () => validateDatasetIntegrity(badStatus),
                (err) => err instanceof ValidationError && /Invalid verification status/i.test(err.message)
            );

            const badRole = cloneBase();
            badRole.wildfirePerimeters[0].temporalRole = 'invalid_role';
            assert.throws(
                () => validateDatasetIntegrity(badRole),
                (err) => err instanceof ValidationError && /Invalid temporalRole/i.test(err.message)
            );

            const badUnit = cloneBase();
            badUnit.geologicalFeatures[0].unitType = 'invalid_unit';
            assert.throws(
                () => validateDatasetIntegrity(badUnit),
                (err) => err instanceof ValidationError && /Invalid unitType/i.test(err.message)
            );

            const badGroup = cloneBase();
            badGroup.sites[0].groupingUncertainty = 'invalid_grouping';
            assert.throws(
                () => validateDatasetIntegrity(badGroup),
                (err) => err instanceof ValidationError && /Invalid groupingUncertainty/i.test(err.message)
            );

            const badSurvey = cloneBase();
            badSurvey.surveys[0].result = 'invalid_result';
            assert.throws(
                () => validateDatasetIntegrity(badSurvey),
                (err) => err instanceof ValidationError && /Invalid survey result/i.test(err.message)
            );
        }

        // 9. Inverted observation interval & negative accuracyMeters & synthetic cross-reference
        {
            const badInterval = cloneBase();
            badInterval.observations[0].observationDate = '2024-09-20';
            badInterval.observations[0].endDate = '2024-09-05';
            assert.throws(
                () => validateDatasetIntegrity(badInterval),
                (err) => err instanceof ValidationError && /Inverted observation interval/i.test(err.message)
            );

            const badAcc = cloneBase();
            badAcc.observations[0].accuracyMeters = -10;
            assert.throws(
                () => validateDatasetIntegrity(badAcc),
                (err) => err instanceof ValidationError && /Invalid accuracyMeters/i.test(err.message)
            );

            const badCrossRef = cloneBase();
            badCrossRef.observations[0].isSynthetic = false;
            assert.throws(
                () => validateDatasetIntegrity(badCrossRef),
                (err) => err instanceof ValidationError && /cannot reference synthetic|cannot belong to synthetic/i.test(err.message)
            );
        }
    });

    it('preserves multi-vent site grouping without collapsing distinct observations into independent site counts', async () => {
        const prevFetch = globalThis.fetch;
        globalThis.fetch = createLocalFetch();
        const data = await loadPRBEvidenceData('');
        globalThis.fetch = prevFetch;

        const grouped = groupObservationsBySite(data.observations);
        const badgerVents = grouped.get('syn-site-badger-creek-complex') || [];
        assert.equal(badgerVents.length, 2);
        assert.equal(grouped.size, 2);
    });
});

describe('PRB Exports, Print Brief & Security Escaping Helpers (Phase 3 & Phase 5)', () => {
    it('exports source metadata, evidenceMethods, coordinates, site grouping uncertainty, actual fire cause, surveys, and geology in CSV/GeoJSON/Brief', async () => {
        const prevFetch = globalThis.fetch;
        globalThis.fetch = createLocalFetch();
        const data = await loadPRBEvidenceData('');
        globalThis.fetch = prevFetch;

        const synthFiltered = filterEvidence(data, {
            startDate: '1975-01-01',
            endDate: '2024-12-31',
            includeSynthetic: true,
            allowedStatuses: [
                'field_confirmed',
                'sensor_detection',
                'unverified_report',
                'extinguished',
                'reignited_vegetation'
            ]
        });

        const csv = buildExportCsv(synthFiltered, data.manifest, data.syntheticSources);
        const lines = csv.trim().split('\n');
        // Header + 1 perimeter + 3 observations + 1 survey + 3 geology = 9 lines
        assert.equal(lines.length, 9);
        // Check that null accuracyMeters is exported as 'unknown', not '50'
        assert.match(csv, /syn-obs-003.*unknown/);
        // Check that evidenceMethods and synthetic source URLs are populated
        assert.match(csv, /ground_thermocouple; gas_sampling/);
        assert.match(csv, /https:\/\/github\.com\/Bittermun\/PRBsim/);
        // Check that site grouping uncertainty is included
        assert.match(csv, /unresolved_multi_vent/);
        // Check that survey and geology records are included
        assert.match(csv, /syn-survey-null-bench-2024/);
        assert.match(csv, /geo-fort-union-formation-bound/);

        // Verify brief HTML contains legend, attribution, capture-failure notice when snapshot is empty, and Phase 5 chronology
        const briefHtml = buildStaticBriefHtml(
            synthFiltered,
            data.manifest,
            {
                startDate: '2024-08-01',
                endDate: '2024-10-01',
                includeSynthetic: true
            },
            '',
            'Canvas capture failed during test.'
        );
        assert.match(briefHtml, /Canvas capture failed during test\./);
        assert.match(briefHtml, /OpenFreeMap/);
        assert.match(briefHtml, /OpenStreetMap/);
        assert.match(briefHtml, /MAP SYMBOLOGY &amp; LEGEND|MAP SYMBOLOGY & LEGEND/i);
        assert.match(briefHtml, /Extinguished \/ Inactive Historical Vent/);
        assert.match(briefHtml, /ground_thermocouple, gas_sampling/);
        assert.match(briefHtml, /Montana Free Press/);
        assert.match(briefHtml, /107 burning/);
        assert.match(briefHtml, /Meredith \(2016\)/);
        assert.match(briefHtml, /rel="noopener noreferrer"/);
    });

    it('sanitizes untrusted URLs, HTML strings, snapshot data URLs, and CSV formula payloads', async () => {
        assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
        assert.equal(sanitizeExternalUrl('javascript:alert(1)'), null);
        assert.equal(sanitizeExternalUrl('data:text/html,<script>'), null);
        assert.equal(sanitizeExternalUrl('https://data-nifc.opendata.arcgis.com/'), 'https://data-nifc.opendata.arcgis.com/');

        // CSV formula-injection neutralization and RFC 4180 quoting
        assert.equal(escapeCsvCell('=cmd|\' /C calc\'!A0'), '\'=cmd|\' /C calc\'!A0');
        assert.equal(escapeCsvCell('=HYPERLINK("http://evil", "click")'), '"\'=HYPERLINK(""http://evil"", ""click"")"');
        assert.equal(escapeCsvCell('+SUM(A1:A2)'), '\'+SUM(A1:A2)');
        assert.equal(escapeCsvCell('line1\nline2'), '"line1\nline2"');

        const prevFetch = globalThis.fetch;
        globalThis.fetch = createLocalFetch();
        const data = await loadPRBEvidenceData('');
        globalThis.fetch = prevFetch;

        const filtered = filterEvidence(data, {
            startDate: '2024-08-01',
            endDate: '2024-10-01',
            includeSynthetic: false,
            allowedStatuses: ['field_confirmed']
        });

        // Malicious mapSnapshotDataUrl must be rejected by buildStaticBriefHtml
        const maliciousBrief = buildStaticBriefHtml(
            filtered,
            data.manifest,
            { startDate: '2024-08-01', endDate: '2024-10-01', includeSynthetic: false },
            '" onerror="alert(1)',
            'Rejected invalid snapshot'
        );
        assert.equal(maliciousBrief.includes('onerror="alert(1)"'), false);
        assert.match(maliciousBrief, /Map Snapshot Unavailable/);
    });
});
