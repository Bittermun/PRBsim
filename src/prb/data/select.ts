/**
 * Deterministic Selection & Filtering for PRB Evidence Explorer
 * 
 * Invariants:
 * - Pure selection function: identical inputs always yield identical outputs.
 * - Timezone-neutral date arithmetic: date strings are parsed as ISO calendar
 *   components without local timezone shifts.
 * - Non-continuous observation assumption: An observation is treated as a point-in-time
 *   measurement; it does NOT imply ongoing combustion into subsequent dates.
 * - Multi-vent body grouping preservation: Resolves linked vents without mutating or
 *   overcounting distinct subterranean fires.
 */

import type { 
    PRBDataSet, 
    EvidenceFilterState, 
    Observation, 
    FirePerimeter, 
    GeologicalFeature, 
    Survey, 
    Site 
} from './types';

export interface FilteredEvidenceResult {
    filteredObservations: Observation[];
    activeSites: Site[];
    filteredPerimeters: FirePerimeter[];
    geologicalFeatures: GeologicalFeature[];
    filteredSurveys: Survey[];
    totalObservationsCount: number;
    multiVentClustersCount: number;
    negativeSurveysCount: number;
    activeDateWindow: {
        startDate: string;
        endDate: string;
    };
    isSyntheticActive: boolean;
}

/**
 * Standardize date string into a comparable YYYY-MM-DD format (safe from timezone shifts).
 */
export function normalizeIsoDate(dateStr: string, isEndBound = false): string {
    if (!dateStr) return isEndBound ? '9999-12-31' : '0000-01-01';
    const trimmed = dateStr.trim();
    if (/^\d{4}$/.test(trimmed)) {
        return isEndBound ? `${trimmed}-12-31` : `${trimmed}-01-01`;
    }
    if (/^\d{4}-\d{2}$/.test(trimmed)) {
        const [year, month] = trimmed.split('-').map(Number);
        if (isEndBound) {
            const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
            return `${trimmed}-${String(lastDay).padStart(2, '0')}`;
        }
        return `${trimmed}-01`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        return trimmed.slice(0, 10);
    }
    return trimmed;
}

/**
 * Deterministic date comparison without timezone drift.
 * Returns -1 if a < b, 1 if a > b, 0 if equal.
 */
export function compareCalendarDates(a: string, b: string): number {
    const na = normalizeIsoDate(a);
    const nb = normalizeIsoDate(b);
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
}

/**
 * Determines whether an observation date falls within [startIso, endIso].
 */
export function isDateWithinWindow(obsDate: string, startIso: string, endIso: string): boolean {
    const normalizedObsStart = normalizeIsoDate(obsDate, false);
    const normalizedObsEnd = normalizeIsoDate(obsDate, true);
    const normalizedFilterStart = normalizeIsoDate(startIso, false);
    const normalizedFilterEnd = normalizeIsoDate(endIso, true);

    // Overlaps if obsStart <= filterEnd AND obsEnd >= filterStart
    return normalizedObsStart <= normalizedFilterEnd && normalizedObsEnd >= normalizedFilterStart;
}

/**
 * Pure selection function.
 */
export function filterEvidence(
    dataset: PRBDataSet, 
    filters: EvidenceFilterState
): FilteredEvidenceResult {
    const { 
        startDate, 
        endDate, 
        includeSynthetic, 
        statusFilter, 
        methodFilter, 
        showGeology, 
        showPerimeters, 
        showSurveys, 
        showObservations 
    } = filters;

    // 1. Filter Observations
    let filteredObservations: Observation[] = [];
    if (showObservations) {
        filteredObservations = dataset.observations.filter(obs => {
            // Exclude synthetic unless explicitly allowed
            if (obs.isSynthetic && !includeSynthetic) return false;

            // Method filter
            if (!methodFilter.has(obs.method)) return false;

            // Status filter
            if (!statusFilter.has(obs.status)) return false;

            // Date window
            return isDateWithinWindow(obs.observationDate, startDate, endDate);
        });
    }

    // Sort observations deterministically by date then ID
    filteredObservations.sort((a, b) => {
        const cmp = compareCalendarDates(a.observationDate, b.observationDate);
        if (cmp !== 0) return cmp;
        return a.id.localeCompare(b.id);
    });

    // 2. Identify active sites & multi-vent clusters
    const activeSiteIds = new Set<string>();
    filteredObservations.forEach(o => {
        if (o.siteId) activeSiteIds.add(o.siteId);
    });

    const activeSites = dataset.sites.filter(site => activeSiteIds.has(site.id));
    const multiVentClustersCount = activeSites.filter(
        s => s.groupingUncertainty === 'unresolved_subsurface_connectivity'
    ).length;

    // 3. Filter Fire Perimeters
    let filteredPerimeters: FirePerimeter[] = [];
    if (showPerimeters) {
        filteredPerimeters = dataset.firePerimeters.filter(p => {
            if (p.isSynthetic && !includeSynthetic) return false;
            // Check if wildfire active/discovered within timeline window
            const perimStart = p.discoveryDate || '2024-08-22';
            const perimEnd = p.controlDate || p.containmentDate || '2024-11-12';
            return isDateWithinWindow(perimStart, startDate, endDate) || 
                   isDateWithinWindow(perimEnd, startDate, endDate) ||
                   (normalizeIsoDate(perimStart) <= normalizeIsoDate(endDate) && normalizeIsoDate(perimEnd) >= normalizeIsoDate(startDate));
        });
    }

    // 4. Geological Features
    const geologicalFeatures = showGeology ? dataset.geologicalFeatures : [];

    // 5. Filter Surveys
    let filteredSurveys: Survey[] = [];
    if (showSurveys) {
        filteredSurveys = dataset.surveys.filter(surv => {
            if (surv.isSynthetic && !includeSynthetic) return false;
            return isDateWithinWindow(surv.surveyDate, startDate, endDate);
        });
    }

    return {
        filteredObservations,
        activeSites,
        filteredPerimeters,
        geologicalFeatures,
        filteredSurveys,
        totalObservationsCount: filteredObservations.length,
        multiVentClustersCount,
        negativeSurveysCount: filteredSurveys.filter(s => s.negativeResultReported).length,
        activeDateWindow: {
            startDate,
            endDate
        },
        isSyntheticActive: includeSynthetic
    };
}
