# SwimTopia Tent Display — Project Briefing

This file is read automatically by Claude Code at the start of every session.
It also serves as API reference documentation for contributors.

## What this project is

A live swim meet tent display. Shows swimmers in a specific age group their
upcoming events with heat/lane assignments and countdown to lineup time, then
moves completed heats to a results column as they finish.

**Pure static web app** — no backend, no build step, no framework.
Fork the repo, enable GitHub Pages, share the URL. Done.

## Architecture

```
Parent's browser (any device)
        ↓
index.html — login → meet picker → tent display
        ↓  (Bearer token in sessionStorage only)
mobile-api.swimtopia.com — CORS fully open (access-control-allow-origin: *)
        ↓
Polls every 30s for live heat updates
```

## File structure

| File | Purpose |
|------|---------|
| `index.html` | HTML markup + all CSS |
| `app.js` | Entry point — auth flow, meet picker, data refresh, timers, theme |
| `api.js` | Pure network layer — fetch wrapper, token refresh, SwimTopia fetchers |
| `assembly.js` | Transform raw nirvana API responses → `S.swimmers` shape |
| `render.js` | All DOM rendering (top banner, lineup banner, prev/next panels) |
| `demo.js` | Demo fixture data + 8-second heat-completion animation |
| `state.js` | Shared mutable state `S`, DOM helper `$`, constants |
| `utils.js` | Pure utilities — `esc`, `fmtTime`, `ageInRange`, group builders |
| `tests/utils.test.js` | 68 JS unit tests (vitest) |

## Development commands

```bash
npm install           # install vitest + serve
npm test              # run unit tests
npm run serve         # dev server at http://localhost:8080
npm run demo          # dev server — visit http://localhost:8080/?demo
```

## State shape (S object in state.js)

```js
S = {
  token, orgId,               // auth — sessionStorage backed
  meetId, nirvanaId,          // current meet
  ageGroup, gender, teamFilter, lineupMin, warnMin,  // filter settings
  swimmers,   // [{name, lastName, age, gender, events:[…]}]
  quals,      // [{label, cutTime, gender, ageMin, ageMax, distance, strokeCode}]
  tracker,    // swimEventHeatTracker attributes (live scoreboard)
  updatedAt, pollTimer, tickTimer, wakeLock,
}
```

### Swimmer event shape

```js
{
  eventId, name, number, schedIdx,
  heatNum, laneNum, status,        // 'done' | 'inProgress' | 'upcoming'
  etaEpoch, etaDisplay,
  offTime, seedTime,               // hundredths of seconds (null if not done)
  place, heatPlace,
  isDq, isInvalid, qualifying,     // ['INV', ...]
  isRelay,                         // false for individual events
  relayTeam, legPosition, legStroke,  // relay fields (isRelay=true only)
}
```

## The API

Base URL: `https://mobile-api.swimtopia.com/mobile`

All responses: JSON:API format `{data:[{id,type,attributes{},relationships{}}], included:[], meta:{}}`

### Auth
```
POST https://mobile-api.swimtopia.com/oauth/token
Content-Type: application/x-www-form-urlencoded
body: grant_type=password&username={email}&password={password}
response: {access_token, token_type:"Bearer", expires_in:86400, refresh_token, created_at}

Token refresh:
POST /oauth/token
body: grant_type=refresh_token&refresh_token={token}
```
Token lifetime: 24h. App refreshes automatically on 401 before prompting re-login.

### Meet discovery (auto — no manual IDs needed)
```
Step 1: GET /organizations
  → data[0].id  (org_id)

Step 2: GET /organizations/{org_id}/calendar-events?filter[after]={date}
  → data[] where attributes.stiType == "SwimMeet"
  → data[].id IS the swim_meet_id

Step 3: GET /swim-meets/{swim_meet_id}?include=nirvanaMeet,swimTeams
  → relationships.nirvanaMeet.data.id  ← nirvana_meet_id (null if pre-Meet-Maestro)
  → included swimTeam[]: abbreviation, name
```

