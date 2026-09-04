# Free

A private, on-device PWA for tracking abstinence streaks and getting through cravings in the moment.

## What it does

The home screen **asks one question a day** and answering it is the whole interaction — it never asks the same question two days running, and if there's nothing worth asking it just holds the numbers. Those answers are what let the app learn which days are hard and warn you in the morning instead of reacting at 9pm.

- **Check-in (home)** — one of five questions: difficulty ("how hard does today feel?"), trigger (the morning after a rough day), the plan (the morning of a known-hard day), the week (Sundays), or a milestone question at 30 / 100 / 365 days. Skipping is always allowed; three skips in a row and it pauses for a week.
- **Craving sheet** — pinned under your thumb on every screen. One recommended action plus a quiet list: guided breathing, a 10-minute delay timer, a tap-it-out exercise, your reasons, or a quick note.
- **Reasons** — your own writing, set large, filtered per tracker — there to read mid-craving.
- **Tracker detail** — every run as a bar you can read against the others, your notes in date order, and reset-the-clock as a line of text (never a button).
- **Learn** — opens with something tied to what you logged this week; free-text search of habit/addiction reading, saved articles cached for offline.
- **Settings** — add / rename / hide / reorder trackers, check-in preferences, and export.

## Data & privacy

All data is stored locally using IndexedDB. No backend, no account, no analytics, no sync. The **only** network request the app ever makes is Learn's article search; it degrades gracefully to an offline screen when it fails, and the copy says so in two places. Uninstalling the app (or clearing site data) deletes everything — export first if you want a backup.

### Data model

Beyond trackers / reasons / notes, three concepts drive the check-in:

- **`checkins`** — one record per day (`date`, `question`, `answer`, `skipped`). The 14-day history strip, the "which weekday is hardest" claim (needs ~10 answered days), hard-day detection and the week counts are all derived from this.
- **`triggers`** — a single shared trigger vocabulary (`label`, `count`, `lastUsed`), referenced by id from notes and check-in answers. Chips everywhere are drawn from this list, which is what makes "you logged work stress 3 times" possible — free text can't be counted.
- **`plans`** — written by the plan question in the morning, read back by the craving sheet that evening.

Legacy v1 data (the old four-tab app) is migrated automatically on first load: streak history becomes per-tracker runs, journal entries become notes with trigger-vocabulary rows, colours map to the new four-swatch set.

## Running locally

Static site, no build step:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. Service workers require `https://` or `localhost`.

Learn's search calls `/.netlify/functions/api?action=search` (Brave + Claude); it needs `BRAVE_API_KEY` and `ANTHROPIC_API_KEY` set on Netlify. Everything else works with no function and no network.

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
