/**
 * Geometry adapter for the Powder River Basin (PRB) Evidence Explorer.
 *
 * Wraps @turf/point-to-polygon-distance and @turf/boolean-point-in-polygon
 * providing strict runtime validation, geodesic metric distance, and numerical boundary classification.
 */

import pointToPolygonDistance from '@turf/point-to-polygon-distance';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { ValidationError } from './load.ts';

export type LonLat = [number, number];

/**
 * Validates a [lon, lat] coordinate pair for finite WGS84 bounds.
 */
export function validatePointCoordinates(point: unknown): LonLat {
    if (!Array.isArray(point) || point.length < 2) {
        throw new ValidationError(`Invalid point coordinate pair: expected [lon, lat] array`);
    }
    const [lon, lat] = point;
    if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) {
        throw new ValidationError(`Coordinate contains NaN or non-finite numbers: [${lon}, ${lat}]`);
    }
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        throw new ValidationError(`Coordinate out of WGS84 range: lon=${lon}, lat=${lat}`);
    }
    return [lon, lat];
}

/**
 * Validates a GeoJSON Polygon or MultiPolygon object.
 */
export function validatePolygonGeometry(geometry: unknown): GeoJSON.Polygon | GeoJSON.MultiPolygon {
    if (!geometry || typeof geometry !== 'object') {
        throw new ValidationError(`Invalid geometry: expected GeoJSON Polygon or MultiPolygon`);
    }
    const geom = geometry as GeoJSON.Geometry;
    if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') {
        throw new ValidationError(`Unsupported geometry type '${geom.type}', expected Polygon or MultiPolygon`);
    }
    if (!Array.isArray(geom.coordinates) || geom.coordinates.length === 0) {
        throw new ValidationError(`Geometry coordinates array must not be empty`);
    }
    return geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

/**
 * Calculates the approximate geodesic boundary distance in meters from a point to the nearest
 * perimeter edge (exterior ring or interior hole boundary).
 */
export function approximateBoundaryDistanceMeters(
    point: LonLat,
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
): number {
    const validPoint = validatePointCoordinates(point);
    const validGeom = validatePolygonGeometry(geometry);

    // If point lies directly on a polygon edge or vertex in GeoJSON space
    if (
        booleanPointInPolygon(validPoint, validGeom) &&
        !booleanPointInPolygon(validPoint, validGeom, { ignoreBoundary: true })
    ) {
        return 0;
    }

    const distMeters = pointToPolygonDistance(validPoint, validGeom, {
        units: 'meters',
        method: 'geodesic'
    });
    return Math.abs(distMeters);
}

/**
 * Classifies whether a point is inside, outside, or on the boundary of a Polygon or MultiPolygon.
 *
 * Uses boundary-inclusive and boundary-exclusive planar containment checks alongside
 * geodesic metric distance against `boundaryToleranceMeters` (default 0.01m).
 * Points inside holes are classified as 'outside'.
 */
export function classifyPointInGeometry(
    point: LonLat,
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
    boundaryToleranceMeters: number = 0.01
): 'inside' | 'outside' | 'boundary' {
    const validPoint = validatePointCoordinates(point);
    const validGeom = validatePolygonGeometry(geometry);

    const isInsideInclusive = booleanPointInPolygon(validPoint, validGeom);
    const isInsideExclusive = booleanPointInPolygon(validPoint, validGeom, { ignoreBoundary: true });

    // 1. Point lies directly on boundary ring (edge or vertex)
    if (isInsideInclusive && !isInsideExclusive) {
        return 'boundary';
    }

    // 2. Numerical tolerance: check if geodesic metric distance to boundary is within threshold
    const distMeters = pointToPolygonDistance(validPoint, validGeom, {
        units: 'meters',
        method: 'geodesic'
    });
    const absDist = Math.abs(distMeters);

    if (absDist <= boundaryToleranceMeters) {
        return 'boundary';
    }

    // 3. Containment determination
    if (isInsideExclusive) {
        return 'inside';
    }

    return 'outside';
}
