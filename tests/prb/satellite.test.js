import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateSatelliteQuery,
    buildSatelliteSearch,
    parseSatelliteResults,
    safeSatelliteSourceUrl,
    searchSatelliteScenes,
    SatelliteSearchSession
} from '../../src/prb/data/satellite.ts';

const query = {
    bbox: [-106.5, 44.75, -105.7, 45.5],
    startDate: '2024-08-01',
    endDate: '2024-10-01',
    maxCloudCover: 30,
    limit: 3
};

// Deterministic STAC fixtures; no network calls in this suite.
function feature(overrides = {}) {
    return {
        type: 'Feature',
        stac_version: '1.0.0',
        id: 'LC09_L2SP_035029_20240930_02_T1',
        collection: 'landsat-c2-l2',
        bbox: [-107.425435, 43.51039, -104.404995, 45.678337],
        geometry: { type: 'Polygon', coordinates: [[[-107.4, 43.6], [-104.5, 43.6], [-104.5, 45.6], [-107.4, 45.6], [-107.4, 43.6]]] },
        properties: { datetime: '2024-09-30T17:48:23.000778Z', 'eo:cloud_cover': 2.57, platform: 'landsat-9' },
        links: [
            { rel: 'self', href: 'https://earth-search.aws.element84.com/v1/collections/landsat-c2-l2/items/LC09_L2SP_035029_20240930_02_T1' },
            { rel: 'via', href: 'https://landsatlook.usgs.gov/stac-server/collections/landsat-c2l2-sr/items/LC09_L2SP_035029_20240930_20241001_02_T1_SR' },
            { rel: 'cite-as', href: 'https://doi.org/10.5066/P9OGBGM6' }
        ],
        assets: {},
        ...overrides
    };
}

function collection(features = [], extra = {}) {
    return { type: 'FeatureCollection', features, links: [], numberMatched: features.length, ...extra };
}

function jsonResponse(payload, init = {}) {
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/geo+json' }, ...init });
}

describe('Satellite query validation', () => {
    it('builds inclusive UTC bounds with scene-wide cloud filtering and bounded latest-first results', () => {
        assert.deepEqual(buildSatelliteSearch(query), {
            collections: ['landsat-c2-l2'],
            bbox: [-106.5, 44.75, -105.7, 45.5],
            datetime: '2024-08-01T00:00:00Z/2024-10-01T23:59:59.999Z',
            limit: 3,
            query: { 'eo:cloud_cover': { lte: 30 } },
            sortby: [{ field: 'properties.datetime', direction: 'desc' }]
        });
    });

    it('preserves leap days and takes an independent copy of geographic bounds', () => {
        const original = { ...query, startDate: '2024-02-29' };
        const validated = validateSatelliteQuery(original);
        original.bbox[0] = 0;
        assert.equal(validated.startDate, '2024-02-29');
        assert.equal(validated.bbox[0], -106.5);
        original.bbox[0] = -106.5;
    });

    it('rejects nonexistent, incomplete and inverted calendar dates', () => {
        for (const input of [
            { startDate: '2023-02-29' }, { endDate: '2024-09-31' },
            { startDate: '2024-8-01' }, { startDate: '0000-01-01' },
            { startDate: '2024-10-02' }, { endDate: 'not-a-date' }
        ]) assert.throws(() => validateSatelliteQuery({ ...query, ...input }), /date|calendar|window/i);
    });

    it('rejects malformed, out-of-range, zero-area and antimeridian bounds', () => {
        for (const bbox of [null, [], [0, 0, 1], ['0', 0, 1, 1], [NaN, 0, 1, 1], [-181, 0, 1, 1], [0, -91, 1, 1], [0, 0, 181, 1], [0, 0, 1, 91], [1, 0, 1, 1], [0, 1, 1, 0], [179, 0, -179, 1]]) {
            assert.throws(() => validateSatelliteQuery({ ...query, bbox }), /bound|longitude|latitude|area|antimeridian/i);
        }
    });

    it('rejects nonfinite cloud percentages and excessive, fractional or missing limits', () => {
        for (const maxCloudCover of [-1, 101, NaN, Infinity, '20', null]) {
            assert.throws(() => validateSatelliteQuery({ ...query, maxCloudCover }), /cloud/i);
        }
        for (const limit of [0, 101, -1, 2.5, NaN, '3', null]) {
            assert.throws(() => validateSatelliteQuery({ ...query, limit }), /limit/i);
        }
        const { limit: unused, ...noLimit } = query;
        assert.equal(validateSatelliteQuery(noLimit).limit, 30);
    });
});

