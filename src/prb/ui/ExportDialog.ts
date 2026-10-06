/**
 * Export & Reproducible Reporting Utilities for PRB Evidence Explorer
 *
 * Supports:
 * 1. Filtered GeoJSON export with embedded provenance metadata, temporal role, and synthetic quarantine flags
 * 2. Properly escaped RFC 4180 CSV export covering perimeters, observations, surveys, and active geology
 * 3. Printable Scientific Evidence Brief (HTML report with map canvas snapshot, reconstructed legend,
 *    cartographic attribution, Phase 5 Remington Case Study Evidence Matrix, and SHA256 manifest)
 */

import type {
    EvidenceManifest,
    DatasetSource,
    CoalFireSite
} from '../data/types.ts';
import type { FilteredEvidenceResult } from '../data/select.ts';
import type { LocationAssessment } from '../data/assessment.ts';
import { ValidationError } from '../data/load.ts';
import { escapeHtml, formatFireCauseRecord, sanitizeExternalUrl } from './EvidencePanel.ts';

export interface ExportWindowMeta {
    startDate: string;
    endDate: string;
    includeSynthetic: boolean;
}

/**
 * Escapes a single CSV cell value according to RFC 4180 and neutralizes formula injection.
 */
export function escapeCsvCell(val: unknown): string {
    if (val === null || val === undefined) return '';
    let str = String(val);
    if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
    }
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function summarizeGeometryCoords(geom: GeoJSON.Point | GeoJSON.Polygon | GeoJSON.MultiPolygon): string {
    if (!geom) return 'unknown';
    if (geom.type === 'Point') {
        const [lon, lat] = geom.coordinates;
        return `Point(${lon},${lat})`;
    }
    const coordsFlat: number[][] = [];
    if (geom.type === 'Polygon') {
        for (const ring of geom.coordinates) {
            for (const pt of ring) coordsFlat.push(pt);
        }
    } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) {
            for (const ring of poly) {
                for (const pt of ring) coordsFlat.push(pt);
            }
        }
    }
    if (coordsFlat.length === 0) return `${geom.type}(empty)`;
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (const [lon, lat] of coordsFlat) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
    }
    return `${geom.type}[${minLon.toFixed(4)},${minLat.toFixed(4)}..${maxLon.toFixed(4)},${maxLat.toFixed(4)}]`;
}

function buildSourceLookup(manifest: EvidenceManifest, syntheticSources: DatasetSource[] = []): Map<string, DatasetSource> {
    const map = new Map<string, DatasetSource>();
    for (const ds of manifest.datasets || []) {
        map.set(ds.id, ds);
    }
    for (const syn of syntheticSources) {
        map.set(syn.id, syn);
    }
    return map;
}

/**
 * Validates that an assessment is valid to export alongside the active filtered dataset.
 */
export function validateAssessmentForExport(
    assessment: LocationAssessment | null | undefined,
    filtered: FilteredEvidenceResult,
    filterState: ExportWindowMeta
): void {
    if (!assessment) return;

    if (!filterState.includeSynthetic && assessment.syntheticInfluence) {
        throw new ValidationError('Cannot export assessment influenced by synthetic fixtures in Real Mode.');
    }

    if (
        assessment.filterWindow.startDate !== filterState.startDate ||
        assessment.filterWindow.endDate !== filterState.endDate ||
        assessment.filterWindow.includeSynthetic !== filterState.includeSynthetic
    ) {
        throw new ValidationError('Assessment filter window does not match current export filter state.');
    }

    if (assessment.selection.kind === 'observation') {
        const obsId = assessment.selection.observationId;
        const exists = filtered.observations.some(o => o.id === obsId);
        if (!exists) {
            throw new ValidationError(`Selected assessment observation '${obsId}' is not active in current filtered view.`);
        }
    }
}

/**
 * Pure builder for RFC 4180 CSV export of a location assessment.
 */
