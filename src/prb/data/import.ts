/** Local, unreviewed evidence intake. A file checksum never verifies a scientific claim. */
import type { PRBEvidenceDataset, DatasetSource, CoalFireSite, CoalFireObservation, SurveyCoverageRecord } from './types.ts';
import { isValidIsoCalendarDate, validateDatasetIntegrity, validateGeometry } from './load.ts';

export const IMPORT_STORAGE_KEY = 'prbsim.local-evidence.v1';
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_HISTORY_BYTES = 8 * 1024 * 1024;
const MAX_STORED_CHARACTERS = 12 * 1024 * 1024;
const MAX_REVISIONS = 50;
const MAX_RECORDS = 5000;
const MAX_COORDINATES = 100000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export interface ImportStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export type ImportSource = Omit<DatasetSource, 'rawSha256' | 'processedSha256' | 'hashVerified'> &
    Partial<Pick<DatasetSource, 'rawSha256' | 'processedSha256' | 'hashVerified'>>;

export interface EvidenceImportPackage {
    schemaVersion: 1;
    packageId: string;
    revision: number;
    isSynthetic: boolean;
    description?: string;
    sources: ImportSource[];
    sites: CoalFireSite[];
    observations: CoalFireObservation[];
    surveys: SurveyCoverageRecord[];
}

export interface ImportIssue { path: string; message: string }
export interface ImportCounts { sources: number; sites: number; observations: number; surveys: number }
export interface ImportPreview {
    valid: boolean;
    action: 'add' | 'replace' | 'noop' | 'reject';
    packageId?: string;
    revision?: number;
    isSynthetic?: boolean;
    sha256?: string;
    sourceNames: string[];
    counts: ImportCounts;
    issues: ImportIssue[];
    warnings: string[];
}

export interface ImportPersistence {
    status: 'persistent' | 'session-only' | 'corrupt';
    message: string;
}

/** Original bytes are Base64 encoded, including any UTF-8 BOM and whitespace. */
export interface ImportRevision {
    packageId: string;
    revision: number;
    sha256: string;
    importedAt: string;
    originalBase64: string;
}

export interface ImportOperationResult {
    ok: boolean;
    dataset: PRBEvidenceDataset;
    persistence: ImportPersistence;
    message: string;
    issues: ImportIssue[];
}
export interface ImportApplyResult extends ImportOperationResult { action: 'added' | 'replaced' | 'noop' | 'rejected' }
export interface ImportRestoreResult extends ImportOperationResult { restoredPackages: number }
export interface ImportResetResult extends ImportOperationResult { removedPackages: number }

interface NormalizedPackage {
    original: EvidenceImportPackage;
    sources: DatasetSource[];
    sites: CoalFireSite[];
    observations: CoalFireObservation[];
    surveys: SurveyCoverageRecord[];
    warnings: string[];
}
interface PreparedPackage { normalized: NormalizedPackage; bytes: Uint8Array; sha256: string }
interface SavedVersion { revision: ImportRevision; normalized: NormalizedPackage }

class IntakeError extends Error {
    issue: ImportIssue;
    constructor(path: string, message: string) {
        super(message);
        this.issue = { path, message };
    }
}
function fail(path: string, message: string): never { throw new IntakeError(path, message); }
function issueFrom(error: unknown): ImportIssue {
    return error instanceof IntakeError ? error.issue : {
        path: 'package', message: error instanceof Error ? error.message : 'The package could not be validated.'
    };
}
function clone<T>(value: T): T { return structuredClone(value); }
function object(value: unknown, path: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'Expected an object.');
    return value as Record<string, unknown>;
}
function keys(row: Record<string, unknown>, allowed: string[], path: string): void {
    for (const key of Object.keys(row)) {
        if (!allowed.includes(key)) fail(`${path}.${key}`, 'Unknown field; check the package format.');
    }
}
function string(value: unknown, path: string, allowEmpty = false): asserts value is string {
    if (typeof value !== 'string' || (!allowEmpty && value.trim() === '') || value.length > 8000 || value.includes('\u0000')) {
        fail(path, `Expected ${allowEmpty ? 'a' : 'a nonempty'} text value of at most 8,000 characters, without null characters.`);
    }
}
function strings(row: Record<string, unknown>, fields: string[], path: string, allowEmpty = false): void {
    for (const field of fields) string(row[field], `${path}.${field}`, allowEmpty);
}
function id(value: unknown, path: string): void {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) fail(path, 'ID must be 1–80 ASCII letters, digits, dots, underscores or hyphens, starting with a letter or digit.');
}
function synthetic(row: Record<string, unknown>, expected: boolean, path: string): void {
    if (typeof row.isSynthetic !== 'boolean' || row.isSynthetic !== expected) {
        fail(`${path}.isSynthetic`, 'Every source and record must explicitly match the package isSynthetic flag. Use separate packages for synthetic and real reports.');
    }
}
function emptyCounts(): ImportCounts { return { sources: 0, sites: 0, observations: 0, surveys: 0 }; }
function packageCounts(pkg: EvidenceImportPackage): ImportCounts {
    return { sources: pkg.sources.length, sites: pkg.sites.length, observations: pkg.observations.length, surveys: pkg.surveys.length };
}

