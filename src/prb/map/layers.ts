/**
 * Idempotent Layer Manager for PRB Research Overlays
 * 
 * - Handles style reloads safely on 'style.load'
 * - Prevents recursive re-render loops
 * - Preserves layer visual hierarchy
 * - Binds click and hover listeners with proper hit-testing
 */

import type maplibregl from 'maplibre-gl';
import type { Observation, FirePerimeter, GeologicalFeature, Survey, Site } from '../data/types';
import type { FilteredEvidenceResult } from '../data/select';

export interface LayerSelectionCallback {
    (selection: {
        type: 'observation' | 'perimeter' | 'geology' | 'survey' | 'site';
        data: any;
    } | null): void;
}

const SOURCES = {
    geology: 'prb-geology-source',
    surveys: 'prb-surveys-source',
    perimeters: 'prb-perimeters-source',
    sites: 'prb-sites-source',
    observations: 'prb-observations-source'
};

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: []
};

function buildGeologyGeoJson(geology: GeologicalFeature[]): GeoJSON.FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: geology.map(g => ({
            type: 'Feature',
            id: g.id,
            properties: {
                id: g.id,
                name: g.name,
                category: g.category,
                age: g.age,
                description: g.description,
                combustionSusceptibility: g.combustionSusceptibility || '',
                significance: g.significance || '',
                provenance: g.provenance
            },
            geometry: g.geometry
        }))
    };
}

function buildSurveysGeoJson(surveys: Survey[]): GeoJSON.FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: surveys.map(s => ({
            type: 'Feature',
            id: s.id,
            properties: {
                id: s.id,
                surveyDate: s.surveyDate,
                method: s.method,
                detectionLimit: s.detectionLimitDescription,
                negativeResultReported: s.negativeResultReported,
                findings: s.findings,
                notes: s.notes,
                isSynthetic: s.isSynthetic
            },
            geometry: s.footprintGeometry
        }))
    };
}

function buildPerimetersGeoJson(perimeters: FirePerimeter[]): GeoJSON.FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: perimeters.map(p => ({
            type: 'Feature',
            id: p.id,
            properties: {
                id: p.id,
                incidentName: p.incidentName,
                uniqueId: p.uniqueId,
                acres: p.acres,
                mapMethod: p.mapMethod,
                discoveryDate: p.discoveryDate,
                containmentDate: p.containmentDate,
                controlDate: p.controlDate,
                counties: p.counties.join(', ')
            },
            geometry: p.geometry
        }))
    };
}

function buildSitesGeoJson(sites: Site[], observations: Observation[]): GeoJSON.FeatureCollection {
    // Generate buffer envelopes around multi-vent sites
    const features: GeoJSON.Feature[] = [];

    sites.forEach(site => {
        if (site.groupingUncertainty === 'unresolved_subsurface_connectivity') {
            const memberVents = observations.filter(o => site.relatedVentIds.includes(o.id));
            if (memberVents.length > 1) {
                const coords = memberVents
                    .filter(v => v.geometry.type === 'Point')
                    .map(v => (v.geometry as GeoJSON.Point).coordinates);

                if (coords.length > 1) {
                    // Create bounding box polygon buffer for the cluster
                    const lons = coords.map(c => c[0]);
                    const lats = coords.map(c => c[1]);
                    const pad = 0.003;
                    const minX = Math.min(...lons) - pad;
                    const maxX = Math.max(...lons) + pad;
                    const minY = Math.min(...lats) - pad;
                    const maxY = Math.max(...lats) + pad;

                    features.push({
                        type: 'Feature',
                        id: `site-env-${site.id}`,
                        properties: {
                            siteId: site.id,
                            name: site.name,
                            groupingUncertainty: site.groupingUncertainty,
                            ventCount: memberVents.length,
                            notes: site.notes
                        },
                        geometry: {
                            type: 'Polygon',
                            coordinates: [[
                                [minX, minY],
                                [maxX, minY],
                                [maxX, maxY],
                                [minX, maxY],
                                [minX, minY]
                            ]]
                        }
                    });
                }
            }
        }
    });

    return {
        type: 'FeatureCollection',
        features
    };
}

function buildObservationsGeoJson(observations: Observation[]): GeoJSON.FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: observations.map(o => ({
            type: 'Feature',
            id: o.id,
            properties: {
                id: o.id,
                siteId: o.siteId || '',
                sourceId: o.sourceId,
                observationDate: o.observationDate,
                datePrecision: o.datePrecision,
                method: o.method,
                status: o.status,
                reportedCondition: o.reportedCondition,
                reportedCause: o.reportedCause,
                verifiedEvidence: o.verifiedEvidence,
                analystInterpretation: o.analystInterpretation,
                lastObservedDate: o.lastObservedDate,
                ongoingActivityStatus: o.ongoingActivityStatus,
                isSynthetic: o.isSynthetic
            },
            geometry: o.geometry
        }))
    };
}

export class ResearchLayerManager {
    private clickHandlersBound = false;
    private currentResult: FilteredEvidenceResult | null = null;
    private onSelect: LayerSelectionCallback | null = null;

