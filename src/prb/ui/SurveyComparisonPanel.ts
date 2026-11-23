import { compareSurveys, type CoverageRegion, type SurveyComparison, type SurveyImportReferences } from '../data/survey-comparison.ts';
import type { PRBEvidenceDataset, SurveyCoverageRecord } from '../data/types.ts';
import { escapeHtml } from './EvidencePanel.ts';
import reportStyles from './survey-report.css?inline';
import './survey-report.css';

const regionLabels: Record<CoverageRegion, string> = {
    both: 'Surveyed on both dates',
    baseline_only: 'Baseline footprint only',
    followup_only: 'Follow-up footprint only'
};
const resultLabels = {
    anomalies_detected: 'Survey reported anomalies',
    no_thermal_anomaly_detected: 'Survey reported no thermal anomaly',
    outside_footprint: 'Unknown (outside the reported footprint)',
    pending: 'Follow-up pending'
};

function renderCoverageMap(regions: SurveyComparison['regions']): string {
    let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
    for (const { geometry } of regions) for (const polygon of geometry.coordinates) for (const ring of polygon) {
        for (const [lon, lat] of ring) {
            west = Math.min(west, lon);
            east = Math.max(east, lon);
            south = Math.min(south, lat);
            north = Math.max(north, lat);
        }
    }
    const width = 720, height = 245;
    const longitudeScale = Math.cos((south + north) * Math.PI / 360);
    const scale = Math.min((width - 32) / ((east - west) * longitudeScale), (height - 32) / (north - south));
    const point = ([lon, lat]: number[]) => {
        const x = width / 2 + (lon - (west + east) / 2) * scale * longitudeScale;
        const y = height / 2 - (lat - (south + north) / 2) * scale;
        return `${x.toFixed(3)} ${y.toFixed(3)}`;
    };
    const paths = regions.map(({ kind, geometry }) => {
        const path = geometry.coordinates.flatMap(polygon => polygon.map(ring => `M ${ring.map(point).join(' L ')} Z`)).join(' ');
        return `<path class="survey-region ${kind}" d="${path}"/>`;
    }).join('');
    return `<svg class="survey-map" viewBox="0 0 ${width} ${height}" role="img" aria-label="North-up map of the reported survey footprints">${paths}</svg>`;
}

function renderSurveySource(input: SurveyComparison['baseline']): string {
    const { record, source, originalPackage, reviewStatus } = input;
    return `<section class="survey-source">
        <h3>${escapeHtml(record.surveyDate)} · ${escapeHtml(record.surveyName)}</h3>
        <p><strong>${reviewStatus === 'local_unreviewed' ? 'Local unreviewed report' : 'Source-attributed report'}</strong>
            · ${escapeHtml(record.method)}</p>
        ${record.notes ? `<p>${escapeHtml(record.notes)}</p>` : ''}
        <p>${escapeHtml(source.name)} · ${escapeHtml(source.publisher)} · ${escapeHtml(source.license)}
            · retrieved ${escapeHtml(source.retrievalDate)}<br>${escapeHtml(source.url)}</p>
        <p>${escapeHtml(source.spatialAccuracy)} · ${escapeHtml(source.limitations)}</p>
        <p>Survey ID <code>${escapeHtml(record.id)}</code><br>Source ID <code>${escapeHtml(source.id)}</code></p>
        ${originalPackage ? `<p>Package ${escapeHtml(originalPackage.packageId)}, revision ${originalPackage.revision}<br>
            SHA-256 of original package <code>${escapeHtml(originalPackage.sha256)}</code></p>` : ''}
    </section>`;
}

function renderReport(report: SurveyComparison): string {
    const { baseline, followup, regions } = report;
    return `<article class="survey-report">
        <h2>${report.isSynthetic ? 'Synthetic survey comparison' : 'Survey coverage record'}</h2>
        <p class="survey-dates">${escapeHtml(baseline.record.surveyDate)} · ${followup ? escapeHtml(followup.record.surveyDate) : 'Comparison pending'}</p>
        ${report.isSynthetic ? '<p><strong>Synthetic example.</strong> Locations and observations are fictional.</p>' : ''}
        <p class="survey-question">${escapeHtml(report.inspectionQuestion)}</p>
        ${renderCoverageMap(regions)}
        <table aria-label="Coverage and reported results">
            <thead><tr><th scope="col">Reported coverage</th><th scope="col">${escapeHtml(baseline.record.surveyDate)}</th>
            <th scope="col">${followup ? escapeHtml(followup.record.surveyDate) : 'Follow-up'}</th></tr></thead>
            <tbody>${regions.map(({ kind, baseline, followup }) => `<tr data-region="${kind}">
                <th scope="row"><span aria-hidden="true" class="survey-swatch ${kind}"></span>${regionLabels[kind]}</th>
                <td>${resultLabels[baseline]}</td><td>${resultLabels[followup]}</td></tr>`).join('')}</tbody>
        </table>
        <p>${escapeHtml(report.method)}</p>
        <div class="survey-sources">${renderSurveySource(baseline)}
        ${followup ? renderSurveySource(followup) : ''}</div>
    </article>`;
}

