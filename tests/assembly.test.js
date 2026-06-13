import { describe, it, expect } from 'vitest';
import { assembleQuals, assembleSwimmers } from '../assembly.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeHeat(id, eventId, entryIds, overrides = {}) {
  return {
    id,
    attributes: {
      status: 'upcoming', number: 1, scheduleIndex: 0,
      adjustedEstimatedStartAt: null,
      ...overrides,
    },
    relationships: {
      nirvanaEvent:   { data: { id: eventId } },
      nirvanaEntries: { data: entryIds.map(eid => ({ id: eid })) },
    },
  };
}

function makeEntry(id, athleteId, overrides = {}) {
  return {
    id,
    attributes: { laneNumber: 1, seedTimeInt: null, ...overrides },
    relationships: {
      nirvanaAthlete: athleteId ? { data: { id: athleteId } } : null,
      nirvanaResult:  null,
      nirvanaTeam:    null,
    },
  };
}

function makeRelayEntry(id, teamId, overrides = {}) {
  return {
    id,
    attributes: { laneNumber: 3, relayTeam: 'A', seedTimeInt: null, ...overrides },
    relationships: {
      nirvanaAthlete: null,
      nirvanaResult:  null,
      nirvanaTeam:    { data: { id: teamId } },
    },
  };
}

function withResult(entry, resultId) {
  return { ...entry, relationships: { ...entry.relationships, nirvanaResult: { data: { id: resultId } } } };
}

function makeResult(id, overrides = {}) {
  return {
    id,
    attributes: { officialTimeInt: null, overallPlace: null, heatPlace: null, isDq: false, invalidCode: null, ...overrides },
  };
}

function makeAthlete(id, overrides = {}) {
  return {
    firstName: 'Jane', lastName: 'Smith',
    competitionAge: 10, gender: 'F', _teamId: 'team1',
    ...overrides,
  };
}

function makeEvent(id, overrides = {}) {
  return {
    id,
    attributes: {
      eventNumber: 1, distance: 50, strokeCode: 1,
      minAge: 9, maxAge: 10, gender: 'F', eventType: 'individual',
      ...overrides,
    },
  };
}

const NO_QUALS = [];
const NO_RESULTS = [];
const NO_RELAY_LEGS = {};

function run(heats, entries, results, athletes, events, {
  relayLegMap = NO_RELAY_LEGS, stdIncluded = NO_QUALS,
  targetTeamId = null, ageGroups = '9-10', gender = null,
} = {}) {
  const entryMap  = Object.fromEntries(entries.map(e => [e.id, e]));
  const resultMap = Object.fromEntries(results.map(r => [r.id, r]));
  const athleteMap = Object.fromEntries(Object.entries(athletes));
  return assembleSwimmers(
    heats, entryMap, resultMap, relayLegMap,
    athleteMap, events, stdIncluded,
    targetTeamId, ageGroups, gender,
  );
}

// ── assembleQuals ─────────────────────────────────────────────────────────────

