import {
    SATELLITE_CATALOG_URL, SATELLITE_COLLECTION, MAX_SATELLITE_RESULTS,
    SatelliteSearchError, SatelliteSearchSession, validateSatelliteQuery,
    type SatelliteBbox, type SatelliteQuery, type SatelliteScene,
    type SatelliteSearchResult
} from '../data/satellite.ts';

export interface SatellitePanelOptions {
    getCurrentBbox?: () => SatelliteBbox | null;
    initialQuery?: Partial<SatelliteQuery>;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}

export const DEFAULT_SATELLITE_QUERY: SatelliteQuery = {
    bbox: [-106.5, 44.75, -105.7, 45.5],
    startDate: '2024-08-01', endDate: '2024-10-01', maxCloudCover: 30, limit: 30
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function externalLink(label: string, url: string): HTMLAnchorElement {
    const link = el('a', label);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.referrerPolicy = 'no-referrer';
    return link;
}

/** Independent, accessible scene-discovery panel. No requests occur until form submission. */
export class SatellitePanel {
    private root: HTMLElement;
    private form: HTMLFormElement;
    private status: HTMLParagraphElement;
    private results: HTMLDivElement;
    private cancelButton: HTMLButtonElement;
    private inputs: Record<string, HTMLInputElement> = {};
    private session: SatelliteSearchSession;
    private generation = 0;
    private destroyed = false;

    constructor(container: HTMLElement | string, options: SatellitePanelOptions = {}) {
        const host = typeof container === 'string' ? document.getElementById(container) : container;
        if (!host) throw new Error('SatellitePanel container was not found.');
        const initial = validateSatelliteQuery({ ...DEFAULT_SATELLITE_QUERY, ...options.initialQuery });
        this.session = new SatelliteSearchSession({ fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs });
        this.root = el('section', undefined, 'research-tool satellite-panel');
        this.root.setAttribute('aria-label', 'Landsat scene discovery');
        this.root.append(el('h3', 'Landsat scene discovery'));
        this.root.append(el('p', 'Find Landsat Collection 2 Level-2 scenes intersecting a rectangular area and date window. This tool shows scene availability; it does not measure temperature or detect underground fires.', 'tool-note'));
        this.root.append(el('p', 'Scene cloud cover is not pixel-level usable ground coverage. Clouds, shadows, missing pixels and actual area coverage still require separate checks. No raster data are loaded.', 'tool-warning'));

        this.form = el('form', undefined, 'satellite-form');
        this.form.noValidate = true;
        const area = el('fieldset', undefined, 'tool-fields satellite-bounds');
        area.append(el('legend', 'Search area (longitude/latitude in degrees)'));
        this.addInput(area, 'west', 'West longitude', 'number', { min: '-180', max: '180', step: 'any' });
        this.addInput(area, 'south', 'South latitude', 'number', { min: '-90', max: '90', step: 'any' });
        this.addInput(area, 'east', 'East longitude', 'number', { min: '-180', max: '180', step: 'any' });
        this.addInput(area, 'north', 'North latitude', 'number', { min: '-90', max: '90', step: 'any' });
        this.form.append(area);

        const filters = el('fieldset', undefined, 'tool-fields satellite-filters');
        filters.append(el('legend', 'Dates and scene quality'));
        this.addInput(filters, 'startDate', 'Start date (UTC)', 'date');
        this.addInput(filters, 'endDate', 'End date (UTC)', 'date');
        this.addInput(filters, 'maxCloudCover', 'Maximum scene cloud cover (%)', 'number', { min: '0', max: '100', step: 'any' });
        this.addInput(filters, 'limit', 'Maximum scenes on this page', 'number', { min: '1', max: String(MAX_SATELLITE_RESULTS), step: '1' });
        this.form.append(filters);

        const actions = el('div', undefined, 'tool-actions');
        const find = el('button', 'Find scenes');
        find.type = 'submit';
        actions.append(find);
        this.cancelButton = el('button', 'Cancel search');
        this.cancelButton.type = 'button';
        this.cancelButton.disabled = true;
        this.cancelButton.addEventListener('click', () => this.cancel());
        actions.append(this.cancelButton);
        if (options.getCurrentBbox) {
            const mapBounds = el('button', 'Use current map bounds');
            mapBounds.type = 'button';
            mapBounds.addEventListener('click', () => {
                try {
                    const bbox = options.getCurrentBbox?.();
                    if (!bbox) { this.invalidate('Current map bounds are unavailable. Enter the bounds manually.'); return; }
                    this.setBbox(bbox);
                } catch {
                    this.invalidate('Current map bounds are unavailable or cross the antimeridian. Enter a valid rectangle manually.');
                }
            });
            actions.append(mapBounds);
        }
        const reset = el('button', 'Reset Remington example');
        reset.type = 'button';
        reset.addEventListener('click', () => {
            this.writeQuery(DEFAULT_SATELLITE_QUERY);
            this.invalidate('Remington example area and dates restored. Select Find scenes to search.');
        });
        actions.append(reset);
        this.form.append(actions);
        this.form.addEventListener('submit', event => { event.preventDefault(); void this.search(); });
        this.form.addEventListener('input', () => this.invalidate('Search inputs changed. Select Find scenes to refresh scene availability.'));
        this.root.append(this.form);

        this.status = el('p', 'Ready to search. The initial rectangle is an example area near Remington, not a survey footprint.', 'satellite-status');
        this.status.setAttribute('role', 'status');
        this.status.setAttribute('aria-live', 'polite');
        this.status.setAttribute('aria-atomic', 'true');
        this.status.dataset.state = 'ready';
        this.results = el('div', undefined, 'satellite-results');
        this.root.append(this.status, this.results);
        const attribution = el('p', undefined, 'tool-note satellite-attribution');
        attribution.append('Catalog: ', externalLink('Earth Search by Element 84', `${SATELLITE_CATALOG_URL}/collections/${SATELLITE_COLLECTION}`), '. Landsat data: USGS / NASA. ', externalLink('USGS product information', 'https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products'), '.');
        this.root.append(attribution);
        this.writeQuery(initial);
        host.replaceChildren(this.root);
    }

    private addInput(parent: HTMLElement, name: string, label: string, type: string, attributes: Record<string, string> = {}): void {
        const wrapper = el('label');
        wrapper.append(el('span', label));
        const input = el('input');
        input.type = type;
        input.name = name;
        input.required = true;
        for (const [key, value] of Object.entries(attributes)) input.setAttribute(key, value);
        this.inputs[name] = input;
        wrapper.append(input);
        parent.append(wrapper);
    }

    private writeQuery(query: SatelliteQuery): void {
        const [west, south, east, north] = query.bbox;
        for (const [key, value] of Object.entries({ west, south, east, north, startDate: query.startDate, endDate: query.endDate, maxCloudCover: query.maxCloudCover, limit: query.limit ?? 30 })) {
            this.inputs[key].value = String(value);
        }
    }

    public setBbox(bbox: SatelliteBbox): void {
        if (this.destroyed) return;
        const safe = validateSatelliteQuery({ ...DEFAULT_SATELLITE_QUERY, bbox }).bbox;
        ['west', 'south', 'east', 'north'].forEach((key, index) => { this.inputs[key].value = String(safe[index]); });
        this.invalidate('Search bounds updated. Select Find scenes to search the new area.');
    }

    public cancel(): void {
        if (!this.destroyed) this.invalidate('Scene search canceled. Select Find scenes to try again.');
    }

    /** Releases the active request when a dialog/tool is removed. */
    public destroy(): void {
        this.generation += 1;
        this.session.cancel();
        this.destroyed = true;
        this.root.remove();
    }

    private invalidate(message: string): void {
        this.generation += 1;
        this.session.cancel();
        this.setBusy(false);
        this.results.replaceChildren();
        this.setStatus(message, 'ready');
    }

    private setBusy(busy: boolean): void {
        this.cancelButton.disabled = !busy;
        this.results.setAttribute('aria-busy', String(busy));
    }

    private setStatus(message: string, state: string): void {
        this.status.textContent = message;
        this.status.dataset.state = state;
    }

    private async search(): Promise<void> {
        if (this.destroyed) return;
        this.invalidate('Checking search inputs…');
        const generation = this.generation;
        try {
            const query = validateSatelliteQuery({
                bbox: ['west', 'south', 'east', 'north'].map(key => this.inputs[key].valueAsNumber),
                startDate: this.inputs.startDate.value,
                endDate: this.inputs.endDate.value,
                maxCloudCover: this.inputs.maxCloudCover.valueAsNumber,
                limit: this.inputs.limit.valueAsNumber
            });
            this.setBusy(true);
            this.setStatus('Searching the public Landsat scene catalog…', 'loading');
            const result = await this.session.search(query);
            if (this.destroyed || generation !== this.generation) return;
            this.renderResult(result);
        } catch (error) {
            if (this.destroyed || generation !== this.generation) return;
            const message = error instanceof SatelliteSearchError ? error.message : error instanceof Error && error.name === 'AbortError' ? 'Scene search canceled.' : 'The scene search could not be completed. Try again.';
            this.setStatus(message, 'error');
        } finally {
            if (!this.destroyed && generation === this.generation) this.setBusy(false);
        }
    }

    private renderResult(result: SatelliteSearchResult): void {
        const { query, scenes } = result;
        this.results.replaceChildren();
        const count = scenes.length;
        if (count > 0) this.setStatus(`${count} valid scene record${count === 1 ? '' : 's'} matching this query on this page.`, 'results');
        else if (result.receivedCount === 0) this.setStatus('No scenes returned for this area, date window and cloud limit. Try a wider date window or a different scene cloud limit.', 'empty');
        else this.setStatus('No valid scene records on this page. Returned metadata was invalid, duplicated or outside the requested filters; this does not establish that no scenes exist.', 'empty');
        this.results.append(el('p', `Searched ${query.startDate} through ${query.endDate} (inclusive UTC); rectangle ${query.bbox.join(', ')}; scene cloud cover ≤ ${query.maxCloudCover}%.`));
        const matched = result.matchedCount === null ? 'The catalog did not report a total match count.' : `Catalog reports ${result.matchedCount} matching scene${result.matchedCount === 1 ? '' : 's'}.`;
        this.results.append(el('p', `${matched} This page is limited to ${query.limit} records. ${result.hasMore ? 'More records may be available; narrow the date window or area to inspect another subset.' : ''} Scene records are not checked for usable pixels.`));
        const excluded = result.rejectedCount + result.filteredCount + result.duplicateCount + result.omittedCount;
        if (excluded > 0) this.results.append(el('p', `Excluded on this page: ${result.rejectedCount} invalid records, ${result.filteredCount} outside requested filters, ${result.duplicateCount} duplicates, ${result.omittedCount} beyond the result limit.`, 'tool-warning'));
        if (!count) return;
        const wrapper = el('div', undefined, 'tool-table-scroll');
        wrapper.tabIndex = 0;
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', 'Scene results table; scroll horizontally for source links');
        const table = el('table', undefined, 'satellite-scenes');
        table.append(el('caption', 'Validated Landsat scene records — scene availability only'));
        const header = el('tr');
        for (const title of ['Acquisition (UTC)', 'Scene / platform', 'Scene cloud cover', 'Sources']) {
            const cell = el('th', title);
            cell.scope = 'col';
            header.append(cell);
        }
        const head = el('thead');
        head.append(header);
        const body = el('tbody');
        for (const scene of scenes) body.append(this.sceneRow(scene));
        table.append(head, body);
        wrapper.append(table);
        this.results.append(wrapper);
    }

    private sceneRow(scene: SatelliteScene): HTMLTableRowElement {
        const row = el('tr');
        const acquired = el('td');
        const time = el('time', new Date(scene.datetime).toISOString().replace('T', ' ').replace('Z', ' UTC'));
        time.dateTime = scene.datetime;
        acquired.append(time);
        const identity = el('td');
        identity.append(el('code', scene.id), el('div', scene.platform ?? 'Platform not reported'));
        const quality = el('td', `${scene.cloudCover}% (whole scene)`);
        const sources = el('td');
        sources.append(externalLink('Catalog scene metadata', scene.metadataUrl));
        for (const link of scene.providerLinks) sources.append(el('br'), externalLink(link.label, link.url));
        row.append(acquired, identity, quality, sources);
        return row;
    }
}
