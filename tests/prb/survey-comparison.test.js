import { deepEqual, equal, throws } from 'node:assert/strict';
import { test } from 'node:test';
import { compareSurveys } from '../../src/prb/data/survey-comparison.ts';

const ring = (west, south, east, north) => [
    [west, south], [east, south], [east, north], [west, north], [west, south]
];
const source = {
    id: 'test-source', name: 'Test source', publisher: 'Test', url: 'https://example.invalid/',
    license: 'Test fixture', retrievalDate: '2026-11-22', limitations: '', spatialAccuracy: 'Unknown'
};
const sources = new Map([[source.id, source]]);
const survey = (date, rings) => ({
    id: date, surveyName: date, surveyDate: date, method: 'Test', result: 'anomalies_detected',
    sourceId: source.id, isSynthetic: true, notes: '', geometry: { type: 'Polygon', coordinates: rings }
});

test('a survey hole remains outside its coverage even inside its outer footprint', () => {
    const outer = ring(0, 0, 6, 6);
    const gap = ring(2, 2, 4, 4);
    const baseline = survey('2026-01-01', [outer, [...gap].reverse()]);
    const followup = survey('2026-02-01', [outer]);
    const report = compareSurveys(baseline, followup, sources, new Map());
    deepEqual(report.regions.map(region => region.kind), ['both', 'followup_only']);
    equal(report.regions[0].geometry.coordinates[0].length, 2);
    deepEqual(report.regions[1].geometry.coordinates, [[gap]]);
    equal(report.regions[1].baseline, 'outside_footprint');
});

test('touching footprints have no shared area and different evidence modes cannot be paired', () => {
    const a = survey('2026-01-01', [ring(0, 0, 1, 1)]);
    const b = survey('2026-02-01', [ring(1, 0, 2, 1)]);
    const report = compareSurveys(a, b, sources, new Map());
    deepEqual(report.regions.map(region => region.kind), ['baseline_only', 'followup_only']);
    throws(() => compareSurveys(a, { ...b, isSynthetic: false }, sources, new Map()), /same evidence mode/);
});
