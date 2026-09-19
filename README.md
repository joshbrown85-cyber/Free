# Free

A private, on-device PWA for tracking recovery streaks and getting through cravings in the moment.

## What it does

This is the original four-tab build, restored after two later redesigns ("Check-in", then "Ledger") moved away from it. It has no daily question — you open it when you need it.

- **Today** — tracks multiple habits/addictions at once, each with its own running streak ("time since last reset")
- **Reasons** — a private space to write down why quitting each thing matters to you, so it's there to read mid-craving
- **Right now** — in-the-moment tools for urges: guided breathing, a 10-minute delay timer, a tap-it-out fidget exercise, and a reminder (a curated quote pool, mixed with web-sourced quotes and personalized reflections when online)
- **Learn** — curated reading on habit change and specific addictions, filterable by topic

**Colors** carry forward from the Ledger redesign: true black ground, warm off-white text, and terracotta as the one saturated accent (folded in wherever the original build used its old sage-green or amber highlights, so there's only one accent color instead of two). The six tracker swatches were muted to match — same idea, softer saturation.

## Data & privacy

All data is stored locally on your device using IndexedDB. There is no backend, no account, no analytics, and no sync between devices. Uninstalling the app (or clearing site data) deletes everything — there's no recovery, so this is intentionally a single-device, fully private tool for now.

**Coming back from a newer build:** the "Check-in" and "Ledger" redesigns stored data in a different shape (trackers keyed by `start`/`runs` instead of this build's `startedAt`, plus separate `checkins`/`notes`/`triggers` keys instead of `journal`/`streakHistory`). On first load, `downgradeFromNewerSchema()` in `app.js` detects that newer shape and converts it once — trackers, streak history (each past run's start time is back-calculated from its end date and length), reasons, and notes (with each note's trigger vocabulary ID resolved back to a plain label) all carry over. It's gated by a `downgradedFromNewerSchema` flag so it only ever runs once. Anything with no equivalent here (check-in answers, per-tool urge-help stats, "ended by" tallies, reason shown-counts) is simply left behind in IndexedDB, unused but not deleted.

**Network use** (all optional, all fails-soft): Learn's article search and the on-launch quote/reflection fetches call a Netlify function (`netlify/functions/api.js`) and degrade gracefully offline. The reflections call is the one place anything you wrote (your reasons) leaves the device, to build personalized quote lines.

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

Deploy as a static site (Netlify, Vercel, GitHub Pages, etc.) — no build command needed, the publish directory is the repo root. Live at `freeappforbadhabits.netlify.app`.

## Installing on your phone

Once deployed to a live HTTPS URL:
- **iOS (Safari)**: open the URL → Share → Add to Home Screen
- **Android (Chrome)**: open the URL → you should see an automatic install banner, or use the menu → Install app

## Project structure

```
free/
├── index.html      — app shell + markup for all four screens
├── style.css       — all styling; palette tokens at the top
├── app.js          — app logic (rendering, state, exercises, the downgrade migration)
├── db.js           — small IndexedDB wrapper used as the storage layer
├── sw.js           — service worker for offline app-shell caching
├── manifest.json   — PWA manifest
├── assets/         — self-hosted fonts (Fraunces, Inter) and the Tabler icon webfont
├── icons/          — app icons (standard + maskable, 192/512px)
└── netlify/functions/api.js — Learn search, knowledge articles, quotes, reflections
```

Fonts and icons are self-hosted under `assets/` rather than loaded from a CDN, so the app renders correctly with no network connection once installed. There are no other external runtime dependencies.

## Roadmap ideas

- Cross-device sync
- Export reasons/history as a backup file
