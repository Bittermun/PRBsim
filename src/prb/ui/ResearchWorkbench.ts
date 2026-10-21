import { EvidenceImportStore, type ImportOperationResult } from '../data/import.ts';
import type { PRBEvidenceDataset } from '../data/types.ts';
import type { SatelliteBbox } from '../data/satellite.ts';
import { ImportPanel } from './ImportPanel.ts';
import { SatellitePanel } from './SatellitePanel.ts';
import { HeatLab } from './HeatLab.ts';
import './workbench.css';

interface ResearchWorkbenchOptions {
    trigger: HTMLButtonElement;
    store: EvidenceImportStore;
    onDatasetChange: (dataset: PRBEvidenceDataset, result: ImportOperationResult) => void;
    getCurrentBbox: () => SatelliteBbox | null;
    sampleUrl: string;
    onOpen?: () => void;
}

/** One modal research workspace. Tools retain their forms; leaving async tools cancels work. */
export class ResearchWorkbench {
    readonly dialog: HTMLDialogElement;
    private imports: ImportPanel;
    private satellite: SatellitePanel;
    private heat: HeatLab;
    private active = 0;
    private controller = new AbortController();

    constructor(private options: ResearchWorkbenchOptions) {
        this.dialog = document.createElement('dialog');
        this.dialog.className = 'research-workbench';
        this.dialog.setAttribute('aria-labelledby', 'research-workbench-title');
        this.dialog.innerHTML = `
            <header class="workbench-header">
                <div><h1 id="research-workbench-title">Research tools</h1>
                <p>Bring in evidence, find satellite scenes, and explore how heat moves.</p></div>
                <button type="button" class="workbench-close" aria-label="Close research tools">Close ×</button>
            </header>
            <div class="workbench-tabs" role="tablist" aria-label="Research tools">
                <button type="button" role="tab" id="tool-tab-imports" aria-controls="tool-panel-imports" aria-selected="true" tabindex="0">Imports</button>
                <button type="button" role="tab" id="tool-tab-satellite" aria-controls="tool-panel-satellite" aria-selected="false" tabindex="-1">Satellite scenes</button>
                <button type="button" role="tab" id="tool-tab-heat" aria-controls="tool-panel-heat" aria-selected="false" tabindex="-1">Heat lab</button>
            </div>
            <div class="workbench-body">
                <section role="tabpanel" id="tool-panel-imports" aria-labelledby="tool-tab-imports" tabindex="0"><div data-tool-imports></div><p data-workbench-evidence-note class="tool-note" role="status"></p></section>
                <section role="tabpanel" id="tool-panel-satellite" aria-labelledby="tool-tab-satellite" tabindex="0" hidden><div data-tool-satellite></div></section>
                <section role="tabpanel" id="tool-panel-heat" aria-labelledby="tool-tab-heat" tabindex="0" hidden><div data-tool-heat></div></section>
            </div>`;
        document.body.append(this.dialog);
        this.imports = new ImportPanel(this.dialog.querySelector('[data-tool-imports]')!, {
            store: options.store, onDatasetChange: options.onDatasetChange, sampleUrl: options.sampleUrl
        });
        this.satellite = new SatellitePanel(this.dialog.querySelector<HTMLElement>('[data-tool-satellite]')!, {
            getCurrentBbox: options.getCurrentBbox
        });
        this.heat = new HeatLab(this.dialog.querySelector<HTMLElement>('[data-tool-heat]')!);
        const events = { signal: this.controller.signal };
        options.trigger.addEventListener('click', () => this.open(), events);
        this.dialog.querySelector('.workbench-close')!.addEventListener('click', () => this.dialog.close(), events);
        this.dialog.addEventListener('close', () => {
            this.satellite.cancel();
            this.heat.cancel();
            options.trigger.focus();
        }, events);
        const tabs = Array.from(this.dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
        tabs.forEach((tab, index) => tab.addEventListener('click', () => this.select(index), events));
        this.dialog.addEventListener('keydown', event => {
            // Modal keystrokes must never operate the timeline underneath it.
            event.stopPropagation();
            const index = tabs.indexOf(event.target as HTMLButtonElement);
            if (index < 0) return;
            const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
                : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
            if (next < 0) return;
            event.preventDefault();
            this.select(next);
            tabs[next].focus();
        }, events);
        options.trigger.disabled = false;
    }

    open(): void {
        this.options.onOpen?.();
        this.imports.refresh();
        if (!this.dialog.open) this.dialog.showModal();
        this.dialog.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
    }

    setEvidenceNote(message: string): void {
        this.dialog.querySelector('[data-workbench-evidence-note]')!.textContent = message;
    }

    private select(index: number): void {
        if (index !== this.active) {
            if (this.active === 1) this.satellite.cancel();
            if (this.active === 2) this.heat.cancel();
        }
        this.active = index;
        this.dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((tab, i) => {
            tab.setAttribute('aria-selected', String(i === index));
            tab.tabIndex = i === index ? 0 : -1;
        });
        this.dialog.querySelectorAll<HTMLElement>('[role="tabpanel"]').forEach((panel, i) => { panel.hidden = i !== index; });
    }

    destroy(): void {
        this.controller.abort();
        this.imports.destroy();
        this.satellite.destroy();
        this.heat.destroy();
        this.dialog.remove();
    }
}
