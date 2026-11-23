import type { EvidenceImportPackage } from './import.ts';
import { isValidIsoCalendarDate, validateGeometry } from './load.ts';
import type { CoalFireObservation } from './types.ts';

type ObservationGeometry = CoalFireObservation['geometry'];
type Change = { recordId: string; action: 'added' | 'corrected' | 'withdrawn'; reason: string };
type RevisionReference = { revision: number; sha256: string };

export interface PublishedObservation {
    recordId: string;
    siteId: string;
    label: string;
    observationDate: string;
    datePrecision: CoalFireObservation['datePrecision'];
    endDate: string | null;
    lastObservedDate: string | null;
    accuracyMeters: number | null;
    sourceId: string;
    sourceName: string;
    publisher: string;
    sourceUrl: string;
    sourceRetrievedOn: string;
    sourceLimitations: string;
    license: string;
    reportedStatus: CoalFireObservation['status'];
    evidenceMethods: string;
    notes: string;
    reviewStatus: 'synthetic' | 'unreviewed';
    isSynthetic: boolean;
    layerId: string;
    revision: number;
    originalPackageSha256: string;
}

export interface ObservationRelease extends GeoJSON.FeatureCollection<ObservationGeometry, PublishedObservation> {
    release: {
        schemaVersion: 1;
        layerId: string;
        revision: number;
        releasedOn: string;
        isSynthetic: boolean;
        originalPackageSha256: string;
        previous: RevisionReference | null;
        changes: Change[];
    };
}

type ReleaseFeature = ObservationRelease['features'][number];
type ReleaseNotes = { releasedOn: string; reasons: Record<string, string> };

const identifier = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const digest = /^[a-f0-9]{64}$/;
export const MAX_RELEASE_BYTES = 8 * 1024 * 1024;

