# Free

A private, on-device PWA for tracking recovery streaks and getting through cravings in the moment.

## What it does

- **Today** — tracks multiple habits/addictions at once, each with its own running streak ("time since last reset")
- **Reasons** — a private space to write down why quitting each thing matters to you, so it's there to read mid-craving
- **Right now** — in-the-moment tools for urges: guided breathing, a 10-minute delay timer, a tap-it-out fidget exercise, and short reframing lines
- **Learn** — curated reading on habit change and specific addictions, filterable by topic

## Data & privacy

All data is stored locally on your device using IndexedDB. There is no backend, no account, no analytics, and no sync between devices. Uninstalling the app (or clearing site data) deletes everything — there's no recovery, so this is intentionally a single-device, fully private tool for now.

## Running locally

This is a static site with no build step. Any static file server works, e.g.:

```bash
npx serve .
```

or

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000` (or whatever port your server uses).

Note: service workers require either `https://` or `localhost` — file:// won't work for offline support, though the rest of the app will still function.

## Deploying

Deploy as a static site (Netlify, Vercel, GitHub Pages, etc.) — no build command needed, the publish directory is the repo root.

## Installing on your phone

Once deployed to a live HTTPS URL:
- **iOS (Safari)**: open the URL → Share → Add to Home Screen
- **Android (Chrome)**: open the URL → you should see an automatic install banner, or use the menu → Install app

## Project structure

```
free/
├── index.html      — app shell + markup for all four screens
├── style.css       — all styling
├── app.js          — app logic (rendering, state, exercises)
├── db.js           — small IndexedDB wrapper used as the storage layer
├── sw.js           — service worker for offline app-shell caching
├── manifest.json   — PWA manifest
├── assets/         — self-hosted fonts (Fraunces, Inter) and Tabler icon webfont
├── icons/          — app icons (standard + maskable, 192/512px)
└── make_icons.py   — script used to generate the icons (not needed at runtime)
```

Fonts and icons are self-hosted under `assets/` rather than loaded from a CDN, so the app renders correctly with no network connection once installed. There are no external runtime dependencies.

## Roadmap ideas

- Cross-device sync (e.g. Google Drive, similar to the ko.ah project)
- Edit existing trackers (rename, change color, change start date) rather than only add/delete
- Export reasons/history as a backup file
