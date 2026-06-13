import { describe, it, expect } from 'vitest';
import {
  esc,
  fmtTime, fmtCountdown, fmtDelta,
  ageInRange, ageGroupOverlaps,
  checkQual, upcomingGroups, prevGroups,
  STROKE, ORDINAL, STANDARD_AGE_GROUPS,
} from '../utils.js';

describe('esc', () => {
  it('passes through clean strings', () => expect(esc('Alice')).toBe('Alice'));
  it('escapes angle brackets', () => expect(esc('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;'));
  it('escapes ampersands', () => expect(esc('A & B')).toBe('A &amp; B'));
  it('escapes quotes', () => expect(esc('"hi"')).toBe('&quot;hi&quot;'));
  it('handles null/undefined', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

// ── fmtTime ───────────────────────────────────────────────────────────────────

describe('fmtTime', () => {
  it('returns dash for null', () => expect(fmtTime(null)).toBe('—'));
  it('returns dash for undefined', () => expect(fmtTime(undefined)).toBe('—'));
  it('returns dash for negative', () => expect(fmtTime(-1)).toBe('—'));
  it('formats sub-minute', () => expect(fmtTime(3709)).toBe('37.09'));
  it('formats zero cents', () => expect(fmtTime(3700)).toBe('37.00'));
  it('formats exactly one minute', () => expect(fmtTime(6000)).toBe('1:00.00'));
  it('formats over one minute', () => expect(fmtTime(7510)).toBe('1:15.10'));
  it('pads seconds under 10 in minute format', () => expect(fmtTime(6146)).toBe('1:01.46'));
  it('formats six minutes', () => expect(fmtTime(36000)).toBe('6:00.00'));
  it('formats zero', () => expect(fmtTime(0)).toBe('0.00'));
  it('pads cents under 10', () => expect(fmtTime(905)).toBe('9.05'));
});

// ── fmtCountdown ──────────────────────────────────────────────────────────────

describe('fmtCountdown', () => {
  it('zero or negative returns 0:00', () => {
    expect(fmtCountdown(0)).toBe('0:00');
    expect(fmtCountdown(-5)).toBe('0:00');
  });
  it('under a minute', () => expect(fmtCountdown(45)).toBe('0:45'));
  it('exactly one minute', () => expect(fmtCountdown(60)).toBe('1:00'));
  it('pads seconds', () => expect(fmtCountdown(125)).toBe('2:05'));
  it('large value', () => expect(fmtCountdown(3661)).toBe('61:01'));
});

// ── fmtDelta ──────────────────────────────────────────────────────────────────

describe('fmtDelta', () => {
  it('null offTime returns null', () => expect(fmtDelta(null, 3500)).toBeNull());
  it('null seedTime returns null', () => expect(fmtDelta(3400, null)).toBeNull());
  it('faster result', () => {
    const d = fmtDelta(3400, 3500);
    expect(d.faster).toBe(true);
    expect(d.str).toBe('−1.00');
  });
  it('slower result', () => {
    const d = fmtDelta(3600, 3500);
    expect(d.faster).toBe(false);
    expect(d.str).toBe('+1.00');
  });
  it('no change', () => {
    const d = fmtDelta(3500, 3500);
    expect(d.faster).toBe(false);
    expect(d.str).toBe('+0.00');
  });
});

// ── ageInRange ────────────────────────────────────────────────────────────────

describe('ageInRange', () => {
  it('null age is false', () => expect(ageInRange(null, '9-10')).toBe(false));
  it('in range', () => {
    expect(ageInRange(9, '9-10')).toBe(true);
    expect(ageInRange(10, '9-10')).toBe(true);
  });
  it('below range', () => expect(ageInRange(8, '9-10')).toBe(false));
  it('above range', () => expect(ageInRange(11, '9-10')).toBe(false));
  it('8-under: within', () => expect(ageInRange(6, '8-under')).toBe(true));
  it('8-under: at cap', () => expect(ageInRange(8, '8-under')).toBe(true));
  it('8-under: over cap', () => expect(ageInRange(9, '8-under')).toBe(false));
  it('18-over: at floor', () => expect(ageInRange(18, '18-over')).toBe(true));
  it('18-over: below floor', () => expect(ageInRange(17, '18-over')).toBe(false));
  it('ignores spaces', () => expect(ageInRange(10, '9 - 10')).toBe(true));
  it('array: matches any group', () => {
    expect(ageInRange(10, ['9-10', '11-12'])).toBe(true);
    expect(ageInRange(12, ['9-10', '11-12'])).toBe(true);
    expect(ageInRange(13, ['9-10', '11-12'])).toBe(false);
  });
  it('array: empty array is false', () => expect(ageInRange(10, [])).toBe(false));
});

// ── ageGroupOverlaps ──────────────────────────────────────────────────────────

describe('ageGroupOverlaps', () => {
  it('null minAge/maxAge always overlaps', () => {
    expect(ageGroupOverlaps(null, null, '9-10')).toBe(true);
    expect(ageGroupOverlaps(null, 10, '9-10')).toBe(true);
  });
  it('exact match', () => expect(ageGroupOverlaps(9, 10, '9-10')).toBe(true));
  it('partial overlap low', () => expect(ageGroupOverlaps(8, 9, '9-10')).toBe(true));
  it('partial overlap high', () => expect(ageGroupOverlaps(10, 11, '9-10')).toBe(true));
  it('no overlap below', () => expect(ageGroupOverlaps(7, 8, '9-10')).toBe(false));
  it('no overlap above', () => expect(ageGroupOverlaps(11, 12, '9-10')).toBe(false));
  it('under format', () => {
    expect(ageGroupOverlaps(5, 6, '8-under')).toBe(true);
    expect(ageGroupOverlaps(9, 10, '8-under')).toBe(false);
  });
  it('over format', () => {
    expect(ageGroupOverlaps(18, 20, '18-over')).toBe(true);
    expect(ageGroupOverlaps(10, 12, '18-over')).toBe(false);
  });
  it('array: overlaps any group', () => {
    expect(ageGroupOverlaps(9, 10, ['9-10', '11-12'])).toBe(true);
    expect(ageGroupOverlaps(11, 12, ['9-10', '11-12'])).toBe(true);
    expect(ageGroupOverlaps(13, 14, ['9-10', '11-12'])).toBe(false);
  });
});

// ── checkQual ─────────────────────────────────────────────────────────────────

const INV_QUALS = [
  { label: 'INV', gender: 'F', ageMin: 9, ageMax: 10, distance: 50, strokeCode: 1, cutTime: 3500 },
];

describe('checkQual', () => {
  it('qualifies', () => expect(checkQual(3400, 'F', 10, 50, 1, INV_QUALS)).toEqual(['INV']));
  it('exactly at cut', () => expect(checkQual(3500, 'F', 10, 50, 1, INV_QUALS)).toEqual(['INV']));
  it('slower than cut', () => expect(checkQual(3600, 'F', 10, 50, 1, INV_QUALS)).toEqual([]));
  it('wrong gender', () => expect(checkQual(3400, 'M', 10, 50, 1, INV_QUALS)).toEqual([]));
  it('age too high', () => expect(checkQual(3400, 'F', 11, 50, 1, INV_QUALS)).toEqual([]));
  it('wrong distance', () => expect(checkQual(3400, 'F', 10, 100, 1, INV_QUALS)).toEqual([]));
  it('wrong stroke', () => expect(checkQual(3400, 'F', 10, 50, 2, INV_QUALS)).toEqual([]));
  it('no time (null)', () => expect(checkQual(null, 'F', 10, 50, 1, INV_QUALS)).toEqual([]));
  it('no time (undefined)', () => expect(checkQual(undefined, 'F', 10, 50, 1, INV_QUALS)).toEqual([]));
  it('zero is a valid time and qualifies if <= cut', () => expect(checkQual(0, 'F', 10, 50, 1, INV_QUALS)).toEqual(['INV']));
  it('empty quals', () => expect(checkQual(3400, 'F', 10, 50, 1, [])).toEqual([]));
});

// ── upcomingGroups ────────────────────────────────────────────────────────────

function mkSwimmer(name, events) {
  return { name, age: 10, gender: 'F', events };
}
function mkEvent(overrides) {
  return {
    eventId: 'e1', name: '50 Free', number: '1',
    schedIdx: 1000, etaEpoch: null, etaDisplay: '—',
    heatNum: 1, laneNum: 3, seedTime: 3500, status: 'upcoming',
    ...overrides,
  };
}

describe('upcomingGroups', () => {
  it('empty swimmers returns empty', () => expect(upcomingGroups([])).toEqual([]));

  it('filters out done events', () => {
    const swimmers = [mkSwimmer('Alice', [mkEvent({ status: 'done' })])];
    expect(upcomingGroups(swimmers)).toHaveLength(0);
  });

  it('groups swimmers by eventId', () => {
    const swimmers = [
      mkSwimmer('Alice', [mkEvent({ heatNum: 1, laneNum: 2 })]),
      mkSwimmer('Bob',   [mkEvent({ heatNum: 1, laneNum: 4 })]),
    ];
    const groups = upcomingGroups(swimmers);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(2);
  });

  it('sorts entries by heat then lane', () => {
    const swimmers = [
      mkSwimmer('Alice', [mkEvent({ heatNum: 2, laneNum: 1 })]),
      mkSwimmer('Bob',   [mkEvent({ heatNum: 1, laneNum: 5 })]),
      mkSwimmer('Carol', [mkEvent({ heatNum: 1, laneNum: 2 })]),
    ];
    const entries = upcomingGroups(swimmers)[0].entries;
    expect(entries.map(e => e.name)).toEqual(['Carol', 'Bob', 'Alice']);
  });

  it('tracks earliest etaEpoch across heats', () => {
    const swimmers = [
      mkSwimmer('Alice', [mkEvent({ etaEpoch: 2000, etaDisplay: '9:00 AM' })]),
      mkSwimmer('Bob',   [mkEvent({ etaEpoch: 1000, etaDisplay: '8:45 AM' })]),
    ];
    const g = upcomingGroups(swimmers)[0];
    expect(g.etaEpoch).toBe(1000);
    expect(g.etaDisplay).toBe('8:45 AM');
  });

  it('sorts groups by etaEpoch ascending', () => {
    const swimmers = [
      mkSwimmer('Alice', [
        mkEvent({ eventId: 'e2', schedIdx: 2000, etaEpoch: 2000 }),
        mkEvent({ eventId: 'e1', schedIdx: 1000, etaEpoch: 1000 }),
      ]),
    ];
    const groups = upcomingGroups(swimmers);
    expect(groups[0].eventId).toBe('e1');
    expect(groups[1].eventId).toBe('e2');
  });
});

// ── prevGroups ────────────────────────────────────────────────────────────────

function mkDoneEvent(overrides) {
  return {
    eventId: 'e1', name: '50 Free', number: '1',
    schedIdx: 1000, heatNum: 1, laneNum: 3,
    offTime: 3421, seedTime: 3500,
    place: 2, isDq: false, isInvalid: false, qualifying: [], status: 'done',
    isRelay: false, relayTeam: null, legPosition: null, legStroke: null,
    heatPlace: 1, distance: 50, strokeCode: 1,
    ...overrides,
  };
}

describe('prevGroups', () => {
  it('empty swimmers returns empty', () => expect(prevGroups([])).toEqual([]));

  it('filters out non-done events', () => {
    const swimmers = [mkSwimmer('Alice', [mkDoneEvent({ status: 'upcoming' })])];
    expect(prevGroups(swimmers)).toHaveLength(0);
  });

  it('groups by eventId', () => {
    const swimmers = [
      mkSwimmer('Alice', [mkDoneEvent({ place: 1 })]),
      mkSwimmer('Bob',   [mkDoneEvent({ place: 2 })]),
    ];
    const groups = prevGroups(swimmers);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(2);
  });

  it('sorts entries by place', () => {
    const swimmers = [
      mkSwimmer('Carol', [mkDoneEvent({ place: 3 })]),
      mkSwimmer('Alice', [mkDoneEvent({ place: 1 })]),
      mkSwimmer('Bob',   [mkDoneEvent({ place: 2 })]),
    ];
    const entries = prevGroups(swimmers)[0].entries;
    expect(entries.map(e => e.place)).toEqual([1, 2, 3]);
  });

  it('sorts groups by schedIdx descending (most recent first)', () => {
    const swimmers = [
      mkSwimmer('Alice', [
        mkDoneEvent({ eventId: 'e1', schedIdx: 1000 }),
        mkDoneEvent({ eventId: 'e2', schedIdx: 2000 }),
      ]),
    ];
    const groups = prevGroups(swimmers);
    expect(groups[0].eventId).toBe('e2');
    expect(groups[1].eventId).toBe('e1');
  });

  it('group carries distance and strokeCode from events', () => {
    const swimmers = [mkSwimmer('Alice', [mkDoneEvent({ distance: 25, strokeCode: 4 })])];
    const g = prevGroups(swimmers)[0];
    expect(g.distance).toBe(25);
    expect(g.strokeCode).toBe(4);
  });

  it('entry isScratched true when offTime null and not DQ or invalid', () => {
    const swimmers = [mkSwimmer('Alice', [mkDoneEvent({ offTime: null, isDq: false, isInvalid: false })])];
    expect(prevGroups(swimmers)[0].entries[0].isScratched).toBe(true);
  });

  it('entry isScratched false when isDq', () => {
    const swimmers = [mkSwimmer('Alice', [mkDoneEvent({ offTime: null, isDq: true })])];
    expect(prevGroups(swimmers)[0].entries[0].isScratched).toBe(false);
  });

  it('entry isScratched false when isInvalid', () => {
    const swimmers = [mkSwimmer('Alice', [mkDoneEvent({ offTime: null, isInvalid: true })])];
    expect(prevGroups(swimmers)[0].entries[0].isScratched).toBe(false);
  });

  it('null place sorts to end', () => {
    const swimmers = [
      mkSwimmer('Alice', [mkDoneEvent({ place: null })]),
      mkSwimmer('Bob',   [mkDoneEvent({ place: 1 })]),
    ];
    const entries = prevGroups(swimmers)[0].entries;
    expect(entries[0].place).toBe(1);
    expect(entries[1].place).toBeNull();
  });
});

// ── constants ─────────────────────────────────────────────────────────────────

describe('STROKE', () => {
  it('maps all five codes', () => {
    expect(STROKE[1]).toBe('Free');
    expect(STROKE[2]).toBe('Back');
    expect(STROKE[3]).toBe('Breast');
    expect(STROKE[4]).toBe('Fly');
    expect(STROKE[5]).toBe('IM');
  });
});

describe('STANDARD_AGE_GROUPS', () => {
  it('has six groups', () => expect(STANDARD_AGE_GROUPS).toHaveLength(6));
  it('first group is 0-6', () => {
    expect(STANDARD_AGE_GROUPS[0]).toEqual({ minAge: 0, maxAge: 6 });
  });
  it('includes 9-10 group', () => {
    expect(STANDARD_AGE_GROUPS).toContainEqual({ minAge: 9, maxAge: 10 });
  });
});
