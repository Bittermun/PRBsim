/**
 * PRB Coal-Fire Evidence Explorer - Main Entry Point
 * 
 * Study Area: Remington Fire (Powder River Basin, MT/WY)
 * Invariants:
 * - Separated from historical simulation engine
 * - Restrained 2D North-Up default with optional 35° oblique pitch
 * - Real Data Default with explicit Data Gaps advisory
 * - Synthetic Fixtures quarantined behind toggle
 * - Style-event-driven layer mounting
 */

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { loadPRBEvidenceData } from './data/load';
import { filterEvidence } from './data/select';
import type { PRBDataSet, EvidenceFilterState } from './data/types';
import { BASEMAP_STYLES, createContourStyle, initDemSource } from './map/styles';
import { ResearchLayerManager } from './map/layers';
import { EvidencePanel } from './ui/EvidencePanel';
import { TimelineControl } from './ui/TimelineControl';
import { MapLegend, type LayerVisibilityState } from './ui/Legend';
import { ExportDialog } from './ui/ExportDialog';

// Initialize DEM Source for optional contour/hillshade theme
const demSource = initDemSource(maplibregl);

// Study Area Bounds for Remington Fire
const REMINGTON_CENTER: [number, number] = [-106.263, 45.174];
const DEFAULT_ZOOM = 9.5;

