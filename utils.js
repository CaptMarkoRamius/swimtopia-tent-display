// Pure utility functions — no DOM or global-state dependencies.
// Imported by display.html and tested by tests/utils.test.js.

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export const STROKE = {1:'Free', 2:'Back', 3:'Breast', 4:'Fly', 5:'IM'};
export const ORDINAL = ['','1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th'];
export const STANDARD_AGE_GROUPS = [
  {minAge:0,  maxAge:6 },
  {minAge:7,  maxAge:8 },
  {minAge:9,  maxAge:10},
  {minAge:11, maxAge:12},
  {minAge:13, maxAge:14},
  {minAge:15, maxAge:17},
];

export function fmtTime(h) {
  if (h == null) return '—';
  const s = Math.floor(h / 100), c = h % 100;
  const m = Math.floor(s / 60), r = s % 60;
  return m
    ? `${m}:${String(r).padStart(2,'0')}.${String(c).padStart(2,'0')}`
    : `${r}.${String(c).padStart(2,'0')}`;
}

export function fmtClock(d) {
  return d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit', second:'2-digit'});
}

export function fmtCountdown(secs) {
  if (secs <= 0) return '0:00';
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

export function fmtDelta(offTime, seedTime) {
  if (offTime == null || seedTime == null) return null;
  const d = offTime - seedTime;
  return { str: (d < 0 ? '−' : '+') + fmtTime(Math.abs(d)), faster: d < 0 };
}

export function ageInRange(age, grp) {
  if (age == null) return false;
  const s = grp.toLowerCase().replace(/\s/g,'');
  if (s.includes('under') || s.endsWith('u') || s.includes('&u')) return age <= parseInt(s);
  if (s.includes('over') || s.endsWith('+')) return age >= parseInt(s);
  const parts = s.replace(/[/_]/g,'-').split('-').map(Number);
  return parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && age >= parts[0] && age <= parts[1];
}

export function ageGroupOverlaps(minAge, maxAge, grp) {
  if (minAge == null || maxAge == null) return true;
  const s = grp.toLowerCase().replace(/\s/g,'');
  let gMin, gMax;
  if (s.includes('under') || s.endsWith('u') || s.includes('&u')) { gMin = 0; gMax = parseInt(s); }
  else if (s.includes('over') || s.endsWith('+')) { gMin = parseInt(s); gMax = 99; }
  else {
    const parts = s.replace(/[/_]/g,'-').split('-').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) { gMin = parts[0]; gMax = parts[1]; }
    else { gMin = gMax = parseInt(s) || 0; }
  }
  return gMax >= minAge && gMin <= maxAge;
}

export function checkQual(offTime, gender, age, distance, strokeCode, quals) {
  if (!offTime || !quals.length) return [];
  return quals
    .filter(q =>
      (!q.gender || q.gender === gender) &&
      (q.ageMin == null || age >= q.ageMin) &&
      (q.ageMax == null || age <= q.ageMax) &&
      q.distance === distance &&
      q.strokeCode === strokeCode &&
      offTime <= q.cutTime
    )
    .map(q => q.label);
}

export function upcomingGroups(swimmers) {
  const map = {};
  for (const sw of swimmers) {
    for (const ev of sw.events) {
      if (ev.status === 'done') continue;
      if (!map[ev.eventId]) map[ev.eventId] = {
        eventId: ev.eventId, name: ev.name, number: ev.number,
        schedIdx: ev.schedIdx, etaEpoch: ev.etaEpoch, etaDisplay: ev.etaDisplay, entries: [],
      };
      const g = map[ev.eventId];
      if (ev.etaEpoch && (!g.etaEpoch || ev.etaEpoch < g.etaEpoch)) {
        g.etaEpoch = ev.etaEpoch; g.etaDisplay = ev.etaDisplay;
      }
      if (ev.schedIdx < g.schedIdx) g.schedIdx = ev.schedIdx;
      g.entries.push({
        name: sw.name, heatNum: ev.heatNum, laneNum: ev.laneNum,
        seedTime: ev.seedTime, status: ev.status,
        isRelay: ev.isRelay ?? false, relayTeam: ev.relayTeam ?? null,
        legPosition: ev.legPosition ?? null, legStroke: ev.legStroke ?? null,
      });
    }
  }
  const groups = Object.values(map);
  groups.sort((a, b) => (a.etaEpoch ?? a.schedIdx ?? 0) - (b.etaEpoch ?? b.schedIdx ?? 0));
  for (const g of groups) g.entries.sort((a, b) => a.heatNum - b.heatNum || a.laneNum - b.laneNum);
  return groups;
}

export function prevGroups(swimmers) {
  const map = {};
  for (const sw of swimmers) {
    for (const ev of sw.events) {
      if (ev.status !== 'done') continue;
      if (!map[ev.eventId]) map[ev.eventId] = {
        eventId: ev.eventId, name: ev.name, number: ev.number,
        schedIdx: ev.schedIdx, entries: [],
      };
      map[ev.eventId].entries.push({
        name: sw.name, age: sw.age, gender: sw.gender,
        heatNum: ev.heatNum, laneNum: ev.laneNum,
        offTime: ev.offTime, seedTime: ev.seedTime,
        place: ev.place, isDq: ev.isDq ?? false, qualifying: ev.qualifying,
        isRelay: ev.isRelay ?? false, relayTeam: ev.relayTeam ?? null,
        legPosition: ev.legPosition ?? null, legStroke: ev.legStroke ?? null,
        heatPlace: ev.heatPlace ?? null,
      });
    }
  }
  const groups = Object.values(map).sort((a, b) => (b.schedIdx ?? 0) - (a.schedIdx ?? 0));
  for (const g of groups) g.entries.sort((a, b) => (a.place ?? 999) - (b.place ?? 999));
  return groups;
}
