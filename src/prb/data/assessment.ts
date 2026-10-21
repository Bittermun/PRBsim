/**
 * Pure Deterministic Evidence Assessment Engine for PRB Evidence Explorer
 * Method Version: prb-evidence-context-v2
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
    CoalFireSite,
    PRBEvidenceDataset,
    SurveyCoverageRecord,
    WildfirePerimeterRecord
} from './types.ts';
import type { FilteredEvidenceResult } from './select.ts';
import { ValidationError } from './load.ts';
import { calendarDayDistance, observationDateInterval } from './dates.ts';
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
    /** Identity of exact imported original bytes; does not verify a processed record or its claims. */
    originalPackageSha256?: string;
    checksumScope?: 'original_local_package';
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
    evidenceChecks?: EvidenceAvailabilityCheck[];
}

export interface EvidenceAvailabilityCheck {
    evidenceId: string;
    state: 'missing' | 'outside_active_view' | 'synthetic_only' | 'present_unsuitable' | 'available';
    recordIds: string[];
    description: string;
}

export interface AssessmentContext {
    /** Full release, used explicitly as context when the display filter hides comparison evidence. */
    dataset: PRBEvidenceDataset;
}

export interface LocationAssessment {
    schemaVersion: 1;
    methodVersion: 'prb-evidence-context-v1' | 'prb-evidence-context-v2';
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
    return calendarDayDistance(fromDateStr, toDateStr);
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
    syntheticSources: DatasetSource[] = [],
    context?: AssessmentContext
): LocationAssessment | null {
    const sourceMap = buildSourceMap(manifest, [...syntheticSources, ...(context?.dataset.syntheticSources || [])]);
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
            const isLocalSource = /^local:[^:]+:source:[^:]+$/.test(src.id);
            const originalPackageSha256 = isLocalSource && /^[a-f0-9]{64}$/i.test(src.rawSha256)
                ? src.rawSha256 : null;
            inputRefsMap.set(recordId, {
                recordId,
                sourceId: src.id,
                processedSha256: src.processedSha256,
                hashVerified: !isLocalSource && Boolean(src.hashVerified),
                isSynthetic: Boolean(isSyntheticRecord || src.isSynthetic),
                ...(originalPackageSha256 ? { originalPackageSha256, checksumScope: 'original_local_package' as const } : {})
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
        'Perimeter boundary proximity does not measure physical ember convection, flame residence time, or subsoil heat transfer.'
    ];
    for (const perim of filtered.wildfirePerimeters) {
        const sourceName = sourceMap.get(perim.sourceId)?.name || perim.sourceId;
        if (perim.temporalRole === 'retrospective_final_footprint') {
            caveats.push(`Perimeter '${perim.id}' from ${sourceName} represents a retrospective final footprint (mapDate ${perim.mapDate}); it remains static context and does not give local flame-front arrival.`);
        } else {
            caveats.push(`Perimeter '${perim.id}' from ${sourceName} is a progression snapshot on ${perim.mapDate}; its mapped extent does not establish the exact local flame-front arrival time.`);
        }
    }

    if (queryOrigin === 'user_selected_coordinate') {
        caveats.push('User-selected query coordinate: this location is an arbitrary spatial inspection target, not an observed coal-fire or vent feature.');
    }

    if (accuracyMeters === null) {
        caveats.push('Observation coordinate accuracy is unknown; perimeter containment reflects nominal coordinate geometry only.');
    } else if (relationships.some(r => r.coordinateUncertainty === 'boundary_overlap')) {
        caveats.push(`Observation coordinate uncertainty radius (±${accuracyMeters}m) intersects perimeter boundary; containment classification is physically indeterminate.`);
    }

    if (queryOrigin === 'observation_record' && observationDatePrecision !== 'day') {
        caveats.push(`Observation date precision is '${observationDatePrecision}'; day-level offset relative to incident discovery cannot be determined. Month/year uncertainty describes possible event timing, not continuous activity throughout that period.`);
        if (selection.kind === 'observation' && filtered.observationTemporalMatches?.[selection.observationId] === 'possible') {
            caveats.push('The observation has possible temporal overlap with the active window; its actual event date may lie outside that window.');
        }
    }

    if (geologicalRecordIds.length === 0) {
        caveats.push('No matching geological feature in active filtered view; does not infer absence of coal seams or clinker.');
    }

    // 5. Source-aware availability. Context can retain real comparison records hidden by
    // the display window, but it never quietly adds synthetic evidence to real mode.
    type EvidenceRecord = WildfirePerimeterRecord | SurveyCoverageRecord | CoalFireObservation;
    const siteMap = new Map((context?.dataset.sites || filtered.sites).map(site => [site.id, site]));
    const isSyntheticEvidence = (record: EvidenceRecord): boolean => Boolean(
        record.isSynthetic || sourceMap.get(record.sourceId)?.isSynthetic ||
        ('siteId' in record && siteMap.get(record.siteId)?.isSynthetic)
    );
    const mergeContext = <T extends EvidenceRecord>(active: T[], full: T[] = []): T[] => {
        const records = new Map(full.map(record => [record.id, record]));
        for (const record of active) records.set(record.id, record);
        return [...records.values()].filter(record => filter.includeSynthetic || !isSyntheticEvidence(record))
            .sort((a, b) => a.id.localeCompare(b.id));
    };
    const coversCoordinate = (record: EvidenceRecord): boolean => {
        if (record.geometry.type === 'Point') {
            // Do not invent a matching radius when positional uncertainty is unknown.
            return record.geometry.coordinates[0] === coordinate[0] && record.geometry.coordinates[1] === coordinate[1];
        }
        return classifyPointInGeometry(coordinate, record.geometry) !== 'outside';
    };
    const applicablePerimeters = mergeContext(filtered.wildfirePerimeters, context?.dataset.wildfirePerimeters).filter(coversCoordinate);
    const applicableSurveys = mergeContext(filtered.surveys, context?.dataset.surveys).filter(coversCoordinate);
    const applicableObservations = mergeContext(filtered.observations, context?.dataset.observations).filter(coversCoordinate);
    const empiricalPerimeters = applicablePerimeters.filter(record => !isSyntheticEvidence(record));
    const discoveryDates = (empiricalPerimeters.length ? empiricalPerimeters : applicablePerimeters)
        .map(record => record.discoveryDate).sort();
    const firstDiscovery = discoveryDates[0];
    const lastDiscovery = discoveryDates[discoveryDates.length - 1];
    if (firstDiscovery && firstDiscovery !== lastDiscovery) {
        caveats.push(`Multiple applicable incident discovery dates (${firstDiscovery} to ${lastDiscovery}); pre/post comparison is conservative, before the earliest or after the latest discovery. Discovery still does not give local fire arrival.`);
    }
    const describeEvidence = (
        evidenceId: string,
        label: string,
        candidates: EvidenceRecord[],
        activeRecords: EvidenceRecord[],
        suitable: (record: EvidenceRecord) => boolean,
        limitation: string
    ): EvidenceAvailabilityCheck => {
        const activeIds = new Set(activeRecords.map(record => record.id));
        const empirical = candidates.filter(record => !isSyntheticEvidence(record));
        const usable = empirical.filter(suitable);
        let state: EvidenceAvailabilityCheck['state'];
        if (candidates.length === 0) state = 'missing';
        else if (empirical.length === 0) state = 'synthetic_only';
        else if (usable.length === 0) state = 'present_unsuitable';
        else if (!usable.some(record => activeIds.has(record.id))) state = 'outside_active_view';
        else state = 'available';

        for (const record of candidates) recordProvenance(record.id, record.sourceId, isSyntheticEvidence(record));
        const recordIds = candidates.map(record => record.id).sort();
        const sourceLabels = candidates.slice(0, 5).map(record => `${record.id} [${sourceMap.get(record.sourceId)?.name || record.sourceId}]`);
        if (candidates.length > 5) sourceLabels.push(`and ${candidates.length - 5} more records`);
        const outsideCount = candidates.filter(record => !activeIds.has(record.id)).length;
        const scope = outsideCount ? ` ${outsideCount} record(s) are outside the active filtered view and are comparison context only.` : '';
        const stateText = {
            missing: `No applicable ${label.toLowerCase()} for this coordinate in the supplied evidence${context ? ' release' : ' view (full release context was not supplied)'}.`,
            synthetic_only: `${label}: synthetic-only records (${sourceLabels.join('; ')}); no empirical support.`,
            present_unsuitable: `${label}: records present but unsuitable to establish the requirement (${sourceLabels.join('; ')}).`,
            outside_active_view: `${label}: empirical records outside the active filtered view (${sourceLabels.join('; ')}).`,
            available: `${label}: empirical records available in the active view (${sourceLabels.join('; ')}).`
        }[state];
        return { evidenceId, state, recordIds, description: `${stateText}${scope} ${limitation}` };
    };
    const beforeDiscovery = (record: CoalFireObservation): boolean => Boolean(firstDiscovery && observationDateInterval(record).endDate < firstDiscovery);
    const afterDiscovery = (record: CoalFireObservation): boolean => Boolean(lastDiscovery && observationDateInterval(record).startDate > lastDiscovery);
    const groundConfirmed = (record: EvidenceRecord): boolean => 'status' in record && record.status === 'field_confirmed' &&
        record.evidenceMethods.some(method => ['ground_thermocouple', 'borehole_log', 'gas_sampling'].includes(method));
    const progression = describeEvidence('progression', 'Progression snapshots',
        applicablePerimeters.filter(record => record.temporalRole === 'progression_snapshot'), filtered.wildfirePerimeters,
        () => true, 'Mapped snapshots do not establish exact local flame-front arrival; local exposure timing remains unresolved.');
    const baseline = describeEvidence('prefire_negative_survey', 'Pre-fire negative survey coverage',
        applicableSurveys.filter(record => firstDiscovery && record.surveyDate < firstDiscovery && record.result === 'no_thermal_anomaly_detected'),
        filtered.surveys, () => false,
        'Survey method, protocol, detection limit, effective coverage, and conditions require review; adequate thermal baseline remains unresolved. A matching footprint alone cannot establish absence of underground combustion.');
    const postfire = describeEvidence('postfire_combustion', 'Post-fire combustion observations',
        applicableObservations.filter(afterDiscovery), filtered.observations, groundConfirmed,
        'Unverified or unreviewed reports and sensor anomalies do not establish verified subsurface combustion. Field-confirmed status records still require source/method review and do not determine causation.');
    const prefire = describeEvidence('prefire_combustion', 'Pre-incident combustion observations',
        applicableObservations.filter(beforeDiscovery), filtered.observations, groundConfirmed,
        'Unverified or unreviewed reports and non-ground methods do not establish verified active combustion before discovery; an independent origin and ignition mechanism remain unresolved.');
    const prefireThermal = describeEvidence('prefire_thermal', 'Pre-fire thermal observation logs',
        applicableObservations.filter(record => beforeDiscovery(record) && record.evidenceMethods.some(method => method === 'aerial_ir' || method === 'satellite_viirs_modis')),
        filtered.observations, record => 'status' in record && record.status !== 'unverified_report',
        'Measurement sensitivity, comparable controls, vegetation/cloud effects, and effective thermal coverage remain unassessed.');
    const postfireSearch = describeEvidence('postfire_surveys', 'Post-fire survey effort records',
        applicableSurveys.filter(record => lastDiscovery && record.surveyDate > lastDiscovery), filtered.surveys, () => true,
        'A coverage polygon does not establish uniform search effort or detection sensitivity; protocol, visibility, and pre/post comparability remain unassessed.');
    const siteVisits = new Map<string, { count: number; earliestEnd: string; latestStart: string }>();
    for (const record of applicableObservations) {
        const interval = observationDateInterval(record);
        const visits = siteVisits.get(record.siteId);
        if (visits) {
            visits.count++;
            if (interval.endDate < visits.earliestEnd) visits.earliestEnd = interval.endDate;
            if (interval.startDate > visits.latestStart) visits.latestStart = interval.startDate;
        } else {
            siteVisits.set(record.siteId, { count: 1, earliestEnd: interval.endDate, latestStart: interval.startDate });
        }
    }
    const repeatedSiteIds = new Set([...siteVisits].filter(([, visits]) => visits.count > 1 && visits.earliestEnd < visits.latestStart)
        .map(([siteId]) => siteId));
    const repeats = describeEvidence('repeat_observations', 'Repeat observation logs',
        applicableObservations.filter(record => repeatedSiteIds.has(record.siteId)), filtered.observations,
        record => 'status' in record && record.status !== 'unverified_report',
        'Repeat records at the same nominal location/site do not by themselves establish comparable measurements or persistent combustion; readings, methods, and grouping require review.');
    const causeNotes = applicablePerimeters.map(perim => {
        const cause = [perim.reportedCauseGeneral || perim.fireCause, perim.reportedCauseSpecific].filter(Boolean).join(' / ') || 'unspecified';
        const investigated = perim.isFireCauseInvestigated === undefined || perim.isFireCauseInvestigated === null
            ? 'unknown' : String(perim.isFireCauseInvestigated);
        recordProvenance(perim.id, perim.sourceId, isSyntheticEvidence(perim));
        return `Recorded cause for ${perim.id} [${sourceMap.get(perim.sourceId)?.name || perim.sourceId}]: ${cause} (investigation flag ${investigated}${isSyntheticEvidence(perim) ? '; synthetic' : ''}); this source report does not establish ignition direction at the query coordinate.`;
    });
    if (!firstDiscovery) caveats.push('No applicable incident discovery reference at this coordinate; pre/post-incident evidence cannot be classified from the supplied context.');
    if (context && [progression, baseline, postfire, prefire, prefireThermal, postfireSearch, repeats].some(check => check.description.includes('comparison context only'))) {
        caveats.push('Some evidence checks use explicitly identified records outside the active filtered display as comparison context; those records are listed in input references and are not active map features.');
    }
    if (syntheticInfluence) {
        caveats.push('SYNTHETIC INFLUENCE: Assessment incorporates synthetic test fixtures or schematic geology; excluded from empirical baseline.');
    }

    // Research pathways stay unranked and unresolved even when individual records are available.
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
            missingEvidenceInActiveView: [progression.description, baseline.description, postfire.description,
                'Physical heat-transfer pathway, local exposure, and site-specific subsurface combustion validation remain unresolved.'],
            evidenceChecks: [progression, baseline, postfire]
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
            missingEvidenceInActiveView: [...causeNotes, prefire.description,
                'A matching documented point of origin, receptive fuel/weather, and physical surface-ignition mechanism are not established by the supplied spatial records.'],
            evidenceChecks: [prefire]
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
            missingEvidenceInActiveView: [prefireThermal.description, postfireSearch.description, repeats.description,
                'Subsurface continuity and pre/post detection comparability remain unresolved.'],
            evidenceChecks: [prefireThermal, postfireSearch, repeats]
        }
    ];

    const inputReferences = Array.from(inputRefsMap.values()).sort((a, b) => a.recordId.localeCompare(b.recordId));

    return {
        schemaVersion: 1,
        methodVersion: 'prb-evidence-context-v2',
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
