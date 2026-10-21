/** Accessible standalone intake panel. The owner publishes datasets through onDatasetChange. */
import { EvidenceImportStore, MAX_IMPORT_BYTES, originalRevisionBytes } from '../data/import.ts';
import type { ImportPreview, ImportOperationResult } from '../data/import.ts';
import type { PRBEvidenceDataset } from '../data/types.ts';
import { escapeHtml } from './EvidencePanel.ts';

export interface ImportPanelOptions {
    store: EvidenceImportStore;
    onDatasetChange: (dataset: PRBEvidenceDataset, result: ImportOperationResult) => void;
    sampleUrl?: string;
}

/** Pure rendering boundary, shared by the browser panel and the untrusted-text regression. */
export function renderImportPreview(preview: ImportPreview): string {
    const errorCount = preview.issues.length;
    const title = preview.valid ? ({ add: 'Ready to add', replace: 'Ready to replace the active revision', noop: 'Already imported', reject: 'Rejected' })[preview.action] : 'Package rejected';
    return `<h3>${escapeHtml(title)}</h3>
        <p>${preview.packageId ? `<strong>Package:</strong> ${escapeHtml(preview.packageId)}; ` : ''}${preview.revision !== undefined ? `revision ${escapeHtml(String(preview.revision))}. ` : ''}
        ${preview.isSynthetic === true ? '<strong>SYNTHETIC — no empirical evidence.</strong>' : preview.isSynthetic === false ? 'Local unreviewed reports.' : ''}</p>
        <p>${preview.counts.sources} source(s), ${preview.counts.sites} site(s), ${preview.counts.observations} observation(s), ${preview.counts.surveys} survey(s).</p>
        ${preview.sourceNames.length ? `<p><strong>Supplied attribution:</strong> ${preview.sourceNames.map(escapeHtml).join('; ')}</p>` : ''}
        <p>${errorCount} validation error${errorCount === 1 ? '' : 's'}; ${preview.warnings.length} notice${preview.warnings.length === 1 ? '' : 's'}.</p>
        ${errorCount ? `<ul>${preview.issues.map(issue => `<li><code>${escapeHtml(issue.path)}</code>: ${escapeHtml(issue.message)}</li>`).join('')}</ul>` : ''}
        ${preview.warnings.length ? `<ul>${preview.warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
        ${preview.sha256 ? `<p class="import-checksum"><strong>SHA-256 of original file bytes:</strong> <code>${escapeHtml(preview.sha256)}</code>. This identifies the imported file; it does not verify its source or claims.</p>` : ''}`;
}

let panelSequence = 0;

export class ImportPanel {
    private container: HTMLElement;
    private options: ImportPanelOptions;
    private controller = new AbortController();
    private preview: ImportPreview | null = null;
    private request = 0;
    private busy = false;
    private destroyed = false;
    private fileInput: HTMLInputElement;
    private applyButton: HTMLButtonElement;
    private resetButton: HTMLButtonElement;
    private archiveButton: HTMLButtonElement;
    private status: HTMLElement;
    private persistence: HTMLElement;
    private previewRegion: HTMLElement;
    private historyRegion: HTMLElement;

    constructor(container: HTMLElement, options: ImportPanelOptions) {
        this.container = container;
        this.options = options;
        const prefix = `prb-import-${++panelSequence}`;
        this.container.innerHTML = `<section class="import-panel" aria-label="Local evidence import">
            <h2>Local evidence imports</h2>
            <p>Preview a source-attributed JSON package, then apply it to this browser. Imported observations remain unreviewed reports. Synthetic examples stay in synthetic mode.</p>
            <p>Files you choose stay in this browser. Imported locations and claims require independent review. Use longitude, latitude coordinates in the package.</p>
            <p><a data-import-sample download="prbsim-synthetic-evidence-package.json">Download SYNTHETIC sample package</a></p>
            <label for="${prefix}-file">Evidence package (UTF-8 JSON, at most 2 MiB)</label>
            <input id="${prefix}-file" type="file" accept=".json,application/json" aria-describedby="${prefix}-storage" />
            <p id="${prefix}-storage" data-import-persistence></p>
            <p data-import-status role="status" aria-live="polite">Choose a package to preview. No records have been added.</p>
            <div data-import-preview role="region" aria-label="Package preview" tabindex="-1"></div>
            <div class="tool-actions">
                <button type="button" data-import-apply disabled>Apply previewed package</button>
                <button type="button" data-import-reset>Remove local imports</button>
            </div>
            <h3>Original package history</h3>
            <p>Download original revisions before clearing browser data. Removing local imports also removes their local revision history.</p>
            <div data-import-history></div>
            <button type="button" data-import-archive>Download saved archive for recovery</button>
        </section>`;
        this.fileInput = container.querySelector('input')!;
        this.applyButton = container.querySelector('[data-import-apply]')!;
        this.resetButton = container.querySelector('[data-import-reset]')!;
        this.archiveButton = container.querySelector('[data-import-archive]')!;
        this.status = container.querySelector('[data-import-status]')!;
        this.persistence = container.querySelector('[data-import-persistence]')!;
        this.previewRegion = container.querySelector('[data-import-preview]')!;
        this.historyRegion = container.querySelector('[data-import-history]')!;
        const sample = container.querySelector<HTMLAnchorElement>('[data-import-sample]')!;
        try {
            const url = new URL(options.sampleUrl ?? 'data/prb/templates/synthetic-evidence-package.json', document.baseURI);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
            sample.href = url.toString();
        } catch { sample.removeAttribute('href'); sample.textContent = 'Synthetic sample URL is unavailable.'; }

        this.fileInput.addEventListener('change', () => { void this.previewFile(); }, { signal: this.controller.signal });
        this.applyButton.addEventListener('click', () => { void this.applyPreview(); }, { signal: this.controller.signal });
        this.resetButton.addEventListener('click', () => { void this.resetImports(); }, { signal: this.controller.signal });
        this.archiveButton.addEventListener('click', () => {
            const archive = this.options.store.getSavedArchive();
            if (archive !== null) this.download(new Blob([archive], { type: 'application/json' }), 'prbsim-local-evidence-archive.json');
        }, { signal: this.controller.signal });
        this.historyRegion.addEventListener('click', event => {
            const button = (event.target as Element).closest<HTMLButtonElement>('button[data-import-revision]');
            if (!button) return;
            const revision = this.options.store.getHistory()[Number(button.dataset.importRevision)];
            if (!revision) return;
            try {
                const bytes = originalRevisionBytes(revision);
                this.download(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/json' }), `${revision.packageId}-revision-${revision.revision}.json`);
                this.status.textContent = `Downloaded original ${revision.packageId}, revision ${revision.revision}.`;
            } catch { this.status.textContent = 'Original bytes could not be downloaded. The saved archive may still be available for recovery.'; }
        }, { signal: this.controller.signal });
        this.refresh();
    }

    refresh(): void {
        if (this.destroyed) return;
        const persistence = this.options.store.getPersistence();
        this.persistence.textContent = `${persistence.status === 'persistent' ? 'Browser-local storage' : persistence.status === 'corrupt' ? 'Saved imports need recovery' : 'Session only'}: ${persistence.message}`;
        const history = this.options.store.getHistory();
        this.historyRegion.innerHTML = history.length ? `<ul>${history.map((revision, index) => `<li>
            ${escapeHtml(revision.packageId)}, revision ${revision.revision}, imported ${escapeHtml(revision.importedAt)}.
            <button type="button" data-import-revision="${index}">Download ${escapeHtml(revision.packageId)} revision ${revision.revision} original</button>
            </li>`).join('')}</ul>` : '<p>No local package revisions in this session.</p>';
        this.archiveButton.disabled = this.options.store.getSavedArchive() === null;
        this.applyButton.disabled = this.busy || this.preview?.valid !== true;
        this.resetButton.disabled = this.busy;
        this.fileInput.disabled = this.busy;
    }

    private async previewFile(): Promise<void> {
        const request = ++this.request;
        const file = this.fileInput.files?.[0];
        this.preview = null;
        this.applyButton.disabled = true;
        if (!file) return;
        this.status.textContent = 'Checking the package; active evidence is unchanged.';
        try {
            const preview = file.size > MAX_IMPORT_BYTES ? {
                valid: false, action: 'reject' as const, counts: { sources: 0, sites: 0, observations: 0, surveys: 0 }, sourceNames: [], warnings: [],
                issues: [{ path: 'package', message: 'File exceeds the 2 MiB import limit.' }]
            } : await this.options.store.preview(await file.arrayBuffer());
            if (request !== this.request || this.destroyed) return;
            this.preview = preview;
            this.previewRegion.innerHTML = renderImportPreview(preview);
            this.status.textContent = preview.valid ? 'Preview ready. Review the package details, then apply it explicitly.' : `Package rejected with ${preview.issues.length} validation error(s). No records were applied.`;
            this.refresh();
        } catch {
            if (request !== this.request || this.destroyed) return;
            this.status.textContent = 'The file could not be read. No records were applied; choose a readable JSON package.';
        }
    }

    private async applyPreview(): Promise<void> {
        if (!this.preview?.valid || this.busy) return;
        this.busy = true;
        this.refresh();
        const result = await this.options.store.apply(this.preview);
        if (this.destroyed) return;
        this.busy = false;
        this.status.textContent = `${result.message}${result.issues.length ? ` ${result.issues.map(issue => issue.message).join(' ')}` : ''}${result.persistence.status !== 'persistent' ? ` ${result.persistence.message}` : ''}`;
        if (result.ok) {
            this.preview = null;
            this.fileInput.value = '';
            this.previewRegion.replaceChildren();
            this.publish(result);
        }
        this.refresh();
    }

    private async resetImports(): Promise<void> {
        if (this.busy) return;
        ++this.request;
        this.busy = true;
        this.refresh();
        const result = await this.options.store.reset();
        if (this.destroyed) return;
        this.busy = false;
        this.preview = null;
        this.fileInput.value = '';
        this.previewRegion.replaceChildren();
        this.status.textContent = `${result.message}${result.persistence.status !== 'persistent' ? ` ${result.persistence.message}` : ''}`;
        this.publish(result);
        this.refresh();
    }

    private publish(result: ImportOperationResult): void {
        try { this.options.onDatasetChange(result.dataset, result); }
        catch { this.status.textContent += ' The local import state changed, but the main view could not refresh. The originals remain available here.'; }
    }
    private download(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    destroy(): void {
        this.destroyed = true;
        ++this.request;
        this.controller.abort();
        this.container.replaceChildren();
    }
}