function object(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${name}.`);
    return value as Record<string, unknown>;
}

function nonempty(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 4000;
}

function validDate(value: unknown): boolean {
    return typeof value === 'string' && isValidIsoCalendarDate(value);
}

function isId(value: unknown): value is string {
    return typeof value === 'string' && identifier.test(value);
}

function isDigest(value: unknown): boolean {
    return typeof value === 'string' && digest.test(value);
}

export function observationLayerUrl(input: string): URL {
    const url = new URL(input);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Enter an HTTP or HTTPS URL without credentials.');
    }
    return url;
}

export function validateObservationRelease(value: unknown): ObservationRelease {
    const data = object(value, 'published layer');
    const release = object(data.release, 'release metadata');
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length > 5000
        || release.schemaVersion !== 1 || !isId(release.layerId) || !Number.isSafeInteger(release.revision)
        || Number(release.revision) < 1 || typeof release.isSynthetic !== 'boolean' || !validDate(release.releasedOn)
        || !isDigest(release.originalPackageSha256) || !Array.isArray(release.changes) || release.changes.length > 10000) {
        throw new Error('Invalid observation release metadata.');
    }
    if (release.previous !== null) {
        const previous = object(release.previous, 'previous revision');
        if (!Number.isSafeInteger(previous.revision) || Number(previous.revision) < 1
            || Number(previous.revision) >= Number(release.revision) || !isDigest(previous.sha256)) {
            throw new Error('Invalid previous revision reference.');
        }
    }
    const ids = new Set<string>();
    const review = release.isSynthetic ? 'synthetic' : 'unreviewed';
    for (const item of data.features) {
        const feature = object(item, 'feature');
        const p = object(feature.properties, 'feature properties');
        if (feature.type !== 'Feature' || !isId(feature.id) || ids.has(feature.id) || p.recordId !== feature.id
            || !isId(p.siteId) || !isId(p.sourceId) || p.layerId !== release.layerId || p.revision !== release.revision
            || p.originalPackageSha256 !== release.originalPackageSha256
            || p.reviewStatus !== review || p.isSynthetic !== release.isSynthetic
            || ![p.label, p.sourceName, p.publisher, p.license, p.evidenceMethods, p.reportedStatus, p.sourceUrl].every(nonempty)
            || !validDate(p.sourceRetrievedOn) || typeof p.notes !== 'string' || typeof p.sourceLimitations !== 'string'
            || !validDate(p.observationDate) || typeof p.datePrecision !== 'string' || !['day', 'month', 'year'].includes(p.datePrecision)
            || [p.endDate, p.lastObservedDate].some(date => date !== null && !validDate(date))
            || (p.accuracyMeters !== null && (typeof p.accuracyMeters !== 'number' || !Number.isFinite(p.accuracyMeters) || p.accuracyMeters <= 0))) {
            throw new Error('Invalid feature identity, provenance, or observation details.');
        }
        observationLayerUrl(String(p.sourceUrl));
        const geometry = object(feature.geometry, 'observation geometry');
        if (geometry.type !== 'Point' && geometry.type !== 'Polygon') throw new Error('Unsupported observation geometry.');
        validateGeometry(geometry as unknown as ObservationGeometry, feature.id);
        ids.add(feature.id);
    }
    const changes = new Set<string>();
    for (const item of release.changes) {
        const change = object(item, 'release change');
        if (!isId(change.recordId) || changes.has(change.recordId) || !nonempty(change.reason)
            || typeof change.action !== 'string' || !['added', 'corrected', 'withdrawn'].includes(change.action)
            || (ids.has(change.recordId) === (change.action === 'withdrawn'))) {
            throw new Error('Invalid release change list.');
        }
        changes.add(change.recordId);
    }
    return value as ObservationRelease;
}

function observationContent({ geometry, properties }: ReleaseFeature): string {
    const { revision, originalPackageSha256, ...record } = properties;
    // Compare the field record rather than the fingerprint of the enclosing package.
    return JSON.stringify([geometry, record]);
}

export function buildObservationRelease(
    pkg: EvidenceImportPackage,
    notes: ReleaseNotes,
    packageSha256: string,
    previous: { data: ObservationRelease; sha256: string } | null,
): ObservationRelease {
    if (!validDate(notes.releasedOn)) throw new Error('A release needs a YYYY-MM-DD publication date.');
    const reasons = object(notes.reasons, 'change reasons');
    if (previous && (previous.data.release.layerId !== pkg.packageId
        || previous.data.release.isSynthetic !== pkg.isSynthetic
        || previous.data.release.revision >= pkg.revision
        || previous.data.release.releasedOn > notes.releasedOn)) {
        throw new Error('Publish a newer dated revision of the same layer and evidence mode.');
    }
    const sources = new Map(pkg.sources.map(source => [source.id, source]));
    const features = pkg.observations.map((observation): ReleaseFeature => {
        const source = sources.get(observation.sourceId)!;
        return {
            type: 'Feature',
            id: observation.id,
            geometry: observation.geometry,
            properties: {
                recordId: observation.id, siteId: observation.siteId, label: observation.label,
                observationDate: observation.observationDate, datePrecision: observation.datePrecision,
                endDate: observation.endDate ?? null, lastObservedDate: observation.lastObservedDate ?? null,
                accuracyMeters: observation.accuracyMeters || null, sourceId: source.id, sourceName: source.name,
                publisher: source.publisher, sourceUrl: source.url, sourceRetrievedOn: source.retrievalDate,
                sourceLimitations: source.limitations, license: source.license,
                reportedStatus: observation.status, evidenceMethods: observation.evidenceMethods.join(', '),
                notes: observation.notes, reviewStatus: pkg.isSynthetic ? 'synthetic' : 'unreviewed',
                isSynthetic: pkg.isSynthetic, layerId: pkg.packageId, revision: pkg.revision,
                originalPackageSha256: packageSha256,
            }
        };
    });
    const old = new Map(previous?.data.features.map(feature => [feature.properties.recordId, feature]));
    const changes: Change[] = [];
    function change(recordId: string, action: Change['action']): void {
        const reason = Object.hasOwn(reasons, recordId) ? reasons[recordId] : undefined;
        if (nonempty(reason)) changes.push({ recordId, action, reason });
        else if (action === 'added') changes.push({ recordId, action, reason: 'First appearance in this layer.' });
        else throw new Error(`Provide a reason for the ${action} record ${recordId}.`);
    }
    for (const feature of features) {
        const id = feature.properties.recordId;
        const before = old.get(id);
        if (!before) change(id, 'added');
        else if (observationContent(before) !== observationContent(feature)) change(id, 'corrected');
        old.delete(id);
    }
    for (const id of old.keys()) change(id, 'withdrawn');
    return validateObservationRelease({
        type: 'FeatureCollection', features, release: {
            schemaVersion: 1, layerId: pkg.packageId, revision: pkg.revision, releasedOn: notes.releasedOn,
            isSynthetic: pkg.isSynthetic, originalPackageSha256: packageSha256, changes,
            previous: previous ? { revision: previous.data.release.revision, sha256: previous.sha256 } : null,
        },
    });
}

export async function loadObservationRelease(url: URL, signal: AbortSignal): Promise<ObservationRelease> {
    const response = await fetch(url, { signal, cache: 'no-cache', credentials: 'omit', redirect: 'error' });
    if (!response.ok || !response.body) throw new Error(`The layer returned HTTP ${response.status}.`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const parts: string[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_RELEASE_BYTES) throw new Error('The observation layer exceeds 8 MiB.');
            parts.push(decoder.decode(value, { stream: true }));
        }
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    }
    return validateObservationRelease(JSON.parse(parts.join('') + decoder.decode()));
}
