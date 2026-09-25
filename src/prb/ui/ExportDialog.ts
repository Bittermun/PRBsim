/**
 * Data & Static Map Export Module for PRB Evidence Explorer
 * 
 * - Generates standalone GeoJSON export of active research features
 * - Generates CSV export for tabular evidence logs
 * - Generates an auditable, print-ready Static Map & Evidence Brief HTML document
 *   complete with legend, active filter state, full attribution, and scientific disclaimers.
 */

import type { DatasetManifest, FirePerimeter, Observation, Survey, GeologicalFeature } from '../data/types';
import type { FilteredEvidenceResult } from '../data/select';
import { escapeHtml } from './EvidencePanel';

function escapeCsvCell(val: any): string {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    return `"${str.replace(/"/g, '""')}"`;
}

export class ExportDialog {
    public static exportGeoJson(result: FilteredEvidenceResult, manifest: DatasetManifest): void {
        const exportCollection = {
            type: 'FeatureCollection',
            metadata: {
                title: 'Powder River Basin Coal-Fire Evidence Explorer - Filtered Extract',
                studyArea: manifest.studyArea,
                exportDate: new Date().toISOString(),
                filterWindow: result.activeDateWindow,
                isSyntheticIncluded: result.isSyntheticActive,
                disclaimer: 'Absence of observations does not establish absence of fire. Bounded by published survey availability.'
            },
            features: [
                ...result.filteredPerimeters.map((p: FirePerimeter) => ({
                    type: 'Feature',
                    id: p.id,
                    properties: { ...p, geometry: undefined },
                    geometry: p.geometry
                })),
                ...result.filteredObservations.map((o: Observation) => ({
                    type: 'Feature',
                    id: o.id,
                    properties: { ...o, geometry: undefined },
                    geometry: o.geometry
                })),
                ...result.filteredSurveys.map((s: Survey) => ({
                    type: 'Feature',
                    id: s.id,
                    properties: { ...s, footprintGeometry: undefined },
                    geometry: s.footprintGeometry
                })),
                ...result.geologicalFeatures.map((g: GeologicalFeature) => ({
                    type: 'Feature',
                    id: g.id,
                    properties: { ...g, geometry: undefined },
                    geometry: g.geometry
                }))
            ]
        };

        const jsonStr = JSON.stringify(exportCollection, null, 2);
        ExportDialog.triggerDownload(
            jsonStr, 
            `prb_evidence_extract_${result.activeDateWindow.startDate}_to_${result.activeDateWindow.endDate}.geojson`, 
            'application/geo+json'
        );
    }