function inspectGeometry(value: unknown, path: string, budget: { count: number }): void {
    const geom = object(value, path);
    keys(geom, ['type', 'coordinates'], path);
    validateGeometry(geom as unknown as GeoJSON.Point, path);
    const coordinate = (position: unknown) => {
        if (!Array.isArray(position) || position.length < 2 || position.length > 3 ||
            position.some(n => typeof n !== 'number' || !Number.isFinite(n))) {
            fail(path, 'Coordinates must contain two or three finite numbers in longitude, latitude order.');
        }
        if (++budget.count > MAX_COORDINATES) fail(path, 'Package exceeds the 100,000-coordinate limit.');
    };
    const ring = (positions: unknown) => {
        const points = positions as number[][];
        for (const point of points) coordinate(point);
        let doubleArea = 0;
        for (let index = 1; index < points.length; index++) {
            doubleArea += points[index - 1][0] * points[index][1] - points[index][0] * points[index - 1][1];
        }
        if (doubleArea === 0) fail(path, 'Polygon rings must enclose a nonzero area.');
    };
    if (geom.type === 'Point') coordinate(geom.coordinates);
    else if (geom.type === 'Polygon') (geom.coordinates as unknown[]).forEach(ring);
    else (geom.coordinates as unknown[][]).forEach(poly => poly.forEach(ring));
}

