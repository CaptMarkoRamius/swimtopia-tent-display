"""
Diagnostic script: inspect live meet data (tracker, heats, athletes).

Usage:
  uv run python scripts/check_live.py <email>                                    — list recent meets
  uv run python scripts/check_live.py <email> <meet_id>                          — full live diagnostic
  uv run python scripts/check_live.py <email> <meet_id> results                  — all done heats + times
  uv run python scripts/check_live.py <email> <meet_id> results <age> <gender> <team>  — filtered
    age    e.g. 9-10
    gender M or F
    team   e.g. HUR  (or omit / use ALL)
"""

import sys, json, getpass, urllib.request, urllib.parse
from datetime import date, timedelta

BASE      = 'https://mobile-api.swimtopia.com/mobile'
AUTH_BASE = 'https://mobile-api.swimtopia.com'

HEADERS = {
    'Accept': 'application/json',
    'Origin': 'https://app.swimtopia.com',
    'Referer': 'https://app.swimtopia.com/',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
}

STROKE = {1: 'Free', 2: 'Back', 3: 'Breast', 4: 'Fly', 5: 'IM'}

def get(url, token):
    req = urllib.request.Request(url, headers={**HEADERS, 'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def post(url, data):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, method='POST', headers=HEADERS)
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def paginate(base_url, token):
    results, page = [], 1
    while True:
        sep = '&' if '?' in base_url else '?'
        data = get(f'{base_url}{sep}page[number]={page}&page[size]=25', token)
        results.extend(data.get('data', []))
        if not data.get('data') or len(results) >= (data.get('meta', {}).get('total', 0)):
            break
        page += 1
    return results

def fmt_time(h):
    if h is None: return '—'
    s, c = h // 100, h % 100
    m = s // 60
    return f'{m}:{s % 60:02d}.{c:02d}' if m else f'{s}.{c:02d}'

def check_meet(meet_id, token):
    print(f'\n=== Meet {meet_id} ===')

    # Step 1: get nirvana ID
    meet = get(f'{BASE}/swim-meets/{meet_id}?include=nirvanaMeet,swimTeams', token)
    nirvana_id = meet['data']['relationships'].get('nirvanaMeet', {}).get('data', {})
    nirvana_id = nirvana_id.get('id') if nirvana_id else None
    meet_name  = meet['data']['attributes'].get('name', '?')
    print(f'  Meet: {meet_name}')
    print(f'  NirvanaID (Meet Maestro): {nirvana_id or "NONE — no Meet Maestro, pre-meet fallback only"}')

    if not nirvana_id:
        print('\n  ⚠️  No Meet Maestro ID. App will show seed-time entries only (no live heat data).')
        _check_swim_entries(meet_id, token)
        return

    # Step 2: tracker
    print('\n--- Heat Tracker ---')
    tracker_res = get(f'{BASE}/swim-meets/{meet_id}/swim-event-heat-trackers', token)
    trackers = tracker_res.get('data', [])
    if not trackers:
        print('  ⚠️  No tracker data returned.')
    for t in trackers:
        a = t['attributes']
        print(f'  isLive={a.get("isLive")}  isComplete={a.get("isComplete")}')
        print(f'  currentEvent={a.get("currentEventNumberDigit")}  currentHeat={a.get("currentHeatNumber")}')
        print(f'  distance={a.get("currentEventDistance")}  stroke={STROKE.get(a.get("currentEventStrokeCode"), a.get("currentEventStrokeCode"))}')
        print(f'  gender={a.get("currentEventGender")}  ages={a.get("currentEventMinAge")}-{a.get("currentEventMaxAge")}')

    # Step 3: heats summary
    print('\n--- Heats Summary ---')
    include = 'nirvanaEntries,nirvanaResults,nirvanaEntries.nirvanaEntryRelayLegs'
    heats = paginate(
        f'{BASE}/nirvana-meets/{nirvana_id}/nirvana-heats?include={urllib.parse.quote(include)}',
        token
    )
    by_status = {}
    for h in heats:
        s = h['attributes'].get('status', '?')
        by_status[s] = by_status.get(s, 0) + 1
    print(f'  Total heats: {len(heats)}')
    for s, n in sorted(by_status.items()):
        print(f'    {s}: {n}')

    if not heats:
        print('  ⚠️  No heats returned at all. Meet Maestro may not be active yet.')
        return

    # Step 4: events
    print('\n--- Events ---')
    events_res = get(f'{BASE}/nirvana-meets/{nirvana_id}/nirvana-events', token)
    events = events_res.get('data', [])
    print(f'  Total events: {len(events)}')
    age_groups = set()
    for ev in events:
        a = ev['attributes']
        if a.get('minAge') and a.get('maxAge'):
            age_groups.add(f"{a['minAge']}-{a['maxAge']}")
    print(f'  Age groups in meet: {", ".join(sorted(age_groups, key=lambda x: int(x.split("-")[0])))}')

    # Step 5: sample a done heat to verify entry/result data
    done_heats = [h for h in heats if h['attributes'].get('status') == 'done']
    inprog_heats = [h for h in heats if h['attributes'].get('status') == 'inProgress']
    print(f'\n--- Sample Data ---')
    if inprog_heats:
        print(f'  IN-PROGRESS heat: {inprog_heats[0]["attributes"]}')

    sample = (done_heats[:1] or heats[:1])[0]
    ha = sample['attributes']
    included = heats  # paginate returns data[] only; need included separately
    # Re-fetch first page for included
    first_page = get(
        f'{BASE}/nirvana-meets/{nirvana_id}/nirvana-heats?include={urllib.parse.quote(include)}&page[number]=1&page[size]=25',
        token
    )
    inc_by_type = {}
    for o in first_page.get('included', []):
        inc_by_type.setdefault(o['type'], []).append(o)
    for t, objs in sorted(inc_by_type.items()):
        print(f'  included[{t}]: {len(objs)} objects on page 1')

    entry_count = len(inc_by_type.get('nirvanaEntry', []))
    result_count = len(inc_by_type.get('nirvanaResult', []))
    athlete_count = len(inc_by_type.get('nirvanaAthlete', []))
    print(f'\n  Page-1 entries: {entry_count}  results: {result_count}  athletes (if sideloaded): {athlete_count}')
    if entry_count and not athlete_count:
        print('  ✓ Athletes fetched separately via /nirvana-athletes (expected — app batches these)')

def show_results(nirvana_id, token, age_filter=None, gender_filter=None, team_filter=None):
    """Fetch all done heats and print results, optionally filtered."""
    include = 'nirvanaEntries,nirvanaResults,nirvanaEntries.nirvanaEntryRelayLegs'
    print(f'\nFetching all heats (paginated)…')
    all_heats_data = []
    all_included   = []
    page = 1
    while True:
        url = (f'{BASE}/nirvana-meets/{nirvana_id}/nirvana-heats'
               f'?include={urllib.parse.quote(include)}&page[number]={page}&page[size]=25')
        resp = get(url, token)
        all_heats_data.extend(resp.get('data', []))
        all_included.extend(resp.get('included', []))
        total = resp.get('meta', {}).get('total', 0)
        if not resp.get('data') or len(all_heats_data) >= total:
            break
        page += 1

    # Index included objects
    idx = {}
    for o in all_included:
        idx[f"{o['type']}:{o['id']}"] = o

    # Fetch events for event details
    events_res = get(f'{BASE}/nirvana-meets/{nirvana_id}/nirvana-events', token)
    ev_idx = {}
    for ev in events_res.get('data', []):
        a = ev['attributes']
        ev_idx[ev['id']] = {
            'num': a.get('eventNumber', '?'),
            'dist': a.get('distance', '?'),
            'stroke': STROKE.get(a.get('strokeCode'), str(a.get('strokeCode', '?'))),
            'minAge': a.get('minAge'), 'maxAge': a.get('maxAge'),
            'gender': a.get('gender'),
        }

    # Collect athlete IDs from done heats
    done_heats = [h for h in all_heats_data if h['attributes'].get('status') == 'done']
    print(f'Done heats: {len(done_heats)} of {len(all_heats_data)} total\n')

    athlete_ids = set()
    for h in done_heats:
        for eref in (h['relationships'].get('nirvanaEntries', {}).get('data') or []):
            entry = idx.get(f"nirvanaEntry:{eref['id']}")
            if entry:
                aid = (entry['relationships'].get('nirvanaAthlete') or {}).get('data', {})
                if aid: athlete_ids.add(aid.get('id'))

    # Batch-fetch athletes
    athletes = {}
    ids = list(athlete_ids)
    for i in range(0, len(ids), 100):
        chunk = ids[i:i+100]
        params = '&'.join(f'filter[id][{j}]={v}' for j, v in enumerate(chunk))
        resp = get(f'{BASE}/nirvana-meets/{nirvana_id}/nirvana-athletes?{params}', token)
        for a in resp.get('data', []):
            team_id = (a['relationships'].get('nirvanaTeam') or {}).get('data', {}).get('id')
            athletes[a['id']] = {**a['attributes'], '_teamId': team_id}

    # Fetch teams for abbreviation lookup
    teams_res = get(f'{BASE}/nirvana-meets/{nirvana_id}/nirvana-teams', token)
    team_abbr = {t['id']: t['attributes'].get('abbreviation', '?') for t in teams_res.get('data', [])}

    # Parse age filter
    age_min = age_max = None
    if age_filter and '-' in age_filter:
        parts = age_filter.split('-')
        try: age_min, age_max = int(parts[0]), int(parts[1])
        except ValueError: pass

    # Print done heats
    for h in done_heats:
        eid  = (h['relationships'].get('nirvanaEvent') or {}).get('data', {}).get('id')
        evd  = ev_idx.get(eid, {})
        hnum = h['attributes'].get('number', '?')
        event_label = f"Ev {evd.get('num','?')} H{hnum} · {evd.get('dist','?')} {evd.get('stroke','?')}"
        event_label += f"  ({evd.get('gender','?')} {evd.get('minAge','?')}-{evd.get('maxAge','?')})"

        entry_refs = (h['relationships'].get('nirvanaEntries') or {}).get('data') or []
        rows = []
        for eref in entry_refs:
            entry = idx.get(f"nirvanaEntry:{eref['id']}")
            if not entry: continue
            result = idx.get(f"nirvanaResult:{(entry['relationships'].get('nirvanaResult') or {}).get('data', {}).get('id')}")
            ra = result['attributes'] if result else {}
            aid = (entry['relationships'].get('nirvanaAthlete') or {}).get('data', {}).get('id')
            if not aid: continue
            ath = athletes.get(aid, {})

            age = ath.get('competitionAge')
            gender = ath.get('gender')
            team_id = ath.get('_teamId')
            abbr = team_abbr.get(team_id, '?')

            if age_min is not None and (age is None or not (age_min <= age <= age_max)): continue
            if gender_filter and gender != gender_filter: continue
            if team_filter and team_filter.upper() != 'ALL' and abbr.upper() != team_filter.upper(): continue

            rows.append({
                'place': ra.get('overallPlace'),
                'name': f"{ath.get('firstName','')} {ath.get('lastName','')}".strip(),
                'age': age, 'gender': gender, 'team': abbr,
                'time': fmt_time(ra.get('officialTimeInt')),
                'dq': ra.get('isDq', False),
            })

        if not rows: continue
        rows.sort(key=lambda r: r['place'] or 999)
        print(event_label)
        for r in rows:
            flag = ' DQ' if r['dq'] else ''
            print(f"  {str(r['place'] or '—'):>3}  {r['name']:<22}  age {r['age']}  {r['gender']}  {r['team']:<6}  {r['time']}{flag}")
        print()

def _check_swim_entries(meet_id, token):
    print('\n--- Swim Entries (pre-meet fallback) ---')
    try:
        res = get(f'{BASE}/swim-meets/{meet_id}/swim-entries?include=athlete&page[size]=10', token)
        n = len(res.get('data', []))
        total = res.get('meta', {}).get('total', '?')
        print(f'  Entries on first page: {n}  (total: {total})')
        if n == 0:
            print('  ⚠️  No entries — meet may not have entry data published yet.')
    except Exception as ex:
        print(f'  Error: {ex}')

def list_meets(org_id, token):
    lookback = (date.today() - timedelta(days=30)).isoformat()
    url = f'{BASE}/organizations/{org_id}/calendar-events?filter[after]={lookback}&page[size]=50'
    cal = get(url, token)
    meets = [e for e in cal.get('data', []) if e.get('attributes', {}).get('stiType') == 'SwimMeet']
    meets.sort(key=lambda m: m['attributes'].get('startDate', ''), reverse=True)
    print(f'\n{"ID":<10}  {"Date":<12}  Name')
    print('-' * 60)
    for m in meets:
        a = m['attributes']
        print(f'{m["id"]:<10}  {a.get("startDate","?"):<12}  {a.get("name","?")}')

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    email = sys.argv[1]
    meet_id = sys.argv[2] if len(sys.argv) > 2 else None

    password = getpass.getpass(f'Password for {email}: ')
    print('Authenticating…')
    auth  = post(f'{AUTH_BASE}/oauth/token', {'grant_type': 'password', 'username': email, 'password': password})
    token = auth['access_token']
    print('  OK')

    orgs   = get(f'{BASE}/organizations', token)
    org_id = orgs['data'][0]['id']

    mode = sys.argv[3] if len(sys.argv) > 3 else None

    if meet_id and mode == 'results':
        age_f    = sys.argv[4] if len(sys.argv) > 4 else None
        gender_f = sys.argv[5] if len(sys.argv) > 5 else None
        team_f   = sys.argv[6] if len(sys.argv) > 6 else None
        meet = get(f'{BASE}/swim-meets/{meet_id}?include=nirvanaMeet', token)
        nirvana_id = (meet['data']['relationships'].get('nirvanaMeet', {}).get('data') or {}).get('id')
        if not nirvana_id:
            print('No Meet Maestro ID for this meet.')
            sys.exit(1)
        show_results(nirvana_id, token, age_f, gender_f, team_f)
    elif meet_id:
        check_meet(meet_id, token)
    else:
        print(f'\nRecent meets for org {org_id}:')
        list_meets(org_id, token)
        print('\nRun with a meet ID to diagnose live data.')

if __name__ == '__main__':
    main()
