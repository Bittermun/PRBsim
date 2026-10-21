/**
 * Main Application Entry Point for the Powder River Basin (PRB) Coal-Fire Evidence Explorer
 * Study Area: 2024 Remington Wildfire (MT/WY) & Surrounding Fort Union Stratigraphy
 */

import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

import { loadPRBEvidenceData } from './data/load.ts';
import { filterEvidence } from './data/select.ts';
import { deriveTimelineBounds } from './data/dates.ts';
import { EvidenceImportStore, type ImportOperationResult } from './data/import.ts';
import type { FilterState, PRBEvidenceDataset } from './data/types.ts';

import { BASEMAP_STYLES, initDemSource, createContourStyle } from './map/styles.ts';
import { initEvidenceLayers, updateEvidenceLayers, setLayerGroupVisibility } from './map/layers.ts';

import { TimelineControl } from './ui/TimelineControl.ts';
import { EvidencePanel, escapeHtml } from './ui/EvidencePanel.ts';
import { MapLegend } from './ui/Legend.ts';
import { ResearchWorkbench } from './ui/ResearchWorkbench.ts';
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
    maplibregl.setWorkerUrl(mapWorkerUrl);

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
        canvasContextAttributes: { preserveDrawingBuffer: true }
    });
    // Remember specification readiness even if it happens before local files finish loading.
    const initialStyleReady = new Promise<void>(resolve => { map.once('style.load', () => resolve()); });

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
    const importStore = new EvidenceImportStore(dataset);
    const restored = await importStore.restore();
    dataset = restored.dataset;
    const initialBounds = deriveTimelineBounds(dataset);

    // 3. Initial Filter State (Quarantine Synthetic Data by Default)
    const filterState: FilterState = {
        startDate: initialBounds?.focusStartDate || initialBounds?.minDate || '2024-08-01',
        endDate: initialBounds?.focusEndDate || initialBounds?.maxDate || '2024-10-01',
        includeSynthetic: false,
        allowedStatuses: [
            'field_confirmed',
            'sensor_detection',
            'unverified_report',
            'extinguished',
            'reignited_vegetation'
        ]
    };
    // Restored real local reports can extend beyond the original incident window.
    if (restored.restoredPackages > 0 && initialBounds && [...dataset.observations, ...dataset.surveys].some(record => record.id.startsWith('local:') && !record.isSynthetic)) {
        filterState.startDate = initialBounds.minDate;
        filterState.endDate = initialBounds.maxDate;
    }

    let currentFilteredData = filterEvidence(dataset, filterState);

    // 4. Initialize UI Components
    const evidencePanel = new EvidencePanel('evidence-panel-container', dataset);
    const timeline = new TimelineControl('timeline-control-container', initialBounds || undefined);
    timeline.setDateWindow(filterState.startDate, filterState.endDate);
    const legend = new MapLegend('legend-card-container');

    evidencePanel.updateFilteredData(currentFilteredData);

    const modeBadge = document.getElementById('active-mode-notice');
    let workbench: ResearchWorkbench | undefined;

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
            dataset.syntheticSources,
            { dataset }
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

    void initialStyleReady.then(mountEvidenceLayers);

    function refreshActiveView(): void {
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

        updateModeNotice();
    }

    function updateModeNotice(): void {
        const local = dataset.observations.filter(record => record.id.startsWith('local:'));
        const localReal = local.filter(record => !record.isSynthetic);
        const activeLocal = currentFilteredData.observations.filter(record => record.id.startsWith('local:'));
        const hiddenSynthetic = local.filter(record => record.isSynthetic && !filterState.includeSynthetic).length;
        const localSurveys = dataset.surveys.filter(record => record.id.startsWith('local:'));
        const activeLocalSurveys = currentFilteredData.surveys.filter(record => record.id.startsWith('local:'));
        const activeLocalSurveyIds = new Set(activeLocalSurveys.map(record => record.id));
        const hiddenSyntheticSurveys = localSurveys.filter(record => record.isSynthetic && !filterState.includeSynthetic).length;
        const hiddenDateSurveys = localSurveys.filter(record => (!record.isSynthetic || filterState.includeSynthetic) && !activeLocalSurveyIds.has(record.id)).length;
        const packages = new Set(importStore.getHistory().map(revision => revision.packageId)).size;
        if (modeBadge) {
            if (filterState.includeSynthetic) {
                modeBadge.textContent = `⚠ SYNTHETIC VALIDATION FIXTURES & SCHEMATIC GEOLOGY ACTIVE (NOT REAL OBSERVATIONS)${packages ? ` · ${activeLocal.length} local unreviewed reports in view` : ''}`;
                modeBadge.className = 'status-badge status-sensor_detection';
            } else if (localReal.length || dataset.surveys.some(record => record.id.startsWith('local:') && !record.isSynthetic)) {
                modeBadge.textContent = `LOCAL EVIDENCE: ${activeLocal.length} unreviewed observations and ${activeLocalSurveys.length} unreviewed surveys in view. Bundled WFIGS footprint retained; underground inventory remains unverified.`;
                modeBadge.className = 'status-badge status-unverified_report';
            } else {
                modeBadge.textContent = `${REAL_MODE_BADGE_TEXT}${hiddenSynthetic ? ` · ${hiddenSynthetic} local synthetic reports quarantined` : ''}`;
                modeBadge.className = 'status-badge status-field_confirmed';
            }
        }
        workbench?.setEvidenceNote(packages
            ? `${packages} local package(s) loaded. ${activeLocal.length} imported observation(s) and ${activeLocalSurveys.length} imported survey(s) in the current date window. ${hiddenSynthetic || hiddenSyntheticSurveys ? `${hiddenSynthetic} synthetic observation(s) and ${hiddenSyntheticSurveys} synthetic survey(s) hidden until Synthetic Validation Fixtures is enabled on the timeline. ` : ''}${localReal.length > activeLocal.filter(record => !record.isSynthetic).length || hiddenDateSurveys ? 'Some local reports are outside the selected dates. Adjust the timeline to include their reported dates. ' : ''}Imported observations and surveys remain unreviewed; source authenticity and combustion claims require review.`
            : 'No local imports loaded. The map retains the bundled WFIGS final footprint; no verified underground observation inventory has been acquired.');
    }

    // 6. Wire Timeline & Synthetic Quarantine Changes
    timeline.setOnChange(evt => {
        const syntheticChanged = filterState.includeSynthetic !== evt.includeSynthetic;
        filterState.startDate = evt.startDate;
        filterState.endDate = evt.endDate;
        filterState.includeSynthetic = evt.includeSynthetic;
        if (syntheticChanged) {
            const bounds = deriveTimelineBounds(dataset, evt.includeSynthetic);
            if (bounds) timeline.setBounds(bounds);
        }
        refreshActiveView();
    });

    function replaceDataset(next: PRBEvidenceDataset, result: ImportOperationResult): void {
        dataset = next;
        evidencePanel.setDataset(dataset);
        const bounds = deriveTimelineBounds(dataset, filterState.includeSynthetic);
        if (bounds) {
            timeline.setBounds(bounds);
            if ('action' in result && ['added', 'replaced'].includes(String(result.action)) && [...dataset.observations, ...dataset.surveys].some(record => record.id.startsWith('local:') && !record.isSynthetic)) {
                // Expand deliberately after intake so new dated reports are immediately inspectable.
                timeline.setDateWindow(bounds.minDate, bounds.maxDate);
            }
        }
        refreshActiveView();
    }

    const toolsButton = document.getElementById('btn-research-tools') as HTMLButtonElement | null;
    if (toolsButton) {
        workbench = new ResearchWorkbench({
            trigger: toolsButton, store: importStore, onDatasetChange: replaceDataset,
            sampleUrl: new URL(`${baseUrl}data/prb/templates/synthetic-evidence-package.json`, location.href).toString(),
            getCurrentBbox: () => {
                const bounds = map.getBounds();
                const west = bounds.getWest(), south = bounds.getSouth(), east = bounds.getEast(), north = bounds.getNorth();
                return [west, south, east, north].every(Number.isFinite) && west >= -180 && east <= 180 && west < east && south >= -90 && north <= 90 && south < north
                    ? [west, south, east, north] : null;
            },
            onOpen: () => {
                const play = document.getElementById('btn-play-pause');
                if (play?.textContent?.includes('PAUSE')) play.click();
            }
        });
    }
    updateModeNotice();

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
    let pendingStyleReady: (() => void) | null = null;
    legend.setOnBasemapChange(theme => {
        const currentSeq = ++styleSwitchSeq;
        if (pendingStyleReady) map.off('style.load', pendingStyleReady);
        let mounted = false;

        const onStyleReady = () => {
            if (mounted || currentSeq !== styleSwitchSeq) return;
            mounted = true;
            map.off('style.load', onStyleReady);
            pendingStyleReady = null;
            mountEvidenceLayers();
        };

        pendingStyleReady = onStyleReady;
        map.on('style.load', onStyleReady);

        // A fresh style provides a reliable specification-ready event. Waiting for
        // every basemap/terrain tile would unnecessarily hide independent local evidence.
        if (theme === 'contour') {
            map.setStyle(createContourStyle(demSource), { diff: false });
        } else {
            map.setStyle(BASEMAP_STYLES[theme], { diff: false });
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
            currentAssessment,
            dataset.syntheticSources
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