describe('assembleQuals', () => {
  it('returns empty array for empty input', () => {
    expect(assembleQuals([])).toEqual([]);
  });

  it('extracts a qualifying cut with label from timeStandard', () => {
    const included = [
      { type: 'timeStandard',      id: 'std1', attributes: { label: 'INV' }, relationships: {} },
      { type: 'timeStandardEvent', id: 'tse1', attributes: { distance: 50, strokeCode: 1, athleteGender: 'F', athleteMinAge: 9, athleteMaxAge: 10 }, relationships: {} },
      { type: 'timeStandardCut',   id: 'cut1', attributes: { timeInt: 3500 },
        relationships: { timeStandardEvent: { data: { id: 'tse1' } } } },
    ];
    const quals = assembleQuals(included);
    expect(quals).toHaveLength(1);
    expect(quals[0]).toMatchObject({ label: 'INV', cutTime: 3500, distance: 50, strokeCode: 1, gender: 'F', ageMin: 9, ageMax: 10 });
  });

  it('falls back to INV label when no timeStandard object present', () => {
    const included = [
      { type: 'timeStandardEvent', id: 'tse1', attributes: { distance: 50, strokeCode: 1, athleteGender: 'F', athleteMinAge: null, athleteMaxAge: null }, relationships: {} },
      { type: 'timeStandardCut',   id: 'cut1', attributes: { timeInt: 3500 },
        relationships: { timeStandardEvent: { data: { id: 'tse1' } } } },
    ];
    expect(assembleQuals(included)[0].label).toBe('INV');
  });

  it('uses each cut\'s own standard label when multiple standards are present', () => {
    const included = [
      { type: 'timeStandard',      id: 'std1', attributes: { label: 'INV' },  relationships: {} },
      { type: 'timeStandard',      id: 'std2', attributes: { label: 'NCSA' }, relationships: {} },
      { type: 'timeStandardEvent', id: 'tse1', attributes: { distance: 50, strokeCode: 1, athleteGender: 'F', athleteMinAge: 9, athleteMaxAge: 10 }, relationships: {} },
      { type: 'timeStandardEvent', id: 'tse2', attributes: { distance: 50, strokeCode: 1, athleteGender: 'F', athleteMinAge: 9, athleteMaxAge: 10 }, relationships: {} },
      { type: 'timeStandardCut',   id: 'cut1', attributes: { timeInt: 3500 },
        relationships: { timeStandardEvent: { data: { id: 'tse1' } }, timeStandard: { data: { id: 'std1' } } } },
      { type: 'timeStandardCut',   id: 'cut2', attributes: { timeInt: 3200 },
        relationships: { timeStandardEvent: { data: { id: 'tse2' } }, timeStandard: { data: { id: 'std2' } } } },
    ];
    const quals = assembleQuals(included);
    expect(quals).toHaveLength(2);
    const labels = quals.map(q => q.label).sort();
    expect(labels).toEqual(['INV', 'NCSA']);
  });

  it('skips cuts whose timeStandardEvent is missing', () => {
    const included = [
      { type: 'timeStandardCut', id: 'cut1', attributes: { timeInt: 3500 },
        relationships: { timeStandardEvent: { data: { id: 'no-such-tse' } } } },
    ];
    expect(assembleQuals(included)).toHaveLength(0);
  });

  it('skips timeStandardEvents without distance or strokeCode', () => {
    const included = [
      { type: 'timeStandardEvent', id: 'tse1', attributes: { distance: null, strokeCode: null, athleteGender: 'F', athleteMinAge: null, athleteMaxAge: null }, relationships: {} },
      { type: 'timeStandardCut',   id: 'cut1', attributes: { timeInt: 3500 },
        relationships: { timeStandardEvent: { data: { id: 'tse1' } } } },
    ];
    expect(assembleQuals(included)).toHaveLength(0);
  });

  it('handles multiple cuts', () => {
    const included = [
      { type: 'timeStandard',      id: 'std1', attributes: { label: 'INV' }, relationships: {} },
      { type: 'timeStandardEvent', id: 'tse1', attributes: { distance: 50,  strokeCode: 1, athleteGender: 'F', athleteMinAge: 9, athleteMaxAge: 10 }, relationships: {} },
      { type: 'timeStandardEvent', id: 'tse2', attributes: { distance: 100, strokeCode: 2, athleteGender: 'M', athleteMinAge: 11, athleteMaxAge: 12 }, relationships: {} },
      { type: 'timeStandardCut',   id: 'cut1', attributes: { timeInt: 3500 }, relationships: { timeStandardEvent: { data: { id: 'tse1' } } } },
      { type: 'timeStandardCut',   id: 'cut2', attributes: { timeInt: 7000 }, relationships: { timeStandardEvent: { data: { id: 'tse2' } } } },
    ];
    expect(assembleQuals(included)).toHaveLength(2);
  });
});

// ── assembleSwimmers — basic individual entry ─────────────────────────────────

