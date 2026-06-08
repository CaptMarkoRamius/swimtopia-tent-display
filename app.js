// Application orchestration — auth flow, meet picker, data refresh, timers, themes.
// This is the entry point loaded by index.html.

import { S, $, show, DEMO_MODE, TODAY } from './state.js';
import {
  api, paginate, login, onSessionExpired,
  fetchOrg, fetchCalendarEvents, fetchMeetDetails,
  fetchNirvanaTeams, fetchNirvanaEvents, fetchNirvanaHeats,
  fetchTimeStandards, fetchHeatTracker, fetchAthletes,
  fetchMeetWithEvents, fetchSwimEntries,
} from './api.js';
import { assembleSwimmers, assembleQuals } from './assembly.js';
import { renderAll, renderTopBanner, renderLineupBanner, renderNextPanel, tick } from './render.js';
import { loadDemoData, startDemoAnimation } from './demo.js';
import { STROKE, STANDARD_AGE_GROUPS, esc, ageInRange, fmtTime } from './utils.js';

// ── Session expiry ─────────────────────────────────────────────────────────────

onSessionExpired(() => {
  stopTimers(); releaseWakeLock();
  sessionStorage.clear(); S.token = S.orgId = null;
  show('view-login');
});

// ── Auth ──────────────────────────────────────────────────────────────────────

$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('login-btn'), errEl = $('login-error');
  btn.disabled = true; btn.textContent = 'Signing in…';
  errEl.textContent = '';
  try {
    const d = await login($('inp-email').value, $('inp-password').value);
    S.token = d.access_token;
    sessionStorage.setItem('st_token', S.token);
    if (d.refresh_token) sessionStorage.setItem('st_refresh', d.refresh_token);
    await goToMeetPicker();
  } catch (ex) {
    errEl.textContent = ex.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Sign In';
  }
});

export function doLogout() {
  stopTimers(); releaseWakeLock();
  sessionStorage.clear(); S.token = S.orgId = null;
  show('view-login');
}

// ── Meet Picker ────────────────────────────────────────────────────────────────

export async function goToMeetPicker() {
  show('view-meets');
  $('meets-list').innerHTML = '<div class="loading">Loading meets…</div>';
  try {
    if (!S.orgId) {
      const orgs = await fetchOrg();
      S.orgId = orgs.data?.[0]?.id;
      if (!S.orgId) throw new Error('No organization found for this account.');
      sessionStorage.setItem('st_org', S.orgId);
    }
    const lookback = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const resp  = await fetchCalendarEvents(S.orgId, lookback);
    const meets = (resp.data || []).filter(e => e.attributes?.stiType === 'SwimMeet');
    const isUpcoming = m => (m.attributes.startDate ?? '') >= TODAY;
    meets.sort((a, b) => {
      const ua = isUpcoming(a), ub = isUpcoming(b);
      if (!ua && ub) return -1; if (ua && !ub) return 1;
      return (a.attributes.startDate ?? '').localeCompare(b.attributes.startDate ?? '');
    });
    _renderMeetList(meets, isUpcoming);
  } catch (ex) {
    $('meets-list').innerHTML = `<div class="loading" style="color:var(--red)">${esc(ex.message)}</div>`;
  }
}