    constructor(private map: maplibregl.Map) {}

    /**
     * Initializes or updates all research data sources and visual layers.
     */
    public syncLayers(result: FilteredEvidenceResult, onSelect?: LayerSelectionCallback): void {
        this.currentResult = result;
        if (onSelect) this.onSelect = onSelect;

        this.ensureSourcesExist();
        this.ensureLayersExist();
        this.updateSourceData(result);
        if (!this.clickHandlersBound) {
            this.bindInteractionHandlers();
            this.clickHandlersBound = true;
        }
    }

    /**
     * Called when map style is reloaded to reconstruct layers idempotently.
     */
    public onStyleReload(): void {
        if (!this.currentResult) return;
        this.ensureSourcesExist();
        this.ensureLayersExist();
        this.updateSourceData(this.currentResult);
    }

    private ensureSourcesExist(): void {
        if (!this.map.getSource(SOURCES.geology)) {
            this.map.addSource(SOURCES.geology, { type: 'geojson', data: EMPTY_GEOJSON });
        }
        if (!this.map.getSource(SOURCES.surveys)) {
            this.map.addSource(SOURCES.surveys, { type: 'geojson', data: EMPTY_GEOJSON });
        }
        if (!this.map.getSource(SOURCES.perimeters)) {
            this.map.addSource(SOURCES.perimeters, { type: 'geojson', data: EMPTY_GEOJSON });
        }
        if (!this.map.getSource(SOURCES.sites)) {
            this.map.addSource(SOURCES.sites, { type: 'geojson', data: EMPTY_GEOJSON });
        }
        if (!this.map.getSource(SOURCES.observations)) {
            this.map.addSource(SOURCES.observations, { type: 'geojson', data: EMPTY_GEOJSON });
        }
    }