export function buildAssessmentCsv(assessment: LocationAssessment): string {
    const headers = [
        'Assessment_Schema_Version',
        'Method_Version',
        'Query_Origin',
        'Coordinate_Lon',
        'Coordinate_Lat',
        'Observation_ID',
        'Observation_Date',
        'Observation_Date_Precision',
        'Observation_End_Date',
        'Last_Observed_Date',
        'Accuracy_Meters',
        'Perimeter_ID',
        'Nominal_Relation',
        'Approximate_Boundary_Distance_Meters',
        'Coordinate_Uncertainty',
        'Days_From_Incident_Discovery',
        'Temporal_Reference',
        'Geological_Record_IDs',
        'Survey_Record_IDs',
        'Synthetic_Influence',
        'Causal_Conclusion',
        'Filter_Start_Date',
        'Filter_End_Date',
        'Filter_Include_Synthetic',
        'Input_References_JSON',
        'Caveats'
    ];

    const rows: string[][] = [headers];

    const obsId = assessment.selection.kind === 'observation' ? assessment.selection.observationId : '';
    const inputRefsJson = JSON.stringify(assessment.inputReferences);
    const caveatsStr = assessment.caveats
        .map(c => (/^[=+\-@\t\r]/.test(c) ? `'${c}` : c))
        .join('; ');
    const geoIdsStr = assessment.geologicalRecordIds.join(';');
    const survIdsStr = assessment.surveyRecordIds.join(';');

    if (assessment.relationships.length === 0) {
        rows.push([
            String(assessment.schemaVersion),
            assessment.methodVersion,
            assessment.queryOrigin,
            String(assessment.coordinate[0]),
            String(assessment.coordinate[1]),
            obsId,
            assessment.observationDate || '',
            assessment.observationDatePrecision || '',
            assessment.observationEndDate || '',
            assessment.lastObservedDate || '',
            assessment.accuracyMeters !== null ? String(assessment.accuracyMeters) : '',
            '',
            '',
            '',
            '',
            '',
            '',
            geoIdsStr,
            survIdsStr,
            String(assessment.syntheticInfluence),
            assessment.causalConclusion,
            assessment.filterWindow.startDate,
            assessment.filterWindow.endDate,
            String(assessment.filterWindow.includeSynthetic),
            inputRefsJson,
            caveatsStr
        ]);
    } else {
        for (const rel of assessment.relationships) {
            rows.push([
                String(assessment.schemaVersion),
                assessment.methodVersion,
                assessment.queryOrigin,
                String(assessment.coordinate[0]),
                String(assessment.coordinate[1]),
                obsId,
                assessment.observationDate || '',
                assessment.observationDatePrecision || '',
                assessment.observationEndDate || '',
                assessment.lastObservedDate || '',
                assessment.accuracyMeters !== null ? String(assessment.accuracyMeters) : '',
                rel.perimeterId,
                rel.nominalRelation,
                String(rel.approximateBoundaryDistanceMeters),
                rel.coordinateUncertainty,
                rel.daysFromIncidentDiscovery !== null ? String(rel.daysFromIncidentDiscovery) : '',
                rel.temporalReference,
                geoIdsStr,
                survIdsStr,
                String(assessment.syntheticInfluence),
                assessment.causalConclusion,
                assessment.filterWindow.startDate,
                assessment.filterWindow.endDate,
                String(assessment.filterWindow.includeSynthetic),
                inputRefsJson,
                caveatsStr
            ]);
        }
    }

    return rows.map(r => r.map(escapeCsvCell).join(',')).join('\r\n') + '\r\n';
}

/**
 * Pure builder for filtered GeoJSON export string.
 */
