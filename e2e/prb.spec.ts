import { test, expect } from '@playwright/test';

test.describe('Powder River Basin Coal-Fire Evidence Explorer E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads application and enforces default Real Mode epistemic quarantine', async ({ page }) => {
    // 1. Verify Application Title & Branding
    await expect(page).toHaveTitle(/Powder River Basin Coal-Fire Evidence Explorer/);
    await expect(page.locator('.brand-title')).toHaveText('POWDER RIVER BASIN COAL-FIRE EVIDENCE EXPLORER');
    await expect(page.locator('.study-area-tag').first()).toHaveText('CASE STUDY: REMINGTON WILDFIRE (2024)');

    // 2. Verify Verified Real Mode Badge
    const modeBadge = page.locator('#active-mode-notice');
    await expect(modeBadge).toContainText('REAL MODE: 1 WFIGS PERIMETER ONLY');
    await expect(modeBadge).toHaveClass(/status-field_confirmed/);

    // 3. Verify Structural Containers
    await expect(page.locator('#prb-map-container')).toBeVisible();
    await expect(page.locator('#evidence-panel-container')).toBeVisible();
    await expect(page.locator('#legend-card-container')).toBeVisible();
    await expect(page.locator('#timeline-control-container')).toBeVisible();

    // 4. Verify Evidence Panel Tabs
    const tabs = page.locator('.panel-tab-btn');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toHaveText('INSPECTOR');
    await expect(tabs.nth(1)).toHaveText('RECORDS TABLE');
    await expect(tabs.nth(2)).toHaveText('DATA GAPS & MATRIX');
    await expect(tabs.nth(3)).toHaveText('PROVENANCE');
  });

  test('navigates through evidence panel tabs and validates records, data gaps, and provenance', async ({ page }) => {
    // 1. Tab: Records Table
    await page.locator('.panel-tab-btn[data-tab="records"]').click();
    const recordsPane = page.locator('#tab-records');
    await expect(recordsPane).toBeVisible();

    // In default Real Mode, exactly 1 perimeter record exists, no synthetic records
    const tableRows = recordsPane.locator('tbody tr');
    await expect(tableRows).toHaveCount(1);
    await expect(tableRows.first()).toContainText('Remington Wildfire');
    await expect(tableRows.first()).toContainText('196,368.1 ac');

    // 2. Tab: Data Gaps & Matrix
    await page.locator('.panel-tab-btn[data-tab="gaps"]').click();
    const gapsPane = page.locator('#tab-gaps');
    await expect(gapsPane).toBeVisible();
    await expect(gapsPane).toContainText('Explicit Data Gap Checklist');
    await expect(gapsPane).toContainText('Remington Case Study Evidence');
    await expect(gapsPane).toContainText('Audited Public Agencies & Catalogs');

    // 3. Tab: Provenance & SHA256 Hashes
    await page.locator('.panel-tab-btn[data-tab="manifest"]').click();
    const manifestPane = page.locator('#tab-manifest');
    await expect(manifestPane).toBeVisible();
    await expect(manifestPane).toContainText('Dataset Provenance & SHA256 Manifest');
    await expect(manifestPane).toContainText('EMPIRICAL AGENCY RECORD');
    await expect(manifestPane).toContainText('1c0f9dd951286449d08045278f27a39b150b960f39f52cf47d25a0808582cc72');
  });

  test('inspects user-selected coordinates and computes spatial containment & boundary distance', async ({ page }) => {
    const latInput = page.locator('#input-lat');
    const lonInput = page.locator('#input-lon');
    const submitBtn = page.locator('#coord-inspect-form button[type="submit"]');

    // A. Inspect coordinate INSIDE Remington Wildfire Perimeter [-106.45, 45.10]
    await latInput.fill('45.10000');
    await lonInput.fill('-106.45000');
    await submitBtn.click();

    const inspector = page.locator('#tab-inspector');
    await expect(inspector.locator('.badge-assessment')).toHaveText('SPATIOTEMPORAL EVIDENCE INSPECTOR');
    await expect(inspector.locator('h3')).toHaveText('User-Selected Query Coordinate');
    await expect(inspector.locator('.assessment-coords')).toContainText('45.10000°N, -106.45000°W');

    // Verify Nominal Relation badge shows INSIDE
    const relStatus = inspector.locator('.assessment-rel-item .status-badge');
    await expect(relStatus).toHaveText('INSIDE');
    await expect(relStatus).toHaveClass(/status-confirmed/);

    // Verify approximate boundary distance is rendered
    await expect(inspector.locator('.assessment-rel-item')).toContainText('m (approximate)');

    // Verify Epistemic Caveats are rendered without probability claims
    const caveats = inspector.locator('.caveats-list li');
    await expect(caveats.first()).toContainText('Causal direction unresolved');
    await expect(caveats.nth(1)).toContainText('retrospective final footprint');
    await expect(inspector.locator('#btn-download-assessment-csv')).toBeVisible();

    // Verify no synthetic influence warning in Real Mode
    await expect(inspector.locator('.callout-box.warning:has-text("SYNTHETIC INFLUENCE")')).toHaveCount(0);

    // B. Inspect coordinate OUTSIDE Remington Wildfire Perimeter [-105.50, 44.50]
    await latInput.fill('44.50000');
    await lonInput.fill('-105.50000');
    await submitBtn.click();

    const outsideRelStatus = inspector.locator('.assessment-rel-item .status-badge');
    await expect(outsideRelStatus).toHaveText('OUTSIDE');

    // C. Clear Selection
    const clearBtn = page.locator('#btn-clear-inspect');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();

    await expect(page.locator('.empty-state h3')).toHaveText('Select a Map Feature or Enter Coordinates');
  });

  test('toggles synthetic fixtures and displays synthetic influence warnings', async ({ page }) => {
    const synthCheckbox = page.locator('#toggle-synthetic-fixtures');
    const modeBadge = page.locator('#active-mode-notice');

    // 1. Enable Synthetic Validation Fixtures
    await synthCheckbox.check();

    // Verify mode badge updates with warning styling
    await expect(modeBadge).toContainText('SYNTHETIC VALIDATION FIXTURES & SCHEMATIC GEOLOGY ACTIVE');
    await expect(modeBadge).toHaveClass(/status-sensor_detection/);

    // 2. Verify Records Table now contains synthetic observations and geology
    await page.locator('.panel-tab-btn[data-tab="records"]').click();
    const rows = page.locator('#tab-records tbody tr');
    // In synthetic mode, multiple fixture rows exist
    const count = await rows.count();
    expect(count).toBeGreaterThan(1);

    // 3. Inspect a coordinate that intersects schematic geology
    await page.locator('.panel-tab-btn[data-tab="inspector"]').click();
    await page.locator('#input-lat').fill('45.05000');
    await page.locator('#input-lon').fill('-106.10000');
    await page.locator('#coord-inspect-form button[type="submit"]').click();

    // Verify Synthetic Influence warning appears
    const synthNotice = page.locator('.callout-box.warning:has-text("SYNTHETIC INFLUENCE")');
    await expect(synthNotice).toBeVisible();

    // 4. Disable Synthetic Mode and verify clean restoration
    await synthCheckbox.uncheck();
    await expect(modeBadge).toContainText('REAL MODE: 1 WFIGS PERIMETER ONLY');
  });

  test('toggles UI theme between light and dark modes', async ({ page }) => {
    const themeBtn = page.locator('#btn-toggle-theme');
    const html = page.locator('html');

    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(themeBtn).toHaveText('🌙 DARK THEME');

    // Toggle to Dark
    await themeBtn.click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(themeBtn).toHaveText('☀️ LIGHT THEME');

    // Toggle back to Light
    await themeBtn.click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(themeBtn).toHaveText('🌙 DARK THEME');
  });

  test('triggers GeoJSON, CSV, and Assessment exports with proper quarantine checks', async ({ page }) => {
    // 1. Trigger GeoJSON download
    const [geoDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#btn-export-geojson').click()
    ]);
    expect(geoDownload.suggestedFilename()).toMatch(/^prb-remington-evidence-.*\.geojson$/);

    // 2. Trigger CSV download
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#btn-export-csv').click()
    ]);
    expect(csvDownload.suggestedFilename()).toMatch(/^prb-remington-evidence-.*\.csv$/);

    // 3. Inspect coordinate and trigger Assessment CSV download
    await page.locator('#input-lat').fill('45.01000');
    await page.locator('#input-lon').fill('-106.08000');
    await page.locator('#coord-inspect-form button[type="submit"]').click();

    const [assessDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#btn-download-assessment-csv').click()
    ]);
    expect(assessDownload.suggestedFilename()).toMatch(/^prb-assessment-.*\.csv$/);
  });

  test('toggles map legend layers, basemap selection, and perspective', async ({ page }) => {
    // 1. Perspective Toggle
    const perspBtn = page.locator('#btn-toggle-perspective');
    await expect(page.locator('#perspective-label')).toHaveText('2D NORTH-UP');
    await perspBtn.click();
    await expect(page.locator('#perspective-label')).toHaveText('3D OBLIQUE (35° PITCH)');
    await perspBtn.click();
    await expect(page.locator('#perspective-label')).toHaveText('2D NORTH-UP');

    // 2. Basemap Dropdown
    const basemapSelect = page.locator('#basemap-select');
    await expect(basemapSelect).toHaveValue('positron');
    await basemapSelect.selectOption('contour');
    await expect(basemapSelect).toHaveValue('contour');

    // 3. Layer Toggles
    const perimToggle = page.locator('#layer-perim');
    await expect(perimToggle).toBeChecked();
    await perimToggle.uncheck();
    await expect(perimToggle).not.toBeChecked();
  });
});
