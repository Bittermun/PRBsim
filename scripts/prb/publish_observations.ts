import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_IMPORT_BYTES, validateEvidencePackage } from '../../src/prb/data/import.ts';
import { buildObservationRelease, MAX_RELEASE_BYTES, validateObservationRelease } from '../../src/prb/data/observation-publication.ts';

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const parse = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

export function publishObservations(packagePath: string, notesPath: string, output: string) {
    const original = readFileSync(packagePath);
    if (original.byteLength > MAX_IMPORT_BYTES) throw new Error('The original package exceeds 2 MiB.');
    const pkg = validateEvidencePackage(parse(original), { allowEmpty: true });
    const notes = parse(readFileSync(notesPath)) as { releasedOn: string; reasons: Record<string, string> };
    const archives = join(output, 'releases');
    mkdirSync(archives, { recursive: true });
    const lock = join(output, '.publish-lock');
    mkdirSync(lock);
    const currentPath = join(output, 'current.geojson');
    const draft = join(output, `.release-${randomUUID()}.tmp`);
    try {
        const current = existsSync(currentPath) ? readFileSync(currentPath) : null;
        const latest = current && validateObservationRelease(parse(current));
        const retry = latest?.release.revision === pkg.revision;
        let parent: { data: ReturnType<typeof validateObservationRelease>; sha256: string } | null = null;
        if (latest && current) {
            const archive = readFileSync(join(archives, `${latest.release.revision}.geojson`));
            if (!current.equals(archive)) throw new Error('The current layer disagrees with its archived revision.');
            const reference = latest.release.previous;
            if (retry && reference) {
                const bytes = readFileSync(join(archives, `${reference.revision}.geojson`));
                if (sha256(bytes) !== reference.sha256) throw new Error('The previous archive checksum changed.');
                parent = { data: validateObservationRelease(parse(bytes)), sha256: reference.sha256 };
            } else if (!retry) {
                parent = { data: latest, sha256: sha256(current) };
            }
        }
        const release = buildObservationRelease(pkg, notes, sha256(original), parent);
        const bytes = Buffer.from(JSON.stringify(release, null, 2) + '\n');
        if (bytes.byteLength > MAX_RELEASE_BYTES) throw new Error('The observation layer exceeds 8 MiB.');
        const archivePath = join(archives, `${release.release.revision}.geojson`);
        if (existsSync(archivePath)) {
            if (!bytes.equals(readFileSync(archivePath))) throw new Error('An archived revision already has different content.');
        } else {
            // Stage complete bytes before installing the immutable archive.
            writeFileSync(draft, bytes, { flag: 'wx' });
            renameSync(draft, archivePath);
        }
        if (!retry) {
            writeFileSync(draft, bytes, { flag: 'wx' });
            renameSync(draft, currentPath);
        }
        return { archivePath, currentPath, sha256: sha256(bytes), release: release.release };
    } finally {
        if (existsSync(draft)) unlinkSync(draft);
        rmdirSync(lock);
    }
}

if (import.meta.main) {
    const [packagePath, notesPath, output] = process.argv.slice(2);
    if (!packagePath || !notesPath || !output) {
        console.error('Usage: node scripts/prb/publish_observations.ts PACKAGE RELEASE_NOTES OUTPUT_DIRECTORY');
        process.exit(2);
    }
    try {
        console.log(JSON.stringify(publishObservations(packagePath, notesPath, output), null, 2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