export function buildExportGeoJson(
    filtered: FilteredEvidenceResult,
    manifest: EvidenceManifest,
    filterState: ExportWindowMeta,
    syntheticSources: DatasetSource[] = [],
    assessment?: LocationAssessment | null
): string {
    validateAssessmentForExport(assessment, filtered, filterState);
    const sourceLookup = buildSourceLookup(manifest, syntheticSources);
    const siteLookup = new Map<string, CoalFireSite>(filtered.sites.map(s => [s.id, s]));
    const features: GeoJSON.Feature[] = [];

    for (const p of filtered.wildfirePerimeters) {
        const src = sourceLookup.get(p.sourceId);
        const { geometry, ...props } = p;
        features.push({
            type: 'Feature',
            id: p.id,
            properties: {
                featureType: 'wildfire_perimeter',
                ...props,
                reportedCauseSummary: formatFireCauseRecord(p),
                sourceUrl: src?.url || null,
                sourcePublisher: src?.publisher || null
            },
            geometry
        });
    }

    for (const o of filtered.observations) {
        const src = sourceLookup.get(o.sourceId);
        const site = siteLookup.get(o.siteId);
        const { geometry, ...props } = o;
        features.push({
            type: 'Feature',
            id: o.id,
            properties: {
                featureType: 'coal_fire_observation',
                ...props,
                siteName: site?.name || null,
                coalSeam: site?.coalSeam || null,
                groupingUncertainty: site?.groupingUncertainty || null,
                groupingNotes: site?.groupingNotes || null,
                sourceUrl: src?.url || null,
                sourcePublisher: src?.publisher || null
            },
            geometry
        });
    }

    for (const sv of filtered.surveys) {
        const src = sourceLookup.get(sv.sourceId);
        const { geometry, ...props } = sv;
        features.push({
            type: 'Feature',
            id: sv.id,
            properties: {
                featureType: 'survey_coverage',
                ...props,
                sourceUrl: src?.url || null,
                sourcePublisher: src?.publisher || null
            },
            geometry
        });
    }

    for (const g of filtered.geologicalFeatures) {
        const src = sourceLookup.get(g.sourceId);
        const { geometry, ...props } = g;
        features.push({
            type: 'Feature',
            id: g.id,
            properties: {
                featureType: 'geological_context',
                ...props,
                sourceUrl: src?.url || null,
                sourcePublisher: src?.publisher || null
            },
            geometry
        });
    }

    const out = {
        type: 'FeatureCollection',
        metadata: {
            title: 'PRB Coal-Fire Evidence Explorer Filtered Export',
            studyArea: manifest.studyArea,
            coreQuestion: manifest.coreQuestion,
            crs: 'EPSG:4326',
            exportedAt: new Date().toISOString(),
            observationWindow: {
                startDate: filterState.startDate,
                endDate: filterState.endDate
            },
            includesSyntheticFixtures: filterState.includeSynthetic,
            syntheticWarning: filterState.includeSynthetic
                ? 'WARNING: THIS EXPORT CONTAINS SYNTHETIC VALIDATION FIXTURES AND SCHEMATIC GEOLOGY. DO NOT CITE AS REAL FIELD DATA.'
                : 'Verified empirical dataset only (1 WFIGS retrospective final perimeter; 0 verified coal-fire points).',
            datasets: manifest.datasets,
            remingtonCaseChronology: manifest.remingtonCaseChronology || null,
            ...(assessment ? { locationAssessment: assessment } : {})
        },
        features
    };

    return JSON.stringify(out, null, 2);
}

/**
 * Pure builder for RFC 4180 CSV export covering all active spatial layers.
 */
export function buildExportCsv(
    filtered: FilteredEvidenceResult,
    manifest: EvidenceManifest,
    syntheticSources: DatasetSource[] = []
): string {
    const sourceLookup = buildSourceLookup(manifest, syntheticSources);
    const siteLookup = new Map<string, CoalFireSite>(filtered.sites.map(s => [s.id, s]));

    const headers = [
        'Record_ID',
        'Feature_Type',
        'Label_Or_Name',
        'Primary_Date',
        'End_Or_Control_Date',
        'Map_Or_LastObserved_Date',
        'Date_Precision_Or_Role',
        'Status_Or_Result',
        'Evidence_Methods',
        'Site_ID',
        'Grouping_Uncertainty',
        'Accuracy_Meters',
        'Coordinates_Or_BBox',
        'Reported_Cause',
        'Source_ID',
        'Source_URL',
        'Is_Synthetic',
        'Notes'
    ];

    const rows: string[][] = [headers];

    for (const p of filtered.wildfirePerimeters) {
        const src = sourceLookup.get(p.sourceId);
        rows.push([
            p.id,
            'wildfire_perimeter',
            `${p.incidentName} Wildfire (${p.gisAcres} acres)`,
            p.discoveryDate,
            p.controlDate,
            p.mapDate,
            p.temporalRole,
            p.isSynthetic ? 'synthetic_perimeter' : 'verified_perimeter',
            p.sourceMethod || 'IR Image Interpretation',
            '',
            'not_applicable',
            '10-30 (WFIGS nominal)',
            summarizeGeometryCoords(p.geometry),
            formatFireCauseRecord(p),
            p.sourceId,
            src?.url || '',
            String(p.isSynthetic),
            p.notes
        ]);
    }

    for (const o of filtered.observations) {
        const src = sourceLookup.get(o.sourceId);
        const site = siteLookup.get(o.siteId);
        rows.push([
            o.id,
            'coal_fire_observation',
            o.label,
            o.observationDate,
            o.endDate || '',
            o.lastObservedDate || '',
            o.datePrecision,
            o.status,
            (o.evidenceMethods || []).join('; '),
            o.siteId,
            site?.groupingUncertainty || 'unknown',
            o.accuracyMeters === null || o.accuracyMeters === undefined ? 'unknown' : String(o.accuracyMeters),
            summarizeGeometryCoords(o.geometry),
            '',
            o.sourceId,
            src?.url || '',
            String(o.isSynthetic),
            o.notes
        ]);
    }

    for (const sv of filtered.surveys) {
        const src = sourceLookup.get(sv.sourceId);
        rows.push([
            sv.id,
            'survey_coverage',
            sv.surveyName,
            sv.surveyDate,
            '',
            sv.surveyDate,
            'day',
            sv.result,
            sv.method,
            '',
            'not_applicable',
            'unknown',
            summarizeGeometryCoords(sv.geometry),
            '',
            sv.sourceId,
            src?.url || '',
            String(sv.isSynthetic),
            sv.notes
        ]);
    }

    for (const g of filtered.geologicalFeatures) {
        const src = sourceLookup.get(g.sourceId);
        rows.push([
            g.id,
            'geological_context',
            g.unitName,
            '',
            '',
            '',
            g.scale,
            g.unitType,
            'stratigraphic_context',
            '',
            'not_applicable',
            'schematic_non_metric',
            summarizeGeometryCoords(g.geometry),
            '',
            g.sourceId,
            src?.url || '',
            String(g.isSynthetic),
            g.notes
        ]);
    }

    return rows.map(r => r.map(escapeCsvCell).join(',')).join('\n');
}

