import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { simulateHeat, DEFAULT_HEAT_PARAMETERS } from '../../src/prb/data/heat.ts';

test('heat result presents two depths on shared axes and provides accessible numerical tables', async () => {
    const uiUrl = new URL('../../src/prb/ui/HeatLab.ts', import.meta.url);
    assert.ok(existsSync(uiUrl), 'The heat comparison panel has not been implemented.');
    const { renderHeatResults } = await import(uiUrl.href);
    const run = simulateHeat(DEFAULT_HEAT_PARAMETERS);
    const html = renderHeatResults(run);
    assert.match(html, /aria-label="Sampled temperatures at both depths"/);
    assert.match(html, /aria-label="Final temperature profile"/);
    assert.match(html, /Depth A: 0\.25 m/);
    assert.match(html, /Depth B: 1 m/);
    assert.match(html, /same temperature scale/);
    assert.match(html, /No combustion/);
    assert.match(html, /conduction-1d-explicit-v1/);
    assert.match(html, /<th scope="col">Time \(hours\)<\/th>/);
    assert.match(html, /data-heat-series="A"/);
    assert.match(html, /data-heat-series="B"/);
    assert.ok(!html.includes('NaN') && !html.includes('Infinity'));
});

test('heat result escapes labels from saved run metadata', async () => {
    const uiUrl = new URL('../../src/prb/ui/HeatLab.ts', import.meta.url);
    assert.ok(existsSync(uiUrl), 'The heat comparison panel has not been implemented.');
    const { renderHeatResults } = await import(uiUrl.href);
    const run = simulateHeat(DEFAULT_HEAT_PARAMETERS);
    const html = renderHeatResults({ ...run, scope: '<img src=x onerror=alert(1)>', warnings: ['<script>evil()</script>'] });
    assert.ok(!html.includes('<img src=x') && !html.includes('<script>'));
    assert.match(html, /&lt;img/);
    assert.match(html, /&lt;script/);
});

test('small valid depths and times retain distinct nonzero units in the rendered result', async () => {
    const { renderHeatResults } = await import('../../src/prb/ui/HeatLab.ts');
    const run = simulateHeat({ ...DEFAULT_HEAT_PARAMETERS, domainDepthM: 0.001, nodes: 401,
        depthAM: 0.0001, depthBM: 0.0002, pulseHours: 5e-9, durationHours: 1e-8 });
    const html = renderHeatResults(run);
    assert.match(html, /Depth A: 0\.0001 m/);
    assert.match(html, /Depth B: 0\.0002 m/);
    assert.match(html, /Grid spacing: 0\.0000025 m/);
    assert.match(html, /Maximum step: 0\.00000125 seconds/);
    assert.match(html, /<th scope="row">1e-8<\/th>/);
    assert.ok(!html.includes('Grid spacing: 0 m') && !html.includes('Maximum step: 0 seconds'));
});

test('shared chart range follows depth results while showing the imposed surface pulse separately', async () => {
    const { renderHeatResults } = await import('../../src/prb/ui/HeatLab.ts');
    const run = simulateHeat(DEFAULT_HEAT_PARAMETERS);
    const html = renderHeatResults(run);
    const axis = html.match(/Temperature axis for the two depths: ([\d.e+-]+) to ([\d.e+-]+) °C/);
    assert.ok(axis, 'The chart must explicitly identify its range as calculated depth temperatures.');
    const minimum = Number(axis[1]), maximum = Number(axis[2]);
    const depthValues = run.samples.flatMap(sample => [sample.temperatureAC, sample.temperatureBC]);
    assert.ok(minimum <= Math.min(...depthValues));
    assert.ok(maximum >= Math.max(...depthValues, ...run.depthSummary.map(summary => summary.peakTemperatureC)));
    assert.ok(maximum - minimum < 100, 'Default depth temperatures should occupy most of the plot, rather than use the 500 °C surface scale.');
    assert.match(html, /Imposed surface pulse: 500 °C for 2 hours, then 15 °C/);
    assert.match(html, /Both traces use the same temperature scale/);
    assert.ok((html.match(/class="heat-temperature-tick"/g) ?? []).length >= 3, 'Provide intermediate readable temperature ticks.');
});

test('shallow comparison results visibly disclose first-cell interpolation limits', async () => {
    const { renderHeatResults } = await import('../../src/prb/ui/HeatLab.ts');
    const run = simulateHeat({ ...DEFAULT_HEAT_PARAMETERS, depthAM: 0.005, depthBM: 0.01 });
    const html = renderHeatResults(run);
    assert.ok(html.includes('first grid cell') && html.includes('refine the grid'));
    assert.match(html, /<tr><th scope="row">0<\/th><td>15\.00<\/td><td>15\.00<\/td><\/tr>/);
});
