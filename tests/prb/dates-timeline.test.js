import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as dates from '../../src/prb/data/dates.ts';
import { TimelineControl } from '../../src/prb/ui/TimelineControl.ts';
import { ValidationError } from '../../src/prb/data/load.ts';

// Node has no browser DOM. This small event surface runs the production control's
// handlers; assertions cover its emitted dates, controls, and timer lifecycle.
class Element {
    value = ''; textContent = ''; checked = false; min = ''; max = ''; step = '';
    listeners = new Map();
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    setAttribute(name, value) { this[name] = value; }
    fire(type) { this.listeners.get(type)?.({}); }
}
function withTimeline(bounds, run) {
    const savedDocument = globalThis.document;
    const savedWindow = globalThis.window;
    const elements = new Map();
    const intervals = new Map();
    const container = {
        html: '',
        set innerHTML(html) {
            this.html = html;
            for (const match of html.matchAll(/<\w+\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
                const element = new Element();
                for (const attr of ['value', 'min', 'max', 'step']) element[attr] = new RegExp(`${attr}="([^"]*)"`).exec(match[1])?.[1] || '';
                elements.set(match[2], element);
            }
        },
        querySelector(selector) { return elements.get(selector.slice(1)) || null; }
    };
    globalThis.document = { getElementById: () => container, activeElement: null };
    let sequence = 0;
    globalThis.window = { addEventListener() {}, removeEventListener() {},
        setInterval(callback) { intervals.set(++sequence, callback); return sequence; },
        clearInterval(id) { intervals.delete(id); } };
    let timeline;
    try {
        timeline = new TimelineControl('timeline', bounds);
        let last;
        timeline.setOnChange(event => { last = event; });
        run({ timeline, elements, intervals, container, last: () => last,
            click: id => elements.get(id).fire('click'), tick: () => [...intervals.values()].forEach(callback => callback()) });
    } finally {
        timeline?.destroy();
        globalThis.document = savedDocument;
        globalThis.window = savedWindow;
    }
}

describe('Dataset-driven date bounds and timeline controls', () => {
    it('derives actual event/observation/survey bounds, excludes synthetic sources, and expands coarse dates', () => {
        const data = {
            manifest: { datasets: [{ id: 'real', isSynthetic: false }, { id: 'synthetic', isSynthetic: true }] }, sites: [],
            wildfirePerimeters: [{ sourceId: 'real', isSynthetic: false, discoveryDate: '2026-08-22', containmentDate: '2026-09-01',
                controlDate: '2026-10-05', mapDate: '2027-01-15', temporalRole: 'retrospective_final_footprint' }],
            observations: [{ sourceId: 'real', isSynthetic: false, observationDate: '2025-01-01', datePrecision: 'year' },
                { sourceId: 'synthetic', isSynthetic: false, observationDate: '1975-01-01', datePrecision: 'year' }],
            surveys: [{ sourceId: 'real', isSynthetic: false, surveyDate: '2028-05-09' }]
        };
        const bounds = dates.deriveTimelineBounds(data);
        assert.equal(bounds.minDate, '2025-01-01');
        assert.equal(bounds.maxDate, '2028-05-09');
        assert.equal(bounds.focusStartDate, '2026-08-22');
        assert.equal(bounds.focusEndDate, '2026-10-05');
        assert.match(bounds.perimeterLabel, /static final footprint.*2027-01-15/i);
        assert.equal(dates.deriveTimelineBounds(data, true).minDate, '1975-01-01');
        assert.equal(dates.deriveTimelineBounds({ ...data, wildfirePerimeters: [], observations: [], surveys: [] }), null);
        assert.equal(dates.deriveTimelineBounds({ ...data, wildfirePerimeters: [], surveys: [],
            observations: [{ sourceId: 'real', isSynthetic: false, observationDate: '2024-02-01', datePrecision: 'month' }] }).maxDate,
            '2024-02-29');
    });

    it('uses calendar-month arithmetic including leap years and clamps every public date update to loaded bounds', () => {
        withTimeline({ minDate: '2027-01-01', maxDate: '2028-12-31', focusStartDate: '2028-01-01', focusEndDate: '2028-01-31' },
            ({ timeline, elements, click, last }) => {
                click('btn-step-fwd-month');
                assert.equal(last().endDate, '2028-02-29');
                click('btn-step-back-month');
                assert.equal(last().endDate, '2028-01-29');
                timeline.setDateWindow('2030-02-01', '2020-01-01');
                assert.equal(last().startDate, '2027-01-01');
                assert.equal(last().endDate, '2028-12-31');
                assert.equal(elements.get('timeline-date-start').min, '2027-01-01');
                assert.equal(elements.get('timeline-date-end').max, '2028-12-31');
                assert.throws(() => timeline.setDateWindow('2028-02-30', '2028-03-01'), ValidationError);
            });
    });

    it('scrubs exactly over loaded days and uses those same bounds for playback and reset', () => {
        withTimeline({ minDate: '2027-01-01', maxDate: '2027-01-05', focusStartDate: '2027-01-02', focusEndDate: '2027-01-04',
            perimeterLabel: '2 progression snapshots' }, ({ timeline, elements, click, tick, intervals, last }) => {
            const scrubber = elements.get('timeline-scrubber');
            scrubber.value = scrubber.max;
            scrubber.fire('input');
            assert.equal(last().endDate, '2027-01-05');
            click('btn-play-pause');
            assert.equal(last().startDate, '2027-01-02');
            assert.equal(last().endDate, '2027-01-02');
            tick(); tick(); tick();
            assert.equal(last().endDate, '2027-01-05');
            assert.equal(intervals.size, 0);
            assert.equal(elements.get('btn-play-pause').textContent, '▶ PLAY');
            scrubber.value = '0';
            scrubber.fire('input');
            assert.equal(last().startDate, '2027-01-01');
            assert.equal(last().endDate, '2027-01-01');
            click('btn-remington-focus');
            assert.equal(last().startDate, '2027-01-02');
            assert.equal(last().endDate, '2027-01-04');
            assert.equal(elements.get('timeline-perimeter-label').textContent, '2 progression snapshots');
            timeline.setDateWindow('2027-01-03', '2027-01-03');
            assert.equal(scrubber.value, '2');
        });
    });

    it('refreshes bounds without creating an inverted window and safely handles a one-day release', () => {
        withTimeline({ minDate: '2026-01-01', maxDate: '2026-12-31' }, ({ timeline, elements, click, last }) => {
            timeline.setBounds({ minDate: '2029-07-04', maxDate: '2029-07-04' });
            assert.equal(last().startDate, '2029-07-04');
            assert.equal(last().endDate, '2029-07-04');
            click('btn-step-fwd-day');
            click('btn-step-back-month');
            click('btn-play-pause');
            assert.equal(last().currentScrubDate, '2029-07-04');
            assert.equal(elements.get('timeline-scrubber').value, '0');
            assert.throws(() => timeline.setBounds({ minDate: '2029-07-05', maxDate: '2029-07-04' }), ValidationError);
        });
    });
});