describe('assembleSwimmers — individual entry', () => {
  it('returns an empty array when there are no heats', () => {
    const { assembled } = run([], [], [], {}, []);
    expect(assembled).toEqual([]);
  });

  it('assembles a swimmer from a basic upcoming entry', () => {
    const heats    = [makeHeat('h1', 'ev1', ['en1'])];
    const entries  = [makeEntry('en1', 'ath1', { laneNumber: 4, seedTimeInt: 3800 })];
    const athletes = { ath1: makeAthlete('ath1', { firstName: 'Alice', lastName: 'Jones', competitionAge: 10, gender: 'F', _teamId: 'team1' }) };
    const events   = [makeEvent('ev1', { eventNumber: 5, distance: 50, strokeCode: 1 })];

    const { assembled } = run(heats, entries, NO_RESULTS, athletes, events);
    expect(assembled).toHaveLength(1);
    const sw = assembled[0];
    expect(sw.name).toBe('Alice Jones');
    expect(sw.lastName).toBe('Jones');
    expect(sw.age).toBe(10);
    expect(sw.events).toHaveLength(1);
    const ev = sw.events[0];
    expect(ev.laneNum).toBe(4);
    expect(ev.seedTime).toBe(3800);
    expect(ev.status).toBe('upcoming');
    expect(ev.isRelay).toBe(false);
    expect(ev.number).toBe(5);
  });

  it('prefers preferredFirstName over firstName', () => {
    const heats    = [makeHeat('h1', 'ev1', ['en1'])];
    const entries  = [makeEntry('en1', 'ath1')];
    const athletes = { ath1: makeAthlete('ath1', { firstName: 'Alexandra', preferredFirstName: 'Alex', lastName: 'Brown' }) };
    const events   = [makeEvent('ev1')];

    const { assembled } = run(heats, entries, NO_RESULTS, athletes, events);
    expect(assembled[0].name).toBe('Alex Brown');
  });

  it('uses firstName when preferredFirstName is absent', () => {
    const heats    = [makeHeat('h1', 'ev1', ['en1'])];
    const entries  = [makeEntry('en1', 'ath1')];
    const athletes = { ath1: makeAthlete('ath1', { firstName: 'Beth', preferredFirstName: undefined, lastName: 'Lee' }) };
    const events   = [makeEvent('ev1')];

    const { assembled } = run(heats, entries, NO_RESULTS, athletes, events);
    expect(assembled[0].name).toBe('Beth Lee');
  });

  it('sets status to inProgress for an in-progress heat', () => {
    const heats   = [makeHeat('h1', 'ev1', ['en1'], { status: 'inProgress' })];
    const entries = [makeEntry('en1', 'ath1')];
    const { assembled } = run(heats, entries, NO_RESULTS, { ath1: makeAthlete() }, [makeEvent('ev1')]);
    expect(assembled[0].events[0].status).toBe('inProgress');
  });

  it('sets status to done when heat is done and offTime is present', () => {
    const heats   = [makeHeat('h1', 'ev1', ['en1'], { status: 'done' })];
    const entries = [withResult(makeEntry('en1', 'ath1'), 'r1')];
    const results = [makeResult('r1', { officialTimeInt: 3500, overallPlace: 2, heatPlace: 1 })];
    const { assembled } = run(heats, entries, results, { ath1: makeAthlete() }, [makeEvent('ev1')]);
    const ev = assembled[0].events[0];
    expect(ev.status).toBe('done');
    expect(ev.offTime).toBe(3500);
    expect(ev.place).toBe(2);
    expect(ev.heatPlace).toBe(1);
  });

  it('marks a swimmer as scratched when heat is done but no offTime and not DQ', () => {
    const heats   = [makeHeat('h1', 'ev1', ['en1'], { status: 'done' })];
    const entries = [withResult(makeEntry('en1', 'ath1'), 'r1')];
    const results = [makeResult('r1', { officialTimeInt: null, isDq: false, invalidCode: null })];
    const { assembled } = run(heats, entries, results, { ath1: makeAthlete() }, [makeEvent('ev1')]);
    expect(assembled[0].events[0].isScratched).toBe(true);
  });

  it('does not mark as scratched when isDq is true', () => {
    const heats   = [makeHeat('h1', 'ev1', ['en1'], { status: 'done' })];
    const entries = [withResult(makeEntry('en1', 'ath1'), 'r1')];
    const results = [makeResult('r1', { officialTimeInt: null, isDq: true })];
    const { assembled } = run(heats, entries, results, { ath1: makeAthlete() }, [makeEvent('ev1')]);
    const ev = assembled[0].events[0];
    expect(ev.isDq).toBe(true);
    expect(ev.isScratched).toBe(false);
  });

  it('marks isInvalid when invalidCode is non-null', () => {
    const heats   = [makeHeat('h1', 'ev1', ['en1'], { status: 'inProgress' })];
    const entries = [withResult(makeEntry('en1', 'ath1'), 'r1')];
    // offTime present but invalidCode set — should NOT count as done
    const results = [makeResult('r1', { officialTimeInt: 3400, invalidCode: 'EX' })];
    const { assembled } = run(heats, entries, results, { ath1: makeAthlete() }, [makeEvent('ev1')]);
    const ev = assembled[0].events[0];
    expect(ev.isInvalid).toBe(true);
    expect(ev.status).toBe('inProgress');
  });

  it('sets status done when offTime present even if heat status is not done', () => {
    const heats   = [makeHeat('h1', 'ev1', ['en1'], { status: 'inProgress' })];
    const entries = [withResult(makeEntry('en1', 'ath1'), 'r1')];
    const results = [makeResult('r1', { officialTimeInt: 3500, invalidCode: null })];
    const { assembled } = run(heats, entries, results, { ath1: makeAthlete() }, [makeEvent('ev1')]);
    expect(assembled[0].events[0].status).toBe('done');
  });

  it('attaches qualifying labels when the time beats the cut', () => {
    const stdIncluded = [
      { type: 'timeStandard',      id: 'std1', attributes: { label: 'INV' }, relationships: {} },
      { type: 'timeStandardEvent', id: 'tse1', attributes: { distance: 50, strokeCode: 1, athleteGender: 'F', athleteMinAge: 9, athleteMaxAge: 10 }, relationships: {} },
      { type: 'timeStandardCut',   id: 'cut1', attributes: { timeInt: 3500 }, relationships: { timeStandardEvent: { data: { id: 'tse1' } } } },
    ];
    const heats   = [makeHeat('h1', 'ev1', ['en1'], { status: 'done' })];
    const entries = [withResult(makeEntry('en1', 'ath1'), 'r1')];
    const results = [makeResult('r1', { officialTimeInt: 3400 })];
    const { assembled } = run(heats, entries, results, { ath1: makeAthlete() }, [makeEvent('ev1')], { stdIncluded });
    expect(assembled[0].events[0].qualifying).toContain('INV');
  });

  it('does not qualify when offTime is slower than cut', () => {
    const stdIncluded = [
      { type: 'timeStandard',      id: 'std1', attributes: { label: 'INV' }, relationships: {} },
      { type: 'timeStandardEvent', id: 'tse1', attributes: { distance: 50, strokeCode: 1, athleteGender: 'F', athleteMinAge: 9, athleteMaxAge: 10 }, relationships: {} },
      { type: 'timeStandardCut',   id: 'cut1', attributes: { timeInt: 3500 }, relationships: { timeStandardEvent: { data: { id: 'tse1' } } } },
    ];
    const heats   = [makeHeat('h1', 'ev1', ['en1'], { status: 'done' })];
    const entries = [withResult(makeEntry('en1', 'ath1'), 'r1')];
    const results = [makeResult('r1', { officialTimeInt: 3600 })];
    const { assembled } = run(heats, entries, results, { ath1: makeAthlete() }, [makeEvent('ev1')], { stdIncluded });
    expect(assembled[0].events[0].qualifying).toEqual([]);
  });

  it('sets distance and strokeCode on the event', () => {
    const heats    = [makeHeat('h1', 'ev1', ['en1'])];
    const entries  = [makeEntry('en1', 'ath1')];
    const athletes = { ath1: makeAthlete() };
    const events   = [makeEvent('ev1', { distance: 25, strokeCode: 4 })];
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, events);
    expect(assembled[0].events[0].distance).toBe(25);
    expect(assembled[0].events[0].strokeCode).toBe(4);
  });

  it('accumulates multiple events for the same swimmer', () => {
    const heats   = [
      makeHeat('h1', 'ev1', ['en1'], { scheduleIndex: 0 }),
      makeHeat('h2', 'ev2', ['en2'], { scheduleIndex: 1 }),
    ];
    const entries  = [makeEntry('en1', 'ath1'), makeEntry('en2', 'ath1')];
    const athletes = { ath1: makeAthlete() };
    const events   = [makeEvent('ev1', { eventNumber: 1 }), makeEvent('ev2', { eventNumber: 2 })];

    const { assembled } = run(heats, entries, NO_RESULTS, athletes, events);
    expect(assembled).toHaveLength(1);
    expect(assembled[0].events).toHaveLength(2);
  });

  it('sorts a swimmer\'s events by scheduleIndex', () => {
    const heats = [
      makeHeat('h1', 'ev1', ['en1'], { scheduleIndex: 5 }),
      makeHeat('h2', 'ev2', ['en2'], { scheduleIndex: 2 }),
    ];
    const entries  = [makeEntry('en1', 'ath1'), makeEntry('en2', 'ath1')];
    const athletes = { ath1: makeAthlete() };
    const events   = [makeEvent('ev1', { eventNumber: 10 }), makeEvent('ev2', { eventNumber: 3 })];

    const { assembled } = run(heats, entries, NO_RESULTS, athletes, events);
    expect(assembled[0].events[0].schedIdx).toBe(2);
    expect(assembled[0].events[1].schedIdx).toBe(5);
  });

  it('sorts swimmers alphabetically by lastName', () => {
    const heats    = [makeHeat('h1', 'ev1', ['en1', 'en2'])];
    const entries  = [makeEntry('en1', 'ath1'), makeEntry('en2', 'ath2')];
    const athletes = {
      ath1: makeAthlete('ath1', { lastName: 'Zebra' }),
      ath2: makeAthlete('ath2', { lastName: 'Apple' }),
    };
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, [makeEvent('ev1')]);
    expect(assembled[0].lastName).toBe('Apple');
    expect(assembled[1].lastName).toBe('Zebra');
  });

  it('parses etaEpoch and etaDisplay from adjustedEstimatedStartAt', () => {
    const heats   = [makeHeat('h1', 'ev1', ['en1'], { adjustedEstimatedStartAt: '2026-06-12T14:30:00.000Z' })];
    const entries = [makeEntry('en1', 'ath1')];
    const { assembled } = run(heats, entries, NO_RESULTS, { ath1: makeAthlete() }, [makeEvent('ev1')]);
    const ev = assembled[0].events[0];
    expect(ev.etaEpoch).toBe(Math.floor(new Date('2026-06-12T14:30:00.000Z').getTime() / 1000));
    expect(ev.etaDisplay).not.toBe('—');
  });

  it('leaves etaEpoch null and etaDisplay as dash when no adjustedEstimatedStartAt', () => {
    const heats   = [makeHeat('h1', 'ev1', ['en1'])];
    const entries = [makeEntry('en1', 'ath1')];
    const { assembled } = run(heats, entries, NO_RESULTS, { ath1: makeAthlete() }, [makeEvent('ev1')]);
    const ev = assembled[0].events[0];
    expect(ev.etaEpoch).toBeNull();
    expect(ev.etaDisplay).toBe('—');
  });
});

