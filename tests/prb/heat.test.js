import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const modelUrl = new URL('../../src/prb/data/heat.ts', import.meta.url);
async function model() {
    assert.ok(existsSync(modelUrl), 'The heat-conduction model has not been implemented.');
    return import(modelUrl.href);
}

test('heat run retains explicit inputs, method scope and immutable reproducible output', async () => {
    const { simulateHeat, DEFAULT_HEAT_PARAMETERS } = await model();
    const inputs = { ...DEFAULT_HEAT_PARAMETERS };
    const result = simulateHeat(inputs, { now: () => '2026-10-20T12:00:00.000Z' });
    assert.equal(result.kind, 'illustrative_heat_transport');
    assert.equal(result.methodVersion, 'conduction-1d-explicit-v1');
    assert.equal(result.createdAt, '2026-10-20T12:00:00.000Z');
    assert.deepEqual(result.parameters, inputs);
    inputs.surfaceC = 1;
    assert.equal(result.parameters.surfaceC, 500);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.samples));
    assert.ok(result.scope.includes('No combustion'));
    assert.equal(result.samples[0].timeHours, 0);
    assert.equal(result.samples.at(-1).timeHours, 24);
    assert.ok(result.samples.some(sample => sample.timeHours === 2));
    assert.equal(JSON.parse(JSON.stringify(result)).parameters.depthAM, 0.25);
});

test('heat solver agrees with an independent semi-infinite step benchmark and converges', async () => {
    const { simulateHeat, DEFAULT_HEAT_PARAMETERS } = await model();
    // erfc(0.5) = 0.4795001221869535: 400 * erfc(z/(2*sqrt(alpha*t))).
    // Here z=0.25 m, alpha=1e-6 m²/s and t=62500 s. Domain 3 m is remote.
    const expected = 191.8000488747814;
    const errors = [31, 61, 121].map(nodes => {
        const run = simulateHeat({ ...DEFAULT_HEAT_PARAMETERS, ambientC: 0, surfaceC: 400,
            durationHours: 62500 / 3600, pulseHours: 62500 / 3600, nodes });
        return Math.abs(run.samples.at(-1).temperatureAC - expected);
    });
    assert.ok(errors[2] < 0.15, `Fine-mesh temperature error ${errors[2]} °C`);
    assert.ok(errors[1] < errors[0], `Medium mesh should improve ${errors}`);
    assert.ok(errors[2] < errors[1], `Fine mesh should improve ${errors}`);
});

test('surface pulse cools by superposition of independent analytical step solutions', async () => {
    const { simulateHeat, DEFAULT_HEAT_PARAMETERS } = await model();
    const run = simulateHeat(DEFAULT_HEAT_PARAMETERS);
    // Independently evaluated with Python math.erfc; see task-heat-report.md.
    // 15 + 485 * (erfc(.25/(2*sqrt(.0864))) - erfc(.25/(2*sqrt(.0792)))).
    assert.ok(Math.abs(run.samples.at(-1).temperatureAC - 23.566397161794455) < 0.15);
    assert.ok(run.depthSummary[0].peakTemperatureC > run.samples.at(-1).temperatureAC);
    assert.ok(run.depthSummary[0].peakTemperatureC > run.depthSummary[1].peakTemperatureC);
});

test('initial and deep boundaries are retained and the explicit update stays bounded', async () => {
    const { simulateHeat, DEFAULT_HEAT_PARAMETERS } = await model();
    const run = simulateHeat({ ...DEFAULT_HEAT_PARAMETERS, depthAM: 0, depthBM: 3 });
    assert.equal(run.samples[0].temperatureAC, 500);
    assert.equal(run.samples[0].temperatureBC, 15);
    assert.ok(run.samples.every(sample => sample.temperatureBC === 15));
    assert.equal(run.samples.find(sample => sample.timeHours === 2).temperatureAC, 15);
    assert.equal(run.finalProfile[0].temperatureC, 15);
    assert.equal(run.finalProfile.at(-1).temperatureC, 15);
    assert.ok(run.finalProfile.every(point => point.temperatureC >= 15 && point.temperatureC <= 500));
    assert.ok(run.numerics.fourierLimit <= 0.5);
});

test('positive depths retain the known cold initial condition even inside the first grid cell', async () => {
    const { simulateHeat, DEFAULT_HEAT_PARAMETERS } = await model();
    const run = simulateHeat({ ...DEFAULT_HEAT_PARAMETERS, depthAM: 0.005, depthBM: 0.01 });
    assert.equal(run.samples[0].temperatureAC, 15);
    assert.equal(run.samples[0].temperatureBC, 15);
    assert.ok(run.warnings.some(warning => /first grid cell/.test(warning) && /refine the grid/.test(warning)));
    assert.deepEqual(JSON.parse(JSON.stringify(run)).warnings, run.warnings);
    const negligiblePulse = simulateHeat({ ...DEFAULT_HEAT_PARAMETERS, depthAM: 0.005, depthBM: 0.01, pulseHours: 1e-16 });
    assert.ok(negligiblePulse.depthSummary.every(summary => Math.abs(summary.peakTemperatureC - 15) < 1e-6),
        'A negligible pulse must not retain an artificial 403 °C/306 °C peak from interpolating the time-zero boundary.');
    const surface = simulateHeat({ ...DEFAULT_HEAT_PARAMETERS, depthAM: 0, depthBM: 0.005 });
    assert.equal(surface.samples[0].temperatureAC, 500);
    assert.equal(surface.samples[0].temperatureBC, 15);
});

