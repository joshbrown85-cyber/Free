# Free

A private, on-device PWA for tracking abstinence streaks and getting through cravings in the moment.

## What it does

Home is **the ledger**, not a question: every tracker sits on one screen with its own 7-day strip and a footer line of counts, your recent notes underneath. It reads like a record you keep rather than an app that coaches you. Ground is true black; terracotta is rationed to mark the current run and nothing else.

- **The ledger (home)** — one dense block per visible tracker: name, day count, a 7-day strip (today's bar in the tracker's own colour), then `best Nd` and `N reasons · N notes`. Hidden trackers collapse to a single tappable row. Below the trackers, your two most recent notes.
- **The daily check-in is a compact row**, not a screen. It sits above the first tracker, shown only until answered: difficulty renders as inline chips (with a "which one?" follow-up when more than one tracker is visible and the answer isn't Easy); trigger / plan / week / milestone open the same question as a sheet. `Skip today` is always available; three skips in a row pauses it for a week.
- **Per-tracker** — everything downstream (the "which weekday is hardest" claim, the plan question, the trigger you're asked to name) is scoped to the tracker it's actually about.
- **Hidden trackers** — a hidden tracker's clock keeps running but it drops out of the daily check-in and renders as a single row on the ledger. Still fully usable: tap it to open its detail screen.
- **Urge help** — reachable from the ledger's footer, a tracker's detail screen, or Reasons. States your own odds instead of recommending: "You've logged 14 urges. Twelve of them passed inside twenty minutes," then every tool (breathe, read your reasons, wait ten minutes, tap it out) listed with its own `used N · passed N` and a success rate — no "start here" card, you choose. A line to sit with and logging the urge with no exercise are listed too, unmeasured. `It passed` resolves whichever tool is in progress; resetting the clock mid-urge marks it a slip instead.
- **Reasons** — numbered, one per block, in Fraunces — with `shown N times`, counting how often each has surfaced mid-urge (opened via "Read your reasons", or picked as a line to sit with).
- **Tracker detail** — runs as a table (started / length / **ended by**, the trigger logged at reset time), with a tally of what ends your runs underneath. Notes in date order. Export and reset-the-clock are text, never buttons.
- **Learn** — opens with a recommendation tied to your most-logged trigger, then a "Suggested reading" list fetched for what you track (both on-device once fetched); free-text search of habit/addiction reading; saved articles cached for offline.
- **Settings** — add / rename / hide / reorder trackers, check-in preferences, and export.

## Data & privacy

All data is stored locally using IndexedDB. No backend, no account, no analytics, no sync. Uninstalling the app (or clearing site data) deletes everything — export first if you want a backup.

**Network use** (all optional, all fails-soft):

- **Learn's article search** — the query string only; your trackers and notes are never part of it. Degrades to an offline screen when it fails.
- **Online extras** (Settings → Online, on by default) — on launch, fetches web-sourced quotes and suggested reading matched to what you track, and short reflection lines. The reflection call is the one place the app sends anything you wrote: your **reasons** text goes to the serverless function (which uses Claude) to build them. Turn the toggle off and none of this runs. Everything fetched is cached on device and the app works fully without it.

Learn's own copy lines — "reading isn't the only thing that helps" and "your trackers and notes aren't part of the search" — remain accurate for the search action.

### Data model

Beyond trackers / reasons / notes, four concepts drive the check-in and urge help:

- **`checkins`** — `date`, `question`, `answer`, `skipped`, `trackerId`. The difficulty question writes one row per visible tracker per day; trigger / plan / milestone write one row naming their tracker; week / skip write a trackerless row. The 7-day strip on each ledger row, the "which weekday is hardest" claim (needs ~10 answered days for that tracker), hard-day detection and the week counts are all derived per tracker.
- **`triggers`** — a single shared trigger vocabulary (`label`, `count`, `lastUsed`), referenced by id from notes, check-in answers, and now a run's `triggerId` ("ended by"). Chips everywhere are drawn from this list, which is what makes "you logged work stress 3 times" possible — free text can't be counted.
- **`plans`** — `date`, `trackerId`, `choice`, `custom` — written by the plan question in the morning, read back by that tracker's urge help in the evening.
- **`urges`** — `id`, `at`, `trackerId`, `tool`, `outcome`. One row per tool tried from urge help (`tool` is `breathe` / `reasons` / `wait` / `tap` / `log`, or `null` for "It passed" with no tool tried). `outcome` is `'passed'`, `'slip'` (the clock got reset while the tool was open), or `null` (never resolved). Drives both the per-tool `used/passed` rate and the top-line "you've logged N urges" statement; `reminder` ("a line to sit with") is deliberately not logged here — it isn't a tool whose success is measured.

A tracker's `runs` also each carry a `triggerId` now (or `null` — "not logged"), set by the slip screen right after a reset; tracker detail's runs table and "what ends your runs" tally read straight from it. A reason's `shownCount` — incremented whenever it's opened via "Read your reasons" or picked as a line to sit with — backs the "shown N times" line on the Reasons screen.

Legacy data is migrated automatically on first load. v1 (the old four-tab app): streak history becomes per-tracker runs, journal entries become notes with trigger-vocabulary rows, colours map to the new four-swatch set. v2 → v3: blended check-ins and plans are assigned to the first visible tracker.

## Running locally

Static site, no build step:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. Service workers require `https://` or `localhost`.

`netlify/functions/api.js` backs the search (`action=search`), the launch-time suggested reading (`action=knowledge`), the web quotes (`action=quotes`) and the reflection lines (`action=reflections`) — Brave + Claude, needing `BRAVE_API_KEY` and `ANTHROPIC_API_KEY` set on Netlify. Every screen works with no function and no network; the online bits just stay empty.

## Deploying

Deploy as a static site (Netlify — the `netlify/functions` directory is picked up automatically). Publish directory is the repo root, no build command.

## Installing on your phone

Once deployed to a live HTTPS URL:
- **iOS (Safari)**: open the URL → Share → Add to Home Screen
- **Android (Chrome)**: install banner, or menu → Install app

## Project structure

```
free/
├── index.html      — app shell (a single #app the script renders into)
├── style.css       — all styling; design tokens at the top
├── app.js          — state, check-in logic, every screen and sheet
├── db.js           — IndexedDB key/value wrapper
├── sw.js           — service worker, app-shell cache
├── manifest.json   — PWA manifest
├── assets/fonts/   — self-hosted Fraunces, Inter, JetBrains Mono (woff2)
├── icons/          — app icons
└── netlify/functions/api.js — Learn search + the older knowledge/quotes endpoints
```

Fonts are self-hosted so the app renders correctly with no network once installed. There are no other external runtime dependencies. The redesign uses no icons — text, shapes and CSS gradients only.

## Roadmap ideas

- Cross-device sync
- Notification for the morning check-in reminder (the `askAt` setting is stored but not yet wired to a notification)
- Richer Learn article reader (full text caching for saved results)
