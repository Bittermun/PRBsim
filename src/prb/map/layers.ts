/**
 * MapLibre GL JS Evidence Layers for PRB Coal-Fire Explorer
 *
 * Implements color-blind-safe cartographic symbology (color + radius + stroke style) for:
 * 1. Geological Context (Clinker deposits & Coal outcrops — quarantined schematic fixtures in synthetic mode)
 * 2. Wildfire Perimeters (2024 Remington Fire final boundary, polygon date 2025-01-15)
 * 3. Bounded Negative Survey Coverage Polygons
 * 4. Multi-Vent Site Complex Boundaries
 * 5. Point & Polygon Coal-Fire Observations (differentiated by VerificationStatus color, radius, and stroke)
 * 6. Hit-priority click resolution so overlapping layers select the highest-priority feature
 */

import type maplibregl from 'maplibre-gl';
import type { FilteredEvidenceResult } from '../data/select.ts';

export const LAYER_IDS = {
    geologyFill: 'prb-geology-fill',
    geologyOutline: 'prb-geology-outline',
    perimetersFill: 'prb-perimeters-fill',
    perimetersOutline: 'prb-perimeters-outline',
    surveysFill: 'prb-surveys-fill',
    surveysOutline: 'prb-surveys-outline',
    sitesOutline: 'prb-sites-outline',
    observationsPolygonFill: 'prb-observations-polygon-fill',
    observationsPolygonOutline: 'prb-observations-polygon-outline',
    observationsPoint: 'prb-observations-point',
    observationsHalo: 'prb-observations-halo',
    observationsLabel: 'prb-observations-label',
};

export const SOURCE_IDS = {
    geology: 'source-prb-geology',
    perimeters: 'source-prb-perimeters',
    surveys: 'source-prb-surveys',
    sites: 'source-prb-sites',
    observations: 'source-prb-observations',
};

const boundMapClickHandlers = new WeakMap<maplibregl.Map, (e: maplibregl.MapMouseEvent) => void>();
const boundMapHoverMaps = new WeakSet<maplibregl.Map>();

/**
 * Converts FilteredEvidenceResult into GeoJSON FeatureCollections for MapLibre sources.
 */
export function buildLayerGeoJsons(filtered: FilteredEvidenceResult) {
    const geologyFc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: filtered.geologicalFeatures.map(g => ({
            type: 'Feature',
            id: g.id,
            properties: {
                id: g.id,
                unitName: g.unitName,
                unitType: g.unitType,
                formation: g.formation,
                coalBed: g.coalBed,
                scale: g.scale,
                notes: g.notes,
                isSynthetic: g.isSynthetic
            },
            geometry: g.geometry
        }))
    };

    const perimetersFc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: filtered.wildfirePerimeters.map(p => ({
            type: 'Feature',
            id: p.id,
            properties: {
                id: p.id,
                incidentName: p.incidentName,
                irwinId: p.irwinId,
                uniqueFireId: p.uniqueFireId,
                gisAcres: p.gisAcres,
                discoveryDate: p.discoveryDate,
                containmentDate: p.containmentDate,
                controlDate: p.controlDate,
                mapDate: p.mapDate,
                temporalRole: p.temporalRole,
                pooState: p.pooState,
                pooCounty: p.pooCounty,
                fireCause: p.fireCause,
                reportedCauseGeneral: p.reportedCauseGeneral,
                reportedCauseSpecific: p.reportedCauseSpecific,
                isFireCauseInvestigated: p.isFireCauseInvestigated,
                notes: p.notes,
                isSynthetic: p.isSynthetic
            },
            geometry: p.geometry
        }))
    };

    const surveysFc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: filtered.surveys.map(sv => ({
            type: 'Feature',
            id: sv.id,
            properties: {
                id: sv.id,
                surveyName: sv.surveyName,
                surveyDate: sv.surveyDate,
                method: sv.method,
                result: sv.result,
                notes: sv.notes,
                isSynthetic: sv.isSynthetic
            },
            geometry: sv.geometry
        }))
    };

    const sitesFc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: filtered.sites
            .filter(s => s.boundaryGeometry !== null)
            .map(s => ({
                type: 'Feature',
                id: s.id,
                properties: {
                    id: s.id,
                    name: s.name,
                    coalSeam: s.coalSeam,
                    groupingUncertainty: s.groupingUncertainty,
                    groupingNotes: s.groupingNotes,
                    isSynthetic: s.isSynthetic
                },
                geometry: s.boundaryGeometry!
            }))
    };

    const observationsFc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: filtered.observations.map(o => ({
            type: 'Feature',
            id: o.id,
            properties: {
                id: o.id,
                siteId: o.siteId,
                label: o.label,
                observationDate: o.observationDate,
                endDate: o.endDate || '',
                datePrecision: o.datePrecision,
                lastObservedDate: o.lastObservedDate || '',
                status: o.status,
                evidenceMethods: o.evidenceMethods.join(', '),
                accuracyMeters: o.accuracyMeters,
                sourceId: o.sourceId,
                notes: o.notes,
                isSynthetic: o.isSynthetic
            },
            geometry: o.geometry
        }))
    };

    return { geologyFc, perimetersFc, surveysFc, sitesFc, observationsFc };
}

