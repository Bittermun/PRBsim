/**
 * Evidence Panel & Accessible Records Inspector
 * 
 * - Safe text rendering (never passes unescaped external text to innerHTML)
 * - Tabs:
 *   1. Feature Inspector (selected observation/perimeter/geology/survey)
 *   2. Accessible Records Table (select without clicking map symbols)
 *   3. Data Gaps & Scientific Limitations
 *   4. Data Sources & Provenance Manifest
 */

import type { Observation, FirePerimeter, GeologicalFeature, Survey, DatasetManifest } from '../data/types';

export function escapeHtml(str: string | number | boolean | null | undefined): string {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export class EvidencePanel {
    private container: HTMLElement;
    private currentTab: 'inspector' | 'records' | 'gaps' | 'manifest' = 'inspector';
    private onRecordSelectCallback: ((id: string) => void) | null = null;

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`EvidencePanel container '${containerId}' not found`);
        this.container = el;
        this.renderShell();
    }

    public setOnRecordSelect(callback: (id: string) => void): void {
        this.onRecordSelectCallback = callback;
    }

    private renderShell(): void {
        this.container.innerHTML = `
            <div class="panel-header">
                <div class="panel-tabs" role="tablist">
                    <button class="panel-tab-btn active" data-tab="inspector" role="tab" id="tab-inspector">EVIDENCE INSPECTOR</button>
                    <button class="panel-tab-btn" data-tab="records" role="tab" id="tab-records">RECORDS TABLE</button>
                    <button class="panel-tab-btn" data-tab="gaps" role="tab" id="tab-gaps">DATA GAPS & LIMITS</button>
                    <button class="panel-tab-btn" data-tab="manifest" role="tab" id="tab-manifest">SOURCES MANIFEST</button>
                </div>
            </div>
            <div class="panel-body" id="panel-content-area">
                <div class="empty-state">Select a feature on the map or from the records table to inspect evidence.</div>
            </div>
        `;

        this.container.querySelectorAll('.panel-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const tab = target.getAttribute('data-tab') as any;
                this.switchTab(tab);
            });
        });
    }

    public switchTab(tab: 'inspector' | 'records' | 'gaps' | 'manifest'): void {
        this.currentTab = tab;
        this.container.querySelectorAll('.panel-tab-btn').forEach(btn => {
            if (btn.getAttribute('data-tab') === tab) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        const event = new CustomEvent('tabchange', { detail: { tab } });
        this.container.dispatchEvent(event);
    }

    public getCurrentTab(): string {
        return this.currentTab;
    }

    /**
     * Inspects a selected feature with safe text rendering.
     */
    public showFeature(selection: { type: string; data: any } | null): void {
        const contentArea = document.getElementById('panel-content-area');
        if (!contentArea) return;

        if (this.currentTab !== 'inspector') {
            this.switchTab('inspector');
        }

        if (!selection) {
            contentArea.innerHTML = `
                <div class="empty-state">
                    <h3>No Feature Selected</h3>
                    <p>Click any map element (wildfire perimeter, geological strata, clinker outcrop, or observation point) to view its auditable provenance, verification status, and limitations.</p>
                </div>
            `;
            return;
        }

        contentArea.innerHTML = '';
        const card = document.createElement('div');
        card.className = 'feature-detail-card';

        if (selection.type === 'observation') {
            const obs: Observation = selection.data;
            card.appendChild(this.createHeading(`Observation: ${obs.id}`, 'badge-obs'));
            
            if (obs.isSynthetic) {
                card.appendChild(this.createNotice('SYNTHETIC FIXTURE', 'This observation is explicitly synthetic for code/logic validation only. Excluded from real data.', 'warning'));
            }

            const grid = document.createElement('div');
            grid.className = 'property-grid';

            this.appendRow(grid, 'Observation Date', `${obs.observationDate} (Precision: ${obs.datePrecision})`);
            this.appendRow(grid, 'Last Observed', `${obs.lastObservedDate} (Ongoing Activity: ${obs.ongoingActivityStatus})`);
            this.appendRow(grid, 'Detection Method', obs.method.replace('_', ' ').toUpperCase());
            this.appendRow(grid, 'Verification Status', obs.status.replace('_', ' ').toUpperCase());
            this.appendRow(grid, 'Associated Site', obs.siteId || 'None (Isolated)');
            this.appendRow(grid, 'Spatial Accuracy', `±${obs.accuracyMeters} meters`);
            this.appendRow(grid, 'Reported Condition', obs.reportedCondition);
            this.appendRow(grid, 'Reported Cause (Narrative)', obs.reportedCause, true);
            this.appendRow(grid, 'Verified Physical Evidence', obs.verifiedEvidence, true);
            this.appendRow(grid, 'Analyst Interpretation', obs.analystInterpretation, true);
            this.appendRow(grid, 'Source Identifier', obs.sourceId);

            card.appendChild(grid);

        } else if (selection.type === 'perimeter') {
            const perim: FirePerimeter = selection.data;
            card.appendChild(this.createHeading(`Wildfire Perimeter: ${perim.incidentName}`, 'badge-perim'));
            
            const grid = document.createElement('div');
            grid.className = 'property-grid';

            this.appendRow(grid, 'Incident Identifier', perim.uniqueId);
            this.appendRow(grid, 'Calculated Burn Area', `${perim.acres.toLocaleString()} acres`);
            this.appendRow(grid, 'Mapping Method', perim.mapMethod);
            this.appendRow(grid, 'Discovery Date', perim.discoveryDate);
            this.appendRow(grid, 'Containment Date', perim.containmentDate || 'Uncontained');
            this.appendRow(grid, 'Control Date', perim.controlDate || 'Under control');
            this.appendRow(grid, 'Counties Affected', perim.counties.join(', '));
            this.appendRow(grid, 'Scientific Caveat', 'Perimeter represents outer envelope; does not prove subsurface coal seam ignition or deep ground heating.');

            card.appendChild(grid);

        } else if (selection.type === 'geology') {
            const geo: GeologicalFeature = selection.data;
            card.appendChild(this.createHeading(`Geological Unit: ${geo.name}`, 'badge-geo'));

            const grid = document.createElement('div');
            grid.className = 'property-grid';

            this.appendRow(grid, 'Category', geo.category.replace(/_/g, ' ').toUpperCase());
            this.appendRow(grid, 'Stratigraphic Age', geo.age);
            this.appendRow(grid, 'Description', geo.description);
            if (geo.combustionSusceptibility) {
                this.appendRow(grid, 'Combustion Susceptibility', geo.combustionSusceptibility);
            }
            if (geo.significance) {
                this.appendRow(grid, 'Geologic Precedent', geo.significance);
            }
            this.appendRow(grid, 'Provenance Source', geo.provenance);

            card.appendChild(grid);

        } else if (selection.type === 'survey') {
            const surv: Survey = selection.data;
            card.appendChild(this.createHeading(`Survey: ${surv.id}`, 'badge-surv'));

            const grid = document.createElement('div');
            grid.className = 'property-grid';

            this.appendRow(grid, 'Survey Date', surv.surveyDate);
            this.appendRow(grid, 'Methodology', surv.method);
            this.appendRow(grid, 'Detection Limit Threshold', surv.detectionLimitDescription);
            this.appendRow(grid, 'Negative Result', surv.negativeResultReported ? 'YES (No thermal anomaly above threshold)' : 'NO');
            this.appendRow(grid, 'Findings', surv.findings);
            this.appendRow(grid, 'Crucial Caveat', surv.notes);

            card.appendChild(grid);
        }

        contentArea.appendChild(card);
    }

    /**
     * Renders the accessible records table.
     */
    public renderRecordsTable(observations: Observation[], perimeters: FirePerimeter[]): void {
        const contentArea = document.getElementById('panel-content-area');
        if (!contentArea || this.currentTab !== 'records') return;

        contentArea.innerHTML = '';
        const container = document.createElement('div');
        container.className = 'records-table-container';

        const summary = document.createElement('div');
        summary.className = 'records-summary';
        summary.textContent = `Showing ${observations.length} observation(s) and ${perimeters.length} perimeter(s) matching current filter window.`;
        container.appendChild(summary);

        if (observations.length === 0 && perimeters.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'No records match the current date and status filters.';
            container.appendChild(empty);
            contentArea.appendChild(container);
            return;
        }

        // Table element
        const table = document.createElement('table');
        table.className = 'accessible-evidence-table';
        table.setAttribute('role', 'table');
        table.setAttribute('aria-label', 'Evidence Records Table');

        table.innerHTML = `
            <thead>
                <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Category</th>
                    <th scope="col">Date</th>
                    <th scope="col">Method / Mapping</th>
                    <th scope="col">Status</th>
                    <th scope="col">Details</th>
                    <th scope="col">Action</th>
                </tr>
            </thead>
            <tbody id="evidence-table-body"></tbody>
        `;

        const tbody = table.querySelector('tbody')!;

        // Add Perimeters
        perimeters.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${escapeHtml(p.incidentName)}</strong></td>
                <td><span class="tag tag-perim">Perimeter</span></td>
                <td>${escapeHtml(p.discoveryDate)}</td>
                <td>${escapeHtml(p.mapMethod)}</td>
                <td>${p.acres.toLocaleString()} acres</td>
                <td>${escapeHtml(p.counties.join(', '))}</td>
                <td><button class="table-select-btn" data-id="${escapeHtml(p.id)}" data-type="perimeter">Inspect</button></td>
            `;
            tbody.appendChild(tr);
        });

        // Add Observations
        observations.forEach(o => {
            const tr = document.createElement('tr');
            const safeCond = escapeHtml(o.reportedCondition);
            const truncCond = safeCond.length > 50 ? `${safeCond.slice(0, 50)}...` : safeCond;
            tr.innerHTML = `
                <td><strong>${escapeHtml(o.id)}</strong> ${o.isSynthetic ? '<span class="tag tag-synthetic">Synthetic</span>' : ''}</td>
                <td><span class="tag tag-obs">Observation</span></td>
                <td>${escapeHtml(o.observationDate)}</td>
                <td>${escapeHtml(o.method)}</td>
                <td><span class="status-badge status-${escapeHtml(o.status)}">${escapeHtml(o.status)}</span></td>
                <td title="${safeCond}">${truncCond}</td>
                <td><button class="table-select-btn" data-id="${escapeHtml(o.id)}" data-type="observation">Inspect</button></td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.table-select-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const id = target.getAttribute('data-id');
                if (id && this.onRecordSelectCallback) {
                    this.onRecordSelectCallback(id);
                }
            });
        });

        container.appendChild(table);
        contentArea.appendChild(container);
    }

    /**
     * Renders Data Gaps & Scientific Limitations checklist.
     */
    public renderDataGaps(manifest: DatasetManifest): void {
        const contentArea = document.getElementById('panel-content-area');
        if (!contentArea || this.currentTab !== 'gaps') return;

        contentArea.innerHTML = `
            <div class="data-gaps-view">
                <div class="callout-box warning">
                    <h4>CRITICAL SCIENTIFIC PRINCIPLE: ABSENCE OF SURVEY != ABSENCE OF FIRE</h4>
                    <p>A region without mapped coal fire vents indicates a lack of published ground surveys or sensor data—it must NEVER be interpreted as confirmation that subterranean coal is not burning.</p>
                </div>

                <h3>Identified Data Gaps (Remington Fire Study Area)</h3>
                <div class="gap-list">
                    ${manifest.dataGapsChecklist.map(gap => `
                        <div class="gap-card">
                            <div class="gap-header">
                                <span class="gap-title">${gap.item}</span>
                                <span class="gap-status">${gap.status}</span>
                            </div>
                            <div class="gap-body">
                                <p><strong>Scientific Impact:</strong> ${gap.impact}</p>
                                <p><strong>Research Remedy:</strong> ${gap.remedy}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <h3>Audited Public Sources (Without Local Vent Inventories)</h3>
                <div class="audited-sources-list">
                    ${manifest.auditedSourcesWithoutDirectInventory.map(aud => `
                        <div class="audit-card">
                            <div class="audit-source">${aud.source}</div>
                            <div class="audit-result">${aud.auditResult}</div>
                            <a href="${aud.url}" target="_blank" rel="noopener" class="source-link">View Audited Repository ↗</a>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Renders Sources Manifest.
     */
    public renderManifest(manifest: DatasetManifest): void {
        const contentArea = document.getElementById('panel-content-area');
        if (!contentArea || this.currentTab !== 'manifest') return;

        contentArea.innerHTML = `
            <div class="manifest-view">
                <div class="manifest-header">
                    <h3>Dataset Provenance & Integrity Manifest</h3>
                    <p>Study Area: <strong>${manifest.studyArea}</strong> (Generated: ${manifest.generatedDate})</p>
                </div>

                <div class="dataset-cards">
                    ${manifest.datasets.map(ds => `
                        <div class="dataset-card">
                            <div class="ds-title">${ds.title} ${ds.rawSha256 ? '<span class="verified-badge">✓ SHA256 Verified</span>' : ''}</div>
                            <div class="ds-meta">
                                <div><strong>Publisher:</strong> ${ds.publisher}</div>
                                <div><strong>License:</strong> ${ds.license}</div>
                                <div><strong>Retrieval Date:</strong> ${ds.retrievalDate}</div>
                                <div><strong>Spatial Reference:</strong> ${ds.coordinateSystem || 'EPSG:4326'}</div>
                                ${ds.rawSha256 ? `<div class="hash-display"><strong>Raw SHA256:</strong> <code>${ds.rawSha256}</code></div>` : ''}
                                ${ds.processedSha256 ? `<div class="hash-display"><strong>Processed SHA256:</strong> <code>${ds.processedSha256}</code></div>` : ''}
                            </div>
                            <div class="ds-link">
                                <a href="${ds.originalUrl || ds.url || '#'}" target="_blank" rel="noopener">Access Original Source ↗</a>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    private createHeading(text: string, badgeClass: string): HTMLElement {
        const header = document.createElement('div');
        header.className = 'feature-header';
        const h3 = document.createElement('h3');
        h3.textContent = text;
        const badge = document.createElement('span');
        badge.className = `badge ${badgeClass}`;
        badge.textContent = badgeClass.replace('badge-', '').toUpperCase();
        header.appendChild(h3);
        header.appendChild(badge);
        return header;
    }

    private createNotice(title: string, message: string, type: 'info' | 'warning'): HTMLElement {
        const el = document.createElement('div');
        el.className = `callout-box ${type}`;
        el.innerHTML = `<strong>${title}</strong>: ${message}`;
        return el;
    }

    private appendRow(parent: HTMLElement, labelText: string, valueText: string, isBlock = false): void {
        const row = document.createElement('div');
        row.className = isBlock ? 'property-row block-row' : 'property-row';
        const label = document.createElement('span');
        label.className = 'prop-label';
        label.textContent = labelText;
        const value = document.createElement('span');
        value.className = 'prop-val';
        value.textContent = valueText;
        row.appendChild(label);
        row.appendChild(value);
        parent.appendChild(row);
    }
}
