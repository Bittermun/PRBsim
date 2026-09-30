/**
 * Temporal, Spatial, and Epistemic Filtering & Query Logic for PRB Evidence Explorer
 *
 * Responsibilities:
 * 1. Enforce strict quarantine of synthetic records (`includeSynthetic === false` by default),
 *    including schematic geological context polygons.
 * 2. Filter discrete coal-fire observations and surveys by date/interval windows without
 *    animating or hiding the single retrospective final wildfire perimeter (`retrospective_final_footprint`)
 *    as if it were daily fire spread.
 * 3. Reject invalid calendar dates and inverted filter windows (`startDate > endDate`).
 * 4. Preserve multi-vent site grouping (`CoalFireSite`) so multiple vents on one seam
 *    are not miscounted as independent fire ignitions.
 */

import type {
    PRBEvidenceDataset,
    FilterState,
    CoalFireObservation,
    CoalFireSite,
    WildfirePerimeterRecord,
    SurveyCoverageRecord,
    GeologicalContextFeature
} from './types.ts';
import { ValidationError, isValidIsoCalendarDate } from './load.ts';

export interface FilteredEvidenceResult {
    wildfirePerimeters: WildfirePerimeterRecord[];
    geologicalFeatures: GeologicalContextFeature[];
    sites: CoalFireSite[];
    observations: CoalFireObservation[];
    surveys: SurveyCoverageRecord[];
    activeSyntheticCount: number;
    realObservationCount: number;
}

/**
 * Validates a filter window's startDate and endDate.
 */
export function validateFilterDateRange(startDate: string, endDate: string): void {
    if (startDate && !isValidIsoCalendarDate(startDate)) {
        throw new ValidationError(`Invalid calendar startDate '${startDate}' in filter window.`);
    }
    if (endDate && !isValidIsoCalendarDate(endDate)) {
        throw new ValidationError(`Invalid calendar endDate '${endDate}' in filter window.`);
    }
    if (startDate && endDate && startDate > endDate) {
        throw new ValidationError(
            `Inverted date window: startDate (${startDate}) must not be after endDate (${endDate}).`
        );
    }
}

/**
 * Checks whether a point-in-time or interval observation [dateStr, recordEndDate]
 * overlaps the filter window [startDate, endDate] (inclusive, UTC calendar day strings).
 */
export function isDateWithinWindow(
    dateStr: string,
    startDate: string,
    endDate: string,
    recordEndDate?: string
): boolean {
    if (!dateStr || !isValidIsoCalendarDate(dateStr)) {
        throw new ValidationError(`Invalid calendar date '${dateStr}' tested against window.`);
    }
    if (recordEndDate !== undefined && recordEndDate !== '') {
        if (!isValidIsoCalendarDate(recordEndDate)) {
            throw new ValidationError(`Invalid calendar recordEndDate '${recordEndDate}' tested against window.`);
        }
        if (recordEndDate < dateStr) {
            throw new ValidationError(
                `Inverted record interval: recordEndDate (${recordEndDate}) must not precede observation date (${dateStr}).`
            );
        }
    }
    validateFilterDateRange(startDate, endDate);

    const effectiveEnd = recordEndDate && recordEndDate >= dateStr ? recordEndDate : dateStr;
    if (startDate && effectiveEnd < startDate) return false;
    if (endDate && dateStr > endDate) return false;
    return true;
}

/**
 * Filters the PRB dataset according to the current UI FilterState.
 * Guarantees that synthetic fixtures (including schematic geology) never leak when `includeSynthetic` is false.
 */
export function filterEvidence(
    dataset: PRBEvidenceDataset,
    filter: FilterState
): FilteredEvidenceResult {
    validateFilterDateRange(filter.startDate, filter.endDate);

    const allowedStatusSet = new Set(filter.allowedStatuses);

    // 1. Filter Wildfire Perimeters:
    // Retrospective final footprints remain visible across all timeline dates so they are never
    // animated as pseudo-daily progression. Only progression_snapshot perimeters scrub by date.
    const wildfirePerimeters = dataset.wildfirePerimeters.filter(p => {
        if (!filter.includeSynthetic && p.isSynthetic) return false;
        if (p.temporalRole === 'retrospective_final_footprint') {
            return true;
        }
        return isDateWithinWindow(p.discoveryDate, filter.startDate, filter.endDate, p.controlDate);
    });

    // 2. Filter Geological Context Features (quarantining schematic polygons when includeSynthetic is false)
    const geologicalFeatures = dataset.geologicalFeatures.filter(g => {
        if (!filter.includeSynthetic && g.isSynthetic) return false;
        return true;
    });

    // 3. Filter Observations (supporting observationDate..endDate intervals)
    const observations = dataset.observations.filter(obs => {
        if (!filter.includeSynthetic && obs.isSynthetic) return false;
        if (!allowedStatusSet.has(obs.status)) return false;
        if (filter.selectedSiteId && obs.siteId !== filter.selectedSiteId) return false;
        return isDateWithinWindow(
            obs.observationDate,
            filter.startDate,
            filter.endDate,
            obs.endDate
        );
    });

    // 4. Filter Sites (include sites that match synthetic flag and have >=1 visible observation or are explicitly selected)
    const visibleSiteIds = new Set(observations.map(o => o.siteId));
    const sites = dataset.sites.filter(s => {
        if (!filter.includeSynthetic && s.isSynthetic) return false;
        if (filter.selectedSiteId && s.id === filter.selectedSiteId) return true;
        return visibleSiteIds.has(s.id);
    });

    // 5. Filter Surveys
    const surveys = dataset.surveys.filter(sv => {
        if (!filter.includeSynthetic && sv.isSynthetic) return false;
        return isDateWithinWindow(sv.surveyDate, filter.startDate, filter.endDate);
    });

    const activeSyntheticCount =
        wildfirePerimeters.filter(p => p.isSynthetic).length +
        geologicalFeatures.filter(g => g.isSynthetic).length +
        sites.filter(s => s.isSynthetic).length +
        observations.filter(o => o.isSynthetic).length +
        surveys.filter(sv => sv.isSynthetic).length;

    const realObservationCount = observations.filter(o => !o.isSynthetic).length;

    return {
        wildfirePerimeters,
        geologicalFeatures,
        sites,
        observations,
        surveys,
        activeSyntheticCount,
        realObservationCount
    };
}

/**
 * Groups observations by their parent CoalFireSite ID to prevent double-counting
 * multiple surface fumaroles/vents as independent underground fires.
 */
export function groupObservationsBySite(
    observations: CoalFireObservation[]
): Map<string, CoalFireObservation[]> {
    const map = new Map<string, CoalFireObservation[]>();
    for (const obs of observations) {
        const list = map.get(obs.siteId) || [];
        list.push(obs);
        map.set(obs.siteId, list);
    }
    return map;
}
