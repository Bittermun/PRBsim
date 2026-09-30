/**
 * Data Loading, Runtime Schema Validation, and Provenance Verification
 * for the Powder River Basin (PRB) Coal-Fire Evidence Explorer.
 */

import type {
    PRBEvidenceDataset,
    EvidenceManifest,
    DatasetSource,
    WildfirePerimeterRecord,
    GeologicalContextFeature,
    CoalFireSite,
    CoalFireObservation,
    SurveyCoverageRecord
} from './types.ts';

export class ValidationError extends Error {
    constructor(message: string) {
        super(`[PRB Data Validation Error] ${message}`);
        this.name = 'ValidationError';
    }
}

/**
 * Validates that an ISO 8601 date string (YYYY-MM-DD) is both syntactically valid
 * and represents a real calendar date (e.g., rejects 2024-02-30 or 2024-13-01).
 */
export function isValidIsoCalendarDate(dateStr: string): boolean {
    if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return false;
    }
    const [yStr, mStr, dStr] = dateStr.split('-');
    const year = Number(yStr);
    const month = Number(mStr);
    const day = Number(dStr);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return false;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return false;
    }
    const dt = new Date(Date.UTC(year, month - 1, day));
    return (
        dt.getUTCFullYear() === year &&
        dt.getUTCMonth() === month - 1 &&
        dt.getUTCDate() === day
    );
}

/**
 * Validates a single [lon, lat] coordinate pair for finite WGS84 bounds.
 */
export function validateCoordPair(coord: unknown, recordId: string): void {
    if (!Array.isArray(coord) || coord.length < 2) {
        throw new ValidationError(`Invalid coordinate pair in record '${recordId}'`);
    }
    const [lon, lat] = coord;
    if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) {
        throw new ValidationError(`Coordinate contains NaN or non-finite numbers in record '${recordId}'`);
    }
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        throw new ValidationError(
            `Coordinate [${lon}, ${lat}] out of WGS84 bounds in record '${recordId}' (Longitude must be -180..180, Latitude -90..90)`
        );
    }
}

/**
 * Validates a linear ring of a Polygon or MultiPolygon.
 */
function validateLinearRing(ring: unknown, recordId: string): void {
    if (!Array.isArray(ring) || ring.length < 4) {
        throw new ValidationError(
            `Malformed polygon linear ring in record '${recordId}': must have at least 4 coordinates`
        );
    }
    for (const pt of ring) {
        validateCoordPair(pt, recordId);
    }
    const first = ring[0] as number[];
    const last = ring[ring.length - 1] as number[];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        throw new ValidationError(
            `Malformed polygon linear ring in record '${recordId}': ring is not closed`
        );
    }
}

/**
 * Validates GeoJSON Point, Polygon, or MultiPolygon geometry.
 */
export function validateGeometry(
    geom: GeoJSON.Point | GeoJSON.Polygon | GeoJSON.MultiPolygon,
    recordId: string
): void {
    if (!geom || !geom.type || !Array.isArray(geom.coordinates)) {
        throw new ValidationError(`Missing or malformed geometry for record '${recordId}'`);
    }

    if (geom.type === 'Point') {
        validateCoordPair(geom.coordinates, recordId);
    } else if (geom.type === 'Polygon') {
        if (geom.coordinates.length === 0) {
            throw new ValidationError(`Empty Polygon coordinates in record '${recordId}'`);
        }
        for (const ring of geom.coordinates) {
            validateLinearRing(ring, recordId);
        }
    } else if (geom.type === 'MultiPolygon') {
        if (geom.coordinates.length === 0) {
            throw new ValidationError(`Empty MultiPolygon coordinates in record '${recordId}'`);
        }
        for (const poly of geom.coordinates) {
            if (!Array.isArray(poly) || poly.length === 0) {
                throw new ValidationError(`Empty polygon in MultiPolygon record '${recordId}'`);
            }
            for (const ring of poly) {
                validateLinearRing(ring, recordId);
            }
        }
    } else {
        throw new ValidationError(`Unsupported geometry type '${(geom as { type?: string }).type}' in record '${recordId}'`);
    }
}

