import { test, expect, type Page } from '@playwright/test';

const catalogSearch = 'https://earth-search.aws.element84.com/v1/search';
const scene = {
    type: 'Feature', stac_version: '1.0.0', collection: 'landsat-c2-l2', id: 'LC09_L2SP_035029_20240930_02_T1',
    bbox: [-107.425435, 43.51039, -104.404995, 45.678337],
    geometry: { type: 'Polygon', coordinates: [[[-107.4, 43.6], [-104.5, 43.6], [-104.5, 45.6], [-107.4, 45.6], [-107.4, 43.6]]] },
    properties: { datetime: '2024-09-30T17:48:23.000778Z', 'eo:cloud_cover': 2.57, platform: '<img src=x onerror=alert(1)>' },
    links: [{ rel: 'via', href: 'javascript:alert(1)' }, { rel: 'cite-as', href: 'https://doi.org/10.5066/P9OGBGM6' }], assets: {}
};

async function mount(page: Page, deferred = false) {
    // A focused real-browser harness loads the real module, without modifying app entrypoints.
    await page.route('**/__satellite_test__', route => route.fulfill({
        contentType: 'text/html', body: '<!doctype html><html lang="en"><title>Satellite panel test</title><main id="satellite-test"></main></html>'
    }));
    await page.goto('/__satellite_test__');
    await page.evaluate(async (useDeferred) => {
        const { SatellitePanel } = await import('/src/prb/ui/SatellitePanel.ts');
        const testWindow = window as any;
        testWindow.satelliteRequests = [];
        const fetchImpl = useDeferred ? (_url: string, options: RequestInit) => new Promise<Response>(resolve => {
            testWindow.satelliteRequests.push({ resolve, signal: options.signal });
        }) : undefined;
        testWindow.satellitePanel = new SatellitePanel('satellite-test', {
            getCurrentBbox: () => [-106.2, 44.8, -105.8, 45.2], fetchImpl
        });
    }, deferred);
}

test.describe('Independent satellite scene-discovery panel', () => {
    test('has labeled controls, explicit scientific limits, map bounds and no automatic search', async ({ page }) => {
        let requests = 0;
        await page.route(catalogSearch, route => { requests += 1; return route.abort(); });
        await mount(page);
        await expect(page.getByRole('heading', { name: 'Landsat scene discovery' })).toBeVisible();
        await expect(page.getByText(/Scene cloud cover is not pixel-level usable ground coverage/)).toBeVisible();
        await expect(page.getByText(/does not measure temperature or detect underground fires/)).toBeVisible();
        await expect(page.getByLabel('West longitude')).toHaveValue('-106.5');
        await expect(page.getByLabel('Start date (UTC)')).toHaveValue('2024-08-01');
        await page.getByRole('button', { name: 'Use current map bounds' }).click();
        await expect(page.getByLabel('West longitude')).toHaveValue('-106.2');
        await expect(page.getByLabel('North latitude')).toHaveValue('45.2');
        expect(requests).toBe(0);
    });

    test('shows scene dates, scene-wide quality and safe source links with untrusted text escaped', async ({ page }) => {
        await page.route(catalogSearch, route => route.fulfill({ json: { type: 'FeatureCollection', features: [scene], numberMatched: 22, links: [] } }));
        await mount(page);
        await page.getByRole('button', { name: 'Find scenes', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('1 valid scene record');
        await expect(page.getByRole('table')).toContainText('2.57%');
        await expect(page.getByRole('table')).toContainText('2024-09-30');
        await expect(page.getByRole('table')).toContainText('<img src=x onerror=alert(1)>');
        await expect(page.locator('img,script')).toHaveCount(0);
        await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
        const metadata = page.getByRole('link', { name: 'Catalog scene metadata' });
        await expect(metadata).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(metadata).toHaveAttribute('href', /\/items\/LC09_L2SP_035029_20240930_02_T1$/);
        await expect(page.getByText(/Catalog reports 22/)).toBeVisible();
        await expect(page.getByText(/not checked for usable pixels/)).toBeVisible();
    });

    test('distinguishes no scenes, bad metadata and remote failure, and remains usable after each', async ({ page }) => {
        let response = 'empty';
        await page.route(catalogSearch, route => {
            if (response === 'offline') return route.abort('failed');
            return route.fulfill({ json: { type: 'FeatureCollection', features: response === 'invalid' ? [{ ...scene, id: '<bad>' }] : [], links: [], numberMatched: response === 'invalid' ? 1 : 0 } });
        });
        await mount(page);
        await page.getByRole('button', { name: 'Find scenes', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('No scenes');
        response = 'invalid';
        await page.getByRole('button', { name: 'Find scenes', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('No valid scene records');
        response = 'offline';
        await page.getByRole('button', { name: 'Find scenes', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('could not be reached');
        await expect(page.getByRole('button', { name: 'Find scenes', exact: true })).toBeEnabled();
        await expect(page.getByRole('button', { name: 'Cancel search' })).toBeDisabled();
    });

    test('cancel and newer query reject late responses even when the transport ignores abort', async ({ page }) => {
        await mount(page, true);
        const find = page.getByRole('button', { name: 'Find scenes', exact: true });
        await find.click();
        await expect(page.getByRole('status')).toContainText('Searching');
        await page.getByRole('button', { name: 'Cancel search' }).click();
        await expect(page.getByRole('status')).toContainText('canceled');
        await page.evaluate((fixture) => (window as any).satelliteRequests[0].resolve(new Response(JSON.stringify({ type: 'FeatureCollection', features: [fixture], links: [] }))), scene);
        await expect(page.getByRole('table')).toHaveCount(0);
        await find.click();
        await find.click();
        await page.evaluate((fixture) => (window as any).satelliteRequests[2].resolve(new Response(JSON.stringify({ type: 'FeatureCollection', features: [{ ...fixture, id: 'NEW_SCENE' }], links: [] }))), scene);
        await expect(page.getByRole('table')).toContainText('NEW_SCENE');
        await page.evaluate((fixture) => (window as any).satelliteRequests[1].resolve(new Response(JSON.stringify({ type: 'FeatureCollection', features: [{ ...fixture, id: 'OLD_SCENE' }], links: [] }))), scene);
        await expect(page.getByRole('table')).toContainText('NEW_SCENE');
        await expect(page.getByRole('table')).not.toContainText('OLD_SCENE');
    });

    test('editing query inputs cancels the pending search and clears prior results', async ({ page }) => {
        await mount(page, true);
        await page.getByRole('button', { name: 'Find scenes', exact: true }).click();
        await page.getByLabel('Maximum scene cloud cover (%)').fill('10');
        await expect(page.getByRole('status')).toContainText('changed');
        expect(await page.evaluate(() => (window as any).satelliteRequests[0].signal.aborted)).toBe(true);
        await page.evaluate((fixture) => (window as any).satelliteRequests[0].resolve(new Response(JSON.stringify({ type: 'FeatureCollection', features: [fixture], links: [] }))), scene);
        await expect(page.getByRole('table')).toHaveCount(0);
    });
});