function inspectPackage(value: unknown): EvidenceImportPackage {
    const pkg = object(value, 'package');
    keys(pkg, ['schemaVersion', 'packageId', 'revision', 'isSynthetic', 'description', 'sources', 'sites', 'observations', 'surveys'], 'package');
    if (pkg.schemaVersion !== 1) fail('schemaVersion', 'Only evidence package schemaVersion 1 is supported.');
    id(pkg.packageId, 'packageId');
    if (!Number.isSafeInteger(pkg.revision) || (pkg.revision as number) < 1) fail('revision', 'revision must be a positive safe integer.');
    if (typeof pkg.isSynthetic !== 'boolean') fail('isSynthetic', 'An explicit boolean isSynthetic is required.');
    if (pkg.description !== undefined) string(pkg.description, 'description', true);
    for (const field of ['sources', 'sites', 'observations', 'surveys']) {
        if (!Array.isArray(pkg[field])) fail(field, `${field} must be an array, including when empty.`);
    }
    const typed = pkg as unknown as EvidenceImportPackage;
    if (typed.sources.length === 0 || typed.sources.length > 100) fail('sources', 'Declare 1–100 sources with attribution metadata.');
    if (typed.sites.length + typed.observations.length + typed.surveys.length > MAX_RECORDS) fail('package', 'Package exceeds the 5,000-record limit.');
    if (typed.observations.length + typed.surveys.length === 0) fail('package', 'Include at least one observation or survey.');

    typed.sources.forEach((value, index) => {
        const path = `sources[${index}]`;
        const source = object(value, path);
        keys(source, ['id', 'name', 'publisher', 'retrievalDate', 'url', 'license', 'crs', 'spatialAccuracy', 'limitations', 'isSynthetic', 'rawSha256', 'processedSha256', 'hashVerified'], path);
        id(source.id, `${path}.id`);
        strings(source, ['name', 'publisher', 'retrievalDate', 'url', 'license', 'spatialAccuracy', 'limitations'], path);
        if (!isValidIsoCalendarDate(source.retrievalDate as string)) fail(`${path}.retrievalDate`, 'Use a real calendar date in YYYY-MM-DD format.');
        if (source.crs !== 'EPSG:4326') fail(`${path}.crs`, 'Only EPSG:4326 longitude/latitude coordinates are supported.');
        try {
            const url = new URL(source.url as string);
            if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
        } catch { fail(`${path}.url`, 'Attribution URL must be an absolute HTTP or HTTPS URL without embedded credentials.'); }
        for (const hash of ['rawSha256', 'processedSha256']) if (source[hash] !== undefined) string(source[hash], `${path}.${hash}`, true);
        if (source.hashVerified !== undefined && typeof source.hashVerified !== 'boolean') fail(`${path}.hashVerified`, 'A supplied verification claim must be a boolean; it will never be adopted.');
        synthetic(source, typed.isSynthetic, path);
    });
    const budget = { count: 0 };
    typed.sites.forEach((value, index) => {
        const path = `sites[${index}]`;
        const site = object(value, path);
        keys(site, ['id', 'name', 'coalSeam', 'groupingUncertainty', 'groupingNotes', 'boundaryGeometry', 'isSynthetic'], path);
        id(site.id, `${path}.id`);
        strings(site, ['name', 'coalSeam', 'groupingUncertainty'], path);
        strings(site, ['groupingNotes'], path, true);
        synthetic(site, typed.isSynthetic, path);
        if (site.boundaryGeometry !== null) inspectGeometry(site.boundaryGeometry, `${path}.boundaryGeometry`, budget);
    });
    typed.observations.forEach((value, index) => {
        const path = `observations[${index}]`;
        const observation = object(value, path);
        keys(observation, ['id', 'siteId', 'label', 'observationDate', 'endDate', 'datePrecision', 'lastObservedDate', 'status', 'evidenceMethods', 'accuracyMeters', 'sourceId', 'notes', 'isSynthetic', 'geometry'], path);
        for (const field of ['id', 'siteId', 'sourceId']) id(observation[field], `${path}.${field}`);
        strings(observation, ['label', 'observationDate', 'datePrecision', 'status'], path);
        strings(observation, ['notes'], path, true);
        for (const field of ['endDate', 'lastObservedDate']) if (observation[field] !== undefined) string(observation[field], `${path}.${field}`);
        if (!Array.isArray(observation.evidenceMethods) || observation.evidenceMethods.length === 0 || observation.evidenceMethods.length > 8) fail(`${path}.evidenceMethods`, 'Declare 1–8 evidence methods.');
        if (observation.accuracyMeters !== null && (typeof observation.accuracyMeters !== 'number' || !Number.isFinite(observation.accuracyMeters) || observation.accuracyMeters < 0)) fail(`${path}.accuracyMeters`, 'Accuracy must be a non-negative number in meters or explicit null for unknown.');
        synthetic(observation, typed.isSynthetic, path);
        inspectGeometry(observation.geometry, `${path}.geometry`, budget);
    });
    typed.surveys.forEach((value, index) => {
        const path = `surveys[${index}]`;
        const survey = object(value, path);
        keys(survey, ['id', 'surveyName', 'surveyDate', 'method', 'result', 'sourceId', 'notes', 'isSynthetic', 'geometry'], path);
        for (const field of ['id', 'sourceId']) id(survey[field], `${path}.${field}`);
        strings(survey, ['surveyName', 'surveyDate', 'method', 'result'], path);
        strings(survey, ['notes'], path, true);
        synthetic(survey, typed.isSynthetic, path);
        inspectGeometry(survey.geometry, `${path}.geometry`, budget);
    });

    // Validate supplied status/enums/references BEFORE replacing claims with safe intake labels.
    validateDatasetIntegrity({
        manifest: { studyArea: 'Local intake validation', generatedAt: '', coreQuestion: '', dataGapsChecklist: [], auditedSources: [],
            datasets: typed.sources.map(source => ({ ...source, rawSha256: source.rawSha256 ?? '', processedSha256: source.processedSha256 ?? '' })) },
        wildfirePerimeters: [], geologicalFeatures: [], sites: typed.sites, observations: typed.observations, surveys: typed.surveys
    });
    return typed;
}

