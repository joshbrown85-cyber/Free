/* ===================================================================
   Free — "Check-in" redesign, app logic

   Vanilla JS, no build step. Storage is window.storage (db.js), an
   IndexedDB-backed key/value store. Everything renders by rebuilding
   #app / #layer from a small state object.

   Persisted keys:
     schemaVersion  int
     trackers   [{ id, name, color, start, best, runs:[{endedOn,length}], hidden, order }]
     reasons    [{ id, trackerId, text, writtenAt, source }]
     notes      [{ id, trackerId, triggerId|null, text, createdAt }]
     checkins   [{ date:'YYYY-MM-DD', question, answer, skipped, at, trackerId, milestoneN? }]
                  difficulty: one row per visible tracker per day (trackerId set)
                  trigger/plan/milestone: one row/day, trackerId names the tracker it's about
                  week/skip: one row/day, trackerId null
     triggers   [{ id, label, count, lastUsed }]
     plans      [{ date:'YYYY-MM-DD', trackerId, choice, custom }]
     articles   [{ id, title, source, minutes, summary, url, savedAt, body }]
     searches   [{ id, query, keptAt }]
     settings   { askAt, hardDayReminders, milestoneQuestions, onboarded }
     skipInfo   { streak, pausedUntil }
     lastReset  { trackerId, at } | null
   =================================================================== */

'use strict';

const DAY = 86400000;
const SCHEMA = 3;

const SWATCHES = ['#7fc3ac', '#8fb3d9', '#d9a86c', '#c48f8f'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WD = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const WD_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const TRIGGER_SEED = ['Work stress', 'Drinking', 'Boredom', 'Alone in the evening', 'Tired', 'Argument'];

const NAME_SUGGESTIONS = ['Drinking', 'Doomscrolling', 'Vaping', 'Weed'];

const DIFFICULTY_OPTS = [
  { key: 'easy', label: 'Easy — barely thinking about it' },
  { key: 'manageable', label: "Manageable — it's there in the background" },
  { key: 'rough', label: 'Rough — I could go either way' }
];

const PLAN_OPTS = [
  'Out of the house — walk, gym, errand',
  'With someone — call someone at 8',
  'In bed early, phone in the kitchen'
];

const REASON_PROMPTS = [
  'Who else is affected by this, and how would they know if it changed?',
  'What does this cost you in a month — money, time, or something else?',
  'What could you do with the version of you that isn\'t doing this?',
  'What did the last slip actually feel like the morning after?',
  'What do you want to be true a year from now that isn\'t true today?',
  'Whose opinion of you would shift if they knew how hard this was?'
];

const PATTERN_THRESHOLD = 10; // answered check-ins before the app claims a hard weekday

// "A reminder" — a line to sit with mid-craving. Curated pool, held on
// device; the craving overlay also mixes in the user's own written reasons.
const REMINDERS = [
  { t: 'It is not that we have a short time to live, but that we waste a great deal of it.', a: 'Seneca' },
  { t: 'You have power over your mind, not outside events. Realize this, and you will find strength.', a: 'Marcus Aurelius' },
  { t: 'No man is free who is not master of himself.', a: 'Epictetus' },
  { t: 'How long are you going to wait before you demand the best for yourself?', a: 'Epictetus' },
  { t: 'The wound is the place where the light enters you.', a: 'Rumi' },
  { t: 'Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.', a: 'Rumi' },
  { t: 'He who has a why to live can bear almost any how.', a: 'Viktor Frankl' },
  { t: 'Between stimulus and response there is a space. In that space is our freedom and our power to choose.', a: 'Viktor Frankl' },
  { t: "Recovery is not a race. You don't have to feel guilty if it takes you longer than you thought it would.", a: '—' },
  { t: 'The only person you are destined to become is the person you decide to be.', a: 'Ralph Waldo Emerson' },
  { t: 'Not everything that is faced can be changed, but nothing can be changed until it is faced.', a: 'James Baldwin' },
  { t: 'I am not what happened to me. I am what I choose to become.', a: 'Carl Jung' },
  { t: "The most common way people give up their power is by thinking they don't have any.", a: 'Alice Walker' },
  { t: 'Nothing is permanent. This too shall pass.', a: '—' },
  { t: 'You are the sky. Everything else is just the weather.', a: 'Pema Chödrön' },
  { t: 'The only way out is through.', a: 'Robert Frost' },
  { t: 'You are not your craving. You are the one noticing it.', a: '—' },
  { t: 'This feeling is real, but it is not a fact about what you must do next.', a: '—' },
  { t: "Every craving you've ever had has ended, whether or not you acted on it.", a: '—' },
  { t: "The urge is loud because it's temporary. Permanent things don't need to shout.", a: '—' },
  { t: "You don't have to win the whole fight right now. Just win the next ten minutes.", a: '—' },
  { t: 'Discomfort you choose to sit with is not the same as harm.', a: '—' },
  { t: 'What you feed grows. What you starve, even briefly, weakens.', a: '—' },
  { t: 'Future you is waiting on the other side of this exact moment.', a: '—' }
];

// ---- persisted store + ephemeral ui state -------------------------

const S = {
  schemaVersion: SCHEMA,
  trackers: [], reasons: [], notes: [], checkins: [], triggers: [],
  plans: [], articles: [], searches: [],
  settings: { askAt: '08:30', hardDayReminders: true, milestoneQuestions: false, onboarded: false, onlineExtras: true },
  skipInfo: { streak: 0, pausedUntil: null },
  lastReset: null
};

const KEYS = ['schemaVersion','trackers','reasons','notes','checkins','triggers','plans','articles','searches','settings','skipInfo','lastReset'];

let ui = {
  screen: 'home',
  layer: null,          // sheet or overlay name
  detailId: null,
  reasonsFilter: null,
  articleId: null,
  onboardStep: 1,
  draft: {},            // scratch for the currently-open sheet/question
  search: { mode: 'idle', query: '', results: null, error: false },
  breath: { cycle: 1, inhale: true },
  timer: { left: 600, running: true },
  tap: 0
};

let _timers = { breath: null, tick: null, toast: null };

// Online extras, fetched on launch and cached in IndexedDB (outside the
// exported store — these are refetchable, not user data).
let webReminders = [];       // [{ t, a, src:'web'|'personal' }]
let suggestedArticles = [];   // [{ id, title, source, minutes, summary, url, body }]
const CACHE_TTL = 24 * 3600 * 1000;

// ---- storage ----------------------------------------------------

async function load() {
  for (const k of KEYS) {
    try {
      const v = await window.storage.get(k);
      if (v !== null && v !== undefined) {
        if (k === 'settings') S.settings = Object.assign({}, S.settings, v);
        else if (k === 'skipInfo') S.skipInfo = Object.assign({}, S.skipInfo, v);
        else S[k] = v;
      }
    } catch (e) { console.error('load ' + k + ' failed', e); }
  }
  await migrate();
}

async function persist(...keys) {
  for (const k of keys) {
    try { await window.storage.set(k, S[k]); }
    catch (e) { console.error('save ' + k + ' failed', e); }
  }
}

async function migrate() {
  if (S.schemaVersion >= SCHEMA && S.trackers.length >= 0 && Array.isArray(S.triggers) && S.triggers.length) {
    return;
  }

  // legacy v1 keys
  let legacyTrackers = null, legacyHistory = null, legacyReasons = null, legacyJournal = null, legacyTopics = null;
  try { legacyTrackers = await window.storage.get('trackers'); } catch (e) {}
  try { legacyHistory = await window.storage.get('streakHistory'); } catch (e) {}
  try { legacyReasons = await window.storage.get('reasons'); } catch (e) {}
  try { legacyJournal = await window.storage.get('journal'); } catch (e) {}
  try { legacyTopics = await window.storage.get('customTopics'); } catch (e) {}

  const looksLegacy = Array.isArray(legacyTrackers) && legacyTrackers.some(t => t && t.startedAt && !t.start);

  // seed trigger vocabulary
  if (!Array.isArray(S.triggers) || !S.triggers.length) {
    S.triggers = TRIGGER_SEED.map(label => ({ id: uid(), label, count: 0, lastUsed: null }));
  }

  if (looksLegacy) {
    const colorMap = h => {
      const m = { '#5F8B7A': '#7fc3ac', '#1D9E75': '#7fc3ac', '#378ADD': '#8fb3d9', '#7F77DD': '#8fb3d9', '#C9874A': '#d9a86c', '#D4537E': '#c48f8f' };
      return m[h] || SWATCHES[0];
    };
    S.trackers = legacyTrackers.map((t, i) => {
      const runs = (legacyHistory || [])
        .filter(h => h.trackerId === t.id)
        .map(h => ({ endedOn: h.endedAt, length: Math.max(0, Math.floor((new Date(h.endedAt) - new Date(h.startedAt)) / DAY)) }))
        .sort((a, b) => new Date(b.endedOn) - new Date(a.endedOn));
      const best = Math.max(
        Math.floor((Date.now() - new Date(t.startedAt).getTime()) / DAY),
        ...runs.map(r => r.length), 0
      );
      return { id: t.id, name: t.name, color: colorMap(t.color), start: t.startedAt, best, runs, hidden: !!t.hidden, order: i };
    });

    S.reasons = (legacyReasons || []).map(r => ({
      id: r.id, trackerId: r.trackerId, text: r.text, writtenAt: r.createdAt || new Date().toISOString(), source: 'manual'
    }));

    S.notes = (legacyJournal || []).map(j => {
      let triggerId = null;
      const label = (j.trigger || '').trim();
      if (label) {
        let vocab = S.triggers.find(v => v.label.toLowerCase() === label.toLowerCase());
        if (!vocab) { vocab = { id: uid(), label: label[0].toUpperCase() + label.slice(1), count: 0, lastUsed: null }; S.triggers.push(vocab); }
        vocab.count++; vocab.lastUsed = j.createdAt || new Date().toISOString();
        triggerId = vocab.id;
      }
      return { id: j.id, trackerId: j.trackerId, triggerId, text: j.text, createdAt: j.createdAt || new Date().toISOString() };
    });

    S.searches = (legacyTopics || []).map(t => ({ id: uid(), query: t.l || t.k, keptAt: new Date().toISOString() }));

    S.settings.onboarded = true;
  }

  if (S.trackers.length) S.settings.onboarded = true;

  // v2 -> v3: check-ins and plans become per-tracker. Blended history is
  // assigned to the first visible tracker (the one it was most likely about).
  if ((S.schemaVersion || 0) < 3) {
    const primary = (visibleTrackers()[0] || S.trackers[0] || {}).id || null;
    S.checkins.forEach(c => {
      if (c.trackerId == null && c.question === 'difficulty') c.trackerId = primary;
    });
    S.plans.forEach(p => { if (p.trackerId == null) p.trackerId = primary; });
  }

  S.schemaVersion = SCHEMA;
  await persist('schemaVersion', 'trackers', 'reasons', 'notes', 'checkins', 'plans', 'triggers', 'searches', 'settings');
}

// ---- small helpers -------------------------------------------

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function ymd(d) {
  d = new Date(d);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function todayYMD() { return ymd(new Date()); }
function shiftYMD(days) { return ymd(new Date(Date.now() + days * DAY)); }

function daysSince(iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY)); }
function unit(n) { return n === 1 ? 'day' : 'days'; }

function fmtDayMon(d) { d = new Date(d); return d.getDate() + ' ' + MONTHS[d.getMonth()]; }
function fmtSinceFull(d) { d = new Date(d); return 'since ' + d.getDate() + ' ' + MONTHS_FULL[d.getMonth()]; }
function fmtTime(d) {
  d = new Date(d);
  let h = d.getHours(), m = d.getMinutes();
  const ap = h < 12 ? 'am' : 'pm';
  h = h % 12; if (h === 0) h = 12;
  return h + ':' + String(m).padStart(2, '0') + ap;
}
function fmtStamp(d) { d = new Date(d); return d.getDate() + ' ' + MONTHS[d.getMonth()]; }

const NUM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
function numWord(n) { return n < NUM_WORDS.length ? NUM_WORDS[n] : String(n); }

