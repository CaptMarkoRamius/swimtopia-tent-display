// Shared mutable application state — imported as a singleton by all modules.
// Only app.js should write to S directly; other modules read from it.

export const BASE  = 'https://mobile-api.swimtopia.com/mobile';
export const OAUTH = 'https://mobile-api.swimtopia.com/oauth/token';
export const TODAY = new Date().toISOString().slice(0, 10);
export const DEMO_MODE = new URLSearchParams(location.search).has('demo');

export const S = {
  token:      sessionStorage.getItem('st_token'),
  orgId:      sessionStorage.getItem('st_org'),
  meetId:     null,
  nirvanaId:  null,
  ageGroup:   '9-10',
  gender:     'M',
  teamFilter: 'HUR',
  teamName:   '',        // full team name for display
  lineupMin:  20,
  warnMin:    30,
  swimmers:   [],   // assembled by assembly.js
  quals:      [],   // [{label, cutTime, gender, ageMin, ageMax, distance, strokeCode}]
  tracker:    null,
  updatedAt:  null,
  pollTimer:  null,
  tickTimer:  null,
  wakeLock:   null,
  // static data cache — only re-fetched when nirvanaId changes
  _staticNirvanaId: null,
  _eventsRes:       null,
  _teamsRes:        null,
  _stdRes:          null,
};

export const $ = id => document.getElementById(id);

export function show(view) {
  ['view-login', 'view-meets', 'view-display']
    .forEach(id => $(id).classList.toggle('hidden', id !== view));
}