describe('Satellite metadata validation', () => {
    it('returns validated scene metadata and provider links without claiming pixel usability', () => {
        const result = parseSatelliteResults(collection([feature()], { numberMatched: 22 }), query);
        assert.equal(result.scenes.length, 1);
        assert.equal(result.scenes[0].datetime, '2024-09-30T17:48:23.000778Z');
        assert.equal(result.scenes[0].cloudCover, 2.57);
        assert.equal(result.scenes[0].platform, 'landsat-9');
        assert.equal(result.scenes[0].metadataUrl, 'https://earth-search.aws.element84.com/v1/collections/landsat-c2-l2/items/LC09_L2SP_035029_20240930_02_T1');
        assert.equal(result.scenes[0].providerLinks.length, 2);
        assert.equal(result.matchedCount, 22);
        assert.equal(result.hasMore, true);
        assert.equal('temperature' in result.scenes[0], false);
        assert.equal('usablePixelCount' in result.scenes[0], false);
    });

    it('represents a genuine empty page and rejects a malformed collection envelope', () => {
        const result = parseSatelliteResults(collection(), query);
        assert.deepEqual(result.scenes, []);
        assert.equal(result.receivedCount, 0);
        assert.equal(result.rejectedCount, 0);
        assert.equal(result.hasMore, false);
        for (const body of [null, [], {}, { type: 'FeatureCollection', features: {} }, { type: 'Feature', features: [] }]) {
            assert.throws(() => parseSatelliteResults(body, query), /response|collection|metadata/i);
        }
    });

    it('rejects invalid ids, collections, scene dates, bounds and cloud values', () => {
        const badFeatures = [
            feature({ id: '<script>alert(1)</script>' }), feature({ id: '' }),
            feature({ collection: 'sentinel-2-l2a' }), feature({ type: 'Collection' }),
            feature({ bbox: [-181, 0, 1, 1] }), feature({ bbox: undefined }),
            feature({ properties: { datetime: '2024-09-31T12:00:00Z', 'eo:cloud_cover': 2 } }),
            feature({ properties: { datetime: '2024-09-30', 'eo:cloud_cover': 2 } }),
            feature({ properties: { datetime: '2024-09-30T25:00:00Z', 'eo:cloud_cover': 2 } }),
            feature({ properties: { datetime: '2024-09-30T12:00:00Z', 'eo:cloud_cover': -1 } }),
            feature({ properties: { datetime: '2024-09-30T12:00:00Z', 'eo:cloud_cover': 101 } }),
            feature({ properties: { datetime: '2024-09-30T12:00:00Z', 'eo:cloud_cover': '2' } }),
            feature({ properties: { datetime: '2024-09-30T12:00:00Z' } })
        ];
        const result = parseSatelliteResults(collection(badFeatures), { ...query, limit: 30 });
        assert.equal(result.scenes.length, 0);
        assert.equal(result.rejectedCount, 13);
    });

    it('checks server filtering, removes duplicates and sorts validated scenes by actual acquisition time', () => {
        const first = feature();
        const older = feature({ id: 'LC08_OLDER', properties: { datetime: '2024-08-03T12:00:00Z', 'eo:cloud_cover': 0 } });
        const result = parseSatelliteResults(collection([
            older, first, first,
            feature({ id: 'CLOUDY', properties: { datetime: '2024-09-30T12:00:00Z', 'eo:cloud_cover': 31 } }),
            feature({ id: 'LATER', properties: { datetime: '2024-10-02T00:00:00Z', 'eo:cloud_cover': 0 } }),
            feature({ id: 'ELSEWHERE', bbox: [0, 0, 1, 1] })
        ]), { ...query, limit: 30 });
        assert.deepEqual(result.scenes.map(scene => scene.id), ['LC09_L2SP_035029_20240930_02_T1', 'LC08_OLDER']);
        assert.equal(result.filteredCount, 3);
        assert.equal(result.duplicateCount, 1);
    });

    it('caps even an oversized page and never follows a pagination URL', () => {
        const features = Array.from({ length: 9 }, (_, i) => feature({ id: `SCENE_${i}` }));
        const result = parseSatelliteResults(collection(features, { links: [{ rel: 'next', href: 'javascript:alert(1)' }] }), query);
        assert.equal(result.scenes.length, 3);
        assert.equal(result.receivedCount, 9);
        assert.equal(result.omittedCount, 6);
        assert.equal(result.hasMore, true);
    });

    it('omits unsafe or unrecognized provider links and derives the catalog URL from the validated id', () => {
        const unsafe = ['javascript:alert(1)', 'http://landsatlook.usgs.gov/item', 'https://user:password@landsatlook.usgs.gov/item', '//landsatlook.usgs.gov/item', 'https://landsatlook.usgs.gov.evil.test/item', 'https://evil.test/item', 'https://landsatlook.usgs.gov:444/item', 'https://landsatlook.usgs.gov/with\nnewline'];
        for (const url of unsafe) assert.equal(safeSatelliteSourceUrl(url), null);
        assert.equal(safeSatelliteSourceUrl('https://doi.org/10.5066/P9OGBGM6'), 'https://doi.org/10.5066/P9OGBGM6');
        const result = parseSatelliteResults(collection([feature({ links: unsafe.map(href => ({ rel: 'via', href })) })]), query);
        assert.deepEqual(result.scenes[0].providerLinks, []);
        assert.ok(result.scenes[0].metadataUrl.startsWith('https://earth-search.aws.element84.com/'));
    });
});