function visibleTrackers() { return S.trackers.filter(t => !t.hidden).sort((a, b) => (a.order || 0) - (b.order || 0)); }
function orderedTrackers() { return S.trackers.slice().sort((a, b) => (a.order || 0) - (b.order || 0)); }
function trackerById(id) { return S.trackers.find(t => t.id === id); }
function pastBest(t) { return Math.max(0, ...((t.runs || []).map(r => r.length))); }
function reasonsFor(id) { return S.reasons.filter(r => r.trackerId === id).sort((a, b) => new Date(b.writtenAt) - new Date(a.writtenAt)); }
function notesFor(id) { return S.notes.filter(n => n.trackerId === id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
function triggerLabel(id) { const t = S.triggers.find(v => v.id === id); return t ? t.label : null; }
function sortedTriggers() {
  return S.triggers.slice().sort((a, b) =>
    (b.count - a.count) || (new Date(b.lastUsed || 0) - new Date(a.lastUsed || 0)));
}

// ---- check-in derivations -----------------------------------
// Check-ins are per visible tracker: the difficulty question records one row
// per tracker per day. The specialised questions (trigger/plan/week/milestone)
// still fire at most once a day, each about one tracker.

function checkinsOn(date) { return S.checkins.filter(c => c.date === date); }
function difficultyOn(date, trackerId) {
  return S.checkins.find(c => c.date === date && c.question === 'difficulty' && c.trackerId === trackerId && !c.skipped);
}
function specialOn(date) {
  return S.checkins.find(c => c.date === date && ['trigger', 'plan', 'week', 'milestone'].indexOf(c.question) >= 0);
}
function skippedOn(date) { return S.checkins.some(c => c.date === date && c.skipped); }

function yesterdayQuestionType() {
  const rows = checkinsOn(shiftYMD(-1));
  const sp = rows.find(c => ['trigger', 'plan', 'week', 'milestone'].indexOf(c.question) >= 0);
  if (sp) return sp.question;
  if (rows.some(c => c.question === 'difficulty' && !c.skipped)) return 'difficulty';
  if (rows.some(c => c.skipped)) return 'skip';
  return null;
}

function answeredCount(trackerId) {
  return S.checkins.filter(c => !c.skipped && c.question === 'difficulty'
    && (trackerId ? c.trackerId === trackerId : true)).length;
}
function questionsPaused() { return S.skipInfo.pausedUntil && todayYMD() < S.skipInfo.pausedUntil; }

// Has the day's whole check-in been dealt with?
function todaysQuestionDone() {
  const today = todayYMD();
  if (skippedOn(today) || specialOn(today)) return true;
  const vis = visibleTrackers();
  return vis.length > 0 && vis.every(t => difficultyOn(today, t.id));
}

function history14(trackerId) {
  const out = [];
  for (let i = 13; i >= 0; i--) {
    const c = difficultyOn(shiftYMD(-i), trackerId);
    if (c && c.answer === 'rough') out.push({ h: '100%', c: 'var(--chart-hi)' });
    else if (c && c.answer === 'manageable') out.push({ h: '65%', c: 'var(--chart-mid)' });
    else if (c) out.push({ h: '30%', c: 'var(--chart-lo)' });
    else out.push({ h: '12%', c: 'var(--chart-lo)' });
  }
  return out;
}

function patternInfo(trackerId) {
  const answered = S.checkins.filter(c => !c.skipped && c.question === 'difficulty' && c.trackerId === trackerId);
  if (answered.length < PATTERN_THRESHOLD) return { claim: null, weekday: null };
  const tally = [0, 0, 0, 0, 0, 0, 0];
  answered.filter(c => c.answer === 'rough').forEach(c => { tally[new Date(c.date + 'T12:00').getDay()]++; });
  let max = 0, idx = -1;
  tally.forEach((n, i) => { if (n > max) { max = n; idx = i; } });
  if (max < 2) return { claim: null, weekday: null };
  return { claim: WD[idx] + 's are hardest', weekday: idx };
}

function hardWeekdayToday(trackerId) {
  const p = patternInfo(trackerId);
  return (p.weekday !== null && p.weekday === new Date().getDay()) ? p.weekday : null;
}

function resetRecently(trackerId) {
  return S.lastReset && S.lastReset.trackerId === trackerId && (Date.now() - S.lastReset.at < DAY);
}

function planToday(trackerId) {
  return S.plans.find(p => p.date === todayYMD() && (trackerId ? p.trackerId === trackerId : true));
}

function weekNumber() {
  if (!S.trackers.length) return 1;
  const earliest = Math.min(...S.trackers.map(t => new Date(t.start).getTime()));
  return Math.max(1, Math.floor((Date.now() - earliest) / (7 * DAY)) + 1);
}

function weekCounts(trackerId) {
  let easy = 0, manageable = 0, rough = 0;
  for (let i = 0; i < 7; i++) {
    const c = difficultyOn(shiftYMD(-i), trackerId);
    if (!c) continue;
    if (c.answer === 'easy') easy++;
    else if (c.answer === 'manageable') manageable++;
    else if (c.answer === 'rough') rough++;
  }
  const cutoff = Date.now() - 7 * DAY;
  const t = trackerById(trackerId);
  let resets = 0;
  if (t) (t.runs || []).forEach(r => { if (new Date(r.endedOn).getTime() >= cutoff) resets++; });
  return { easy, manageable, rough, resets };
}

function recentNoteThisWeek() {
  const cutoff = Date.now() - 7 * DAY;
  return S.notes
    .filter(n => !n.auto && new Date(n.createdAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

function milestonePending() {
  if (!S.settings.milestoneQuestions) return null;
  for (const t of visibleTrackers()) {
    const d = daysSince(t.start);
    if ([30, 100, 365].indexOf(d) >= 0) {
      const done = S.checkins.some(c => c.question === 'milestone' && c.trackerId === t.id && c.milestoneN === d);
      if (!done) return { trackerId: t.id, n: d };
    }
  }
  return null;
}

// Which question to show, or null for the quiet summary.
function pickQuestion() {
  if (!S.trackers.length) return null;
  const vis = visibleTrackers();
  if (!vis.length) return null;
  if (questionsPaused() || todaysQuestionDone()) return null;

  const yType = yesterdayQuestionType();

  // milestone — a tracker that crossed 30 / 100 / 365 today
  const ms = milestonePending();
  if (ms) return { type: 'milestone', trackerId: ms.trackerId, n: ms.n };

  // trigger — a tracker that was rough yesterday, or reset within a day
  if (yType !== 'trigger') {
    for (const t of vis) {
      const y = difficultyOn(shiftYMD(-1), t.id);
      if ((y && y.answer === 'rough') || resetRecently(t.id)) {
        return { type: 'trigger', trackerId: t.id };
      }
    }
  }

  // the plan — a tracker whose own history flags today as hard
  if (yType !== 'plan' && S.settings.hardDayReminders) {
    for (const t of vis) {
      if (hardWeekdayToday(t.id) !== null && answeredCount(t.id) >= PATTERN_THRESHOLD) {
        return { type: 'plan', trackerId: t.id };
      }
    }
  }

  // the week — Sunday
  if (new Date().getDay() === 0 && yType !== 'week') return { type: 'week' };

  // difficulty — asked for every visible tracker on one screen
  return { type: 'difficulty' };
}

// ---- render root -------------------------------------------

const app = document.getElementById('app');
const layer = document.getElementById('layer');
const toastEl = document.getElementById('toast');

function render() {
  if (!S.settings.onboarded && !S.trackers.length) {
    ui.screen = 'onboarding';
  }
  const screens = {
    onboarding: renderOnboarding,
    home: renderHome,
    reasons: renderReasons,
    detail: renderDetail,
    learn: renderLearn,
    article: renderArticle,
    settings: renderSettings
  };
  app.innerHTML = (screens[ui.screen] || renderHome)();
  layer.innerHTML = ui.layer ? renderLayer() : '';
  bindInputs();
}

function statusbar(right, onRight) {
  return `<div class="statusbar">
    <span>${esc(right && right.left || nowClock())}</span>
    <span class="right" ${onRight ? `onclick="${onRight}"` : ''}>${esc(right && right.text || '')}</span>
  </div>`;
}
function nowClock() { return fmtTime(new Date()).replace(/(am|pm)$/, ''); }

function pinnedBar(trackerId) {
  return `<div class="pinned">
    <button class="craving p-tap" onclick="openCraving(${trackerId ? `'${trackerId}'` : ''})">Craving right now</button>
    <button class="help p-tap" onclick="go('learn')" aria-label="Learn">?</button>
  </div>`;
}

// ---- HOME ---------------------------------------------------

function renderHome() {
  const q = pickQuestion();
  ui._q = q;
  if (q && q.type === 'milestone') return renderMilestoneScreen(q);

  const dateLabel = WD_SHORT[new Date().getDay()] + ' ' + fmtDayMon(new Date());
  const body = q ? renderQuestion(q) : renderQuietSummary();

  return `
    ${statusbar({ text: dateLabel }, 'go(\'settings\')')}
    <div class="scroll pad">
      ${body}
      ${renderHomeLower(q)}
    </div>
    ${pinnedBar()}
  `;
}

function renderQuestion(q) {
  if (q.type === 'difficulty') return renderDifficulty();

  if (q.type === 'trigger') {
    const t = trackerById(q.trackerId);
    const many = visibleTrackers().length > 1;
    const sel = ui.draft.trigger || null;
    const chips = sortedTriggers().map(v => `
      <button class="chip p-tap ${sel === v.id ? 'sel' : ''}" onclick="pickTriggerChip('${v.id}')">${esc(v.label)}</button>`).join('');
    const custom = ui.draft.customOpen
      ? `<input class="field" id="custom-in" placeholder="Name it" value="${esc(ui.draft.customText || '')}" onkeydown="if(event.key==='Enter'){commitCustomTrigger();event.preventDefault();}">`
      : `<button class="chip add p-tap" onclick="openCustomTrigger()">+ something else</button>`;
    return `
      <div class="checkin-head">
        <div class="kicker">${many && t ? esc(t.name) + ' — yesterday was rough' : 'Yesterday was rough'}</div>
        <h2 class="q-title">What was going on?</h2>
      </div>
      <div class="chips">${chips}${custom}</div>
      <div class="q-actions">
        <button class="btn-primary p-tap" onclick="saveTriggerAnswer()">Save</button>
        <div class="link-quiet p-tap" onclick="triggerWriteInstead()">Rather write it out</div>
        <div class="link-quiet p-tap" onclick="skipToday()">Skip today</div>
      </div>
    `;
  }

  if (q.type === 'plan') {
    const t = trackerById(q.trackerId);
    const many = visibleTrackers().length > 1;
    const claim = patternInfo(q.trackerId).claim || 'Today tends to be hard';
    const sel = ui.draft.plan;
    const opts = PLAN_OPTS.map((o, i) => `
      <button class="opt-row p-tap ${sel === i ? 'sel' : ''}" onclick="pickPlan(${i})">${esc(o)}</button>`).join('');
    const other = ui.draft.plan === 'other'
      ? `<input class="field" id="plan-other" placeholder="Something else…" value="${esc(ui.draft.planOther || '')}">`
      : `<button class="opt-row add p-tap" onclick="pickPlan('other')">Something else…</button>`;
    return `
      <div class="checkin-head">
        <div class="kicker">${many && t ? esc(t.name) + ': ' : ''}${esc(claim)}</div>
        <h2 class="q-title">What's the plan for tonight?</h2>
      </div>
      <div class="answers">${opts}${other}</div>
      <div class="q-actions">
        <button class="btn-primary p-tap" onclick="savePlan()">Lock it in</button>
        <button class="btn-outline p-tap" onclick="noPlanToday()">No plan today</button>
        <div class="link-quiet p-tap" onclick="skipToday()">Skip today</div>
      </div>
    `;
  }

  if (q.type === 'week') {
    const vis = visibleTrackers();
    const many = vis.length > 1;
    const lines = vis.map(t => {
      const w = weekCounts(t.id);
      const resets = w.resets === 0 ? (many ? '' : ', no resets') : ', ' + numWord(w.resets) + ' reset' + (w.resets === 1 ? '' : 's');
      const body = `${cap(numWord(w.easy))} easy day${w.easy === 1 ? '' : 's'}, ${numWord(w.rough)} rough${resets}.`;
      return many ? `${esc(t.name)}: ${body}` : body;
    });
    const note = recentNoteThisWeek();
    const noteCard = note ? `
      <div class="week-card">
        <div class="kicker">You wrote ${esc(relDay(note.createdAt))}</div>
        <div class="q">"${esc(note.text)}"</div>
      </div>` : '';
    return `
      <div class="checkin-head">
        <div class="kicker">Week ${weekNumber()}</div>
        <div class="week-statement">${lines.map(l => esc(l)).join('<br>')}</div>
      </div>
      ${noteCard ? `<div style="margin-top:20px">${noteCard}</div>` : ''}
      ${note ? `<div class="week-follow" style="margin-top:22px">Keep this where you'll see it during the next craving?</div>` : ''}
      <div class="q-actions">
        ${note ? `<div class="two-btn">
          <button class="btn-outline p-tap" onclick="weekAnswer(false)">No</button>
          <button class="btn-primary p-tap" style="flex:1.4" onclick="weekAnswer(true)">Keep it</button>
        </div>` : `<button class="btn-primary p-tap" onclick="weekAnswer(false)">Done for the week</button>`}
        <div class="link-quiet p-tap" onclick="skipToday()">Skip today</div>
      </div>
    `;
  }
  return '';
}

function renderDifficulty() {
  const vis = visibleTrackers();
  const today = todayYMD();
  const kicker = answeredCount() === 0 ? 'First check-in' : 'Morning check-in';

  if (vis.length === 1) {
    const t = vis[0];
    const cur = (difficultyOn(today, t.id) || {}).answer;
    return `
      <div class="checkin-head">
        <div class="kicker">${kicker}</div>
        <h2 class="q-title">How hard does today feel?</h2>
      </div>
      <div class="answers">
        ${DIFFICULTY_OPTS.map(o => `
          <button class="answer-row p-tap ${cur === o.key ? 'sel' : ''}" onclick="setDifficulty('${t.id}','${o.key}')">
            <span class="dot"></span><span class="lbl">${esc(o.label)}</span>
          </button>`).join('')}
      </div>
      <div class="skip-link p-tap" onclick="skipToday()">Skip today</div>
    `;
  }

  const rows = vis.map(t => {
    const cur = (difficultyOn(today, t.id) || {}).answer;
    return `
      <div class="tc-block">
        <div class="tc-name"><span class="cdot" style="background:${esc(t.color)}"></span>${esc(t.name)}</div>
        <div class="tc-opts">
          ${[['easy', 'Easy'], ['manageable', 'Manageable'], ['rough', 'Rough']].map(([k, lbl]) => `
            <button class="tc-opt p-tap ${cur === k ? 'sel' : ''}" onclick="setDifficulty('${t.id}','${k}')">${lbl}</button>`).join('')}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="checkin-head">
      <div class="kicker">${kicker}</div>
      <h2 class="q-title">How hard does today feel?</h2>
    </div>
    <div class="tc-list">${rows}</div>
    <div class="skip-link p-tap" onclick="skipToday()">Skip today</div>
  `;
}

function relDay(iso) {
  const d = ymd(iso);
  if (d === todayYMD()) return 'today';
  if (d === shiftYMD(-1)) return 'yesterday';
  return 'on ' + WD[new Date(iso).getDay()];
}

function renderQuietSummary() {
  const vis = visibleTrackers();
  if (!vis.length) {
    return `<div class="summary-note" style="margin-top:40px">Every tracker is hidden right now. Open Settings to bring one back into the daily check-in.</div>`;
  }
  const today = todayYMD();
  const anyRough = vis.some(t => (difficultyOn(today, t.id) || {}).answer === 'rough');
  let noteText;
  if (questionsPaused()) noteText = "Paused the questions for a week — you skipped a few. It'll ask again after that.";
  else if (skippedOn(today)) noteText = "Skipped this morning. The app will ask again tomorrow.";
  else if (specialOn(today)) noteText = "Checked in this morning. Nothing else to do here — the app will ask again tomorrow.";
  else if (anyRough) noteText = "You said today feels rough. Nothing else to do here; the craving button is there if it turns.";
  else noteText = "Checked in this morning. Nothing else to do here — the app will ask again tomorrow.";

  const rows = vis.map(t => {
    const d = daysSince(t.start);
    return `
      <button class="summary-row p-tap" onclick="openDetail('${t.id}')">
        <span class="name-wrap">
          <span class="name"><span class="cdot" style="background:${esc(t.color)}"></span>${esc(t.name)}</span>
          <span class="since">${esc(fmtSinceFull(t.start))}</span>
        </span>
        <span class="count"><span class="num">${d}</span><span class="unit">${unit(d)}</span></span>
      </button>`;
  }).join('');

  return `
    <div class="summary">${rows}</div>
    <div class="summary-note">${esc(noteText)}</div>
  `;
}

function renderHomeLower() {
  const vis = visibleTrackers();
  if (!vis.length) return '';
  const many = vis.length > 1;

  const blocks = vis.map(t => {
    if (answeredCount(t.id) < 3) return '';
    const hist = history14(t.id);
    const p = patternInfo(t.id);
    return `
      <div class="history-block">
        <div class="history-head">
          <div class="kicker">${many ? esc(t.name) + ' · last 14 days' : 'Last 14 days'}</div>
          <div class="pattern-note">${esc(p.claim || '')}</div>
        </div>
        <div class="history-strip">
          ${hist.map(h => `<div class="bar" style="height:${h.h};background:${h.c}"></div>`).join('')}
        </div>
      </div>`;
  });

  const anyStrip = blocks.some(Boolean);
  const dayOneLine = anyStrip
    ? ''
    : `<div class="q-note">Nothing to show here yet. Answer this for a week or two and the app can tell you which days are hardest.</div>`;

  const tiles = vis.map(t => {
    const d = daysSince(t.start);
    return `<button class="tile p-tap" onclick="openDetail('${t.id}')">
      <span class="n">${d}</span><span class="l">${unit(d)}, ${esc(t.name.toLowerCase())}</span>
    </button>`;
  }).join('');

  return `<div class="home-lower">
    ${blocks.join('')}
    ${dayOneLine}
    <div class="tiles">${tiles}</div>
  </div>`;
}

// ---- MILESTONE (full screen, replaces the check-in) --------

function renderMilestoneScreen(q) {
  const t = trackerById(q.trackerId);
  return `
    ${statusbar({ text: 'day ' + q.n })}
    <div class="q-screen">
      <div class="q-scroll">
        <div class="big-num-block">
          <div class="kicker">${esc(t.name)}</div>
          <div class="row"><span class="n">${q.n}</span><span class="unit">days</span></div>
        </div>
        <div style="margin-top:28px;display:flex;flex-direction:column;gap:9px">
          <div class="milestone-q">What's different now that wasn't ${q.n === 365 ? 'a year' : q.n + ' days'} ago?</div>
          <div class="q-note">This gets kept with your reasons. It's the kind of thing that's hard to remember at 9pm on a Friday.</div>
        </div>
        <div style="margin-top:22px">
          <textarea class="serif-input" id="milestone-in" rows="1" placeholder="One line."></textarea>
        </div>
        <div class="q-actions">
          <button class="btn-primary p-tap" onclick="saveMilestone('${t.id}',${q.n})">Keep it</button>
          <div class="link-quiet p-tap" onclick="skipMilestone('${t.id}',${q.n})">Not today</div>
        </div>
      </div>
    </div>
  `;
}

// ---- REASONS ---------------------------------------------

function renderReasons() {
  const trackers = orderedTrackers();
  let filter = ui.reasonsFilter;
  if (!filter || !trackerById(filter)) filter = (trackers[0] || {}).id;
  ui.reasonsFilter = filter;

  const seg = trackers.map(t => `
    <button class="seg p-tap ${t.id === filter ? 'sel' : ''}" onclick="setReasonsFilter('${t.id}')">${esc(t.name)}</button>`).join('');

  const list = reasonsFor(filter);
  const items = list.length
    ? list.map(r => `
      <div class="reason">
        <div class="text">${esc(r.text)}</div>
        <div class="when">written ${esc(fmtStamp(r.writtenAt))}</div>
        <div class="del p-tap" onclick="deleteReason('${r.id}')">Delete</div>
      </div>`).join('')
    : `<div class="empty-note">Nothing written for this one yet. One line is enough — it's what the craving screen will show you.</div>`;

  return `
    ${statusbar({ text: '' })}
    <div class="rs-head">
      <div class="rs-title-row">
        <h1 class="screen-title">Why this matters</h1>
        <span class="done-link p-tap" onclick="go('home')">Done</span>
      </div>
      ${trackers.length > 1 ? `<div class="segmented">${seg}</div>` : ''}
    </div>
    <div class="scroll"><div class="reasons-list">${items}</div></div>
    <div class="rs-foot">
      <button class="add-row p-tap" onclick="openReasonSheet('${filter}')">Add a reason</button>
    </div>
  `;
}

// ---- TRACKER DETAIL -------------------------------------

function renderDetail() {
  const t = trackerById(ui.detailId);
  if (!t) { ui.screen = 'home'; return renderHome(); }
  const d = daysSince(t.start);
  const runs = [{ when: 'now', len: d, cur: true }].concat(
    (t.runs || []).slice().sort((a, b) => new Date(b.endedOn) - new Date(a.endedOn))
      .map(r => ({ when: fmtStamp(r.endedOn), len: r.length, cur: false }))
  );
  const maxRun = Math.max(d, t.best || 0, ...runs.map(r => r.len), 1);
  const pb = pastBest(t);
  const sub = fmtSinceFull(t.start) + ', ' + fmtTime(t.start) + (d >= pb ? ' · your longest run' : ' · best was ' + pb + 'd');

  const runRows = runs.map(r => `
    <div class="run-row">
      <span class="when">${esc(r.when)}</span>
      <span class="rbar" style="width:${Math.max(6, Math.round(r.len / maxRun * 100))}%;background:${r.cur ? 'var(--accent)' : 'var(--chart-lo)'}"></span>
      <span class="len">${r.len}d</span>
    </div>`).join('');

  const notes = notesFor(t.id);
  const noteRows = notes.length
    ? notes.map(n => {
        const lbl = triggerLabel(n.triggerId);
        return `<div class="note-item">
          <div class="meta">${esc(fmtStamp(n.createdAt))}${lbl ? ' · ' + esc(lbl.toLowerCase()) : ''}</div>
          <div class="body">${esc(n.text)}</div>
        </div>`;
      }).join('')
    : `<div class="empty-note" style="padding-top:0">No notes yet.</div>`;

  return `
    ${statusbar({ text: '' })}
    <div class="dt-head">
      <span class="back-link p-tap" onclick="go('home')">Back</span>
      <span class="back-link p-tap" onclick="openTrackerSheet('${t.id}')">Edit</span>
    </div>
    <div class="scroll">
      <div class="dt-body">
        <div class="dt-hero">
          <div class="name"><span class="cdot" style="background:${esc(t.color)}"></span>${esc(t.name)}</div>
          <div class="big"><span class="num">${d}</span><span class="unit">${unit(d)}</span></div>
          <div class="sub">${esc(sub)}</div>
        </div>
        <div class="section">
          <div class="kicker">Every run</div>
          <div class="runs">${runRows}</div>
        </div>
        <div class="section" style="padding-bottom:8px">
          <div class="section-head">
            <div class="kicker">Notes</div>
            <span class="done-link p-tap" onclick="openNoteSheet('${t.id}')">Write one</span>
          </div>
          <div class="notes-list">${noteRows}</div>
        </div>
      </div>
    </div>
    <div class="dt-foot p-tap" onclick="openReset('${t.id}')">Reset the clock</div>
    ${pinnedBar(t.id)}
  `;
}

// ---- LEARN ---------------------------------------------

function renderLearn() {
  const sc = ui.search;
  if (sc.mode === 'typing') return renderSearchTyping();
  if (sc.mode === 'loading') return renderSearchLoading();
  if (sc.mode === 'results') return renderSearchResults();
  if (sc.mode === 'empty') return renderSearchEmpty();

  // landing
  const rec = recommendedArticle();
  const saved = S.articles.slice().sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  const recBlock = rec ? `
    <div class="ln-block">
      <div class="kicker">${esc(rec.kicker)}</div>
      <button class="rec-card p-tap" onclick="openArticle('${rec.article.id}')">
        <span class="t">${esc(rec.article.title)}</span>
        <span class="s">${esc(rec.article.summary)}</span>
        <span class="m">${rec.article.minutes} min read · ${esc(rec.article.source)}</span>
      </button>
    </div>` : '';

  const more = suggestedArticles.filter(a => a.id !== (rec && rec.article.id));
  const moreBlock = more.length ? `
    <div class="ln-block">
      <div class="kicker">Suggested reading</div>
      ${more.map(a => `<button class="saved-item p-tap" onclick="openArticle('${a.id}')">
        <span class="t">${esc(a.title)}</span><span class="m">${a.minutes} min · ${esc(a.source)}</span>
      </button>`).join('')}
    </div>` : '';

  const savedBlock = saved.length ? `
    <div class="ln-block">
      <div class="kicker">Saved</div>
      ${saved.map(a => `<button class="saved-item p-tap" onclick="openArticle('${a.id}')">
        <span class="t">${esc(a.title)}</span><span class="m">${a.minutes} min · ${esc(a.source)}</span>
      </button>`).join('')}
    </div>` : `<div class="ln-block"><div class="kicker">Saved</div><div class="empty-note" style="padding-top:0">Nothing saved yet. Save an article and it's here to read offline.</div></div>`;

  return `
    ${statusbar({ text: '' })}
    <div class="ln-head">
      <div class="ln-title-row">
        <h1 class="screen-title">Learn</h1>
        <span class="done-link p-tap" onclick="go('home')">Done</span>
      </div>
      <input class="search-field" id="search-in" placeholder="Search any habit or addiction"
        onfocus="startTyping()" value="${esc(sc.query)}">
    </div>
    <div class="scroll"><div class="ln-body">${recBlock}${moreBlock}${savedBlock}</div></div>
    ${pinnedBar()}
  `;
}

const SEED_ARTICLE = {
  id: 'seed-stress',
  title: 'Why stress makes an old habit feel like the only option',
  source: 'Harvard Health', minutes: 6,
  summary: 'Under load, the brain reaches for whatever is most rehearsed. Naming that as mechanics rather than weakness makes it easier to interrupt.',
  url: 'https://www.health.harvard.edu/staying-healthy/how-to-break-a-bad-habit',
  body: 'Under cognitive load, the brain shifts decision-making away from the slow, deliberate system and toward whatever behaviour is most rehearsed. This is efficient. It is also why a decision you made calmly on Sunday has so little purchase on Friday night.\n\nThe practical consequence is that willpower is the wrong lever. What changes outcomes is reducing the number of decisions the stressed version of you has to make — deciding in advance, removing the cue, or having a single rehearsed alternative ready.\n\nNaming this as mechanics rather than weakness matters more than it sounds.'
};

function topTriggerLast30() {
  const cutoff = Date.now() - 30 * DAY;
  const tally = {};
  S.notes.filter(n => n.triggerId && new Date(n.createdAt).getTime() >= cutoff)
    .forEach(n => { tally[n.triggerId] = (tally[n.triggerId] || 0) + 1; });
  let id = null, n = 0;
  Object.keys(tally).forEach(k => { if (tally[k] > n) { n = tally[k]; id = k; } });
  return n >= 2 ? { id, n, label: triggerLabel(id) } : null;
}

function recommendedArticle() {
  const top = topTriggerLast30();
  const pool = suggestedArticles.length ? suggestedArticles : [SEED_ARTICLE];

  let article = pool[0];
  if (top) {
    const needle = top.label.toLowerCase();
    article = pool.find(a => (a.title + ' ' + a.summary).toLowerCase().indexOf(needle) >= 0) || pool[0];
  }

  const kicker = top
    ? `Because you logged "${top.label.toLowerCase()}" ${top.n} times`
    : (suggestedArticles.length ? 'For what you\'re working on' : 'A place to start');

  return { kicker, article: articleForRead(article) };
}

function articleForRead(a) {
  return S.articles.find(x => x.id === a.id) || a;
}

function renderSearchTyping() {
  const sc = ui.search;
  const suggestions = buildSuggestions(sc.query);
  const kept = S.searches.slice().sort((a, b) => new Date(b.keptAt) - new Date(a.keptAt));
  return `
    ${statusbar({ text: 'Cancel' }, 'cancelSearch()')}
    <div class="ln-head">
      <input class="search-field" id="search-in" placeholder="Search any habit or addiction"
        value="${esc(sc.query)}" oninput="onSearchInput(this.value)"
        onkeydown="if(event.key==='Enter'){commitSearch();event.preventDefault();}">
    </div>
    <div class="scroll pad" style="padding-top:20px">
      <div class="kicker" style="padding-bottom:10px">Suggestions</div>
      ${suggestions.map(s => `<button class="suggest-row p-tap" onclick="commitSearch('${esc(s.q).replace(/'/g, "\\'")}')">
        <span>${esc(s.label)}</span>${s.ts ? `<span class="ts">${esc(s.ts)}</span>` : ''}
      </button>`).join('')}
      <div style="margin-top:20px;display:flex;flex-direction:column;gap:10px">
        <div class="kicker">You track</div>
        <div class="chips" style="margin-top:0">
          ${visibleTrackers().map(t => `<button class="chip p-tap" onclick="commitSearch('${esc(t.name).replace(/'/g, "\\'")}')">${esc(t.name)}</button>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function buildSuggestions(query) {
  const q = (query || '').trim().toLowerCase();
  const out = [];
  if (q) {
    out.push({ label: q + ' — how long it lasts', q: q + ' how long it lasts' });
    out.push({ label: q + ' triggers', q: q + ' triggers' });
  }
  S.searches.slice().sort((a, b) => new Date(b.keptAt) - new Date(a.keptAt)).forEach(s => {
    if (!q || s.query.toLowerCase().indexOf(q) >= 0) out.push({ label: s.query, q: s.query, ts: 'searched ' + fmtStamp(s.keptAt) });
  });
  return out.slice(0, 6);
}

function renderSearchLoading() {
  return `
    ${statusbar({ text: 'Cancel' }, 'cancelSearch()')}
    <div class="ln-head">
      <div class="search-field">${esc(ui.search.query)}</div>
    </div>
    <div class="scroll pad" style="padding-top:26px;gap:22px">
      ${['82%,56%', '70%,44%', '88%,40%'].map((w, i) => {
        const [a, b] = w.split(',');
        return `<div class="skeleton-row ${i === 2 ? 'dim' : ''}">
          <div class="sk" style="width:${a}"></div>
          <div class="sk" style="width:${b}"></div>
          ${i < 2 ? '<div class="sk thin" style="width:32%"></div>' : ''}
        </div>`;
      }).join('')}
    </div>
    <div class="search-net-note">Looking this up online. Your trackers and notes aren't part of the search.</div>
  `;
}

function renderSearchResults() {
  const sc = ui.search;
  const results = sc.results || [];
  return `
    ${statusbar({ text: 'Cancel' }, 'cancelSearch()')}
    <div class="ln-head">
      <div class="search-field p-tap" onclick="startTyping()">${esc(sc.query)}</div>
      <div class="result-meta-row">
        <span class="count">${results.length} result${results.length === 1 ? '' : 's'}</span>
        <span class="keep p-tap" onclick="keepSearch()">Keep this search</span>
      </div>
    </div>
    <div class="scroll pad" style="padding-top:18px">
      ${results.map(r => {
        const savedId = 'res-' + hash(r.url);
        const isSaved = S.articles.some(a => a.id === savedId);
        return `<div class="result">
          <div class="src">${esc(r.source)} · ${r.minutes} min</div>
          <div class="t p-tap" onclick="openResult('${savedId}')" style="cursor:pointer">${esc(r.title)}</div>
          <div class="s">${esc(r.summary)}</div>
          <div class="save p-tap ${isSaved ? 'on' : ''}" onclick="toggleSaveResult('${savedId}')">${isSaved ? 'Saved' : 'Save'}</div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function renderSearchEmpty() {
  const reasonsN = S.reasons.length;
  const savedN = S.articles.length;
  return `
    ${statusbar({ text: 'Cancel' }, 'cancelSearch()')}
    <div class="ln-head">
      <div class="search-field p-tap" onclick="startTyping()">${esc(ui.search.query)}</div>
    </div>
    <div class="scroll pad" style="padding-top:34px;gap:26px">
      <div style="display:flex;flex-direction:column;gap:9px">
        <div class="week-statement" style="font-size:25px">Nothing came back for that.</div>
        <div class="q-note">Either the spelling is off or you're offline. Reading isn't the only thing that helps — these work either way.</div>
      </div>
      <div class="nf-list">
        <button class="nf-row p-tap" onclick="go('reasons')"><span>Read your ${reasonsN} reason${reasonsN === 1 ? '' : 's'}</span><span class="why">on this phone</span></button>
        <button class="nf-row p-tap" onclick="cancelSearch()"><span>Your ${savedN} saved article${savedN === 1 ? '' : 's'}</span><span class="why">already downloaded</span></button>
        <button class="nf-row p-tap" onclick="startBreathing()"><span>Breathe for a minute</span><span class="why">no network needed</span></button>
      </div>
    </div>
  `;
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return Math.abs(h).toString(36); }

// ---- ARTICLE READER -----------------------------------

function renderArticle() {
  const a = findArticle(ui.articleId);
  if (!a) { ui.screen = 'learn'; return renderLearn(); }
  const isSaved = S.articles.some(x => x.id === a.id);
  const paras = (a.body || 'Saved for offline reading. Open the original for the full text.').split('\n').filter(Boolean);
  return `
    <div class="statusbar">
      <span class="right p-tap" onclick="backFromArticle()" style="color:var(--accent-bright)">Back</span>
      <span class="right p-tap" onclick="toggleSaveArticle()" style="color:var(--accent-bright)">${isSaved ? 'Saved' : 'Save'}</span>
    </div>
    <div class="scroll">
      <div class="art-body">
        <div style="display:flex;flex-direction:column;gap:9px">
          <div class="art-src">${esc(a.source)} · ${a.minutes} min</div>
          <div class="art-title">${esc(a.title)}</div>
        </div>
        <div class="art-rule"></div>
        <div class="art-copy">${paras.map(p => `<div>${esc(p)}</div>`).join('')}</div>
        ${a.url ? `<div style="padding-bottom:8px"><a href="${esc(a.url)}" target="_blank" rel="noopener" style="color:var(--accent-bright);font-size:13.5px">Open the original ↗</a></div>` : ''}
      </div>
    </div>
    <div class="art-foot">
      <button class="btn-outline p-tap" onclick="writeFromArticle()">Write what this made me think</button>
    </div>
  `;
}

function findArticle(id) {
  return S.articles.find(a => a.id === id)
    || (ui._transientArticles || []).find(a => a.id === id)
    || suggestedArticles.find(a => a.id === id)
    || (id === SEED_ARTICLE.id ? SEED_ARTICLE : null)
    || null;
}

// ---- SETTINGS ----------------------------------------

function renderSettings() {
  const trackers = orderedTrackers();
  const trackRows = trackers.map(t => {
    const d = daysSince(t.start);
    return `<div class="track-row p-tap ${t.hidden ? 'hidden-tracker' : ''}" data-id="${t.id}" onclick="trackRowClick(event,'${t.id}')">
      <span class="cdot" style="background:${esc(t.color)}"></span>
      <span class="name">${esc(t.name)}</span>
      <span class="d">${t.hidden ? 'hidden' : d + 'd'}</span>
      <span class="handle" aria-label="Drag to reorder">⋮⋮</span>
    </div>`;
  }).join('');

  const tog = on => `<span class="toggle ${on ? 'on' : ''}"><span class="knob"></span></span>`;

  return `
    ${statusbar({ text: 'Done' }, 'go(\'home\')')}
    <div class="ln-head"><h1 class="screen-title">Settings</h1></div>
    <div class="scroll">
      <div class="set-body">
        <div class="set-group">
          <div class="kicker">Tracking</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${trackRows}
            <button class="dashed-row p-tap" onclick="openTrackerSheet(null)">Add something to track</button>
          </div>
        </div>

        <div class="set-group tight">
          <div class="kicker">Check-in</div>
          <label class="set-line" style="cursor:pointer;position:relative">
            <span class="lbl">Ask me</span>
            <span class="val">Mornings, ${esc(fmtAskAt(S.settings.askAt))}</span>
            <input type="time" value="${esc(S.settings.askAt)}" onchange="setAskAt(this.value)"
              style="position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer" aria-label="Check-in time">
          </label>
          <button class="set-line p-tap" onclick="toggleSetting('hardDayReminders')">
            <span class="lbl">Remind me on hard days</span>${tog(S.settings.hardDayReminders)}
          </button>
          <button class="set-line p-tap" onclick="toggleSetting('milestoneQuestions')">
            <span class="lbl">Milestone questions</span>${tog(S.settings.milestoneQuestions)}
          </button>
        </div>

        <div class="set-group tight">
          <div class="kicker">Online</div>
          <button class="set-line p-tap" onclick="toggleSetting('onlineExtras')">
            <span class="stack">
              <span class="lbl">Quotes &amp; suggested reading</span>
              <span class="sub">Fetched on launch. The reflection lines send your written reasons to build them; nothing else leaves the device.</span>
            </span>${tog(S.settings.onlineExtras)}
          </button>
        </div>

        <div class="set-group tight">
          <div class="kicker">Your data</div>
          <button class="set-line p-tap" onclick="exportData()">
            <span class="stack"><span class="lbl">Export everything</span><span class="sub">A file you can keep. Nothing leaves the phone otherwise.</span></span>
          </button>
          <button class="set-line danger p-tap" onclick="openDeleteAll()"><span class="lbl">Delete all data</span></button>
        </div>
      </div>
    </div>
  `;
}

// ---- ONBOARDING -------------------------------------

function renderOnboarding() {
  if (ui.onboardStep === 1) {
    const sel = ui.draft.colorIdx == null ? 0 : ui.draft.colorIdx;
    return `
      <div class="statusbar"><span></span><span></span></div>
      <div class="ob-body">
        <div style="display:flex;flex-direction:column;gap:9px">
          <div class="ob-brand">Free</div>
          <div class="ob-sub">Stays on this phone. No account, no sync, nobody else sees it.</div>
        </div>
        <div class="ob-group">
          <div class="kicker">What are you working on?</div>
          <input class="field" id="ob-name" placeholder="Name it" value="${esc(ui.draft.name || '')}">
          <div class="chips" style="margin-top:4px">
            ${NAME_SUGGESTIONS.map(n => `<button class="chip sm p-tap" onclick="obPickName('${n}')">${n}</button>`).join('')}
          </div>
        </div>
        <div class="ob-group">
          <div class="kicker">Colour</div>
          <div class="swatches">
            ${SWATCHES.map((c, i) => `<button class="swatch ${i === sel ? 'sel' : ''}" style="background:${c}" onclick="obPickColor(${i})"></button>`).join('')}
          </div>
        </div>
        <div class="ob-group">
          <div class="kicker">Clean since</div>
          <div class="ob-options">
            <button class="ob-opt ${ui.draft.startMode !== 'pick' ? 'sel' : ''}" onclick="obStartMode('today')">Today</button>
            <button class="ob-opt ${ui.draft.startMode === 'pick' ? 'sel' : ''}" onclick="obStartMode('pick')">Pick a date</button>
          </div>
          ${ui.draft.startMode === 'pick' ? `<input type="datetime-local" class="field" id="ob-start" value="${esc(ui.draft.startVal || localNow())}">` : ''}
        </div>
        <div class="ob-foot">
          <button class="btn-primary p-tap" onclick="obNext()">Next — why it matters</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="statusbar"><span></span><span></span></div>
    <div class="ob-body">
      <div class="ob-rule"><span class="on"></span><span class="on"></span><span></span></div>
      <div style="display:flex;flex-direction:column;gap:9px">
        <div class="q-title" style="font-size:29px">Why does stopping matter to you?</div>
        <div class="q-note">One line is enough. This is what the app shows you mid-craving, so write it for that version of you.</div>
      </div>
      <div style="margin-top:24px">
        <textarea class="serif-input" id="ob-reason" rows="1" placeholder="Be specific. Vague reasons don't hold up at 9pm."></textarea>
      </div>
      <div class="q-note" style="margin-top:20px;font-size:13px;color:var(--text-faint)">You can add more later, and the app will ask for one after your first hard day.</div>
      <div class="ob-foot">
        <button class="btn-primary p-tap" onclick="obFinish(true)">Done — open the app</button>
        <div class="link-quiet p-tap" onclick="obFinish(false)">Skip — the craving screen will be emptier</div>
      </div>
    </div>
  `;
}

function localNow() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function fmtAskAt(hhmm) {
  const [h, m] = (hhmm || '08:30').split(':').map(Number);
  const ap = h < 12 ? 'am' : 'pm';
  let hh = h % 12; if (hh === 0) hh = 12;
  return hh + ':' + String(m).padStart(2, '0') + ap;
}

// ---- LAYER: sheets & overlays ----------------------

function renderLayer() {
  const L = ui.layer;
  if (L === 'craving') return sheet(renderCravingSheet());
  if (L === 'reset') return sheet(renderResetSheet());
  if (L === 'note') return sheet(renderNoteSheet());
  if (L === 'reason') return sheet(renderReasonSheet());
  if (L === 'tracker') return sheet(renderTrackerSheet());
  if (L === 'deleteAll') return sheet(renderDeleteAllSheet());
  if (L === 'breathe') return renderBreatheOverlay();
  if (L === 'timer') return renderTimerOverlay();
  if (L === 'tap') return renderTapOverlay();
  if (L === 'reminder') return renderReminderOverlay();
  if (L === 'slip') return renderSlipOverlay();
  return '';
}

function sheet(inner) {
  return `<div class="scrim" style="width:100%;max-width:440px">
    <div class="catch p-tap" onclick="closeLayer()"></div>
    <div class="sheet"><div class="handle"></div>${inner}</div>
  </div>`;
}

function cravingTracker() {
  if (ui.draft.cravingTrackerId) return trackerById(ui.draft.cravingTrackerId) || null;
  const vis = visibleTrackers();
  if (!vis.length) return null;
  const rough = vis.filter(t => (difficultyOn(todayYMD(), t.id) || {}).answer === 'rough');
  const pool = rough.length ? rough : vis;
  return pool.slice().sort((a, b) => daysSince(a.start) - daysSince(b.start))[0];
}

function renderCravingSheet() {
  const t = cravingTracker();
  const rough = t && (difficultyOn(todayYMD(), t.id) || {}).answer === 'rough';
  const plan = t && planToday(t.id);
  const kicker = WD[new Date().getDay()] + ', ' + fmtTime(new Date());
  let line;
  if (plan && !plan.skipped && (plan.choice || plan.custom)) {
    line = `Tonight's plan: ${plan.custom || plan.choice}. It'll still peak and fade in about fifteen minutes.`;
  } else if (rough) {
    line = "You already knew today would be hard. It'll still peak and fade in about fifteen minutes.";
  } else {
    line = "It'll peak and fade in about fifteen minutes. You've been here before.";
  }
  const nReasons = t ? reasonsFor(t.id).length : S.reasons.length;

  return `
    <div style="display:flex;flex-direction:column;gap:7px">
      <div class="kicker">${esc(kicker)}</div>
      <div class="craving-line">${esc(line)}</div>
    </div>
    <div class="reco">
      <div class="k">Start here</div>
      <div class="t">Breathe for one minute, then decide.</div>
      <div class="s">You don't have to commit to anything past the minute.</div>
      <button class="go p-tap" onclick="startBreathing()">Begin</button>
    </div>
    <div class="quiet-list">
      <button class="quiet-row p-tap" onclick="cravingToReasons()"><span class="lbl">Read your ${nReasons} reason${nReasons === 1 ? '' : 's'}</span><span class="dur">1 min</span></button>
      <button class="quiet-row p-tap" onclick="startTimer()"><span class="lbl">Set a 10-minute delay</span><span class="dur">10 min</span></button>
      <button class="quiet-row p-tap" onclick="startTap()"><span class="lbl">Tap it out</span><span class="dur">for your hands</span></button>
      <button class="quiet-row p-tap" onclick="startReminder()"><span class="lbl">A line to sit with</span><span class="dur">a moment</span></button>
      <button class="quiet-row p-tap" onclick="cravingToNote()"><span class="lbl">Write down what set this off</span><span class="dur">2 min</span></button>
    </div>
    <div class="link-quiet p-tap" onclick="closeLayer()" style="padding-bottom:4px">It passed — close this</div>
  `;
}

function renderResetSheet() {
  const t = trackerById(ui.draft.trackerId);
  const d = daysSince(t.start);
  const longest = d >= pastBest(t) && d > 0;
  return `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="reset-title">Start the ${esc(t.name.toLowerCase())} clock again?</div>
      <div class="reset-body">The ${d} ${unit(d)} stay in your history${longest ? " — they're the longest run you've had." : '.'} Nothing you wrote goes away.</div>
    </div>
    <label class="when-row">
      <span class="k">When did it happen?</span>
      <input type="datetime-local" class="v" id="reset-when" value="${esc(localNow())}">
    </label>
    <div style="display:flex;flex-direction:column;gap:11px">
      <button class="btn-outline p-tap" onclick="closeLayer()">Never mind</button>
      <button class="btn-danger p-tap" onclick="confirmReset()">Reset the clock</button>
    </div>
  `;
}

function renderNoteSheet() {
  syncDraft();
  const d = ui.draft;
  const t = trackerById(d.trackerId) || visibleTrackers()[0];
  d.trackerId = t.id;
  const sel = d.triggerId;
  const chips = sortedTriggers().slice(0, 8).map(v => `
    <button class="chip sm p-tap ${sel === v.id ? 'sel' : ''}" onclick="noteTrigger('${v.id}')">${esc(v.label)}</button>`).join('');
  const custom = d.customOpen
    ? `<input class="field" id="custom-in" placeholder="Name it" value="${esc(d.customText || '')}" onkeydown="if(event.key==='Enter'){commitCustomTrigger();event.preventDefault();}">`
    : `<button class="chip add sm p-tap" onclick="openCustomTrigger()">+ new</button>`;

  return `
    <div class="sheet-title-row">
      <span class="sheet-title">Note</span>
      ${trackerPill(t)}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="kicker">What set it off</div>
      <div class="chips" style="margin-top:0">${chips}${custom}</div>
    </div>
    <textarea class="note-input" id="note-text" placeholder="What happened, what you did instead, what you want to remember">${esc(d.noteText || '')}</textarea>
    <div class="sheet-foot">
      <button class="discard p-tap" onclick="closeLayer()">Discard</button>
      <button class="save p-tap" onclick="saveNote()">Save</button>
    </div>
  `;
}

function renderReasonSheet() {
  syncDraft();
  const d = ui.draft;
  const t = trackerById(d.trackerId) || visibleTrackers()[0];
  d.trackerId = t.id;
  const pi = d.promptIdx == null ? 0 : d.promptIdx;
  return `
    <div class="sheet-title-row">
      <span class="sheet-title">A reason</span>
      ${trackerPill(t)}
    </div>
    <div class="rotating-prompt">${esc(REASON_PROMPTS[pi % REASON_PROMPTS.length])}</div>
    <textarea class="serif-input" id="reason-text" rows="2" placeholder="Be specific. Vague reasons don't hold up at 9pm.">${esc(d.reasonText || '')}</textarea>
    <div class="sheet-foot">
      <button class="discard p-tap" onclick="cycleReasonPrompt()">Different prompt</button>
      <button class="save p-tap" onclick="saveReason()">Save</button>
    </div>
  `;
}

function trackerPill(t) {
  return `<span class="track-pill"><span class="cdot" style="background:${esc(t.color)}"></span>${esc(t.name)}</span>`;
}

function renderTrackerSheet() {
  syncDraft();
  const d = ui.draft;
  const editing = !!d.trackerId && !!trackerById(d.trackerId);
  const t = editing ? trackerById(d.trackerId) : null;
  if (d.name == null) d.name = t ? t.name : '';
  if (d.colorIdx == null) d.colorIdx = t ? Math.max(0, SWATCHES.indexOf(t.color)) : 0;
  if (d.startVal == null) d.startVal = t ? isoToLocal(t.start) : localNow();
  if (d.hidden == null) d.hidden = t ? !!t.hidden : false;

  return `
    <div class="sheet-title">${editing ? esc(t.name) : 'Add a tracker'}</div>
    <div style="display:flex;flex-direction:column;gap:9px">
      <div class="kicker">Name</div>
      <input class="field" id="tr-name" placeholder="Name it" value="${esc(d.name)}">
      ${editing ? '' : `<div class="chips" style="margin-top:4px">${NAME_SUGGESTIONS.map(n => `<button class="chip sm p-tap" onclick="trName('${n}')">${n}</button>`).join('')}</div>`}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div class="kicker">Colour</div>
      <div class="swatches">
        ${SWATCHES.map((c, i) => `<button class="swatch ${i === d.colorIdx ? 'sel' : ''}" style="background:${c}" onclick="trColor(${i})"></button>`).join('')}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:9px">
      <div class="kicker">Clock started</div>
      <input type="datetime-local" class="field" id="tr-start" value="${esc(d.startVal)}">
      <div class="sub" style="font-size:12.5px;color:var(--text-faint)">Editing this moves the current run only. Past runs stay where they are.</div>
    </div>
    <div class="set-line" style="border-top:1px solid var(--hairline);border-bottom:0;padding:14px 0">
      <span class="stack"><span class="lbl">Hide from home</span><span class="sub">Clock keeps running</span></span>
      <button class="toggle ${d.hidden ? 'on' : ''}" onclick="trToggleHidden()"><span class="knob"></span></button>
    </div>
    <div class="two-btn">
      <button class="btn-outline p-tap" onclick="closeLayer()">Cancel</button>
      <button class="btn-primary p-tap" onclick="saveTracker()">Save</button>
    </div>
    ${editing ? `<div class="link-quiet p-tap" style="color:var(--danger)" onclick="deleteTracker('${t.id}')">Delete ${esc(t.name)} and everything in it</div>` : ''}
  `;
}

function isoToLocal(iso) { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }

function renderDeleteAllSheet() {
  return `
    <div class="reset-title">Delete everything?</div>
    <div class="reset-body">Every tracker, reason, note and check-in. There's no backup and no undo — export first if you might want it back.</div>
    <div style="display:flex;flex-direction:column;gap:11px">
      <button class="btn-outline p-tap" onclick="closeLayer()">Keep my data</button>
      <button class="btn-danger p-tap" onclick="deleteAll()">Delete all data</button>
    </div>
  `;
}

// ---- overlays -------------------------------------

function renderBreatheOverlay() {
  const b = ui.breath;
  return `<div class="overlay center" style="width:100%;max-width:440px">
    <div class="breathe-cycle">cycle ${b.cycle} of 6</div>
    <div class="breathe-circle"><span class="lbl">${b.inhale ? 'Breathe in' : 'Breathe out'}</span></div>
    <div class="stack">
      <div class="instruction">Four counts in, six out. Let the circle set the pace.</div>
      <button class="done p-tap" onclick="closeLayer()">I'm done</button>
    </div>
  </div>`;
}

function renderTimerOverlay() {
  const t = ui.timer;
  const m = Math.floor(t.left / 60), s = t.left % 60;
  const sub = t.left === 0
    ? "That's ten minutes. You didn't act on it."
    : "Ride it out till this hits zero. You don't have to decide anything else right now.";
  return `<div class="overlay center" style="width:100%;max-width:440px">
    <div class="timer-digits">${m}:${String(s).padStart(2, '0')}</div>
    <div class="instruction">${esc(sub)}</div>
    <div class="stack">
      ${t.left > 0 ? `<button class="timer-btn p-tap" onclick="toggleTimer()">${t.running ? 'Pause' : 'Resume'}</button>` : ''}
      <button class="done faint p-tap" onclick="closeLayer()">I'm done</button>
    </div>
  </div>`;
}

function renderTapOverlay() {
  return `<div class="overlay center" style="width:100%;max-width:440px">
    <button class="tap-circle p-tap" id="tap-circle" onclick="doTap()">
      <span class="n">${ui.tap}</span><span class="l">tap</span>
    </button>
    <div class="instruction">No score. This is just for your hands.</div>
    <button class="done p-tap" onclick="closeLayer()">I'm done</button>
  </div>`;
}

function renderReminderOverlay() {
  const q = ui.reminder || (ui.reminder = pickReminder());
  let attribution;
  if (q.src === 'personal') attribution = 'written for you, from your reasons';
  else if (q.a === 'your own words') attribution = 'your own words';
  else if (q.a && q.a !== '—') attribution = '— ' + q.a;
  else attribution = 'sit with this one';
  return `<div class="overlay center" style="width:100%;max-width:440px">
    <div class="reminder-block">
      <div class="reminder-quote">${esc(q.t)}</div>
      <div class="reminder-src">${esc(attribution)}</div>
    </div>
    <div class="stack">
      <button class="timer-btn p-tap" onclick="anotherReminder()">Another</button>
      <button class="done faint p-tap" onclick="closeLayer()">I'm done</button>
    </div>
  </div>`;
}

function renderSlipOverlay() {
  const t = trackerById(ui.draft.trackerId);
  const lastRun = (t.runs || [])[0];
  const runLen = lastRun ? lastRun.length : 0;
  const prevBest = ui.draft.prevBest != null ? ui.draft.prevBest : (t.best || 0);
  const nRuns = (t.runs || []).length;
  const sel = ui.draft.trigger;
  const chips = sortedTriggers().slice(0, 6).map(v => `
    <button class="chip sm p-tap ${sel === v.id ? 'sel' : ''}" onclick="slipTrigger('${v.id}')">${esc(v.label)}</button>`).join('');
  const custom = ui.draft.customOpen
    ? `<input class="field" id="custom-in" placeholder="Name it" onkeydown="if(event.key==='Enter'){commitCustomTrigger();event.preventDefault();}">`
    : `<button class="chip add sm p-tap" onclick="openCustomTrigger()">+ other</button>`;

  return `<div class="overlay q" style="width:100%;max-width:440px">
    <div class="q-scroll">
      <div class="big-num-block">
        <div class="kicker">${esc(t.name)} · clock restarted</div>
        <div class="row"><span class="n zero">0</span><span class="unit">days</span></div>
      </div>
      <div class="slip-card" style="margin-top:22px">
        <div class="a">That run was ${runLen} ${unit(runLen)}.${prevBest && prevBest !== runLen ? ' Your previous best was ' + prevBest + '.' : ''}</div>
        <div class="b">${cap(numWord(nRuns))} run${nRuns === 1 ? '' : 's'} recorded.</div>
      </div>
      <div class="slip-q" style="margin-top:24px">What was going on, while it's fresh?</div>
      <div class="chips" style="margin-top:16px">${chips}${custom}</div>
      <div class="q-actions">
        <button class="btn-primary p-tap" onclick="saveSlipTrigger()">Save and carry on</button>
        <div class="link-quiet p-tap" onclick="closeSlip()">Not now</div>
      </div>
    </div>
  </div>`;
}

// ---- input binding (restore focus / values after re-render) ---

function bindInputs() {
  const s = document.getElementById('search-in');
  if (s && ui.search.mode === 'typing') { s.focus(); const v = s.value; s.value = ''; s.value = v; }
  ['note-text', 'reason-text', 'milestone-in', 'ob-reason', 'custom-in', 'plan-other', 'tr-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el && ui._focusId === id) { el.focus(); const v = el.value; el.value = ''; el.value = v; }
  });
  // autofocus writing sheets
  if (ui.layer === 'note' && !ui._focusId) focusEl('note-text');
  if (ui.layer === 'reason' && !ui._focusId) focusEl('reason-text');
  if (ui.screen === 'settings') initReorder();
}

function initReorder() {
  const rows = document.querySelectorAll('.set-body .track-row');
  if (!rows.length) return;
  const list = rows[0].parentElement;
  rows.forEach(row => {
    const handle = row.querySelector('.handle');
    if (!handle) return;
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      row._noClick = true;
      row.style.opacity = '.6';
      const move = ev => {
        list.querySelectorAll('.track-row').forEach(r => {
          if (r === row) return;
          const b = r.getBoundingClientRect();
          if (ev.clientY > b.top && ev.clientY < b.bottom) {
            list.insertBefore(row, ev.clientY > b.top + b.height / 2 ? r.nextSibling : r);
          }
        });
      };
      const up = async () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        row.style.opacity = '';
        [...list.querySelectorAll('.track-row')].forEach((r, i) => {
          const t = trackerById(r.dataset.id); if (t) t.order = i;
        });
        await persist('trackers');
        render();
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  });
}
function focusEl(id) { const el = document.getElementById(id); if (el) { el.focus(); } }

function syncDraft() {
  const grab = (id, key) => { const el = document.getElementById(id); if (el) ui.draft[key] = el.value; };
  grab('note-text', 'noteText');
  grab('reason-text', 'reasonText');
  grab('custom-in', 'customText');
  grab('tr-name', 'name');
  grab('tr-start', 'startVal');
  grab('plan-other', 'planOther');
}

// ---- toast --------------------------------------

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(_timers.toast);
  _timers.toast = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

// ---- navigation --------------------------------

function go(screen) {
  stopClocks();
  ui.screen = screen;
  ui.layer = null;
  ui._focusId = null;
  if (screen !== 'learn') ui.search = { mode: 'idle', query: '', results: null, error: false };
  render();
}
function openDetail(id) { stopClocks(); ui.detailId = id; ui.screen = 'detail'; ui.layer = null; render(); }
function closeLayer() { stopClocks(); ui.layer = null; ui._focusId = null; render(); }

// ---- check-in actions -------------------------

// Records a once-a-day question (trigger / plan / week / milestone). Clears any
// earlier answer to the same question and any skip marker for today.
async function recordCheckin(fields) {
  const date = todayYMD();
  S.checkins = S.checkins.filter(c => !(c.date === date && (c.question === fields.question || c.skipped)));
  S.checkins.push(Object.assign({ date, at: new Date().toISOString(), skipped: false, trackerId: null }, fields));
  if (!fields.skipped) { S.skipInfo.streak = 0; S.skipInfo.pausedUntil = null; }
  await persist('checkins', 'skipInfo');
}

async function setDifficulty(trackerId, key) {
  const date = todayYMD();
  S.checkins = S.checkins.filter(c =>
    !(c.date === date && ((c.question === 'difficulty' && c.trackerId === trackerId) || c.skipped)));
  S.checkins.push({ date, at: new Date().toISOString(), question: 'difficulty', trackerId, answer: key, skipped: false });
  S.skipInfo.streak = 0;
  S.skipInfo.pausedUntil = null;
  await persist('checkins', 'skipInfo');
  ui.draft = {};
  render();
  if (todaysQuestionDone()) {
    const anyRough = visibleTrackers().some(t => (difficultyOn(todayYMD(), t.id) || {}).answer === 'rough');
    toast(anyRough
      ? "Noted. There's a craving button under your thumb whenever you need it."
      : 'Noted. See you tomorrow.');
  }
}

async function skipToday() {
  S.skipInfo.streak = (S.skipInfo.streak || 0) + 1;
  if (S.skipInfo.streak >= 3) S.skipInfo.pausedUntil = shiftYMD(7);
  const date = todayYMD();
  S.checkins = S.checkins.filter(c => c.date !== date);
  S.checkins.push({ date, at: new Date().toISOString(), question: 'skip', trackerId: null, answer: null, skipped: true });
  await persist('checkins', 'skipInfo');
  ui.draft = {};
  render();
  toast('Skipped. Three in a row and it stops asking for a week.');
}

function pickTriggerChip(id) { syncDraft(); ui.draft.trigger = ui.draft.trigger === id ? null : id; render(); }
function openCustomTrigger() { syncDraft(); ui.draft.customOpen = true; ui._focusId = 'custom-in'; render(); }
async function commitCustomTrigger() {
  const el = document.getElementById('custom-in');
  const label = (el && el.value || '').trim();
  if (!label) { ui.draft.customOpen = false; render(); return; }
  const v = { id: uid(), label: cap(label), count: 0, lastUsed: null };
  S.triggers.push(v);
  await persist('triggers');
  ui.draft.customOpen = false;
  ui.draft.customText = '';
  ui._focusId = null;
  if (ui.layer === 'note') ui.draft.triggerId = v.id;
  else if (ui.layer === 'slip') ui.draft.trigger = v.id;
  else ui.draft.trigger = v.id;
  render();
}

async function bumpTrigger(id) {
  const v = S.triggers.find(x => x.id === id);
  if (v) { v.count++; v.lastUsed = new Date().toISOString(); await persist('triggers'); }
}

function qTrackerId() { return (ui._q || {}).trackerId || null; }

async function saveTriggerAnswer() {
  syncDraft();
  const id = ui.draft.trigger;
  if (!id) { toast('Pick what was going on, or skip.'); return; }
  const tId = qTrackerId();
  await bumpTrigger(id);
  await recordCheckin({ question: 'trigger', trackerId: tId, answer: triggerLabel(id) });
  if (tId) {
    S.notes.push({ id: uid(), trackerId: tId, triggerId: id, text: 'Noted from the morning check-in.', createdAt: new Date().toISOString(), auto: true });
    await persist('notes');
  }
  ui.draft = {};
  render();
  toast('Noted. See you tomorrow.');
}

async function triggerWriteInstead() {
  const tId = qTrackerId() || (visibleTrackers()[0] || {}).id;
  await recordCheckin({ question: 'trigger', trackerId: tId, answer: '(wrote a note)' });
  ui.draft = { trackerId: tId };
  ui.layer = 'note';
  render();
}

function pickPlan(i) { syncDraft(); ui.draft.plan = ui.draft.plan === i ? null : i; if (i === 'other') ui._focusId = 'plan-other'; render(); }
async function savePlan() {
  syncDraft();
  const d = ui.draft;
  let choice = null, custom = null;
  if (d.plan === 'other') { custom = (d.planOther || '').trim(); if (!custom) { toast('Say what the plan is, or pick No plan today.'); return; } }
  else if (typeof d.plan === 'number') choice = PLAN_OPTS[d.plan];
  else { toast('Pick a plan, or No plan today.'); return; }
  const tId = qTrackerId();
  S.plans = S.plans.filter(p => !(p.date === todayYMD() && p.trackerId === tId));
  S.plans.push({ date: todayYMD(), trackerId: tId, choice, custom });
  await persist('plans');
  await recordCheckin({ question: 'plan', trackerId: tId, answer: custom || choice });
  ui.draft = {};
  render();
  toast('Locked in. The craving screen will show it tonight.');
}
async function noPlanToday() {
  await recordCheckin({ question: 'plan', trackerId: qTrackerId(), answer: null });
  ui.draft = {};
  render();
  toast('No plan today. See you tomorrow.');
}

async function weekAnswer(keep) {
  if (keep) {
    const note = recentNoteThisWeek();
    if (note) {
      S.reasons.push({ id: uid(), trackerId: note.trackerId, text: note.text, writtenAt: new Date().toISOString(), source: 'week' });
      await persist('reasons');
    }
  }
  await recordCheckin({ question: 'week', answer: keep ? 'kept' : 'no' });
  ui.draft = {};
  render();
  toast(keep ? 'Kept it with your reasons.' : 'Noted. See you next week.');
}

async function saveMilestone(trackerId, n) {
  const el = document.getElementById('milestone-in');
  const text = (el && el.value || '').trim();
  if (!text) { toast('One line, or Not today.'); return; }
  S.reasons.push({ id: uid(), trackerId, text, writtenAt: new Date().toISOString(), source: 'milestone' });
  await persist('reasons');
  await recordCheckin({ question: 'milestone', trackerId, milestoneN: n, answer: text });
  render();
  toast('Kept it with your reasons.');
}
async function skipMilestone(trackerId, n) {
  await recordCheckin({ question: 'milestone', trackerId, milestoneN: n, answer: null, skipped: true });
  render();
}

// ---- reasons screen --------------------------

function setReasonsFilter(id) { ui.reasonsFilter = id; render(); }
async function deleteReason(id) {
  S.reasons = S.reasons.filter(r => r.id !== id);
  await persist('reasons');
  render();
}

// ---- craving sheet --------------------------

function openCraving(trackerId) { stopClocks(); ui.layer = 'craving'; ui.draft = trackerId ? { cravingTrackerId: trackerId } : {}; render(); }
function cravingToReasons() {
  const t = cravingTracker();
  ui.layer = null;
  ui.reasonsFilter = (t || visibleTrackers()[0] || {}).id;
  ui.screen = 'reasons';
  render();
}
function cravingToNote() {
  const t = cravingTracker();
  ui.draft = { trackerId: (t || visibleTrackers()[0] || {}).id };
  ui.layer = 'note';
  render();
}

// ---- exercises -----------------------------

function stopClocks() {
  clearTimeout(_timers.breath); _timers.breath = null;
  clearInterval(_timers.tick); _timers.tick = null;
}

function startBreathing() {
  stopClocks();
  ui.layer = 'breathe';
  ui.breath = { cycle: 1, inhale: true };
  render();
  let phase = 0;
  const step = () => {
    phase++;
    const inhale = phase % 2 === 0;
    ui.breath = { cycle: Math.min(6, Math.floor(phase / 2) + 1), inhale };
    if (phase >= 12) {
      ui.layer = null; render();
      toast('Six cycles done. Still want it?');
      return;
    }
    render();
    _timers.breath = setTimeout(step, inhale ? 4000 : 6000);
  };
  _timers.breath = setTimeout(step, 4000);
}

function startTimer() {
  stopClocks();
  ui.layer = 'timer';
  ui.timer = { left: 600, running: true };
  render();
  _timers.tick = setInterval(() => {
    if (!ui.timer.running) return;
    if (ui.timer.left <= 1) { ui.timer.left = 0; clearInterval(_timers.tick); _timers.tick = null; render(); return; }
    ui.timer.left--;
    render();
  }, 1000);
}
function toggleTimer() { ui.timer.running = !ui.timer.running; render(); }

function startTap() { stopClocks(); ui.layer = 'tap'; ui.tap = 0; render(); }
function doTap() {
  ui.tap++;
  const c = document.getElementById('tap-circle');
  if (c) {
    c.querySelector('.n').textContent = ui.tap;
    c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  }
}

let _lastReminderText = null;
function pickReminder() {
  const pool = REMINDERS
    .concat(webReminders)
    .concat(S.reasons.map(r => ({ t: r.text, a: 'your own words', src: 'reason' })));
  const choices = pool.length > 1 ? pool.filter(q => q.t !== _lastReminderText) : pool;
  const q = choices[Math.floor(Math.random() * choices.length)] || pool[0];
  _lastReminderText = q.t;
  return q;
}
function startReminder() { stopClocks(); ui.layer = 'reminder'; ui.reminder = pickReminder(); render(); }
function anotherReminder() { ui.reminder = pickReminder(); render(); }

// ---- note / reason sheets -------------------

function openNoteSheet(trackerId) { stopClocks(); ui.draft = { trackerId }; ui.layer = 'note'; ui._focusId = null; render(); }
function noteTrigger(id) { syncDraft(); ui.draft.triggerId = ui.draft.triggerId === id ? null : id; render(); }
async function saveNote() {
  syncDraft();
  const d = ui.draft;
  const text = (d.noteText || '').trim();
  if (!text) { toast('Write a line, or discard.'); return; }
  S.notes.push({ id: uid(), trackerId: d.trackerId, triggerId: d.triggerId || null, text, createdAt: new Date().toISOString() });
  await persist('notes');
  if (d.triggerId) await bumpTrigger(d.triggerId);
  ui.layer = null; ui.draft = {};
  render();
  toast('Saved.');
}

function openReasonSheet(trackerId) { stopClocks(); ui.draft = { trackerId, promptIdx: Math.floor(Math.random() * REASON_PROMPTS.length) }; ui.layer = 'reason'; render(); }
function cycleReasonPrompt() { syncDraft(); ui.draft.promptIdx = (ui.draft.promptIdx || 0) + 1; ui._focusId = 'reason-text'; render(); }
async function saveReason() {
  syncDraft();
  const d = ui.draft;
  const text = (d.reasonText || '').trim();
  if (!text) { toast('Write a line, or close.'); return; }
  S.reasons.push({ id: uid(), trackerId: d.trackerId, text, writtenAt: new Date().toISOString(), source: 'manual' });
  await persist('reasons');
  ui.layer = null; ui.draft = {};
  if (ui.screen === 'reasons') ui.reasonsFilter = d.trackerId;
  render();
  toast('Saved.');
  refreshFromNetwork({ reflections: true });
}

// ---- tracker add / edit --------------------

function openTrackerSheet(id) { stopClocks(); ui.draft = { trackerId: id || null }; ui.layer = 'tracker'; render(); }
function trackRowClick(e, id) {
  const row = e.currentTarget;
  if (row._noClick) { row._noClick = false; return; }
  openDetail(id);
}
function trName(n) { syncDraft(); ui.draft.name = n; render(); }
function trColor(i) { syncDraft(); ui.draft.colorIdx = i; render(); }
function trToggleHidden() { syncDraft(); ui.draft.hidden = !ui.draft.hidden; render(); }

async function saveTracker() {
  syncDraft();
  const d = ui.draft;
  const name = (d.name || '').trim();
  if (!name) { toast('Give it a name.'); return; }
  const color = SWATCHES[d.colorIdx || 0];
  const startVal = (document.getElementById('tr-start') || {}).value || d.startVal;
  const start = startVal ? new Date(startVal).toISOString() : new Date().toISOString();
  const editing = d.trackerId && trackerById(d.trackerId);

  if (editing) {
    const t = trackerById(d.trackerId);
    t.name = name; t.color = color; t.start = start; t.hidden = !!d.hidden;
    t.best = Math.max(t.best || 0, daysSince(start));
  } else {
    S.trackers.push({
      id: uid(), name, color, start, best: daysSince(start), runs: [], hidden: !!d.hidden,
      order: S.trackers.length
    });
  }
  await persist('trackers');
  ui.layer = null; ui.draft = {};
  render();
  refreshFromNetwork({ force: true });
}

async function deleteTracker(id) {
  S.trackers = S.trackers.filter(t => t.id !== id);
  S.reasons = S.reasons.filter(r => r.trackerId !== id);
  S.notes = S.notes.filter(n => n.trackerId !== id);
  await persist('trackers', 'reasons', 'notes');
  ui.layer = null; ui.draft = {};
  if (ui.detailId === id) ui.screen = 'home';
  render();
  refreshFromNetwork({ force: true });
}

// ---- reset / slip flow --------------------

function openReset(trackerId) { stopClocks(); ui.draft = { trackerId }; ui.layer = 'reset'; render(); }
async function confirmReset() {
  const d = ui.draft;
  const t = trackerById(d.trackerId);
  const whenEl = document.getElementById('reset-when');
  const when = whenEl && whenEl.value ? new Date(whenEl.value) : new Date();
  const runLen = Math.max(0, Math.floor((when.getTime() - new Date(t.start).getTime()) / DAY));
  const prevBest = pastBest(t);
  t.runs = t.runs || [];
  t.runs.unshift({ endedOn: when.toISOString(), length: runLen });
  t.best = Math.max(prevBest, runLen);
  t.start = when.toISOString();
  S.lastReset = { trackerId: t.id, at: Date.now() };
  await persist('trackers', 'lastReset');
  ui.draft = { trackerId: t.id, prevBest };
  ui.layer = 'slip';
  render();
}

function slipTrigger(id) { ui.draft.trigger = ui.draft.trigger === id ? null : id; render(); }
async function saveSlipTrigger() {
  const d = ui.draft;
  const t = trackerById(d.trackerId);
  if (d.trigger) {
    await bumpTrigger(d.trigger);
    S.notes.push({ id: uid(), trackerId: t.id, triggerId: d.trigger, text: 'Logged from the reset screen.', createdAt: new Date().toISOString(), auto: true });
    await persist('notes');
  }
  ui.layer = null; ui.draft = {};
  ui.screen = 'detail';
  render();
  toast(d.trigger ? 'Saved to ' + t.name.toLowerCase() + '.' : 'Clock restarted.');
}
function closeSlip() { ui.layer = null; ui.draft = {}; ui.screen = 'detail'; render(); toast('Clock restarted.'); }

// ---- settings actions --------------------

async function toggleSetting(key) {
  S.settings[key] = !S.settings[key];
  await persist('settings');
  render();
  if (key === 'onlineExtras' && S.settings.onlineExtras) refreshFromNetwork({ force: true });
}
async function setAskAt(v) { if (v) { S.settings.askAt = v; await persist('settings'); render(); } }

function openDeleteAll() { ui.layer = 'deleteAll'; render(); }
async function deleteAll() {
  for (const k of KEYS) { try { await window.storage.delete(k); } catch (e) {} }
  try {
    for (const k of ['streakHistory', 'journal', 'customTopics', 'cache-quotes', 'cache-reflections', 'cache-articles']) {
      await window.storage.delete(k);
    }
  } catch (e) {}
  location.reload();
}

function exportData() {
  const dump = {};
  KEYS.forEach(k => { dump[k] = S[k]; });
  dump.exportedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'free-backup-' + todayYMD() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Exported. Keep the file somewhere safe.');
}

// ---- onboarding actions -----------------

function obPickName(n) { syncDraft(); ui.draft.name = n; render(); }
function obPickColor(i) { syncDraft(); ui.draft.colorIdx = i; render(); }
function obStartMode(m) { syncDraft(); ui.draft.startMode = m; render(); }
function obNext() {
  const el = document.getElementById('ob-name');
  const name = (el && el.value || ui.draft.name || '').trim();
  if (!name) { toast('Name what you\'re working on.'); return; }
  ui.draft.name = name;
  const sEl = document.getElementById('ob-start');
  if (ui.draft.startMode === 'pick' && sEl) ui.draft.startVal = sEl.value;
  ui.onboardStep = 2;
  render();
}
async function obFinish(withReason) {
  const d = ui.draft;
  const start = (d.startMode === 'pick' && d.startVal) ? new Date(d.startVal).toISOString() : new Date().toISOString();
  const t = { id: uid(), name: d.name, color: SWATCHES[d.colorIdx || 0], start, best: daysSince(start), runs: [], hidden: false, order: 0 };
  S.trackers = [t];
  if (withReason) {
    const el = document.getElementById('ob-reason');
    const text = (el && el.value || '').trim();
    if (text) S.reasons.push({ id: uid(), trackerId: t.id, text, writtenAt: new Date().toISOString(), source: 'onboarding' });
  }
  S.settings.onboarded = true;
  if (!S.triggers.length) S.triggers = TRIGGER_SEED.map(label => ({ id: uid(), label, count: 0, lastUsed: null }));
  await persist('trackers', 'reasons', 'settings', 'triggers');
  ui.draft = {};
  ui.screen = 'home';
  render();
  refreshFromNetwork({ force: true });
}

// ---- learn / search actions -------------

function startTyping() {
  const el = document.getElementById('search-in');
  ui.search = { mode: 'typing', query: el ? el.value : ui.search.query, results: null, error: false };
  ui.screen = 'learn';
  render();
}
function onSearchInput(v) { ui.search.query = v; /* no re-render: keep field alive; suggestions update on next keystroke via render */ scheduleSuggest(); }
let _suggestT = null;
function scheduleSuggest() { clearTimeout(_suggestT); _suggestT = setTimeout(() => { if (ui.search.mode === 'typing') render(); }, 200); }
function cancelSearch() { ui.search = { mode: 'idle', query: '', results: null, error: false }; render(); }

async function commitSearch(forced) {
  const el = document.getElementById('search-in');
  const q = (forced || (el && el.value) || ui.search.query || '').trim();
  if (!q) return;
  ui.search = { mode: 'loading', query: q, results: null, error: false };
  render();
  try {
    const res = await fetch('/.netlify/functions/api?action=search&q=' + encodeURIComponent(q));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const results = (data.results || data.articles || []).map(normalizeResult).filter(r => r.title);
    if (!results.length) { ui.search = { mode: 'empty', query: q, results: [], error: false }; }
    else { ui.search = { mode: 'results', query: q, results, error: false }; }
  } catch (e) {
    ui.search = { mode: 'empty', query: q, results: [], error: true };
  }
  render();
}

function normalizeResult(r) {
  return {
    title: r.title || '',
    source: r.source || sourceFromUrl(r.url) || 'Web',
    minutes: r.minutes || estimateMinutes(r.summary || r.body || ''),
    summary: r.summary || r.body || '',
    url: r.url || '',
    body: r.body || r.summary || ''
  };
}
function sourceFromUrl(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return null; } }
function estimateMinutes(t) { return Math.max(2, Math.round((t || '').split(/\s+/).length / 40)) + 2; }

async function keepSearch() {
  const q = ui.search.query;
  if (!S.searches.some(s => s.query.toLowerCase() === q.toLowerCase())) {
    S.searches.push({ id: uid(), query: q, keptAt: new Date().toISOString() });
    await persist('searches');
  }
  toast('Kept. It\'s in your suggestions now.');
}

function openResult(id) {
  const r = (ui.search.results || []).find(x => 'res-' + hash(x.url) === id);
  if (!r) return;
  const art = S.articles.find(a => a.id === id) || Object.assign({ id, savedAt: null }, r);
  ui._transientArticles = [art];
  ui.articleId = id;
  ui.screen = 'article';
  render();
}
async function toggleSaveResult(id) {
  const r = (ui.search.results || []).find(x => 'res-' + hash(x.url) === id);
  if (!r) return;
  const existing = S.articles.findIndex(a => a.id === id);
  if (existing >= 0) S.articles.splice(existing, 1);
  else S.articles.push(Object.assign({ id, savedAt: new Date().toISOString() }, r));
  await persist('articles');
  render();
}

function openArticle(id) {
  ui.articleId = id;
  const found = findArticle(id);
  if (found && !S.articles.some(a => a.id === id)) ui._transientArticles = [found];
  ui.screen = 'article';
  render();
}
function backFromArticle() { ui.screen = 'learn'; render(); }
async function toggleSaveArticle() {
  const a = findArticle(ui.articleId);
  if (!a) return;
  const i = S.articles.findIndex(x => x.id === a.id);
  if (i >= 0) S.articles.splice(i, 1);
  else S.articles.push(Object.assign({}, a, { savedAt: new Date().toISOString() }));
  await persist('articles');
  render();
  toast(i >= 0 ? 'Removed from saved.' : 'Saved for offline reading.');
}
function writeFromArticle() {
  ui.draft = { trackerId: (visibleTrackers()[0] || {}).id };
  ui.layer = 'note';
  render();
}

// ---- expose to inline handlers -------------

Object.assign(window, {
  go, openDetail, closeLayer, openCraving,
  setDifficulty, skipToday, pickTriggerChip, openCustomTrigger, commitCustomTrigger,
  saveTriggerAnswer, triggerWriteInstead, pickPlan, savePlan, noPlanToday, weekAnswer,
  saveMilestone, skipMilestone, setReasonsFilter, deleteReason,
  cravingToReasons, cravingToNote, startBreathing, startTimer, toggleTimer, startTap, doTap,
  startReminder, anotherReminder,
  openNoteSheet, noteTrigger, saveNote, openReasonSheet, cycleReasonPrompt, saveReason,
  openTrackerSheet, trackRowClick, trName, trColor, trToggleHidden, saveTracker, deleteTracker,
  openReset, confirmReset, slipTrigger, saveSlipTrigger, closeSlip,
  toggleSetting, setAskAt, openDeleteAll, deleteAll, exportData,
  obPickName, obPickColor, obStartMode, obNext, obFinish,
  startTyping, onSearchInput, cancelSearch, commitSearch, keepSearch,
  openResult, toggleSaveResult, openArticle, backFromArticle, toggleSaveArticle, writeFromArticle
});

// ---- online extras (quotes, reflections, suggested reading) ----

function fetchJson(url, opts) {
  return fetch(url, opts).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
}

function habitTopic(name) {
  const n = (name || '').toLowerCase();
  if (/alcohol|drink|beer|wine|sober/.test(n)) return 'alcohol';
  if (/smok|nicotine|vape|cigarette|tobacco/.test(n)) return 'smoking';
  if (/porn|compulsive|nsfw/.test(n)) return 'porn';
  if (/phone|scroll|screen|social|doomscroll/.test(n)) return 'phone';
  if (/gambl|bet|casino|poker/.test(n)) return 'gambling';
  if (/food|eat|binge|snack|sugar/.test(n)) return 'food';
  if (/weed|cannabis|marijuana|thc|pot/.test(n)) return 'weed';
  return 'general';
}

function mergeReminders(items, src) {
  (items || []).forEach(it => {
    if (!it || !it.t) return;
    const known = REMINDERS.some(x => x.t === it.t) || webReminders.some(x => x.t === it.t);
    if (!known) webReminders.push({ t: it.t, a: it.a || null, src: it.src || src || 'web' });
  });
}

async function loadCaches() {
  try {
    const wq = await window.storage.get('cache-quotes');
    if (wq && Array.isArray(wq.items)) mergeReminders(wq.items, 'web');
  } catch (e) {}
  try {
    const rf = await window.storage.get('cache-reflections');
    if (rf && Array.isArray(rf.items)) mergeReminders(rf.items, 'personal');
  } catch (e) {}
  try {
    const ar = await window.storage.get('cache-articles');
    if (ar && Array.isArray(ar.items)) suggestedArticles = ar.items;
  } catch (e) {}
}

async function cacheFresh(key) {
  try { const c = await window.storage.get(key); return !!(c && c.ts && Date.now() - c.ts < CACHE_TTL); }
  catch (e) { return false; }
}

// Fire-and-forget. opts.force refetches everything; opts.reflections forces
// just the reflections (used after a reason changes).
async function refreshFromNetwork(opts) {
  opts = opts || {};
  if (!S.settings.onlineExtras || !navigator.onLine || !S.trackers.length) return;

  const habits = visibleTrackers().map(t => t.name);
  const topics = [...new Set(habits.map(habitTopic))];
  const hot = topTriggerLast30();

  if (opts.force || !(await cacheFresh('cache-quotes'))) {
    fetchJson('/.netlify/functions/api?action=quotes&habits=' + encodeURIComponent(topics.join(',')))
      .then(d => {
        if (d && d.quotes && d.quotes.length) {
          mergeReminders(d.quotes, 'web');
          window.storage.set('cache-quotes', { items: d.quotes, ts: Date.now() });
        }
      }).catch(() => {});
  }

  const withReasons = visibleTrackers()
    .map(t => ({ name: t.name, reasons: reasonsFor(t.id).map(r => r.text) }))
    .filter(h => h.reasons.length);
  if (withReasons.length && (opts.force || opts.reflections || !(await cacheFresh('cache-reflections')))) {
    fetchJson('/.netlify/functions/api?action=reflections', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ habits: withReasons })
    }).then(d => {
      if (d && d.reflections && d.reflections.length) {
        webReminders = webReminders.filter(x => x.src !== 'personal');
        mergeReminders(d.reflections, 'personal');
        window.storage.set('cache-reflections', { items: d.reflections, ts: Date.now() });
      }
    }).catch(() => {});
  }

  if (opts.force || !(await cacheFresh('cache-articles'))) {
    const queries = topics.map(topic => fetchJson('/.netlify/functions/api?action=knowledge&topic=' + encodeURIComponent(topic)));
    if (hot) queries.push(fetchJson('/.netlify/functions/api?action=search&q=' + encodeURIComponent('"' + hot.label + '" cravings and habit change')));
    Promise.allSettled(queries).then(settled => {
      const seen = new Set();
      const merged = [];
      settled.forEach(s => {
        if (s.status !== 'fulfilled' || !s.value) return;
        (s.value.results || s.value.articles || []).forEach(raw => {
          const r = normalizeResult(raw);
          if (!r.title || !r.url || seen.has(r.url)) return;
          seen.add(r.url);
          r.id = 'sug-' + hash(r.url);
          merged.push(r);
        });
      });
      if (merged.length) {
        suggestedArticles = merged.slice(0, 8);
        window.storage.set('cache-articles', { items: suggestedArticles, ts: Date.now() });
        if (ui.screen === 'learn' && ui.search.mode === 'idle') render();
      }
    });
  }
}

// ---- boot --------------------------------

async function boot() {
  await load();
  if (S.settings.onlineExtras) await loadCaches();
  render();
  refreshFromNetwork();
  // keep day counts fresh
  setInterval(() => { if (!ui.layer && (ui.screen === 'home' || ui.screen === 'detail')) render(); }, 60000);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.error('SW registration failed', err));
    });
  }
}
boot();
