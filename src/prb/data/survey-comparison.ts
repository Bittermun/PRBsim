import { difference, intersection, union } from 'polyclip-ts';
import type { SurveyImportReference } from './import.ts';
import type { DatasetSource, SurveyCoverageRecord } from './types.ts';

export type SurveyImportReferences = ReadonlyMap<string, SurveyImportReference>;
export type CoverageRegion = 'both' | 'baseline_only' | 'followup_only';

function surveyInput(record: SurveyCoverageRecord, source: DatasetSource, references: SurveyImportReferences) {
    const original = references.get(record.id);
    return {
        record: original ? { ...record, surveyName: original.surveyName, notes: original.surveyNotes } : record,
        source: {
            id: source.id, name: original?.sourceName ?? source.name, publisher: source.publisher, url: source.url,
            license: source.license, retrievalDate: source.retrievalDate,
            limitations: original?.sourceLimitations ?? source.limitations,
            spatialAccuracy: source.spatialAccuracy
        },
        reviewStatus: original ? 'local_unreviewed' as const : 'source_attributed' as const,
        originalPackage: original ? {
            packageId: original.packageId, revision: original.revision, sha256: original.sha256
        } : null
    };
}

function coordinates(geometry: GeoJSON.Polygon): [number, number][][] {
    return geometry.coordinates.map(ring => ring.map(([longitude, latitude]) => [longitude, latitude]));
}

export function compareSurveys(
    baseline: SurveyCoverageRecord,
    followup: SurveyCoverageRecord | null,
    sources: ReadonlyMap<string, DatasetSource>,
    references: SurveyImportReferences
) {
    if (followup && baseline.isSynthetic !== followup.isSynthetic) {
        throw new Error('Choose two surveys from the same evidence mode.');
    }
    if (followup && baseline.surveyDate >= followup.surveyDate) {
        throw new Error('Choose a follow-up dated after the baseline.');
    }

    const before = coordinates(baseline.geometry);
    const after = followup ? coordinates(followup.geometry) : null;
    const extents = [...before, ...(after ?? [])].reduce(({ west, east }, ring) => {
        for (const [longitude] of ring) {
            west = Math.min(west, longitude);
            east = Math.max(east, longitude);
        }
        return { west, east };
    }, { west: Infinity, east: -Infinity });
    if (extents.east - extents.west >= 180) {
        throw new Error('The local coverage map needs footprints that fit within 180 degrees of longitude.');
    }

    const sourceFor = (survey: SurveyCoverageRecord) => {
        const source = sources.get(survey.sourceId);
        if (!source) throw new Error('A selected survey has no source record.');
        return surveyInput(survey, source, references);
    };
    const baselineInput = sourceFor(baseline);
    const followupInput = followup ? sourceFor(followup) : null;
    const coverage = {
        both: after ? intersection(before, after) : [],
        baseline_only: after ? difference(before, after) : union(before),
        followup_only: after ? difference(after, before) : []
    };
    if (!Object.values(coverage).some(polygons => polygons.length)) {
        throw new Error('The selected footprints have no mapped area.');
    }
    const kinds: CoverageRegion[] = ['both', 'baseline_only', 'followup_only'];
    const regions = kinds.filter(kind => coverage[kind].length).map(kind => ({
        kind,
        geometry: { type: 'MultiPolygon' as const, coordinates: coverage[kind] },
        baseline: kind === 'followup_only' ? 'outside_footprint' as const : baseline.result,
        followup: !followup ? 'pending' as const
            : kind === 'baseline_only' ? 'outside_footprint' as const : followup.result
    }));
    const inspectionQuestion = !followup
        ? 'When can a follow-up survey cover the baseline footprint?'
        : coverage.baseline_only.length
            ? 'Should the next survey revisit the part of the baseline footprint missed on the follow-up?'
            : 'Where do the survey conditions or source observations need review before interpreting reported results?';
    return {
        schemaVersion: 1 as const,
        isSynthetic: baseline.isSynthetic,
        status: followup ? 'comparison' as const : 'comparison_pending' as const,
        baseline: baselineInput,
        followup: followupInput,
        regions,
        inspectionQuestion,
        method: 'Reported footprints overlaid in WGS84 longitude and latitude. Detection results summarize each source survey. Review detection conditions before interpreting differences. Treatment outcomes require field evidence.'
    };
}

export type SurveyComparison = ReturnType<typeof compareSurveys>;