function normalize(pkg: EvidenceImportPackage, sha256: string): NormalizedPackage {
    const recordId = (external: string) => `local:${pkg.packageId}:record:${external}`;
    const sourceId = (external: string) => `local:${pkg.packageId}:source:${external}`;
    const provenance = `Local unreviewed report; package ${pkg.packageId}, revision ${pkg.revision}. Source and scientific claims have not been independently verified.`;
    const warnings = ['All imported observations are local unreviewed reports. Original claims are preserved in notes and original package history.'];
    if (pkg.isSynthetic) warnings.push('SYNTHETIC package: quarantined from real-evidence mode; it supplies no empirical evidence.');
    const sources = pkg.sources.map(source => ({
        ...source, id: sourceId(source.id), name: `${source.name} [Local unreviewed${pkg.isSynthetic ? '; SYNTHETIC' : ''}]`,
        hashVerified: false, rawSha256: sha256, processedSha256: '',
        limitations: `${source.limitations}\n${provenance} SHA-256 ${sha256} describes original package bytes only, not normalized record bytes and not agency verification. Supplied hashes and verification flags remain claims in the preserved original.`
    }));
    const sites = pkg.sites.map(site => ({
        ...site, id: recordId(site.id), groupingUncertainty: 'unresolved_multi_vent' as const,
        groupingNotes: `${site.groupingNotes}\n${provenance} Original supplied grouping: ${site.groupingUncertainty}. Grouping requires review.`
    }));
    const observations = pkg.observations.map(observation => {
        const zero = observation.accuracyMeters === 0;
        const accuracyNote = zero ? 'Supplied zero accuracy was converted to unknown; zero can describe manual placement or a mock provider, not perfect accuracy.' : '';
        if (zero) warnings.push(`Observation ${observation.id}: supplied zero accuracy converted to unknown.`);
        return {
            ...observation, id: recordId(observation.id), siteId: recordId(observation.siteId), sourceId: sourceId(observation.sourceId),
            label: `${pkg.isSynthetic ? 'SYNTHETIC ' : ''}Local unreviewed report: ${observation.label}`,
            status: 'unverified_report' as const, accuracyMeters: zero ? null : observation.accuracyMeters,
            notes: `${observation.notes}\n${provenance} Original supplied status: ${observation.status}.${accuracyNote ? ` ${accuracyNote}` : ''}`
        };
    });
    const surveys = pkg.surveys.map(survey => ({
        ...survey, id: recordId(survey.id), sourceId: sourceId(survey.sourceId),
        surveyName: `${pkg.isSynthetic ? 'SYNTHETIC ' : ''}Local unreviewed report: ${survey.surveyName}`,
        notes: `${survey.notes}\n${provenance} Survey result and effective detection coverage are supplied claims and require review.`
    }));
    return { original: pkg, sources, sites, observations, surveys, warnings };
}

async function hashBytes(bytes: Uint8Array): Promise<string> {
    if (!globalThis.crypto?.subtle) fail('package', 'Secure SHA-256 is unavailable. Use a browser with Web Crypto in a secure context; no import was applied.');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function encodeBytes(bytes: Uint8Array): string {
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
    return btoa(chunks.join(''));
}
export function originalRevisionBytes(revision: ImportRevision): Uint8Array {
    if (typeof revision.originalBase64 !== 'string' || revision.originalBase64.length > Math.ceil(MAX_IMPORT_BYTES / 3) * 4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(revision.originalBase64)) {
        fail('storage.originalBase64', 'Saved original bytes are invalid or oversized.');
    }
    const decoded = atob(revision.originalBase64);
    return Uint8Array.from(decoded, char => char.charCodeAt(0));
}
async function prepare(input: string | Uint8Array | ArrayBuffer): Promise<PreparedPackage> {
    if (typeof input === 'string' && input.length > MAX_IMPORT_BYTES) fail('package', 'File exceeds the 2 MiB import limit.');
    if ((input instanceof Uint8Array || input instanceof ArrayBuffer) && input.byteLength > MAX_IMPORT_BYTES) fail('package', 'File exceeds the 2 MiB import limit.');
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) :
        input instanceof Uint8Array ? new Uint8Array(input) : input instanceof ArrayBuffer ? new Uint8Array(input.slice(0)) : fail('package', 'Expected JSON text or file bytes.');
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMPORT_BYTES) fail('package', 'File must contain UTF-8 JSON and be no larger than 2 MiB.');
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { fail('package', 'File is not valid UTF-8 JSON.'); }
    const pkg = inspectPackage(parsed);
    const sha256 = await hashBytes(bytes);
    return { normalized: normalize(pkg, sha256), bytes, sha256 };
}

