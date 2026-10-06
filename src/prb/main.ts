/**
 * Main Application Entry Point for the Powder River Basin (PRB) Coal-Fire Evidence Explorer
 * Study Area: 2024 Remington Wildfire (MT/WY) & Surrounding Fort Union Stratigraphy
 */

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { loadPRBEvidenceData } from './data/load.ts';
import { filterEvidence } from './data/select.ts';
import type { FilterState, PRBEvidenceDataset } from './data/types.ts';

import { BASEMAP_STYLES, initDemSource, createContourStyle } from './map/styles.ts';
import { initEvidenceLayers, updateEvidenceLayers, setLayerGroupVisibility } from './map/layers.ts';

import { TimelineControl } from './ui/TimelineControl.ts';
import { EvidencePanel, escapeHtml } from './ui/EvidencePanel.ts';
import { MapLegend } from './ui/Legend.ts';
import {
    exportFilteredGeoJson,
    exportFilteredCsv,
    exportAssessmentCsv,
    openPrintableEvidenceBrief
} from './ui/ExportDialog.ts';
import {
    assessLocation,
    type AssessmentSelection,
    type LocationAssessment
} from './data/assessment.ts';

// Remington Wildfire & Southern Montana / Northern Wyoming PRB Center
const REMINGTON_CENTER: [number, number] = [-106.08, 45.01];
const DEFAULT_ZOOM = 9.2;

const REAL_MODE_BADGE_TEXT =
    '✓ REAL MODE: 1 WFIGS PERIMETER ONLY (NO VERIFIED COAL-FIRE OR LOCAL GEOLOGY INVENTORY)';

