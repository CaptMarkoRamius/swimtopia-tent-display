// Application orchestration — auth flow, meet picker, data refresh, timers, themes.
// This is the entry point loaded by index.html.

import { S, $, show, DEMO_MODE, TODAY } from './state.js';
import {
  api, paginate, login, onSessionExpired,
  fetchOrg, fetchCalendarEvents, fetchMeetDetails,
  fetchNirvanaTeams, fetchNirvanaEvents, fetchNirvanaHeats,
  fetchTimeStandards, fetchFallbackStandards, fetchHeatTracker, fetchAthletes,
  fetchMeetWithEvents, fetchSwimEntries,
} from './api.js';
import { assembleSwimmers, assembleQuals, buildEvDetails } from './assembly.js';
import { renderAll, renderTopBanner, renderLineupBanner, renderNextPanel, tick, resetBannerState } from './render.js';
import { loadDemoData, startDemoAnimation } from './demo.js';
import { STROKE, STANDARD_AGE_GROUPS, esc, ageInRange, fmtTime } from './utils.js';
import { unlockAudio } from './sounds.js';

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
      if (ua && !ub) return -1; if (!ua && ub) return 1;
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
    div.onclick = () => loadTeamsForMeet(m.id, a.name, a.startDate ?? '', div);
    list.appendChild(div);
  }
}

export async function loadTeamsForMeet(meetId, meetName, meetDate, cardEl) {
  const teamSel  = $('inp-team'), pillsEl = $('inp-age-pills'), goBtn = $('go-btn');
  teamSel.disabled = goBtn.disabled = true;
  teamSel.innerHTML = '<option value="">Loading…</option>';
  pillsEl.classList.add('disabled');
  pillsEl.innerHTML = '<span class="age-pills-placeholder">Loading…</span>';
  document.querySelectorAll('.meet-card').forEach(c => c.style.outline = '');
  if (cardEl) cardEl.style.outline = '2px solid var(--blue)';

  const populateTeams = teams => {
    const sorted = [...teams].sort((a, b) =>
      (a.attributes?.abbreviation ?? '').localeCompare(b.attributes?.abbreviation ?? ''));
    teamSel.innerHTML = '<option value="">All teams</option>' + sorted.map(t => {
      const abbr = t.attributes?.abbreviation ?? '';
      return `<option value="${esc(abbr)}"${abbr === 'HUR' ? ' selected' : ''}>${esc(abbr)} — ${esc(t.attributes?.name ?? abbr)}</option>`;
    }).join('');
    teamSel.disabled = false;
  };

  const populateAgeGroups = groups => {
    let saved = ['9-10'];
    try {
      const raw = sessionStorage.getItem('st_age');
      if (raw) { const p = JSON.parse(raw); saved = Array.isArray(p) ? p : [p]; }
    } catch { /* keep default */ }

    pillsEl.innerHTML = groups.map(({ minAge, maxAge }) => {
      const lo = parseInt(minAge, 10), hi = parseInt(maxAge, 10);
      if (isNaN(lo) || isNaN(hi)) return '';
      const label = lo === 0 ? `${hi} & Under` : hi > 17 ? `${lo} & Over` : `${lo}-${hi}`;
      const value = `${lo}-${hi}`;
      return `<label class="age-pill"><input type="checkbox" value="${value}"${saved.includes(value) ? ' checked' : ''}><span>${label}</span></label>`;
    }).join('');
    if (!pillsEl.querySelector('input:checked') && pillsEl.querySelector('input'))
      pillsEl.querySelector('input').checked = true;
    pillsEl.classList.remove('disabled');
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
    goBtn.dataset.meetId = meetId; goBtn.dataset.meetName = meetName; goBtn.dataset.meetDate = meetDate;
    goBtn.disabled = false;
  } catch (ex) {
    teamSel.innerHTML = '<option value="">Error loading</option>';
    pillsEl.innerHTML = '<span class="age-pills-placeholder" style="color:var(--red)">Error loading</span>';
    teamSel.disabled = false; pillsEl.classList.remove('disabled');
    console.error(ex);
  }
}