async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
    if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(digest))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
    throw new ValidationError('Web Crypto API (crypto.subtle) is required for SHA256 dataset verification.');
}

const VALID_STATUSES = new Set<CoalFireObservation['status']>([
    'field_confirmed',
    'sensor_detection',
    'unverified_report',
    'reignited_vegetation',
    'extinguished'
]);

const VALID_EVIDENCE_METHODS = new Set<CoalFireObservation['evidenceMethods'][number]>([
    'ground_thermocouple',
    'borehole_log',
    'aerial_ir',
    'satellite_viirs_modis',
    'visual_smoke',
    'clinker_petrology',
    'gas_sampling',
    'historical_record'
]);

const VALID_DATE_PRECISIONS = new Set<CoalFireObservation['datePrecision']>(['day', 'month', 'year']);

const VALID_TEMPORAL_ROLES = new Set<WildfirePerimeterRecord['temporalRole']>([
    'retrospective_final_footprint',
    'progression_snapshot'
]);

const VALID_GEO_UNIT_TYPES = new Set<GeologicalContextFeature['unitType']>([
    'clinker_deposit',
    'coal_outcrop',
    'coal_basin_boundary'
]);

const VALID_GROUPING_UNCERTAINTIES = new Set<CoalFireSite['groupingUncertainty']>([
    'confirmed_single_body',
    'inferred_connected_seam',
    'unresolved_multi_vent'
]);

const VALID_SURVEY_RESULTS = new Set<SurveyCoverageRecord['result']>([
    'no_thermal_anomaly_detected',
    'anomalies_detected'
]);

async function fetchVerifiedJson<T>(
    url: string,
    expectedSha256?: string,
    datasetId?: string
): Promise<{ data: T; verified: boolean }> {
    if (!expectedSha256 || typeof expectedSha256 !== 'string' || expectedSha256.trim() === '') {
        throw new ValidationError(
            `Missing expected processedSha256 in manifest for dataset '${datasetId || url}'.`
        );
    }
    const res = await fetch(url);
    if (!res.ok) {
        throw new ValidationError(`Failed to fetch dataset at ${url} (HTTP ${res.status})`);
    }
    const buffer = await res.arrayBuffer();
    const actualHash = await computeSha256Hex(buffer);
    if (actualHash.toLowerCase() !== expectedSha256.toLowerCase()) {
        throw new ValidationError(
            `SHA256 mismatch for dataset '${datasetId || url}': expected ${expectedSha256}, got ${actualHash}`
        );
    }
    const text = new TextDecoder('utf-8').decode(buffer);
    return { data: JSON.parse(text) as T, verified: true };
}

/**
 * Validates referential integrity, unique IDs, valid calendar dates,
 * coordinate bounds, enum values, geometry subtypes, and synthetic quarantine across all records.
 */
