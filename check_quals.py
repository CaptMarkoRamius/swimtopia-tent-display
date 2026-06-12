"""
Diagnostic script: inspect time-standard-sets across meets.

Usage:
  uv run python check_quals.py <email>           — list this year's meets + time standard status
  uv run python check_quals.py <email> <year>    — list meets for a specific year (e.g. 2025)
  uv run python check_quals.py <email> <meet_id> — inspect a specific meet in detail

The listing shows which meets have time standards configured (Standards column)
and how many cuts are defined (Cuts column). A dash means no standards attached.
Use the meet ID from the listing to drill into a specific meet's raw API response.
"""

import sys, json, getpass
import urllib.request, urllib.parse

BASE      = 'https://mobile-api.swimtopia.com/mobile'
AUTH_BASE = 'https://mobile-api.swimtopia.com'

HEADERS = {
    'Accept': 'application/json',
    'Origin': 'https://app.swimtopia.com',
    'Referer': 'https://app.swimtopia.com/',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
}

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

def fetch_all_meets(org_id, token, year=None):
    after  = f'{year}-01-01' if year else '2000-01-01'
    before = f'{year}-12-31' if year else '2099-12-31'
    url = (f'{BASE}/organizations/{org_id}/calendar-events'
           f'?filter[after]={after}&filter[before]={before}&page[size]=100')
    cal = get(url, token)
    return [e for e in cal.get('data', []) if e.get('attributes', {}).get('stiType') == 'SwimMeet']

def fetch_std_summary(meet_id, token):
    include = 'time_standards,time_standard_events,time_standard_events.time_standard_cuts'
    url = f'{BASE}/swim-meets/{meet_id}/time-standard-sets?include={urllib.parse.quote(include)}'
    std = get(url, token)
    cuts = [o for o in std.get('included', []) if o['type'] == 'timeStandardCut']
    label = next(
        (o['attributes'].get('label') for o in std.get('included', []) if o['type'] == 'timeStandard'),
        None,
    )
    return label, len(cuts)

def inspect_meet(meet_id, token):
    include = 'time_standards,time_standard_events,time_standard_events.time_standard_cuts'
    url = f'{BASE}/swim-meets/{meet_id}/time-standard-sets?include={urllib.parse.quote(include)}'
    std = get(url, token)

    included = std.get('included', [])
    data     = std.get('data', [])

    print(f'\n--- top-level data ({len(data)} objects) ---')
    for o in data:
        print(f"  type={o['type']} id={o['id']} attrs={list(o.get('attributes',{}).keys())}")

    print(f'\n--- included ({len(included)} objects) ---')
    by_type = {}
    for o in included:
        by_type.setdefault(o['type'], []).append(o)

    for typ, objs in sorted(by_type.items()):
        print(f'\n  [{typ}] — {len(objs)} object(s)')
        for o in objs[:3]:
            print(f'    id={o["id"]}')
            print(f'    attributes={json.dumps(o.get("attributes",{}), indent=6)}')
            rels = {k: v.get('data') for k, v in o.get('relationships', {}).items()}
            print(f'    relationships={json.dumps(rels, indent=6)}')

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    email    = sys.argv[1]
    arg2    = sys.argv[2] if len(sys.argv) > 2 else None
    is_year = arg2 and arg2.isdigit() and len(arg2) == 4

    password = getpass.getpass(f'Password for {email}: ')

    print('Authenticating…')
    auth  = post(f'{AUTH_BASE}/oauth/token', {'grant_type': 'password', 'username': email, 'password': password})
    token = auth['access_token']
    print('  OK')

    orgs   = get(f'{BASE}/organizations', token)
    org_id = orgs['data'][0]['id']

    if arg2 and not is_year:
        print(f'\nInspecting meet {arg2}…')
        inspect_meet(arg2, token)
        return

    from datetime import date
    year = int(arg2) if is_year else date.today().year
    print(f'\nFetching {year} meets for org {org_id}…')
    meets = fetch_all_meets(org_id, token, year)
    if not meets:
        print('No SwimMeet events found.')
        sys.exit(1)

    print(f'\n{"ID":<10}  {"Standards":<20}  {"Cuts":>4}  Name')
    print('-' * 72)
    for m in meets:
        a    = m.get('attributes', {})
        date = a.get('startDate') or a.get('startsAt', '')[:10]
        name = a.get('name', '?')
        try:
            label, n_cuts = fetch_std_summary(m['id'], token)
            std_col = label if label else '—'
            cuts_col = str(n_cuts) if n_cuts else '—'
        except Exception:
            std_col, cuts_col = 'error', '?'
        print(f'{m["id"]:<10}  {std_col:<20}  {cuts_col:>4}  {date}  {name}')

if __name__ == '__main__':
    main()
