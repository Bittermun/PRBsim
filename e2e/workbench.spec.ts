import { test, expect, type Page, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

function localPackage(revision = 1, surveyOnly = false) {
    const polygon = { type: 'Polygon', coordinates: [[[-106.3, 45], [-106.2, 45], [-106.2, 45.1], [-106.3, 45.1], [-106.3, 45]]] };
    return {
        schemaVersion: 1, packageId: surveyOnly ? 'browser-survey' : 'browser-evidence', revision, isSynthetic: false,
        sources: [{ id: 'source', name: 'Browser fixture attribution', publisher: 'Automated test fixture', retrievalDate: '2026-10-20',
            url: 'https://example.org/browser-test', license: 'Test only', crs: 'EPSG:4326', spatialAccuracy: 'Unknown', limitations: 'Controlled browser test only',
            isSynthetic: false, hashVerified: true, rawSha256: 'untrusted-claim', processedSha256: 'untrusted-claim' }],
        sites: surveyOnly ? [] : [{ id: 'site', name: 'Browser grouping fixture', coalSeam: 'Unknown', groupingUncertainty: 'confirmed_single_body',
            groupingNotes: 'Claim requiring review', boundaryGeometry: null, isSynthetic: false }],
        observations: surveyOnly ? [] : [{ id: 'observation', siteId: 'site', label: revision === 1 ? 'Browser test report' : 'Revised browser report',
            observationDate: '2026-10-01', datePrecision: 'month', status: 'field_confirmed', evidenceMethods: ['visual_smoke'], accuracyMeters: 0,
            sourceId: 'source', notes: 'Original claim in test only', isSynthetic: false, geometry: { type: 'Point', coordinates: [-106.25, 45.05] } }],
        surveys: [{ id: 'survey', surveyName: 'Browser survey fixture', surveyDate: '2026-10-15', method: 'Unreviewed test protocol', result: 'no_thermal_anomaly_detected',
            sourceId: 'source', notes: 'Coverage and instrument sensitivity not established', isSynthetic: false, geometry: polygon }]
    };
}

async function preview(page: Page, pkg: unknown) {
    await page.getByRole('dialog').locator('input[type="file"]').setInputFiles({
        name: 'controlled-test-package.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pkg, null, 2) + '\n')
    });
    await expect(page.locator('[data-import-status]')).toContainText('Preview ready');
}

async function contents(download: Download) {
    const path = await download.path();
    expect(path).not.toBeNull();
    return readFile(path!, 'utf8');
}

async function openTools(page: Page) {
    await page.getByRole('button', { name: 'Research tools', exact: true }).click();
    return page.getByRole('dialog', { name: 'Research tools', exact: true });
}

test('research tools dialog supports tabs, Escape and returning keyboard focus', async ({ page }) => {
    await page.goto('/');
    const dialog = await openTools(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab')).toHaveCount(5);
    await expect(dialog.getByRole('heading', { name: 'Local evidence imports' })).toBeVisible();
    await dialog.getByRole('tab', { name: 'Satellite scenes', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('tab', { name: 'Heat lab', exact: true })).toBeFocused();
    await expect(dialog.getByRole('tabpanel', { name: 'Heat lab', exact: true })).toBeVisible();
    const previousWindow = await page.locator('#current-window-display').textContent();
    await dialog.getByRole('tabpanel', { name: 'Heat lab', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(page.locator('#current-window-display')).toHaveText(previousWindow!);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Research tools', exact: true })).toBeFocused();
});

test('survey comparison preserves coverage, quarantine and exact revision through workbench exports', async ({ page }, testInfo) => {
    await page.goto('/');
    let dialog = await openTools(page);
    await dialog.getByRole('tab', { name: 'Survey comparison', exact: true }).click();
    const [sample] = await Promise.all([page.waitForEvent('download'),
        dialog.getByRole('link', { name: 'Download the synthetic two-survey example' }).click()]);
    const original = await contents(sample);
    const pkg = JSON.parse(original);
    await dialog.getByRole('tab', { name: 'Imports', exact: true }).click();
    await dialog.locator('input[type="file"]').setInputFiles({
        name: sample.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(original)
    });
    await expect(dialog.locator('[data-import-status]')).toContainText('Preview ready');
    await expect(dialog.getByRole('region', { name: 'Package preview' })).toContainText('2 survey(s)');
    await dialog.getByRole('button', { name: 'Apply previewed package' }).click();
    await expect(dialog.locator('[data-import-status]')).toContainText('Added local package');
    await expect(dialog.locator('[data-import-history]')).toContainText('synthetic-survey-comparison, revision 1');

    const openReport = () => dialog.getByRole('tab', { name: 'Survey comparison', exact: true }).click();
    const reopenInSyntheticMode = async () => {
        await dialog.getByRole('button', { name: 'Close research tools' }).click();
        await page.locator('#toggle-synthetic-fixtures').check();
        dialog = await openTools(page);
        await openReport();
    };
    const selectBaseline = () => dialog.getByLabel('Baseline survey').selectOption('local:synthetic-survey-comparison:record:baseline');
    const selectFollowup = () => dialog.getByLabel('Follow-up survey').selectOption('local:synthetic-survey-comparison:record:followup');
    const exportJson = async () => {
        const [download] = await Promise.all([page.waitForEvent('download'),
            dialog.getByRole('button', { name: 'Download comparison JSON' }).click()]);
        return { download, report: JSON.parse(await contents(download)) };
    };
    const checkCoverage = async () => {
        await expect(dialog.locator('[data-region="both"]')).toContainText('Survey reported no thermal anomaly');
        await expect(dialog.locator('[data-region="baseline_only"]')).toContainText('Unknown (outside the reported footprint)');
        await expect(dialog.locator('[data-region="followup_only"] td').first()).toContainText('Unknown');
        await expect(dialog.locator('.survey-region')).toHaveCount(3);
    };

    await openReport();
    await expect(dialog.getByLabel('Baseline survey').locator('option')).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: 'Download comparison JSON' })).toBeDisabled();
    await reopenInSyntheticMode();
    await selectBaseline();
    await expect(dialog.getByText('Comparison pending', { exact: false })).toBeVisible();
    const pending = (await exportJson()).report;
    expect(pending.status).toBe('comparison_pending');
    expect(pending.regions[0].followup).toBe('pending');
    await selectFollowup();
    await checkCoverage();
    const initial = (await exportJson()).report;
    expect(initial.isSynthetic).toBe(true);
    expect(initial.baseline.reviewStatus).toBe('local_unreviewed');
    expect(initial.baseline.originalPackage).toEqual({
        packageId: pkg.packageId, revision: 1, sha256: createHash('sha256').update(original).digest('hex')
    });

    await page.reload();
    dialog = await openTools(page);
    await openReport();
    await expect(dialog.getByLabel('Baseline survey').locator('option')).toHaveCount(1);
    await reopenInSyntheticMode();
    await selectBaseline();
    await selectFollowup();
    await checkCoverage();
    const replay = await exportJson();
    expect(replay.report).toEqual(initial);
    await replay.download.saveAs(testInfo.outputPath('synthetic-survey-comparison.json'));
    const [printed] = await Promise.all([page.waitForEvent('download'),
        dialog.getByRole('button', { name: 'Download printable report' }).click()]);
    const html = await contents(printed);
    expect(html).toContain('Synthetic example.');
    expect(html).toContain('Unknown (outside the reported footprint)');
    expect(html).toContain(initial.baseline.originalPackage.sha256);
    await printed.saveAs(testInfo.outputPath('synthetic-survey-report.html'));
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog.getByRole('table', { name: 'Coverage and reported results' })).toBeVisible();
    expect(await dialog.locator('.workbench-body').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await dialog.getByRole('table', { name: 'Coverage and reported results' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('synthetic-survey-mobile.png') });

    const revised = structuredClone(pkg);
    revised.revision = 2;
    revised.surveys[1].notes += ' Fictional revision for replay verification.';
    await dialog.getByRole('tab', { name: 'Imports', exact: true }).click();
    await preview(page, revised);
    await dialog.getByRole('button', { name: 'Apply previewed package' }).click();
    await expect(dialog.locator('[data-import-history]')).toContainText('synthetic-survey-comparison, revision 2');
    await openReport();
    const final = (await exportJson()).report;
    expect(final.followup.record.id).toBe(initial.followup.record.id);
    expect(final.followup.source.id).toBe(initial.followup.source.id);
    expect(final.followup.originalPackage.revision).toBe(2);
    expect(final.followup.originalPackage.sha256).not.toBe(initial.followup.originalPackage.sha256);
    expect(final.regions).toEqual(initial.regions);
});

test('local evidence preview, revisions, map inspection, exports, reload and removal stay consistent', async ({ page }) => {
    await page.goto('/');
    let dialog = await openTools(page);
    await preview(page, localPackage());
    await expect(dialog.getByRole('region', { name: 'Package preview' })).toContainText('zero accuracy converted to unknown');
    await dialog.getByRole('button', { name: 'Close research tools' }).click();
    await page.locator('[data-tab="records"]').click();
    await expect(page.locator('#tab-records tbody tr')).toHaveCount(1);
    dialog = await openTools(page);
    await dialog.getByRole('button', { name: 'Apply previewed package' }).click();
    await expect(dialog.locator('[data-import-status]')).toContainText('Added local package');
    await expect(dialog.locator('[data-import-history] li')).toHaveCount(1);
    const [original] = await Promise.all([
        page.waitForEvent('download'), dialog.getByRole('button', { name: /Download browser-evidence revision 1 original/ }).click()
    ]);
    expect(await contents(original)).toBe(JSON.stringify(localPackage(), null, 2) + '\n');
    await preview(page, localPackage());
    await expect(dialog.getByRole('region', { name: 'Package preview' })).toContainText('Already imported');
    await dialog.getByRole('button', { name: 'Apply previewed package' }).click();
    await expect(dialog.locator('[data-import-status]')).toContainText('Identical current revision');
    await expect(dialog.locator('[data-import-history] li')).toHaveCount(1);
    await preview(page, localPackage(2));
    await dialog.getByRole('button', { name: 'Apply previewed package' }).click();
    await expect(dialog.locator('[data-import-status]')).toContainText('Replaced local package');
    await expect(dialog.locator('[data-import-history] li')).toHaveCount(2);
    await dialog.getByRole('button', { name: 'Close research tools' }).click();
    await expect(page.locator('#active-mode-notice')).toContainText('unreviewed observations and 1 unreviewed surveys');
    await expect(page.locator('#timeline-date-end')).toHaveValue('2026-10-31');
    await page.locator('[data-tab="records"]').click();
    await expect(page.locator('#tab-records tbody tr')).toHaveCount(3);
    await expect(page.locator('#tab-records')).toContainText('Revised browser report');
    await page.locator('#timeline-date-end').fill('2026-10-15');
    await page.locator('#timeline-date-end').dispatchEvent('change');
    await expect(page.locator('#tab-records')).toContainText('possible date overlap');
    await page.locator('button[data-id="local:browser-evidence:record:observation"]').click();
    await expect(page.locator('#tab-inspector')).toContainText('UNVERIFIED REPORT');
    await expect(page.locator('#tab-inspector')).toContainText('Possible date overlap');
    await expect(page.locator('.assessment-target-marker')).toBeAttached();
    await page.locator('#timeline-date-end').fill('2026-10-31');
    await page.locator('#timeline-date-end').dispatchEvent('change');
    await expect(page.locator('.feature-detail-card')).not.toContainText('Possible date overlap');
    await page.locator('#timeline-date-end').fill('2026-10-15');
    await page.locator('#timeline-date-end').dispatchEvent('change');
    await expect(page.locator('.feature-detail-card')).toContainText('Possible date overlap');
    const [geo] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export-geojson').click()]);
    const exported = JSON.parse(await contents(geo));
    expect(exported.metadata.syntheticWarning).toContain('local unreviewed');
    expect(exported.metadata.locationAssessment.methodVersion).toBe('prb-evidence-context-v2');
    expect(exported.features.find((feature: any) => feature.id === 'local:browser-evidence:record:observation').properties.status).toBe('unverified_report');
    const [brief] = await Promise.all([page.waitForEvent('popup'), page.locator('#btn-export-brief').click()]);
    await expect(brief.getByText('Local unreviewed source', { exact: true })).toBeVisible();
    await expect(brief.locator('body')).toContainText('Day offset unavailable (month precision)');
    await brief.close();
    await page.locator('[data-tab="manifest"]').click();
    await expect(page.locator('#tab-manifest')).toContainText('LOCAL UNREVIEWED SOURCE');
    await expect(page.locator('#tab-manifest')).toContainText('Original package SHA256');
    await page.reload();
    await page.locator('[data-tab="records"]').click();
    await expect(page.locator('#tab-records')).toContainText('Revised browser report');
    await expect(page.locator('#timeline-date-end')).toHaveValue('2026-10-31');
    dialog = await openTools(page);
    await dialog.getByRole('button', { name: 'Remove local imports', exact: true }).click();
    await expect(dialog.locator('[data-import-status]')).toContainText('Removed local imports');
    await expect(dialog.locator('[data-import-history] li')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close research tools' }).click();
    await page.locator('[data-tab="records"]').click();
    await expect(page.locator('#tab-records tbody tr')).toHaveCount(1);
    await page.locator('[data-tab="manifest"]').click();
    await expect(page.locator('#tab-manifest')).not.toContainText('Browser fixture attribution');
});

test('survey-only imports beyond the incident dates are visible after apply and reload', async ({ page }) => {
    await page.goto('/');
    const dialog = await openTools(page);
    await preview(page, localPackage(1, true));
    await dialog.getByRole('button', { name: 'Apply previewed package' }).click();
    await expect(dialog.locator('[data-import-status]')).toContainText('Added local package');
    await dialog.getByRole('button', { name: 'Close research tools' }).click();
    await page.locator('[data-tab="records"]').click();
    await expect(page.locator('#tab-records')).toContainText('Browser survey fixture');
    await expect(page.locator('#active-mode-notice')).toContainText('1 unreviewed surveys');
    await expect(page.locator('#timeline-date-end')).toHaveValue('2026-10-15');
    await page.reload();
    await page.locator('[data-tab="records"]').click();
    await expect(page.locator('#tab-records')).toContainText('Browser survey fixture');
    await expect(page.locator('#active-mode-notice')).toContainText('1 unreviewed surveys');
});

test('the downloadable synthetic sample stays quarantined until explicitly enabled', async ({ page }) => {
    await page.goto('/');
    const dialog = await openTools(page);
    const [sample] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('link', { name: 'Download SYNTHETIC sample package' }).click()]);
    const pkg = JSON.parse(await contents(sample));
    expect(pkg.isSynthetic).toBe(true);
    await preview(page, pkg);
    await dialog.getByRole('button', { name: 'Apply previewed package' }).click();
    await expect(dialog.locator('[data-workbench-evidence-note]')).toContainText('2 synthetic observation(s)');
    await dialog.getByRole('button', { name: 'Close research tools' }).click();
    await page.locator('[data-tab="records"]').click();
    await expect(page.locator('#tab-records tbody tr')).toHaveCount(1);
    await page.locator('#toggle-synthetic-fixtures').check();
    await expect(page.locator('#tab-records')).toContainText('SYNTHETIC Local unreviewed report');
    await page.locator('#toggle-synthetic-fixtures').uncheck();
    await expect(page.locator('#tab-records tbody tr')).toHaveCount(1);
});

test('bad local storage can be recovered and invalid packages never change evidence', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('prbsim.local-evidence.v1', '{broken archive'));
    await page.goto('/');
    const dialog = await openTools(page);
    await expect(dialog.locator('[data-import-persistence]')).toContainText('Saved imports need recovery');
    const [archive] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download saved archive for recovery' }).click()]);
    expect(await contents(archive)).toBe('{broken archive');
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await expect(dialog.locator('[data-import-status]')).toContainText('Package rejected');
    await expect(dialog.getByRole('button', { name: 'Apply previewed package' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Remove local imports', exact: true }).click();
    await expect(dialog.locator('[data-import-persistence]')).toContainText('Browser-local storage');
});

test('a browser storage quota failure keeps the import usable with an honest session-only notice', async ({ page }) => {
    await page.addInitScript(() => {
        const save = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key: string, value: string) {
            if (key === 'prbsim.local-evidence.v1') throw new DOMException('Controlled test quota failure', 'QuotaExceededError');
            save.call(this, key, value);
        };
    });
    await page.goto('/');
    const dialog = await openTools(page);
    await preview(page, localPackage());
    await dialog.getByRole('button', { name: 'Apply previewed package' }).click();
    await expect(dialog.locator('[data-import-status]')).toContainText('Added local package');
    await expect(dialog.locator('[data-import-persistence]')).toContainText('Session only');
    await expect(dialog.locator('[data-import-persistence]')).toContainText('quota or access failure');
    await dialog.getByRole('button', { name: 'Close research tools' }).click();
    await page.locator('[data-tab="records"]').click();
    await expect(page.locator('#tab-records')).toContainText('Browser test report');
    await page.reload();
    await page.locator('[data-tab="records"]').click();
    await expect(page.locator('#tab-records tbody tr')).toHaveCount(1);
});

test('integrated satellite results and remote failures remain independent of evidence', async ({ page }) => {
    let offline = false;
    await page.route('https://earth-search.aws.element84.com/v1/search', route => offline ? route.abort() : route.fulfill({ json: {
        type: 'FeatureCollection', numberMatched: 1, links: [], features: [{ type: 'Feature', collection: 'landsat-c2-l2',
            id: 'LC09_L2SP_035029_20240930_02_T1', bbox: [-107.4, 43.5, -104.4, 45.7],
            properties: { datetime: '2024-09-30T17:48:23Z', 'eo:cloud_cover': 2.57, platform: 'landsat-9' }, links: [], assets: {} }]
    } }));
    await page.goto('/');
    const dialog = await openTools(page);
    await dialog.getByRole('tab', { name: 'Satellite scenes', exact: true }).click();
    await dialog.getByRole('button', { name: 'Find scenes', exact: true }).click();
    await expect(dialog.locator('.satellite-status')).toContainText('1 valid scene record');
    await expect(dialog.getByRole('table')).toContainText('2.57%');
    await page.screenshot({ path: 'test-results/workbench-satellite.png' });
    offline = true;
    await dialog.getByRole('button', { name: 'Find scenes', exact: true }).click();
    await expect(dialog.locator('.satellite-status')).toContainText('could not be reached');
    await dialog.getByRole('button', { name: 'Close research tools' }).click();
    await expect(page.locator('#active-mode-notice')).toContainText('REAL MODE: 1 WFIGS PERIMETER ONLY');
});

test('heat lab runs a real worker and downloads exactly the displayed settings and values', async ({ page }) => {
    await page.goto('/');
    const dialog = await openTools(page);
    await dialog.getByRole('tab', { name: 'Heat lab', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Download heat run JSON' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Run heat comparison', exact: true }).click();
    await expect(dialog.locator('[data-heat-status]')).toContainText('Heat comparison complete');
    await expect(dialog.getByRole('table', { name: 'Depth comparison summary' })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download heat run JSON' }).click()]);
    const run = JSON.parse(await contents(download));
    expect(run.kind).toBe('illustrative_heat_transport');
    expect(run.methodVersion).toBe('conduction-1d-explicit-v1');
    expect(run.parameters.depthAM).toBe(0.25);
    expect(run.parameters.depthBM).toBe(1);
    expect(run.depthSummary[0].peakTemperatureC).toBeGreaterThan(run.depthSummary[1].peakTemperatureC);
    await expect(dialog.getByRole('table', { name: 'Depth comparison summary' })).toContainText(run.depthSummary[0].peakTemperatureC.toFixed(2));
    await dialog.locator('[data-heat-results]').evaluate(element => { element.scrollIntoView(); });
    await page.screenshot({ path: 'test-results/workbench-heat.png' });
    await dialog.getByLabel('Depth A (m)', { exact: true }).fill('0.5');
    await expect(dialog.getByRole('button', { name: 'Download heat run JSON' })).toBeDisabled();
    await expect(dialog.locator('[data-heat-results]')).toBeEmpty();
});

test('research tools remain readable without horizontal scrolling on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const dialog = await openTools(page);
    await preview(page, localPackage());
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await dialog.locator('.workbench-body').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await dialog.getByRole('button', { name: 'Apply previewed package' }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: 'Apply previewed package' })).toBeInViewport();
    await page.screenshot({ path: 'test-results/workbench-mobile.png' });
});