export function validateDatasetIntegrity(dataset: PRBEvidenceDataset): void {
    const { manifest, syntheticSources = [], wildfirePerimeters, geologicalFeatures, sites, observations, surveys } = dataset;

    if (!manifest || !Array.isArray(manifest.datasets) || manifest.datasets.length === 0) {
        throw new ValidationError('Manifest must contain at least one verified DatasetSource.');
    }

    const allSources = new Map<string, DatasetSource>();
    for (const ds of manifest.datasets) {
        if (!ds.id) {
            throw new ValidationError('Manifest dataset entry is missing an id.');
        }
        if (allSources.has(ds.id)) {
            throw new ValidationError(`Duplicate dataset source ID '${ds.id}' in manifest.`);
        }
        allSources.set(ds.id, ds);
    }
    for (const synSrc of syntheticSources) {
        if (!synSrc.id) {
            throw new ValidationError('Synthetic source entry is missing an id.');
        }
        if (allSources.has(synSrc.id)) {
            throw new ValidationError(`Duplicate synthetic source ID '${synSrc.id}'.`);
        }
        if (!synSrc.isSynthetic) {
            throw new ValidationError(`Synthetic source '${synSrc.id}' must have isSynthetic=true.`);
        }
        allSources.set(synSrc.id, synSrc);
    }

    const seenIds = new Set<string>();
    const checkUniqueId = (id: string, kind: string) => {
        if (!id || typeof id !== 'string') {
            throw new ValidationError(`Missing string ID on ${kind}`);
        }
        if (seenIds.has(id)) {
            throw new ValidationError(`Duplicate record ID '${id}' detected (${kind})`);
        }
        seenIds.add(id);
    };

    const checkSourceRef = (sourceId: string, recordId: string, recordIsSynthetic: boolean, kind: string) => {
        const src = allSources.get(sourceId);
        if (!src) {
            throw new ValidationError(
                `${kind} '${recordId}' references unknown sourceId '${sourceId}'. Every record must reference a declared DatasetSource.`
            );
        }
        if (!recordIsSynthetic && src.isSynthetic) {
            throw new ValidationError(
                `Real (non-synthetic) ${kind} '${recordId}' cannot reference synthetic sourceId '${sourceId}'.`
            );
        }
    };

    // Validate Perimeters
    for (const p of wildfirePerimeters) {
        checkUniqueId(p.id, 'WildfirePerimeterRecord');
        checkSourceRef(p.sourceId, p.id, p.isSynthetic, 'WildfirePerimeterRecord');
        validateGeometry(p.geometry, p.id);
        if (p.geometry.type !== 'Polygon' && p.geometry.type !== 'MultiPolygon') {
            throw new ValidationError(
                `WildfirePerimeterRecord '${p.id}' geometry must be Polygon or MultiPolygon (got '${(p.geometry as { type?: string }).type}')`
            );
        }
        if (!VALID_TEMPORAL_ROLES.has(p.temporalRole)) {
            throw new ValidationError(
                `Invalid temporalRole '${String(p.temporalRole)}' in wildfire perimeter '${p.id}'`
            );
        }
        if (typeof p.gisAcres !== 'number' || !Number.isFinite(p.gisAcres) || p.gisAcres <= 0) {
            throw new ValidationError(
                `Invalid gisAcres '${String(p.gisAcres)}' in wildfire perimeter '${p.id}': must be a finite positive number`
            );
        }
        for (const [field, val] of [
            ['discoveryDate', p.discoveryDate],
            ['containmentDate', p.containmentDate],
            ['controlDate', p.controlDate],
            ['mapDate', p.mapDate]
        ] as const) {
            if (!isValidIsoCalendarDate(val)) {
                throw new ValidationError(
                    `Invalid calendar date (${field}: '${val}') in wildfire perimeter '${p.id}'`
                );
            }
        }
        if (p.discoveryDate > p.containmentDate) {
            throw new ValidationError(
                `Inverted perimeter lifecycle dates in '${p.id}': discoveryDate (${p.discoveryDate}) > containmentDate (${p.containmentDate})`
            );
        }
        if (p.containmentDate > p.controlDate) {
            throw new ValidationError(
                `Inverted perimeter lifecycle dates in '${p.id}': containmentDate (${p.containmentDate}) > controlDate (${p.controlDate})`
            );
        }
        if (p.discoveryDate > p.controlDate) {
            throw new ValidationError(
                `Inverted perimeter lifecycle dates in '${p.id}': discoveryDate (${p.discoveryDate}) > controlDate (${p.controlDate})`
            );
        }
    }

    // Validate Geological Features
    for (const g of geologicalFeatures) {
        checkUniqueId(g.id, 'GeologicalContextFeature');
        checkSourceRef(g.sourceId, g.id, g.isSynthetic, 'GeologicalContextFeature');
        validateGeometry(g.geometry, g.id);
        if (g.geometry.type !== 'Polygon' && g.geometry.type !== 'MultiPolygon') {
            throw new ValidationError(
                `GeologicalContextFeature '${g.id}' geometry must be Polygon or MultiPolygon (got '${(g.geometry as { type?: string }).type}')`
            );
        }
        if (!VALID_GEO_UNIT_TYPES.has(g.unitType)) {
            throw new ValidationError(
                `Invalid unitType '${String(g.unitType)}' in geological feature '${g.id}'`
            );
        }
    }

    // Validate Sites
    const siteMap = new Map<string, CoalFireSite>();
    for (const s of sites) {
        checkUniqueId(s.id, 'CoalFireSite');
        if (!VALID_GROUPING_UNCERTAINTIES.has(s.groupingUncertainty)) {
            throw new ValidationError(
                `Invalid groupingUncertainty '${String(s.groupingUncertainty)}' in site '${s.id}'`
            );
        }
        if (s.boundaryGeometry) {
            validateGeometry(s.boundaryGeometry, s.id);
            if (s.boundaryGeometry.type !== 'Polygon' && s.boundaryGeometry.type !== 'MultiPolygon') {
                throw new ValidationError(
                    `CoalFireSite '${s.id}' boundaryGeometry must be Polygon or MultiPolygon`
                );
            }
        }
        siteMap.set(s.id, s);
    }

    // Validate Observations
    for (const o of observations) {
        checkUniqueId(o.id, 'CoalFireObservation');
        checkSourceRef(o.sourceId, o.id, o.isSynthetic, 'CoalFireObservation');
        const parentSite = siteMap.get(o.siteId);
        if (!parentSite) {
            throw new ValidationError(
                `CoalFireObservation '${o.id}' references unknown siteId '${o.siteId}'.`
            );
        }
        if (!o.isSynthetic && parentSite.isSynthetic) {
            throw new ValidationError(
                `Real observation '${o.id}' cannot belong to synthetic site '${o.siteId}'.`
            );
        }
        if (!VALID_STATUSES.has(o.status)) {
            throw new ValidationError(
                `Invalid verification status '${String(o.status)}' in observation '${o.id}'`
            );
        }
        if (!VALID_DATE_PRECISIONS.has(o.datePrecision)) {
            throw new ValidationError(
                `Invalid datePrecision '${String(o.datePrecision)}' in observation '${o.id}'`
            );
        }
        if (!Array.isArray(o.evidenceMethods) || o.evidenceMethods.length === 0) {
            throw new ValidationError(
                `Observation '${o.id}' must declare at least one evidenceMethod`
            );
        }
        for (const method of o.evidenceMethods) {
            if (!VALID_EVIDENCE_METHODS.has(method)) {
                throw new ValidationError(
                    `Invalid evidenceMethod '${String(method)}' in observation '${o.id}'`
                );
            }
        }
        validateGeometry(o.geometry, o.id);
        if (o.geometry.type !== 'Point' && o.geometry.type !== 'Polygon') {
            throw new ValidationError(
                `CoalFireObservation '${o.id}' geometry must be Point or Polygon (got '${(o.geometry as { type?: string }).type}')`
            );
        }
        if (!isValidIsoCalendarDate(o.observationDate)) {
            throw new ValidationError(
                `Invalid calendar date (observationDate: '${o.observationDate}') in observation '${o.id}'`
            );
        }
        if (o.endDate !== undefined) {
            if (!isValidIsoCalendarDate(o.endDate)) {
                throw new ValidationError(
                    `Invalid calendar date (endDate: '${o.endDate}') in observation '${o.id}'`
                );
            }
            if (o.observationDate > o.endDate) {
                throw new ValidationError(
                    `Inverted observation interval in '${o.id}': observationDate (${o.observationDate}) > endDate (${o.endDate})`
                );
            }
        }
        if (o.lastObservedDate !== undefined) {
            if (!isValidIsoCalendarDate(o.lastObservedDate)) {
                throw new ValidationError(
                    `Invalid calendar date (lastObservedDate: '${o.lastObservedDate}') in observation '${o.id}'`
                );
            }
            if (o.observationDate > o.lastObservedDate) {
                throw new ValidationError(
                    `Inverted observation dates in '${o.id}': observationDate (${o.observationDate}) > lastObservedDate (${o.lastObservedDate})`
                );
            }
        }
        if (o.accuracyMeters !== null) {
            if (typeof o.accuracyMeters !== 'number' || !Number.isFinite(o.accuracyMeters) || o.accuracyMeters < 0) {
                throw new ValidationError(
                    `Invalid accuracyMeters '${String(o.accuracyMeters)}' in observation '${o.id}': must be a finite non-negative number or null`
                );
            }
        }
    }

    // Validate Surveys
    for (const sv of surveys) {
        checkUniqueId(sv.id, 'SurveyCoverageRecord');
        checkSourceRef(sv.sourceId, sv.id, sv.isSynthetic, 'SurveyCoverageRecord');
        if (!VALID_SURVEY_RESULTS.has(sv.result)) {
            throw new ValidationError(
                `Invalid survey result '${String(sv.result)}' in survey '${sv.id}'`
            );
        }
        validateGeometry(sv.geometry, sv.id);
        if (sv.geometry.type !== 'Polygon') {
            throw new ValidationError(
                `SurveyCoverageRecord '${sv.id}' geometry must be Polygon (got '${(sv.geometry as { type?: string }).type}')`
            );
        }
        if (!isValidIsoCalendarDate(sv.surveyDate)) {
            throw new ValidationError(
                `Invalid calendar date (surveyDate: '${sv.surveyDate}') in survey '${sv.id}'`
            );
        }
    }
}

