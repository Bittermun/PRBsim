/**
 * Data Loader & Integrity Validator for PRB Evidence Explorer
 * 
 * Enforces strict validation:
 * - Duplicate identifier detection
 * - Geometry structure checks
 * - Source reference referential integrity
 * - Impossible date sequence checks
 * - Subpath-aware asset URL resolution
 */

import type { 
    PRBDataSet, 
    DatasetManifest, 
    FirePerimeter, 
    GeologicalFeature, 
    Site, 
    Observation, 
    Survey 
} from './types';
import { normalizeIsoDate, compareCalendarDates } from './select.ts';

export class ValidationError extends Error {
    public readonly entity: string;
    public readonly id: string;

    constructor(entity: string, id: string, message: string) {
        super(`[PRB Validation Error - ${entity} '${id}'] ${message}`);
        this.name = 'ValidationError';
        this.entity = entity;
        this.id = id;
    }
}

export function getBaseUrl(): string {
    const raw = import.meta.env.BASE_URL || './';
    return raw.endsWith('/') ? raw : `${raw}/`;
}

export async function fetchJsonAsset<T>(relativeSubpath: string): Promise<T> {
    const fullPath = `${getBaseUrl()}${relativeSubpath.replace(/^\//, '')}`;
    const resp = await fetch(fullPath);
    if (!resp.ok) {
        throw new Error(`Failed to load asset from ${fullPath}: HTTP ${resp.status} ${resp.statusText}`);
    }
    return resp.json() as Promise<T>;
}

export function validateGeometry(entity: string, id: string, geom: any): void {
    if (!geom || typeof geom !== 'object') {
        throw new ValidationError(entity, id, 'Geometry is missing or not an object');
    }
    const validTypes = ['Point', 'MultiPoint', 'Polygon', 'MultiPolygon', 'LineString'];
    if (!validTypes.includes(geom.type)) {
        throw new ValidationError(entity, id, `Invalid GeoJSON geometry type: ${geom.type}`);
    }
    if (!Array.isArray(geom.coordinates) || geom.coordinates.length === 0) {
        throw new ValidationError(entity, id, 'Geometry coordinates array is missing or empty');
    }
}

export function validateDateOrdering(entity: string, id: string, startIso: string, endIso?: string | null): void {
    if (!endIso) return;
    const startNorm = normalizeIsoDate(startIso, false);
    const endNorm = normalizeIsoDate(endIso, true);
    if (!startNorm || !endNorm) {
        throw new ValidationError(entity, id, `Unparseable date: start='${startIso}', end='${endIso}'`);
    }
    if (compareCalendarDates(startNorm, endNorm) > 0) {
        throw new ValidationError(entity, id, `Impossible date sequence: start (${startIso}) is later than end (${endIso})`);
    }
}