async function bootstrap() {
    console.log('[PRB Explorer] Initializing PRB Coal-Fire Evidence Explorer...');

    // 1. Initialize MapLibre in 2D North-Up mode
    const map = new maplibregl.Map({
        container: 'prb-map-container',
        style: BASEMAP_STYLES.positron,
        center: REMINGTON_CENTER,
        zoom: DEFAULT_ZOOM,
        pitch: 0,
        bearing: 0,
        attributionControl: false, // Custom attribution control added below
        preserveDrawingBuffer: true
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    const layerManager = new ResearchLayerManager(map);

    // 2. Setup Layer re-attachment strictly on 'style.load'
    map.on('style.load', () => {
        console.log('[PRB Explorer] Basemap style loaded. Re-mounting research overlays...');
        layerManager.onStyleReload();
    });

    // 3. Load Datasets and Manifest
    let dataset: PRBDataSet;
    try {
        dataset = await loadPRBEvidenceData();
        console.log('[PRB Explorer] Data loaded successfully:', dataset.manifest.studyArea);
    } catch (err) {
        console.error('[PRB Explorer] Failed to load research data:', err);
        const errDiv = document.createElement('div');
        errDiv.className = 'callout-box warning';
        errDiv.style.margin = '20px';
        errDiv.textContent = `Error loading PRB datasets: ${String(err)}`;
        document.body.prepend(errDiv);
        return;
    }

    // 4. State Management
    const filterState: EvidenceFilterState = {
        startDate: '2024-08-01',
        endDate: '2024-10-01',
        includeSynthetic: false, // REAL DATA DEFAULT
        statusFilter: new Set([
            'field_confirmed', 
            'sensor_detection', 
            'unverified_report', 
            'reignited_vegetation', 
            'extinguished'
        ]),
        methodFilter: new Set([
            'aerial_survey', 
            'satellite_ir', 
            'field_visit', 
            'incident_report', 
            'historical_literature'
        ]),
        showGeology: true,
        showPerimeters: true,
        showSurveys: true,
        showObservations: true
    };

    // 5. Initialize UI Components
    const evidencePanel = new EvidencePanel('evidence-panel-container');
    const timelineControl = new TimelineControl('timeline-control-container');
    const mapLegend = new MapLegend('legend-card-container');

    // Sync function
    const updateApplicationState = () => {
        const filtered = filterEvidence(dataset, filterState);
        layerManager.syncLayers(filtered, (selected) => {
            evidencePanel.showFeature(selected);
        });

        // Update active panel tab content
        const tab = evidencePanel.getCurrentTab();
        if (tab === 'records') {
            evidencePanel.renderRecordsTable(filtered.filteredObservations, filtered.filteredPerimeters);
        } else if (tab === 'gaps') {
            evidencePanel.renderDataGaps(dataset.manifest);
        } else if (tab === 'manifest') {
            evidencePanel.renderManifest(dataset.manifest);
        }

        // Update real vs synthetic indicator
        const synthNotice = document.getElementById('active-mode-notice');
        if (synthNotice) {
            if (filterState.includeSynthetic) {
                synthNotice.style.display = 'inline-flex';
                synthNotice.className = 'status-badge status-sensor_detection';
                synthNotice.textContent = '⚠️ SYNTHETIC VALIDATION FIXTURES ACTIVE (TESTING ONLY)';
            } else {
                synthNotice.style.display = 'inline-flex';
                synthNotice.className = 'status-badge status-field_confirmed';
                synthNotice.textContent = '✓ VERIFIED REAL DATASETS ONLY';
            }
        }
    };

    // 6. Connect EvidencePanel events
    evidencePanel.setOnRecordSelect((id: string) => {
        // Select from table
        const obs = dataset.observations.find(o => o.id === id);
        if (obs) {
            evidencePanel.showFeature({ type: 'observation', data: obs });
            if (obs.geometry.type === 'Point') {
                map.flyTo({ center: (obs.geometry as GeoJSON.Point).coordinates as [number, number], zoom: 12 });
            }
            return;
        }
        const perim = dataset.firePerimeters.find(p => p.id === id);
        if (perim) {
            evidencePanel.showFeature({ type: 'perimeter', data: perim });
            map.flyTo({ center: REMINGTON_CENTER, zoom: 9.5 });
        }
    });

    const panelEl = document.getElementById('evidence-panel-container');
    panelEl?.addEventListener('tabchange', () => {
        updateApplicationState();
    });

    // 7. Connect TimelineControl events
    timelineControl.setOnChange((e) => {
        filterState.startDate = e.startDate;
        filterState.endDate = e.endDate;
        filterState.includeSynthetic = e.includeSynthetic;
        updateApplicationState();
    });

    // 8. Connect MapLegend events
    mapLegend.setOnLayerToggle((layers: LayerVisibilityState) => {
        filterState.showGeology = layers.showGeology;
        filterState.showPerimeters = layers.showPerimeters;
        filterState.showSurveys = layers.showSurveys;
        filterState.showObservations = layers.showObservations;
        updateApplicationState();
    });

    mapLegend.setOnBasemapChange((theme) => {
        if (theme === 'contour') {
            const style = createContourStyle(demSource);
            map.setStyle(style);
        } else if (theme === 'liberty') {
            map.setStyle(BASEMAP_STYLES.liberty);
        } else {
            map.setStyle(BASEMAP_STYLES.positron);
        }
    });

    mapLegend.setOnPerspectiveToggle((isOblique: boolean) => {
        map.easeTo({
            pitch: isOblique ? 35 : 0,
            bearing: isOblique ? -15 : 0,
            duration: 800
        });
    });

    // 9. Wire Header Actions & Persistent Theme Management
    const btnTheme = document.getElementById('btn-toggle-theme');
    const savedTheme = localStorage.getItem('prb-theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    let isDark = savedTheme ? savedTheme === 'dark' : prefersDark;

    const applyTheme = (dark: boolean) => {
        isDark = dark;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        if (btnTheme) btnTheme.textContent = isDark ? '☀️ LIGHT THEME' : '🌙 DARK THEME';
        localStorage.setItem('prb-theme', isDark ? 'dark' : 'light');
    };

    applyTheme(isDark);

    btnTheme?.addEventListener('click', () => {
        applyTheme(!isDark);
    });

    // Global Escape shortcut to reset active inspection
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            evidencePanel.showFeature(null);
        }
    });

    const btnExportGeo = document.getElementById('btn-export-geojson');
    btnExportGeo?.addEventListener('click', () => {
        const filtered = filterEvidence(dataset, filterState);
        ExportDialog.exportGeoJson(filtered, dataset.manifest);
    });

    const btnExportCsv = document.getElementById('btn-export-csv');
    btnExportCsv?.addEventListener('click', () => {
        const filtered = filterEvidence(dataset, filterState);
        ExportDialog.exportCsv(filtered);
    });

    const btnExportBrief = document.getElementById('btn-export-brief');
    btnExportBrief?.addEventListener('click', () => {
        const filtered = filterEvidence(dataset, filterState);
        const canvas = map.getCanvas();
        ExportDialog.exportStaticBrief(filtered, dataset.manifest, canvas);
    });

    // Initial map load trigger
    map.on('load', () => {
        updateApplicationState();
        // Show initial perimeter feature in evidence inspector
        if (dataset.firePerimeters.length > 0) {
            evidencePanel.showFeature({ type: 'perimeter', data: dataset.firePerimeters[0] });
        }
    });
}

// Start on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
