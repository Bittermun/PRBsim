/**
 * Core Data Model for Powder River Basin Coal-Fire Evidence Explorer
 * 
 * Strict separation of:
 * - Sources & Provenance
 * - Physical Sites (with multi-vent grouping uncertainty)
 * - Immutable Observations (reported cause vs verified evidence vs analyst interpretation)
 * - Negative Surveys (explicit footprints and instrument detection limits)
 * - Wildfire Perimeters (authoritative agency geometry)
 */

export type DatePrecision = 'day' | 'month' | 'year' | 'approximate' | 'unknown';

export type ObservationMethod = 
    | 'aerial_survey' 
    | 'satellite_ir' 
    | 'field_visit' 
    | 'incident_report' 
    | 'historical_literature';

export type ObservationStatus = 
    | 'unverified_report' 
    | 'sensor_detection' 
    | 'field_confirmed' 
    | 'extinguished' 
    | 'reignited_vegetation';

export type GroupingUncertainty = 
    | 'isolated' 
    | 'cluster_member' 
    | 'unresolved_subsurface_connectivity';

export interface SourceReference {
    id: string;
    title: string;
    publisher: string;
    url?: string;
    originalUrl?: string;
    retrievalDate: string;
    license: string;
    coordinateSystem?: string;
    rawSha256?: string;
    processedSha256?: string;
    resolutionAccuracy?: string;
    scientificLimitations?: string[];
}

export interface Observation {
    id: string;
    siteId: string | null;
    sourceId: string;
    geometry: GeoJSON.Point | GeoJSON.Polygon;
    accuracyMeters: number;
    observationDate: string; // ISO date string: YYYY-MM-DD, YYYY-MM, or YYYY
    datePrecision: DatePrecision;
    endDate: string | null;
    method: ObservationMethod;
    reportedCondition: string;
    status: ObservationStatus;
    reportedCause: string;
    verifiedEvidence: string;
    analystInterpretation: string;
    lastObservedDate: string;
    ongoingActivityStatus: 'active' | 'inactive' | 'unknown';
    isSynthetic: boolean;
}

export interface Site {
    id: string;
    name: string;
    groupingUncertainty: GroupingUncertainty;
    relatedVentIds: string[];
    geologySummary: string;
    notes: string;
}

export interface Survey {
    id: string;
    sourceId: string;
    surveyDate: string;
    method: string;
    detectionLimitDescription: string;
    negativeResultReported: boolean;
    footprintGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
    findings: string;
    notes: string;
    isSynthetic: boolean;
}

export interface FirePerimeter {
    id: string;
    incidentName: string;
    uniqueId: string;
    acres: number;
    mapMethod: string;
    discoveryDate: string;
    containmentDate: string;
    controlDate: string;
    featureCategory: string;
    stateCoverage: string[];
    counties: string[];
    geometry: GeoJSON.Geometry;
    isSynthetic: boolean;
}

export interface GeologicalFeature {
    id: string;
    name: string;
    category: 'coal_bearing_strata' | 'historic_clinker_outcrop' | 'sedimentary_overburden';
    age: string;
    description: string;
    combustionSusceptibility?: string;
    significance?: string;
    provenance: string;
    geometry: GeoJSON.Geometry;
}

export interface DataGapItem {
    item: string;
    status: string;
    impact: string;
    remedy: string;
}

export interface AuditedSourceInfo {
    source: string;
    url: string;
    auditResult: string;
}

export interface DatasetManifest {
    manifestVersion: string;
    studyArea: string;
    boundingBox: [number, number, number, number];
    generatedDate: string;
    datasets: SourceReference[];
    auditedSourcesWithoutDirectInventory: AuditedSourceInfo[];
    dataGapsChecklist: DataGapItem[];
}

export interface PRBDataSet {
    manifest: DatasetManifest;
    firePerimeters: FirePerimeter[];
    geologicalFeatures: GeologicalFeature[];
    sites: Site[];
    observations: Observation[];
    surveys: Survey[];
    hasRealObservations: boolean;
}

export interface EvidenceFilterState {
    startDate: string; // ISO date YYYY-MM-DD
    endDate: string;   // ISO date YYYY-MM-DD
    includeSynthetic: boolean;
    statusFilter: Set<ObservationStatus>;
    methodFilter: Set<ObservationMethod>;
    showGeology: boolean;
    showPerimeters: boolean;
    showSurveys: boolean;
    showObservations: boolean;
}
