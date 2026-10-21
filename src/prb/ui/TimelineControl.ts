/**
 * Timeline Control & Date Scrubber for PRB Evidence Explorer
 *
 * - Deterministic forward and backward step controls
 * - Dataset-driven bounds and timezone-safe calendar day/month arithmetic
 * - Synthetic test fixtures toggle with explicit visual badge
 * - Non-continuous observation framing: scrubs discrete observation/survey windows
 *   while explicitly labeled final footprints remain static context
 * - Guards against inverted date ranges (startDate > endDate)
 */

import { calendarDayDistance, shiftCalendarDate, type TimelineBounds } from '../data/dates.ts';
import { ValidationError, isValidIsoCalendarDate } from '../data/load.ts';

export type { TimelineBounds } from '../data/dates.ts';

export interface TimelineChangeEvent {
    startDate: string;
    endDate: string;
    currentScrubDate: string;
    includeSynthetic: boolean;
}

export class TimelineControl {
    private container: HTMLElement;
    private minDate: string;
    private maxDate: string;
    private currentStartDate: string;
    private currentEndDate: string;
    private focusStartDate: string;
    private focusEndDate: string;
    private perimeterLabel: string = 'No perimeter records in loaded evidence';
    private hasDatasetBounds: boolean = false;
    private isPlaying: boolean = false;
    private playInterval: number | null = null;
    private includeSynthetic: boolean = false;
    private onDateChange: ((event: TimelineChangeEvent) => void) | null = null;
    private keyListener: ((e: KeyboardEvent) => void) | null = null;