function _renderMeetList(meets, isUpcoming) {
  const list = $('meets-list');
  if (!meets.length) { list.innerHTML = '<div class="loading">No swim meets found.</div>'; return; }
  list.innerHTML = '';
  for (const m of meets) {
    const a = m.attributes;
    const upcoming = isUpcoming(m);
    const date = a.startDate
      ? new Date(a.startDate + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
      : '';
    const div = document.createElement('div');
    div.className = 'meet-card';
    div.innerHTML = `
      <div class="meet-card-name">${esc(a.name) || 'Unnamed Meet'}
        <span class="stage-badge ${upcoming ? 'stage-upcoming' : 'stage-past'}">${upcoming ? 'Upcoming' : 'Complete'}</span>
      </div>
      <div class="meet-card-meta">
        <span>${esc(date)}</span>${a.location ? `<span>${esc(a.location)}</span>` : ''}
      </div>`;
    div.onclick = () => loadTeamsForMeet(m.id, a.name, div);
    list.appendChild(div);
  }
}

export async function loadTeamsForMeet(meetId, meetName, cardEl) {
  const teamSel = $('inp-team'), ageSel = $('inp-age'), goBtn = $('go-btn');
  teamSel.disabled = ageSel.disabled = goBtn.disabled = true;
  teamSel.innerHTML = '<option value="">Loading…</option>';
  ageSel.innerHTML  = '<option value="">Loading…</option>';
  document.querySelectorAll('.meet-card').forEach(c => c.style.outline = '');
  if (cardEl) cardEl.style.outline = '2px solid var(--blue)';

  const populateTeams = teams => {
    const sorted = [...teams].sort((a, b) =>
      (a.attributes?.abbreviation ?? '').localeCompare(b.attributes?.abbreviation ?? ''));
    teamSel.innerHTML = '<option value="">All teams</option>' + sorted.map(t => {
      const abbr = t.attributes?.abbreviation ?? '';
      return `<option value="${abbr}"${abbr === 'HUR' ? ' selected' : ''}>${abbr} — ${t.attributes?.name ?? abbr}</option>`;
    }).join('');
    teamSel.disabled = false;
  };

  const populateAgeGroups = groups => {
    const saved = sessionStorage.getItem('st_age') || '9-10';
    ageSel.innerHTML = groups.map(({ minAge, maxAge }) => {
      const label = minAge === 0 ? `${maxAge} & Under` : maxAge > 17 ? `${minAge} & Over` : `${minAge}-${maxAge}`;
      const value = `${minAge}-${maxAge}`;
      return `<option value="${value}"${value === saved ? ' selected' : ''}>${label}</option>`;
    }).join('');
    if (!ageSel.value) ageSel.selectedIndex = 0;
    ageSel.disabled = false;
  };

  try {
    const meetResp  = await fetchMeetDetails(meetId);
    const nirvanaId = meetResp.data.relationships?.nirvanaMeet?.data?.id;
    const swimTeams = (meetResp.included || []).filter(o => o.type === 'swimTeam');

    if (nirvanaId) {
      const [teamsRes, eventsRes] = await Promise.all([
        fetchNirvanaTeams(nirvanaId), fetchNirvanaEvents(nirvanaId),
      ]);
      populateTeams(teamsRes.data || []);
      const ageMap = new Map();
      for (const ev of eventsRes.data) {
        const { minAge, maxAge } = ev.attributes;
        if (minAge != null && maxAge != null) ageMap.set(`${minAge}-${maxAge}`, { minAge, maxAge });
      }
      populateAgeGroups([...ageMap.values()].sort((a, b) => a.minAge - b.minAge));
    } else {
      if (swimTeams.length) populateTeams(swimTeams);
      else { teamSel.innerHTML = '<option value="">All teams</option>'; teamSel.disabled = false; }
      populateAgeGroups(STANDARD_AGE_GROUPS);
    }
    goBtn.dataset.meetId = meetId; goBtn.dataset.meetName = meetName;
    goBtn.disabled = false;
  } catch (ex) {
    teamSel.innerHTML = '<option value="">Error loading</option>';
    ageSel.innerHTML  = '<option value="">Error loading</option>';
    teamSel.disabled = ageSel.disabled = false;
    console.error(ex);
  }
}

export async function selectMeet(meetId, meetName) {
  S.meetId     = meetId;
  S.ageGroup   = $('inp-age').value;
  S.gender     = $('inp-gender').value;
  S.teamFilter = $('inp-team').value.toUpperCase();
  S.lineupMin  = parseInt($('inp-lineup').value)  || 20;
  S.warnMin    = parseInt($('inp-warning').value) || 30;
  sessionStorage.setItem('st_age', S.ageGroup);

  $('dh-meet').textContent  = meetName;
  $('dh-sub').textContent   = '';
  $('panel-next').innerHTML = '<div class="loading">Loading…</div>';
  $('panel-prev').innerHTML = '';
  show('view-display');

  await acquireWakeLock();
  await refreshData();
  startPolling();
}

export function backToMeets() { stopTimers(); releaseWakeLock(); show('view-meets'); }

// ── Data refresh ──────────────────────────────────────────────────────────────

export async function refreshData() {
  try {
    const meetResp = await fetchMeetDetails(S.meetId);
    S.nirvanaId = meetResp.data.relationships?.nirvanaMeet?.data?.id ?? null;
    $('dh-meet').textContent = meetResp.data.attributes?.name || S.meetId;

    if (!S.nirvanaId) { await _loadSwimEntries(); return; }

    const [heatsRes, eventsRes, teamsRes, stdRes, trackerRes] = await Promise.all([
      fetchNirvanaHeats(S.nirvanaId),
      fetchNirvanaEvents(S.nirvanaId),
      fetchNirvanaTeams(S.nirvanaId),
      fetchTimeStandards(S.meetId),
      fetchHeatTracker(S.meetId),
    ]);

    // Resolve team filter
    let targetTeamId = null;
    if (S.teamFilter) {
      const team = (teamsRes.data || []).find(t => t.attributes.abbreviation?.toUpperCase() === S.teamFilter);
      targetTeamId = team?.id ?? null;
    }

    // Build included indexes
    const rawEntries = {}, rawResults = {}, relayLegMap = {};
    const athleteIds = new Set();
    for (const obj of heatsRes.included) {
      if (obj.type === 'nirvanaEntry') {
        rawEntries[obj.id] = obj;
        const aid = obj.relationships?.nirvanaAthlete?.data?.id;
        if (aid) athleteIds.add(aid);
      }
      if (obj.type === 'nirvanaResult') rawResults[obj.id] = obj;
      if (obj.type === 'nirvanaEntryRelayLeg') {
        const entryId = obj.relationships?.nirvanaEntry?.data?.id;
        const athId   = obj.relationships?.nirvanaAthlete?.data?.id;
        if (entryId && athId) {
          (relayLegMap[entryId] ??= []).push({
            athleteId:  athId,
            position:   obj.attributes?.position ?? 0,
            strokeCode: obj.attributes?.relayLegStrokeCode,
          });
          athleteIds.add(athId);
        }
      }
    }

    // Batch-fetch athletes
    const athletes = {};
    const ids = [...athleteIds];
    for (let i = 0; i < ids.length; i += 100) {
      const resp = await fetchAthletes(S.nirvanaId, ids.slice(i, i + 100));
      for (const a of (resp.data || []))
        athletes[a.id] = { ...a.attributes, _teamId: a.relationships?.nirvanaTeam?.data?.id ?? null };
    }

    const { assembled, quals } = assembleSwimmers(
      heatsRes.data, rawEntries, rawResults, relayLegMap,
      athletes, eventsRes.data, stdRes.included || [],
      targetTeamId, S.ageGroup, S.gender
    );

    S.swimmers  = assembled;
    S.quals     = quals;
    S.tracker   = trackerRes.data?.[0]?.attributes ?? null;
    S.updatedAt = Date.now();

    renderAll();
    startTicking();

  } catch (ex) {
    $('panel-next').innerHTML = `<div class="loading" style="color:var(--red)">Error: ${esc(ex.message)}</div>`;
    console.error(ex);
  }
}

// ── Pre-meet fallback (no Meet Maestro) ───────────────────────────────────────

async function _loadSwimEntries() {
  $('panel-prev').innerHTML = '';
  $('banner-lineup').className = 'normal';
  $('bl-tag').textContent  = 'NO LIVE DATA YET'; $('bl-tag').className = 'bl-tag normal';
  $('bl-event').textContent = 'Heat assignments not available before meet day';
  $('bl-time').textContent  = ''; $('bl-countdown').textContent = '—';
  $('panel-next').innerHTML = '<div class="loading">Loading entries…</div>';

  try {
    const meetWithEvents = await fetchMeetWithEvents(S.meetId);
    const swimEventMap = {};
    for (const obj of (meetWithEvents.included || [])) {
      if (obj.type !== 'swimEvent') continue;
      const a = obj.attributes;
      const isRelay = a.eventType === 'relay';
      swimEventMap[obj.id] = {
        name:   isRelay ? `${a.distance} Relay` : `${a.distance} ${STROKE[a.strokeCode] ?? ''}`.trim(),
        number: a.eventNumber ?? '', gender: a.gender, minAge: a.minAge, maxAge: a.maxAge,
      };
    }

    const entriesRes = await fetchSwimEntries(S.meetId);
    const athleteMap = {};
    for (const obj of (entriesRes.included || []))
      if (obj.type === 'athlete') athleteMap[obj.id] = obj.attributes;

    const byEvent = {};
    for (const entry of entriesRes.data) {
      if (entry.attributes.deletedAt) continue;
      const evd = swimEventMap[entry.relationships?.swimEvent?.data?.id];
      const ath = athleteMap[entry.relationships?.athlete?.data?.id];
      if (!evd || !ath) continue;
      const age = ath.competitionAge ?? ath.age;
      if (!ageInRange(age, S.ageGroup)) continue;
      if (S.gender && ath.gender !== S.gender) continue;
      (byEvent[entry.relationships.swimEvent.data.id] ??= { evd, entries: [] }).entries.push({
        name:     [ath.preferredName || ath.firstName, ath.lastName].filter(Boolean).join(' '),
        seedTime: entry.attributes.seedTimeInt,
      });
    }

    const groups = Object.values(byEvent).sort((a, b) => parseInt(a.evd.number || 0) - parseInt(b.evd.number || 0));
    if (!groups.length) {
      $('panel-next').innerHTML = `<div class="panel-empty">No entries found for ${esc(S.ageGroup)}${S.gender ? ' ' + (S.gender === 'M' ? 'Boys' : 'Girls') : ''}.</div>`;
      return;
    }

    $('panel-next').innerHTML = '';
    const note = document.createElement('div');
    note.className = 'panel-empty'; note.style.marginBottom = '12px';
    note.textContent = 'Entries only — heat assignments available on meet day.';
    $('panel-next').appendChild(note);

    for (const { evd, entries } of groups) {
      entries.sort((a, b) => (a.seedTime ?? 9999) - (b.seedTime ?? 9999));
      const card = document.createElement('div');
      card.className = 'next-event-card';
      card.innerHTML = `
        <div class="next-card-header">
          <div class="next-event-title">Event ${esc(evd.number)} · ${esc(evd.name)}</div>
        </div>
        ${entries.map(e => `
          <div class="next-swimmer-row">
            <span class="next-sw-name">${esc(e.name)}</span>
            <span class="next-sw-seed">${e.seedTime ? fmtTime(e.seedTime) : '—'}</span>
          </div>`).join('')}`;
      $('panel-next').appendChild(card);
    }

    S.updatedAt = Date.now();
    $('dh-sub').textContent = S.ageGroup + (S.gender ? ' · ' + (S.gender === 'M' ? 'Boys' : 'Girls') : '');

  } catch (ex) {
    $('panel-next').innerHTML = `<div class="loading" style="color:var(--red)">Error loading entries: ${esc(ex.message)}</div>`;
    console.error(ex);
  }
}

// ── Timers ─────────────────────────────────────────────────────────────────────

export function startTicking() {
  if (S.tickTimer) clearInterval(S.tickTimer);
  S.tickTimer = setInterval(tick, 1000);
}

export function startPolling() {
  if (S.pollTimer) clearInterval(S.pollTimer);
  S.pollTimer = setInterval(refreshData, 30_000);
}

export function stopTimers() {
  if (S.pollTimer) { clearInterval(S.pollTimer); S.pollTimer = null; }
  if (S.tickTimer) { clearInterval(S.tickTimer); S.tickTimer = null; }
}

// ── Screen wake lock ──────────────────────────────────────────────────────────

export async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      S.wakeLock = await navigator.wakeLock.request('screen');
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && S.wakeLock)
          S.wakeLock = await navigator.wakeLock.request('screen').catch(() => null);
      });
    }
  } catch (_) { /* non-fatal */ }
}

