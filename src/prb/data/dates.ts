import type { CoalFireObservation, PRBEvidenceDataset } from './types.ts';
import { ValidationError, isValidIsoCalendarDate } from './load.ts';

export interface ObservationDateInterval {
    /** Earliest and latest possible event dates, not evidence of continuous activity. */
    startDate: string;
    endDate: string;
    datePrecision: CoalFireObservation['datePrecision'];
    /** Only an explicit endDate represents a reported duration. */
    representsDuration: boolean;
}

export interface TimelineBounds {
    minDate: string;
    maxDate: string;
    focusStartDate?: string;
    focusEndDate?: string;
    perimeterLabel?: string;
}

function requireDate(date: string): void {
    if (!isValidIsoCalendarDate(date)) throw new ValidationError(`Invalid calendar date '${date}'.`);
}

export function calendarDayDistance(fromDate: string, toDate: string): number {
    requireDate(fromDate);
    requireDate(toDate);
    return Math.round((new Date(`${toDate}T00:00:00Z`).getTime() - new Date(`${fromDate}T00:00:00Z`).getTime()) / 86400000);
}

/** UTC calendar arithmetic; clamp day-of-month when the target month is shorter. */
export function shiftCalendarDate(date: string, amount: number, unit: 'day' | 'month'): string {
    requireDate(date);
    if (!Number.isSafeInteger(amount)) throw new ValidationError('Calendar date shift must be a whole number.');
    const next = new Date(`${date}T00:00:00Z`);
    if (unit === 'month') {
        const originalDay = next.getUTCDate();
        next.setUTCDate(1);
        next.setUTCMonth(next.getUTCMonth() + amount);
        const monthEnd = new Date(next);
        monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
        next.setUTCDate(Math.min(originalDay, monthEnd.getUTCDate()));
    } else {
        next.setUTCDate(next.getUTCDate() + amount);
    }
    // The existing data contract accepts four-digit calendar years starting at 0100.
    if (next.getUTCFullYear() < 100) return '0100-01-01';
    if (next.getUTCFullYear() > 9999) return '9999-12-31';
    return next.toISOString().slice(0, 10);
}

/** Expand date precision into uncertainty about timing without changing the original record. */
export function observationDateInterval(
    observation: Pick<CoalFireObservation, 'observationDate' | 'datePrecision' | 'endDate'>
): ObservationDateInterval {
    const { observationDate, endDate, datePrecision } = observation;
    requireDate(observationDate);
    if (endDate !== undefined) {
        requireDate(endDate);
        if (endDate < observationDate) throw new ValidationError('Inverted observation date interval.');
    }
    if (!['day', 'month', 'year'].includes(datePrecision)) {
        throw new ValidationError(`Invalid observation date precision '${datePrecision}'.`);
    }
    const lastDate = endDate || observationDate;
    let start = observationDate;
    let end = lastDate;
    if (datePrecision === 'month') {
        start = `${observationDate.slice(0, 7)}-01`;
        const monthEnd = new Date(`${lastDate.slice(0, 7)}-01T00:00:00Z`);
        monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
        end = monthEnd.toISOString().slice(0, 10);
    } else if (datePrecision === 'year') {
        start = `${observationDate.slice(0, 4)}-01-01`;
        end = `${lastDate.slice(0, 4)}-12-31`;
    }
    return { startDate: start, endDate: end, datePrecision, representsDuration: Boolean(endDate) };
}

/**
 * Inclusive interval selection. A coarse event can possibly overlap a partial period;
 * a window enclosing its entire possible period certainly contains the event.
 * Neither result asserts activity throughout an uncertain month/year.
 */
export function observationWindowMatch(
    observation: Pick<CoalFireObservation, 'observationDate' | 'datePrecision' | 'endDate'>,
    startDate: string,
    endDate: string
): 'possible' | 'certain' | null {
    if (startDate) requireDate(startDate);
    if (endDate) requireDate(endDate);
    if (startDate && endDate && startDate > endDate) throw new ValidationError('Inverted filter date interval.');
    const interval = observationDateInterval(observation);
    if (startDate && interval.endDate < startDate) return null;
    if (endDate && interval.startDate > endDate) return null;
    if (interval.datePrecision === 'day') return 'certain';
    return (!startDate || startDate <= interval.startDate) && (!endDate || endDate >= interval.endDate)
        ? 'certain' : 'possible';
}

/** Bounds cover actual record dates; source retrieval/publication dates are not event times. */
export function deriveTimelineBounds(dataset: PRBEvidenceDataset, includeSynthetic = false): TimelineBounds | null {
    const sources = new Map([...dataset.manifest.datasets, ...(dataset.syntheticSources || [])].map(source => [source.id, source]));
    const sites = new Map(dataset.sites.map(site => [site.id, site]));
    const allowed = (record: { sourceId: string; isSynthetic: boolean; siteId?: string }): boolean =>
        includeSynthetic || !(record.isSynthetic || sources.get(record.sourceId)?.isSynthetic ||
            (record.siteId && sites.get(record.siteId)?.isSynthetic));
    const allDates: string[] = [];
    const perimeters = dataset.wildfirePerimeters.filter(allowed);
    for (const record of perimeters) {
        allDates.push(record.discoveryDate, record.containmentDate, record.controlDate, record.mapDate);
    }
    for (const record of dataset.observations.filter(allowed)) {
        const interval = observationDateInterval(record);
        allDates.push(interval.startDate, interval.endDate);
        if (record.lastObservedDate) allDates.push(record.lastObservedDate);
    }
    for (const record of dataset.surveys.filter(allowed)) allDates.push(record.surveyDate);
    if (allDates.length === 0) return null;
    allDates.forEach(requireDate);
    allDates.sort();
    const minDate = allDates[0];
    const maxDate = allDates[allDates.length - 1];
    const finalFootprints = perimeters.filter(record => record.temporalRole === 'retrospective_final_footprint');
    const progression = perimeters.filter(record => record.temporalRole === 'progression_snapshot');
    const labels: string[] = [];
    if (finalFootprints.length) {
        const mapDates = [...new Set(finalFootprints.map(record => record.mapDate))].sort().join(', ');
        labels.push(`${finalFootprints.length} static final footprint${finalFootprints.length === 1 ? '' : 's'} (map date${finalFootprints.length === 1 ? '' : 's'} ${mapDates})`);
    }
    if (progression.length) labels.push(`${progression.length} progression snapshot${progression.length === 1 ? '' : 's'} (filtered by map date)`);
    const discoveries = perimeters.map(record => record.discoveryDate).sort();
    const controls = perimeters.map(record => record.controlDate).sort();
    return { minDate, maxDate, focusStartDate: discoveries[0] || minDate,
        focusEndDate: controls[controls.length - 1] || maxDate,
        perimeterLabel: labels.length ? `Perimeters: ${labels.join('; ')}` : 'No perimeter records in loaded evidence' };
}