export async function selectMeet(meetId, meetName) {
  S.meetId     = meetId;
  S.meetDate   = $('go-btn').dataset.meetDate || null;
  resetBannerState();
  S.nirvanaId        = null;
  S._staticNirvanaId = null;
  S._eventsRes       = null;
  S._evDetails       = null;
  S._teamsRes        = null;
  S._stdRes          = null;
  S._athletes        = {};
  S._hasInProgress   = false;
  S.swimmers         = [];
  S.quals            = [];
  S.tracker          = null;
  S.ageGroups  = [...document.querySelectorAll('#inp-age-pills input:checked')].map(cb => cb.value);
  if (!S.ageGroups.length) S.ageGroups = ['9-10'];
  S.gender     = $('inp-gender').value;
  S.lineupMin  = parseInt($('inp-lineup').value, 10)  || 20;
  S.warnMin    = parseInt($('inp-warning').value, 10) || 30;
  sessionStorage.setItem('st_age', JSON.stringify(S.ageGroups));

  const teamSel = $('inp-team');
  S.teamFilter = teamSel.value.toUpperCase();
  const selOpt  = teamSel.options[teamSel.selectedIndex];
  const optParts = selOpt?.text?.split(' — ') ?? [];
  S.teamName = S.teamFilter && optParts.length > 1 ? optParts.slice(1).join(' — ') : '';

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
    if (!S.nirvanaId) {
      const meetResp = await fetchMeetDetails(S.meetId);
      S.nirvanaId = meetResp.data.relationships?.nirvanaMeet?.data?.id ?? null;
      $('dh-meet').textContent = meetResp.data.attributes?.name || S.meetId;
    }

    if (!S.nirvanaId) { await _loadSwimEntries(); return; }

    // Static data (events, teams, standards) only changes between meets — cache it.
    if (S._staticNirvanaId !== S.nirvanaId) {
      const [eventsRes, teamsRes, stdRes0] = await Promise.all([
        fetchNirvanaEvents(S.nirvanaId),
        fetchNirvanaTeams(S.nirvanaId),
        fetchTimeStandards(S.meetId),
      ]);
      const stdRes = (stdRes0.included || []).length
        ? stdRes0
        : await fetchFallbackStandards(S.orgId, S.meetId, S.meetDate);
      S._staticNirvanaId = S.nirvanaId;
      S._eventsRes = eventsRes;
      S._evDetails = buildEvDetails(eventsRes.data);
      S._teamsRes  = teamsRes;
      S._stdRes    = stdRes;
    }

    // Fetch tracker first (single cheap request) to decide if heats need re-fetching.
    const trackerRes = await fetchHeatTracker(S.meetId);
    const newTracker = trackerRes.data?.[0]?.attributes ?? null;
    const trackerChanged = !S.tracker ||
      newTracker?.currentHeatNumber       !== S.tracker?.currentHeatNumber ||
      newTracker?.currentEventNumberDigit !== S.tracker?.currentEventNumberDigit;

    // Skip heats when tracker is stable and no heat was in-progress last poll.
    if (!trackerChanged && !S._hasInProgress) return;

    const heatsRes = await fetchNirvanaHeats(S.nirvanaId);

    const { _eventsRes: eventsRes, _teamsRes: teamsRes, _stdRes: stdRes } = S;

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

    // Only fetch athletes not already cached for this meet.
    const newIds = [...athleteIds].filter(id => !S._athletes[id]);
    if (newIds.length) {
      const chunks = [];
      for (let i = 0; i < newIds.length; i += 100) chunks.push(newIds.slice(i, i + 100));
      const resps = await Promise.all(chunks.map(chunk => fetchAthletes(S.nirvanaId, chunk)));
      for (const resp of resps)
        for (const a of (resp.data || []))
          S._athletes[a.id] = { ...a.attributes, _teamId: a.relationships?.nirvanaTeam?.data?.id ?? null };
    }

    const { assembled, quals } = assembleSwimmers(
      heatsRes.data, rawEntries, rawResults, relayLegMap,
      S._athletes, eventsRes.data, stdRes.included || [],
      targetTeamId, S.ageGroups, S.gender,
      S._evDetails
    );

    S.swimmers       = assembled;
    S.quals          = quals;
    S.tracker        = newTracker;
    S._hasInProgress = heatsRes.data.some(h => h.attributes?.status === 'inProgress');
    S.updatedAt      = Date.now();

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
      if (!ageInRange(age, S.ageGroups)) continue;
      if (S.gender && ath.gender !== S.gender) continue;
      (byEvent[entry.relationships.swimEvent.data.id] ??= { evd, entries: [] }).entries.push({
        name:     [ath.preferredName || ath.firstName, ath.lastName].filter(Boolean).join(' '),
        seedTime: entry.attributes.seedTimeInt,
      });
    }

    const groups = Object.values(byEvent).sort((a, b) => parseInt(a.evd.number || 0) - parseInt(b.evd.number || 0));
    if (!groups.length) {
      $('panel-next').innerHTML = `<div class="panel-empty">No entries found for ${esc(S.ageGroups.join(', '))}${S.gender ? ' ' + (S.gender === 'M' ? 'Boys' : 'Girls') : ''}.</div>`;
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
    $('dh-sub').textContent = S.ageGroups.join(', ')
      + (S.gender ? ' · ' + (S.gender === 'M' ? 'Boys' : 'Girls') : '')
      + (S.teamFilter ? ` · ${S.teamName || S.teamFilter}` : '');

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
  if (!('wakeLock' in navigator)) return;
  try {
    S.wakeLock = await navigator.wakeLock.request('screen');
    S.wakeLock.addEventListener('release', () => { S.wakeLock = null; });
  } catch (_) { /* non-fatal */ }
}

// Re-acquire after the tab returns from background (browser always releases on hide)
if ('wakeLock' in navigator) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') acquireWakeLock();
  });
}

export function releaseWakeLock() {
  if (S.wakeLock) { S.wakeLock.release().catch(() => {}); S.wakeLock = null; }
}

// ── Font size ─────────────────────────────────────────────────────────────────

let _fontPct = parseInt(localStorage.getItem('st_font') || '100', 10);

function _applyFontSize() {
  document.documentElement.style.fontSize = _fontPct + '%';
}

export function adjustFontSize(dir) {
  _fontPct = Math.max(70, Math.min(150, _fontPct + dir * 10));
  localStorage.setItem('st_font', _fontPct);
  _applyFontSize();
}

_applyFontSize();

document.addEventListener('click', unlockAudio, { once: true });

// ── Fullscreen ────────────────────────────────────────────────────────────────

export function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

document.addEventListener('fullscreenchange', () => {
  const btn = $('fullscreen-btn');
  if (btn) btn.textContent = document.fullscreenElement ? '⊠' : '⛶';
});

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

window.doLogout       = doLogout;
window.toggleTheme    = toggleTheme;
window.selectMeet     = selectMeet;
window.backToMeets    = backToMeets;
window.adjustFontSize = adjustFontSize;
window.toggleFullscreen = toggleFullscreen;

// ── Boot ──────────────────────────────────────────────────────────────────────

$('inp-age-pills').addEventListener('change', () => {
  const goBtn = $('go-btn');
  if (goBtn.dataset.meetId) goBtn.disabled = !$('inp-age-pills').querySelector('input:checked');
});

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