function download(data: string, type: string, filename: string): void {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface SurveyContext {
    dataset: PRBEvidenceDataset;
    includeSynthetic: boolean;
    references: SurveyImportReferences;
}

export class SurveyComparisonPanel {
    private readonly controller = new AbortController();
    private readonly before: HTMLSelectElement;
    private readonly after: HTMLSelectElement;
    private readonly notice: HTMLElement;
    private readonly content: HTMLElement;
    private readonly html: HTMLButtonElement;
    private readonly json: HTMLButtonElement;
    private report: SurveyComparison | null = null;

    constructor(container: HTMLElement, private readonly getContext: () => SurveyContext, sampleUrl: string) {
        container.innerHTML = `<h2>Compare survey coverage</h2>
            <p>Choose a dated baseline and an optional later survey. The comparison uses the selected records and their reported footprints.</p>
            <p><a data-survey-sample download="synthetic-survey-comparison.json">Download the synthetic two-survey example</a> and apply it in Imports to try the report.</p>
            <div class="tool-fields survey-selectors">
                <label>Baseline survey <select data-survey-baseline></select></label>
                <label>Follow-up survey <select data-survey-followup></select></label>
            </div>
            <p data-survey-notice role="status"></p>
            <div data-survey-report></div>
            <div class="tool-actions">
                <button type="button" data-survey-html disabled>Download printable report</button>
                <button type="button" data-survey-json disabled>Download comparison JSON</button>
            </div>`;
        container.querySelector<HTMLAnchorElement>('[data-survey-sample]')!.href = sampleUrl;
        this.before = container.querySelector('[data-survey-baseline]')!;
        this.after = container.querySelector('[data-survey-followup]')!;
        this.notice = container.querySelector('[data-survey-notice]')!;
        this.content = container.querySelector('[data-survey-report]')!;
        this.html = container.querySelector('[data-survey-html]')!;
        this.json = container.querySelector('[data-survey-json]')!;
        const eventOptions = { signal: this.controller.signal };
        this.before.addEventListener('change', () => this.refresh(), eventOptions);
        this.after.addEventListener('change', () => this.refresh(), eventOptions);
        this.html.addEventListener('click', () => {
            if (!this.report) return;
            download(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
                <title>PRBsim survey coverage record</title><style>
                body { font: 15px/1.5 system-ui,sans-serif; color: #17212c; margin: 28px auto; padding: 0 16px; max-width: 800px; }
                @media print { body { margin: 0; padding: 0; } }
                ${reportStyles}</style><main>${renderReport(this.report)}</main></html>`,
                'text/html;charset=utf-8', 'prbsim-survey-report.html');
        }, eventOptions);
        this.json.addEventListener('click', () => {
            if (this.report) download(JSON.stringify(this.report, null, 2) + '\n', 'application/json', 'prbsim-survey-comparison.json');
        }, eventOptions);
    }

    refresh(): void {
        const { dataset, includeSynthetic, references } = this.getContext();
        const surveys = dataset.surveys.filter(survey => includeSynthetic || !survey.isSynthetic)
            .sort((a, b) => a.surveyDate.localeCompare(b.surveyDate) || a.surveyName.localeCompare(b.surveyName));
        const baseline = this.select(this.before, surveys, references, 'Choose a baseline');
        const candidates = baseline ? surveys.filter(survey =>
            survey.isSynthetic === baseline.isSynthetic && survey.surveyDate > baseline.surveyDate) : [];
        const followup = this.select(this.after, candidates, references, 'No follow-up selected');
        this.report = null;
        this.content.replaceChildren();
        if (!baseline) {
            this.notice.textContent = surveys.length
                ? 'Select a baseline to open the report.'
                : 'No surveys in this mode. Apply an evidence package in Imports. For the synthetic example, enable Synthetic Validation Fixtures on the timeline.';
        } else {
            const sources = new Map([...dataset.manifest.datasets, ...(dataset.syntheticSources ?? [])].map(source => [source.id, source]));
            try {
                const report = compareSurveys(baseline, followup, sources, references);
                this.content.innerHTML = renderReport(report);
                this.report = report;
                this.notice.textContent = report.status === 'comparison_pending' ? 'Select a later survey when one is available.' : '';
            } catch (error) {
                this.notice.textContent = error instanceof Error ? error.message : 'The survey footprints could not be compared.';
            }
        }
        this.html.disabled = this.json.disabled = !this.report;
    }

    private select(element: HTMLSelectElement, surveys: SurveyCoverageRecord[], references: SurveyImportReferences, placeholder: string): SurveyCoverageRecord | null {
        const selected = surveys.find(survey => survey.id === element.value) ?? null;
        element.replaceChildren(new Option(placeholder, ''), ...surveys.map(survey =>
            new Option(`${survey.surveyDate} · ${references.get(survey.id)?.surveyName ?? survey.surveyName}`, survey.id)));
        element.disabled = !surveys.length;
        element.value = selected?.id ?? '';
        return selected;
    }

    destroy(): void { this.controller.abort(); }
}
