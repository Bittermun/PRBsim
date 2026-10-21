import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterEvidence } from '../../src/prb/data/select.ts';
import { assessLocation } from '../../src/prb/data/assessment.ts';

const geometry = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] };
const point = { type: 'Point', coordinates: [1, 1] };
function source(id = 'real', isSynthetic = false) {
    return { id, name: `${id} source`, publisher: 'Regression fixture', retrievalDate: '2026-10-20',
        url: 'https://example.test/evidence', license: 'Test fixture', crs: 'EPSG:4326',
        spatialAccuracy: 'Unknown', limitations: 'Diagnostic fixture, not empirical evidence',
        rawSha256: 'a'.repeat(64), processedSha256: 'a'.repeat(64), isSynthetic, hashVerified: true };
}
function perimeter(id, mapDate, temporalRole = 'progression_snapshot', extra = {}) {
    return { id, incidentName: 'Diagnostic incident', irwinId: '', uniqueFireId: 'incident', gisAcres: 1,
        discoveryDate: '2024-08-22', containmentDate: '2024-09-10', controlDate: '2024-10-10',
        mapDate, temporalRole, pooState: '', pooCounty: '', fireCause: 'Undetermined',
        sourceMethod: 'Diagnostic', sourceId: 'real', isSynthetic: false, notes: '', geometry, ...extra };
}
function observation(id, observationDate, datePrecision = 'day', extra = {}) {
    return { id, siteId: 'site', label: id, observationDate, datePrecision, status: 'field_confirmed',
        evidenceMethods: ['ground_thermocouple'], accuracyMeters: null, sourceId: 'real',
        notes: '', isSynthetic: false, geometry: point, ...extra };
}
function survey(id, surveyDate, extra = {}) {
    return { id, surveyName: id, surveyDate, method: 'Thermal survey',
        result: 'no_thermal_anomaly_detected', sourceId: 'real', notes: '', isSynthetic: false, geometry, ...extra };
}
function dataset(extra = {}) {
    return { manifest: { studyArea: 'Diagnostic', generatedAt: '2026-10-20', coreQuestion: 'Diagnostic',
        datasets: [source()], dataGapsChecklist: [], auditedSources: [] },
        sites: [{ id: 'site', name: 'Diagnostic site', coalSeam: 'Unknown', groupingUncertainty: 'unresolved_multi_vent',
            groupingNotes: '', boundaryGeometry: null, isSynthetic: false }],
        wildfirePerimeters: [], geologicalFeatures: [], observations: [], surveys: [], ...extra };
}
function filter(startDate, endDate = startDate, includeSynthetic = false) {
    return { startDate, endDate, includeSynthetic,
        allowedStatuses: ['field_confirmed', 'sensor_detection', 'unverified_report', 'extinguished', 'reignited_vegetation'] };
}
function assessment(data, activeFilter) {
    return assessLocation({ kind: 'coordinate', coordinate: [1, 1] }, filterEvidence(data, activeFilter),
        data.manifest, activeFilter, data.syntheticSources, { dataset: data });
}
function checks(result, pathway = 'surface_to_subsurface') {
    return result.pathways.find(p => p.pathwayId === pathway).missingEvidenceInActiveView.join('\n');
}

describe('Temporal evidence regressions', () => {
    it('selects progression snapshots only within the inclusive map-date interval, keeping final context static', () => {
        const data = dataset({ wildfirePerimeters: [perimeter('early', '2024-08-23'),
            perimeter('future', '2024-09-01'), perimeter('final', '2025-01-15', 'retrospective_final_footprint')] });
        assert.deepEqual(filterEvidence(data, filter('2024-08-24')).wildfirePerimeters.map(p => p.id), ['final']);
        assert.deepEqual(filterEvidence(data, filter('2024-08-23', '2024-09-01')).wildfirePerimeters.map(p => p.id),
            ['early', 'future', 'final']);
        assert.deepEqual(filterEvidence(data, filter('', '2024-08-23')).wildfirePerimeters.map(p => p.id), ['early', 'final']);
    });

    it('retains possibly overlapping month and year observations without inventing their duration', () => {
        const data = dataset({ observations: [observation('month', '2024-08-01', 'month'),
            observation('year', '2024-01-01', 'year'), observation('day', '2024-08-01'),
            observation('known-duration', '2024-08-01', 'day', { endDate: '2024-08-31' })] });
        const result = filterEvidence(data, filter('2024-08-15', '2024-08-31'));
        assert.deepEqual(result.observations.map(o => o.id), ['month', 'year', 'known-duration']);
        assert.equal(result.observations[0].endDate, undefined);
        assert.deepEqual(result.observationTemporalMatches, { month: 'possible', year: 'possible', 'known-duration': 'certain' });
        assert.equal(filterEvidence(data, filter('2024-09-01')).observations.some(o => o.id === 'month'), false);
        assert.equal(filterEvidence(data, filter('2025-01-01')).observations.some(o => o.id === 'year'), false);
        assert.equal(filterEvidence(data, filter('2024-01-01', '2024-12-31')).observationTemporalMatches.year, 'certain');
    });

    it('treats leap-year February as an uncertain 29-day period without extending into March', () => {
        const data = dataset({ observations: [observation('february', '2024-02-01', 'month')] });
        assert.equal(filterEvidence(data, filter('2024-02-29')).observations.length, 1);
        assert.equal(filterEvidence(data, filter('2024-03-01')).observations.length, 0);
    });
});

