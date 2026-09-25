/**
 * MapLibre Base Styles and Cartographic Themes for PRB Evidence Explorer
 * 
 * - Default: Restrained OpenFreeMap Positron (light/clean) or Liberty
 * - Optional: Scientific Topographic Contour & Hillshade Theme
 * - Preserves full service and data provider attribution
 */

// @ts-ignore
import mlcontour from 'maplibre-contour';

export const ATTRIBUTIONS = {
    openFreeMap: '© <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>',
    osm: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    terrarium: 'Terrain: AWS Open Data (Terrarium)',
    nifc: 'Wildfire: <a href="https://www.nifc.gov/" target="_blank" rel="noopener">NIFC WFIGS</a>',
    mbmg: 'Geology: <a href="https://mbmg.mtech.edu/" target="_blank" rel="noopener">MBMG</a> / <a href="https://pubs.usgs.gov/" target="_blank" rel="noopener">USGS</a>'
};

export const BASEMAP_STYLES = {
    positron: 'https://tiles.openfreemap.org/styles/positron',
    liberty: 'https://tiles.openfreemap.org/styles/liberty',
    bright: 'https://tiles.openfreemap.org/styles/bright'
};

let demSourceInstance: any = null;

export function initDemSource(maplibreglInstance: any): any {
    if (!demSourceInstance) {
        demSourceInstance = new mlcontour.DemSource({
            url: 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
            encoding: 'terrarium',
            maxzoom: 13,
        });
        demSourceInstance.setupMaplibre(maplibreglInstance);
    }
    return demSourceInstance;
}

/**
 * Creates the restrained topographic contour & hillshade style.
 */
export function createContourStyle(demSource: any): maplibregl.StyleSpecification {
    return {
        version: 8,
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        sources: {
            openfreemap: {
                type: 'vector',
                url: 'https://tiles.openfreemap.org/planet',
                attribution: `${ATTRIBUTIONS.openFreeMap}, ${ATTRIBUTIONS.osm}`,
            },
            dem: {
                type: 'raster-dem',
                encoding: 'terrarium',
                tiles: [demSource.sharedDemProtocolUrl],
                maxzoom: 13,
                tileSize: 256,
                attribution: ATTRIBUTIONS.terrarium,
            },
            contours: {
                type: 'vector',
                tiles: [
                    demSource.contourProtocolUrl({
                        multiplier: 1,
                        thresholds: {
                            8: [200, 500],
                            9: [100, 250],
                            10: [50, 100],
                            11: [25, 50],
                            12: [10, 25],
                            13: [5, 10],
                        },
                        elevationKey: 'ele',
                        levelKey: 'level',
                        contourLayer: 'contours',
                    })
                ],
                maxzoom: 16,
                attribution: ATTRIBUTIONS.terrarium,
            },
        },
        layers: [
            // Background
            {
                id: 'background',
                type: 'background',
                paint: {
                    'background-color': '#f8f9fa',
                },
            },
            // Soft Hillshade
            {
                id: 'hillshade',
                type: 'hillshade',
                source: 'dem',
                paint: {
                    'hillshade-exaggeration': 0.35,
                    'hillshade-shadow-color': '#334155',
                    'hillshade-highlight-color': '#ffffff',
                    'hillshade-accent-color': '#64748b',
                },
            },
            // Water bodies
            {
                id: 'water',
                type: 'fill',
                source: 'openfreemap',
                'source-layer': 'water',
                paint: {
                    'fill-color': '#cbd5e1',
                    'fill-opacity': 0.7,
                },
            },
            // Waterway lines
            {
                id: 'waterway',
                type: 'line',
                source: 'openfreemap',
                'source-layer': 'waterway',
                paint: {
                    'line-color': '#94a3b8',
                    'line-width': 1.2,
                },
            },
            // Minor Contours
            {
                id: 'contours-minor',
                type: 'line',
                source: 'contours',
                'source-layer': 'contours',
                filter: ['>', ['get', 'level'], 0],
                paint: {
                    'line-color': '#78716c',
                    'line-width': 0.7,
                    'line-opacity': 0.45,
                },
            },
            // Major Contours
            {
                id: 'contours-major',
                type: 'line',
                source: 'contours',
                'source-layer': 'contours',
                filter: ['==', ['get', 'level'], 1],
                paint: {
                    'line-color': '#57534e',
                    'line-width': 1.4,
                    'line-opacity': 0.65,
                },
            },
            // Contour Labels
            {
                id: 'contour-labels',
                type: 'symbol',
                source: 'contours',
                'source-layer': 'contours',
                filter: ['==', ['get', 'level'], 1],
                layout: {
                    'symbol-placement': 'line',
                    'text-field': ['concat', ['to-string', ['get', 'ele']], 'm'],
                    'text-size': 9,
                    'text-font': ['Noto Sans Regular'],
                    'text-max-angle': 25,
                },
                paint: {
                    'text-color': '#57534e',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.5,
                },
            },
            // Roads (subdued for orientation)
            {
                id: 'transport-roads',
                type: 'line',
                source: 'openfreemap',
                'source-layer': 'transportation',
                paint: {
                    'line-color': '#a8a29e',
                    'line-width': 1,
                    'line-opacity': 0.5,
                },
            },
            // Places / Towns
            {
                id: 'place-labels',
                type: 'symbol',
                source: 'openfreemap',
                'source-layer': 'place',
                layout: {
                    'text-field': ['get', 'name'],
                    'text-size': 11,
                    'text-font': ['Noto Sans Regular'],
                    'text-transform': 'uppercase',
                },
                paint: {
                    'text-color': '#292524',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.5,
                },
            },
        ],
    };
}