    constructor(containerId: string, bounds?: TimelineBounds) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`TimelineControl container '${containerId}' not found`);
        this.container = el;
        // A one-day placeholder until the caller supplies the loaded release bounds.
        const today = new Date().toISOString().slice(0, 10);
        this.minDate = this.maxDate = this.currentStartDate = this.currentEndDate = this.focusStartDate = this.focusEndDate = today;
        if (bounds) this.setBounds(bounds);
        this.render();
    }

    public setOnChange(callback: (event: TimelineChangeEvent) => void): void {
        this.onDateChange = callback;
    }

    public setDateWindow(start: string, end: string): void {
        if (!isValidIsoCalendarDate(start) || !isValidIsoCalendarDate(end)) {
            throw new ValidationError('Timeline window requires valid calendar dates.');
        }
        this.currentStartDate = this.clampDate(start <= end ? start : end);
        this.currentEndDate = this.clampDate(start <= end ? end : start);
        this.triggerChange();
    }

    /** Refresh after dataset/synthetic changes. Same bounds do not emit a recursive filter event. */
    public setBounds(bounds: TimelineBounds): void {
        if (!isValidIsoCalendarDate(bounds.minDate) || !isValidIsoCalendarDate(bounds.maxDate) || bounds.minDate > bounds.maxDate) {
            throw new ValidationError('Timeline bounds require a valid ordered calendar range.');
        }
        const focusStart = bounds.focusStartDate || bounds.minDate;
        const focusEnd = bounds.focusEndDate || bounds.maxDate;
        if (!isValidIsoCalendarDate(focusStart) || !isValidIsoCalendarDate(focusEnd) || focusStart > focusEnd) {
            throw new ValidationError('Timeline focus requires a valid ordered calendar range.');
        }
        const oldStart = this.currentStartDate;
        const oldEnd = this.currentEndDate;
        const boundsChanged = this.minDate !== bounds.minDate || this.maxDate !== bounds.maxDate;
        if (boundsChanged) this.stopPlayback();
        this.minDate = bounds.minDate;
        this.maxDate = bounds.maxDate;
        this.focusStartDate = this.clampDate(focusStart);
        this.focusEndDate = this.clampDate(focusEnd);
        this.perimeterLabel = bounds.perimeterLabel || 'No perimeter records in loaded evidence';
        if (!this.hasDatasetBounds) {
            this.currentStartDate = this.focusStartDate;
            this.currentEndDate = this.focusEndDate;
        } else {
            this.currentStartDate = this.clampDate(this.currentStartDate);
            this.currentEndDate = this.clampDate(this.currentEndDate);
        }
        this.hasDatasetBounds = true;
        this.syncControls();
        if (oldStart !== this.currentStartDate || oldEnd !== this.currentEndDate) this.triggerChange();
    }

    private clampDate(date: string): string {
        return date < this.minDate ? this.minDate : date > this.maxDate ? this.maxDate : date;
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
                        <span class="study-area-tag" id="timeline-perimeter-label" title="Final footprints remain retrospective context. Progression snapshots are selected only within the inclusive map-date window."></span>
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
                        <input type="range" id="timeline-scrubber" min="0" max="${calendarDayDistance(this.minDate, this.maxDate)}" step="1" value="0" class="time-scrubber" aria-label="Scrub observation window end date" />
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
                        <button class="time-btn reset-btn" id="btn-remington-focus" title="Reset to the loaded incident comparison window">FOCUS WINDOW</button>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
        this.syncControls();
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
        backMonth?.addEventListener('click', () => this.stepDate(-1, 'month'));
        fwdMonth?.addEventListener('click', () => this.stepDate(1, 'month'));

        resetBtn?.addEventListener('click', () => {
            this.setDateWindow(this.focusStartDate, this.focusEndDate);
        });

        startInput?.addEventListener('change', () => {
            if (!isValidIsoCalendarDate(startInput.value)) { this.syncControls(); return; }
            const clampedStart = this.clampDate(startInput.value);
            this.currentStartDate = clampedStart;
            startInput.value = clampedStart;
            if (this.currentStartDate > this.currentEndDate) {
                this.currentEndDate = this.currentStartDate;
                if (endInput) endInput.value = this.currentEndDate;
            }
            this.triggerChange();
        });

        endInput?.addEventListener('change', () => {
            if (!isValidIsoCalendarDate(endInput.value)) { this.syncControls(); return; }
            const clampedEnd = this.clampDate(endInput.value);
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
            const offset = Number(scrubber.value);
            if (!Number.isFinite(offset)) return;
            const day = Math.max(0, Math.min(calendarDayDistance(this.minDate, this.maxDate), Math.round(offset)));
            this.currentEndDate = shiftCalendarDate(this.minDate, day, 'day');
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
        this.stopPlayback();
        if (this.keyListener) {
            window.removeEventListener('keydown', this.keyListener);
            this.keyListener = null;
        }
    }

    private togglePlay(): void {
        if (this.isPlaying) {
            this.stopPlayback();
            return;
        }
        if (this.minDate === this.maxDate) return;
        if (this.currentEndDate >= this.maxDate) {
            this.setDateWindow(this.focusStartDate, this.focusStartDate);
        }
        if (this.currentEndDate >= this.maxDate) return;
        this.isPlaying = true;
        const btn = this.container.querySelector('#btn-play-pause');
        if (btn) btn.textContent = '❚❚ PAUSE';
        this.playInterval = window.setInterval(() => {
            this.stepDays(1);
            if (this.currentEndDate >= this.maxDate) this.stopPlayback();
        }, 600);
    }

    private stopPlayback(): void {
        if (this.playInterval !== null) {
            window.clearInterval(this.playInterval);
            this.playInterval = null;
        }
        this.isPlaying = false;
        const btn = this.container.querySelector('#btn-play-pause');
        if (btn) btn.textContent = '▶ PLAY';
    }

    private stepDays(days: number): void {
        this.stepDate(days, 'day');
    }

    private stepDate(amount: number, unit: 'day' | 'month'): void {
        this.currentEndDate = this.clampDate(shiftCalendarDate(this.currentEndDate, amount, unit));
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
        scrubber.max = String(calendarDayDistance(this.minDate, this.maxDate));
        scrubber.value = String(calendarDayDistance(this.minDate, this.currentEndDate));
        scrubber.setAttribute('aria-valuetext', this.currentEndDate);
    }

    private syncControls(): void {
        const display = this.container.querySelector('#current-window-display');
        if (display) {
            display.textContent = `${this.currentStartDate} → ${this.currentEndDate}`;
        }
        for (const [id, value] of [['timeline-date-start', this.currentStartDate], ['timeline-date-end', this.currentEndDate]]) {
            const input = this.container.querySelector(`#${id}`) as HTMLInputElement | null;
            if (input) { input.value = value; input.min = this.minDate; input.max = this.maxDate; }
        }
        const label = this.container.querySelector('#timeline-perimeter-label');
        if (label) label.textContent = this.perimeterLabel;
        const focus = this.container.querySelector('#btn-remington-focus');
        focus?.setAttribute('title', `Reset to ${this.focusStartDate} through ${this.focusEndDate}`);
        this.syncScrubberFromEndDate();
    }

    private triggerChange(): void {
        this.syncControls();

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