### Live data endpoints (nirvana = Meet Maestro)
```
GET /nirvana-meets/{id}/nirvana-heats
  paginated 25/page
  ?include=nirvanaEntries,nirvanaResults,nirvanaEntries.nirvanaEntryRelayLegs
  nirvanaHeat: status("done"|"inProgress"|"pending"), number, scheduleIndex,
               adjustedEstimatedStartAt, actualStartAt
  nirvanaEntry: laneNumber, seedTimeInt, isExhibition
    → nirvanaAthlete (null for relay entries), nirvanaResult, nirvanaEvent
  nirvanaEntryRelayLeg: position, relayLegStrokeCode
    → nirvanaAthlete, nirvanaEntry

GET /nirvana-meets/{id}/nirvana-athletes
  batch: ?filter[id][0]=...&filter[id][1]=...  (up to 100 per request)
  attributes: firstName, lastName, competitionAge, gender, matchCode
  relationships: nirvanaTeam

GET /nirvana-meets/{id}/nirvana-teams
  attributes: abbreviation, name, fullName

GET /nirvana-meets/{id}/nirvana-events
  attributes: eventNumber, distance, strokeCode, minAge, maxAge, gender, eventType

GET /swim-meets/{id}/swim-event-heat-trackers
  LIVE SCOREBOARD — what's happening in the pool RIGHT NOW
  attributes: isLive, isComplete, currentEventNumberDigit, currentHeatNumber,
              currentEventDistance, currentEventStrokeCode,
              currentEventGender, currentEventMinAge, currentEventMaxAge
  Poll every 30s

GET /swim-meets/{id}/time-standard-sets
  ?include=time_standards,time_standard_events,time_standard_events.time_standard_cuts
  timeStandardCut: cutTimeInt, gender, ageMin, ageMax
  timeStandard: label (e.g. "INV")
```

### Pre-meet fallback (no Meet Maestro)
```
GET /swim-meets/{id}?include=swimSessions,swimSessions.swimEvents
  swimEvent: eventNumber, distance, strokeCode, gender, minAge, maxAge, eventType

GET /swim-meets/{id}/swim-entries?include=athlete
  paginated 100/page
  attributes: seedTimeInt, deletedAt
  athlete: firstName, lastName, competitionAge, gender
```

### Key field names (confirmed from live API)
- `nirvanaResult.overallPlace` (not `place`)
- `nirvanaResult.isDq` — boolean
- `nirvanaResult.invalidCode` — non-null means invalid (not a boolean)
- `nirvanaResult.officialTimeInt` — hundredths of seconds
- `nirvanaEntry.relayTeam` — "A", "B", etc.
- `nirvanaEntryRelayLeg.relayLegStrokeCode` — stroke integer
- Stroke codes: 1=Free, 2=Back, 3=Breast, 4=Fly, 5=IM

### Time encoding
All `*TimeInt` fields = hundredths of seconds:
- 3709 → "37.09"
- 7510 → "1:15.10"
- 36000 → "6:00.00"
See `fmtTime()` in `utils.js`.

### Example IDs (from development test capture — yours will differ)
- `swim_meet_id`: 793818
- `nirvana_meet_id`: 114122
- `org_id`: 66

## Demo mode

Visit `index.html?demo` to see the display without logging in.
The demo shows:
- Two done relay events (Medley + Free) in the previous panel
- 50 Fly heat 1 done, heat 2 actively in-water (inProgress)
- Lineup banner in WARNING state for the upcoming Medley Relay
- After 8 seconds: heat 2 results arrive, tracker advances

Demo data lives in `demo.js` and uses the same `S.swimmers` shape as live data.

## Notes for contributors

- All API calls go browser → SwimTopia directly (CORS is open, no proxy needed)
- No credentials are stored; the Bearer token lives in `sessionStorage` only
- The app uses the same API endpoints as SwimTopia's own mobile app
- `CLAUDE.md` is read by the Claude Code AI assistant at session start
