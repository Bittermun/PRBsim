/**
 * Evidence Panel & Provenance Inspector for PRB Coal-Fire Explorer
 *
 * - Displays detailed attribute cards for selected map features (observations, perimeters, geology, surveys)
 * - Automatically reconciles/clears inspector selection when filters or synthetic mode hide the selected feature
 * - Renders an accessible, keyboard-navigable HTML table of all active evidence records
 * - Displays the Data Gaps & Phase 5 Remington Case Study Evidence Matrix
 * - Displays the Dataset Provenance Manifest with runtime-verified SHA256 hashes and safe URL validation
 */

import type {
    PRBEvidenceDataset,
    CoalFireObservation,
    WildfirePerimeterRecord,
    GeologicalContextFeature,
    SurveyCoverageRecord
} from '../data/types.ts';
import type { FilteredEvidenceResult } from '../data/select.ts';

export function escapeHtml(str: string): string {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Validates that an external URL uses http: or https: protocol before rendering in an anchor href.
 */
export function sanitizeExternalUrl(urlStr: string): string | null {
    try {
        const parsed = new URL(urlStr);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.toString();
        }
        return null;
    } catch {
        return null;
    }
}

export function formatFireCauseRecord(perim: WildfirePerimeterRecord): string {
    const general = perim.reportedCauseGeneral || perim.fireCause || 'Unknown';
    const specific = perim.reportedCauseSpecific ? ` / ${perim.reportedCauseSpecific}` : '';
    const inv =
        perim.isFireCauseInvestigated === 0 || perim.isFireCauseInvestigated === '0'
            ? ' (irwin_IsFireCauseInvestigated=0, Uninvestigated in WFIGS)'
            : perim.isFireCauseInvestigated !== null && perim.isFireCauseInvestigated !== undefined
            ? ` (irwin_IsFireCauseInvestigated=${String(perim.isFireCauseInvestigated)})`
            : '';
    return `${general}${specific}${inv}`;
}

export class EvidencePanel {
    private container: HTMLElement;
    private dataset: PRBEvidenceDataset;
    private currentTab: 'inspector' | 'records' | 'gaps' | 'manifest' = 'inspector';
    private onFeatureSelectCallback: ((featureId: string, coords?: [number, number]) => void) | null = null;
    private selectedRecordId: string | null = null;

