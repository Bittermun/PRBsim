/** Public Landsat scene discovery. Metadata only; no rasters or temperature inference.
 * Verified contract and live-service evidence: docs/prb/task-satellite-report.md. */
export const SATELLITE_CATALOG_URL = 'https://earth-search.aws.element84.com/v1';
export const SATELLITE_COLLECTION = 'landsat-c2-l2';
export const MAX_SATELLITE_RESULTS = 100;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export type SatelliteBbox = readonly [west: number, south: number, east: number, north: number];

export interface SatelliteQuery {
    bbox: SatelliteBbox;
    startDate: string;
    endDate: string;
    /** Whole-scene percentage, not the selected area's clear-pixel fraction. */
    maxCloudCover: number;
    limit?: number;
}

export interface ValidatedSatelliteQuery extends SatelliteQuery { limit: number; }
export interface SatelliteSceneLink { label: string; url: string; }

export interface SatelliteScene {
    id: string;
    datetime: string;
    cloudCover: number;
    platform: string | null;
    bbox: SatelliteBbox;
    metadataUrl: string;
    providerLinks: SatelliteSceneLink[];
}

export interface SatelliteSearchResult {
    query: ValidatedSatelliteQuery;
    scenes: SatelliteScene[];
    receivedCount: number;
    rejectedCount: number;
    filteredCount: number;
    duplicateCount: number;
    omittedCount: number;
    matchedCount: number | null;
    hasMore: boolean;
}

export interface SatelliteSearchOptions {
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}

export class SatelliteSearchError extends Error {
    readonly code: 'validation' | 'response' | 'network' | 'http' | 'timeout';

    constructor(code: SatelliteSearchError['code'], message: string) {
        super(message);
        this.name = 'SatelliteSearchError';
        this.code = code;
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function realDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const milliseconds = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === value;
}

function realDatetime(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/.test(value)) return false;
    return realDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

function validBbox(value: unknown): value is [number, number, number, number] {
    if (!Array.isArray(value) || value.length !== 4 || !value.every(v => typeof v === 'number' && Number.isFinite(v))) return false;
    const [west, south, east, north] = value;
    return west >= -180 && east <= 180 && south >= -90 && north <= 90 && west < east && south < north;
}

function overlaps(a: SatelliteBbox, b: SatelliteBbox): boolean {
    return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** Validates untrusted values and returns an immutable input snapshot. */
export function validateSatelliteQuery(input: unknown): ValidatedSatelliteQuery {
    if (!isObject(input)) throw new SatelliteSearchError('validation', 'Supply geographic bounds and a date window.');
    if (!validBbox(input.bbox)) throw new SatelliteSearchError('validation', 'Bounds must have west < east and south < north, with longitudes −180…180 and latitudes −90…90. Split antimeridian areas into separate searches.');
    if (!realDate(input.startDate) || !realDate(input.endDate)) throw new SatelliteSearchError('validation', 'Dates must be real calendar dates in YYYY-MM-DD form.');
    if (input.startDate > input.endDate) throw new SatelliteSearchError('validation', 'The start date must be on or before the end date.');
    if (typeof input.maxCloudCover !== 'number' || !Number.isFinite(input.maxCloudCover) || input.maxCloudCover < 0 || input.maxCloudCover > 100) {
        throw new SatelliteSearchError('validation', 'Maximum scene cloud cover must be a percentage from 0 to 100.');
    }
    const limit = input.limit === undefined ? 30 : input.limit;
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_SATELLITE_RESULTS) {
        throw new SatelliteSearchError('validation', `Result limit must be a whole number from 1 to ${MAX_SATELLITE_RESULTS}.`);
    }
    const bbox: SatelliteBbox = Object.freeze([...input.bbox] as [number, number, number, number]);
    return Object.freeze({ bbox, startDate: input.startDate, endDate: input.endDate, maxCloudCover: input.maxCloudCover, limit });
}

export function buildSatelliteSearch(input: SatelliteQuery) {
    const query = validateSatelliteQuery(input);
    return {
        collections: [SATELLITE_COLLECTION],
        bbox: [...query.bbox],
        datetime: `${query.startDate}T00:00:00Z/${query.endDate}T23:59:59.999Z`,
        limit: query.limit,
        query: { 'eo:cloud_cover': { lte: query.maxCloudCover } },
        sortby: [{ field: 'properties.datetime', direction: 'desc' }]
    };
}

/** Fixed provider allowlist; no credentials, nonstandard ports or relative/active URLs. */
export function safeSatelliteSourceUrl(input: unknown): string | null {
    if (typeof input !== 'string' || input.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(input)) return null;
    try {
        const url = new URL(input);
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
        if (!['earth-search.aws.element84.com', 'landsatlook.usgs.gov', 'www.usgs.gov', 'doi.org'].includes(url.hostname)) return null;
        return url.href;
    } catch { return null; }
}

function parseScene(value: unknown): SatelliteScene | null {
    if (!isObject(value) || value.type !== 'Feature' || value.collection !== SATELLITE_COLLECTION) return null;
    if (typeof value.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value.id)) return null;
    if (!validBbox(value.bbox) || !isObject(value.properties)) return null;
    const { datetime, platform } = value.properties;
    const cloudCover = value.properties['eo:cloud_cover'];
    if (!realDatetime(datetime) || typeof cloudCover !== 'number' || !Number.isFinite(cloudCover) || cloudCover < 0 || cloudCover > 100) return null;
    const providerLinks: SatelliteSceneLink[] = [];
    const seen = new Set<string>();
    if (Array.isArray(value.links)) {
        for (const link of value.links.slice(0, 50)) {
            if (!isObject(link) || (link.rel !== 'via' && link.rel !== 'cite-as')) continue;
            const url = safeSatelliteSourceUrl(link.href);
            if (url && !seen.has(url) && providerLinks.length < 4) {
                seen.add(url);
                providerLinks.push({ label: link.rel === 'cite-as' ? 'Dataset citation' : 'Provider source metadata', url });
            }
        }
    }
    return {
        id: value.id, datetime, cloudCover,
        platform: typeof platform === 'string' && platform.length <= 100 && !/[\u0000-\u001f\u007f]/.test(platform) ? platform : null,
        bbox: [...value.bbox] as [number, number, number, number],
        // A remote self link cannot identify another scene or another site.
        metadataUrl: `${SATELLITE_CATALOG_URL}/collections/${SATELLITE_COLLECTION}/items/${encodeURIComponent(value.id)}`,
        providerLinks
    };
}