/**
 * Pure builder for the printable Scientific Evidence Brief HTML document.
 */
export function buildStaticBriefHtml(
    filtered: FilteredEvidenceResult,
    manifest: EvidenceManifest,
    filterState: ExportWindowMeta,
    mapSnapshotDataUrl: string,
    captureErrorMessage = '',
    assessment?: LocationAssessment | null
): string {
    validateAssessmentForExport(assessment, filtered, filterState);
    const hasSynth = filtered.activeSyntheticCount > 0;
    const chronology = manifest.remingtonCaseChronology;
    const safeSnapshotDataUrl =
        typeof mapSnapshotDataUrl === 'string' && /^data:image\/png(?:;base64)?,[A-Za-z0-9+/=%]+$/i.test(mapSnapshotDataUrl)
            ? mapSnapshotDataUrl
            : '';

    let sec = 1;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>PRB Coal-Fire Evidence Brief — ${escapeHtml(manifest.studyArea)}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Georgia, serif;
            color: #1e293b;
            max-width: 960px;
            margin: 28px auto;
            padding: 0 24px;
            line-height: 1.5;
        }
        h1 { font-size: 21px; margin-bottom: 4px; color: #0f172a; }
        h2 { font-size: 15px; margin-top: 22px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; color: #334155; }
        .meta-bar { font-size: 12px; color: #64748b; margin-bottom: 14px; }
        .synth-banner {
            background: #fef3c7;
            border: 2px solid #d97706;
            color: #92400e;
            padding: 12px;
            font-weight: 600;
            border-radius: 6px;
            margin-bottom: 16px;
        }
        .verified-banner {
            background: #ecfdf5;
            border: 1px solid #059669;
            color: #065f46;
            padding: 10px 12px;
            font-weight: 600;
            border-radius: 6px;
            margin-bottom: 16px;
        }
        .capture-warning {
            background: #fef2f2;
            border: 1px solid #dc2626;
            color: #991b1b;
            padding: 10px 12px;
            border-radius: 6px;
            font-size: 12px;
            margin-bottom: 12px;
        }
        .map-frame {
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            overflow: hidden;
            margin: 12px 0;
            text-align: center;
            background: #f8fafc;
        }
        .map-frame img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
        .attribution-line {
            font-size: 11px;
            color: #475569;
            background: #f1f5f9;
            padding: 6px 10px;
            border-top: 1px solid #cbd5e1;
            text-align: left;
        }
        .legend-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            font-size: 12px;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            padding: 10px 12px;
            border-radius: 6px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11.5px;
            margin-top: 8px;
        }
        th, td {
            border: 1px solid #cbd5e1;
            padding: 6px 8px;
            text-align: left;
            vertical-align: top;
        }
        th { background: #f1f5f9; font-weight: 600; }
        code { font-family: ui-monospace, monospace; font-size: 10.5px; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
        @media print {
            .no-print { display: none; }
            body { margin: 0; }
        }
    </style>
</head>
<body>
    <div class="no-print" style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
        <button onclick="window.print()" style="padding:8px 16px; background:#0284c7; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600;">Print / Save as PDF</button>
        <span style="font-size:12px; color:#64748b;">Generated by PRB Coal-Fire Evidence Explorer</span>
    </div>

    <h1>Powder River Basin Coal-Fire Evidence Brief</h1>
    <div class="meta-bar">
        <strong>Study Area:</strong> ${escapeHtml(manifest.studyArea)}<br/>
        <strong>Observation Filter Window:</strong> ${escapeHtml(filterState.startDate)} to ${escapeHtml(filterState.endDate)} |
        <strong>CRS:</strong> EPSG:4326 (WGS84)
    </div>

    ${
        hasSynth
            ? `<div class="synth-banner">⚠ SYNTHETIC VALIDATION FIXTURES ACTIVE (${filtered.activeSyntheticCount} records): This report includes synthetic test observations, negative surveys, and schematic geology. Do not cite synthetic records as empirical measurements.</div>`
            : `<div class="verified-banner">✓ REAL MODE: Contains 1 official WFIGS retrospective final wildfire perimeter (polygon map date 2025-01-15) and 0 verified coal-fire point observations or local geology vectors.</div>`
    }

    <h2>${sec++}. Core Research Question</h2>
    <p><em>"${escapeHtml(manifest.coreQuestion)}"</em></p>

    ${
        safeSnapshotDataUrl
            ? `
    <h2>${sec++}. Cartographic Evidence Snapshot</h2>
    <div class="map-frame">
        <img src="${escapeHtml(safeSnapshotDataUrl)}" alt="PRB Map Snapshot" />
        <div class="attribution-line">
            <strong>Cartographic &amp; Data Attribution:</strong> © OpenFreeMap, © OpenStreetMap contributors | Terrain: AWS Open Data (Terrarium DEM) | Wildfire Perimeter: NIFC WFIGS Interagency Perimeters (Final Footprint Snapshot 2025-01-15).
        </div>
    </div>
    `
            : `
    <h2>${sec++}. Cartographic Evidence Snapshot</h2>
    <div class="capture-warning">
        <strong>Map Snapshot Unavailable:</strong> ${escapeHtml(captureErrorMessage || 'WebGL canvas snapshot could not be captured in this environment.')}
        <br/><em>Attribution:</em> © OpenFreeMap, © OpenStreetMap contributors | Terrain: AWS Open Data (Terrarium DEM) | Wildfire Perimeter: NIFC WFIGS.
    </div>
    `
    }

    ${
        assessment
            ? `
    <h2>${sec++}. Spatiotemporal Evidence Analysis (Targeted Location Assessment)</h2>
    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
        <p style="margin: 0 0 8px 0; font-size: 13px;">
            <strong>Query Origin:</strong> ${escapeHtml(assessment.queryOrigin === 'user_selected_coordinate' ? 'User-Selected Query Coordinate' : 'Observed Coal-Fire Point')} |
            <strong>Coordinates:</strong> <code>[${assessment.coordinate[0].toFixed(5)}, ${assessment.coordinate[1].toFixed(5)}]</code> |
            <strong>Accuracy:</strong> ${assessment.accuracyMeters !== null ? `±${assessment.accuracyMeters}m` : 'Unknown'} |
            <strong>Method Version:</strong> <code>${escapeHtml(assessment.methodVersion)}</code>
        </p>
        ${
            assessment.syntheticInfluence
                ? `<div class="synth-banner" style="margin-bottom: 8px;">
            ⚠ SYNTHETIC INFLUENCE WARNING: This assessment incorporates synthetic validation fixtures or schematic geology. Do not cite as empirical field evidence.
        </div>`
                : ''
        }
        <div style="margin-bottom: 8px; font-size: 12.5px;">
            <strong>Causal Attribution Assessment:</strong> <span style="font-weight: 700; color: #475569;">UNRESOLVED</span> (Nominal status: <code>${escapeHtml(assessment.causalConclusion)}</code>)
        </div>
        <table style="margin-top: 8px;">
            <thead>
                <tr>
                    <th>Wildfire Perimeter</th>
                    <th>Spatial Footprint Relation</th>
                    <th>Approx. Boundary Dist</th>
                    <th>Timing Relative to Incident Discovery</th>
                    <th>Temporal Reference &amp; Notes</th>
                </tr>
            </thead>
            <tbody>
                ${assessment.relationships
                    .map(
                        rel => `
                <tr>
                    <td><code>${escapeHtml(rel.perimeterId)}</code></td>
                    <td><strong>${rel.nominalRelation.toUpperCase()}</strong> (${escapeHtml(rel.coordinateUncertainty)})</td>
                    <td>${Math.round(rel.approximateBoundaryDistanceMeters).toLocaleString()} m</td>
                    <td>${rel.daysFromIncidentDiscovery !== null ? `${rel.daysFromIncidentDiscovery > 0 ? '+' : ''}${rel.daysFromIncidentDiscovery} days` : 'No observation date'}</td>
                    <td><code>${escapeHtml(rel.temporalReference)}</code><br/><small>Local fire arrival: unavailable</small></td>
                </tr>
                `
                    )
                    .join('')}
            </tbody>
        </table>

        ${
            assessment.pathways && assessment.pathways.length > 0
                ? `
        <div style="margin-top: 12px;">
            <strong style="font-size: 12px;">Non-Exclusive Research Pathways Under Investigation:</strong>
            <ul style="margin: 4px 0 8px 20px; font-size: 11.5px; padding: 0;">
                ${assessment.pathways
                    .map(
                        p => `
                <li><strong>${escapeHtml(p.question)}</strong> — <em>Status: ${escapeHtml(p.evidenceStatus.toUpperCase())}</em><br/>
                <small>Required: ${escapeHtml(p.requiredEvidence.join(', '))} | Missing: ${escapeHtml(p.missingEvidenceInActiveView.join(', '))}</small></li>
                `
                    )
                    .join('')}
            </ul>
        </div>`
                : ''
        }

        <div style="margin-top: 10px; font-size: 11.5px; background: #fffbeb; border: 1px solid #fde68a; padding: 8px; border-radius: 4px;">
            <strong>Epistemic Caveats &amp; Limitations:</strong>
            <ul style="margin: 4px 0 0 18px; padding: 0;">
                ${assessment.caveats.map(c => `<li>${escapeHtml(c)}</li>`).join('')}
            </ul>
        </div>
    </div>
    `
            : ''
    }

    <h2>${sec++}. Map Symbology &amp; Legend (Color &amp; Stroke Key)</h2>
    <div class="legend-grid">
        <div><strong>Solid Red Outline + Translucent Fill:</strong> Official 2024 Remington Wildfire Final Perimeter (WFIGS retrospective boundary, polygon timestamp 2025-01-15; not daily fire progression).</div>
        <div><strong>Emerald Circle (Thick White Stroke, r=8):</strong> Field-Confirmed Subsurface Combustion Vent (thermocouple / gas verification).</div>
        <div><strong>Amber Circle (Dark Stroke, r=7):</strong> Remote/Aerial Thermal IR Sensor Detection (awaiting ground confirmation).</div>
        <div><strong>Purple Circle (Light Stroke, r=5.5):</strong> Unverified Historical / Narrative Outcrop Report.</div>
        <div><strong>Slate Circle (White Stroke, r=5):</strong> Extinguished / Inactive Historical Vent.</div>
        <div><strong>Red Circle (Yellow Halo Stroke, r=9):</strong> Re-ignited Surface Vegetation Hypothesis.</div>
        <div><strong>Dashed Orange Polygon:</strong> Parent Coal-Seam Site Complex with unresolved multi-vent subsurface connectivity.</div>
        <div><strong>Dashed Sky-Blue Polygon:</strong> Bounded Negative Thermal Survey Footprint (surveyed, 0 anomalies detected).</div>
        <div><strong>Dashed Amber/Slate Stratigraphic Polygons:</strong> Quarantined Schematic Clinker &amp; Coal Outcrop Context Fixtures (synthetic mode only).</div>
    </div>

    <h2>${sec++}. Filtered Spatial Evidence Records</h2>
    <table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Category</th>
                <th>Name / Label</th>
                <th>Event / Obs Date</th>
                <th>Map / End Date &amp; Role</th>
                <th>Status / Precision</th>
                <th>Details &amp; Cause / Grouping</th>
            </tr>
        </thead>
        <tbody>
            ${filtered.wildfirePerimeters
                .map(
                    p => `
                <tr>
                    <td><code>${escapeHtml(p.id)}</code></td>
                    <td>${p.isSynthetic ? '[SYNTHETIC] Wildfire Perimeter' : 'Wildfire Perimeter'}</td>
                    <td>${escapeHtml(p.incidentName)} (${Number(p.gisAcres).toLocaleString()} ac)</td>
                    <td>Disc: ${escapeHtml(p.discoveryDate)}<br/>Ctrl: ${escapeHtml(p.controlDate)}</td>
                    <td>Map Date: <strong>${escapeHtml(p.mapDate)}</strong><br/><code>${escapeHtml(p.temporalRole)}</code></td>
                    <td>${p.isSynthetic ? 'Synthetic Perimeter' : 'Verified WFIGS'}</td>
                    <td>Reported Cause: ${escapeHtml(formatFireCauseRecord(p))}</td>
                </tr>
            `
                )
                .join('')}
            ${filtered.observations
                .map(o => {
                    const site = filtered.sites.find(s => s.id === o.siteId);
                    const acc = o.accuracyMeters === null ? '±unknown' : `±${o.accuracyMeters}m`;
                    const methods = (o.evidenceMethods || []).join(', ');
                    return `
                <tr>
                    <td><code>${escapeHtml(o.id)}</code></td>
                    <td>${o.isSynthetic ? '[SYNTHETIC] Observation' : 'Observation'}</td>
                    <td>${escapeHtml(o.label)}</td>
                    <td>${escapeHtml(o.observationDate)} (${escapeHtml(o.datePrecision)})</td>
                    <td>${escapeHtml(o.endDate || o.lastObservedDate || '—')}</td>
                    <td>${escapeHtml(o.status)} (${escapeHtml(acc)})<br/><small>Methods: <code>${escapeHtml(methods)}</code></small></td>
                    <td>Site: ${escapeHtml(site?.name || o.siteId)} (${escapeHtml(site?.groupingUncertainty || 'unknown')}) — ${escapeHtml(o.notes)}</td>
                </tr>
            `;
                })
                .join('')}
            ${filtered.surveys
                .map(
                    sv => `
                <tr>
                    <td><code>${escapeHtml(sv.id)}</code></td>
                    <td>${sv.isSynthetic ? '[SYNTHETIC] Survey' : 'Survey'}</td>
                    <td>${escapeHtml(sv.surveyName)}</td>
                    <td>${escapeHtml(sv.surveyDate)}</td>
                    <td>—</td>
                    <td><code>${escapeHtml(sv.result)}</code></td>
                    <td>${escapeHtml(sv.method)} — ${escapeHtml(sv.notes)}</td>
                </tr>
            `
                )
                .join('')}
            ${filtered.geologicalFeatures
                .map(
                    g => `
                <tr>
                    <td><code>${escapeHtml(g.id)}</code></td>
                    <td>${g.isSynthetic ? '[SCHEMATIC FIXTURE] Geology' : 'Geology'}</td>
                    <td>${escapeHtml(g.unitName)}</td>
                    <td>Static</td>
                    <td>${escapeHtml(g.scale)}</td>
                    <td><code>${escapeHtml(g.unitType)}</code></td>
                    <td>${escapeHtml(g.formation)} (${escapeHtml(g.coalBed)})</td>
                </tr>
            `
                )
                .join('')}
        </tbody>
    </table>

    ${
        chronology
            ? `
    <h2>${sec++}. Remington Case Study Evidence &amp; Chronology Matrix (Non-Spatial)</h2>
    <p style="font-size:12px; color:#475569;">${escapeHtml(chronology.purpose)}</p>
    <table>
        <thead>
            <tr>
                <th>Event Date</th>
                <th>Report / Pub Date</th>
                <th>Mapped Perimeter Date</th>
                <th>Evidence Category</th>
                <th>Claim / Reported Postfire Coal Activity</th>
                <th>Survey Coverage, Baseline &amp; Grouping Uncertainty</th>
                <th>Source</th>
            </tr>
        </thead>
        <tbody>
            ${chronology.entries
                .map(
                    e => `
                <tr>
                    <td>${escapeHtml(e.eventDate)}</td>
                    <td>${escapeHtml(e.reportOrPublicationDate)}</td>
                    <td>${escapeHtml(e.mappedPerimeterDate)}</td>
                    <td><code>${escapeHtml(e.evidenceCategory)}</code></td>
                    <td><strong>Claim:</strong> ${escapeHtml(e.claimOrObservation)}<br/><strong>Coal Activity:</strong> ${escapeHtml(e.reportedPostfireCoalActivity)}</td>
                    <td><strong>Survey:</strong> ${escapeHtml(e.surveyCoverageStatus)}<br/><strong>Baseline:</strong> ${escapeHtml(e.prefireBaselineStatus)}<br/><strong>Grouping:</strong> ${escapeHtml(e.groupingUncertainty)}</td>
                    <td>${escapeHtml(e.sourceCitation)}</td>
                </tr>
            `
                )
                .join('')}
        </tbody>
    </table>
    <p style="font-size:11.5px; margin-top:8px; background:#fffbeb; border:1px solid #fde68a; padding:8px; border-radius:4px;">
        <strong>Separate Hydrological Literature Note — ${escapeHtml(chronology.hydrologyContextNote.citation)}:</strong>
        ${escapeHtml(chronology.hydrologyContextNote.relevance)}
        <em>${escapeHtml(chronology.hydrologyContextNote.epistemicLimitation)}</em>
    </p>
    `
            : ''
    }

    <h2>${sec++}. Data Gaps &amp; Epistemic Limitations</h2>
    <table>
        <thead>
            <tr>
                <th>Category</th>
                <th>Status</th>
                <th>Sources Checked</th>
                <th>Scientific Impact</th>
            </tr>
        </thead>
        <tbody>
            ${manifest.dataGapsChecklist
                .map(
                    g => `
                <tr>
                    <td><strong>${escapeHtml(g.category)}</strong></td>
                    <td>${escapeHtml(g.status)}</td>
                    <td>${escapeHtml(g.sourcesChecked)}</td>
                    <td>${escapeHtml(g.scientificImpact)}</td>
                </tr>
            `
                )
                .join('')}
        </tbody>
    </table>

    <h2>${sec++}. Dataset Provenance &amp; SHA256 Checksums</h2>
    <table>
        <thead>
            <tr>
                <th>Dataset</th>
                <th>Publisher &amp; License</th>
                <th>Type</th>
                <th>Processed SHA256</th>
            </tr>
        </thead>
        <tbody>
            ${manifest.datasets
                .map(ds => {
                    const safeUrl = sanitizeExternalUrl(ds.url);
                    return `
                <tr>
                    <td><strong>${escapeHtml(ds.name)}</strong> ${
                        safeUrl
                            ? `<br/><a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(safeUrl)}</a>`
                            : ''
                    }</td>
                    <td>${escapeHtml(ds.publisher)}<br/><small>${escapeHtml(ds.license)}</small></td>
                    <td>${ds.isSynthetic ? 'Synthetic / Schematic Fixture' : 'Empirical Agency Record'}</td>
                    <td><code>${escapeHtml(ds.processedSha256)}</code></td>
                </tr>
            `;
                })
                .join('')}
        </tbody>
    </table>
</body>
</html>`;
}

/**
 * Triggers a browser download of filtered evidence as a GeoJSON FeatureCollection.
 */
export function exportFilteredGeoJson(
    filtered: FilteredEvidenceResult,
    manifest: EvidenceManifest,
    filterState: ExportWindowMeta,
    syntheticSources: DatasetSource[] = [],
    assessment?: LocationAssessment | null
): void {
    const jsonStr = buildExportGeoJson(filtered, manifest, filterState, syntheticSources, assessment);
    const blob = new Blob([jsonStr], { type: 'application/geo+json;charset=utf-8' });
    triggerDownload(blob, `prb-remington-evidence-${filterState.startDate}_to_${filterState.endDate}.geojson`);
}

/**
 * Triggers a browser download of filtered evidence as RFC 4180 CSV.
 */
export function exportFilteredCsv(
    filtered: FilteredEvidenceResult,
    manifest: EvidenceManifest,
    filterState: ExportWindowMeta,
    syntheticSources: DatasetSource[] = []
): void {
    const csvContent = buildExportCsv(filtered, manifest, syntheticSources);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    triggerDownload(blob, `prb-remington-evidence-${filterState.startDate}_to_${filterState.endDate}.csv`);
}

/**
 * Triggers a browser download of a location assessment as RFC 4180 CSV.
 */
export function exportAssessmentCsv(
    assessment: LocationAssessment,
    filterState: ExportWindowMeta
): void {
    const csvContent = buildAssessmentCsv(assessment);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const coordStr = `${assessment.coordinate[0].toFixed(4)}_${assessment.coordinate[1].toFixed(4)}`;
    triggerDownload(blob, `prb-assessment-${coordStr}-${filterState.startDate}_to_${filterState.endDate}.csv`);
}

/**
 * Opens a clean, printable Scientific Evidence Brief in a new browser tab/window,
 * or falls back to downloading the HTML brief if popups are blocked.
 */
export function openPrintableEvidenceBrief(
    filtered: FilteredEvidenceResult,
    manifest: EvidenceManifest,
    filterState: ExportWindowMeta,
    mapCanvas?: HTMLCanvasElement | null,
    assessment?: LocationAssessment | null
): void {
    let mapSnapshotDataUrl = '';
    let captureErrorMessage = '';
    if (!mapCanvas) {
        captureErrorMessage = 'Map canvas element was not available when generating the brief.';
    } else {
        try {
            mapSnapshotDataUrl = mapCanvas.toDataURL('image/png');
            if (!mapSnapshotDataUrl || !mapSnapshotDataUrl.startsWith('data:image/png')) {
                mapSnapshotDataUrl = '';
                captureErrorMessage = 'Map canvas returned an empty image data URL.';
            }
        } catch (err) {
            mapSnapshotDataUrl = '';
            captureErrorMessage = `WebGL canvas capture failed (${err instanceof Error ? err.message : String(err)}).`;
        }
    }

    const html = buildStaticBriefHtml(
        filtered,
        manifest,
        filterState,
        mapSnapshotDataUrl,
        captureErrorMessage,
        assessment
    );

    const win = window.open('', '_blank');
    if (win) {
        win.opener = null;
        win.document.write(html);
        win.document.close();
    } else {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        triggerDownload(blob, `prb-remington-evidence-brief-${filterState.startDate}_to_${filterState.endDate}.html`);
    }
}

function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}
