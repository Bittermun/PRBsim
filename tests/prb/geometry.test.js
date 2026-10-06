/**
 * Unit Tests for PRB Geometry Adapter (src/prb/data/geometry.ts)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    classifyPointInGeometry,
    approximateBoundaryDistanceMeters,
    validatePointCoordinates,
    validatePolygonGeometry
} from '../../src/prb/data/geometry.ts';
import { ValidationError } from '../../src/prb/data/load.ts';

describe('PRB Geometry Adapter: Containment & Boundary Distance', () => {
    // 1. Simple square in Powder River Basin area [-106.5 to -105.5, 44.5 to 45.5]
    const squarePoly = {
        type: 'Polygon',
        coordinates: [
            [
                [-106.5, 44.5],
                [-105.5, 44.5],
                [-105.5, 45.5],
                [-106.5, 45.5],
                [-106.5, 44.5]
            ]
        ]
    };

    it('classifies points inside, outside, and on boundary of a simple polygon', () => {
        // Center of square -> inside
        assert.equal(classifyPointInGeometry([-106.0, 45.0], squarePoly), 'inside');

        // Well outside -> outside
        assert.equal(classifyPointInGeometry([-107.0, 45.0], squarePoly), 'outside');
        assert.equal(classifyPointInGeometry([-106.0, 46.0], squarePoly), 'outside');

        // Exactly on edge -> boundary
        assert.equal(classifyPointInGeometry([-105.5, 45.0], squarePoly), 'boundary');
        assert.equal(classifyPointInGeometry([-106.0, 44.5], squarePoly), 'boundary');

        // Exactly on corner vertex -> boundary
        assert.equal(classifyPointInGeometry([-106.5, 44.5], squarePoly), 'boundary');
    });

    it('correctly handles polygon holes (donut polygons)', () => {
        const donutPoly = {
            type: 'Polygon',
            coordinates: [
                // Exterior ring
                [
                    [-106.5, 44.5],
                    [-105.5, 44.5],
                    [-105.5, 45.5],
                    [-106.5, 45.5],
                    [-106.5, 44.5]
                ],
                // Interior hole [-106.2 to -105.8, 44.8 to 45.2]
                [
                    [-106.2, 44.8],
                    [-105.8, 44.8],
                    [-105.8, 45.2],
                    [-106.2, 45.2],
                    [-106.2, 44.8]
                ]
            ]
        };

        // Center inside the hole -> outside the polygon
        assert.equal(classifyPointInGeometry([-106.0, 45.0], donutPoly), 'outside');

        // On the hole boundary -> boundary
        assert.equal(classifyPointInGeometry([-106.2, 45.0], donutPoly), 'boundary');

        // Between exterior and interior ring -> inside
        assert.equal(classifyPointInGeometry([-106.4, 45.0], donutPoly), 'inside');

        // Outside exterior ring -> outside
        assert.equal(classifyPointInGeometry([-107.0, 45.0], donutPoly), 'outside');
    });

    it('correctly handles MultiPolygon geometries', () => {
        const multiPoly = {
            type: 'MultiPolygon',
            coordinates: [
                [
                    [
                        [-106.5, 44.5],
                        [-106.0, 44.5],
                        [-106.0, 45.0],
                        [-106.5, 45.0],
                        [-106.5, 44.5]
                    ]
                ],
                [
                    [
                        [-105.5, 44.5],
                        [-105.0, 44.5],
                        [-105.0, 45.0],
                        [-105.5, 45.0],
                        [-105.5, 44.5]
                    ]
                ]
            ]
        };

        // Inside first polygon
        assert.equal(classifyPointInGeometry([-106.25, 44.75], multiPoly), 'inside');

        // Inside second polygon
        assert.equal(classifyPointInGeometry([-105.25, 44.75], multiPoly), 'inside');

        // In between both polygons -> outside
        assert.equal(classifyPointInGeometry([-105.75, 44.75], multiPoly), 'outside');

        // On boundary of second polygon -> boundary
        assert.equal(classifyPointInGeometry([-105.5, 44.75], multiPoly), 'boundary');
    });

    it('computes positive geodesic distance to boundary in meters', () => {
        const distInside = approximateBoundaryDistanceMeters([-106.0, 45.0], squarePoly);
        // Distance from center (-106.0, 45.0) to edge (-105.5, 45.0) is approx 0.5 degrees longitude at 45°N
        // 0.5 * 111,319 * cos(45 deg) approx 39,350 meters
        assert.ok(distInside > 35000 && distInside < 45000, `Expected ~39km, got ${distInside}`);

        const distOnBoundary = approximateBoundaryDistanceMeters([-105.5, 45.0], squarePoly);
        assert.ok(distOnBoundary < 0.01, `Expected near zero, got ${distOnBoundary}`);

        const distOutside = approximateBoundaryDistanceMeters([-107.0, 45.0], squarePoly);
        assert.ok(distOutside > 35000 && distOutside < 45000, `Expected ~39km, got ${distOutside}`);
    });

    it('validates coordinates and throws ValidationError for invalid inputs', () => {
        assert.throws(() => validatePointCoordinates([NaN, 45.0]), ValidationError);
        assert.throws(() => validatePointCoordinates([-106.0, Infinity]), ValidationError);
        assert.throws(() => validatePointCoordinates('not an array'), ValidationError);
        assert.throws(() => validatePointCoordinates([-200, 45.0]), ValidationError);
        assert.throws(() => validatePointCoordinates([-106.0, 95.0]), ValidationError);
    });

    it('validates polygon geometries and throws ValidationError for invalid structures', () => {
        assert.throws(() => validatePolygonGeometry({ type: 'Point', coordinates: [0, 0] }), ValidationError);
        assert.throws(() => validatePolygonGeometry({ type: 'Polygon', coordinates: [] }), ValidationError);
        assert.throws(() => validatePolygonGeometry(null), ValidationError);
    });
});
