/**
 * Production Automated Test Suite for PRB Evidence Assessment Engine
 * (src/prb/data/assessment.ts)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    loadPRBEvidenceData,
    ValidationError
} from '../../src/prb/data/load.ts';
import { filterEvidence } from '../../src/prb/data/select.ts';
import {
    assessLocation,
    calendarDaysBetween
} from '../../src/prb/data/assessment.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');

function createLocalFetch() {
    return async (urlStr) => {
        const cleanPath = String(urlStr).replace(/^https?:\/\/[^/]+/, '');
        const diskPath = path.join(PUBLIC_DIR, cleanPath);
        if (!fs.existsSync(diskPath)) {
            return {
                ok: false,
                status: 404,
                statusText: 'Not Found',
                arrayBuffer: async () => new ArrayBuffer(0),
                json: async () => ({})
            };
        }
        const buf = fs.readFileSync(diskPath);
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
            json: async () => JSON.parse(buf.toString('utf-8'))
        };
    };
}

describe('PRB Evidence Assessment: Pure Evaluation & Provenance', () => {
    let dataset;
    let realFiltered;
    let synthFiltered;
    let origFetch;

    const realFilter = {
        startDate: '2024-08-01',
        endDate: '2024-10-01',
        includeSynthetic: false,
        allowedStatuses: ['field_confirmed', 'sensor_detection', 'unverified_report', 'extinguished', 'reignited_vegetation']
    };

    const synthFilter = {
        startDate: '2024-08-01',
        endDate: '2024-10-01',
        includeSynthetic: true,
        allowedStatuses: ['field_confirmed', 'sensor_detection', 'unverified_report', 'extinguished', 'reignited_vegetation']
    };

    before(async () => {
        origFetch = globalThis.fetch;
        globalThis.fetch = createLocalFetch();
        dataset = await loadPRBEvidenceData('');
        realFiltered = filterEvidence(dataset, realFilter);
        synthFiltered = filterEvidence(dataset, synthFilter);
    });

    after(() => {
        globalThis.fetch = origFetch;
    });

    it('calendarDaysBetween calculates correct UTC day offsets', () => {
        assert.equal(calendarDaysBetween('2024-08-22', '2024-08-25'), 3);
        assert.equal(calendarDaysBetween('2024-08-25', '2024-08-22'), -3);
        assert.equal(calendarDaysBetween('2024-08-22', '2024-08-22'), 0);
        assert.throws(() => calendarDaysBetween('2024-02-30', '2024-08-22'), ValidationError);
    });

    it('assesses user-selected coordinate in real mode without synthetic influence or causal attribution', () => {
        // Coordinate [-106.45, 45.10] is verified inside the Remington wildfire footprint
        const assessment = assessLocation(
            { kind: 'coordinate', coordinate: [-106.45, 45.10] },
            realFiltered,
            dataset.manifest,
            realFilter,
            dataset.syntheticSources
        );

        assert.ok(assessment !== null);
        assert.equal(assessment.queryOrigin, 'user_selected_coordinate');
        assert.equal(assessment.accuracyMeters, null);
        assert.equal(assessment.observationDate, null);
        assert.equal(assessment.syntheticInfluence, false);
        assert.equal(assessment.causalConclusion, 'unresolved');
        assert.equal(assessment.geologicalRecordIds.length, 0); // No empirical geology bundled
        assert.equal(assessment.surveyRecordIds.length, 0);

        assert.equal(assessment.relationships.length, 1);
        const rel = assessment.relationships[0];
        assert.equal(rel.perimeterId, 'remington-perimeter-2024');
        assert.equal(rel.nominalRelation, 'inside');
        assert.ok(rel.approximateBoundaryDistanceMeters > 0);
        assert.equal(rel.coordinateUncertainty, 'unknown');
        assert.equal(rel.localFireArrivalDate, null);
        assert.equal(rel.daysFromIncidentDiscovery, null);

        // Check research pathways and caveats
        assert.equal(assessment.pathways.length, 3);
        assert.ok(assessment.caveats.some(c => c.includes('Causal direction unresolved')));
        assert.ok(assessment.caveats.some(c => c.includes('User-selected query coordinate')));
    });

    it('assesses user-selected coordinate outside the wildfire footprint', () => {
        // Point far west [-108.0, 45.0]
        const assessment = assessLocation(
            { kind: 'coordinate', coordinate: [-108.0, 45.0] },
            realFiltered,
            dataset.manifest,
            realFilter,
            dataset.syntheticSources
        );

        assert.ok(assessment !== null);
        assert.equal(assessment.relationships.length, 1);
        assert.equal(assessment.relationships[0].nominalRelation, 'outside');
        assert.ok(assessment.relationships[0].approximateBoundaryDistanceMeters > 50000);
    });

    it('assesses point observation in synthetic mode and propagates synthetic influence and day offset', () => {
        // Find a synthetic point observation
        const pointObs = synthFiltered.observations.find(o => o.geometry.type === 'Point');
        assert.ok(pointObs, 'Must have at least one synthetic point observation');

        const assessment = assessLocation(
            { kind: 'observation', observationId: pointObs.id },
            synthFiltered,
            dataset.manifest,
            synthFilter,
            dataset.syntheticSources
        );

        assert.ok(assessment !== null);
        assert.equal(assessment.queryOrigin, 'observation_record');
        assert.equal(assessment.observationDate, pointObs.observationDate);
        assert.equal(assessment.syntheticInfluence, true);
        assert.equal(assessment.causalConclusion, 'unresolved');

        // Check day delta calculation against discovery date (2024-08-22)
        const rel = assessment.relationships[0];
        if (pointObs.datePrecision === 'day') {
            assert.equal(typeof rel.daysFromIncidentDiscovery, 'number');
            assert.equal(rel.daysFromIncidentDiscovery, calendarDaysBetween('2024-08-22', pointObs.observationDate));
        }

        assert.ok(assessment.caveats.some(c => c.includes('SYNTHETIC INFLUENCE')));
    });

    it('returns null when selected observation is hidden or has polygon geometry', () => {
        // 1. Observation not in filtered view
        const nullHidden = assessLocation(
            { kind: 'observation', observationId: 'non-existent-obs-id' },
            realFiltered,
            dataset.manifest,
            realFilter
        );
        assert.equal(nullHidden, null);

        // 2. Polygon observation (if any exists in fixtures)
        const polyObs = synthFiltered.observations.find(o => o.geometry.type === 'Polygon');
        if (polyObs) {
            const nullPoly = assessLocation(
                { kind: 'observation', observationId: polyObs.id },
                synthFiltered,
                dataset.manifest,
                synthFilter,
                dataset.syntheticSources
            );
            assert.equal(nullPoly, null);
        }
    });

    it('throws ValidationError for missing source reference or invalid coordinates', () => {
        // Non-finite coordinate
        assert.throws(() => {
            assessLocation(
                { kind: 'coordinate', coordinate: [NaN, 45.0] },
                realFiltered,
                dataset.manifest,
                realFilter
            );
        }, ValidationError);

        // Mock filtered with invalid source reference
        const corruptFiltered = {
            ...realFiltered,
            wildfirePerimeters: [
                {
                    ...realFiltered.wildfirePerimeters[0],
                    sourceId: 'unknown-fake-source'
                }
            ]
        };

        assert.throws(() => {
            assessLocation(
                { kind: 'coordinate', coordinate: [-106.08, 45.01] },
                corruptFiltered,
                dataset.manifest,
                realFilter
            );
        }, ValidationError);
    });
});
