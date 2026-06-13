// Pure network layer — fetch wrappers, auth, and raw data fetchers.
// No DOM access, no S mutations, no imports from app.js.

import { S, BASE, OAUTH } from './state.js';

// ── Session expiry callback (set by app.js) ───────────────────────────────────

let _onSessionExpired = () => {};
export function onSessionExpired(cb) { _onSessionExpired = cb; }

// ── Core fetch ────────────────────────────────────────────────────────────────

let _refreshInFlight = null;

async function _refreshToken() {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    const rt = sessionStorage.getItem('st_refresh');
    if (!rt) throw new Error('No refresh token');
    const r = await fetch(OAUTH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt }),
    });
    if (!r.ok) throw new Error('Refresh failed');
    const d = await r.json();
    S.token = d.access_token;
    sessionStorage.setItem('st_token', S.token);
    if (d.refresh_token) sessionStorage.setItem('st_refresh', d.refresh_token);
  })().finally(() => { _refreshInFlight = null; });
  return _refreshInFlight;
}

export async function api(path, params = {}, _retry = true) {
  const url = new URL(`${BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  const r = await fetch(url, {
    headers: { 'Accept': 'application/vnd.api+json', 'Authorization': `Bearer ${S.token}` },
  });
  if (r.status === 401 && _retry) {
    try {
      await _refreshToken();
      return api(path, params, false);
    } catch {
      _onSessionExpired();
      throw new Error('Session expired — please sign in again.');
    }
  }
  if (!r.ok) throw new Error(`API ${r.status} on ${path}`);
  return r.json();
}

export async function paginate(path, params = {}, size = 25) {
  const out = { data: [], included: [] };
  let offset = 0;
  while (true) {
    const page = await api(path, { ...params, 'page[limit]': size, 'page[offset]': offset });
    out.data.push(...(page.data ?? []));
    out.included.push(...(page.included ?? []));
    offset += size;
    if (page.data.length < size) break;
  }
  return out;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(email, password) {
  const r = await fetch(OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: email, password }),
  });
  if (!r.ok) throw new Error('Invalid email or password.');
  return r.json(); // { access_token, refresh_token, expires_in }
}

// ── Data fetchers (return raw API shapes, no S mutations) ─────────────────────

export const fetchOrg             = ()        => api('organizations');
export const fetchCalendarEvents  = (orgId, lookback) =>
  api(`organizations/${orgId}/calendar-events`, { 'filter[after]': lookback });
export const fetchMeetDetails     = meetId    =>
  api(`swim-meets/${meetId}`, { include: 'nirvanaMeet,swimTeams' });
export const fetchNirvanaTeams    = nirvanaId => api(`nirvana-meets/${nirvanaId}/nirvana-teams`);
export const fetchNirvanaEvents   = nirvanaId => paginate(`nirvana-meets/${nirvanaId}/nirvana-events`);
export const fetchNirvanaHeats    = nirvanaId =>
  paginate(`nirvana-meets/${nirvanaId}/nirvana-heats`, {
    include: 'nirvanaEntries,nirvanaResults,nirvanaEntries.nirvanaEntryRelayLegs',
  });
export const fetchTimeStandards   = meetId    =>
  api(`swim-meets/${meetId}/time-standard-sets`, {
    include: 'time_standards,time_standard_events,time_standard_events.time_standard_cuts',
  }).catch(() => ({ included: [] }));

// Falls back to the nearest future meet whose name contains "invitational" (case-insensitive)
// if the current meet has no time standards configured. Uses meetDate as the lower bound so
// it works correctly across year boundaries (e.g. Dec/Jan seasons).
export async function fetchFallbackStandards(orgId, excludeMeetId, meetDate) {
  const after = meetDate || new Date().toISOString().slice(0, 10);
  const cal = await api(`organizations/${orgId}/calendar-events`, {
    'filter[after]': after,
    'page[size]': 100,
  }).catch(() => ({ data: [] }));
  const candidates = (cal.data || [])
    .filter(e =>
      e.attributes?.stiType === 'SwimMeet' &&
      e.id !== String(excludeMeetId) &&
      /invitational/i.test(e.attributes?.name ?? '')
    )
    .sort((a, b) => {
      const da = new Date(a.attributes?.startDate || a.attributes?.startsAt || 0);
      const db = new Date(b.attributes?.startDate || b.attributes?.startsAt || 0);
      return da - db;  // ascending — nearest next invitational first
    });
  for (const meet of candidates) {
    const std = await fetchTimeStandards(meet.id);
    if ((std.included || []).length) return std;
  }
  return { included: [] };
}
export const fetchHeatTracker     = meetId    =>
  api(`swim-meets/${meetId}/swim-event-heat-trackers`);
export const fetchAthletes        = (nirvanaId, ids) => {
  const params = {};
  ids.forEach((id, j) => { params[`filter[id][${j}]`] = id; });
  return api(`nirvana-meets/${nirvanaId}/nirvana-athletes`, params);
};
export const fetchMeetWithEvents  = meetId    =>
  api(`swim-meets/${meetId}`, { include: 'swimSessions,swimSessions.swimEvents' });
export const fetchSwimEntries     = meetId    =>
  paginate(`swim-meets/${meetId}/swim-entries`, { include: 'athlete' }, 100);