    constructor(containerId: string, dataset: PRBEvidenceDataset) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`EvidencePanel container '${containerId}' not found`);
        this.container = el;
        this.dataset = dataset;
        this.renderShell();
    }

    public setOnFeatureSelect(cb: (featureId: string, coords?: [number, number]) => void): void {
        this.onFeatureSelectCallback = cb;
    }

    public getCurrentTab(): 'inspector' | 'records' | 'gaps' | 'manifest' {
        return this.currentTab;
    }

    private renderShell(): void {
        this.container.innerHTML = `
            <div class="panel-header">
                <div class="panel-tabs" role="tablist">
                    <button class="panel-tab-btn active" data-tab="inspector" role="tab" aria-selected="true">INSPECTOR</button>
                    <button class="panel-tab-btn" data-tab="records" role="tab" aria-selected="false">RECORDS TABLE</button>
                    <button class="panel-tab-btn" data-tab="gaps" role="tab" aria-selected="false">DATA GAPS & MATRIX</button>
                    <button class="panel-tab-btn" data-tab="manifest" role="tab" aria-selected="false">PROVENANCE</button>
                </div>
            </div>
            <div class="panel-body">
                <div id="tab-inspector" class="tab-pane active">
                    ${this.renderEmptyInspectorHtml()}
                </div>
                <div id="tab-records" class="tab-pane" style="display:none;"></div>
                <div id="tab-gaps" class="tab-pane" style="display:none;"></div>
                <div id="tab-manifest" class="tab-pane" style="display:none;"></div>
            </div>
        `;

        const tabs = this.container.querySelectorAll('.panel-tab-btn');
        tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = (btn as HTMLElement).dataset.tab as 'inspector' | 'records' | 'gaps' | 'manifest';
                this.switchTab(target);
            });
        });

        this.renderDataGaps();
        this.renderManifest();
    }

    private renderEmptyInspectorHtml(): string {
        return `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <h3>Select a Map Feature</h3>
                <p>Click the Remington Wildfire perimeter (retrospective final footprint, polygon date 2025-01-15) or enable Synthetic Validation Fixtures to inspect multi-vent coal seam test cases, negative thermal surveys, and schematic stratigraphy.</p>
            </div>
        `;
    }

    public clearInspectorSelection(): void {
        this.selectedRecordId = null;
        const pane = this.container.querySelector('#tab-inspector') as HTMLElement | null;
        if (pane) {
            pane.innerHTML = this.renderEmptyInspectorHtml();
        }
    }

    public switchTab(tab: 'inspector' | 'records' | 'gaps' | 'manifest'): void {
        this.currentTab = tab;
        const buttons = this.container.querySelectorAll('.panel-tab-btn');
        buttons.forEach(b => {
            const isMatch = (b as HTMLElement).dataset.tab === tab;
            b.classList.toggle('active', isMatch);
            b.setAttribute('aria-selected', isMatch ? 'true' : 'false');
        });

        const panes = ['inspector', 'records', 'gaps', 'manifest'];
        panes.forEach(p => {
            const el = this.container.querySelector(`#tab-${p}`) as HTMLElement;
            if (el) el.style.display = p === tab ? 'block' : 'none';
        });
    }

    public updateFilteredData(filtered: FilteredEvidenceResult): void {
        // Reconcile selection: if the currently inspected record was hidden by date or synthetic filter, clear it
        if (this.selectedRecordId) {
            const stillVisible =
                filtered.wildfirePerimeters.some(p => p.id === this.selectedRecordId) ||
                filtered.observations.some(o => o.id === this.selectedRecordId) ||
                filtered.surveys.some(sv => sv.id === this.selectedRecordId) ||
                filtered.geologicalFeatures.some(g => g.id === this.selectedRecordId);
            if (!stillVisible) {
                this.clearInspectorSelection();
            }
        }
        this.renderRecordsTable(filtered);
    }

    private getGeometryCenter(
        geom: GeoJSON.Point | GeoJSON.Polygon | GeoJSON.MultiPolygon | undefined
    ): [number, number] | undefined {
        if (!geom) return undefined;
        if (geom.type === 'Point') {
            return [geom.coordinates[0], geom.coordinates[1]];
        }
        const ring =
            geom.type === 'Polygon'
                ? geom.coordinates[0]
                : geom.type === 'MultiPolygon'
                  ? geom.coordinates[0]?.[0]
                  : undefined;
        if (!ring || ring.length === 0) return undefined;
        let minLon = Infinity;
        let maxLon = -Infinity;
        let minLat = Infinity;
        let maxLat = -Infinity;
        for (const [lon, lat] of ring) {
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        }
        return [Number(((minLon + maxLon) / 2).toFixed(5)), Number(((minLat + maxLat) / 2).toFixed(5))];
    }

    public selectFeature(type: 'observation' | 'perimeter' | 'geology' | 'survey', props: Record<string, any>): void {
        this.selectedRecordId = props.id ? String(props.id) : null;
        this.switchTab('inspector');
        const pane = this.container.querySelector('#tab-inspector') as HTMLElement;
        if (!pane) return;

        if (type === 'observation') {
            const obs = this.dataset.observations.find(o => o.id === props.id) || (props as CoalFireObservation);
            const site = this.dataset.sites.find(s => s.id === obs.siteId);
            const isSynthBadge = obs.isSynthetic
                ? `<div class="callout-box warning"><strong>⚠ SYNTHETIC VALIDATION FIXTURE:</strong> This record is a quarantined test fixture for demonstrating multi-vent grouping and interval/precision validation, not an empirical field measurement.</div>`
                : '';
            const accDisplay =
                obs.accuracyMeters === null || obs.accuracyMeters === undefined
                    ? '±unknown (unmeasured)'
                    : `±${obs.accuracyMeters} m`;
            const intervalDisplay = obs.endDate ? ` → ${escapeHtml(obs.endDate)}` : '';
            const methodsList = Array.isArray(obs.evidenceMethods)
                ? obs.evidenceMethods
                : typeof obs.evidenceMethods === 'string'
                  ? (() => {
                        try {
                            const parsed = JSON.parse(obs.evidenceMethods);
                            return Array.isArray(parsed) ? parsed : [obs.evidenceMethods];
                        } catch {
                            return [obs.evidenceMethods];
                        }
                    })()
                  : [];

            pane.innerHTML = `
                <div class="feature-detail-card">
                    ${isSynthBadge}
                    <div class="feature-header">
                        <span class="badge badge-obs">COAL SEAM OBSERVATION</span>
                        <h3>${escapeHtml(obs.label)}</h3>
                    </div>
                    <div class="property-grid">
                        <div class="property-row">
                            <span class="prop-label">Record ID</span>
                            <span class="prop-val"><code>${escapeHtml(obs.id)}</code></span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Verification Status</span>
                            <span class="prop-val status-badge status-${escapeHtml(obs.status)}">${escapeHtml(obs.status.replace(/_/g, ' ').toUpperCase())}</span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Evidence Methods</span>
                            <span class="prop-val"><code>${escapeHtml(methodsList.join(', ') || 'unspecified')}</code></span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Observation Date / Interval</span>
                            <span class="prop-val">${escapeHtml(obs.observationDate)}${intervalDisplay} (Precision: ${escapeHtml(obs.datePrecision)})</span>
                        </div>
                        ${obs.lastObservedDate ? `
                        <div class="property-row">
                            <span class="prop-label">Last Observed</span>
                            <span class="prop-val">${escapeHtml(obs.lastObservedDate)}</span>
                        </div>` : ''}
                        <div class="property-row">
                            <span class="prop-label">Positional Accuracy</span>
                            <span class="prop-val">${escapeHtml(accDisplay)}</span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Source ID</span>
                            <span class="prop-val"><code>${escapeHtml(obs.sourceId)}</code></span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Parent Seam Site</span>
                            <span class="prop-val">${site ? escapeHtml(site.name) : escapeHtml(obs.siteId)}</span>
                        </div>
                        ${site ? `
                        <div class="property-row">
                            <span class="prop-label">Coal Seam Unit</span>
                            <span class="prop-val">${escapeHtml(site.coalSeam)}</span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Multi-Vent Grouping</span>
                            <span class="prop-val"><code>${escapeHtml(site.groupingUncertainty)}</code></span>
                        </div>
                        <div class="property-row block-row">
                            <span class="prop-label">Grouping Epistemic Note</span>
                            <p class="prop-val">${escapeHtml(site.groupingNotes)}</p>
                        </div>
                        ` : ''}
                        <div class="property-row block-row">
                            <span class="prop-label">Field & Sensor Notes</span>
                            <p class="prop-val">${escapeHtml(obs.notes)}</p>
                        </div>
                    </div>
                </div>
            `;
        } else if (type === 'perimeter') {
            const perim = this.dataset.wildfirePerimeters.find(p => p.id === props.id) || (props as WildfirePerimeterRecord);
            const isFinal = perim.temporalRole === 'retrospective_final_footprint';
            const temporalRoleLabel = isFinal
                ? 'Retrospective Final Footprint (Static Boundary — Not Daily Spread)'
                : 'Progression Snapshot';
            const perimCallout = perim.isSynthetic
                ? `<div class="callout-box warning"><strong>⚠ SYNTHETIC PERIMETER FIXTURE:</strong> Quarantined test perimeter polygon; not an empirical wildfire boundary.</div>`
                : isFinal
                  ? `<div class="callout-box info">
                        <strong>✓ VERIFIED WFIGS FINAL PERIMETER (MAP DATE ${escapeHtml(perim.mapDate)}):</strong>
                        This polygon is the cumulative final wildfire footprint mapped on <strong>${escapeHtml(perim.mapDate)}</strong>.
                        It remains visible across timeline dates as spatial context and must not be interpreted as day-by-day fire spread.
                    </div>`
                  : `<div class="callout-box info">
                        <strong>✓ VERIFIED WFIGS PROGRESSION SNAPSHOT (MAP DATE ${escapeHtml(perim.mapDate)}):</strong>
                        Intermediate perimeter snapshot mapped on <strong>${escapeHtml(perim.mapDate)}</strong>.
                    </div>`;
            pane.innerHTML = `
                <div class="feature-detail-card">
                    ${perimCallout}
                    <div class="feature-header">
                        <span class="badge badge-perim">WILDFIRE PERIMETER</span>
                        <h3>${escapeHtml(perim.incidentName)} Wildfire (2024)</h3>
                    </div>
                    <div class="property-grid">
                        <div class="property-row">
                            <span class="prop-label">Unique Fire ID</span>
                            <span class="prop-val"><code>${escapeHtml(perim.uniqueFireId)}</code></span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">IRWIN ID</span>
                            <span class="prop-val"><code>${escapeHtml(perim.irwinId)}</code></span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Total Burned Area</span>
                            <span class="prop-val"><strong>${Number(perim.gisAcres).toLocaleString()} acres</strong></span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Temporal Role</span>
                            <span class="prop-val"><code>${escapeHtml(temporalRoleLabel)}</code></span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Polygon Map Date</span>
                            <span class="prop-val"><strong>${escapeHtml(perim.mapDate)}</strong> (WFIGS <code>poly_PolygonDateTime</code>)</span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Discovery Date</span>
                            <span class="prop-val">${escapeHtml(perim.discoveryDate)}</span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Containment Date</span>
                            <span class="prop-val">${escapeHtml(perim.containmentDate)}</span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Control Date</span>
                            <span class="prop-val">${escapeHtml(perim.controlDate)}</span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Point of Origin</span>
                            <span class="prop-val">${escapeHtml(perim.pooCounty)} County, ${escapeHtml(perim.pooState)}</span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">WFIGS Reported Cause</span>
                            <span class="prop-val">${escapeHtml(formatFireCauseRecord(perim))}</span>
                        </div>
                        <div class="property-row block-row">
                            <span class="prop-label">Provenance & Caveats</span>
                            <p class="prop-val">${escapeHtml(perim.notes)}</p>
                        </div>
                    </div>
                </div>
            `;
        } else if (type === 'geology') {
            const geo = this.dataset.geologicalFeatures.find(g => g.id === props.id) || (props as GeologicalContextFeature);
            const synthCallout = geo.isSynthetic
                ? `<div class="callout-box warning"><strong>⚠ SCHEMATIC GEOLOGY FIXTURE:</strong> Hand-constructed regional bounding polygon for UI demonstration; not digitized USGS/MBMG vector geometry.</div>`
                : '';
            pane.innerHTML = `
                <div class="feature-detail-card">
                    ${synthCallout}
                    <div class="feature-header">
                        <span class="badge badge-geo">STRATIGRAPHIC CONTEXT</span>
                        <h3>${escapeHtml(geo.unitName)}</h3>
                    </div>
                    <div class="property-grid">
                        <div class="property-row">
                            <span class="prop-label">Geological Formation</span>
                            <span class="prop-val">${escapeHtml(geo.formation)}</span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Coal Zone / Bed</span>
                            <span class="prop-val">${escapeHtml(geo.coalBed)}</span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Unit Classification</span>
                            <span class="prop-val">${escapeHtml(String(geo.unitType).replace(/_/g, ' ').toUpperCase())}</span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Map Scale</span>
                            <span class="prop-val">${escapeHtml(geo.scale)}</span>
                        </div>
                        <div class="property-row block-row">
                            <span class="prop-label">Geological Notes</span>
                            <p class="prop-val">${escapeHtml(geo.notes)}</p>
                        </div>
                    </div>
                </div>
            `;
        } else if (type === 'survey') {
            const sv = this.dataset.surveys.find(s => s.id === props.id) || (props as SurveyCoverageRecord);
            const synthCallout = sv.isSynthetic
                ? `<div class="callout-box warning"><strong>⚠ SYNTHETIC SURVEY FIXTURE:</strong> Quarantined test polygon illustrating how bounded negative thermal surveys are distinguished from unsurveyed areas.</div>`
                : '';
            pane.innerHTML = `
                <div class="feature-detail-card">
                    ${synthCallout}
                    <div class="feature-header">
                        <span class="badge badge-surv">SURVEY COVERAGE FOOTPRINT</span>
                        <h3>${escapeHtml(sv.surveyName)}</h3>
                    </div>
                    <div class="property-grid">
                        <div class="property-row">
                            <span class="prop-label">Survey Date</span>
                            <span class="prop-val">${escapeHtml(sv.surveyDate)}</span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Method</span>
                            <span class="prop-val">${escapeHtml(sv.method)}</span>
                        </div>
                        <div class="property-row">
                            <span class="prop-label">Finding</span>
                            <span class="prop-val"><code>${escapeHtml(sv.result)}</code></span>
                        </div>
                        <div class="property-row block-row">
                            <span class="prop-label">Notes</span>
                            <p class="prop-val">${escapeHtml(sv.notes)}</p>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    private renderRecordsTable(filtered: FilteredEvidenceResult): void {
        const pane = this.container.querySelector('#tab-records') as HTMLElement;
        if (!pane) return;

        const hasSynth = filtered.activeSyntheticCount > 0;
        const rowsHtml: string[] = [];

        // Perimeters
        for (const p of filtered.wildfirePerimeters) {
            const coords = this.getGeometryCenter(p.geometry);
            const statusLabel = p.isSynthetic
                ? 'SYNTHETIC PERIMETER'
                : p.temporalRole === 'progression_snapshot'
                  ? 'WFIGS PROGRESSION'
                  : 'WFIGS FINAL FOOTPRINT';
            rowsHtml.push(`
                <tr>
                    <td><span class="tag ${p.isSynthetic ? 'tag-synthetic' : 'tag-perim'}">${p.isSynthetic ? 'SYNTHETIC PERIM' : 'PERIMETER'}</span></td>
                    <td><strong>${escapeHtml(p.incidentName)} Wildfire</strong> (${Number(p.gisAcres).toLocaleString()} ac)</td>
                    <td>Disc: ${escapeHtml(p.discoveryDate)}<br/><small>Map: ${escapeHtml(p.mapDate)} (${p.temporalRole === 'progression_snapshot' ? 'Snapshot' : 'Final'})</small></td>
                    <td><span class="status-badge ${p.isSynthetic ? 'status-sensor_detection' : 'status-field_confirmed'}">${statusLabel}</span></td>
                    <td>
                        <button class="table-select-btn" data-type="perim" data-id="${escapeHtml(p.id)}" ${coords ? `data-lon="${coords[0]}" data-lat="${coords[1]}"` : ''}>Inspect</button>
                    </td>
                </tr>
            `);
        }

        // Observations
        for (const o of filtered.observations) {
            const coords = this.getGeometryCenter(o.geometry);
            const accLabel = o.accuracyMeters === null ? '±unknown' : `±${o.accuracyMeters}m`;
            rowsHtml.push(`
                <tr>
                    <td><span class="tag ${o.isSynthetic ? 'tag-synthetic' : 'tag-obs'}">${o.isSynthetic ? 'SYNTHETIC OBS' : 'OBSERVATION'}</span></td>
                    <td>${escapeHtml(o.label)} <small>(${escapeHtml(accLabel)})</small></td>
                    <td>${escapeHtml(o.observationDate)}${o.endDate ? ` → ${escapeHtml(o.endDate)}` : ''}</td>
                    <td><span class="status-badge status-${escapeHtml(o.status)}">${escapeHtml(o.status.replace(/_/g, ' '))}</span></td>
                    <td>
                        <button class="table-select-btn" data-type="obs" data-id="${escapeHtml(o.id)}" ${coords ? `data-lon="${coords[0]}" data-lat="${coords[1]}"` : ''}>Inspect</button>
                    </td>
                </tr>
            `);
        }

        // Surveys
        for (const sv of filtered.surveys) {
            const coords = this.getGeometryCenter(sv.geometry);
            rowsHtml.push(`
                <tr>
                    <td><span class="tag ${sv.isSynthetic ? 'tag-synthetic' : 'tag-obs'}">${sv.isSynthetic ? 'SYNTHETIC SURVEY' : 'SURVEY'}</span></td>
                    <td>${escapeHtml(sv.surveyName)}</td>
                    <td>${escapeHtml(sv.surveyDate)}</td>
                    <td><code>${escapeHtml(sv.result)}</code></td>
                    <td>
                        <button class="table-select-btn" data-type="survey" data-id="${escapeHtml(sv.id)}" ${coords ? `data-lon="${coords[0]}" data-lat="${coords[1]}"` : ''}>Inspect</button>
                    </td>
                </tr>
            `);
        }

        // Geological Context Features (only present when synthetic/schematic fixtures are enabled or if real geology is added)
        for (const g of filtered.geologicalFeatures) {
            const coords = this.getGeometryCenter(g.geometry);
            rowsHtml.push(`
                <tr>
                    <td><span class="tag ${g.isSynthetic ? 'tag-synthetic' : 'tag-obs'}">${g.isSynthetic ? 'SCHEMATIC GEO' : 'GEOLOGY'}</span></td>
                    <td>${escapeHtml(g.unitName)}</td>
                    <td>Static Context</td>
                    <td><code>${escapeHtml(g.unitType)}</code></td>
                    <td>
                        <button class="table-select-btn" data-type="geo" data-id="${escapeHtml(g.id)}" ${coords ? `data-lon="${coords[0]}" data-lat="${coords[1]}"` : ''}>Inspect</button>
                    </td>
                </tr>
            `);
        }

        const totalRecords =
            filtered.wildfirePerimeters.length +
            filtered.observations.length +
            filtered.surveys.length +
            filtered.geologicalFeatures.length;

        pane.innerHTML = `
            <div class="records-table-container">
                <div class="records-summary">
                    Showing <strong>${totalRecords}</strong> spatial records
                    (${filtered.wildfirePerimeters.length} official final perimeter, ${filtered.realObservationCount} verified coal-fire observations${hasSynth ? `, ${filtered.activeSyntheticCount} synthetic/schematic fixtures` : ''}).
                </div>
                ${filtered.realObservationCount === 0 && !hasSynth ? `
                    <div class="callout-box info">
                        <strong>Why are there 0 Coal-Fire Point Observations and 0 Local Geology Polygons?</strong><br/>
                        In default real mode, PRBsim renders only the verified 2024 Remington Wildfire perimeter (polygon snapshot 2025-01-15).
                        No public GPS/IR coal-fire point inventory or digitized local USGS/MBMG outcrop vector layer was acquired from the sources checked.
                        See the <strong>Data Gaps &amp; Matrix</strong> tab for the source-linked Remington chronology (including the Sept 2025 Montana Free Press report of 107 burning seams), or toggle <em>Synthetic Validation Fixtures</em> on the timeline bar to test multi-vent grouping and schematic stratigraphy.
                    </div>
                ` : ''}
                <table class="accessible-evidence-table" aria-label="Filtered PRB Evidence Records">
                    <thead>
                        <tr>
                            <th scope="col">Type</th>
                            <th scope="col">Label / Name</th>
                            <th scope="col">Date / Map Time</th>
                            <th scope="col">Status</th>
                            <th scope="col">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml.join('')}
                    </tbody>
                </table>
            </div>
        `;

        pane.querySelectorAll('.table-select-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const el = btn as HTMLElement;
                const id = el.dataset.id!;
                const type = el.dataset.type;
                if (type === 'perim') {
                    const p = this.dataset.wildfirePerimeters.find(x => x.id === id);
                    if (p) this.selectFeature('perimeter', p);
                } else if (type === 'obs') {
                    const o = this.dataset.observations.find(x => x.id === id);
                    if (o) this.selectFeature('observation', o);
                } else if (type === 'survey') {
                    const sv = this.dataset.surveys.find(x => x.id === id);
                    if (sv) this.selectFeature('survey', sv);
                } else if (type === 'geo') {
                    const g = this.dataset.geologicalFeatures.find(x => x.id === id);
                    if (g) this.selectFeature('geology', g);
                }
                if (el.dataset.lon && el.dataset.lat && this.onFeatureSelectCallback) {
                    this.onFeatureSelectCallback(id, [Number(el.dataset.lon), Number(el.dataset.lat)]);
                }
            });
        });
    }

    private renderDataGaps(): void {
        const pane = this.container.querySelector('#tab-gaps') as HTMLElement;
        if (!pane) return;

        const { dataGapsChecklist, auditedSources, coreQuestion, remingtonCaseChronology } = this.dataset.manifest;

        const chronologyHtml = remingtonCaseChronology
            ? `
                <h3>Remington Case Study Evidence &amp; Chronology Matrix (Non-Spatial)</h3>
                <p style="font-size:11px; color:var(--text-secondary); margin-bottom:6px;">
                    ${escapeHtml(remingtonCaseChronology.purpose)}
                </p>
                <div class="gap-list">
                    ${remingtonCaseChronology.entries
                        .map(entry => {
                            const safeUrl = sanitizeExternalUrl(entry.sourceUrl);
                            return `
                                <div class="gap-card">
                                    <div class="gap-header">
                                        <span class="gap-title">Event: ${escapeHtml(entry.eventDate)} | Published: ${escapeHtml(entry.reportOrPublicationDate)}</span>
                                        <span class="badge badge-obs">${escapeHtml(entry.evidenceCategory.replace(/_/g, ' '))}</span>
                                    </div>
                                    <div class="gap-body">
                                        <p><strong>Mapped Perimeter Time:</strong> ${escapeHtml(entry.mappedPerimeterDate)}</p>
                                        <p><strong>Record / Claim:</strong> ${escapeHtml(entry.claimOrObservation)}</p>
                                        <p><strong>Reported Postfire Coal Activity:</strong> ${escapeHtml(entry.reportedPostfireCoalActivity)}</p>
                                        <p><strong>Survey Coverage:</strong> ${escapeHtml(entry.surveyCoverageStatus)}</p>
                                        <p><strong>Pre-Fire Baseline Status:</strong> ${escapeHtml(entry.prefireBaselineStatus)}</p>
                                        <p><strong>Grouping Uncertainty:</strong> ${escapeHtml(entry.groupingUncertainty)}</p>
                                        <p><strong>Source:</strong> ${escapeHtml(entry.sourceCitation)} ${
                                            safeUrl
                                                ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="source-link">↗ Source</a>`
                                                : ''
                                        }</p>
                                    </div>
                                </div>
                            `;
                        })
                        .join('')}
                </div>
                <div class="callout-box warning" style="margin-top:8px;">
                    <strong>Hydrology Research Branch Note — ${escapeHtml(remingtonCaseChronology.hydrologyContextNote.citation)}:</strong><br/>
                    ${escapeHtml(remingtonCaseChronology.hydrologyContextNote.relevance)}<br/>
                    <em>Epistemic Boundary:</em> ${escapeHtml(remingtonCaseChronology.hydrologyContextNote.epistemicLimitation)}
                </div>
            `
            : '';

        pane.innerHTML = `
            <div class="data-gaps-view">
                <div class="research-question-banner">
                    <span class="rq-label">CORE RESEARCH QUESTION</span>
                    <p class="rq-text">"${escapeHtml(coreQuestion)}"</p>
                </div>

                ${chronologyHtml}

                <h3>Explicit Data Gap Checklist</h3>
                <div class="gap-list">
                    ${dataGapsChecklist
                        .map(
                            g => `
                        <div class="gap-card">
                            <div class="gap-header">
                                <span class="gap-title">${escapeHtml(g.category)}</span>
                                <span class="gap-status">${escapeHtml(g.status)}</span>
                            </div>
                            <div class="gap-body">
                                <p><strong>Sources Checked:</strong> ${escapeHtml(g.sourcesChecked)}</p>
                                <p><strong>Scientific Impact:</strong> ${escapeHtml(g.scientificImpact)}</p>
                            </div>
                        </div>
                    `
                        )
                        .join('')}
                </div>

                <h3>Audited Public Agencies &amp; Catalogs</h3>
                <div class="audited-sources-list">
                    ${auditedSources
                        .map(a => {
                            const safeUrl = sanitizeExternalUrl(a.url);
                            return `
                                <div class="audit-card">
                                    <div class="audit-source">${escapeHtml(a.agencyOrCatalog)}</div>
                                    <div class="audit-result">${escapeHtml(a.result)}</div>
                                    ${
                                        safeUrl
                                            ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="source-link">Open Catalog ↗</a>`
                                            : ''
                                    }
                                </div>
                            `;
                        })
                        .join('')}
                </div>
            </div>
        `;
    }

    private renderManifest(): void {
        const pane = this.container.querySelector('#tab-manifest') as HTMLElement;
        if (!pane) return;

        const { datasets, generatedAt } = this.dataset.manifest;

        pane.innerHTML = `
            <div class="manifest-view">
                <div class="manifest-header">
                    <h3>Dataset Provenance &amp; SHA256 Manifest</h3>
                    <p>Generated: <code>${escapeHtml(generatedAt)}</code> | Coordinate Reference System: <code>EPSG:4326 (WGS84)</code></p>
                </div>
                <div class="dataset-cards">
                    ${datasets
                        .map(ds => {
                            const safeUrl = sanitizeExternalUrl(ds.url);
                            const hashStatusBadge = ds.hashVerified
                                ? `<span class="verified-badge">✓ Processed file hash matched</span>`
                                : `<span class="tag tag-synthetic">Hash unverified</span>`;
                            const synthBadge = ds.isSynthetic
                                ? `<span class="tag tag-synthetic">SYNTHETIC / SCHEMATIC FIXTURE</span>`
                                : `<span class="status-badge status-field_confirmed">EMPIRICAL AGENCY RECORD</span>`;
                            return `
                                <div class="dataset-card ${ds.isSynthetic ? 'dataset-synthetic' : ''}">
                                    <div class="ds-title">
                                        <span>${escapeHtml(ds.name)}</span>
                                        ${synthBadge}
                                    </div>
                                    <div class="ds-meta">
                                        <div><strong>Dataset ID:</strong> <code>${escapeHtml(ds.id)}</code></div>
                                        <div><strong>Publisher:</strong> ${escapeHtml(ds.publisher)}</div>
                                        <div><strong>Retrieval Date:</strong> ${escapeHtml(ds.retrievalDate)}</div>
                                        <div><strong>License:</strong> ${escapeHtml(ds.license)}</div>
                                        <div><strong>Spatial Accuracy:</strong> ${escapeHtml(ds.spatialAccuracy)}</div>
                                        <div><strong>Limitations:</strong> ${escapeHtml(ds.limitations)}</div>
                                        <div class="hash-display">
                                            <strong>Processed SHA256 (${hashStatusBadge}):</strong><br/>
                                            <code>${escapeHtml(ds.processedSha256)}</code>
                                        </div>
                                        ${
                                            safeUrl
                                                ? `<div class="ds-link"><a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">Source Repository / Portal ↗</a></div>`
                                                : ''
                                        }
                                    </div>
                                </div>
                            `;
                        })
                        .join('')}
                </div>
            </div>
        `;
    }
}
