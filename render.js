import { S, $ } from './state.js';
import {
  STROKE, ORDINAL,
  esc, fmtTime, fmtClock, fmtCountdown, fmtDelta,
  upcomingGroups as _upcomingGroups, prevGroups as _prevGroups,
} from './utils.js';

const upcomingGroups = () => _upcomingGroups(S.swimmers);
const prevGroups     = () => _prevGroups(S.swimmers);

// ── Top-level render ──────────────────────────────────────────────────────────

export function renderAll() {
  const now = Math.floor(Date.now() / 1000);
  renderTopBanner();
  renderLineupBanner(now);
  renderPrevPanel();
  renderNextPanel(now);
  $('dh-sub').textContent = S.ageGroup
    + (S.gender ? ' · ' + (S.gender === 'F' ? 'Girls' : 'Boys') : '')
    + (S.teamFilter ? ` · ${S.teamName || S.teamFilter}` : '');
}

// ── Top banner (live event in pool) ──────────────────────────────────────────

export function renderTopBanner() {
  const t = S.tracker;
  $('bt-clock').textContent = fmtClock(new Date());

  if (t?.isLive) {
    const stroke = STROKE[t.currentEventStrokeCode] ?? '';
    const gender = t.currentEventGender === 'F' ? 'Girls' : t.currentEventGender === 'M' ? 'Boys' : '';
    const agePart = (t.currentEventMinAge != null && t.currentEventMaxAge != null)
      ? `${t.currentEventMinAge}-${t.currentEventMaxAge}` : '';
    const parts = [
      t.currentEventNumberDigit ? `Event ${t.currentEventNumberDigit}` : null,
      t.currentHeatNumber ? `Heat ${t.currentHeatNumber}` : null,
      t.currentEventDistance ? `${t.currentEventDistance} ${stroke}`.trim() : null,
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

// ── Lineup banner (countdown to next lineup) ─────────────────────────────────

export function renderLineupBanner(now) {
  const groups = upcomingGroups();
  // Skip groups where all entries are inProgress with no ETA — heat is already in the water
  const next = groups.find(g => g.etaEpoch != null || g.entries.some(e => e.status === 'upcoming')) ?? null;
  const banner = $('banner-lineup');

  if (!next) {
    banner.className = 'normal';
    $('bl-tag').textContent        = 'NEXT FOR YOUR SWIMMERS';
    $('bl-tag').className          = 'bl-tag normal';
    $('bl-event').textContent      = S.swimmers.length ? 'No more events' : '—';
    $('bl-time').textContent       = '';
    $('bl-countdown').textContent  = '—';
    $('bl-countdown').className    = 'normal';
    return;
  }

  const lineupAt     = next.etaEpoch ? next.etaEpoch - S.lineupMin * 60 : null;
  const secsToLineup = lineupAt ? lineupAt - now : null;

  $('bl-event').textContent = `Event ${next.number} · ${next.name}`;
  $('bl-time').textContent  = next.etaEpoch
    ? `Heat est. ${next.etaDisplay}  ·  Lineup ${lineupAt ? new Date(lineupAt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}`
    : '';

  if (secsToLineup !== null && secsToLineup <= 0) {
    banner.className              = 'lineup';
    $('bl-tag').textContent       = '🚨 LINEUP NOW';
    $('bl-tag').className         = 'bl-tag lineup pulse';
    $('bl-countdown').textContent = 'GO!';
    $('bl-countdown').className   = 'lineup pulse';
  } else if (secsToLineup !== null && secsToLineup <= S.warnMin * 60) {
    banner.className              = 'warn';
    $('bl-tag').textContent       = '⚠️ LINEUP SOON';
    $('bl-tag').className         = 'bl-tag warn';
    $('bl-countdown').textContent = fmtCountdown(secsToLineup);
    $('bl-countdown').className   = 'warn';
  } else {
    banner.className              = 'normal';
    $('bl-tag').textContent       = 'NEXT FOR YOUR SWIMMERS';
    $('bl-tag').className         = 'bl-tag normal';
    $('bl-countdown').textContent = secsToLineup !== null ? fmtCountdown(secsToLineup) : '—';
    $('bl-countdown').className   = 'normal';
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
    html += `<div class="prev-event-block">
      <div class="prev-event-name">Event ${esc(g.number)} · ${esc(g.name)}</div>`;

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
    if (!teamMap[key]) teamMap[key] = { relayTeam: e.relayTeam, place: e.place, offTime: e.offTime, legs: [] };
    teamMap[key].legs.push(e);
  }
  for (const [, t] of Object.entries(teamMap).sort()) {
    t.legs.sort((a, b) => (a.legPosition ?? 99) - (b.legPosition ?? 99));
    const placeN   = t.place ?? 0;
    const placeStr = placeN && ORDINAL[placeN] ? ORDINAL[placeN] : '—';
    const badgeCls = placeN === 1 ? 'ps-badge p1' : placeN === 2 ? 'ps-badge p2' : placeN === 3 ? 'ps-badge p3' : 'ps-badge';
    const label    = t.relayTeam ? `Relay ${esc(t.relayTeam)}` : 'Relay';
    html += `<div class="prev-swimmer">
      <div class="${badgeCls}">${placeStr}</div>
      <div class="ps-right">
        <div class="ps-row1">
          <span class="ps-name">${label}</span>
          <span class="ps-time">${t.offTime != null ? fmtTime(t.offTime) : '—'}</span>
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
  const hasPartial = anyHasTime && entries.some(e => e.offTime == null && !e.isDq && !e.isScratched);

  for (const e of entries) {
    const placeN   = e.place ?? 0;
    const placeStr = placeN && ORDINAL[placeN] ? ORDINAL[placeN] : '—';
    const badgeCls = placeN === 1 ? 'ps-badge p1' : placeN === 2 ? 'ps-badge p2' : placeN === 3 ? 'ps-badge p3' : 'ps-badge';
    const timeStr  = e.isDq ? 'DQ' : e.isScratched ? 'SCR' : (e.offTime != null ? fmtTime(e.offTime) : '—');
    const timeCls  = e.isDq ? 'dq' : e.isScratched ? 'scr' : '';
    const delta    = fmtDelta(e.offTime, e.seedTime);
    const heatPlSt = e.heatNum != null
      ? `Heat ${e.heatNum}${e.heatPlace && ORDINAL[e.heatPlace] ? ` · ${ORDINAL[e.heatPlace]}` : ''}`
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

export function renderNextPanel(now) {
  const panel  = $('panel-next');
  const groups = upcomingGroups();

  if (!groups.length) {
    panel.innerHTML = S.swimmers.length
      ? '<div class="panel-empty">All events complete.</div>'
      : `<div class="loading" style="color:var(--yellow)">No swimmers found for ${esc(S.ageGroup)}${S.gender ? ' ' + (S.gender === 'F' ? 'Girls' : 'Boys') : ''}${S.teamFilter ? ' · ' + esc(S.teamFilter) : ''}.</div>`;
    return;
  }

  panel.innerHTML = '<div class="prev-event-title">Upcoming Events</div>';
  for (const g of groups) {
    const lineupAt     = g.etaEpoch ? g.etaEpoch - S.lineupMin * 60 : null;
    const secsToLineup = lineupAt ? lineupAt - now : null;
    const isActive     = g.entries.some(e => e.status === 'inProgress');
    const isLineup     = secsToLineup !== null && secsToLineup <= 0;
    const isWarning    = !isLineup && secsToLineup !== null && secsToLineup <= S.warnMin * 60;

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
        const key = e.relayTeam ?? '';
        if (!teamMap[key]) teamMap[key] = { relayTeam: e.relayTeam, laneNum: e.laneNum, legs: [] };
        teamMap[key].legs.push(e);
      }
      for (const [, t] of Object.entries(teamMap).sort()) {
        t.legs.sort((a, b) => (a.legPosition ?? 99) - (b.legPosition ?? 99));
        const label = t.relayTeam ? `Relay ${esc(t.relayTeam)}` : 'Relay';
        entriesHtml += `<div class="relay-team-header">${label} · Lane ${t.laneNum}</div>`;
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