/** Checks one bounded page. Pagination is reported but never followed automatically. */
export function parseSatelliteResults(payload: unknown, input: SatelliteQuery): SatelliteSearchResult {
    const query = validateSatelliteQuery(input);
    if (!isObject(payload) || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
        throw new SatelliteSearchError('response', 'The catalog returned an invalid scene metadata collection.');
    }
    const context = isObject(payload.context) ? payload.context : {};
    const reportedMatches = payload.numberMatched ?? context.matched;
    const matchedCount = typeof reportedMatches === 'number' && Number.isSafeInteger(reportedMatches) && reportedMatches >= 0 ? reportedMatches : null;
    const scenes: SatelliteScene[] = [];
    const seen = new Set<string>();
    let rejectedCount = 0;
    let filteredCount = 0;
    let duplicateCount = 0;
    const startTime = Date.parse(`${query.startDate}T00:00:00Z`);
    const endTime = Date.parse(`${query.endDate}T23:59:59.999Z`);
    for (const value of payload.features.slice(0, query.limit)) {
        const scene = parseScene(value);
        if (!scene) { rejectedCount += 1; continue; }
        const acquisition = Date.parse(scene.datetime);
        if (acquisition < startTime || acquisition > endTime || scene.cloudCover > query.maxCloudCover || !overlaps(scene.bbox, query.bbox)) {
            filteredCount += 1;
            continue;
        }
        if (seen.has(scene.id)) { duplicateCount += 1; continue; }
        seen.add(scene.id);
        scenes.push(scene);
    }
    scenes.sort((a, b) => Date.parse(b.datetime) - Date.parse(a.datetime) || a.id.localeCompare(b.id));
    const receivedCount = payload.features.length;
    const omittedCount = Math.max(0, receivedCount - query.limit);
    const hasNext = Array.isArray(payload.links) && payload.links.some(link => isObject(link) && link.rel === 'next');
    return {
        query, scenes, receivedCount, rejectedCount, filteredCount, duplicateCount, omittedCount, matchedCount,
        hasMore: hasNext || omittedCount > 0 || (matchedCount !== null && matchedCount > receivedCount)
    };
}