/**
 * Loads all PRB Evidence datasets from `public/data/prb/remington/`, verifies SHA256
 * hashes against `manifest.json`, and validates schema/referential integrity.
 */
export async function loadPRBEvidenceData(basePath = ''): Promise<PRBEvidenceDataset> {
    const cleanBase = basePath.replace(/\/$/, '');
    const dataRoot = `${cleanBase}/data/prb/remington`;

    const manifestRes = await fetch(`${dataRoot}/manifest.json`);
    if (!manifestRes.ok) {
        throw new ValidationError(`Failed to load manifest at ${dataRoot}/manifest.json (HTTP ${manifestRes.status})`);
    }
    const manifest: EvidenceManifest = await manifestRes.json();

    const findDatasetMeta = (id: string) => manifest.datasets.find(d => d.id === id);
    const perimMeta = findDatasetMeta('wfigs-remington-2024');
    const geoMeta = findDatasetMeta('usgs-mbmg-prb-geology');
    const synthMeta = findDatasetMeta('synthetic-validation-fixtures');

    const [perimResult, geoResult, synthResult] = await Promise.all([
        fetchVerifiedJson<GeoJSON.FeatureCollection>(
            `${dataRoot}/fire_perimeters.geojson`,
            perimMeta?.processedSha256,
            'wfigs-remington-2024'
        ),
        fetchVerifiedJson<GeoJSON.FeatureCollection & { metadata?: { isSynthetic?: boolean } }>(
            `${dataRoot}/geological_context.geojson`,
            geoMeta?.processedSha256,
            'usgs-mbmg-prb-geology'
        ),
        fetchVerifiedJson<{
            isSynthetic: boolean;
            sources?: DatasetSource[];
            sites?: CoalFireSite[];
            observations?: Record<string, unknown>[];
            surveys?: SurveyCoverageRecord[];
        }>(
            `${dataRoot}/synthetic_fixtures.json`,
            synthMeta?.processedSha256,
            'synthetic-validation-fixtures'
        )
    ]);

    if (perimMeta) perimMeta.hashVerified = perimResult.verified;
    if (geoMeta) geoMeta.hashVerified = geoResult.verified;
    if (synthMeta) synthMeta.hashVerified = synthResult.verified;

    const perimGeoJson = perimResult.data;
    const geoGeoJson = geoResult.data;
    const synthJson = synthResult.data;

    // Parse Wildfire Perimeters
    const wildfirePerimeters: WildfirePerimeterRecord[] = (perimGeoJson.features || []).map((f: GeoJSON.Feature) => {
        const p = (f.properties || {}) as Record<string, unknown>;
        return {
            id: String(p.id || f.id),
            incidentName: String(p.incidentName || 'Unknown'),
            irwinId: String(p.irwinId || ''),
            uniqueFireId: String(p.uniqueFireId || ''),
            gisAcres: Number(p.gisAcres || 0),
            discoveryDate: String(p.discoveryDate || ''),
            containmentDate: String(p.containmentDate || ''),
            controlDate: String(p.controlDate || ''),
            mapDate: String(p.mapDate || p.controlDate || ''),
            temporalRole:
                p.temporalRole !== undefined
                    ? (String(p.temporalRole) as WildfirePerimeterRecord['temporalRole'])
                    : 'retrospective_final_footprint',
            pooState: String(p.pooState || ''),
            pooCounty: String(p.pooCounty || ''),
            fireCause: String(p.fireCause || 'Unknown'),
            reportedCauseGeneral: p.reportedCauseGeneral ? String(p.reportedCauseGeneral) : undefined,
            reportedCauseSpecific: p.reportedCauseSpecific ? String(p.reportedCauseSpecific) : undefined,
            isFireCauseInvestigated:
                p.isFireCauseInvestigated !== undefined ? (p.isFireCauseInvestigated as number | string | null) : null,
            sourceMethod: String(p.sourceMethod || ''),
            sourceId: String(p.sourceId || ''),
            isSynthetic: Boolean(p.isSynthetic),
            notes: String(p.notes || ''),
            geometry: f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon
        };
    });

    // Parse Geological Context (honoring feature or collection-level isSynthetic flag)
    const geoCollectionSynthetic = Boolean(geoGeoJson.metadata?.isSynthetic);
    const geologicalFeatures: GeologicalContextFeature[] = (geoGeoJson.features || []).map((f: GeoJSON.Feature) => {
        const p = (f.properties || {}) as Record<string, unknown>;
        return {
            id: String(p.id || f.id),
            unitName: String(p.unitName || ''),
            unitType:
                p.unitType !== undefined
                    ? (String(p.unitType) as GeologicalContextFeature['unitType'])
                    : 'clinker_deposit',
            formation: String(p.formation || ''),
            coalBed: String(p.coalBed || ''),
            sourceId: String(p.sourceId || ''),
            scale: String(p.scale || ''),
            notes: String(p.notes || ''),
            isSynthetic: p.isSynthetic !== undefined ? Boolean(p.isSynthetic) : geoCollectionSynthetic,
            geometry: f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon
        };
    });

    const syntheticSources: DatasetSource[] = (synthJson.sources || []).map(s => ({
        ...s,
        isSynthetic: true
    }));

    const sites: CoalFireSite[] = (synthJson.sites || []).map((s: CoalFireSite) => ({
        ...s,
        isSynthetic: true
    }));

    const observations: CoalFireObservation[] = (synthJson.observations || []).map((o: Record<string, unknown>) => {
        const rawAcc = o.accuracyMeters;
        const parsedAcc =
            rawAcc === null || rawAcc === undefined || rawAcc === ''
                ? null
                : Number(rawAcc);
        return {
            id: String(o.id),
            siteId: String(o.siteId),
            label: String(o.label),
            observationDate: String(o.observationDate),
            endDate: o.endDate ? String(o.endDate) : undefined,
            datePrecision:
                o.datePrecision !== undefined
                    ? (String(o.datePrecision) as CoalFireObservation['datePrecision'])
                    : 'day',
            lastObservedDate: o.lastObservedDate ? String(o.lastObservedDate) : undefined,
            status: o.status as CoalFireObservation['status'],
            evidenceMethods: Array.isArray(o.evidenceMethods)
                ? (o.evidenceMethods as CoalFireObservation['evidenceMethods'])
                : [],
            accuracyMeters: parsedAcc,
            sourceId: String(o.sourceId),
            notes: String(o.notes || ''),
            isSynthetic: true,
            geometry: o.geometry as GeoJSON.Point | GeoJSON.Polygon
        };
    });

    const surveys: SurveyCoverageRecord[] = (synthJson.surveys || []).map((sv: SurveyCoverageRecord) => ({
        ...sv,
        isSynthetic: true
    }));

    const dataset: PRBEvidenceDataset = {
        manifest,
        syntheticSources,
        wildfirePerimeters,
        geologicalFeatures,
        sites,
        observations,
        surveys
    };

    validateDatasetIntegrity(dataset);
    return dataset;
}