describe('Source-aware assessment regressions', () => {
    it('identifies the revised assessment method so archived v1 outputs remain distinguishable', () => {
        assert.equal(assessment(dataset(), filter('2024-08-01')).methodVersion, 'prb-evidence-context-v2');
    });

    it('handles repeated same-day records without quadratic date parsing or claiming independent visits', () => {
        let dateReads = 0;
        const observations = Array.from({ length: 200 }, (_, i) => {
            const record = observation(`same-day-${i}`, '2024-08-25');
            Object.defineProperty(record, 'observationDate', { enumerable: true,
                get() { dateReads++; return '2024-08-25'; } });
            return record;
        });
        const data = dataset({ wildfirePerimeters: [perimeter('progress', '2024-08-23')], observations });
        const result = assessment(data, filter('2024-08-01', '2024-09-01'));
        assert.match(checks(result, 'preexisting_or_bias'), /No applicable repeat observation/i);
        assert.ok(dateReads < 10000, `Repeated-visit check should scale linearly; read the date ${dateReads} times for 200 records.`);
    });

    it('describes actual progression and matched pre-fire coverage while leaving baseline adequacy unresolved', () => {
        const data = dataset({ wildfirePerimeters: [perimeter('progress', '2024-08-23')],
            surveys: [survey('prefire', '2024-08-01')], observations: [observation('post', '2024-08-25')] });
        const result = assessment(data, filter('2024-08-01', '2024-09-01'));
        const text = checks(result);
        assert.doesNotMatch(text, /No progression perimeters bundled|No pre-fire thermal survey coverage|No audited public subsurface combustion inventory/);
        assert.match(text, /progress/i);
        assert.match(text, /prefire/);
        assert.match(text, /detection limit|sensitivity|protocol/i);
        assert.match(text, /adequat.*unresolved|unassessed/i);
        assert.match(text, /real source/);
        assert.equal(result.causalConclusion, 'unresolved');
        assert.doesNotMatch(result.caveats.join('\n'), /2025-01-15|retrospective final footprint/);
        assert.ok(result.inputReferences.some(ref => ref.recordId === 'post'));
    });

    it('distinguishes synthetic-only inputs from empirical support, including source-level flags', () => {
        const data = dataset({ syntheticSources: [source('synthetic', true)], wildfirePerimeters: [perimeter('progress', '2024-08-23',
            'progression_snapshot', { sourceId: 'synthetic', isSynthetic: true })],
            surveys: [survey('prefire', '2024-08-01', { sourceId: 'synthetic', isSynthetic: true })] });
        const result = assessment(data, filter('2024-08-01', '2024-09-01', true));
        assert.match(checks(result), /synthetic.only/i);
        assert.match(checks(result), /empirical/i);
        assert.equal(result.syntheticInfluence, true);
        assert.equal(result.causalConclusion, 'unresolved');
    });

    it('keeps pre-fire records available as explicit context when the active display window hides them', () => {
        const data = dataset({ wildfirePerimeters: [perimeter('progress', '2024-08-23')], surveys: [survey('prefire', '2024-08-01')] });
        const result = assessment(data, filter('2024-08-23', '2024-08-30'));
        assert.deepEqual(result.surveyRecordIds, []);
        assert.match(checks(result), /outside.*active|filtered.out/i);
        assert.match(checks(result), /prefire/);
        assert.ok(result.inputReferences.some(ref => ref.recordId === 'prefire'));
    });

    it('uses actual perimeter dates and causes and does not turn an unreviewed report into verified combustion', () => {
        const data = dataset({ wildfirePerimeters: [perimeter('final', '2027-03-19', 'retrospective_final_footprint',
            { reportedCauseGeneral: 'Human', reportedCauseSpecific: 'Equipment', isFireCauseInvestigated: 1 })],
            observations: [observation('report', '2024-08-01', 'day', { status: 'unverified_report', evidenceMethods: ['historical_record'] })] });
        const result = assessment(data, filter('2024-08-01', '2027-03-19'));
        assert.match(result.caveats.join('\n'), /2027-03-19/);
        assert.doesNotMatch(result.caveats.join('\n'), /2025-01-15/);
        assert.match(checks(result, 'subsurface_to_surface'), /Human.*Equipment/);
        assert.doesNotMatch(checks(result, 'subsurface_to_surface'), /Lightning/);
        assert.match(checks(result, 'subsurface_to_surface'), /unverified|unreviewed/i);
        assert.equal(result.causalConclusion, 'unresolved');
    });

    it('does not treat unrelated spatial records as evidence at the query coordinate', () => {
        const elsewhere = { type: 'Polygon', coordinates: [[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]] };
        const data = dataset({ wildfirePerimeters: [perimeter('elsewhere', '2024-08-23', 'progression_snapshot', { geometry: elsewhere })],
            surveys: [survey('faraway-survey', '2024-08-01', { geometry: elsewhere })],
            observations: [observation('faraway-observation', '2024-08-01', 'day', { geometry: { type: 'Point', coordinates: [11, 11] } })] });
        const text = checks(assessment(data, filter('2024-08-01', '2024-09-01')));
        assert.match(text, /No applicable.*progression/i);
        assert.match(text, /No applicable.*pre.fire/i);
        assert.doesNotMatch(text, /faraway-survey|faraway-observation/);
    });
});
