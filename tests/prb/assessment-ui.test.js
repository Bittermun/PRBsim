/**
 * Unit Tests for Assessment UI Renderer (EvidencePanel.ts: renderLocationAssessmentHtml)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderLocationAssessmentHtml } from '../../src/prb/ui/EvidencePanel.ts';

describe('PRB Assessment UI: Pure HTML Rendering & Escaping', () => {
    const mockAssessmentReal = {
        schemaVersion: 1,
        methodVersion: 'prb-evidence-context-v1',
        selection: { kind: 'coordinate', coordinate: [-106.45, 45.10] },
        coordinate: [-106.45, 45.10],
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
                approximateBoundaryDistanceMeters: 4210.5,
                coordinateUncertainty: 'unknown',
                localFireArrivalDate: null,
                daysFromIncidentDiscovery: null,
                temporalReference: 'incident_discovery'
            }
        ],
        geologicalRecordIds: [],
        surveyRecordIds: [],
        inputReferences: [],
        syntheticInfluence: false,
        causalConclusion: 'unresolved',
        pathways: [
            {
                pathwayId: 'surface_to_subsurface',
                question: 'Did surface wildfire initiate or reactivate subsurface coal combustion?',
                evidenceStatus: 'unresolved',
                requiredEvidence: ['Local flame front arrival', 'Post-fire combustion records'],
                missingEvidenceInActiveView: ['No progression perimeters bundled']
            }
        ],
        caveats: [
            'Causal direction unresolved: spatial co-location does not demonstrate ignition direction.',
            'Wildfire perimeter represents retrospective final footprint.'
        ]
    };

    it('renders real-mode user coordinate assessment without probabilities or synthetic warnings', () => {
        const html = renderLocationAssessmentHtml(mockAssessmentReal);

        // Core identifiers
        assert.ok(html.includes('User-Selected Query Coordinate'));
        assert.ok(html.includes('45.10000°N, -106.45000°W'));
        assert.ok(html.includes('remington-perimeter-2024'));
        assert.ok(html.includes('INSIDE'));
        assert.ok(html.includes('4,210 m (approximate)'));
        assert.ok(html.includes('STATUS: UNRESOLVED'));

        // Epistemic invariants: NO probability percentages or winning hypotheses
        assert.ok(!html.includes('P(wildfire'));
        assert.ok(!html.includes('Probability:'));
        assert.ok(!html.includes('Winning Hypothesis'));
        assert.ok(!html.includes('SYNTHETIC INFLUENCE'));

        // Caveats and pathways
        assert.ok(html.includes('Causal direction unresolved'));
        assert.ok(html.includes('Did surface wildfire initiate or reactivate subsurface coal combustion?'));
        assert.ok(html.includes('No progression perimeters bundled'));
    });

    it('renders synthetic influence warning when assessment incorporates synthetic fixtures', () => {
        const mockSynthetic = {
            ...mockAssessmentReal,
            syntheticInfluence: true
        };
        const html = renderLocationAssessmentHtml(mockSynthetic);
        assert.ok(html.includes('SYNTHETIC INFLUENCE'));
        assert.ok(html.includes('quarantined test fixtures or schematic geological polygons'));
    });

    it('escapes untrusted content to prevent XSS payloads', () => {
        const xssAssessment = {
            ...mockAssessmentReal,
            relationships: [
                {
                    perimeterId: '<script>alert(1)</script>',
                    nominalRelation: 'inside',
                    approximateBoundaryDistanceMeters: 100,
                    coordinateUncertainty: 'unknown',
                    localFireArrivalDate: null,
                    daysFromIncidentDiscovery: null,
                    temporalReference: 'incident_discovery'
                }
            ],
            caveats: ['<b>Malicious caveat</b>']
        };
        const html = renderLocationAssessmentHtml(xssAssessment);
        assert.ok(!html.includes('<script>alert(1)</script>'));
        assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
        assert.ok(!html.includes('<b>Malicious caveat</b>'));
        assert.ok(html.includes('&lt;b&gt;Malicious caveat&lt;/b&gt;'));
    });
});