/**
 * Initializes or updates all PRB evidence sources and layers on the MapLibre instance.
 */
export function initEvidenceLayers(
    map: maplibregl.Map,
    filtered: FilteredEvidenceResult,
    onFeatureClick: (featureType: 'observation' | 'perimeter' | 'geology' | 'survey', props: Record<string, any>) => void
): void {
    const { geologyFc, perimetersFc, surveysFc, sitesFc, observationsFc } = buildLayerGeoJsons(filtered);

    if (map.getSource(SOURCE_IDS.geology)) {
        updateEvidenceLayers(map, filtered);
        return;
    }

    // Add Sources
    map.addSource(SOURCE_IDS.geology, { type: 'geojson', data: geologyFc });
    map.addSource(SOURCE_IDS.perimeters, { type: 'geojson', data: perimetersFc });
    map.addSource(SOURCE_IDS.surveys, { type: 'geojson', data: surveysFc });
    map.addSource(SOURCE_IDS.sites, { type: 'geojson', data: sitesFc });
    map.addSource(SOURCE_IDS.observations, { type: 'geojson', data: observationsFc });

    // 1. Geological Context Fill & Outline
    map.addLayer({
        id: LAYER_IDS.geologyFill,
        type: 'fill',
        source: SOURCE_IDS.geology,
        paint: {
            'fill-color': [
                'match',
                ['get', 'unitType'],
                'clinker_deposit', '#ea580c',
                'coal_outcrop', '#ca8a04',
                '#94a3b8'
            ],
            'fill-opacity': [
                'match',
                ['get', 'unitType'],
                'clinker_deposit', 0.18,
                'coal_outcrop', 0.07,
                0.1
            ]
        }
    });

    map.addLayer({
        id: LAYER_IDS.geologyOutline,
        type: 'line',
        source: SOURCE_IDS.geology,
        paint: {
            'line-color': [
                'match',
                ['get', 'unitType'],
                'clinker_deposit', '#c2410c',
                'coal_outcrop', '#a16207',
                '#64748b'
            ],
            'line-width': [
                'match',
                ['get', 'unitType'],
                'clinker_deposit', 1.5,
                1.0
            ],
            'line-dasharray': [3, 2],
            'line-opacity': 0.7
        }
    });

    // 2. Bounded Survey Coverage (differentiating negative vs. anomalies_detected surveys)
    map.addLayer({
        id: LAYER_IDS.surveysFill,
        type: 'fill',
        source: SOURCE_IDS.surveys,
        paint: {
            'fill-color': [
                'match',
                ['get', 'result'],
                'anomalies_detected', '#d97706',
                '#0284c7'
            ],
            'fill-opacity': 0.14
        }
    });

    map.addLayer({
        id: LAYER_IDS.surveysOutline,
        type: 'line',
        source: SOURCE_IDS.surveys,
        paint: {
            'line-color': [
                'match',
                ['get', 'result'],
                'anomalies_detected', '#b45309',
                '#0369a1'
            ],
            'line-width': 1.8,
            'line-dasharray': [2, 2]
        }
    });

    // 3. Wildfire Perimeters (2024 Remington Fire final boundary)
    map.addLayer({
        id: LAYER_IDS.perimetersFill,
        type: 'fill',
        source: SOURCE_IDS.perimeters,
        paint: {
            'fill-color': '#dc2626',
            'fill-opacity': 0.14
        }
    });

    map.addLayer({
        id: LAYER_IDS.perimetersOutline,
        type: 'line',
        source: SOURCE_IDS.perimeters,
        paint: {
            'line-color': '#b91c1c',
            'line-width': 2.5,
            'line-opacity': 0.9
        }
    });

    // 4. Multi-Vent Site Complex Boundaries
    map.addLayer({
        id: LAYER_IDS.sitesOutline,
        type: 'line',
        source: SOURCE_IDS.sites,
        paint: {
            'line-color': '#f59e0b',
            'line-width': 2.2,
            'line-dasharray': [4, 2]
        }
    });

    // 5a. Polygon Coal-Fire Observations (when an observation has Polygon geometry)
    map.addLayer({
        id: LAYER_IDS.observationsPolygonFill,
        type: 'fill',
        source: SOURCE_IDS.observations,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
            'fill-color': [
                'match',
                ['get', 'status'],
                'field_confirmed', '#059669',
                'sensor_detection', '#d97706',
                'unverified_report', '#7c3aed',
                'extinguished', '#64748b',
                'reignited_vegetation', '#dc2626',
                '#0284c7'
            ],
            'fill-opacity': 0.28
        }
    });

    map.addLayer({
        id: LAYER_IDS.observationsPolygonOutline,
        type: 'line',
        source: SOURCE_IDS.observations,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
            'line-color': '#0f172a',
            'line-width': 2.2
        }
    });

    // 5b. Point Coal-Fire Observations (Outer Halo & Core Circle differentiated by color, radius, and stroke)
    map.addLayer({
        id: LAYER_IDS.observationsHalo,
        type: 'circle',
        source: SOURCE_IDS.observations,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
            'circle-radius': [
                'match',
                ['get', 'status'],
                'field_confirmed', 13,
                'sensor_detection', 11,
                'reignited_vegetation', 14,
                9
            ],
            'circle-color': [
                'match',
                ['get', 'status'],
                'field_confirmed', '#059669',
                'sensor_detection', '#d97706',
                'unverified_report', '#7c3aed',
                'extinguished', '#64748b',
                'reignited_vegetation', '#dc2626',
                '#0284c7'
            ],
            'circle-opacity': 0.25,
            'circle-stroke-width': [
                'match',
                ['get', 'status'],
                'unverified_report', 1.5,
                0
            ],
            'circle-stroke-color': '#5b21b6'
        }
    });

    map.addLayer({
        id: LAYER_IDS.observationsPoint,
        type: 'circle',
        source: SOURCE_IDS.observations,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
            'circle-radius': [
                'match',
                ['get', 'status'],
                'field_confirmed', 8,
                'sensor_detection', 7,
                'unverified_report', 5.5,
                'extinguished', 5,
                'reignited_vegetation', 9,
                6
            ],
            'circle-color': [
                'match',
                ['get', 'status'],
                'field_confirmed', '#059669',
                'sensor_detection', '#d97706',
                'unverified_report', '#7c3aed',
                'extinguished', '#64748b',
                'reignited_vegetation', '#dc2626',
                '#0284c7'
            ],
            'circle-stroke-width': [
                'match',
                ['get', 'status'],
                'field_confirmed', 3,
                'sensor_detection', 2.5,
                'unverified_report', 1.5,
                'reignited_vegetation', 3,
                1.5
            ],
            'circle-stroke-color': [
                'match',
                ['get', 'status'],
                'field_confirmed', '#ffffff',
                'sensor_detection', '#1e293b',
                'unverified_report', '#ffffff',
                'reignited_vegetation', '#fef08a',
                '#ffffff'
            ]
        }
    });

    // 6. Observation Labels
    map.addLayer({
        id: LAYER_IDS.observationsLabel,
        type: 'symbol',
        source: SOURCE_IDS.observations,
        layout: {
            'text-field': ['get', 'label'],
            'text-size': 11,
            'text-offset': [0, 1.3],
            'text-anchor': 'top',
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-optional': true
        },
        paint: {
            'text-color': '#0f172a',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.8
        }
    });

    // Unified Hit-Priority Click Listener (prevents overlapping perimeter/geology from overwriting observation clicks)
    const priorityLayers = [
        LAYER_IDS.observationsPoint,
        LAYER_IDS.observationsPolygonFill,
        LAYER_IDS.surveysFill,
        LAYER_IDS.perimetersFill,
        LAYER_IDS.geologyFill
    ];

    const prevHandler = boundMapClickHandlers.get(map);
    if (prevHandler) {
        map.off('click', prevHandler);
    }

    const clickHandler = (e: maplibregl.MapMouseEvent) => {
        const activeLayers = priorityLayers.filter(id => Boolean(map.getLayer(id)));
        if (activeLayers.length === 0) return;
        const hits = map.queryRenderedFeatures(e.point, { layers: activeLayers });
        if (!hits || hits.length === 0) return;

        // Pick the highest-priority layer match
        for (const layerId of activeLayers) {
            const match = hits.find(f => f.layer.id === layerId);
            if (match && match.properties) {
                if (layerId === LAYER_IDS.observationsPoint || layerId === LAYER_IDS.observationsPolygonFill) {
                    onFeatureClick('observation', match.properties);
                } else if (layerId === LAYER_IDS.surveysFill) {
                    onFeatureClick('survey', match.properties);
                } else if (layerId === LAYER_IDS.perimetersFill) {
                    onFeatureClick('perimeter', match.properties);
                } else if (layerId === LAYER_IDS.geologyFill) {
                    onFeatureClick('geology', match.properties);
                }
                return;
            }
        }
    };

    boundMapClickHandlers.set(map, clickHandler);
    map.on('click', clickHandler);

    // Cursor hover indicators (bound once per Map instance)
    if (!boundMapHoverMaps.has(map)) {
        boundMapHoverMaps.add(map);
        for (const lid of priorityLayers) {
            map.on('mouseenter', lid, () => {
                map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', lid, () => {
                map.getCanvas().style.cursor = '';
            });
        }
    }
}