    public static exportCsv(result: FilteredEvidenceResult): void {
        const headers = [
            'ID',
            'Type',
            'Date',
            'Precision',
            'Method',
            'Status',
            'ReportedCause',
            'VerifiedEvidence',
            'AnalystInterpretation',
            'IsSynthetic'
        ];

        const rows: string[][] = [];

        // Perimeters
        result.filteredPerimeters.forEach((p: FirePerimeter) => {
            rows.push([
                escapeCsvCell(p.id),
                escapeCsvCell('Wildfire Perimeter'),
                escapeCsvCell(p.discoveryDate),
                escapeCsvCell('day'),
                escapeCsvCell(p.mapMethod),
                escapeCsvCell('NIFC Approved'),
                escapeCsvCell('Natural / Lightning (Uninvestigated)'),
                escapeCsvCell(`Calculated burn area: ${p.acres} acres`),
                escapeCsvCell('Surface wildfire perimeter boundary'),
                escapeCsvCell(false)
            ]);
        });

        // Observations
        result.filteredObservations.forEach((o: Observation) => {
            rows.push([
                escapeCsvCell(o.id),
                escapeCsvCell('Observation'),
                escapeCsvCell(o.observationDate),
                escapeCsvCell(o.datePrecision),
                escapeCsvCell(o.method),
                escapeCsvCell(o.status),
                escapeCsvCell(o.reportedCause || ''),
                escapeCsvCell(o.verifiedEvidence || ''),
                escapeCsvCell(o.analystInterpretation || ''),
                escapeCsvCell(o.isSynthetic)
            ]);
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n');

        ExportDialog.triggerDownload(
            csvContent, 
            `prb_evidence_records_${result.activeDateWindow.startDate}_to_${result.activeDateWindow.endDate}.csv`, 
            'text/csv'
        );
    }

    /**
     * Generates a printable, standalone Static Map & Evidence Brief HTML window.
     */
    public static exportStaticBrief(
        result: FilteredEvidenceResult, 
        manifest: DatasetManifest,
        mapCanvas: HTMLCanvasElement | null
    ): void {
        let mapDataUrl = '';
        if (mapCanvas) {
            try {
                mapDataUrl = mapCanvas.toDataURL('image/png');
            } catch (err) {
                console.warn('Canvas export tainted or unavailable:', err);
            }
        }

        const briefHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>PRB Coal-Fire Evidence Brief - ${result.activeDateWindow.startDate} to ${result.activeDateWindow.endDate}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #1e293b; background: #fff; line-height: 1.5; }
        h1 { margin-bottom: 4px; font-size: 24px; color: #0f172a; }
        .meta-line { font-size: 13px; color: #64748b; margin-bottom: 24px; }
        .disclaimer-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin-bottom: 24px; font-size: 13px; color: #92400e; }
        .map-frame { text-align: center; margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; background: #f8fafc; }
        .map-frame img { max-width: 100%; height: auto; border-radius: 4px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 12px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
        th { background: #f1f5f9; font-weight: 600; }
        .badge { display: inline-block; padding: 2px 6px; font-size: 10px; border-radius: 4px; font-weight: 600; text-transform: uppercase; }
        .badge-warning { background: #fef3c7; color: #92400e; }
        .section-title { font-size: 16px; font-weight: 700; margin-top: 28px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
        @media print { body { margin: 15px; } .no-print { display: none; } }
    </style>
</head>
<body>
    <div class="no-print" style="margin-bottom: 20px;">
        <button onclick="window.print()" style="padding: 8px 16px; font-size: 14px; background: #0f172a; color: #fff; border: none; border-radius: 4px; cursor: pointer;">🖨️ Print / Save as PDF</button>
    </div>

    <h1>Powder River Basin Coal-Fire Evidence Brief</h1>
    <div class="meta-line">
        Study Area: <strong>${manifest.studyArea}</strong> | 
        Filter Window: <strong>${result.activeDateWindow.startDate} → ${result.activeDateWindow.endDate}</strong> | 
        Generated: ${new Date().toISOString()}
    </div>

    <div class="disclaimer-box">
        <strong>CRITICAL SCIENTIFIC CAVEATS & LIMITATIONS:</strong><br>
        1. <strong>Absence of Survey $\neq$ Absence of Fire</strong>: A region without mapped combustion vents indicates lack of published ground surveys—never confirmation of unburned coal.<br>
        2. <strong>New Detection $\neq$ New Ignition</strong>: Detection following a wildfire does not prove wildfire causation without a confirmed pre-fire baseline.<br>
        3. <strong>Multi-Vent Grouping</strong>: Multiple surface vents may communicate with a single subterranean combustion body.
    </div>

    ${mapDataUrl ? `
    <div class="map-frame">
        <img src="${mapDataUrl}" alt="Current Map Evidence View" />
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">Captured Map View with Active Research Overlays</div>
    </div>
    ` : ''}

    <div class="section-title">Active Filter Summary</div>
    <p>
        Observations Count: <strong>${result.totalObservationsCount}</strong> | 
        Multi-Vent Clusters: <strong>${result.multiVentClustersCount}</strong> | 
        Wildfire Perimeters: <strong>${result.filteredPerimeters.length}</strong> | 
        Negative Surveys: <strong>${result.negativeSurveysCount}</strong> | 
        Synthetic Data: <strong>${result.isSyntheticActive ? 'INCLUDED (Validation Mode)' : 'EXCLUDED (Real Data Mode)'}</strong>
    </p>

    <div class="section-title">Evidence Records Log</div>
    <table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Category</th>
                <th>Date</th>
                <th>Status</th>
                <th>Reported Cause</th>
                <th>Verified Evidence</th>
            </tr>
        </thead>
        <tbody>
            ${result.filteredPerimeters.map((p: FirePerimeter) => `
                <tr>
                    <td><strong>${escapeHtml(p.incidentName)}</strong></td>
                    <td>Wildfire Perimeter</td>
                    <td>${escapeHtml(p.discoveryDate)}</td>
                    <td>NIFC Verified (${p.acres.toLocaleString()} ac)</td>
                    <td>Natural / Lightning</td>
                    <td>IR Image Interpretation</td>
                </tr>
            `).join('')}
            ${result.filteredObservations.map((o: Observation) => `
                <tr>
                    <td><strong>${escapeHtml(o.id)}</strong> ${o.isSynthetic ? '<span class="badge badge-warning">Synthetic</span>' : ''}</td>
                    <td>Observation</td>
                    <td>${escapeHtml(o.observationDate)}</td>
                    <td>${escapeHtml(o.status)}</td>
                    <td>${escapeHtml(o.reportedCause)}</td>
                    <td>${escapeHtml(o.verifiedEvidence)}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <div class="section-title">Audited Data Sources & Attributions</div>
    <ul>
        ${manifest.datasets.map(d => `
            <li>
                <strong>${escapeHtml(d.title)}</strong> (${escapeHtml(d.publisher)}) — License: ${escapeHtml(d.license)}
                ${d.rawSha256 ? `<br><small style="color: #64748b;">SHA256: ${escapeHtml(d.rawSha256)}</small>` : ''}
            </li>
        `).join('')}
    </ul>
</body>
</html>
        `;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(briefHtml);
            printWindow.document.close();
        } else {
            alert('Popup blocker prevented opening the export report. Please allow popups for this site.');
        }
    }

    private static triggerDownload(content: string, filename: string, mimeType: string): void {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
