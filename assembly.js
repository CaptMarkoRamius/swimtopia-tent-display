// Transforms raw nirvana API responses into the S.swimmers and S.quals shapes.
// No DOM access, no S mutations — returns data, caller applies it.

import { STROKE, ageInRange, ageGroupOverlaps, checkQual } from './utils.js';

// ── Qualifying cuts ───────────────────────────────────────────────────────────

export function assembleQuals(stdIncluded) {
  const quals = [];
  const idx = {};
  for (const o of stdIncluded) idx[`${o.type}:${o.id}`] = o;
  const stdLabel = stdIncluded.find(o => o.type === 'timeStandard')?.attributes?.label ?? 'INV';

  for (const o of stdIncluded) {
    if (o.type !== 'timeStandardCut') continue;
    const a     = o.attributes;
    const tseId = o.relationships?.timeStandardEvent?.data?.id;
    const tse   = idx[`timeStandardEvent:${tseId}`];
    if (!tse) continue;
    const tea = tse.attributes;
    if (!tea?.distance || !tea?.strokeCode) continue;
    quals.push({
      label: stdLabel, cutTime: a.cutTimeInt,
      gender: tea.athleteGender,
      ageMin: tea.athleteMinAge, ageMax: tea.athleteMaxAge,
      distance: tea.distance, strokeCode: tea.strokeCode,
    });
  }
  return quals;
}

// ── Swimmer assembly ──────────────────────────────────────────────────────────

export function assembleSwimmers(
  heatsData, rawEntries, rawResults, relayLegMap,
  athletes, eventsData, stdIncluded,
  targetTeamId, ageGroups, gender
) {
  const quals = assembleQuals(stdIncluded);

  // Build event detail index
  const evDetails = {};
  for (const ev of eventsData) {
    const a = ev.attributes;
    const isRelay = a.eventType === 'relay';
    evDetails[ev.id] = {
      name:       isRelay ? `${a.distance} Relay` : `${a.distance} ${STROKE[a.strokeCode] ?? ''}`.trim(),
      number:     a.eventNumber ?? '',
      distance:   a.distance,
      strokeCode: a.strokeCode,
      minAge:     a.minAge,
      maxAge:     a.maxAge,
      gender:     a.gender,
      isRelay,
    };
  }

  const swimmerMap = {};

  const getOrCreateSwimmer = (key, ath) => {
    if (!swimmerMap[key]) {
      swimmerMap[key] = {
        name:     [ath.preferredFirstName || ath.firstName, ath.lastName].filter(Boolean).join(' '),
        lastName: ath.lastName ?? '',
        age:      ath.competitionAge,
        gender:   ath.gender,
        events:   [],
      };
    }
    return swimmerMap[key];
  };

  for (const heat of heatsData) {
    const ha  = heat.attributes;
    const eid = heat.relationships?.nirvanaEvent?.data?.id;
    const evd = evDetails[eid] ?? {};

    let etaEpoch = null, etaDisplay = '—';
    if (ha.adjustedEstimatedStartAt) {
      const dt = new Date(ha.adjustedEstimatedStartAt);
      etaEpoch   = Math.floor(dt.getTime() / 1000);
      etaDisplay = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    const entryIds = (heat.relationships?.nirvanaEntries?.data || []).map(e => e.id);

    for (const entryId of entryIds) {
      const entry = rawEntries[entryId];
      if (!entry) continue;
      const ea  = entry.attributes;
      const aid = entry.relationships?.nirvanaAthlete?.data?.id;

      // ── Individual entry ─────────────────────────────────────────────────
      if (aid) {
        const ath = athletes[aid];
        if (!ath) continue;
        if (targetTeamId && ath._teamId !== targetTeamId) continue;
        if (!ageInRange(ath.competitionAge, ageGroups)) continue;
        if (gender && ath.gender !== gender) continue;

        const ra      = rawResults[entry.relationships?.nirvanaResult?.data?.id]?.attributes ?? {};
        const offTime = ra.officialTimeInt ?? null;
        const status  = _heatStatus(ha, offTime, ra);

        const isScratched = ha.status === 'done' && offTime == null && !(ra.isDq ?? false) && ra.invalidCode == null;
        const evt = {
          eventId: eid,   name: evd.name ?? 'Event', number: evd.number ?? '',
          heatNum: ha.number, laneNum: ea.laneNumber, status,
          schedIdx: ha.scheduleIndex ?? 0, etaEpoch, etaDisplay,
          offTime, seedTime: ea.seedTimeInt ?? null,
          place: ra.overallPlace ?? null, heatPlace: ra.heatPlace ?? null,
          isDq: ra.isDq ?? false, isInvalid: ra.invalidCode != null, isScratched,
          qualifying: checkQual(offTime, ath.gender, ath.competitionAge, evd.distance, evd.strokeCode, quals),
          isRelay: false,
        };
        getOrCreateSwimmer(aid, ath).events.push(evt);
        continue;
      }

      // ── Relay entry ──────────────────────────────────────────────────────
      const entryTeamId = entry.relationships?.nirvanaTeam?.data?.id;
      if (!entryTeamId) continue;
      if (targetTeamId && entryTeamId !== targetTeamId) continue;
      if (gender && evd.gender && evd.gender !== gender) continue;
      if (!ageGroupOverlaps(evd.minAge, evd.maxAge, ageGroups)) continue;

      const ra         = rawResults[entry.relationships?.nirvanaResult?.data?.id]?.attributes ?? {};
      const offTime    = ra.officialTimeInt ?? null;
      const status     = _heatStatus(ha, offTime, ra);
      const relayTeam  = ea.relayTeam ?? 'A';
      const legs       = (relayLegMap[entryId] || []).sort((a, b) => a.position - b.position);

      // Derive relay type from leg strokes
      const legStrokes = [...new Set(legs.map(l => l.strokeCode).filter(Boolean))];
      const relayType  = legStrokes.length > 1 ? 'Medley' : (STROKE[legStrokes[0]] ?? 'Free');
      const relayName  = `${evd.distance} ${relayType} Relay`;

      // One event entry per leg swimmer (matches demo data shape)
      for (const leg of legs) {
        const ath = athletes[leg.athleteId];
        if (!ath) continue;
        if (!ageInRange(ath.competitionAge, ageGroups)) continue;

        getOrCreateSwimmer(leg.athleteId, ath).events.push({
          eventId: eid,   name: relayName, number: evd.number ?? '',
          heatNum: ha.number, laneNum: ea.laneNumber, status,
          schedIdx: ha.scheduleIndex ?? 0, etaEpoch, etaDisplay,
          offTime, seedTime: null,
          place: ra.overallPlace ?? null, heatPlace: null,
          isDq: ra.isDq ?? false, isInvalid: ra.invalidCode != null,
          qualifying: [], isRelay: true,
          relayTeam, legPosition: leg.position, legStroke: leg.strokeCode,
        });
      }
    }
  }

  const assembled = Object.values(swimmerMap);
  for (const sw of assembled) sw.events.sort((a, b) => a.schedIdx - b.schedIdx);
  assembled.sort((a, b) => a.lastName.localeCompare(b.lastName));

  return { assembled, quals };
}

function _heatStatus(heatAttrs, offTime, resultAttrs) {
  const isDone = heatAttrs.status === 'done' || (offTime != null && resultAttrs.invalidCode == null);
  return isDone ? 'done' : heatAttrs.status === 'inProgress' ? 'inProgress' : 'upcoming';
}
