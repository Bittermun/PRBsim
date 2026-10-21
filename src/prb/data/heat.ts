/** A bounded first-stage heat-equation demonstration. No reaction or ignition physics. */
export interface HeatParameters {
    diffusivityM2PerS: number;
    ambientC: number;
    surfaceC: number;
    pulseHours: number;
    durationHours: number;
    depthAM: number;
    depthBM: number;
    domainDepthM: number;
    nodes: number;
}

export const DEFAULT_HEAT_PARAMETERS: Readonly<HeatParameters> = Object.freeze({
    diffusivityM2PerS: 1e-6, ambientC: 15, surfaceC: 500, pulseHours: 2,
    durationHours: 24, depthAM: 0.25, depthBM: 1, domainDepthM: 3, nodes: 121,
});
export const HEAT_METHOD_VERSION = 'conduction-1d-explicit-v1';
// More conservative than the 0.5 stability limit to reduce time-discretization error.
const FOURIER_LIMIT = 0.2;
const MAX_UPDATES = 50_000_000;
const OUTPUT_INTERVALS = 96;

export interface HeatSample { timeHours: number; temperatureAC: number; temperatureBC: number }
export interface HeatDepthSummary {
    depthM: number;
    peakTemperatureC: number;
    peakTimeHours: number;
    finalTemperatureC: number;
}
export interface HeatRun {
    kind: 'illustrative_heat_transport';
    methodVersion: typeof HEAT_METHOD_VERSION;
    createdAt: string;
    scope: string;
    parameters: Readonly<HeatParameters>;
    numerics: {
        method: string;
        spatialStepM: number;
        maxTimeStepSeconds: number;
        timeStepCount: number;
        fourierLimit: number;
        boundaryConvention: string;
        depthSampling: string;
    };
    assumptions: readonly string[];
    warnings: readonly string[];
    samples: readonly HeatSample[];
    depthSummary: readonly HeatDepthSummary[];
    finalProfile: readonly { depthM: number; temperatureC: number }[];
}

export class HeatCancelledError extends Error {
    constructor() { super('Heat run cancelled.'); this.name = 'AbortError'; }
}

