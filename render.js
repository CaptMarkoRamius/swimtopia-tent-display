import { S, $ } from './state.js';
import {
  STROKE, ORDINAL,
  esc, fmtTime, fmtClock, fmtCountdown, fmtDelta,
  upcomingGroups as _upcomingGroups, prevGroups as _prevGroups,
} from './utils.js';
import { playWarning, playLineup } from './sounds.js';

const upcomingGroups = () => _upcomingGroups(S.swimmers);
const prevGroups     = () => _prevGroups(S.swimmers);

// Snap lineup time to a whole minute so countdown and the minute-only display stay in sync
const lineupEpoch = etaEpoch => Math.floor((etaEpoch - S.lineupMin * 60) / 60) * 60;

// ── Top-level render ──────────────────────────────────────────────────────────

export function renderAll() {
  const now = Math.floor(Date.now() / 1000);
  const upcoming = upcomingGroups();
  renderTopBanner();
  renderLineupBanner(now, upcoming);
  renderPrevPanel();
  renderNextPanel(now, upcoming);
  $('dh-sub').textContent = (S.ageGroups ?? []).join(', ')
    + (S.gender ? ' · ' + (S.gender === 'F' ? 'Girls' : 'Boys') : '')
    + (S.teamFilter ? ` · ${S.teamName || S.teamFilter}` : '');
}

// ── Top banner (live event in pool) ──────────────────────────────────────────

export function renderTopBanner() {
  const t = S.tracker;
  $('bt-clock').textContent = fmtClock(new Date());

  if (t?.isLive) {
    // Nirvana tracker omits event detail fields — look them up by event number from cached evDetails.
    const evd = t.currentEventNumberDigit && S._evDetails
      ? Object.values(S._evDetails).find(e => String(e.number) === String(t.currentEventNumberDigit)) ?? null
      : null;
    const dist   = t.currentEventDistance   ?? evd?.distance   ?? null;
    const scode  = t.currentEventStrokeCode ?? evd?.strokeCode ?? null;
    const gcode  = t.currentEventGender     ?? evd?.gender     ?? null;
    const minAge = t.currentEventMinAge     ?? evd?.minAge     ?? null;
    const maxAge = t.currentEventMaxAge     ?? evd?.maxAge     ?? null;
    const stroke = STROKE[scode] ?? '';
    const gender = gcode === 'F' ? 'Girls' : gcode === 'M' ? 'Boys' : '';
    const agePart = (minAge != null && maxAge != null) ? `${minAge}-${maxAge}` : '';
    const parts = [
      t.currentEventNumberDigit ? `Event ${t.currentEventNumberDigit}` : null,
      t.currentHeatNumber ? `Heat ${t.currentHeatNumber}` : null,
      dist ? `${dist} ${stroke}`.trim() : null,
      (agePart || gender) ? `${agePart} ${gender}`.trim() : null,
    ].filter(Boolean);
    $('bt-tag').textContent   = 'NOW IN POOL';
    $('bt-tag').className     = 'bt-tag live';
    $('bt-event').textContent = parts.join(' · ') || 'Live event';
    $('banner-top').classList.add('is-live');
  } else {
    $('bt-tag').textContent   = 'WAITING';
    $('bt-tag').className     = 'bt-tag';
    $('bt-event').textContent = 'No live event';
    $('banner-top').classList.remove('is-live');
  }
}

// ── Lineup banner (stackable, ephemeral) ─────────────────────────────────────

let _bannerStateKey = null;
const _soundedKeys = new Set();
export function resetBannerState() { _soundedKeys.clear(); _bannerStateKey = null; }

