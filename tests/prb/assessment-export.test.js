/**
 * Automated Test Suite for PRB Evidence Assessment Exports
 * (src/prb/ui/ExportDialog.ts: buildAssessmentCsv, validateAssessmentForExport, buildExportGeoJson, buildStaticBriefHtml)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildAssessmentCsv,
    validateAssessmentForExport,
    buildExportGeoJson,
    buildStaticBriefHtml
} from '../../src/prb/ui/ExportDialog.ts';
import { ValidationError } from '../../src/prb/data/load.ts';

describe('PRB Evidence Assessment Exports & Quarantine Validation', () => {
    const mockFilterState = {
        startDate: '2024-08-01',
        endDate: '2024-10-01',
        includeSynthetic: false
    };

    const mockFiltered = {
        wildfirePerimeters: [
            {
                id: 'remington-perimeter-2024',
                incidentName: 'Remington',
                gisAcres: 196368.1,
                discoveryDate: '2024-08-22',
                controlDate: '2024-11-12',
                mapDate: '2025-01-15',
                temporalRole: 'retrospective_final_footprint',
                pooState: 'US-WY',
                pooCounty: 'Sheridan',
                fireCause: 'Natural',
                sourceMethod: 'Public',
                sourceId: 'wfigs-remington-2024',
                isSynthetic: false,
                notes: 'WFIGS final perimeter',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[[-106.5, 45.0], [-106.0, 45.0], [-106.0, 45.5], [-106.5, 45.5], [-106.5, 45.0]]]
                }
            }
        ],
        geologicalFeatures: [],
        sites: [],
        observations: [
            {
                id: 'obs-01',
                siteId: 'site-01',
                label: 'Test Observation',
                observationDate: '2024-08-25',
                datePrecision: 'day',
                status: 'field_confirmed',
                evidenceMethods: ['ground_thermocouple'],
                accuracyMeters: 15,
                sourceId: 'wfigs-remington-2024',
                notes: 'Test notes',
                isSynthetic: false,
                geometry: { type: 'Point', coordinates: [-106.2, 45.2] }
            }
        ],
        surveys: [],
        activeSyntheticCount: 0,
        realObservationCount: 1
    };

    const mockManifest = {
        studyArea: 'Powder River Basin',
        generatedAt: '2026-09-30T00:00:00Z',
        coreQuestion: 'Do wildfires cause coal fires?',
        datasets: [
            {
                id: 'wfigs-remington-2024',
                name: 'WFIGS Remington',
                publisher: 'NIFC',
                retrievalDate: '2026-09-24',
                url: 'https://data-nifc.opendata.arcgis.com/',
                license: 'Public Domain',
                crs: 'EPSG:4326',
                spatialAccuracy: '±10m',
                limitations: 'Final perimeter',
                rawSha256: 'mockhash',
                processedSha256: 'mockhash',
                isSynthetic: false,
                hashVerified: true
            }
        ],
        dataGapsChecklist: [],
        auditedSources: []
    };

    const mockAssessment = {
        schemaVersion: 1,
        methodVersion: 'prb-evidence-context-v1',
        selection: { kind: 'coordinate', coordinate: [-106.2, 45.2] },
        coordinate: [-106.2, 45.2],
        queryOrigin: 'user_selected_coordinate',
        accuracyMeters: null,
        observationDate: null,
        observationDatePrecision: null,
        observationEndDate: null,
        lastObservedDate: null,
        filterWindow: { startDate: '2024-08-01', endDate: '2024-10-01', includeSynthetic: false },
        relationships: [
            {
                perimeterId: 'remington-perimeter-2024',
                nominalRelation: 'inside',
                approximateBoundaryDistanceMeters: 1520.4,
                coordinateUncertainty: 'unknown',
                localFireArrivalDate: null,
                daysFromIncidentDiscovery: null,
                temporalReference: 'incident_discovery'
            }
        ],
        geologicalRecordIds: [],
        surveyRecordIds: [],
        inputReferences: [
            {
                recordId: 'remington-perimeter-2024',
                sourceId: 'wfigs-remington-2024',
                processedSha256: 'mockhash',
                hashVerified: true,
                isSynthetic: false
            }
        ],
        syntheticInfluence: false,
        causalConclusion: 'unresolved',
        pathways: [],
        caveats: ['Causal direction unresolved.']
    };

    it('buildAssessmentCsv produces valid RFC 4180 CSV with escaped formula payloads and headers', () => {
        const csv = buildAssessmentCsv(mockAssessment);
        assert.ok(csv.startsWith('Assessment_Schema_Version,Method_Version,Query_Origin'));
        assert.ok(csv.includes('prb-evidence-context-v1'));
        assert.ok(csv.includes('user_selected_coordinate'));
        assert.ok(csv.includes('-106.2,45.2'));
        assert.ok(csv.includes('remington-perimeter-2024,inside,1520.4,unknown'));
        assert.ok(csv.includes('Causal direction unresolved.'));

        // Test formula escaping
        const formulaAssessment = {
            ...mockAssessment,
            caveats: ['=HYPERLINK("http://evil.com","Click")']
        };
        const formulaCsv = buildAssessmentCsv(formulaAssessment);
        assert.ok(formulaCsv.includes("'=HYPERLINK"));
    });

    it('validateAssessmentForExport enforces synthetic quarantine in Real Mode', () => {
        // Valid real-mode assessment passes
        assert.doesNotThrow(() => {
            validateAssessmentForExport(mockAssessment, mockFiltered, mockFilterState);
        });

        // Synthetic-influenced assessment in Real Mode throws ValidationError
        const synthInfluenced = {
            ...mockAssessment,
            syntheticInfluence: true
        };
        assert.throws(() => {
            validateAssessmentForExport(synthInfluenced, mockFiltered, mockFilterState);
        }, ValidationError);

        // Mismatched filter window throws ValidationError
        const mismatchedWindow = {
            ...mockAssessment,
            filterWindow: { startDate: '2024-01-01', endDate: '2024-02-01', includeSynthetic: false }
        };
        assert.throws(() => {
            validateAssessmentForExport(mismatchedWindow, mockFiltered, mockFilterState);
        }, ValidationError);

        // Hidden observation throws ValidationError
        const hiddenObsAssessment = {
            ...mockAssessment,
            selection: { kind: 'observation', observationId: 'missing-obs-id' }
        };
        assert.throws(() => {
            validateAssessmentForExport(hiddenObsAssessment, mockFiltered, mockFilterState);
        }, ValidationError);
    });

    it('buildExportGeoJson includes assessment in metadata without polluting features', () => {
        const geojsonStr = buildExportGeoJson(
            mockFiltered,
            mockManifest,
            mockFilterState,
            [],
            mockAssessment
        );
        const parsed = JSON.parse(geojsonStr);

        assert.equal(parsed.type, 'FeatureCollection');
        assert.ok(parsed.metadata.locationAssessment);
        assert.equal(parsed.metadata.locationAssessment.methodVersion, 'prb-evidence-context-v1');

        // Check features: only original 1 perimeter and 1 observation exist
        assert.equal(parsed.features.length, 2);
        assert.ok(!parsed.features.some(f => f.properties.featureType === 'location_assessment'));
    });

    it('buildStaticBriefHtml includes Spatiotemporal Evidence Analysis section and caveats', () => {
        const briefHtml = buildStaticBriefHtml(
            mockFiltered,
            mockManifest,
            mockFilterState,
            '',
            '',
            mockAssessment
        );

        assert.ok(briefHtml.includes('Spatiotemporal Evidence Analysis'));
        assert.ok(briefHtml.includes('User-Selected Query Coordinate'));
        assert.ok(briefHtml.includes('remington-perimeter-2024'));
        assert.ok(briefHtml.includes('INSIDE'));
        assert.ok(briefHtml.includes('UNRESOLVED'));
        assert.ok(briefHtml.includes('Causal direction unresolved.'));
    });
});