/**
 * Updates GeoJSON data in existing MapLibre sources when Timeline or Filters change.
 */
export function updateEvidenceLayers(
    map: maplibregl.Map,
    filtered: FilteredEvidenceResult
): void {
    const { geologyFc, perimetersFc, surveysFc, sitesFc, observationsFc } = buildLayerGeoJsons(filtered);

    const setSource = (id: string, data: GeoJSON.FeatureCollection) => {
        const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
        if (src && typeof src.setData === 'function') {
            src.setData(data);
        }
    };

    setSource(SOURCE_IDS.geology, geologyFc);
    setSource(SOURCE_IDS.perimeters, perimetersFc);
    setSource(SOURCE_IDS.surveys, surveysFc);
    setSource(SOURCE_IDS.sites, sitesFc);
    setSource(SOURCE_IDS.observations, observationsFc);
}

/**
 * Toggles visibility of a layer group on the map.
 */
export function setLayerGroupVisibility(
    map: maplibregl.Map,
    group: 'geology' | 'perimeters' | 'surveys' | 'observations',
    visible: boolean
): void {
    const vis = visible ? 'visible' : 'none';
    const mapping: Record<string, string[]> = {
        geology: [LAYER_IDS.geologyFill, LAYER_IDS.geologyOutline],
        perimeters: [LAYER_IDS.perimetersFill, LAYER_IDS.perimetersOutline],
        surveys: [LAYER_IDS.surveysFill, LAYER_IDS.surveysOutline],
        observations: [
            LAYER_IDS.sitesOutline,
            LAYER_IDS.observationsPolygonFill,
            LAYER_IDS.observationsPolygonOutline,
            LAYER_IDS.observationsHalo,
            LAYER_IDS.observationsPoint,
            LAYER_IDS.observationsLabel
        ]
    };

    for (const layerId of mapping[group] || []) {
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', vis);
        }
    }
}
