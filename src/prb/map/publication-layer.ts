import type { GeoJSONSource, Map } from 'maplibre-gl';
import type { ObservationRelease } from '../data/observation-publication.ts';

const sourceId = 'prb-published-observations';
const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const purple = '#7c3aed';
const displayed = new WeakMap<GeoJSONSource, GeoJSON.FeatureCollection>();

export function mountPublicationLayer(map: Map): void {
    if (map.getSource(sourceId)) return;
    map.addSource(sourceId, { type: 'geojson', data: empty });
    map.addLayer({
        id: 'prb-published-polygons', type: 'fill', source: sourceId,
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': purple, 'fill-outline-color': purple, 'fill-opacity': 0.32 },
    });
    map.addLayer({
        id: 'prb-published-points', type: 'circle', source: sourceId,
        filter: ['==', '$type', 'Point'],
        paint: { 'circle-color': purple, 'circle-radius': 8, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
    });
}

export function updatePublicationLayer(map: Map, release: ObservationRelease | null, includeSynthetic: boolean): void {
    const source = map.getSource<GeoJSONSource>(sourceId);
    const data = release && (!release.release.isSynthetic || includeSynthetic) ? release : empty;
    if (source && displayed.get(source) !== data) {
        source.setData(data);
        displayed.set(source, data);
    }
}
