/**
 * Pure Deterministic Evidence Assessment Engine for PRB Evidence Explorer
 * Method Version: prb-evidence-context-v1
 *
 * Responsibilities:
 * 1. Evaluates spatial relationships (containment, boundary distance, boundary overlap)
 *    between query points and active wildfire perimeters, geology, and surveys.
 * 2. Computes day-precision temporal offsets relative to incident discovery without
 *    inventing local fire arrival times (localFireArrivalDate remains null).
 * 3. Never produces pseudo-probabilities (causalConclusion is strictly 'unresolved').
 * 4. Tracks synthetic influence across observations, parent sites, and schematic context.
 */

import type {
    EvidenceManifest,
    FilterState,
    DatasetSource,
    CoalFireObservation,
    CoalFireSite
} from './types.ts';
import type { FilteredEvidenceResult } from './select.ts';
import { ValidationError, isValidIsoCalendarDate } from './load.ts';
import {
    classifyPointInGeometry,
    approximateBoundaryDistanceMeters,
    validatePointCoordinates,
    type LonLat
} from './geometry.ts';

export type { LonLat };

export type AssessmentSelection =
    | { kind: 'coordinate'; coordinate: LonLat }
    | { kind: 'observation'; observationId: string };

export interface InputReference {
    recordId: string;
    sourceId: string;
    processedSha256: string;
    hashVerified: boolean;
    isSynthetic: boolean;
}

export interface PerimeterRelationship {
    perimeterId: string;
    nominalRelation: 'inside' | 'outside' | 'boundary';
    approximateBoundaryDistanceMeters: number;
    coordinateUncertainty: 'unknown' | 'boundary_overlap' | 'no_boundary_overlap';
    localFireArrivalDate: null;
    daysFromIncidentDiscovery: number | null;
    temporalReference: 'incident_discovery';
}

export interface ResearchPathwayChecklist {
    pathwayId: 'surface_to_subsurface' | 'subsurface_to_surface' | 'preexisting_or_bias';
    question: string;
    evidenceStatus: 'unresolved';
    requiredEvidence: string[];
    missingEvidenceInActiveView: string[];
}

export interface LocationAssessment {
    schemaVersion: 1;
    methodVersion: 'prb-evidence-context-v1';
    selection: AssessmentSelection;
    coordinate: LonLat;
    queryOrigin: 'user_selected_coordinate' | 'observation_record';
    accuracyMeters: number | null;
    observationDate: string | null;
    observationDatePrecision: 'day' | 'month' | 'year' | null;
    observationEndDate: string | null;
    lastObservedDate: string | null;
    filterWindow: { startDate: string; endDate: string; includeSynthetic: boolean };
    relationships: PerimeterRelationship[];
    geologicalRecordIds: string[];
    surveyRecordIds: string[];
    inputReferences: InputReference[];
    syntheticInfluence: boolean;
    causalConclusion: 'unresolved';
    pathways: ResearchPathwayChecklist[];
    caveats: string[];
}

/**
 * Calculates calendar day offset (toDate - fromDate) using pure UTC day arithmetic.
 */
export function calendarDaysBetween(fromDateStr: string, toDateStr: string): number {
    if (!isValidIsoCalendarDate(fromDateStr) || !isValidIsoCalendarDate(toDateStr)) {
        throw new ValidationError(`Invalid calendar dates for day offset calculation: '${fromDateStr}', '${toDateStr}'`);
    }
    const [y1, m1, d1] = fromDateStr.split('-').map(Number);
    const [y2, m2, d2] = toDateStr.split('-').map(Number);
    const utc1 = Date.UTC(y1, m1 - 1, d1);
    const utc2 = Date.UTC(y2, m2 - 1, d2);
    return Math.round((utc2 - utc1) / 86400000);
}

/**
 * Builds a unified source lookup map from manifest sources and synthetic sources.
 */
function buildSourceMap(manifest: EvidenceManifest, syntheticSources: DatasetSource[] = []): Map<string, DatasetSource> {
    const map = new Map<string, DatasetSource>();
    for (const s of manifest.datasets) {
        map.set(s.id, s);
    }
    for (const s of syntheticSources) {
        if (!map.has(s.id)) {
            map.set(s.id, s);
        }
    }
    return map;
}

/**
 * Pure evaluation function assessing a coordinate or point observation against active filtered evidence.
 *
 * Returns null if:
 * - A selected observation is not found in the current active filtered evidence.
 * - A selected observation has polygon geometry (point relationship not evaluated for polygon geometry).
 */