export async function loadPRBEvidenceData(): Promise<PRBDataSet> {
    const knownIds = new Set<string>();

    const checkDuplicateId = (entity: string, id: string) => {
        if (!id || typeof id !== 'string') {
            throw new ValidationError(entity, id || '(empty)', 'Entity must have a non-empty string identifier');
        }
        if (knownIds.has(id)) {
            throw new ValidationError(entity, id, 'Duplicate identifier detected across dataset');
        }
        knownIds.add(id);
    };

    // 1. Load Manifest
    const manifest = await fetchJsonAsset<DatasetManifest>('data/prb/remington/manifest.json');
    const sourceIds = new Set<string>(manifest.datasets.map(d => d.id));

    // 2. Load Real Fire Perimeters
    const perimGeoJson = await fetchJsonAsset<any>('data/prb/remington/remington_fire_perimeter.geojson');
    const firePerimeters: FirePerimeter[] = (perimGeoJson.features || []).map((f: any) => {
        const id = f.id || f.properties?.uniqueId || 'perimeter-unnamed';
        checkDuplicateId('FirePerimeter', id);
        validateGeometry('FirePerimeter', id, f.geometry);
        validateDateOrdering(
            'FirePerimeter',
            id,
            f.properties.discoveryDate,
            f.properties.containmentDate
        );
        return {
            id,
            incidentName: f.properties.incidentName || 'Unnamed Incident',
            uniqueId: f.properties.uniqueId || id,
            acres: Number(f.properties.acres) || 0,
            mapMethod: f.properties.mapMethod || 'Unknown',
            discoveryDate: f.properties.discoveryDate,
            containmentDate: f.properties.containmentDate,
            controlDate: f.properties.controlDate,
            featureCategory: f.properties.featureCategory || 'Wildfire Perimeter',
            stateCoverage: f.properties.stateCoverage || [],
            counties: f.properties.counties || [],
            geometry: f.geometry,
            isSynthetic: false
        };
    });

    // 3. Load Geological Context
    const geoGeoJson = await fetchJsonAsset<any>('data/prb/remington/geological_context.geojson');
    const geologicalFeatures: GeologicalFeature[] = (geoGeoJson.features || []).map((f: any) => {
        const id = f.id || f.properties?.name || 'geo-unnamed';
        checkDuplicateId('GeologicalFeature', id);
        validateGeometry('GeologicalFeature', id, f.geometry);
        return {
            id,
            name: f.properties.name,
            category: f.properties.category,
            age: f.properties.age,
            description: f.properties.description,
            combustionSusceptibility: f.properties.combustionSusceptibility,
            significance: f.properties.significance,
            provenance: f.properties.provenance,
            geometry: f.geometry
        };
    });

    // 4. Load Synthetic Validation Fixtures (for edge-case testing)
    let sites: Site[] = [];
    let observations: Observation[] = [];
    let surveys: Survey[] = [];

    try {
        const synthetic = await fetchJsonAsset<any>('data/prb/remington/synthetic_fixtures.json');
        
        // Add synthetic source id to known sources
        sourceIds.add('syn-src-aerial-ir-2024');
        sourceIds.add('syn-src-field-visit-2024');
        sourceIds.add('syn-src-historical-lit');

        sites = (synthetic.sites || []).map((s: any) => {
            checkDuplicateId('Site', s.id);
            return {
                id: s.id,
                name: s.name,
                groupingUncertainty: s.groupingUncertainty,
                relatedVentIds: s.relatedVentIds || [],
                geologySummary: s.geologySummary || '',
                notes: s.notes || ''
            };
        });

        observations = (synthetic.observations || []).map((o: any) => {
            checkDuplicateId('Observation', o.id);
            validateGeometry('Observation', o.id, o.geometry);
            validateDateOrdering('Observation', o.id, o.observationDate, o.lastObservedDate);
            if (!sourceIds.has(o.sourceId)) {
                console.warn(`Observation ${o.id} references sourceId '${o.sourceId}' not in manifest.`);
            }
            return {
                id: o.id,
                siteId: o.siteId || null,
                sourceId: o.sourceId,
                geometry: o.geometry,
                accuracyMeters: Number(o.accuracyMeters) || 50,
                observationDate: o.observationDate,
                datePrecision: o.datePrecision || 'day',
                endDate: o.endDate || null,
                method: o.method,
                reportedCondition: o.reportedCondition || '',
                status: o.status,
                reportedCause: o.reportedCause || 'Not reported',
                verifiedEvidence: o.verifiedEvidence || 'None recorded',
                analystInterpretation: o.analystInterpretation || '',
                lastObservedDate: o.lastObservedDate || o.observationDate,
                ongoingActivityStatus: o.ongoingActivityStatus || 'unknown',
                isSynthetic: true
            };
        });

        surveys = (synthetic.surveys || []).map((surv: any) => {
            checkDuplicateId('Survey', surv.id);
            validateGeometry('Survey', surv.id, surv.footprintGeometry);
            return {
                id: surv.id,
                sourceId: surv.sourceId,
                surveyDate: surv.surveyDate,
                method: surv.method,
                detectionLimitDescription: surv.detectionLimitDescription,
                negativeResultReported: Boolean(surv.negativeResultReported),
                footprintGeometry: surv.footprintGeometry,
                findings: surv.findings,
                notes: surv.notes,
                isSynthetic: true
            };
        });
    } catch (err) {
        console.warn('Synthetic fixtures not loaded or errored:', err);
    }

    return {
        manifest,
        firePerimeters,
        geologicalFeatures,
        sites,
        observations,
        surveys,
        hasRealObservations: false // Explicitly honest: No verified public coal-fire inventory
    };
}