// ── assembleSwimmers — filtering ──────────────────────────────────────────────

describe('assembleSwimmers — filtering', () => {
  it('excludes athletes not on the target team', () => {
    const heats    = [makeHeat('h1', 'ev1', ['en1'])];
    const entries  = [makeEntry('en1', 'ath1')];
    const athletes = { ath1: makeAthlete('ath1', { _teamId: 'other-team' }) };
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, [makeEvent('ev1')], { targetTeamId: 'team1' });
    expect(assembled).toHaveLength(0);
  });

  it('includes athletes on the target team', () => {
    const heats    = [makeHeat('h1', 'ev1', ['en1'])];
    const entries  = [makeEntry('en1', 'ath1')];
    const athletes = { ath1: makeAthlete('ath1', { _teamId: 'team1' }) };
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, [makeEvent('ev1')], { targetTeamId: 'team1' });
    expect(assembled).toHaveLength(1);
  });

  it('excludes athletes outside the age group', () => {
    const heats    = [makeHeat('h1', 'ev1', ['en1'])];
    const entries  = [makeEntry('en1', 'ath1')];
    const athletes = { ath1: makeAthlete('ath1', { competitionAge: 12 }) };
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, [makeEvent('ev1')], { ageGroups: '9-10' });
    expect(assembled).toHaveLength(0);
  });

  it('excludes athletes of the wrong gender', () => {
    const heats    = [makeHeat('h1', 'ev1', ['en1'])];
    const entries  = [makeEntry('en1', 'ath1')];
    const athletes = { ath1: makeAthlete('ath1', { gender: 'M' }) };
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, [makeEvent('ev1')], { gender: 'F' });
    expect(assembled).toHaveLength(0);
  });

  it('includes when no gender filter is set', () => {
    const heats    = [makeHeat('h1', 'ev1', ['en1', 'en2'])];
    const entries  = [makeEntry('en1', 'ath1'), makeEntry('en2', 'ath2')];
    const athletes = {
      ath1: makeAthlete('ath1', { gender: 'F', lastName: 'A' }),
      ath2: makeAthlete('ath2', { gender: 'M', lastName: 'B' }),
    };
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, [makeEvent('ev1')], { gender: null });
    expect(assembled).toHaveLength(2);
  });

  it('skips entries whose athlete record is missing from the athlete map', () => {
    const heats   = [makeHeat('h1', 'ev1', ['en1'])];
    const entries = [makeEntry('en1', 'ath-missing')];
    const { assembled } = run(heats, entries, NO_RESULTS, {}, [makeEvent('ev1')]);
    expect(assembled).toHaveLength(0);
  });
});