test('zero pulse and equal-temperature limiting cases do not generate heat', async () => {
    const { simulateHeat, DEFAULT_HEAT_PARAMETERS } = await model();
    for (const parameters of [
        { ...DEFAULT_HEAT_PARAMETERS, pulseHours: 0 },
        { ...DEFAULT_HEAT_PARAMETERS, surfaceC: 15 },
    ]) {
        const run = simulateHeat(parameters);
        assert.ok(run.samples.every(sample => sample.temperatureAC === 15 && sample.temperatureBC === 15));
        assert.ok(run.finalProfile.every(point => point.temperatureC === 15));
    }
});

test('cooling uses the same bounded physics and boundary proximity is disclosed', async () => {
    const { simulateHeat, DEFAULT_HEAT_PARAMETERS } = await model();
    const run = simulateHeat({ ...DEFAULT_HEAT_PARAMETERS, surfaceC: -10, domainDepthM: 1, depthBM: 0.9 });
    assert.ok(run.finalProfile.every(point => point.temperatureC >= -10 && point.temperatureC <= 15));
    assert.ok(run.warnings.some(message => /deep boundary/i.test(message)));
});

test('invalid numbers, impossible geometry and excessive work are rejected before simulation', async () => {
    const { validateHeatParameters, DEFAULT_HEAT_PARAMETERS } = await model();
    const bad = [
        { diffusivityM2PerS: 0 }, { diffusivityM2PerS: Infinity }, { ambientC: NaN },
        { ambientC: -274 }, { surfaceC: 3000 }, { durationHours: 0 },
        { pulseHours: -1 }, { pulseHours: 25 }, { domainDepthM: 0 },
        { depthAM: -1 }, { depthBM: 4 }, { nodes: 22.5 }, { nodes: 1001 },
        { diffusivityM2PerS: 0.01, domainDepthM: 0.01, depthAM: 0, depthBM: 0.01, nodes: 401 },
    ];
    for (const patch of bad) assert.throws(() => validateHeatParameters({ ...DEFAULT_HEAT_PARAMETERS, ...patch }));
    assert.doesNotThrow(() => validateHeatParameters(DEFAULT_HEAT_PARAMETERS));
});

test('solver observes cancellation without returning a partial scientific result', async () => {
    const { simulateHeat, DEFAULT_HEAT_PARAMETERS } = await model();
    let checks = 0;
    assert.throws(() => simulateHeat(DEFAULT_HEAT_PARAMETERS, { shouldCancel: () => ++checks > 2 }), { name: 'AbortError' });
});

function fakeWorker() {
    return {
        onmessage: null, onerror: null, onmessageerror: null, sent: [], terminated: false,
        postMessage(data) { this.sent.push(data); },
        terminate() { this.terminated = true; },
        complete(result, id = this.sent[0].id) { this.onmessage?.({ data: { type: 'result', id, result } }); },
    };
}

test('new heat run cancels its predecessor and ignores stale worker results', async () => {
    const { HeatRunSession, simulateHeat, DEFAULT_HEAT_PARAMETERS } = await model();
    const workers = [];
    const session = new HeatRunSession({ createWorker: () => { const w = fakeWorker(); workers.push(w); return w; } });
    const first = session.run(DEFAULT_HEAT_PARAMETERS);
    const firstCancelled = assert.rejects(first, { name: 'AbortError' });
    const second = session.run({ ...DEFAULT_HEAT_PARAMETERS, surfaceC: 250 });
    await firstCancelled;
    assert.equal(workers[0].terminated, true);
    workers[0].complete(simulateHeat(DEFAULT_HEAT_PARAMETERS));
    workers[1].complete(simulateHeat({ ...DEFAULT_HEAT_PARAMETERS, surfaceC: 250 }), -1);
    const expected = simulateHeat({ ...DEFAULT_HEAT_PARAMETERS, surfaceC: 250 });
    workers[1].complete(expected);
    assert.deepEqual(await second, expected);
    assert.equal(workers[1].terminated, true);
});

test('worker errors and explicit cancellation release resources and reject cleanly', async () => {
    const { HeatRunSession, DEFAULT_HEAT_PARAMETERS } = await model();
    const workers = [];
    const session = new HeatRunSession({ createWorker: () => { const w = fakeWorker(); workers.push(w); return w; } });
    const failed = session.run(DEFAULT_HEAT_PARAMETERS);
    const failure = assert.rejects(failed, /worker/i);
    workers[0].onerror({ message: 'Worker unavailable', preventDefault() {} });
    await failure;
    assert.equal(workers[0].terminated, true);
    const cancelled = session.run(DEFAULT_HEAT_PARAMETERS);
    const cancellation = assert.rejects(cancelled, { name: 'AbortError' });
    session.cancel();
    await cancellation;
    assert.equal(workers[1].terminated, true);
});

test('an unreadable worker result rejects instead of leaving a permanently pending run', { timeout: 1000 }, async () => {
    const { HeatRunSession, DEFAULT_HEAT_PARAMETERS } = await model();
    const worker = fakeWorker();
    const session = new HeatRunSession({ createWorker: () => worker });
    const run = session.run(DEFAULT_HEAT_PARAMETERS);
    const rejected = assert.rejects(run, /invalid|unreadable/i);
    worker.complete(undefined);
    await rejected;
    assert.equal(worker.terminated, true);
});
