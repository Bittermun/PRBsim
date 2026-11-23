import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { expect, test, type Page } from '@playwright/test';
import { publishObservations } from '../scripts/prb/publish_observations.ts';
import { observationServer } from '../scripts/prb/serve_observations.mjs';

async function releasePixels(page: Page): Promise<number> {
    return page.locator('#prb-map-container canvas').evaluate((canvas: HTMLCanvasElement) => {
        const context = canvas.getContext('webgl2');
        if (!context) return 0;
        const rgba = new Uint8Array(context.drawingBufferWidth * context.drawingBufferHeight * 4);
        context.readPixels(0, 0, context.drawingBufferWidth, context.drawingBufferHeight, context.RGBA, context.UNSIGNED_BYTE, rgba);
        let count = 0;
        for (let i = 0; i < rgba.length; i += 4) {
            if (Math.abs(rgba[i] - 124) < 6 && Math.abs(rgba[i + 1] - 58) < 6 && Math.abs(rgba[i + 2] - 237) < 6) count++;
        }
        return count;
    });
}

test('both revisions load from the same HTTP URL and the map drops a withdrawal', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const directory = testInfo.outputPath('served');
    const publish = (version: number, notes = version) => publishObservations(
        resolve(`examples/observation-publication/revision-${version}.json`),
        resolve(`examples/observation-publication/release-${notes}.json`), directory,
    );
    const first = publish(1);
    const requests: { pathname: string; status: number; sha256: string; agent: string }[] = [];
    const server = observationServer(directory, entry => requests.push(entry));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP listener.');
    const url = `http://127.0.0.1:${address.port}/current.geojson`;
    const qgisImage = process.env.PRB_QGIS_IMAGE;
    const qgis = qgisImage ? spawn('docker', [
        'run', '--rm', '-i', '--entrypoint', '/usr/bin/python3', '-e', 'QT_QPA_PLATFORM=offscreen',
        '--mount', `type=bind,source=${resolve('scripts/prb/verify_qgis_publication.py')},target=/tmp/verify.py,readonly`,
        qgisImage, '/tmp/verify.py', url.replace('127.0.0.1', 'host.docker.internal'),
    ], { stdio: ['pipe', 'pipe', 'inherit'] }) : null;
    const lines = qgis && createInterface({ input: qgis.stdout })[Symbol.asyncIterator]();
    async function qgisSnapshot() {
        const line = await lines?.next();
        if (line?.done || !line) throw new Error('The QGIS verifier exited before returning the layer.');
        return JSON.parse(line.value);
    }

    try {
        await page.setViewportSize({ width: 1280, height: 840 });
        await page.route('https://tiles.openfreemap.org/styles/positron', route => route.fulfill({
            json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f8fafc' } }] },
        }));
        await page.goto('/');
        const open = async () => {
            await page.getByRole('button', { name: 'Research tools', exact: true }).click();
            await page.getByRole('tab', { name: 'Published observations' }).click();
        };
        const close = () => page.getByRole('button', { name: 'Close research tools' }).click();
        const panel = page.getByRole('tabpanel', { name: 'Published observations' });
        const reload = () => panel.getByRole('button', { name: 'Reload layer' }).click();
        await open();
        await panel.getByLabel('Layer URL').fill(url);
        await reload();
        await expect(panel.getByRole('status')).toHaveText('Loaded revision 1. 2 observations.');
        await expect(panel.getByRole('row', { name: /Practice observation B/ })).toContainText('Fictional field notebook');
        const before = qgis && await qgisSnapshot();
        if (before) expect(before.records.map(row => row.attributes.recordId)).toEqual(['practice-a', 'practice-b']);
        await close();
        expect(await releasePixels(page)).toBe(0);
        await page.locator('#toggle-synthetic-fixtures').check();
        await expect.poll(() => releasePixels(page)).toBeGreaterThan(250);
        await page.screenshot({ path: testInfo.outputPath('revision-1-map.png') });
        const twoPoints = await releasePixels(page);

        expect(() => publish(2, 1)).toThrow(/Provide a reason/);
        const head = await fetch(url, { method: 'HEAD' });
        expect(head.headers.get('etag')).toBe(`"${first.sha256}"`);
        expect(head.headers.get('cache-control')).toBe('no-cache, must-revalidate');
        expect(await head.text()).toBe('');
        expect((await fetch(url, { method: 'POST' })).status).toBe(405);
        expect((await fetch(url, { headers: { 'If-None-Match': `"${first.sha256}"` } })).status).toBe(304);
        const next = publish(2);
        expect((await fetch(url, { headers: { 'If-None-Match': `"${first.sha256}"` } })).status).toBe(200);
        expect(publish(2).sha256).toBe(next.sha256);
        expect(() => publish(1)).toThrow(/newer dated revision/);
        await open();
        await reload();
        await expect(panel.getByRole('status')).toHaveText('Loaded revision 2. 1 observation.');
        await expect(panel.getByRole('row', { name: /Practice observation A, corrected/ })).toContainText('2024-08-23');
        await expect(panel.getByRole('row', { name: /Practice observation A, corrected/ })).toContainText('Synthetic');
        await expect(panel.getByRole('row', { name: /Practice observation B/ })).toHaveCount(0);
        await expect(panel.getByText(/practice-b · withdrawn/)).toBeVisible();
        const history = new URL('/releases/1.geojson', url);
        await expect(panel.getByRole('link', { name: 'Previous revision' })).toHaveAttribute('href', history.href);
        const browserHistory = await page.evaluate(async archiveUrl => {
            const response = await fetch(archiveUrl);
            if (!response.ok) throw new Error(`Archive returned HTTP ${response.status}`);
            return (await response.json()).features.map((feature: { id: string }) => feature.id);
        }, history.href);
        expect(browserHistory).toEqual(['practice-a', 'practice-b']);
        await page.screenshot({ path: testInfo.outputPath('revision-2-details.png') });
        await close();
        await expect.poll(() => releasePixels(page)).toBeLessThan(twoPoints * 0.75);
        expect(await releasePixels(page)).toBeGreaterThan(100);
        await page.screenshot({ path: testInfo.outputPath('revision-2-map.png') });

        let after = null;
        let qgisHistory = null;
        if (qgis) {
            qgis.stdin.write('reload\n');
            after = await qgisSnapshot();
            expect(after.records.map(row => row.attributes)).toEqual([{
                recordId: 'practice-a', label: 'Practice observation A, corrected', observationDate: '2024-08-23',
                accuracyMeters: 15, sourceId: 'demo-notebook', license: 'CC0-1.0', reviewStatus: 'synthetic', revision: 2,
            }]);
            expect(after.records[0].coordinates).toEqual([-106.092, 45.039]);
            qgis.stdin.write('history\n');
            qgisHistory = await qgisSnapshot();
            expect(qgisHistory).toEqual(before);
        }
        const archived = await fetch(history);
        expect(archived.headers.get('etag')).toBe(`"${first.sha256}"`);
        expect(archived.headers.get('cache-control')).toContain('immutable');
        expect(await archived.text()).toBe(await readFile(first.archivePath, 'utf8'));
        const currentRequests = requests.filter(entry => entry.pathname === '/current.geojson' && entry.status === 200);
        const deliveredHashes = (agent: RegExp) => currentRequests.filter(entry => agent.test(entry.agent)).map(entry => entry.sha256);
        expect(deliveredHashes(/Chrome\//)).toEqual(expect.arrayContaining([first.sha256, next.sha256]));
        if (qgis) expect(deliveredHashes(/QGIS\//)).toEqual(expect.arrayContaining([first.sha256, next.sha256]));
        const receipt = testInfo.outputPath('publication-verification.json');
        await writeFile(receipt, JSON.stringify({
            verifiedAt: new Date().toISOString(), url, requests,
            chromium: { operation: 'Reload layer', archiveRecordIds: browserHistory },
            qgis: qgis && { operation: 'QgsVectorLayer.reload()', before, after, archive: qgisHistory },
        }, null, 2) + '\n');
        await testInfo.attach('release-verification', { path: receipt, contentType: 'application/json' });
    } finally {
        qgis?.stdin.end();
        server.closeAllConnections();
        await new Promise<void>(done => server.close(() => done()));
    }
});