export function renderLineupBanner(now, prebuiltGroups = null) {
  // Exclude events where all entries are already in the water — advance past them
  const candidates = (prebuiltGroups ?? upcomingGroups()).filter(g => g.entries.some(e => e.status === 'upcoming'));

  // Only show events within the warn/lineup window (ephemeral — hide banner otherwise)
  // warnMin and lineupMin are both measured from etaEpoch, not compounded.
  const qualifying = candidates.filter(g => {
    if (!g.etaEpoch) return false;
    return (g.etaEpoch - now) <= S.warnMin * 60;
  });

  const container = $('banner-lineup');

  if (qualifying.length === 0) {
    if (!container.classList.contains('hidden')) {
      container.innerHTML = '';
      container.classList.add('hidden');
      _bannerStateKey = null;
    }
    return;
  }

  container.classList.remove('hidden');

  // State key encodes event identity + warn vs lineup state — only rebuild DOM on change
  const stateKey = qualifying.map(g => {
    const secs = lineupEpoch(g.etaEpoch) - now;
    return `${g.eventId}:${secs <= 0 ? 'L' : 'W'}`;
  }).join(',');

  if (stateKey !== _bannerStateKey) {
    _bannerStateKey = stateKey;

    // Fire sounds once per event per state transition (W→warning, L→lineup/GO)
    let playedLineup = false, playedWarning = false;
    for (const seg of stateKey.split(',')) {
      if (_soundedKeys.has(seg)) continue;
      _soundedKeys.add(seg);
      if (seg.endsWith(':L')) playedLineup = true;
      else if (seg.endsWith(':W')) playedWarning = true;
    }
    if (playedLineup) playLineup();
    else if (playedWarning) playWarning();

    container.innerHTML = qualifying.map(g => {
      const lineupAt     = lineupEpoch(g.etaEpoch);
      const secs         = lineupAt - now;
      const isLineup     = secs <= 0;
      const timeStr      = `Heat est. ${esc(g.etaDisplay)}  ·  Lineup ${new Date(lineupAt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      return `<div class="bl-row ${isLineup ? 'lineup' : 'warn'}" data-eid="${g.eventId}">
        <div class="bl-left">
          <div class="bl-tag ${isLineup ? 'lineup pulse' : 'warn'}">${isLineup ? '🚨 LINEUP NOW' : '⚠️ LINEUP SOON'}</div>
          <div class="bl-event">${esc(`Event ${g.number} · ${g.name}`)}</div>
          <div class="bl-time">${timeStr}</div>
        </div>
        <div class="bl-countdown ${isLineup ? 'lineup pulse' : 'warn'}">${isLineup ? 'GO!' : esc(fmtCountdown(secs))}</div>
      </div>`;
    }).join('');
  } else {
    // Only update countdown text — preserves pulse animation continuity
    for (const g of qualifying) {
      const secs = lineupEpoch(g.etaEpoch) - now;
      if (secs > 0) {
        const row = container.querySelector(`[data-eid="${g.eventId}"]`);
        if (row) row.querySelector('.bl-countdown').textContent = fmtCountdown(secs);
      }
    }
  }
}

// ── Previous events panel ────────────────────────────────────────────────────

export function renderPrevPanel() {
  const panel  = $('panel-prev');
  const groups = prevGroups();
  if (!groups.length) { panel.innerHTML = ''; return; }

  let html = '<div class="prev-event-title">Previous Events</div>';

  for (const g of groups) {
    const isRelayEvent = g.entries.some(e => e.isRelay);
    const cuts = !isRelayEvent && g.distance && g.strokeCode
      ? S.quals.filter(q =>
          q.distance === g.distance && q.strokeCode === g.strokeCode &&
          g.entries.some(e => (!q.gender || q.gender === e.gender) &&
            (q.ageMin == null || e.age >= q.ageMin) &&
            (q.ageMax == null || e.age <= q.ageMax))
        )
      : [];
    const cutLine = cuts.length
      ? cuts.map(q => `<span class="event-cut">${esc(q.label)}: ${fmtTime(q.cutTime)}</span>`).join('')
      : '';
    html += `<div class="prev-event-block">
      <div class="prev-event-name">Event ${esc(g.number)} · ${esc(g.name)}${cutLine ? `<span class="event-cuts">${cutLine}</span>` : ''}</div>`;

    if (isRelayEvent) {
      html += _renderRelayResultBlock(g.entries);
    } else {
      html += _renderIndividualResults(g.entries);
    }
    html += '</div>';
  }
  panel.innerHTML = html;
}

function _renderRelayResultBlock(entries) {
  let html = '';
  const teamMap = {};
  for (const e of entries) {
    const key = e.relayTeam ?? '';
    if (!teamMap[key]) teamMap[key] = {
      relayTeam: e.relayTeam, place: e.place, offTime: e.offTime,
      isDq: e.isDq, isScratched: e.isScratched, legs: [],
    };
    teamMap[key].legs.push(e);
  }
  for (const [, t] of Object.entries(teamMap).sort()) {
    t.legs.sort((a, b) => (a.legPosition ?? 99) - (b.legPosition ?? 99));
    const placeN   = t.place ?? 0;
    const placeStr = placeN && ORDINAL[placeN] ? ORDINAL[placeN] : '—';
    const badgeCls = placeN === 1 ? 'ps-badge p1' : placeN === 2 ? 'ps-badge p2' : placeN === 3 ? 'ps-badge p3' : 'ps-badge';
    const label    = t.relayTeam ? `Relay ${esc(t.relayTeam)}` : 'Relay';
    const timeStr  = t.isDq ? 'DQ' : t.isScratched ? 'SCR' : (t.offTime != null ? fmtTime(t.offTime) : '—');
    const timeCls  = t.isDq ? 'dq' : t.isScratched ? 'scr' : '';
    html += `<div class="prev-swimmer">
      <div class="${badgeCls}">${placeStr}</div>
      <div class="ps-right">
        <div class="ps-row1">
          <span class="ps-name">${label}</span>
          <span class="ps-time ${timeCls}">${timeStr}</span>
        </div>
      </div>
    </div>`;
    for (const leg of t.legs) {
      const strokeBit = leg.legStroke ? `<span class="relay-leg-stroke">${esc(STROKE[leg.legStroke] ?? '')}</span>` : '';
      html += `<div class="prev-relay-leg">
        <span class="relay-leg-num">${leg.legPosition ?? ''}.</span>
        ${strokeBit}
        <span>${esc(leg.name)}</span>
      </div>`;
    }
  }
  return html;
}

function _renderIndividualResults(entries) {
  let html = '';
  const anyHasTime = entries.some(e => e.offTime != null);
  const hasPartial = anyHasTime && entries.some(e => e.offTime == null && !e.isDq && !e.isScratched && !e.isInvalid);

  for (const e of entries) {
    const placeN   = e.place ?? 0;
    const placeStr = placeN && ORDINAL[placeN] ? ORDINAL[placeN] : '—';
    const badgeCls = placeN === 1 ? 'ps-badge p1' : placeN === 2 ? 'ps-badge p2' : placeN === 3 ? 'ps-badge p3' : 'ps-badge';
    const timeStr  = e.isDq ? 'DQ' : e.isScratched ? 'SCR' : (e.offTime != null ? fmtTime(e.offTime) : '—');
    const timeCls  = e.isDq ? 'dq' : e.isScratched ? 'scr' : '';
    const delta    = fmtDelta(e.offTime, e.seedTime);
    const heatPlSt = e.heatNum != null
      ? `Heat ${e.heatNum}${e.heatPlace && ORDINAL[e.heatPlace] ? ` · ${ORDINAL[e.heatPlace]} in heat` : ''}`
      : '';
    html += `<div class="prev-swimmer">
      <div class="${badgeCls}">${placeStr}</div>
      <div class="ps-right">
        <div class="ps-row1">
          <span class="ps-name">${esc(e.name)}</span>
          <span class="ps-time ${timeCls}">${timeStr}${delta ? ` <span class="ps-delta ${delta.faster ? 'fast' : 'slow'}">(${delta.str})</span>` : ''}</span>
        </div>
        <div class="ps-row2">
          ${heatPlSt ? `<span class="ps-heat">${heatPlSt}</span>` : ''}
          ${(e.qualifying || []).map(q => `<span class="ps-qual">${esc(q)}</span>`).join('')}
        </div>
      </div>
    </div>`;
  }
  if (hasPartial) html += `<div class="scoring-note">Scoring in progress…</div>`;
  return html;
}

// ── Upcoming events panel ────────────────────────────────────────────────────

export function renderNextPanel(now, prebuiltGroups = null) {
  const panel  = $('panel-next');
  const groups = prebuiltGroups ?? upcomingGroups();

  if (!groups.length) {
    panel.innerHTML = S.swimmers.length
      ? '<div class="panel-empty">All events complete.</div>'
      : `<div class="loading" style="color:var(--yellow)">No swimmers found for ${esc((S.ageGroups ?? []).join(', '))}${S.gender ? ' ' + (S.gender === 'F' ? 'Girls' : 'Boys') : ''}${S.teamFilter ? ' · ' + esc(S.teamFilter) : ''}.</div>`;
    return;
  }

  panel.innerHTML = '<div class="prev-event-title">Upcoming Events</div>';
  for (const g of groups) {
    const lineupAt     = g.etaEpoch ? lineupEpoch(g.etaEpoch) : null;
    const secsToLineup = lineupAt ? lineupAt - now : null;
    const isActive     = g.entries.some(e => e.status === 'inProgress');
    const isLineup     = secsToLineup !== null && secsToLineup <= 0;
    const secsToEvent  = g.etaEpoch ? g.etaEpoch - now : null;
    const isWarning    = !isLineup && secsToEvent !== null && secsToEvent <= S.warnMin * 60;

    const cardCls = ['next-event-card',
      isActive ? 'is-active' : isLineup ? 'is-lineup' : isWarning ? 'is-warning' : '',
    ].filter(Boolean).join(' ');

    const lineupTimeStr = lineupAt
      ? new Date(lineupAt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : '—';
    const etaStr = g.etaEpoch
      ? `Est. <span class="eta-val">${esc(g.etaDisplay)}</span>&ensp;·&ensp;Lineup <span class="eta-val">${esc(lineupTimeStr)}</span>`
      : '';

    const isRelayEvent = g.entries.some(e => e.isRelay);
    let entriesHtml = '';

    if (isRelayEvent) {
      const teamMap = {};
      for (const e of g.entries) {
        const key = `${e.heatNum ?? 0}-${e.relayTeam ?? ''}`;
        if (!teamMap[key]) teamMap[key] = { heatNum: e.heatNum, relayTeam: e.relayTeam, laneNum: e.laneNum, legs: [] };
        teamMap[key].legs.push(e);
      }
      const teams = Object.values(teamMap).sort((a, b) =>
        (a.heatNum ?? 0) - (b.heatNum ?? 0) || (a.relayTeam ?? '').localeCompare(b.relayTeam ?? '')
      );
      for (const t of teams) {
        t.legs.sort((a, b) => (a.legPosition ?? 99) - (b.legPosition ?? 99));
        const label   = t.relayTeam ? `Relay ${esc(t.relayTeam)}` : 'Relay';
        const heatBit = t.heatNum != null ? `Heat ${t.heatNum} · ` : '';
        entriesHtml += `<div class="relay-team-header">${heatBit}${label} · Lane ${t.laneNum}</div>`;
        for (const leg of t.legs) {
          const inWater   = leg.status === 'inProgress' ? `<span class="in-water pulse">In water</span>` : '';
          const strokeBit = leg.legStroke ? `<span class="relay-leg-stroke">${esc(STROKE[leg.legStroke] ?? '')}</span>` : '';
          entriesHtml += `<div class="next-swimmer-row relay-leg-row">
            <span class="relay-leg-num">${leg.legPosition ?? ''}.</span>
            ${strokeBit}
            <span class="next-sw-name">${esc(leg.name)}</span>
            ${inWater}
          </div>`;
        }
      }
    } else {
      for (const e of g.entries) {
        const statusBit = e.status === 'inProgress' ? `<span class="in-water pulse">In water</span>` : '';
        entriesHtml += `<div class="next-swimmer-row">
          <span class="next-sw-name">${esc(e.name)}</span>
          <span class="next-sw-hl">Heat ${e.heatNum} · Lane ${e.laneNum}</span>
          ${statusBit}
        </div>`;
      }
    }

    const card = document.createElement('div');
    card.className = cardCls;
    card.innerHTML = `
      <div class="next-card-header">
        <div class="next-event-title">Event ${esc(g.number)} · ${esc(g.name)}</div>
        ${etaStr ? `<div class="next-event-time">${etaStr}</div>` : ''}
      </div>
      ${entriesHtml}`;
    panel.appendChild(card);
  }
}

// ── Tick (called every second) ────────────────────────────────────────────────

export function tick() {
  const now = Math.floor(Date.now() / 1000);
  $('bt-clock').textContent = fmtClock(new Date());
  renderLineupBanner(now);
}