/** Validation also bounds the computational work before any worker is allocated. */
export function validateHeatParameters(input: HeatParameters): HeatParameters {
    if (!input || typeof input !== 'object') throw new Error('Heat parameters are required.');
    const values = {} as HeatParameters;
    for (const key of Object.keys(DEFAULT_HEAT_PARAMETERS) as (keyof HeatParameters)[]) {
        const value = input[key];
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} must be a finite number.`);
        values[key] = value;
    }
    if (values.diffusivityM2PerS < 1e-12 || values.diffusivityM2PerS > 0.01)
        throw new Error('Thermal diffusivity must be between 1e-12 and 0.01 m²/s.');
    if ([values.ambientC, values.surfaceC].some(value => value < -273.15 || value > 2000))
        throw new Error('Temperatures must be between −273.15 and 2000 °C. This input range does not imply physical validity.');
    if (values.durationHours <= 0 || values.durationHours > 720)
        throw new Error('Run duration must be greater than zero and at most 720 hours.');
    if (values.pulseHours < 0 || values.pulseHours > values.durationHours)
        throw new Error('Surface pulse duration must be between zero and the run duration.');
    if (values.domainDepthM < 0.001 || values.domainDepthM > 1000)
        throw new Error('Model depth must be between 0.001 and 1000 m.');
    if ([values.depthAM, values.depthBM].some(value => value < 0 || value > values.domainDepthM))
        throw new Error('Both comparison depths must lie between the surface and model depth.');
    if (!Number.isInteger(values.nodes) || values.nodes < 21 || values.nodes > 401)
        throw new Error('Depth grid points must be a whole number between 21 and 401.');
    const spacing = values.domainDepthM / (values.nodes - 1);
    const maxStep = FOURIER_LIMIT * spacing * spacing / values.diffusivityM2PerS;
    const upperSteps = Math.ceil(values.durationHours * 3600 / maxStep) + OUTPUT_INTERVALS + 3;
    if (!Number.isFinite(upperSteps) || upperSteps * values.nodes > MAX_UPDATES)
        throw new Error('This mesh and duration require too much work. Use fewer grid points, a deeper model, or a shorter run.');
    return values;
}

function frozenRun(run: HeatRun): HeatRun {
    Object.freeze(run.parameters);
    Object.freeze(run.numerics);
    for (const row of run.samples) Object.freeze(row);
    for (const row of run.depthSummary) Object.freeze(row);
    for (const row of run.finalProfile) Object.freeze(row);
    Object.freeze(run.samples);
    Object.freeze(run.depthSummary);
    Object.freeze(run.finalProfile);
    Object.freeze(run.assumptions);
    Object.freeze(run.warnings);
    return Object.freeze(run);
}

/** Solve dT/dt = alpha d²T/dz² with uniform properties and prescribed boundaries. */
export function simulateHeat(input: HeatParameters, options: { now?: () => string; shouldCancel?: () => boolean } = {}): HeatRun {
    const parameters = validateHeatParameters(input);
    const { diffusivityM2PerS: alpha, ambientC, surfaceC, domainDepthM, nodes } = parameters;
    const duration = parameters.durationHours * 3600;
    const pulse = parameters.pulseHours * 3600;
    const spacing = domainDepthM / (nodes - 1);
    const maxStep = FOURIER_LIMIT * spacing * spacing / alpha;
    const boundary = (time: number): number => time < pulse ? surfaceC : ambientC;
    let previous = new Float64Array(nodes).fill(ambientC);
    let next = new Float64Array(nodes).fill(ambientC);
    previous[0] = boundary(0);
    const depths = [parameters.depthAM, parameters.depthBM];
    const atDepth = (profile: Float64Array, depth: number): number => {
        const position = depth / spacing;
        const lower = Math.min(nodes - 1, Math.floor(position));
        if (lower === nodes - 1) return profile[lower];
        const fraction = position - lower;
        return profile[lower] * (1 - fraction) + profile[lower + 1] * fraction;
    };
    // The initial condition is known exactly: only z=0 is the hot imposed boundary.
    // Interpolating that discontinuity into the first cell would invent heat at t=0.
    const initialTemperatureAtDepth = (depthM: number): number => depthM === 0 ? boundary(0) : ambientC;
    const summaries = depths.map(depthM => ({ depthM, peakTemperatureC: initialTemperatureAtDepth(depthM), peakTimeHours: 0, finalTemperatureC: ambientC }));
    const sampleTimes = new Set<number>([0, duration]);
    for (let index = 1; index < OUTPUT_INTERVALS; index++) sampleTimes.add(duration * index / OUTPUT_INTERVALS);
    if (pulse > 0 && pulse < duration) sampleTimes.add(pulse);
    const samples: HeatSample[] = [{ timeHours: 0, temperatureAC: initialTemperatureAtDepth(depths[0]), temperatureBC: initialTemperatureAtDepth(depths[1]) }];
    let elapsed = 0;
    let steps = 0;
    for (const target of [...sampleTimes].sort((left, right) => left - right).slice(1)) {
        while (elapsed < target) {
            if (options.shouldCancel?.()) throw new HeatCancelledError();
            const untilTarget = target - elapsed;
            const untilPulse = elapsed < pulse ? pulse - elapsed : Infinity;
            const step = Math.min(maxStep, untilTarget, untilPulse);
            const ratio = alpha * step / (spacing * spacing);
            for (let node = 1; node < nodes - 1; node++) {
                next[node] = previous[node] + ratio * (previous[node - 1] - 2 * previous[node] + previous[node + 1]);
            }
            elapsed = step === untilTarget ? target : step === untilPulse ? pulse : elapsed + step;
            next[0] = boundary(elapsed);
            next[nodes - 1] = ambientC;
            const swap = previous; previous = next; next = swap;
            steps++;
            for (let index = 0; index < depths.length; index++) {
                const temperature = atDepth(previous, depths[index]);
                if (temperature > summaries[index].peakTemperatureC) {
                    summaries[index].peakTemperatureC = temperature;
                    summaries[index].peakTimeHours = elapsed / 3600;
                }
            }
        }
        samples.push({ timeHours: target / 3600, temperatureAC: atDepth(previous, depths[0]), temperatureBC: atDepth(previous, depths[1]) });
    }
    for (let index = 0; index < depths.length; index++) summaries[index].finalTemperatureC = atDepth(previous, depths[index]);
    const warnings: string[] = [];
    if (depths.some(depth => depth > 0 && depth < spacing))
        warnings.push(`One or both comparison depths are inside the first grid cell (0 to ${Number(spacing.toPrecision(8))} m). After time zero, these readouts interpolate across the imposed surface boundary; refine the grid before interpreting shallow temperatures.`);
    if (domainDepthM < 4 * Math.sqrt(alpha * duration))
        warnings.push('The fixed deep boundary may influence this run. Increase model depth and compare results before interpreting a shallow profile.');
    if (parameters.depthAM === parameters.depthBM) warnings.push('The two comparison depths are identical.');
    return frozenRun({
        kind: 'illustrative_heat_transport', methodVersion: HEAT_METHOD_VERSION,
        createdAt: options.now?.() ?? new Date().toISOString(),
        scope: 'Illustrative one-dimensional conduction only. No combustion, ignition threshold, or site-specific prediction is modeled.',
        parameters,
        numerics: {
            method: 'Forward Euler in time, centered second differences in depth (FTCS)',
            spatialStepM: spacing, maxTimeStepSeconds: maxStep, timeStepCount: steps, fourierLimit: FOURIER_LIMIT,
            boundaryConvention: 'Surface held at pulse temperature for 0 ≤ time < pulse duration, then immediately reset to ambient. Deep boundary fixed at ambient.',
            depthSampling: 'At time zero the known uniform interior initial condition is used, with the imposed surface temperature only at zero depth. Later values use linear interpolation between depth nodes. Peaks use every computed time step; the table contains sampled times.',
        },
        assumptions: [
            'Initially uniform ground temperature, apart from the imposed surface boundary at time zero.',
            'Uniform, constant thermal diffusivity in a one-dimensional finite column.',
            'The surface temperature is imposed directly; there is no atmosphere or heat-flux calculation.',
            'No combustion, oxygen supply, fluid flow, moisture, phase changes, radiation or geological layers.',
            'Parameters are illustrative and have not been measured or calibrated for Remington or the Powder River Basin.',
        ],
        warnings, samples, depthSummary: summaries,
        finalProfile: Array.from(previous, (temperatureC, index) => ({ depthM: index * spacing, temperatureC })),
    });
}

export type HeatWorker = Pick<Worker, 'onmessage' | 'onerror' | 'onmessageerror' | 'postMessage' | 'terminate'>;
export interface HeatSessionOptions { createWorker?: () => HeatWorker; timeoutMs?: number }

/** Terminates workers on replacement/cancellation; identity checks also reject stale messages. */
export class HeatRunSession {
    private generation = 0;
    private pending: { id: number; worker: HeatWorker; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
    private options: HeatSessionOptions;
    constructor(options: HeatSessionOptions = {}) { this.options = options; }

    run(input: HeatParameters): Promise<HeatRun> {
        this.cancel();
        const parameters = validateHeatParameters(input);
        const id = ++this.generation;
        return new Promise((resolve, reject) => {
            const worker = this.options.createWorker?.() ?? new Worker(new URL('./heat.worker.ts', import.meta.url), { type: 'module' });
            const finish = (result?: HeatRun, error?: Error): void => {
                if (this.pending?.id !== id) return;
                clearTimeout(this.pending.timer);
                this.pending = null;
                worker.terminate();
                if (error) reject(error);
                else {
                    try {
                        if (!result || result.kind !== 'illustrative_heat_transport' || result.methodVersion !== HEAT_METHOD_VERSION)
                            throw new Error('Heat worker returned an invalid result.');
                        resolve(frozenRun(result));
                    } catch {
                        reject(new Error('Heat worker returned an invalid or unreadable result.'));
                    }
                }
            };
            const timer = setTimeout(() => finish(undefined, new Error('Heat worker timed out. Try a smaller run.')), this.options.timeoutMs ?? 30_000);
            this.pending = { id, worker, reject, timer };
            worker.onmessage = (event: MessageEvent): void => {
                if (event.data?.id !== id || this.pending?.id !== id) return;
                if (event.data.type === 'result') finish(event.data.result);
                else if (event.data.type === 'error') finish(undefined, new Error(event.data.message || 'Heat worker failed.'));
            };
            worker.onerror = (event: ErrorEvent): void => { event.preventDefault(); finish(undefined, new Error(event.message || 'Heat worker failed.')); };
            worker.onmessageerror = (): void => finish(undefined, new Error('Heat worker response could not be read.'));
            try { worker.postMessage({ type: 'run', id, parameters }); }
            catch (error) { finish(undefined, error instanceof Error ? error : new Error('Heat worker could not start.')); }
        });
    }

    cancel(): void {
        const pending = this.pending;
        this.pending = null;
        this.generation++;
        if (!pending) return;
        clearTimeout(pending.timer);
        pending.worker.terminate();
        pending.reject(new HeatCancelledError());
    }
}
