/**
 * Timeline Control & Date Scrubber for PRB Evidence Explorer
 *
 * - Deterministic forward and backward step controls
 * - Timezone-safe date arithmetic (UTC calendar days)
 * - Synthetic test fixtures toggle with explicit visual badge
 * - Non-continuous observation framing: scrubs discrete observation/survey windows
 *   while the 2024 Remington Wildfire final perimeter (map date 2025-01-15) remains static context
 * - Guards against inverted date ranges (startDate > endDate)
 */

export interface TimelineChangeEvent {
    startDate: string;
    endDate: string;
    currentScrubDate: string;
    includeSynthetic: boolean;
}

export class TimelineControl {
    private container: HTMLElement;
    private minDate: string = '1975-01-01'; // Accommodates historic literature baseline
    private maxDate: string = '2025-12-31'; // Accommodates 2025-01-15 polygon snapshot & post-fire surveys
    private currentStartDate: string = '2024-08-01';
    private currentEndDate: string = '2024-10-01';
    private isPlaying: boolean = false;
    private playInterval: number | null = null;
    private includeSynthetic: boolean = false;
    private onDateChange: ((event: TimelineChangeEvent) => void) | null = null;
    private keyListener: ((e: KeyboardEvent) => void) | null = null;

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`TimelineControl container '${containerId}' not found`);
        this.container = el;
        this.render();
    }

    public setOnChange(callback: (event: TimelineChangeEvent) => void): void {
        this.onDateChange = callback;
    }

    public setDateWindow(start: string, end: string): void {
        const safeStart = start <= end ? start : end;
        const safeEnd = end >= start ? end : start;
        this.currentStartDate = safeStart;
        this.currentEndDate = safeEnd;
        const startInput = this.container.querySelector('#timeline-date-start') as HTMLInputElement;
        const endInput = this.container.querySelector('#timeline-date-end') as HTMLInputElement;
        if (startInput) startInput.value = safeStart;
        if (endInput) endInput.value = safeEnd;
        this.triggerChange();
    }

    public setIncludeSynthetic(val: boolean): void {
        this.includeSynthetic = val;
        const toggle = this.container.querySelector('#toggle-synthetic-fixtures') as HTMLInputElement;
        if (toggle) toggle.checked = val;
        this.triggerChange();
    }

    private render(): void {
        this.container.innerHTML = `
            <div class="timeline-hud-card">
                <div class="timeline-meta-bar">
                    <div class="timeline-badge-group">
                        <span class="hud-label">OBSERVATION FILTER WINDOW:</span>
                        <span class="hud-value" id="current-window-display">${this.currentStartDate} → ${this.currentEndDate}</span>
                        <span class="study-area-tag" title="The WFIGS Remington wildfire polygon (2025-01-15) is a single retrospective final boundary, so it remains visible across dates rather than animating daily spread.">
                            Perimeter: Static Final Footprint (Map Date 2025-01-15)
                        </span>
                    </div>

                    <div class="synthetic-toggle-group">
                        <label class="synthetic-switch-label" title="Enable synthetic test fixtures demonstrating multi-vent grouping, negative surveys, and schematic stratigraphy">
                            <input type="checkbox" id="toggle-synthetic-fixtures" ${this.includeSynthetic ? 'checked' : ''} />
                            <span class="synthetic-badge">SYNTHETIC VALIDATION FIXTURES (QUARANTINED)</span>
                        </label>
                    </div>
                </div>

                <div class="timeline-playback-bar">
                    <div class="button-group">
                        <button class="time-btn" id="btn-step-back-month" title="Step 1 Month Backward">« -1M</button>
                        <button class="time-btn" id="btn-step-back-day" title="Step 1 Day Backward">‹ -1D</button>
                        <button class="time-btn primary" id="btn-play-pause" title="Play or Pause Observation Scrubber">▶ PLAY</button>
                        <button class="time-btn" id="btn-step-fwd-day" title="Step 1 Day Forward">+1D ›</button>
                        <button class="time-btn" id="btn-step-fwd-month" title="Step 1 Month Forward">+1M »</button>
                    </div>

                    <div class="slider-wrapper">
                        <input type="range" id="timeline-scrubber" min="0" max="100" value="50" class="time-scrubber" aria-label="Scrub observation window end date" />
                    </div>

                    <div class="date-bounds-controls">
                        <label>
                            <span>FROM:</span>
                            <input type="date" id="timeline-date-start" value="${this.currentStartDate}" min="${this.minDate}" max="${this.maxDate}" />
                        </label>
                        <label>
                            <span>TO:</span>
                            <input type="date" id="timeline-date-end" value="${this.currentEndDate}" min="${this.minDate}" max="${this.maxDate}" />
                        </label>
                        <button class="time-btn reset-btn" id="btn-remington-focus" title="Reset to August-October 2024 Remington Fire Window">2024 FIRE WINDOW</button>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
    }

    private bindEvents(): void {
        const playBtn = this.container.querySelector('#btn-play-pause');
        const backDay = this.container.querySelector('#btn-step-back-day');
        const fwdDay = this.container.querySelector('#btn-step-fwd-day');
        const backMonth = this.container.querySelector('#btn-step-back-month');
        const fwdMonth = this.container.querySelector('#btn-step-fwd-month');
        const resetBtn = this.container.querySelector('#btn-remington-focus');
        const startInput = this.container.querySelector('#timeline-date-start') as HTMLInputElement;
        const endInput = this.container.querySelector('#timeline-date-end') as HTMLInputElement;
        const synthToggle = this.container.querySelector('#toggle-synthetic-fixtures') as HTMLInputElement;
        const scrubber = this.container.querySelector('#timeline-scrubber') as HTMLInputElement;

        playBtn?.addEventListener('click', () => this.togglePlay());
        backDay?.addEventListener('click', () => this.stepDays(-1));
        fwdDay?.addEventListener('click', () => this.stepDays(1));
        backMonth?.addEventListener('click', () => this.stepDays(-30));
        fwdMonth?.addEventListener('click', () => this.stepDays(30));

        resetBtn?.addEventListener('click', () => {
            this.setDateWindow('2024-08-01', '2024-10-01');
        });

        startInput?.addEventListener('change', () => {
            if (!startInput.value) return;
            const clampedStart =
                startInput.value < this.minDate
                    ? this.minDate
                    : startInput.value > this.maxDate
                      ? this.maxDate
                      : startInput.value;
            this.currentStartDate = clampedStart;
            startInput.value = clampedStart;
            if (this.currentStartDate > this.currentEndDate) {
                this.currentEndDate = this.currentStartDate;
                if (endInput) endInput.value = this.currentEndDate;
            }
            this.triggerChange();
        });

        endInput?.addEventListener('change', () => {
            if (!endInput.value) return;
            const clampedEnd =
                endInput.value < this.minDate
                    ? this.minDate
                    : endInput.value > this.maxDate
                      ? this.maxDate
                      : endInput.value;
            this.currentEndDate = clampedEnd;
            endInput.value = clampedEnd;
            if (this.currentEndDate < this.currentStartDate) {
                this.currentStartDate = this.currentEndDate;
                if (startInput) startInput.value = this.currentStartDate;
            }
            this.triggerChange();
        });

        synthToggle?.addEventListener('change', () => {
            this.includeSynthetic = synthToggle.checked;
            this.triggerChange();
        });

        scrubber?.addEventListener('input', () => {
            // Map 0-100 to date range between 2024-08-01 and 2024-11-30
            const pct = Number(scrubber.value) / 100;
            const startTimestamp = new Date('2024-08-01T00:00:00Z').getTime();
            const endTimestamp = new Date('2024-11-30T00:00:00Z').getTime();
            const cur = new Date(startTimestamp + pct * (endTimestamp - startTimestamp));
            this.currentEndDate = cur.toISOString().slice(0, 10);
            if (this.currentEndDate < this.currentStartDate) {
                this.currentStartDate = this.currentEndDate;
                if (startInput) startInput.value = this.currentStartDate;
            }
            if (endInput) endInput.value = this.currentEndDate;
            this.triggerChange();
        });

        // Keyboard Shortcuts (Space for play/pause, ArrowLeft/ArrowRight to scrub)
        this.keyListener = (e: KeyboardEvent) => {
            const activeTag = (document.activeElement?.tagName || '').toLowerCase();
            if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select' || activeTag === 'button') {
                return;
            }
            if (e.code === 'Space') {
                e.preventDefault();
                this.togglePlay();
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                this.stepDays(e.shiftKey ? -7 : -1);
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                this.stepDays(e.shiftKey ? 7 : 1);
            }
        };
        window.addEventListener('keydown', this.keyListener);
    }

    public destroy(): void {
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
        if (this.keyListener) {
            window.removeEventListener('keydown', this.keyListener);
            this.keyListener = null;
        }
        this.isPlaying = false;
    }

    private togglePlay(): void {
        this.isPlaying = !this.isPlaying;
        const btn = this.container.querySelector('#btn-play-pause');
        if (btn) {
            btn.textContent = this.isPlaying ? '❚❚ PAUSE' : '▶ PLAY';
        }

        if (this.isPlaying) {
            if (this.currentEndDate >= '2024-11-30') {
                this.setDateWindow('2024-08-01', '2024-08-22');
            }
            this.playInterval = window.setInterval(() => {
                this.stepDays(1);
                if (this.currentEndDate >= '2024-11-30') {
                    this.togglePlay();
                }
            }, 600);
        } else if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
    }

    private stepDays(days: number): void {
        const cur = new Date(`${this.currentEndDate}T00:00:00Z`);
        cur.setUTCDate(cur.getUTCDate() + days);
        const rawEnd = cur.toISOString().slice(0, 10);
        const nextEnd =
            rawEnd < this.minDate
                ? this.minDate
                : rawEnd > this.maxDate
                  ? this.maxDate
                  : rawEnd;
        this.currentEndDate = nextEnd;
        if (this.currentEndDate < this.currentStartDate) {
            this.currentStartDate = this.currentEndDate;
            const startInput = this.container.querySelector('#timeline-date-start') as HTMLInputElement;
            if (startInput) startInput.value = this.currentStartDate;
        }
        const endInput = this.container.querySelector('#timeline-date-end') as HTMLInputElement;
        if (endInput) endInput.value = this.currentEndDate;
        this.triggerChange();
    }

    private syncScrubberFromEndDate(): void {
        const scrubber = this.container.querySelector('#timeline-scrubber') as HTMLInputElement | null;
        if (!scrubber) return;
        const startTimestamp = new Date('2024-08-01T00:00:00Z').getTime();
        const endTimestamp = new Date('2024-11-30T00:00:00Z').getTime();
        const curTimestamp = new Date(`${this.currentEndDate}T00:00:00Z`).getTime();
        const rawPct = ((curTimestamp - startTimestamp) / (endTimestamp - startTimestamp)) * 100;
        const clampedPct = Math.max(0, Math.min(100, Math.round(rawPct)));
        scrubber.value = String(clampedPct);
    }

    private triggerChange(): void {
        const display = this.container.querySelector('#current-window-display');
        if (display) {
            display.textContent = `${this.currentStartDate} → ${this.currentEndDate}`;
        }
        this.syncScrubberFromEndDate();

        if (this.onDateChange) {
            this.onDateChange({
                startDate: this.currentStartDate,
                endDate: this.currentEndDate,
                currentScrubDate: this.currentEndDate,
                includeSynthetic: this.includeSynthetic
            });
        }
    }
}