// ── assembleSwimmers — relay entries ─────────────────────────────────────────

describe('assembleSwimmers — relay entries', () => {
  function relaySetup() {
    const heats = [makeHeat('h1', 'ev1', ['en1'], { scheduleIndex: 0 })];
    const entries = [makeRelayEntry('en1', 'team1')];
    const relayLegMap = {
      en1: [
        { athleteId: 'ath1', position: 1, strokeCode: 2 },
        { athleteId: 'ath2', position: 2, strokeCode: 3 },
        { athleteId: 'ath3', position: 3, strokeCode: 4 },
        { athleteId: 'ath4', position: 4, strokeCode: 1 },
      ],
    };
    const athletes = {
      ath1: makeAthlete('ath1', { firstName: 'A', lastName: 'Alpha',  competitionAge: 9,  gender: 'F', _teamId: 'team1' }),
      ath2: makeAthlete('ath2', { firstName: 'B', lastName: 'Beta',   competitionAge: 10, gender: 'F', _teamId: 'team1' }),
      ath3: makeAthlete('ath3', { firstName: 'C', lastName: 'Gamma',  competitionAge: 9,  gender: 'F', _teamId: 'team1' }),
      ath4: makeAthlete('ath4', { firstName: 'D', lastName: 'Delta',  competitionAge: 10, gender: 'F', _teamId: 'team1' }),
    };
    const events = [makeEvent('ev1', { eventType: 'relay', distance: 100, strokeCode: null, minAge: 9, maxAge: 10 })];
    return { heats, entries, relayLegMap, athletes, events };
  }

  it('creates one event entry per leg swimmer', () => {
    const { heats, entries, relayLegMap, athletes, events } = relaySetup();
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, events, { relayLegMap, ageGroups: '9-10' });
    expect(assembled).toHaveLength(4);
    assembled.forEach(sw => {
      expect(sw.events).toHaveLength(1);
      expect(sw.events[0].isRelay).toBe(true);
    });
  });

  it('sets legPosition and legStroke on each entry', () => {
    const { heats, entries, relayLegMap, athletes, events } = relaySetup();
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, events, { relayLegMap, ageGroups: '9-10' });
    const byName = Object.fromEntries(assembled.map(sw => [sw.lastName, sw.events[0]]));
    expect(byName['Alpha'].legPosition).toBe(1);
    expect(byName['Alpha'].legStroke).toBe(2);
    expect(byName['Delta'].legPosition).toBe(4);
    expect(byName['Delta'].legStroke).toBe(1);
  });

  it('detects a medley relay when legs have mixed strokes', () => {
    const { heats, entries, relayLegMap, athletes, events } = relaySetup();
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, events, { relayLegMap, ageGroups: '9-10' });
    expect(assembled[0].events[0].name).toContain('Medley');
  });

  it('detects a free relay when all legs are freestyle', () => {
    const heats    = [makeHeat('h1', 'ev1', ['en1'])];
    const entries  = [makeRelayEntry('en1', 'team1')];
    const relayLegMap = {
      en1: [
        { athleteId: 'ath1', position: 1, strokeCode: 1 },
        { athleteId: 'ath2', position: 2, strokeCode: 1 },
      ],
    };
    const athletes = {
      ath1: makeAthlete('ath1', { firstName: 'A', lastName: 'AA', competitionAge: 9,  gender: 'F', _teamId: 'team1' }),
      ath2: makeAthlete('ath2', { firstName: 'B', lastName: 'BB', competitionAge: 10, gender: 'F', _teamId: 'team1' }),
    };
    const events = [makeEvent('ev1', { eventType: 'relay', distance: 100, strokeCode: null, minAge: 9, maxAge: 10 })];
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, events, { relayLegMap, ageGroups: '9-10' });
    expect(assembled[0].events[0].name).toContain('Free');
    expect(assembled[0].events[0].name).not.toContain('Medley');
  });

  it('excludes relay entries for a different team when targetTeamId is set', () => {
    const { heats, entries, relayLegMap, athletes, events } = relaySetup();
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, events, { relayLegMap, ageGroups: '9-10', targetTeamId: 'other-team' });
    expect(assembled).toHaveLength(0);
  });

  it('excludes relay leg swimmers outside the age group', () => {
    const heats    = [makeHeat('h1', 'ev1', ['en1'])];
    const entries  = [makeRelayEntry('en1', 'team1')];
    const relayLegMap = {
      en1: [
        { athleteId: 'ath1', position: 1, strokeCode: 1 },
        { athleteId: 'ath2', position: 2, strokeCode: 1 },
      ],
    };
    const athletes = {
      ath1: makeAthlete('ath1', { firstName: 'A', lastName: 'AA', competitionAge: 9,  _teamId: 'team1' }),
      ath2: makeAthlete('ath2', { firstName: 'B', lastName: 'BB', competitionAge: 13, _teamId: 'team1' }),
    };
    const events = [makeEvent('ev1', { eventType: 'relay', distance: 100, strokeCode: null, minAge: 9, maxAge: 10 })];
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, events, { relayLegMap, ageGroups: '9-10' });
    expect(assembled).toHaveLength(1);
    expect(assembled[0].lastName).toBe('AA');
  });

  it('marks relay as scratched when heat is done with no time and no DQ', () => {
    const heats   = [makeHeat('h1', 'ev1', ['en1'], { status: 'done' })];
    const entry   = withResult(makeRelayEntry('en1', 'team1'), 'r1');
    const results = [makeResult('r1', { officialTimeInt: null, isDq: false, invalidCode: null })];
    const relayLegMap = { en1: [{ athleteId: 'ath1', position: 1, strokeCode: 1 }] };
    const athletes = { ath1: makeAthlete('ath1', { firstName: 'A', lastName: 'A', competitionAge: 9, gender: 'F', _teamId: 'team1' }) };
    const events = [makeEvent('ev1', { eventType: 'relay', distance: 100, strokeCode: null, minAge: 9, maxAge: 10 })];
    const { assembled } = run(heats, [entry], results, athletes, events, { relayLegMap, ageGroups: '9-10' });
    expect(assembled[0].events[0].isScratched).toBe(true);
  });

  it('does not mark relay as scratched when isDq is true', () => {
    const heats   = [makeHeat('h1', 'ev1', ['en1'], { status: 'done' })];
    const entry   = withResult(makeRelayEntry('en1', 'team1'), 'r1');
    const results = [makeResult('r1', { officialTimeInt: null, isDq: true, invalidCode: null })];
    const relayLegMap = { en1: [{ athleteId: 'ath1', position: 1, strokeCode: 1 }] };
    const athletes = { ath1: makeAthlete('ath1', { firstName: 'A', lastName: 'A', competitionAge: 9, gender: 'F', _teamId: 'team1' }) };
    const events = [makeEvent('ev1', { eventType: 'relay', distance: 100, strokeCode: null, minAge: 9, maxAge: 10 })];
    const { assembled } = run(heats, [entry], results, athletes, events, { relayLegMap, ageGroups: '9-10' });
    expect(assembled[0].events[0].isScratched).toBe(false);
    expect(assembled[0].events[0].isDq).toBe(true);
  });

  it('shares offTime and place across all legs', () => {
    const heats   = [makeHeat('h1', 'ev1', ['en1'], { status: 'done' })];
    const entry   = withResult(makeRelayEntry('en1', 'team1'), 'r1');
    const results = [makeResult('r1', { officialTimeInt: 12500, overallPlace: 1 })];
    const relayLegMap = {
      en1: [
        { athleteId: 'ath1', position: 1, strokeCode: 1 },
        { athleteId: 'ath2', position: 2, strokeCode: 1 },
      ],
    };
    const athletes = {
      ath1: makeAthlete('ath1', { firstName: 'A', lastName: 'A', competitionAge: 9, gender: 'F', _teamId: 'team1' }),
      ath2: makeAthlete('ath2', { firstName: 'B', lastName: 'B', competitionAge: 9, gender: 'F', _teamId: 'team1' }),
    };
    const events = [makeEvent('ev1', { eventType: 'relay', distance: 100, strokeCode: null, minAge: 9, maxAge: 10 })];
    const { assembled } = run(heats, [entry], results, athletes, events, { relayLegMap, ageGroups: '9-10' });
    assembled.forEach(sw => {
      expect(sw.events[0].offTime).toBe(12500);
      expect(sw.events[0].place).toBe(1);
    });
  });
});