describe('Satellite remote-search lifecycle', () => {
    it('sends one public metadata POST with no browser credentials and validates its response', async () => {
        let request;
        const result = await searchSatelliteScenes(query, { fetchImpl: async (url, options) => {
            request = { url, options };
            return jsonResponse(collection([feature()]));
        } });
        assert.equal(request.url, 'https://earth-search.aws.element84.com/v1/search');
        assert.equal(request.options.method, 'POST');
        assert.equal(request.options.credentials, 'omit');
        assert.equal(request.options.mode, 'cors');
        assert.equal(request.options.redirect, 'error');
        assert.equal(JSON.parse(request.options.body).datetime, '2024-08-01T00:00:00Z/2024-10-01T23:59:59.999Z');
        assert.equal(result.scenes.length, 1);
    });

    it('keeps no-results distinct from network, HTTP and invalid JSON failures', async () => {
        const empty = await searchSatelliteScenes(query, { fetchImpl: async () => jsonResponse(collection()) });
        assert.equal(empty.scenes.length, 0);
        await assert.rejects(searchSatelliteScenes(query, { fetchImpl: async () => { throw new TypeError('offline secret'); } }), /catalog|connection|network/i);
        await assert.rejects(searchSatelliteScenes(query, { fetchImpl: async () => new Response('<unsafe server detail>', { status: 503 }) }), /503/);
        await assert.rejects(searchSatelliteScenes(query, { fetchImpl: async () => new Response('not json') }), /metadata|JSON|response/i);
    });

    it('rejects an oversized metadata transfer before parsing it', async () => {
        await assert.rejects(searchSatelliteScenes(query, { fetchImpl: async () => new Response('{}', { headers: { 'Content-Length': '999999999' } }) }), /size|large|limit/i);
    });

    it('does not call the catalog for a rejected or already-aborted query', async () => {
        let calls = 0;
        const fetchImpl = async () => { calls += 1; return jsonResponse(collection()); };
        await assert.rejects(searchSatelliteScenes({ ...query, maxCloudCover: -1 }, { fetchImpl }), /cloud/i);
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(searchSatelliteScenes(query, { fetchImpl, signal: controller.signal }), { name: 'AbortError' });
        assert.equal(calls, 0);
    });

    it('times out even when a transport ignores abort and rejects late success', async () => {
        let resolveTransport;
        const pending = searchSatelliteScenes(query, { timeoutMs: 5, fetchImpl: () => new Promise(resolve => { resolveTransport = resolve; }) });
        await assert.rejects(pending, /timed out/i);
        resolveTransport(jsonResponse(collection([feature()])));
    });

    it('new queries cancel old searches and reject stale metadata from an abort-ignoring transport', async () => {
        const pending = [];
        const session = new SatelliteSearchSession({ fetchImpl: (_url, options) => new Promise(resolve => { pending.push({ resolve, signal: options.signal }); }) });
        const first = session.search(query);
        const firstRejected = assert.rejects(first, { name: 'AbortError' });
        const second = session.search({ ...query, maxCloudCover: 5 });
        assert.equal(pending[0].signal.aborted, true);
        pending[1].resolve(jsonResponse(collection([feature({ id: 'NEW_RESULT' })])));
        assert.equal((await second).scenes[0].id, 'NEW_RESULT');
        pending[0].resolve(jsonResponse(collection([feature({ id: 'OLD_RESULT' })])));
        await firstRejected;
        session.cancel();
    });

    it('cancel rejects a pending search immediately and permits a later search', async () => {
        let resolveTransport;
        let calls = 0;
        const session = new SatelliteSearchSession({ fetchImpl: async () => {
            calls += 1;
            if (calls === 1) return new Promise(resolve => { resolveTransport = resolve; });
            return jsonResponse(collection());
        } });
        const pending = session.search(query);
        const rejected = assert.rejects(pending, { name: 'AbortError' });
        session.cancel();
        await rejected;
        resolveTransport(jsonResponse(collection([feature()])));
        assert.equal((await session.search(query)).scenes.length, 0);
    });
});
