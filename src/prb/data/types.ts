/**
 * Core Domain Data Types for the Powder River Basin (PRB) Coal-Fire Evidence Explorer
 * Study Area: 2024 Remington Wildfire & Surrounding PRB Stratigraphy (MT/WY)
 *
 * Strict Epistemic Invariants:
 * 1. Every spatial record MUST reference a verifiable DatasetSource.
 * 2. Synthetic test fixtures MUST have `isSynthetic: true` and are strictly quarantined.
 * 3. Multiple surface vents belonging to one potential underground seam fire are grouped under a
 *    parent `CoalFireSite` with explicit `groupingUncertainty` rather than treated as independent fires.
 * 4. Missing coordinate precision remains `null` (unknown) — never defaulted to a fabricated meter value.
 */

export type VerificationStatus =
    | 'field_confirmed'        // Ground thermocouple, borehole, or geological field verification
    | 'sensor_detection'       // Satellite/Aerial thermal IR anomaly without ground confirmation
    | 'unverified_report'      // Historical or narrative report lacking thermal/field verification
    | 'extinguished'           // Previously active vent documented as cooled/reclaimed
    | 'reignited_vegetation';  // Documented surface wildfire ignition attributed to coal seam

export type EvidenceMethod =
    | 'ground_thermocouple'
    | 'borehole_log'
    | 'aerial_ir'
    | 'satellite_viirs_modis'
    | 'visual_smoke'
    | 'clinker_petrology'
    | 'gas_sampling'
    | 'historical_record';

export type GroupingUncertainty =
    | 'confirmed_single_body'      // Subsurface continuity confirmed via drilling/geophysics
    | 'inferred_connected_seam'    // Vents aligned along continuous outcrop bench (<500m)
    | 'unresolved_multi_vent';     // Unknown whether vents share a single subterranean combustion front

export interface DatasetSource {
    id: string;
    name: string;
    publisher: string;
    retrievalDate: string;
    url: string;
    license: string;
    crs: 'EPSG:4326';
    spatialAccuracy: string;
    limitations: string;
    rawSha256: string;
    processedSha256: string;
    isSynthetic: boolean;
    /** Runtime flag set only after fetched file bytes match processedSha256 */
    hashVerified?: boolean;
}

export interface CoalFireSite {
    id: string;
    name: string;
    coalSeam: string; // e.g., "Anderson-Dietz", "Wyodak-Anderson", "Canyon", "Knobloch"
    groupingUncertainty: GroupingUncertainty;
    groupingNotes: string;
    boundaryGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
    isSynthetic: boolean;
}

export interface CoalFireObservation {
    id: string;
    siteId: string;
    label: string;
    observationDate: string;      // ISO 8601 date (YYYY-MM-DD)
    endDate?: string;             // Optional interval end date (YYYY-MM-DD)
    datePrecision: 'day' | 'month' | 'year';
    lastObservedDate?: string;    // Optional end of observation window
    status: VerificationStatus;
    evidenceMethods: EvidenceMethod[];
    accuracyMeters: number | null; // Explicit null when coordinate accuracy is unknown
    sourceId: string;
    notes: string;
    isSynthetic: boolean;
    geometry: GeoJSON.Point | GeoJSON.Polygon;
}

export interface WildfirePerimeterRecord {
    id: string;
    incidentName: string;
    irwinId: string;
    uniqueFireId: string;
    gisAcres: number;
    discoveryDate: string;
    containmentDate: string;
    controlDate: string;
    /** Timestamp of the mapped polygon geometry itself (e.g. WFIGS poly_PolygonDateTime) */
    mapDate: string;
    /** Clarifies whether the polygon is a retrospective final boundary or a time-stamped progression snapshot */
    temporalRole: 'retrospective_final_footprint' | 'progression_snapshot';
    pooState: string;
    pooCounty: string;
    fireCause: string;
    reportedCauseGeneral?: string;
    reportedCauseSpecific?: string;
    isFireCauseInvestigated?: number | string | null;
    sourceMethod: string;
    sourceId: string;
    isSynthetic: boolean;
    notes: string;
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

export interface GeologicalContextFeature {
    id: string;
    unitName: string;
    unitType: 'clinker_deposit' | 'coal_outcrop' | 'coal_basin_boundary';
    formation: string; // e.g., "Fort Union Formation (Tongue River Member)"
    coalBed: string;
    sourceId: string;
    scale: string;
    notes: string;
    isSynthetic: boolean;
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

export interface SurveyCoverageRecord {
    id: string;
    surveyName: string;
    surveyDate: string;
    method: string;
    result: 'no_thermal_anomaly_detected' | 'anomalies_detected';
    sourceId: string;
    notes: string;
    isSynthetic: boolean;
    geometry: GeoJSON.Polygon;
}

export interface DataGapItem {
    category: string;
    status: string;
    sourcesChecked: string;
    scientificImpact: string;
}

export interface AuditedSourceItem {
    agencyOrCatalog: string;
    searchParameters: string;
    result: string;
    url: string;
}

export interface RemingtonChronologyEntry {
    id: string;
    eventDate: string;
    reportOrPublicationDate: string;
    mappedPerimeterDate: string;
    evidenceCategory:
        | 'verified_geospatial_record'
        | 'attributed_secondary_report'
        | 'unverified_primary_source_lead';
    claimOrObservation: string;
    reportedPostfireCoalActivity: string;
    surveyCoverageStatus: string;
    prefireBaselineStatus: string;
    groupingUncertainty: string;
    sourceCitation: string;
    sourceUrl: string;
}

export interface RemingtonCaseChronology {
    title: string;
    purpose: string;
    entries: RemingtonChronologyEntry[];
    hydrologyContextNote: {
        citation: string;
        relevance: string;
        epistemicLimitation: string;
    };
}

export interface EvidenceManifest {
    studyArea: string;
    generatedAt: string;
    coreQuestion: string;
    datasets: DatasetSource[];
    dataGapsChecklist: DataGapItem[];
    auditedSources: AuditedSourceItem[];
    remingtonCaseChronology?: RemingtonCaseChronology;
}

export interface PRBEvidenceDataset {
    manifest: EvidenceManifest;
    /** Additional synthetic sources defined in synthetic_fixtures.json */
    syntheticSources?: DatasetSource[];
    wildfirePerimeters: WildfirePerimeterRecord[];
    geologicalFeatures: GeologicalContextFeature[];
    sites: CoalFireSite[];
    observations: CoalFireObservation[];
    surveys: SurveyCoverageRecord[];
}

export interface FilterState {
    startDate: string;
    endDate: string;
    includeSynthetic: boolean;
    allowedStatuses: VerificationStatus[];
    selectedSiteId?: string | null;
}