// ── assembleSwimmers — event name formatting ──────────────────────────────────

describe('assembleSwimmers — event name formatting', () => {
  it('formats individual event name as distance + stroke', () => {
    const heats    = [makeHeat('h1', 'ev1', ['en1'])];
    const entries  = [makeEntry('en1', 'ath1')];
    const athletes = { ath1: makeAthlete() };
    const events   = [makeEvent('ev1', { distance: 100, strokeCode: 2, eventType: 'individual' })];
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, events);
    expect(assembled[0].events[0].name).toBe('100 Back');
  });

  it('formats relay event name as distance + Relay', () => {
    const heats    = [makeHeat('h1', 'ev1', ['en1'])];
    const entries  = [makeRelayEntry('en1', 'team1')];
    const relayLegMap = { en1: [{ athleteId: 'ath1', position: 1, strokeCode: 1 }] };
    const athletes = { ath1: makeAthlete('ath1', { firstName: 'A', lastName: 'Z', competitionAge: 10, gender: 'F', _teamId: 'team1' }) };
    const events   = [makeEvent('ev1', { eventType: 'relay', distance: 200, strokeCode: null, minAge: 9, maxAge: 10 })];
    const { assembled } = run(heats, entries, NO_RESULTS, athletes, events, { relayLegMap, ageGroups: '9-10' });
    expect(assembled[0].events[0].name).toContain('200');
    expect(assembled[0].events[0].name).toContain('Relay');
  });
});
