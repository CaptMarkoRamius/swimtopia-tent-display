// Demo mode — fixture data for ?demo URL parameter.
// Uses the same S.swimmers shape as the live assembly, so display
// code paths are exercised identically.

import { S, $ } from './state.js';

export function loadDemoData() {
  const now    = Math.floor(Date.now() / 1000);
  const eta    = offset => now + offset;
  const etaFmt = offset => new Date((now + offset) * 1000)
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  S.meetId     = 'demo';
  S.nirvanaId  = 'demo';
  S.ageGroup   = '9-10';
  S.gender     = 'M';
  S.teamFilter = 'HUR';
  S.lineupMin  = 20;
  S.warnMin    = 30;
  S.updatedAt  = Date.now();

  $('dh-meet').textContent = 'NWSC Championship 2026  ·  DEMO';
  $('dh-sub').textContent  = '9-10 · Boys · HUR';

  S.quals = [
    { label: 'INV', gender: 'M', ageMin: 9, ageMax: 10, distance: 50,  strokeCode: 1, cutTime: 3500 },
    { label: 'INV', gender: 'M', ageMin: 9, ageMax: 10, distance: 100, strokeCode: 2, cutTime: 8200 },
    { label: 'INV', gender: 'M', ageMin: 9, ageMax: 10, distance: 50,  strokeCode: 2, cutTime: 4800 },
    { label: 'INV', gender: 'M', ageMin: 9, ageMax: 10, distance: 50,  strokeCode: 4, cutTime: 4200 },
  ];

  // Heat 2 of Event 77 (50 Back Boys 9-10) is currently in the water.
  // Heat 1 of Event 77 already finished (Jackson, Lucas in prev panel).
  S.tracker = {
    isLive: true, isComplete: false,
    currentEventNumberDigit: '77', currentHeatNumber: 2,
    currentEventDistance: 50, currentEventStrokeCode: 2,
    currentEventGender: 'M', currentEventMinAge: 9, currentEventMaxAge: 10,
  };

  // Done relays: e73=200 Medley (1st, 1:59.03), e74=200 Free Relay (2nd, 1:52.45)
  // e77 50 Back: heat 1 (Jackson, Lucas) DONE; heat 2 (Ethan, Noah) INPROGRESS
  // e80 Medley Relay eta=25min → lineup in 5min → WARNING banner on load
  S.swimmers = [
    {
      name: 'Ethan Miller', lastName: 'Miller', age: 10, gender: 'M',
      events: [
        { eventId: 'e14', name: '50 Free',  number: '14', schedIdx: 14001, status: 'done',
          heatNum: 2, laneNum: 5, offTime: 3287, seedTime: 3350, place: 1, heatPlace: 1, qualifying: ['INV'], isDq: false, isScratched: false },
        { eventId: 'e21', name: '100 Back', number: '21', schedIdx: 21001, status: 'done',
          heatNum: 1, laneNum: 4, offTime: 7954, seedTime: 8100, place: 3, heatPlace: 2, qualifying: [], isDq: false, isScratched: false },
        { eventId: 'e73', name: '200 Medley Relay', number: '73', schedIdx: 73001, status: 'done',
          heatNum: 2, laneNum: 3, offTime: 11903, place: 1, isDq: false, isScratched: false, isRelay: true,
          relayTeam: 'A', legPosition: 4, legStroke: 1, qualifying: [] },
        { eventId: 'e74', name: '200 Free Relay', number: '74', schedIdx: 74001, status: 'done',
          heatNum: 2, laneNum: 5, offTime: 11245, place: 2, isDq: false, isScratched: false, isRelay: true,
          relayTeam: 'A', legPosition: 4, legStroke: 1, qualifying: [] },
        { eventId: 'e77', name: '50 Back', number: '77', schedIdx: 77002, status: 'inProgress',
          heatNum: 2, laneNum: 3, seedTime: 4150, qualifying: [] },
        { eventId: 'e80', name: '200 Medley Relay', number: '80', schedIdx: 80001, status: 'upcoming',
          heatNum: 2, laneNum: 3, etaEpoch: eta(25 * 60), etaDisplay: etaFmt(25 * 60),
          isRelay: true, relayTeam: 'A', legPosition: 4, legStroke: 1 },
        { eventId: 'e81', name: '200 Free Relay', number: '81', schedIdx: 81001, status: 'upcoming',
          heatNum: 2, laneNum: 4, etaEpoch: eta(35 * 60), etaDisplay: etaFmt(35 * 60),
          isRelay: true, relayTeam: 'A', legPosition: 4, legStroke: 1 },
      ],
    },
    {
      name: 'Noah Garcia', lastName: 'Garcia', age: 9, gender: 'M',
      events: [
        { eventId: 'e14', name: '50 Free',  number: '14', schedIdx: 14001, status: 'done',
          heatNum: 2, laneNum: 3, offTime: 3412, seedTime: 3380, place: 4, heatPlace: 3, qualifying: [], isDq: false, isScratched: false },
        { eventId: 'e21', name: '100 Back', number: '21', schedIdx: 21001, status: 'done',
          heatNum: 1, laneNum: 6, offTime: 8560, seedTime: 8400, place: 6, heatPlace: 4, qualifying: [], isDq: false, isScratched: false },
        { eventId: 'e73', name: '200 Medley Relay', number: '73', schedIdx: 73001, status: 'done',
          heatNum: 2, laneNum: 3, offTime: 11903, place: 1, isDq: false, isScratched: false, isRelay: true,
          relayTeam: 'A', legPosition: 1, legStroke: 2, qualifying: [] },
        { eventId: 'e74', name: '200 Free Relay', number: '74', schedIdx: 74001, status: 'done',
          heatNum: 2, laneNum: 5, offTime: 11245, place: 2, isDq: false, isScratched: false, isRelay: true,
          relayTeam: 'A', legPosition: 2, legStroke: 1, qualifying: [] },
        { eventId: 'e77', name: '50 Back', number: '77', schedIdx: 77002, status: 'inProgress',
          heatNum: 2, laneNum: 5, seedTime: 4380, qualifying: [] },
        { eventId: 'e80', name: '200 Medley Relay', number: '80', schedIdx: 80001, status: 'upcoming',
          heatNum: 2, laneNum: 3, etaEpoch: eta(25 * 60), etaDisplay: etaFmt(25 * 60),
          isRelay: true, relayTeam: 'A', legPosition: 1, legStroke: 2 },
        { eventId: 'e81', name: '200 Free Relay', number: '81', schedIdx: 81001, status: 'upcoming',
          heatNum: 2, laneNum: 4, etaEpoch: eta(35 * 60), etaDisplay: etaFmt(35 * 60),
          isRelay: true, relayTeam: 'A', legPosition: 2, legStroke: 1 },
      ],
    },
    {
      name: 'Jackson Lee', lastName: 'Lee', age: 10, gender: 'M',
      events: [
        { eventId: 'e14', name: '50 Free',  number: '14', schedIdx: 14001, status: 'done',
          heatNum: 2, laneNum: 7, offTime: 3501, seedTime: 3490, place: 5, heatPlace: 5, qualifying: [], isDq: false, isScratched: false },
        { eventId: 'e73', name: '200 Medley Relay', number: '73', schedIdx: 73001, status: 'done',
          heatNum: 2, laneNum: 3, offTime: 11903, place: 1, isDq: false, isScratched: false, isRelay: true,
          relayTeam: 'A', legPosition: 3, legStroke: 4, qualifying: [] },
        { eventId: 'e74', name: '200 Free Relay', number: '74', schedIdx: 74001, status: 'done',
          heatNum: 2, laneNum: 5, offTime: 11245, place: 2, isDq: false, isScratched: false, isRelay: true,
          relayTeam: 'A', legPosition: 3, legStroke: 1, qualifying: [] },
        { eventId: 'e77', name: '50 Back', number: '77', schedIdx: 77001, status: 'done',
          heatNum: 1, laneNum: 2, offTime: 4812, seedTime: 4750, place: 4, heatPlace: 2, qualifying: [], isDq: false, isScratched: false },
        { eventId: 'e80', name: '200 Medley Relay', number: '80', schedIdx: 80001, status: 'upcoming',
          heatNum: 2, laneNum: 3, etaEpoch: eta(25 * 60), etaDisplay: etaFmt(25 * 60),
          isRelay: true, relayTeam: 'A', legPosition: 3, legStroke: 4 },
        { eventId: 'e81', name: '200 Free Relay', number: '81', schedIdx: 81001, status: 'upcoming',
          heatNum: 2, laneNum: 4, etaEpoch: eta(35 * 60), etaDisplay: etaFmt(35 * 60),
          isRelay: true, relayTeam: 'A', legPosition: 3, legStroke: 1 },
      ],
    },
    {
      name: 'Lucas Thompson', lastName: 'Thompson', age: 9, gender: 'M',
      events: [
        { eventId: 'e21', name: '100 Back', number: '21', schedIdx: 21001, status: 'done',
          heatNum: 2, laneNum: 3, offTime: null, seedTime: 8650, place: null, heatPlace: null, qualifying: [], isDq: true, isScratched: false },
        { eventId: 'e73', name: '200 Medley Relay', number: '73', schedIdx: 73001, status: 'done',
          heatNum: 2, laneNum: 3, offTime: 11903, place: 1, isDq: false, isScratched: false, isRelay: true,
          relayTeam: 'A', legPosition: 2, legStroke: 3, qualifying: [] },
        { eventId: 'e77', name: '50 Back', number: '77', schedIdx: 77001, status: 'done',
          heatNum: 1, laneNum: 6, offTime: 5104, seedTime: 5210, place: 8, heatPlace: 4, qualifying: [], isDq: false, isScratched: false },
        { eventId: 'e80', name: '200 Medley Relay', number: '80', schedIdx: 80001, status: 'upcoming',
          heatNum: 2, laneNum: 3, etaEpoch: eta(25 * 60), etaDisplay: etaFmt(25 * 60),
          isRelay: true, relayTeam: 'A', legPosition: 2, legStroke: 3 },
      ],
    },
    {
      name: 'Oliver Chen', lastName: 'Chen', age: 10, gender: 'M',
      events: [
        { eventId: 'e14', name: '50 Free',  number: '14', schedIdx: 14001, status: 'done',
          heatNum: 1, laneNum: 4, offTime: 3198, seedTime: 3250, place: 2, heatPlace: 2, qualifying: ['INV'], isDq: false, isScratched: false },
        { eventId: 'e21', name: '100 Back', number: '21', schedIdx: 21001, status: 'done',
          heatNum: 1, laneNum: 2, offTime: 7801, seedTime: 8000, place: 1, heatPlace: 1, qualifying: ['INV'], isDq: false, isScratched: false },
        { eventId: 'e74', name: '200 Free Relay', number: '74', schedIdx: 74001, status: 'done',
          heatNum: 2, laneNum: 5, offTime: 11245, place: 2, isDq: false, isScratched: false, isRelay: true,
          relayTeam: 'A', legPosition: 1, legStroke: 1, qualifying: [] },
        { eventId: 'e81', name: '200 Free Relay', number: '81', schedIdx: 81001, status: 'upcoming',
          heatNum: 2, laneNum: 4, etaEpoch: eta(35 * 60), etaDisplay: etaFmt(35 * 60),
          isRelay: true, relayTeam: 'A', legPosition: 1, legStroke: 1 },
      ],
    },
  ];
}

// After 8s: heat 2 of Event 77 (50 Back) finishes; Ethan + Noah get results.
// All four boys from event 77 now appear in the Previous Events column.
// Tracker advances to a girls event — pool has moved on from 9-10 Boys 50 Back.
export function startDemoAnimation() {
  setTimeout(() => {
    for (const sw of S.swimmers) {
      for (const ev of sw.events) {
        if (ev.eventId !== 'e77' || ev.status !== 'inProgress') continue;
        ev.status = 'done';
        if (sw.name === 'Ethan Miller') {
          ev.offTime = 4089; ev.place = 2; ev.heatPlace = 1; ev.qualifying = ['INV']; ev.isDq = false;
        } else if (sw.name === 'Noah Garcia') {
          ev.offTime = 4312; ev.place = 5; ev.heatPlace = 2; ev.qualifying = []; ev.isDq = false;
        }
      }
    }
    S.tracker = {
      isLive: true, isComplete: false,
      currentEventNumberDigit: '78', currentHeatNumber: 1,
      currentEventDistance: 50, currentEventStrokeCode: 2,
      currentEventGender: 'F', currentEventMinAge: 9, currentEventMaxAge: 10,
    };
    import('./render.js').then(({ renderAll }) => renderAll());
  }, 8000);
}