function canceledSearch(): DOMException { return new DOMException('Scene search canceled.', 'AbortError'); }

async function readBoundedMetadata(response: Response, signal: AbortSignal): Promise<unknown> {
    const declaredLength = Number(response.headers.get('Content-Length'));
    if (declaredLength > MAX_RESPONSE_BYTES) throw new SatelliteSearchError('response', 'The catalog response exceeds the metadata size limit.');
    if (!response.body) throw new SatelliteSearchError('response', 'The catalog returned no scene metadata.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    try {
        while (true) {
            if (signal.aborted) throw canceledSearch();
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > MAX_RESPONSE_BYTES) {
                void reader.cancel().catch(() => undefined);
                throw new SatelliteSearchError('response', 'The catalog response exceeds the metadata size limit.');
            }
            text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
    } finally { reader.releaseLock(); }
    try { return JSON.parse(text); }
    catch { throw new SatelliteSearchError('response', 'The catalog returned invalid JSON scene metadata.'); }
}

/** One metadata request, with bounded transfer, timeout and immediate abort rejection. */
export async function searchSatelliteScenes(input: SatelliteQuery, options: SatelliteSearchOptions = {}): Promise<SatelliteSearchResult> {
    const query = validateSatelliteQuery(input);
    const timeoutMs = options.timeoutMs ?? 20000;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new SatelliteSearchError('validation', 'Search timeout must be between 1 and 60000 milliseconds.');
    if (options.signal?.aborted) throw canceledSearch();
    const controller = new AbortController();
    let timedOut = false;
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const interrupted = () => timedOut ? new SatelliteSearchError('timeout', 'The scene catalog search timed out. Try a smaller area or date window.') : canceledSearch();
    let onInternalAbort: () => void = () => undefined;
    const abortPromise = new Promise<never>((_resolve, reject) => {
        onInternalAbort = () => reject(interrupted());
        controller.signal.addEventListener('abort', onInternalAbort, { once: true });
    });
    const request = async (): Promise<SatelliteSearchResult> => {
        const response = await (options.fetchImpl ?? fetch)(`${SATELLITE_CATALOG_URL}/search`, {
            method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error',
            headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json' },
            body: JSON.stringify(buildSatelliteSearch(query)), signal: controller.signal
        });
        if (controller.signal.aborted) throw interrupted();
        if (!response.ok) throw new SatelliteSearchError('http', `The scene catalog returned HTTP ${response.status}. Try again later.`);
        const payload = await readBoundedMetadata(response, controller.signal);
        if (controller.signal.aborted) throw interrupted();
        return parseSatelliteResults(payload, query);
    };
    try { return await Promise.race([request(), abortPromise]); }
    catch (error) {
        if (controller.signal.aborted) throw interrupted();
        if (error instanceof SatelliteSearchError) throw error;
        throw new SatelliteSearchError('network', 'The scene catalog could not be reached. Check the network connection and try again.');
    } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', onExternalAbort);
        controller.signal.removeEventListener('abort', onInternalAbort);
    }
}

/** A new search or cancel invalidates every earlier result owned by this session. */
export class SatelliteSearchSession {
    private options: Omit<SatelliteSearchOptions, 'signal'>;
    private controller: AbortController | null = null;
    private generation = 0;

    constructor(options: Omit<SatelliteSearchOptions, 'signal'> = {}) { this.options = options; }

    async search(input: SatelliteQuery): Promise<SatelliteSearchResult> {
        this.cancel();
        const generation = this.generation;
        this.controller = new AbortController();
        try {
            const result = await searchSatelliteScenes(input, { ...this.options, signal: this.controller.signal });
            if (generation !== this.generation) throw canceledSearch();
            return result;
        } finally {
            if (generation === this.generation) this.controller = null;
        }
    }

    cancel(): void {
        this.generation += 1;
        this.controller?.abort();
        this.controller = null;
    }
}
