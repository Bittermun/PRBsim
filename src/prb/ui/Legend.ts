/**
 * Cartographic Legend & Layer Control for PRB Evidence Explorer
 *
 * - Symbol key distinguishing shape, radius/stroke style, and verification badges
 * - Explicit retrospective final-footprint label for the 2024 Remington Wildfire perimeter (map date 2025-01-15)
 * - Explicit synthetic/schematic label for regional geology context polygons
 * - Layer visibility controls, basemap switcher, and camera perspective toggle
 */

export interface LayerVisibilityState {
    showGeology: boolean;
    showPerimeters: boolean;
    showSurveys: boolean;
    showObservations: boolean;
}

export class MapLegend {
    private container: HTMLElement;
    private onLayerToggleCallback: ((state: LayerVisibilityState) => void) | null = null;
    private onBasemapChangeCallback: ((theme: 'positron' | 'liberty' | 'contour') => void) | null = null;
    private onPerspectiveToggleCallback: ((isOblique: boolean) => void) | null = null;

    private state: LayerVisibilityState = {
        showGeology: true,
        showPerimeters: true,
        showSurveys: true,
        showObservations: true
    };
    private isOblique = false;

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`MapLegend container '${containerId}' not found`);
        this.container = el;
        this.render();
    }

    public getLayerState(): LayerVisibilityState {
        return { ...this.state };
    }

    public setOnLayerToggle(cb: (state: LayerVisibilityState) => void): void {
        this.onLayerToggleCallback = cb;
    }

    public setOnBasemapChange(cb: (theme: 'positron' | 'liberty' | 'contour') => void): void {
        this.onBasemapChangeCallback = cb;
    }

    public setOnPerspectiveToggle(cb: (isOblique: boolean) => void): void {
        this.onPerspectiveToggleCallback = cb;
    }

    private render(): void {
        this.container.innerHTML = `
            <div class="legend-card">
                <div class="legend-header">
                    <h4>MAP LAYERS &amp; SYMBOLOGY</h4>
                </div>

                <div class="legend-section">
                    <span class="legend-subhead">CONTROLS &amp; PERSPECTIVE</span>
                    <div class="controls-row">
                        <button class="legend-toggle-btn" id="btn-toggle-perspective" title="Toggle between 2D North-Up Planimetric view and 35-degree Oblique camera pitch">
                            📐 VIEW: <span id="perspective-label">2D NORTH-UP</span>
                        </button>
                    </div>
                    <div class="basemap-select-row">
                        <label for="basemap-select">BASEMAP:</label>
                        <select id="basemap-select" class="basemap-dropdown">
                            <option value="positron" selected>OpenFreeMap Positron (Restrained)</option>
                            <option value="liberty">OpenFreeMap Liberty (Vector Detailed)</option>
                            <option value="contour">Topographic DEM Contours + Hillshade</option>
                        </select>
                    </div>
                </div>

                <div class="legend-section">
                    <span class="legend-subhead">RESEARCH OVERLAYS</span>
                    <label class="layer-toggle-label">
                        <input type="checkbox" id="layer-perim" ${this.state.showPerimeters ? 'checked' : ''} />
                        <span class="swatch swatch-perim"></span>
                        <span>Remington Final Perimeter (196.4k ac; Map Date 2025-01-15, Static Context)</span>
                    </label>
                    <label class="layer-toggle-label">
                        <input type="checkbox" id="layer-obs" ${this.state.showObservations ? 'checked' : ''} />
                        <span class="swatch swatch-obs"></span>
                        <span>Combustion Observations &amp; Vents (Synthetic Mode Only)</span>
                    </label>
                    <label class="layer-toggle-label">
                        <input type="checkbox" id="layer-surveys" ${this.state.showSurveys ? 'checked' : ''} />
                        <span class="swatch swatch-survey"></span>
                        <span>Negative Thermal Surveys (Bounded, Synthetic Mode)</span>
                    </label>
                    <label class="layer-toggle-label">
                        <input type="checkbox" id="layer-geology" ${this.state.showGeology ? 'checked' : ''} />
                        <span class="swatch swatch-clinker"></span>
                        <span>Schematic Clinker &amp; Coal Context (Synthetic Fixture Only)</span>
                    </label>
                </div>

                <div class="legend-section">
                    <span class="legend-subhead">EVIDENCE STATUS KEY (COLOR + STROKE/SIZE)</span>
                    <div class="status-key-grid">
                        <div class="status-key-item"><span class="dot dot-field" style="width:10px;height:10px;border:2px solid #065f46;"></span> Field Confirmed (Large r=8, Thick White Ring)</div>
                        <div class="status-key-item"><span class="dot dot-sensor" style="width:9px;height:9px;border:2px solid #1e293b;"></span> Sensor Detection (Med r=7, Dark Ring)</div>
                        <div class="status-key-item"><span class="dot dot-unverified" style="width:7px;height:7px;border:1px dashed #5b21b6;"></span> Unverified Narrative / Historical (Small r=5.5)</div>
                        <div class="status-key-item"><span class="dot dot-extinguished" style="width:7px;height:7px;border:1.5px solid #475569;"></span> Extinguished / Inactive Vent (Small r=5)</div>
                        <div class="status-key-item"><span class="dot dot-reignited" style="width:11px;height:11px;border:2px solid #fef08a;"></span> Re-ignited Vegetation Hypothesis (XL r=9)</div>
                    </div>
                    <div class="grouping-caveat-box">
                        <span class="icon">ℹ</span>
                        <span><strong>Static Final Footprint:</strong> The red Remington perimeter is a single retrospective polygon (mapped 2025-01-15), not daily fire spread. Dashed orange boundaries indicate <strong>unresolved multi-vent bodies</strong>.</span>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
    }

    private bindEvents(): void {
        const perspBtn = this.container.querySelector('#btn-toggle-perspective');
        const basemapSelect = this.container.querySelector('#basemap-select') as HTMLSelectElement;

        const checkPerim = this.container.querySelector('#layer-perim') as HTMLInputElement;
        const checkObs = this.container.querySelector('#layer-obs') as HTMLInputElement;
        const checkSurv = this.container.querySelector('#layer-surveys') as HTMLInputElement;
        const checkGeo = this.container.querySelector('#layer-geology') as HTMLInputElement;

        perspBtn?.addEventListener('click', () => {
            this.isOblique = !this.isOblique;
            const label = this.container.querySelector('#perspective-label');
            if (label) {
                label.textContent = this.isOblique ? '3D OBLIQUE (35° PITCH)' : '2D NORTH-UP';
            }
            if (this.onPerspectiveToggleCallback) {
                this.onPerspectiveToggleCallback(this.isOblique);
            }
        });

        basemapSelect?.addEventListener('change', () => {
            if (this.onBasemapChangeCallback) {
                this.onBasemapChangeCallback(basemapSelect.value as 'positron' | 'liberty' | 'contour');
            }
        });

        const notifyLayers = () => {
            this.state = {
                showPerimeters: checkPerim?.checked ?? true,
                showObservations: checkObs?.checked ?? true,
                showSurveys: checkSurv?.checked ?? true,
                showGeology: checkGeo?.checked ?? true
            };
            if (this.onLayerToggleCallback) {
                this.onLayerToggleCallback(this.state);
            }
        };

        checkPerim?.addEventListener('change', notifyLayers);
        checkObs?.addEventListener('change', notifyLayers);
        checkSurv?.addEventListener('change', notifyLayers);
        checkGeo?.addEventListener('change', notifyLayers);
    }
}