function activeVersions(versions: SavedVersion[]): Map<string, SavedVersion> {
    const active = new Map<string, SavedVersion>();
    for (const version of versions) active.set(version.revision.packageId, version);
    return active;
}
function merge(bundled: PRBEvidenceDataset, versions: SavedVersion[]): PRBEvidenceDataset {
    const dataset = clone(bundled);
    dataset.syntheticSources ??= [];
    for (const { normalized } of activeVersions(versions).values()) {
        for (const source of normalized.sources) {
            (source.isSynthetic ? dataset.syntheticSources : dataset.manifest.datasets).push(clone(source));
        }
        dataset.sites.push(...clone(normalized.sites));
        dataset.observations.push(...clone(normalized.observations));
        dataset.surveys.push(...clone(normalized.surveys));
    }
    validateDatasetIntegrity(dataset);
    return dataset;
}

const PERSISTENT_MESSAGE = 'Original packages and revision history are saved only in this browser. Download originals as a backup; clearing browser data removes them.';

export class EvidenceImportStore {
    private bundled: PRBEvidenceDataset;
    private dataset: PRBEvidenceDataset;
    private storage: ImportStorage | null;
    private storageKey: string;
    private persistence: ImportPersistence;
    private versions: SavedVersion[] = [];
    private previews = new WeakMap<ImportPreview, PreparedPackage>();
    private pending: Promise<void> = Promise.resolve();
    private restored = false;
    private restoreIssues: ImportIssue[] = [];
    private safeToWrite = true;
    private savedArchiveSnapshot: string | null = null;

    constructor(bundled: PRBEvidenceDataset, options: { storage?: ImportStorage | null; storageKey?: string } = {}) {
        validateDatasetIntegrity(bundled);
        this.bundled = clone(bundled);
        this.dataset = clone(bundled);
        this.storageKey = options.storageKey ?? IMPORT_STORAGE_KEY;
        try { this.storage = options.storage === undefined ? globalThis.localStorage ?? null : options.storage; }
        catch { this.storage = null; }
        this.persistence = this.storage ? { status: 'persistent', message: PERSISTENT_MESSAGE } : {
            status: 'session-only', message: 'Browser storage is unavailable. Imports and originals remain in this session only and will be lost on reload. Download originals before leaving.'
        };
    }

    getDataset(): PRBEvidenceDataset { return clone(this.dataset); }
    getHistory(): ImportRevision[] { return this.versions.map(version => clone(version.revision)); }
    getPersistence(): ImportPersistence { return { ...this.persistence }; }

