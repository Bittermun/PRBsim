import { loadObservationRelease, observationLayerUrl, type ObservationRelease } from '../data/observation-publication.ts';
import { escapeHtml } from './EvidencePanel.ts';

export class PublishedObservationPanel {
    private readonly url: HTMLInputElement;
    private readonly button: HTMLButtonElement;
    private readonly status: HTMLElement;
    private readonly result: HTMLElement;
    private readonly events = new AbortController();
    private request: AbortController | null = null;
    private active: { url: URL; data: ObservationRelease } | null = null;

    constructor(
        element: HTMLElement,
        exampleUrl: string,
        private onRelease: (data: ObservationRelease) => void,
    ) {
        element.innerHTML = `
            <h2>Published observations</h2>
            <form class="tool-form">
                <label for="published-observations-url">Layer URL</label>
                <input id="published-observations-url" type="url" required>
                <button type="submit">Reload layer</button>
            </form>
            <p>The purple layer shows this release across all observation dates. To see the sample on the map, enable Synthetic Validation Fixtures on the timeline.</p>
            <p class="tool-status" role="status">Load the sample or enter a publication URL.</p>
            <section data-publication-result aria-label="Current release"></section>`;
        this.url = element.querySelector('input')!;
        this.url.value = exampleUrl;
        this.button = element.querySelector('button')!;
        this.status = element.querySelector('[role=status]')!;
        this.result = element.querySelector('[data-publication-result]')!;
        element.querySelector('form')!.addEventListener('submit', event => {
            event.preventDefault();
            void this.reload();
        }, { signal: this.events.signal });
    }

    private async reload(): Promise<void> {
        this.request?.abort();
        const request = new AbortController();
        this.request = request;
        this.button.disabled = true;
        this.status.textContent = 'Loading published observations…';
        const timeout = setTimeout(() => request.abort(), 15000);
        try {
            const url = observationLayerUrl(this.url.value.trim());
            const data = await loadObservationRelease(url, request.signal);
            if (this.request !== request || request.signal.aborted) return;
            if (this.active?.url.href === url.href) {
                const old = this.active.data.release;
                if (data.release.layerId !== old.layerId || data.release.isSynthetic !== old.isSynthetic
                    || data.release.revision < old.revision
                    || (data.release.revision === old.revision && JSON.stringify(data) !== JSON.stringify(this.active.data))) {
                    throw new Error('The same URL returned a different layer, a rollback, or a changed immutable revision.');
                }
            }
            this.active = { url, data };
            this.onRelease(data);
            this.render();
            const count = data.features.length;
            this.status.textContent = `Loaded revision ${data.release.revision}. ${count} ${count === 1 ? 'observation' : 'observations'}.`;
        } catch (error) {
            if (this.request === request) {
                const message = request.signal.aborted ? 'The layer request timed out.' : error instanceof Error ? error.message : 'Request failed.';
                this.status.textContent = message + (this.active ? ' The last loaded release is still displayed.' : '');
            }
        } finally {
            clearTimeout(timeout);
            if (this.request === request) {
                this.request = null;
                this.button.disabled = false;
            }
        }
    }

    private render(): void {
        const { url, data } = this.active!;
        const release = data.release;
        const archive = (revision: number) => escapeHtml(new URL(`releases/${revision}.geojson`, url).href);
        this.result.innerHTML = `
            <h3>${escapeHtml(release.layerId)} · revision ${release.revision}</h3>
            <p>${release.isSynthetic ? '<strong>Synthetic demonstration</strong> · ' : ''}Released ${release.releasedOn}</p>
            <p><a href="${archive(release.revision)}">Archive for revision ${release.revision}</a>
            ${release.previous ? ` · <a href="${archive(release.previous.revision)}">Previous revision</a>` : ''}</p>
            ${data.features.length ? `<div class="tool-table-scroll"><table class="tool-table">
                <thead><tr><th>Observation</th><th>Event date</th><th>Source and license</th><th>Review</th><th>Location uncertainty</th></tr></thead>
                <tbody>${data.features.map(({ properties: p }) => `
                    <tr><td>${escapeHtml(p.label)}<br><small>${escapeHtml(p.recordId)}</small></td>
                    <td>${p.observationDate} (${p.datePrecision})</td>
                    <td><a href="${escapeHtml(p.sourceUrl)}">${escapeHtml(p.sourceName)}</a><br>${escapeHtml(p.license)}</td>
                    <td>${p.reviewStatus === 'synthetic' ? 'Synthetic' : 'Unreviewed'}</td>
                    <td>${p.accuracyMeters === null ? 'Unknown' : `${p.accuracyMeters} m`}</td></tr>`).join('')}</tbody></table></div>` : '<p>This release has no current observations.</p>'}
            ${release.changes.length ? `<h4>Changes in this revision</h4><ul>${release.changes.map(change =>
                `<li>${escapeHtml(change.recordId)} · ${change.action} · ${escapeHtml(change.reason)}</li>`).join('')}</ul>` : ''}`;
    }

    cancel(): void {
        this.request?.abort();
        this.request = null;
        this.button.disabled = false;
        if (this.status.textContent === 'Loading published observations…') this.status.textContent = 'Layer request canceled.';
    }

    destroy(): void {
        this.cancel();
        this.events.abort();
    }
}
