import { test, expect, type Page } from '@playwright/test';

async function redEvidencePixelCount(page: Page): Promise<number> {
    return page.locator('#prb-map-container canvas').evaluate((canvas: HTMLCanvasElement) => {
        const gl = canvas.getContext('webgl2');
        if (!gl) return 0;
        const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let red = 0;
        for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index] > 120 && pixels[index] > pixels[index + 1] * 1.6 && pixels[index] > pixels[index + 2] * 1.6 && pixels[index + 3] > 0) red += 1;
        }
        return red;
    });
}

test('MapLibre renders the actual bundled perimeter and responds to visibility toggles', async ({ page }) => {
    // A controlled neutral basemap makes the vector/render check independent of a remote tile service.
    await page.route('https://tiles.openfreemap.org/styles/positron', route => route.fulfill({ json: {
        version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f8fafc' } }]
    } }));
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Research tools', exact: true })).toBeEnabled();
    await expect.poll(() => redEvidencePixelCount(page), { timeout: 15000 }).toBeGreaterThan(100);
    await page.screenshot({ path: 'test-results/map-perimeter.png' });
    await page.locator('#layer-perim').uncheck();
    await expect.poll(() => redEvidencePixelCount(page)).toBe(0);
    await page.locator('#layer-perim').check();
    await expect.poll(() => redEvidencePixelCount(page)).toBeGreaterThan(100);
    expect(errors).toEqual([]);
});

test('switching basemaps restores local evidence while unrelated raster tiles are pending', async ({ page }) => {
    const background = { id: 'background', type: 'background', paint: { 'background-color': '#f8fafc' } };
    await page.route('https://tiles.openfreemap.org/styles/positron', route => route.fulfill({ json: { version: 8, sources: {}, layers: [background] } }));
    await page.route('https://tiles.openfreemap.org/styles/liberty', route => route.fulfill({ json: {
        version: 8, sources: { pending: { type: 'raster', tiles: ['https://map-fixture.invalid/{z}/{x}/{y}.png'], tileSize: 256 } },
        layers: [background, { id: 'pending-raster', type: 'raster', source: 'pending' }]
    } }));
    const releases: (() => void)[] = [];
    await page.route('https://map-fixture.invalid/**', async route => {
        await new Promise<void>(resolve => releases.push(resolve));
        await route.abort();
    });
    await page.goto('/');
    await expect.poll(() => redEvidencePixelCount(page)).toBeGreaterThan(100);
    await page.locator('#basemap-select').selectOption('liberty');
    try {
        await expect.poll(() => redEvidencePixelCount(page)).toBeGreaterThan(100);
    } finally {
        for (const release of releases) release();
    }
});

test('initial evidence mounts after the style specification even when remote tiles are pending', async ({ page }) => {
    await page.route('https://tiles.openfreemap.org/styles/positron', route => route.fulfill({ json: {
        version: 8, sources: { pending: { type: 'raster', tiles: ['https://map-fixture.invalid/{z}/{x}/{y}.png'], tileSize: 256 } },
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f8fafc' } }, { id: 'pending-raster', type: 'raster', source: 'pending' }]
    } }));
    const releases: (() => void)[] = [];
    await page.route('https://map-fixture.invalid/**', async route => {
        await new Promise<void>(resolve => releases.push(resolve));
        await route.abort();
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Research tools', exact: true })).toBeEnabled();
    try {
        await expect.poll(() => redEvidencePixelCount(page)).toBeGreaterThan(100);
    } finally {
        for (const release of releases) release();
    }
});

test('live cartography renders the perimeter and contour theme', async ({ page }) => {
    test.skip(process.env.PRB_LIVE_MAP !== '1', 'Opt in with PRB_LIVE_MAP=1 for the remote map-service smoke check.');
    test.setTimeout(45000);
    const failures: string[] = [];
    page.on('requestfailed', request => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.goto('/');
    await expect.poll(() => redEvidencePixelCount(page), { timeout: 20000 }).toBeGreaterThan(100);
    await page.screenshot({ path: 'test-results/map-live-positron.png' });
    const glyphResponse = page.waitForResponse(response => response.url().includes('/fonts/') && response.url().endsWith('/0-255.pbf'), { timeout: 15000 });
    await page.locator('#basemap-select').selectOption('contour');
    try {
        await expect.poll(() => redEvidencePixelCount(page), { timeout: 20000 }).toBeGreaterThan(100);
        // Wait for actual hillshade, separately from the independent local evidence overlay.
        await expect.poll(() => page.locator('#prb-map-container canvas').evaluate((canvas: HTMLCanvasElement) => {
            const gl = canvas.getContext('webgl2');
            if (!gl) return 0;
            const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
            gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            let shaded = 0;
            for (let index = 0; index < pixels.length; index += 4) {
                const colors = [pixels[index], pixels[index + 1], pixels[index + 2]];
                if (Math.min(...colors) > 100 && Math.max(...colors) < 240 && Math.max(...colors) - Math.min(...colors) < 20) shaded += 1;
            }
            return shaded;
        }), { timeout: 20000 }).toBeGreaterThan(5000);
        expect((await glyphResponse).status()).toBe(200);
    } finally {
        await page.screenshot({ path: 'test-results/map-live-contour.png' });
        console.log('Live map service failures, if any:', JSON.stringify(failures));
    }
});
