import { test } from 'node:test';
import assert from 'node:assert/strict';

const ui = await import('../../src/prb/ui/ImportPanel.ts').catch(() => null);

test('import preview escapes untrusted metadata and validation messages', () => {
    assert.equal(typeof ui?.renderImportPreview, 'function', 'Local intake preview renderer must exist');
    const html = ui.renderImportPreview({ valid: false, action: 'reject', packageId: '<img src=x onerror=alert(1)>', revision: 1,
        isSynthetic: true, counts: { sources: 1, sites: 1, observations: 1, surveys: 0 },
        sourceNames: ['<script>alert(2)</script>'], warnings: ['<svg onload=alert(3)>'],
        issues: [{ path: '<b>metadata</b>', message: '<iframe src=bad>' }] });
    assert.ok(!/<(?:img|script|svg|iframe|b)>?/.test(html));
    assert.ok(html.includes('&lt;img'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.match(html, /1 (?:validation )?error/i);
    assert.match(html, /SYNTHETIC/);
});