async function bootstrapPRBExplorer() {
    const baseUrl = import.meta.env.BASE_URL || '/';

    // 1. Initialize MapLibre GL JS Map
    const demSource = initDemSource(maplibregl);

    const map = new maplibregl.Map({
        container: 'prb-map-container',
        style: BASEMAP_STYLES.positron,
        center: REMINGTON_CENTER,
        zoom: DEFAULT_ZOOM,
        pitch: 0,
        bearing: 0,
        maxPitch: 60,
        // @ts-ignore - MapLibre preserveDrawingBuffer for static PNG brief capture
        canvasContextAttributes: { preserveDrawingBuffer: true }
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 140, unit: 'metric' }), 'bottom-left');

    // 2. Load & Verify PRB Evidence Datasets
    let dataset: PRBEvidenceDataset;
    try {
        dataset = await loadPRBEvidenceData(baseUrl);
    } catch (err) {
        console.error('Failed to initialize PRB Evidence Explorer:', err);
        const errBanner = document.getElementById('evidence-panel-container');
        if (errBanner) {
            const msg = err instanceof Error ? err.message : String(err);
            errBanner.innerHTML = `<div class="callout-box warning" style="margin:20px;"><strong>Dataset Initialization Error:</strong> ${escapeHtml(msg)}</div>`;
        }
        return;
    }

    // 3. Initial Filter State (Quarantine Synthetic Data by Default)
    const filterState: FilterState = {
        startDate: '2024-08-01',
        endDate: '2024-10-01',
        includeSynthetic: false,
        allowedStatuses: [
            'field_confirmed',
            'sensor_detection',
            'unverified_report',
            'extinguished',
            'reignited_vegetation'
        ]
    };

    let currentFilteredData = filterEvidence(dataset, filterState);

    // 4. Initialize UI Components
    const evidencePanel = new EvidencePanel('evidence-panel-container', dataset);
    const timeline = new TimelineControl('timeline-control-container');
    const legend = new MapLegend('legend-card-container');

    evidencePanel.updateFilteredData(currentFilteredData);

    const modeBadge = document.getElementById('active-mode-notice');
    if (modeBadge) {
        modeBadge.textContent = REAL_MODE_BADGE_TEXT;
        modeBadge.className = 'status-badge status-field_confirmed';
    }

    // Selection & Assessment State
    let activeSelection: AssessmentSelection | null = null;
    let currentAssessment: LocationAssessment | null = null;
    let targetMarker: maplibregl.Marker | null = null;

    function updateAssessment(selection: AssessmentSelection | null, panTo = false) {
        activeSelection = selection;
        if (!selection) {
            currentAssessment = null;
            evidencePanel.clearAssessment();
            if (targetMarker) {
                targetMarker.remove();
                targetMarker = null;
            }
            return;
        }

        currentAssessment = assessLocation(
            selection,
            currentFilteredData,
            dataset.manifest,
            filterState,
            dataset.syntheticSources
        );
        if (!currentAssessment) {
            evidencePanel.clearAssessment();
            if (targetMarker) {
                targetMarker.remove();
                targetMarker = null;
            }
            return;
        }

        evidencePanel.showLocationAssessment(currentAssessment);

        const targetCoords: [number, number] =
            selection.kind === 'coordinate'
                ? selection.coordinate
                : currentAssessment.coordinate;

        if (!targetMarker) {
            const el = document.createElement('div');
            el.className = 'assessment-target-marker';
            el.setAttribute('aria-hidden', 'true');
            targetMarker = new maplibregl.Marker({ element: el }).setLngLat(targetCoords).addTo(map);
        } else {
            targetMarker.setLngLat(targetCoords);
        }

        if (panTo) {
            map.flyTo({ center: targetCoords, zoom: Math.max(map.getZoom(), 11.5), duration: 600 });
        }
    }

    // Pan/zoom to feature when selected from the accessible records table
    evidencePanel.setOnFeatureSelect((id, coords) => {
        if (coords) {
            map.flyTo({ center: coords, zoom: 12.5, duration: 900 });
        }
        const obs = currentFilteredData.observations.find(o => o.id === id);
        if (obs && obs.geometry.type === 'Point') {
            updateAssessment({ kind: 'observation', observationId: id }, false);
        } else {
            updateAssessment(null, false);
        }
    });

    // Wire coordinate form inspection, clearing, and CSV download
    evidencePanel.setOnCoordinateInspect(coords => {
        updateAssessment({ kind: 'coordinate', coordinate: coords }, true);
    });

    evidencePanel.setOnClearAssessment(() => {
        updateAssessment(null, false);
    });

    evidencePanel.setOnDownloadAssessmentCsv(assessment => {
        exportAssessmentCsv(assessment, filterState);
    });

    // 5. Render Map Layers once style is loaded (handling case where map loaded before fetch completed)
    const applyLegendVisibility = () => {
        const layerState = legend.getLayerState();
        setLayerGroupVisibility(map, 'geology', layerState.showGeology);
        setLayerGroupVisibility(map, 'perimeters', layerState.showPerimeters);
        setLayerGroupVisibility(map, 'surveys', layerState.showSurveys);
        setLayerGroupVisibility(map, 'observations', layerState.showObservations);
    };

    const mountEvidenceLayers = () => {
        initEvidenceLayers(
            map,
            currentFilteredData,
            (type, props, _coords) => {
                evidencePanel.selectFeature(type, props);
                if (type === 'observation' && props?.id) {
                    const obs = currentFilteredData.observations.find(o => o.id === props.id);
                    if (obs && obs.geometry.type === 'Point') {
                        updateAssessment({ kind: 'observation', observationId: String(props.id) }, false);
                        return;
                    }
                }
                updateAssessment(null, false);
            },
            (emptyCoords: [number, number]) => {
                updateAssessment({ kind: 'coordinate', coordinate: emptyCoords }, false);
            }
        );
        applyLegendVisibility();
    };

    if (map.loaded() || map.isStyleLoaded()) {
        mountEvidenceLayers();
    } else {
        map.on('load', mountEvidenceLayers);
    }

    // 6. Wire Timeline & Synthetic Quarantine Changes
    timeline.setOnChange(evt => {
        filterState.startDate = evt.startDate;
        filterState.endDate = evt.endDate;
        filterState.includeSynthetic = evt.includeSynthetic;

        currentFilteredData = filterEvidence(dataset, filterState);
        updateEvidenceLayers(map, currentFilteredData);
        evidencePanel.updateFilteredData(currentFilteredData);

        // Reconcile assessment against newly filtered data
        if (activeSelection) {
            const currentSel = activeSelection;
            if (currentSel.kind === 'observation') {
                const obsStillVisible = currentFilteredData.observations.some(
                    o => o.id === currentSel.observationId
                );
                if (!obsStillVisible) {
                    updateAssessment(null, false);
                } else {
                    updateAssessment(currentSel, false);
                }
            } else if (currentSel.kind === 'coordinate') {
                updateAssessment(currentSel, false);
            }
        }

        if (modeBadge) {
            if (evt.includeSynthetic) {
                modeBadge.textContent = '⚠ SYNTHETIC VALIDATION FIXTURES & SCHEMATIC GEOLOGY ACTIVE (NOT REAL OBSERVATIONS)';
                modeBadge.className = 'status-badge status-sensor_detection';
            } else {
                modeBadge.textContent = REAL_MODE_BADGE_TEXT;
                modeBadge.className = 'status-badge status-field_confirmed';
            }
        }
    });

    // 7. Wire Legend Layer Toggles, Basemap Switcher & Camera Perspective
    legend.setOnLayerToggle(layerState => {
        setLayerGroupVisibility(map, 'geology', layerState.showGeology);
        setLayerGroupVisibility(map, 'perimeters', layerState.showPerimeters);
        setLayerGroupVisibility(map, 'surveys', layerState.showSurveys);
        setLayerGroupVisibility(map, 'observations', layerState.showObservations);
    });

    legend.setOnPerspectiveToggle(isOblique => {
        map.easeTo({
            pitch: isOblique ? 35 : 0,
            bearing: isOblique ? -12 : 0,
            duration: 700
        });
    });

    let styleSwitchSeq = 0;
    legend.setOnBasemapChange(theme => {
        const currentSeq = ++styleSwitchSeq;
        let mounted = false;

        const onStyleReady = () => {
            if (mounted || currentSeq !== styleSwitchSeq) return;
            if (!map.isStyleLoaded()) return;
            mounted = true;
            map.off('style.load', onStyleReady);
            map.off('styledata', onStyleReady);
            mountEvidenceLayers();
        };

        map.on('style.load', onStyleReady);
        map.on('styledata', onStyleReady);

        if (theme === 'contour') {
            map.setStyle(createContourStyle(demSource));
        } else {
            map.setStyle(BASEMAP_STYLES[theme]);
        }
    });

    // 8. Wire Header Export & Theme Controls
    const btnGeoJson = document.getElementById('btn-export-geojson');
    const btnCsv = document.getElementById('btn-export-csv');
    const btnBrief = document.getElementById('btn-export-brief');
    const btnTheme = document.getElementById('btn-toggle-theme');

    btnGeoJson?.addEventListener('click', () => {
        exportFilteredGeoJson(
            currentFilteredData,
            dataset.manifest,
            filterState,
            dataset.syntheticSources,
            currentAssessment
        );
    });

    btnCsv?.addEventListener('click', () => {
        exportFilteredCsv(
            currentFilteredData,
            dataset.manifest,
            filterState,
            dataset.syntheticSources
        );
    });

    btnBrief?.addEventListener('click', () => {
        openPrintableEvidenceBrief(
            currentFilteredData,
            dataset.manifest,
            filterState,
            map.getCanvas(),
            currentAssessment
        );
    });

    btnTheme?.addEventListener('click', () => {
        const html = document.documentElement;
        const isDark = html.getAttribute('data-theme') === 'dark';
        html.setAttribute('data-theme', isDark ? 'light' : 'dark');
        btnTheme.textContent = isDark ? '🌙 DARK THEME' : '☀️ LIGHT THEME';
    });
}

bootstrapPRBExplorer();
