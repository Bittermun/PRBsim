import { test, expect } from '@playwright/test';

// Explicit opt-in: remote catalog availability must not make deterministic CI flaky.
test('live Earth Search metadata is accessible from a real browser origin', async ({ page }) => {
    test.skip(process.env.PRB_LIVE_CATALOG !== '1', 'Set PRB_LIVE_CATALOG=1 for the separately logged live-service probe.');
    test.setTimeout(45000);
    await page.route('**/__satellite_live__', route => route.fulfill({
        contentType: 'text/html', body: '<!doctype html><html lang="en"><title>Public catalog probe</title><main>Scene metadata only</main></html>'
    }));
    await page.goto('/__satellite_live__');
    const probe = await page.evaluate(async () => {
        const { searchSatelliteScenes } = await import('/src/prb/data/satellite.ts');
        const checkedAt = new Date().toISOString();
        const result = await searchSatelliteScenes({
            bbox: [-106.5, 44.75, -105.7, 45.5], startDate: '2024-08-01', endDate: '2024-10-01', maxCloudCover: 30, limit: 3
        });
        return { checkedAt, origin: location.origin, query: result.query, matchedCount: result.matchedCount, receivedCount: result.receivedCount, rejectedCount: result.rejectedCount, scenes: result.scenes.map(({ id, datetime, cloudCover, metadataUrl }) => ({ id, datetime, cloudCover, metadataUrl })) };
    });
    expect(probe.scenes.length).toBeGreaterThan(0);
    expect(probe.scenes.length).toBeLessThanOrEqual(3);
    expect(probe.rejectedCount).toBe(0);
    for (const scene of probe.scenes) expect(scene.cloudCover).toBeLessThanOrEqual(30);
    console.log('LIVE CATALOG PROBE (metadata only):', JSON.stringify(probe));
});
