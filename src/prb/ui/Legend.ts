/**
 * Cartographic Legend & Layer Control for PRB Evidence Explorer
 * 
 * - Symbol key distinguishing shape, line style, and verification badges
 * - Layer visibility controls
 * - Basemap theme switcher
 * - Camera perspective toggle (2D Planimetric vs Oblique Angle)
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
                    <h4>MAP LAYERS & SYMBOLOGY</h4>
                </div>

                <div class="legend-section">
                    <span class="legend-subhead">CONTROLS & PERSPECTIVE</span>
                    <div class="controls-row">
                        <button class="legend-toggle-btn" id="btn-toggle-perspective" title="Toggle between 2D North-Up Planimetric view and 30-degree Oblique camera pitch">
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
                        <span>Remington Wildfire Perimeter (196k ac)</span>
                    </label>
                    <label class="layer-toggle-label">
                        <input type="checkbox" id="layer-obs" ${this.state.showObservations ? 'checked' : ''} />
                        <span class="swatch swatch-obs"></span>
                        <span>Combustion Observations & Vents</span>
                    </label>
                    <label class="layer-toggle-label">
                        <input type="checkbox" id="layer-surveys" ${this.state.showSurveys ? 'checked' : ''} />
                        <span class="swatch swatch-survey"></span>
                        <span>Negative Thermal Surveys (Bounded)</span>
                    </label>
                    <label class="layer-toggle-label">
                        <input type="checkbox" id="layer-geology" ${this.state.showGeology ? 'checked' : ''} />
                        <span class="swatch swatch-clinker"></span>
                        <span>Clinker & Coal Stratigraphy (USGS/MBMG)</span>
                    </label>
                </div>

                <div class="legend-section">
                    <span class="legend-subhead">EVIDENCE STATUS KEY</span>
                    <div class="status-key-grid">
                        <div class="status-key-item"><span class="dot dot-field"></span> Field Confirmed (Thermocouple/Gas)</div>
                        <div class="status-key-item"><span class="dot dot-sensor"></span> Sensor Detection (Aerial FLIR/IR)</div>
                        <div class="status-key-item"><span class="dot dot-unverified"></span> Unverified Narrative / Historical</div>
                        <div class="status-key-item"><span class="dot dot-reignited"></span> Re-ignited Vegetation (Hypothesis)</div>
                    </div>
                    <div class="grouping-caveat-box">
                        <span class="icon">ℹ</span>
                        <span>Dashed orange boundaries indicate <strong>unresolved multi-vent bodies</strong> sharing potential continuous subsurface combustion.</span>
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
                this.onBasemapChangeCallback(basemapSelect.value as any);
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