export function releaseWakeLock() {
  if (S.wakeLock) { S.wakeLock.release().catch(() => {}); S.wakeLock = null; }
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function _applyTheme(day) {
  document.body.classList.toggle('day', day);
  const label = day ? '🌙 Night' : '☀️ Day';
  ['theme-btn-meets', 'theme-btn-display'].forEach(id => { const el = $(id); if (el) el.textContent = label; });
}

function toggleTheme() {
  const isDay = !document.body.classList.contains('day');
  localStorage.setItem('st_theme', isDay ? 'day' : 'night');
  _applyTheme(isDay);
}

_applyTheme(localStorage.getItem('st_theme') === 'day');

// ── Expose handlers for inline onclick attributes ────────────────────────────

window.doLogout    = doLogout;
window.toggleTheme = toggleTheme;
window.selectMeet  = selectMeet;
window.backToMeets = backToMeets;

// ── Boot ──────────────────────────────────────────────────────────────────────

if (DEMO_MODE) {
  show('view-display');
  loadDemoData();
  renderAll();
  startTicking();
  startDemoAnimation();
  acquireWakeLock();
  const backBtn = $('btn-back');
  if (backBtn) backBtn.style.display = 'none';
} else if (S.token) {
  goToMeetPicker().catch(() => { sessionStorage.clear(); show('view-login'); });
} else {
  show('view-login');
}