    private exclusive<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.pending.then(operation, operation);
        this.pending = result.then(() => {}, () => {});
        return result;
    }
    private result(ok: boolean, message: string, issues: ImportIssue[] = []): ImportOperationResult {
        return { ok, dataset: this.getDataset(), persistence: this.getPersistence(), message, issues: clone(issues) };
    }
    private classify(prepared: PreparedPackage): 'add' | 'replace' | 'noop' {
        const pkg = prepared.normalized.original;
        const current = activeVersions(this.versions).get(pkg.packageId);
        if (!current) return 'add';
        if (pkg.revision < current.revision.revision) fail('revision', `Stale revision: revision ${current.revision.revision} is already active. Use a newer revision.`);
        if (pkg.revision === current.revision.revision) {
            if (prepared.sha256 === current.revision.sha256) return 'noop';
            fail('revision', 'Same revision has different file bytes (conflict). Preserve the original and increase the revision for an intentional change.');
        }
        if (pkg.isSynthetic !== current.normalized.original.isSynthetic) fail('isSynthetic', 'The synthetic designation cannot change between revisions of a package. Keep synthetic examples quarantined.');
        return 'replace';
    }
    private checkHistoryLimit(prepared: PreparedPackage): void {
        if (this.versions.length >= MAX_REVISIONS) fail('package', 'The 50-revision local history limit is reached. Download originals before removing local imports.');
        const savedBytes = this.versions.reduce((sum, version) => sum + originalRevisionBytes(version.revision).byteLength, 0);
        if (savedBytes + prepared.bytes.byteLength > MAX_HISTORY_BYTES) fail('package', 'The 8 MiB original-history limit is reached. Download originals before removing local imports.');
    }
    private version(prepared: PreparedPackage, importedAt = new Date().toISOString()): SavedVersion {
        const pkg = prepared.normalized.original;
        return { normalized: prepared.normalized, revision: {
            packageId: pkg.packageId, revision: pkg.revision, sha256: prepared.sha256, importedAt, originalBase64: encodeBytes(prepared.bytes)
        } };
    }

    async preview(input: string | Uint8Array | ArrayBuffer): Promise<ImportPreview> {
        await this.restore();
        const preview: ImportPreview = { valid: false, action: 'reject', counts: emptyCounts(), sourceNames: [], issues: [], warnings: [] };
        try {
            const prepared = await prepare(input);
            const pkg = prepared.normalized.original;
            Object.assign(preview, { packageId: pkg.packageId, revision: pkg.revision, isSynthetic: pkg.isSynthetic, sha256: prepared.sha256,
                counts: packageCounts(pkg), sourceNames: pkg.sources.map(source => source.name), warnings: prepared.normalized.warnings });
            const action = this.classify(prepared);
            if (action !== 'noop') {
                this.checkHistoryLimit(prepared);
                merge(this.bundled, [...this.versions, this.version(prepared)]);
            }
            preview.action = action;
            preview.valid = true;
            this.previews.set(preview, prepared);
        } catch (error) { preview.issues.push(issueFrom(error)); }
        return preview;
    }

    async apply(preview: ImportPreview): Promise<ImportApplyResult> {
        await this.restore();
        return this.exclusive(async () => {
            try {
                const prepared = this.previews.get(preview);
                if (!prepared) fail('preview', 'Choose and preview a valid package in this session before applying it.');
                const action = this.classify(prepared);
                if (action === 'noop') return { ...this.result(true, 'Identical current revision: no records or history were added.'), action: 'noop' };
                this.checkHistoryLimit(prepared);
                const versions = [...this.versions, this.version(prepared)];
                const nextDataset = merge(this.bundled, versions);
                if (this.storage && this.safeToWrite) {
                    let currentArchive: string | null = null;
                    try { currentArchive = this.storage.getItem(this.storageKey); }
                    catch {
                        this.safeToWrite = false;
                        this.persistence = { status: 'session-only', message: 'Browser storage could not be read before saving. This import and its originals are session-only; saved data was not overwritten. Download originals before reload.' };
                    }
                    if (this.safeToWrite) {
                        if (currentArchive !== this.savedArchiveSnapshot) fail('storage', 'Saved imports changed in another browser session or window. Reload and review that archive before applying; no originals were overwritten.');
                        try {
                            const serialized = JSON.stringify({ storageVersion: 1, revisions: versions.map(version => version.revision) });
                            this.storage.setItem(this.storageKey, serialized);
                            this.savedArchiveSnapshot = serialized;
                            this.persistence = { status: 'persistent', message: PERSISTENT_MESSAGE };
                        } catch {
                            this.persistence = { status: 'session-only', message: 'Browser storage could not save this import (quota or access failure). This change and its originals are session-only; reload may restore an older saved revision. Download originals before leaving.' };
                        }
                    }
                }
                this.versions = versions;
                this.dataset = nextDataset;
                return { ...this.result(true, `${action === 'add' ? 'Added' : 'Replaced'} local package ${prepared.normalized.original.packageId}; observations remain unreviewed.`), action: action === 'add' ? 'added' : 'replaced' };
            } catch (error) {
                return { ...this.result(false, 'Package rejected; active evidence was not changed.', [issueFrom(error)]), action: 'rejected' };
            }
        });
    }

    async restore(): Promise<ImportRestoreResult> {
        return this.exclusive(async () => {
            if (this.restored) return { ...this.result(this.restoreIssues.length === 0, 'Local import restoration has already been checked.', this.restoreIssues), restoredPackages: activeVersions(this.versions).size };
            this.restored = true;
            if (!this.storage) return { ...this.result(true, 'No browser storage is available; using session-only imports.'), restoredPackages: 0 };
            let stored: string | null;
            try { stored = this.storage.getItem(this.storageKey); }
            catch {
                this.safeToWrite = false;
                this.persistence = { status: 'session-only', message: 'Browser storage could not be read. Imports and originals are session-only and will be lost on reload; saved data has not been overwritten.' };
                return { ...this.result(false, this.persistence.message), restoredPackages: 0 };
            }
            this.savedArchiveSnapshot = stored;
            if (stored === null) return { ...this.result(true, 'No saved local packages.'), restoredPackages: 0 };
            try {
                if (stored.length > MAX_STORED_CHARACTERS) fail('storage', 'Saved import archive exceeds the bounded storage limit.');
                let parsed: unknown;
                try { parsed = JSON.parse(stored); } catch { fail('storage', 'Saved import archive is not valid JSON.'); }
                const archive = object(parsed, 'storage');
                keys(archive, ['storageVersion', 'revisions'], 'storage');
                if (archive.storageVersion !== 1 || !Array.isArray(archive.revisions) || archive.revisions.length > MAX_REVISIONS) fail('storage', 'Saved import archive has an unsupported format or too many revisions.');
                const versions: SavedVersion[] = [];
                const lastRevision = new Map<string, number>();
                const syntheticByPackage = new Map<string, boolean>();
                let totalBytes = 0;
                for (const value of archive.revisions) {
                    const saved = object(value, 'storage.revision');
                    keys(saved, ['packageId', 'revision', 'sha256', 'importedAt', 'originalBase64'], 'storage.revision');
                    id(saved.packageId, 'storage.packageId');
                    if (!Number.isSafeInteger(saved.revision) || (saved.revision as number) < 1) fail('storage.revision', 'Saved revision number is invalid.');
                    if (typeof saved.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(saved.sha256)) fail('storage.sha256', 'Saved original checksum is invalid.');
                    if (typeof saved.importedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(saved.importedAt) || !isValidIsoCalendarDate(saved.importedAt.slice(0, 10)) || !Number.isFinite(Date.parse(saved.importedAt))) fail('storage.importedAt', 'Saved import timestamp is invalid.');
                    const revision = saved as unknown as ImportRevision;
                    const bytes = originalRevisionBytes(revision);
                    totalBytes += bytes.byteLength;
                    if (totalBytes > MAX_HISTORY_BYTES) fail('storage', 'Saved original history exceeds 8 MiB.');
                    const prepared = await prepare(bytes);
                    const pkg = prepared.normalized.original;
                    if (pkg.packageId !== revision.packageId || pkg.revision !== revision.revision || prepared.sha256 !== revision.sha256) fail('storage', 'Saved metadata/checksum does not match the original package bytes.');
                    if (pkg.revision <= (lastRevision.get(pkg.packageId) ?? 0)) fail('storage', 'Saved revisions are duplicated or out of order.');
                    if (syntheticByPackage.has(pkg.packageId) && syntheticByPackage.get(pkg.packageId) !== pkg.isSynthetic) fail('storage', 'Saved synthetic designation changes between revisions. No imports were restored.');
                    lastRevision.set(pkg.packageId, pkg.revision);
                    syntheticByPackage.set(pkg.packageId, pkg.isSynthetic);
                    versions.push({ revision: clone(revision), normalized: prepared.normalized });
                }
                const dataset = merge(this.bundled, versions);
                this.versions = versions;
                this.dataset = dataset;
                return { ...this.result(true, `Restored ${activeVersions(versions).size} local package(s); observations remain unreviewed.`), restoredPackages: activeVersions(versions).size };
            } catch (error) {
                this.safeToWrite = false;
                this.restoreIssues = [issueFrom(error)];
                this.persistence = { status: 'corrupt', message: 'Saved local imports are corrupt or incompatible. None were restored, and saved bytes were retained. New imports are session-only. Download the saved archive for recovery, or remove local imports to clear it.' };
                return { ...this.result(false, this.persistence.message, this.restoreIssues), restoredPackages: 0 };
            }
        });
    }

    /** Returns the untouched saved archive, including a corrupt archive, for user recovery. */
    getSavedArchive(): string | null {
        try { return this.storage?.getItem(this.storageKey) ?? null; } catch { return null; }
    }

    async reset(): Promise<ImportResetResult> {
        return this.exclusive(async () => {
            const removedPackages = activeVersions(this.versions).size;
            this.versions = [];
            this.dataset = clone(this.bundled);
            this.previews = new WeakMap();
            this.restored = true;
            this.restoreIssues = [];
            if (this.storage) {
                try {
                    this.storage.removeItem(this.storageKey);
                    this.savedArchiveSnapshot = null;
                    this.safeToWrite = true;
                    this.persistence = { status: 'persistent', message: PERSISTENT_MESSAGE };
                } catch {
                    this.safeToWrite = false;
                    this.persistence = { status: 'session-only', message: 'Imports were removed from this session, but browser storage could not be cleared. Saved imports may return on reload. Bundled evidence is unchanged.' };
                }
            }
            return { ...this.result(true, 'Removed local imports and in-session revision history. Bundled evidence is unchanged.'), removedPackages };
        });
    }
}
