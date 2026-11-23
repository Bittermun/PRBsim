import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

export function observationServer(directory, onRead = () => {}) {
    return createServer(async (request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const current = pathname === '/current.geojson';
        if (!['GET', 'HEAD'].includes(request.method)) {
            response.writeHead(405, { Allow: 'GET, HEAD' }).end();
            return;
        }
        if (!current && !/^\/releases\/[1-9][0-9]*\.geojson$/.test(pathname)) {
            response.writeHead(404).end();
            return;
        }
        try {
            const bytes = await readFile(join(directory, pathname.slice(1)));
            const sha256 = createHash('sha256').update(bytes).digest('hex');
            const etag = `"${sha256}"`;
            const headers = {
                'Content-Type': 'application/geo+json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': current ? 'no-cache, must-revalidate' : 'public, max-age=31536000, immutable',
                ETag: etag,
            };
            const status = request.headers['if-none-match'] === etag ? 304 : 200;
            response.writeHead(status, status === 200 ? { ...headers, 'Content-Length': bytes.length } : headers);
            response.end(status === 200 && request.method === 'GET' ? bytes : undefined);
            if (request.method === 'GET') onRead({ pathname, status, sha256, agent: request.headers['user-agent'] ?? '' });
        } catch (error) {
            response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
        }
    });
}

if (import.meta.main) {
    const [directory, port = '8175'] = process.argv.slice(2);
    if (!directory) {
        console.error('Usage: node scripts/prb/serve_observations.mjs RELEASE_DIRECTORY [PORT]');
        process.exit(2);
    }
    observationServer(directory, entry => console.log(JSON.stringify(entry))).listen(Number(port), '127.0.0.1', function () {
        console.log(`Observation layer: http://127.0.0.1:${this.address().port}/current.geojson`);
    });
}
