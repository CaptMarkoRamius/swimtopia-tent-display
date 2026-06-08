# SwimTopia Tent Display

A live tent-parent display for swim meets. Shows your age group's upcoming events with heat/lane assignments and live countdowns to lineup time, then moves completed heats to a results column as they finish.

**[Try the live demo →](index.html?demo)**

---

> **Disclaimer:** This project is not affiliated with, endorsed by, or connected to SwimTopia in any way. It is an independent open-source tool that uses SwimTopia's mobile API with your own account credentials — the same data you already have access to through the official app.

---

## How it works

Every parent signs in with their **own** SwimTopia account. The app calls SwimTopia's API directly from your browser — no server, no database, no data collection. Your credentials are used once to get a session token, then discarded. The token lives only in your browser tab and is cleared when you close it.

## Quickstart — GitHub Pages (no install required)

1. Fork this repository
2. Go to **Settings → Pages → Source → Deploy from branch**
3. Select `main`, folder `/` (root), click Save
4. Wait ~60 seconds, then visit `https://your-username.github.io/your-repo-name/`
5. Share that URL with your team's tent parents

That's it. SwimTopia's API has open CORS (`access-control-allow-origin: *`), so the browser calls it directly with no backend needed.

## What you'll see

- **Top banner** — live event currently in the pool (updates every 30s)
- **Lineup banner** — countdown to when your swimmers need to be at the blocks, color-coded by urgency
- **Previous events** (left panel) — completed heats with places, official times, and deltas vs. seed time
- **Upcoming events** (right panel) — all remaining events with heat/lane assignments

## Selecting your group

On the meet picker, choose:
- **Age group** — populated from the meet's actual event list
- **Gender** — Boys or Girls
- **Team** — your team abbreviation (e.g. HUR)
- **Lineup** and **Warning** times — minutes before the heat start to trigger each alert level

## Development

Requires [Node.js](https://nodejs.org) (v18+).

```bash
npm install       # install dependencies

npm test              # run JS unit tests (vitest)
npm run test:watch    # run tests in watch mode

npm run serve     # start local dev server at http://localhost:8080
npm run demo      # same server — open http://localhost:8080/?demo for no-login preview
```

## Security & privacy

- Your password is sent **only** to `https://mobile-api.swimtopia.com/oauth/token` and is not stored anywhere after that
- The session token is stored in `sessionStorage` only — cleared automatically when the tab closes
- All API calls go directly from your browser to SwimTopia's servers using your own token
- No analytics, no tracking, no third-party requests of any kind

## Files

| File | Purpose |
|------|---------|
| `index.html` | HTML structure + CSS |
| `app.js` | Auth flow, meet picker, data refresh, timers |
| `api.js` | Network layer — fetch wrapper, token refresh, SwimTopia endpoints |
| `assembly.js` | Transform raw API responses into display data |
| `render.js` | All DOM rendering functions |
| `demo.js` | Demo fixture data + 8-second animation |
| `state.js` | Shared application state |
| `utils.js` | Pure utility functions (formatting, age grouping) |
| `tests/` | JS unit tests (vitest) |

## License

MIT — see [LICENSE](LICENSE)
