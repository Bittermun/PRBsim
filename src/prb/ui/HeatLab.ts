import {
    DEFAULT_HEAT_PARAMETERS, HeatRunSession, validateHeatParameters,
    type HeatParameters, type HeatRun, type HeatSessionOptions,
} from '../data/heat.ts';

export interface HeatLabOptions extends HeatSessionOptions { initialParameters?: Partial<HeatParameters> }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
}
function escape(value: string): string {
    return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
// Significant digits keep small valid distances/times visible instead of rounding them to zero.
function number(value: number): string { return Number(value.toPrecision(8)).toString(); }
function temperature(value: number): string { return value.toFixed(2); }

/** One shared scale for both depth traces; the adjacent table is the full textual equivalent. */
export function renderHeatResults(run: HeatRun): string {
    const p = run.parameters;
    const width = 600, height = 260;
    const left = 63, right = width - 20, top = 24, bottom = height - 47;
    const depthTemperatures = run.samples.flatMap(sample => [sample.temperatureAC, sample.temperatureBC]);
    depthTemperatures.push(...run.depthSummary.map(summary => summary.peakTemperatureC));
    const lowest = Math.min(...depthTemperatures), highest = Math.max(...depthTemperatures);
    const padding = highest === lowest ? 0.5 : (highest - lowest) * 0.06;
    const roughTick = (highest - lowest + 2 * padding) / 6;
    const tickMagnitude = 10 ** Math.floor(Math.log10(roughTick));
    const tickFactor = [1, 2, 2.5, 5, 10].find(factor => factor >= roughTick / tickMagnitude)!;
    const tickStep = tickFactor * tickMagnitude;
    const minimum = Math.floor((lowest - padding) / tickStep) * tickStep;
    const maximum = Math.ceil((highest + padding) / tickStep) * tickStep;
    const y = (value: number): number => bottom - (value - minimum) / (maximum - minimum) * (bottom - top);
    const x = (value: number): number => left + value / p.durationHours * (right - left);
    const curve = (key: 'temperatureAC' | 'temperatureBC'): string => run.samples.map((sample, index) =>
        `${index ? 'L' : 'M'}${x(sample.timeHours).toFixed(2)},${y(sample[key]).toFixed(2)}`).join(' ');
    const temperatureTicks = Array.from({ length: Math.round((maximum - minimum) / tickStep) + 1 }, (_, index) => {
        const value = minimum + index * tickStep;
        return `<path d="M${left},${y(value)} H${right}" fill="none" stroke="currentColor" opacity="0.13"/>
            <text class="heat-temperature-tick" x="${left - 8}" y="${y(value) + 4}" text-anchor="end" fill="currentColor">${number(value)}</text>`;
    }).join('');
    const labels = `${temperatureTicks}<text x="${left}" y="${bottom + 20}" fill="currentColor">0</text>
        <text x="${right}" y="${bottom + 20}" text-anchor="end" fill="currentColor">${number(p.durationHours)}</text>
        <text x="${(left + right) / 2}" y="${height - 5}" text-anchor="middle" fill="currentColor">Time (hours)</text>
        <text x="16" y="${(top + bottom) / 2}" transform="rotate(-90 16 ${(top + bottom) / 2})" text-anchor="middle" fill="currentColor">Temperature (°C)</text>`;
    const summaryRows = run.depthSummary.map((summary, index) => `<tr><th scope="row">Depth ${index ? 'B' : 'A'}: ${number(summary.depthM)} m</th>
        <td>${temperature(summary.peakTemperatureC)} °C</td><td>${number(summary.peakTimeHours)} hours</td><td>${temperature(summary.finalTemperatureC)} °C</td></tr>`).join('');
    const sampleRows = run.samples.map(sample => `<tr><th scope="row">${number(sample.timeHours)}</th><td>${temperature(sample.temperatureAC)}</td><td>${temperature(sample.temperatureBC)}</td></tr>`).join('');
    const profileRows = run.finalProfile.map(point => `<tr><th scope="row">${number(point.depthM)}</th><td>${temperature(point.temperatureC)}</td></tr>`).join('');
    return `<h3>Illustrative heat comparison</h3>
        <p class="tool-warning">${escape(run.scope)}</p>
        <p>Depth A: ${number(p.depthAM)} m (solid line). Depth B: ${number(p.depthBM)} m (dashed line). Both traces use the same temperature scale.</p>
        <p>Temperature axis for the two depths: ${number(minimum)} to ${number(maximum)} °C. The range follows the calculated depth temperatures.</p>
        <p>Imposed surface pulse: ${number(p.surfaceC)} °C for ${number(p.pulseHours)} hours, then ${number(p.ambientC)} °C.</p>
        <svg class="heat-chart" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Temperature over time at both comparison depths">
            <title>Conduction at depths ${number(p.depthAM)} and ${number(p.depthBM)} metres, using one shared temperature scale fitted to the calculated depth results. The imposed surface temperature is stated separately. Read the sampled values below.</title>
            <path d="M${left},${top} V${bottom} H${right}" fill="none" stroke="currentColor" opacity="0.7"/>
            ${labels}
            <path data-heat-series="A" d="${curve('temperatureAC')}" fill="none" stroke="var(--heat-series-a, #8a3a00)" stroke-width="3"/>
            <path data-heat-series="B" d="${curve('temperatureBC')}" fill="none" stroke="var(--heat-series-b, #005d73)" stroke-width="3" stroke-dasharray="7 5"/>
        </svg>
        <div class="tool-table-scroll"><table aria-label="Depth comparison summary"><thead><tr><th scope="col">Depth</th><th scope="col">Highest temperature</th><th scope="col">Time of highest value</th><th scope="col">Final temperature</th></tr></thead><tbody>${summaryRows}</tbody></table></div>
        <p>Highest values use every calculated time step. The tables and chart show sampled times; displayed numbers are rounded. The JSON download retains the full calculated values.</p>
        ${run.warnings.map(warning => `<p class="tool-warning">${escape(warning)}</p>`).join('')}
        <details><summary>Sampled temperatures at both depths</summary><div class="tool-table-scroll"><table aria-label="Sampled temperatures at both depths"><thead><tr><th scope="col">Time (hours)</th><th scope="col">Depth A (°C)</th><th scope="col">Depth B (°C)</th></tr></thead><tbody>${sampleRows}</tbody></table></div></details>
        <details><summary>Final temperature profile</summary><div class="tool-table-scroll"><table aria-label="Final temperature profile"><thead><tr><th scope="col">Depth (m)</th><th scope="col">Temperature (°C)</th></tr></thead><tbody>${profileRows}</tbody></table></div></details>
        <details><summary>Assumptions and calculation settings</summary><ul>${run.assumptions.map(assumption => `<li>${escape(assumption)}</li>`).join('')}</ul>
            <p>${escape(run.numerics.boundaryConvention)} ${escape(run.numerics.depthSampling)}</p>
            <p>Grid spacing: ${number(run.numerics.spatialStepM)} m. Maximum step: ${number(run.numerics.maxTimeStepSeconds)} seconds. Calculated steps: ${run.numerics.timeStepCount}. Method: ${escape(run.methodVersion)}.</p>
        </details>`;
}

/** Standalone, local-only first-stage lab. Workers are created only after a run is requested. */
export class HeatLab {
    private root: HTMLElement;
    private form: HTMLFormElement;
    private status: HTMLParagraphElement;
    private results: HTMLDivElement;
    private cancelButton: HTMLButtonElement;
    private downloadButton: HTMLButtonElement;
    private inputs: Partial<Record<keyof HeatParameters, HTMLInputElement>> = {};
    private session: HeatRunSession;
    private displayedRun: HeatRun | null = null;
    private generation = 0;
    private running = false;
    private destroyed = false;

    constructor(container: HTMLElement | string, options: HeatLabOptions = {}) {
        const host = typeof container === 'string' ? document.getElementById(container) : container;
        if (!host) throw new Error('HeatLab container was not found.');
        const initial = validateHeatParameters({ ...DEFAULT_HEAT_PARAMETERS, ...options.initialParameters });
        this.session = new HeatRunSession(options);
        this.root = el('section', undefined, 'research-tool heat-lab');
        this.root.setAttribute('aria-label', 'Illustrative heat conduction lab');
        this.root.append(el('h3', 'How a surface heat pulse spreads downward'));
        this.root.append(el('p', 'Compare temperatures at two depths in a simple column of ground. Heat moves by conduction: warmer material transfers heat to cooler material.', 'tool-note'));
        this.root.append(el('p', 'Stage one: conduction only. These settings are illustrative, not measurements from the project area. This model does not simulate burning coal, oxygen, moisture or ignition, and cannot predict whether a real underground fire starts.', 'tool-warning'));
        this.form = el('form', undefined, 'heat-form');
        this.form.noValidate = true;
        const physics = el('fieldset', undefined, 'tool-fields heat-physics');
        physics.append(el('legend', 'Heat and time'));
        this.addInput(physics, 'diffusivityM2PerS', 'Thermal diffusivity (m²/s)', '0.000000000001', '0.01');
        this.addInput(physics, 'ambientC', 'Initial ground temperature (°C)', '-273.15', '2000');
        this.addInput(physics, 'surfaceC', 'Surface pulse temperature (°C)', '-273.15', '2000');
        this.addInput(physics, 'pulseHours', 'Surface pulse duration (hours)', '0', '720');
        this.addInput(physics, 'durationHours', 'Run duration (hours)', '0.000001', '720');
        this.form.append(physics);
        this.form.append(el('p', 'Thermal diffusivity describes how quickly a temperature change spreads through material. The surface is held at the pulse temperature, then returned to the initial temperature.', 'tool-note'));
        const geometry = el('fieldset', undefined, 'tool-fields heat-geometry');
        geometry.append(el('legend', 'Depth comparison and calculation detail'));
        this.addInput(geometry, 'depthAM', 'Depth A (m)', '0', '1000');
        this.addInput(geometry, 'depthBM', 'Depth B (m)', '0', '1000');
        this.addInput(geometry, 'domainDepthM', 'Model depth (m)', '0.001', '1000');
        this.addInput(geometry, 'nodes', 'Depth grid points', '21', '401', '1');
        this.form.append(geometry);
        this.form.append(el('p', 'The bottom of the model stays at the initial temperature. More grid points give finer depth detail and require more work. Increase model depth and grid detail separately to check whether a result changes.', 'tool-note'));
        const actions = el('div', undefined, 'tool-actions');
        const runButton = el('button', 'Run heat comparison'); runButton.type = 'submit';
        this.cancelButton = el('button', 'Cancel heat run'); this.cancelButton.type = 'button'; this.cancelButton.disabled = true;
        this.downloadButton = el('button', 'Download heat run JSON'); this.downloadButton.type = 'button'; this.downloadButton.disabled = true;
        this.downloadButton.dataset.heatDownload = '';
        const reset = el('button', 'Reset illustrative example'); reset.type = 'button';
        actions.append(runButton, this.cancelButton, this.downloadButton, reset);
        this.form.append(actions);
        this.status = el('p', 'Ready. No run has been calculated.', 'tool-status');
        this.status.dataset.heatStatus = '';
        this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
        this.results = el('div', undefined, 'heat-results'); this.results.dataset.heatResults = '';
        this.results.tabIndex = -1;
        this.results.setAttribute('role', 'region'); this.results.setAttribute('aria-label', 'Heat comparison results');
        this.root.append(this.form, this.status, this.results);
        host.append(this.root);
        this.setInputs(initial);
        this.form.addEventListener('submit', event => { event.preventDefault(); void this.run(); });
        this.form.addEventListener('input', () => this.invalidate('Settings changed. Run the comparison to calculate these values.'));
        this.cancelButton.addEventListener('click', () => this.cancel());
        this.downloadButton.addEventListener('click', () => this.download());
        reset.addEventListener('click', () => { this.invalidate('Illustrative settings restored. Run the comparison when ready.'); this.setInputs(DEFAULT_HEAT_PARAMETERS); });
    }

    private addInput(parent: HTMLElement, key: keyof HeatParameters, label: string, min: string, max: string, step = 'any'): void {
        const wrapper = el('label', label);
        const input = el('input'); input.type = 'number'; input.name = key; input.min = min; input.max = max; input.step = step; input.required = true;
        wrapper.append(input); parent.append(wrapper); this.inputs[key] = input;
    }

    private setInputs(parameters: Readonly<HeatParameters>): void {
        for (const key of Object.keys(DEFAULT_HEAT_PARAMETERS) as (keyof HeatParameters)[]) this.inputs[key]!.value = String(parameters[key]);
    }

    private setRunning(running: boolean): void {
        this.running = running; this.cancelButton.disabled = !running;
        this.form.setAttribute('aria-busy', String(running));
    }

    private invalidate(message: string): void {
        this.cancel(); this.displayedRun = null; this.downloadButton.disabled = true;
        this.results.replaceChildren(); this.status.textContent = message;
    }

    private async run(): Promise<void> {
        if (this.destroyed) return;
        this.invalidate('Checking heat settings…');
        const generation = ++this.generation;
        try {
            const parameters = {} as HeatParameters;
            for (const key of Object.keys(DEFAULT_HEAT_PARAMETERS) as (keyof HeatParameters)[]) {
                if (!this.inputs[key]!.value.trim()) throw new Error('Complete every heat setting before running the comparison.');
                parameters[key] = Number(this.inputs[key]!.value);
            }
            validateHeatParameters(parameters);
            this.setRunning(true); this.status.textContent = 'Calculating conduction at both depths…';
            const run = await this.session.run(parameters);
            if (this.destroyed || generation !== this.generation) return;
            this.displayedRun = run; this.results.innerHTML = renderHeatResults(run);
            this.downloadButton.disabled = false;
            this.status.textContent = `Heat comparison complete. ${run.samples.length} sampled times; conduction only.`;
            this.results.focus({ preventScroll: true });
        } catch (error) {
            if (this.destroyed || generation !== this.generation) return;
            this.status.textContent = error instanceof Error && error.name === 'AbortError' ? 'Heat run cancelled. No partial result was saved.' : error instanceof Error ? error.message : 'Heat run failed.';
        } finally {
            if (!this.destroyed && generation === this.generation) this.setRunning(false);
        }
    }

    private download(): void {
        if (!this.displayedRun || this.destroyed) return;
        const url = URL.createObjectURL(new Blob([JSON.stringify(this.displayedRun, null, 2)], { type: 'application/json' }));
        const link = el('a'); link.href = url;
        link.download = `prbsim-illustrative-heat-${this.displayedRun.createdAt.replace(/[:.]/g, '-')}.json`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    cancel(): void {
        this.generation++; this.session.cancel();
        if (this.running) this.status.textContent = 'Heat run cancelled. No partial result was saved.';
        this.setRunning(false);
    }

    destroy(): void {
        if (this.destroyed) return;
        this.cancel(); this.destroyed = true; this.displayedRun = null; this.root.remove();
    }
}