    private ensureLayersExist(): void {
        // 1. Geology Layers
        if (!this.map.getLayer('prb-geology-fill')) {
            this.map.addLayer({
                id: 'prb-geology-fill',
                type: 'fill',
                source: SOURCES.geology,
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'category'],
                        'historic_clinker_outcrop', '#ea580c',  // Burnt orange for clinker
                        'coal_bearing_strata', '#713f12',        // Muted raw umber for coal strata
                        'sedimentary_overburden', '#64748b',    // Neutral slate for Wasatch overburden
                        '#94a3b8'
                    ],
                    'fill-opacity': [
                        'match',
                        ['get', 'category'],
                        'historic_clinker_outcrop', 0.25,
                        'coal_bearing_strata', 0.12,
                        0.08
                    ]
                }
            });
        }

        if (!this.map.getLayer('prb-geology-line')) {
            this.map.addLayer({
                id: 'prb-geology-line',
                type: 'line',
                source: SOURCES.geology,
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'category'],
                        'historic_clinker_outcrop', '#c2410c',
                        'coal_bearing_strata', '#854d0e',
                        '#475569'
                    ],
                    'line-width': 1.2,
                    'line-dasharray': [3, 2]
                }
            });
        }

        // 2. Negative Survey Footprints
        if (!this.map.getLayer('prb-surveys-fill')) {
            this.map.addLayer({
                id: 'prb-surveys-fill',
                type: 'fill',
                source: SOURCES.surveys,
                paint: {
                    'fill-color': '#0284c7', // Cyan/sky blue
                    'fill-opacity': 0.15
                }
            });
        }

        if (!this.map.getLayer('prb-surveys-line')) {
            this.map.addLayer({
                id: 'prb-surveys-line',
                type: 'line',
                source: SOURCES.surveys,
                paint: {
                    'line-color': '#0284c7',
                    'line-width': 1.8,
                    'line-dasharray': [4, 4]
                }
            });
        }

        // 3. Wildfire Perimeter
        if (!this.map.getLayer('prb-perimeters-fill')) {
            this.map.addLayer({
                id: 'prb-perimeters-fill',
                type: 'fill',
                source: SOURCES.perimeters,
                paint: {
                    'fill-color': '#dc2626', // Crimson
                    'fill-opacity': 0.14
                }
            });
        }

        if (!this.map.getLayer('prb-perimeters-line')) {
            this.map.addLayer({
                id: 'prb-perimeters-line',
                type: 'line',
                source: SOURCES.perimeters,
                paint: {
                    'line-color': '#b91c1c',
                    'line-width': 2.4
                }
            });
        }

        // 4. Multi-Vent Cluster Envelopes (Preserves Grouping Uncertainty)
        if (!this.map.getLayer('prb-sites-envelope')) {
            this.map.addLayer({
                id: 'prb-sites-envelope',
                type: 'line',
                source: SOURCES.sites,
                paint: {
                    'line-color': '#d97706',
                    'line-width': 1.5,
                    'line-dasharray': [2, 2]
                }
            });
        }

        if (!this.map.getLayer('prb-sites-fill')) {
            this.map.addLayer({
                id: 'prb-sites-fill',
                type: 'fill',
                source: SOURCES.sites,
                paint: {
                    'fill-color': '#d97706',
                    'fill-opacity': 0.08
                }
            });
        }

        // 5. Observations (Points)
        if (!this.map.getLayer('prb-observations-halo')) {
            this.map.addLayer({
                id: 'prb-observations-halo',
                type: 'circle',
                source: SOURCES.observations,
                paint: {
                    'circle-radius': 11,
                    'circle-color': '#ffffff',
                    'circle-opacity': 0.8
                }
            });
        }

        if (!this.map.getLayer('prb-observations-point')) {
            this.map.addLayer({
                id: 'prb-observations-point',
                type: 'circle',
                source: SOURCES.observations,
                paint: {
                    'circle-radius': 6.5,
                    'circle-color': [
                        'match',
                        ['get', 'status'],
                        'field_confirmed', '#059669',      // Emerald
                        'sensor_detection', '#d97706',     // Amber
                        'unverified_report', '#7c3aed',    // Violet
                        'extinguished', '#64748b',         // Slate
                        'reignited_vegetation', '#dc2626', // Red
                        '#475569'
                    ],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                }
            });
        }

        // Observation Labels
        if (!this.map.getLayer('prb-observations-label')) {
            this.map.addLayer({
                id: 'prb-observations-label',
                type: 'symbol',
                source: SOURCES.observations,
                layout: {
                    'text-field': ['get', 'id'],
                    'text-size': 10,
                    'text-offset': [0, 1.2],
                    'text-anchor': 'top',
                    'text-font': ['Noto Sans Regular', 'Open Sans Regular']
                },
                paint: {
                    'text-color': '#1e293b',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.5
                }
            });
        }
    }

    private updateSourceData(result: FilteredEvidenceResult): void {
        const geoSrc = this.map.getSource(SOURCES.geology) as maplibregl.GeoJSONSource | undefined;
        if (geoSrc) geoSrc.setData(buildGeologyGeoJson(result.geologicalFeatures));

        const survSrc = this.map.getSource(SOURCES.surveys) as maplibregl.GeoJSONSource | undefined;
        if (survSrc) survSrc.setData(buildSurveysGeoJson(result.filteredSurveys));

        const perimSrc = this.map.getSource(SOURCES.perimeters) as maplibregl.GeoJSONSource | undefined;
        if (perimSrc) perimSrc.setData(buildPerimetersGeoJson(result.filteredPerimeters));

        const siteSrc = this.map.getSource(SOURCES.sites) as maplibregl.GeoJSONSource | undefined;
        if (siteSrc) siteSrc.setData(buildSitesGeoJson(result.activeSites, result.filteredObservations));

        const obsSrc = this.map.getSource(SOURCES.observations) as maplibregl.GeoJSONSource | undefined;
        if (obsSrc) obsSrc.setData(buildObservationsGeoJson(result.filteredObservations));
    }

    private bindInteractionHandlers(): void {
        const clickableLayers = [
            'prb-observations-point',
            'prb-perimeters-fill',
            'prb-surveys-fill',
            'prb-geology-fill',
            'prb-sites-fill'
        ];

        clickableLayers.forEach(layerId => {
            this.map.on('mouseenter', layerId, () => {
                this.map.getCanvas().style.cursor = 'pointer';
            });
            this.map.on('mouseleave', layerId, () => {
                this.map.getCanvas().style.cursor = '';
            });
        });

        // Click handler for observations
        this.map.on('click', 'prb-observations-point', (e) => {
            if (!e.features || !e.features[0] || !this.onSelect || !this.currentResult) return;
            const props = e.features[0].properties;
            const fullObs = this.currentResult.filteredObservations.find((o: Observation) => o.id === props.id);
            if (fullObs) {
                this.onSelect({ type: 'observation', data: fullObs });
            }
        });

        // Click handler for perimeters
        this.map.on('click', 'prb-perimeters-fill', (e) => {
            if (!e.features || !e.features[0] || !this.onSelect || !this.currentResult) return;
            const props = e.features[0].properties;
            const fullPerim = this.currentResult.filteredPerimeters.find((p: FirePerimeter) => p.id === props.id);
            if (fullPerim) {
                this.onSelect({ type: 'perimeter', data: fullPerim });
            }
        });

        // Click handler for surveys
        this.map.on('click', 'prb-surveys-fill', (e) => {
            if (!e.features || !e.features[0] || !this.onSelect || !this.currentResult) return;
            const props = e.features[0].properties;
            const fullSurv = this.currentResult.filteredSurveys.find((s: Survey) => s.id === props.id);
            if (fullSurv) {
                this.onSelect({ type: 'survey', data: fullSurv });
            }
        });

        // Click handler for geology
        this.map.on('click', 'prb-geology-fill', (e) => {
            if (!e.features || !e.features[0] || !this.onSelect || !this.currentResult) return;
            const props = e.features[0].properties;
            const fullGeo = this.currentResult.geologicalFeatures.find((g: GeologicalFeature) => g.id === props.id);
            if (fullGeo) {
                this.onSelect({ type: 'geology', data: fullGeo });
            }
        });
    }
}