export function assessLocation(
    selection: AssessmentSelection,
    filtered: FilteredEvidenceResult,
    manifest: EvidenceManifest,
    filter: FilterState,
    syntheticSources: DatasetSource[] = []
): LocationAssessment | null {
    const sourceMap = buildSourceMap(manifest, syntheticSources);
    const inputRefsMap = new Map<string, InputReference>();
    let syntheticInfluence = false;

    // Helper to resolve and record source provenance
    const recordProvenance = (recordId: string, sourceId: string, isSyntheticRecord: boolean) => {
        const src = sourceMap.get(sourceId);
        if (!src) {
            throw new ValidationError(`Unknown sourceId '${sourceId}' referenced by record '${recordId}'`);
        }
        if (isSyntheticRecord || src.isSynthetic) {
            syntheticInfluence = true;
        }
        if (!inputRefsMap.has(recordId)) {
            inputRefsMap.set(recordId, {
                recordId,
                sourceId: src.id,
                processedSha256: src.processedSha256,
                hashVerified: Boolean(src.hashVerified),
                isSynthetic: Boolean(isSyntheticRecord || src.isSynthetic)
            });
        }
    };

    let coordinate: LonLat;
    let queryOrigin: 'user_selected_coordinate' | 'observation_record';
    let accuracyMeters: number | null = null;
    let observationDate: string | null = null;
    let observationDatePrecision: 'day' | 'month' | 'year' | null = null;
    let observationEndDate: string | null = null;
    let lastObservedDate: string | null = null;

    if (selection.kind === 'coordinate') {
        coordinate = validatePointCoordinates(selection.coordinate);
        queryOrigin = 'user_selected_coordinate';
    } else if (selection.kind === 'observation') {
        const obs = filtered.observations.find((o: CoalFireObservation) => o.id === selection.observationId);
        if (!obs) {
            // Observation is filtered out or does not exist
            return null;
        }
        if (obs.geometry.type !== 'Point') {
            // Polygon observations retain full evidence cards but point analysis is not evaluated
            return null;
        }

        coordinate = validatePointCoordinates(obs.geometry.coordinates);
        queryOrigin = 'observation_record';
        accuracyMeters = obs.accuracyMeters;
        observationDate = obs.observationDate;
        observationDatePrecision = obs.datePrecision;
        observationEndDate = obs.endDate || null;
        lastObservedDate = obs.lastObservedDate || null;

        recordProvenance(obs.id, obs.sourceId, obs.isSynthetic);

        // Check parent site synthetic status
        const site = filtered.sites.find((s: CoalFireSite) => s.id === obs.siteId);
        if (site && site.isSynthetic) {
            syntheticInfluence = true;
        }
    } else {
        throw new ValidationError(`Unsupported selection kind in assessment`);
    }

    // 1. Evaluate Perimeter Relationships
    const relationships: PerimeterRelationship[] = [];
    for (const perim of filtered.wildfirePerimeters) {
        recordProvenance(perim.id, perim.sourceId, perim.isSynthetic);

        const nominalRelation = classifyPointInGeometry(coordinate, perim.geometry);
        const approxDist = approximateBoundaryDistanceMeters(coordinate, perim.geometry);

        let coordinateUncertainty: 'unknown' | 'boundary_overlap' | 'no_boundary_overlap';
        if (accuracyMeters === null) {
            coordinateUncertainty = 'unknown';
        } else if (approxDist <= accuracyMeters) {
            coordinateUncertainty = 'boundary_overlap';
        } else {
            coordinateUncertainty = 'no_boundary_overlap';
        }

        let daysFromIncidentDiscovery: number | null = null;
        if (observationDate && observationDatePrecision === 'day' && perim.discoveryDate) {
            daysFromIncidentDiscovery = calendarDaysBetween(perim.discoveryDate, observationDate);
        }

        relationships.push({
            perimeterId: perim.id,
            nominalRelation,
            approximateBoundaryDistanceMeters: Math.round(approxDist * 100) / 100,
            coordinateUncertainty,
            localFireArrivalDate: null,
            daysFromIncidentDiscovery,
            temporalReference: 'incident_discovery'
        });
    }
    // Stable sort by perimeterId
    relationships.sort((a, b) => a.perimeterId.localeCompare(b.perimeterId));

    // 2. Evaluate Geological Context Overlap
    const geologicalRecordIds: string[] = [];
    for (const geo of filtered.geologicalFeatures) {
        if (classifyPointInGeometry(coordinate, geo.geometry) !== 'outside') {
            geologicalRecordIds.push(geo.id);
            recordProvenance(geo.id, geo.sourceId, geo.isSynthetic);
        }
    }
    geologicalRecordIds.sort((a, b) => a.localeCompare(b));

    // 3. Evaluate Survey Overlap
    const surveyRecordIds: string[] = [];
    for (const sv of filtered.surveys) {
        if (classifyPointInGeometry(coordinate, sv.geometry) !== 'outside') {
            surveyRecordIds.push(sv.id);
            recordProvenance(sv.id, sv.sourceId, sv.isSynthetic);
        }
    }
    surveyRecordIds.sort((a, b) => a.localeCompare(b));

    // 4. Build Caveats
    const caveats: string[] = [
        'Causal direction unresolved: spatial co-location or first detection does not demonstrate ignition direction or hydraulic connectivity.',
        'Wildfire perimeter represents retrospective final footprint (mapDate 2025-01-15); local flame front arrival date is unavailable in v1.',
        'Perimeter boundary proximity does not measure physical ember convection, flame residence time, or subsoil heat transfer.'
    ];

    if (queryOrigin === 'user_selected_coordinate') {
        caveats.push('User-selected query coordinate: this location is an arbitrary spatial inspection target, not an observed coal-fire or vent feature.');
    }

    if (accuracyMeters === null) {
        caveats.push('Observation coordinate accuracy is unknown; perimeter containment reflects nominal coordinate geometry only.');
    } else if (relationships.some(r => r.coordinateUncertainty === 'boundary_overlap')) {
        caveats.push(`Observation coordinate uncertainty radius (±${accuracyMeters}m) intersects perimeter boundary; containment classification is physically indeterminate.`);
    }

    if (queryOrigin === 'observation_record' && observationDatePrecision !== 'day') {
        caveats.push(`Observation date precision is '${observationDatePrecision}'; day-level offset relative to incident discovery cannot be determined.`);
    }

    if (geologicalRecordIds.length === 0) {
        caveats.push('No matching geological feature in active filtered view; does not infer absence of coal seams or clinker.');
    }

    if (syntheticInfluence) {
        caveats.push('SYNTHETIC INFLUENCE: Assessment incorporates synthetic test fixtures or schematic geology; excluded from empirical baseline.');
    }

    // 5. Research Pathways Matrix (Unranked)
    const pathways: ResearchPathwayChecklist[] = [
        {
            pathwayId: 'surface_to_subsurface',
            question: 'Did surface wildfire initiate or reactivate subsurface coal combustion?',
            evidenceStatus: 'unresolved',
            requiredEvidence: [
                'Time-resolved fire progression / local flame front arrival',
                'Pre-wildfire subsurface thermal baseline & bounded negative survey',
                'Verified post-wildfire subsurface combustion records',
                'Physical heat-conduction pathway through soil/outcrop'
            ],
            missingEvidenceInActiveView: [
                'No progression perimeters bundled (only retrospective final footprint)',
                'No pre-fire thermal survey coverage for this coordinate',
                'No audited public subsurface combustion inventory acquired'
            ]
        },
        {
            pathwayId: 'subsurface_to_surface',
            question: 'Did active subterranean coal combustion ignite a surface vegetation wildfire?',
            evidenceStatus: 'unresolved',
            requiredEvidence: [
                'Verified active combustion prior to surface fire discovery',
                'Documented point of origin matching active coal-fire vent',
                'Physical ignition mechanism record (convection/flame in receptive fuel)',
                'Local weather & fuel receptivity records'
            ],
            missingEvidenceInActiveView: [
                'Official NIFC WFIGS reported cause is Natural / Lightning (investigated=0)',
                'No audited pre-incident combustion record at this coordinate'
            ]
        },
        {
            pathwayId: 'preexisting_or_bias',
            question: 'Was combustion pre-existing, newly exposed by erosion, or newly detected due to post-fire survey effort?',
            evidenceStatus: 'unresolved',
            requiredEvidence: [
                'Pre-fire aerial or satellite thermal infrared logs',
                'Post-fire survey effort & search visibility baseline',
                'Repeat longitudinal observations measuring vent persistence',
                'Subsurface seam continuity and borehole data'
            ],
            missingEvidenceInActiveView: [
                'Post-fire search effort metadata not acquired',
                'Repeat observation logs not acquired'
            ]
        }
    ];

    const inputReferences = Array.from(inputRefsMap.values()).sort((a, b) => a.recordId.localeCompare(b.recordId));

    return {
        schemaVersion: 1,
        methodVersion: 'prb-evidence-context-v1',
        selection,
        coordinate,
        queryOrigin,
        accuracyMeters,
        observationDate,
        observationDatePrecision,
        observationEndDate,
        lastObservedDate,
        filterWindow: {
            startDate: filter.startDate,
            endDate: filter.endDate,
            includeSynthetic: filter.includeSynthetic
        },
        relationships,
        geologicalRecordIds,
        surveyRecordIds,
        inputReferences,
        syntheticInfluence,
        causalConclusion: 'unresolved',
        pathways,
        caveats
    };
}
