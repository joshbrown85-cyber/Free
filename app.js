// Free — app logic
// Storage is provided by db.js (window.storage), an IndexedDB-backed
// key/value store that mirrors the artifact prototype's API but stores
// raw JS values directly (no JSON string wrapping needed).

const COLORS = [
  {hex:'#5F8B7A', name:'sage'},
  {hex:'#C9874A', name:'amber'},
  {hex:'#7F77DD', name:'violet'},
  {hex:'#378ADD', name:'blue'},
  {hex:'#D4537E', name:'rose'},
  {hex:'#1D9E75', name:'teal'},
];

const QUOTES = [
  // Stoic philosophy
  {t:"It is not that we have a short time to live, but that we waste a great deal of it.", a:"Seneca", src:"static"},
  {t:"You have power over your mind, not outside events. Realize this, and you will find strength.", a:"Marcus Aurelius", src:"static"},
  {t:"No man is free who is not master of himself.", a:"Epictetus", src:"static"},
  {t:"How long are you going to wait before you demand the best for yourself?", a:"Epictetus", src:"static"},
  // Sufi / spiritual
  {t:"The wound is the place where the light enters you.", a:"Rumi", src:"static"},
  {t:"Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.", a:"Rumi", src:"static"},
  {t:"When you do things from your soul, you feel a river moving in you, a joy.", a:"Rumi", src:"static"},
  // Recovery / psychology
  {t:"He who has a why to live can bear almost any how.", a:"Viktor Frankl", src:"static"},
  {t:"Between stimulus and response there is a space. In that space is our freedom and our power to choose.", a:"Viktor Frankl", src:"static"},
  {t:"Recovery is not a race. You don't have to feel guilty if it takes you longer than you thought it would.", a:"—", src:"static"},
  {t:"The only person you are destined to become is the person you decide to be.", a:"Ralph Waldo Emerson", src:"static"},
  // Literature / modern
  {t:"Not everything that is faced can be changed, but nothing can be changed until it is faced.", a:"James Baldwin", src:"static"},
  {t:"I am not what happened to me. I am what I choose to become.", a:"Carl Jung", src:"static"},
  {t:"The most common way people give up their power is by thinking they don't have any.", a:"Alice Walker", src:"static"},
  // Buddhist / mindfulness
  {t:"Nothing is permanent. This too shall pass.", a:"—", src:"static"},
  {t:"You are the sky. Everything else is just the weather.", a:"Pema Chödrön", src:"static"},
  {t:"The only way out is through.", a:"Robert Frost", src:"static"},
  // Original (from the first version)
  {t:"You are not your craving. You are the one noticing it.", a:"—", src:"static"},
  {t:"This feeling is real, but it is not a fact about what you must do next.", a:"—", src:"static"},
  {t:"Every craving you've ever had has ended, whether or not you acted on it.", a:"—", src:"static"},
  {t:"The urge is loud because it's temporary. Permanent things don't need to shout.", a:"—", src:"static"},
  {t:"You don't have to win the whole fight right now. Just win the next ten minutes.", a:"—", src:"static"},
  {t:"Discomfort you choose to sit with is not the same as harm.", a:"—", src:"static"},
  {t:"What you feed grows. What you starve, even briefly, weakens.", a:"—", src:"static"},
  {t:"Future you is waiting on the other side of this exact moment.", a:"—", src:"static"},
];

// Combined pool: static quotes + web-sourced + personalized reflections.
// Pre-fetched on boot and cached in IndexedDB.
let quotePool = [...QUOTES];
let lastQuoteIndex = -1;

// Dashboard: whether hidden trackers are currently revealed.
let showHidden = false;

// Knowledge: custom topic searches saved by the user.
let customTopics = []; // [{k: 'sugar', l: 'Sugar'}]

const ARTICLES = {
  general: [
    {tag:'Foundation', title:'Why willpower alone usually fails', body:'A look at why habit change works better through environment design and pre-commitment than through sheer self-control in the moment.', url:'https://jamesclear.com/willpower-self-control'},
    {tag:'Foundation', title:'Urge surfing, explained', body:'The mindfulness-based technique of riding out a craving as a wave — rising, peaking, and passing — instead of fighting it.', url:'https://www.psychologytoday.com/us/basics/urge-surfing'},
    {tag:'Foundation', title:'The habit loop: cue, craving, response, reward', body:'A breakdown of the four-step pattern behind every habit, and where it can actually be interrupted.', url:'https://jamesclear.com/habit-loop'},
  ],
  alcohol: [
    {tag:'Alcohol', title:'Understanding alcohol use disorder', body:'NIAAA overview of how alcohol dependence develops and what evidence-based treatment looks like.', url:'https://www.niaaa.nih.gov/alcohols-effects-health/alcohol-use-disorder'},
    {tag:'Alcohol', title:'SMART Recovery tools', body:'A secular, science-based alternative to 12-step programs, with free tools for urge management.', url:'https://smartrecovery.org/'},
  ],
  smoking: [
    {tag:'Smoking', title:'Quitting smoking: a timeline of what your body does', body:'CDC breakdown of physical recovery milestones, useful as motivation during early withdrawal.', url:'https://www.cdc.gov/tobacco/campaign/tips/quit-smoking/'},
    {tag:'Smoking', title:'Nicotine craving: how long does it actually last', body:'Why nicotine cravings are short and intense rather than long and constant — and why that matters.', url:'https://smokefree.gov/challenges-when-quitting/cravings-triggers'},
  ],
  porn: [
    {tag:'Compulsive use', title:'Understanding compulsive sexual behavior', body:'A clinical overview distinguishing compulsive patterns from shame-driven self-labeling.', url:'https://www.psychologytoday.com/us/conditions/compulsive-sexual-behavior'},
  ],
  phone: [
    {tag:'Screen habits', title:'How variable rewards hook you', body:'Why infinite-scroll feeds are engineered like slot machines, and what that means for breaking the pull.', url:'https://www.humanetech.com/youth/the-effects-of-social-media'},
    {tag:'Screen habits', title:'Digital minimalism, in brief', body:'Cal Newport-style framing for deciding which tech actually earns a place in your life.', url:'https://www.calnewport.com/books/digital-minimalism/'},
  ],
  gambling: [
    {tag:'Gambling', title:'How gambling rewires the brain\'s reward system', body:'An accessible look at near-miss effects and why gambling can be as compulsive as substance use.', url:'https://www.ncpgambling.org/help-treatment/faq/'},
    {tag:'Gambling', title:'National Council on Problem Gambling resources', body:'Self-assessment tools and a path to free, confidential support.', url:'https://www.ncpgambling.org/'},
  ],
  food: [
    {tag:'Eating patterns', title:'Emotional eating vs. physical hunger', body:'A practical guide to telling the two apart in the moment, without shame-based framing.', url:'https://www.helpguide.org/articles/diets/emotional-eating.htm'},
  ],
};

// ---------------- STORAGE LAYER ----------------
let trackers = [];       // {id, name, color, startedAt}
let reasons = [];        // {id, trackerId, text, createdAt}
let streakHistory = [];  // {id, trackerId, startedAt, endedAt}
let journal = [];        // {id, trackerId, trigger, text, createdAt}

async function loadState(){
  try{
    const t = await window.storage.get('trackers');
    trackers = t || [];
  }catch(e){ console.error('load trackers failed', e); trackers = []; }
  try{
    const r = await window.storage.get('reasons');
    reasons = r || [];
  }catch(e){ console.error('load reasons failed', e); reasons = []; }
  try{
    const h = await window.storage.get('streakHistory');
    streakHistory = h || [];
  }catch(e){ console.error('load streakHistory failed', e); streakHistory = []; }
  try{
    const j = await window.storage.get('journal');
    journal = j || [];
  }catch(e){ console.error('load journal failed', e); journal = []; }
  try{
    const ct = await window.storage.get('customTopics');
    customTopics = ct || [];
  }catch(e){ console.error('load customTopics failed', e); customTopics = []; }
}

async function saveTrackers(){
  try{ await window.storage.set('trackers', trackers); }
  catch(e){ console.error('save trackers failed', e); }
}
async function saveReasons(){
  try{ await window.storage.set('reasons', reasons); }
  catch(e){ console.error('save reasons failed', e); }
}
async function saveStreakHistory(){
  try{ await window.storage.set('streakHistory', streakHistory); }
  catch(e){ console.error('save streakHistory failed', e); }
}
async function saveJournal(){
  try{ await window.storage.set('journal', journal); }
  catch(e){ console.error('save journal failed', e); }
}
async function saveCustomTopics(){
  try{ await window.storage.set('customTopics', customTopics); }
  catch(e){ console.error('save customTopics failed', e); }
}

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

// Which tracker (if any) the intervention screen is currently scoped to.
let activeInterventionTrackerId = null;

// ---------------- NAV ----------------
function switchScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  document.querySelectorAll('.tabbar button').forEach(b=>{
    b.classList.toggle('active', b.dataset.screen===name);
  });
  document.getElementById('fab-add').style.display = (name==='dashboard') ? 'flex' : 'none';
  if(name==='reasons') renderReasonsScreen();
  if(name==='knowledge') renderKnowledge();
  if(name==='intervention') renderInterventionContext();
}

function closeModal(id){ document.getElementById(id).classList.remove('active'); }
function openModal(id){ document.getElementById(id).classList.add('active'); }

// ---------------- DASHBOARD ----------------
function fmtElapsed(startIso){
  const ms = Date.now() - new Date(startIso).getTime();
  if(ms < 0) return {num:0, unit:'just started', sub:''};
  const mins = Math.floor(ms/60000);
  const hours = Math.floor(mins/60);
  const days = Math.floor(hours/24);
  if(days >= 1){
    const remHours = hours % 24;
    return {num:days, unit: days===1 ? 'day' : 'days', sub: remHours+'h '+(mins%60)+'m more'};
  } else if(hours >= 1){
    return {num:hours, unit: hours===1 ? 'hour' : 'hours', sub: (mins%60)+' min more'};
  } else {
    return {num:mins, unit: mins===1 ? 'minute' : 'minutes', sub: 'just getting started'};
  }
}

function renderDashboard(){
  const list = document.getElementById('tracker-list');
  const empty = document.getElementById('dashboard-empty');
  const toggleBtn = document.getElementById('toggle-hidden-btn');
  document.getElementById('today-date').textContent = new Date().toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric'});

  if(trackers.length === 0){
    list.innerHTML = '';
    empty.style.display = 'block';
    toggleBtn.style.display = 'none';
    return;
  }
  empty.style.display = 'none';

  // Show the eye toggle only if there are hidden trackers.
  const hasHidden = trackers.some(t=>t.hidden);
  toggleBtn.style.display = hasHidden ? 'inline-flex' : 'none';
  toggleBtn.classList.toggle('active', showHidden);
  toggleBtn.querySelector('i').className = showHidden ? 'ti ti-eye' : 'ti ti-eye-off';

  // Filter visible trackers.
  const visible = showHidden ? trackers : trackers.filter(t=>!t.hidden);

  if(visible.length === 0 && !showHidden){
    list.innerHTML = '<div class="empty" style="padding:30px 20px;"><p>All trackers are hidden. Tap the <i class="ti ti-eye-off" style="font-size:14px;"></i> icon above to reveal them.</p></div>';
    return;
  }

  list.innerHTML = visible.map(t=>{
    const e = fmtElapsed(t.startedAt);
    const hiddenClass = t.hidden ? ' hidden-tracker' : '';
    return `
      <div class="tracker-card${hiddenClass}" onclick="openTrackerDetail('${t.id}')">
        <div class="tracker-top">
          <div class="tracker-name">
            <span class="dot breathe" style="background:${t.color}"></span>${escapeHtml(t.name)}
            ${t.hidden ? '<i class="ti ti-eye-off" style="font-size:13px;color:var(--text-faint);margin-left:6px;"></i>' : ''}
          </div>
          <i class="ti ti-chevron-right" style="color:var(--text-faint);font-size:18px;"></i>
        </div>
        <div class="tracker-streak">
          <span class="num serif" style="color:${t.color}">${e.num}</span>
          <span class="unit">${e.unit} clean</span>
        </div>
        <div class="tracker-sub">${e.sub}</div>
        <div class="tracker-actions">
          <button class="btn" onclick="event.stopPropagation(); goToInterventionFor('${t.id}')"><i class="ti ti-lifebuoy" style="font-size:14px;vertical-align:-2px;"></i> Need help now</button>
          <button class="btn ghost" onclick="event.stopPropagation(); openRelapseConfirm('${t.id}')">Reset</button>
        </div>
      </div>`;
  }).join('');
}

function toggleShowHidden(){
  showHidden = !showHidden;
  renderDashboard();
}

function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function goToInterventionFor(id){
  activeInterventionTrackerId = id;
  switchScreen('intervention');
}

// Opened from the bottom tab bar — not tied to any one tracker.
function openInterventionTab(){
  activeInterventionTrackerId = null;
  switchScreen('intervention');
}

function renderInterventionContext(){
  const el = document.getElementById('intervention-context');
  const t = activeInterventionTrackerId
    ? trackers.find(x => x.id === activeInterventionTrackerId)
    : null;
  if(!t){
    // Generic mode, or the scoped tracker was deleted — clear and hide.
    activeInterventionTrackerId = null;
    el.classList.remove('show');
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<span class="dot" style="background:${t.color}"></span>
    <span class="txt">Getting through an urge for <b>${escapeHtml(t.name)}</b>. You've got this.</span>`;
  el.classList.add('show');
}

let pendingRelapseId = null;
function openRelapseConfirm(id){
  pendingRelapseId = id;
  openModal('modal-relapse-confirm');
}

// ---------------- ADD / EDIT TRACKER ----------------
function openAddTracker(){
  document.getElementById('new-tracker-name').value = '';
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('new-tracker-start').value = now.toISOString().slice(0,16);
  const pick = document.getElementById('color-pick');
  pick.innerHTML = COLORS.map((c,i)=>`<span style="background:${c.hex}" class="${i===0?'sel':''}" data-hex="${c.hex}" onclick="selectColor(this)"></span>`).join('');
  openModal('modal-add-tracker');
}
function selectColor(el){
  document.querySelectorAll('#color-pick span').forEach(s=>s.classList.remove('sel'));
  el.classList.add('sel');
}
async function saveNewTracker(){
  const name = document.getElementById('new-tracker-name').value.trim();
  if(!name){ return; }
  const colorEl = document.querySelector('#color-pick span.sel');
  const color = colorEl ? colorEl.dataset.hex : COLORS[0].hex;
  const startVal = document.getElementById('new-tracker-start').value;
  const startedAt = startVal ? new Date(startVal).toISOString() : new Date().toISOString();
  trackers.push({id:uid(), name, color, startedAt});
  await saveTrackers();
  closeModal('modal-add-tracker');
  renderDashboard();
}

function openTrackerDetail(id){
  const t = trackers.find(x=>x.id===id);
  if(!t) return;
  const e = fmtElapsed(t.startedAt);
  const content = document.getElementById('tracker-detail-content');

  // Build streak history bars.
  const history = streakHistory.filter(h=>h.trackerId===id)
    .sort((a,b)=>new Date(b.endedAt)-new Date(a.endedAt));
  const maxDur = Math.max(
    ...history.map(h=>new Date(h.endedAt)-new Date(h.startedAt)),
    Date.now()-new Date(t.startedAt).getTime(), // include current streak
    1
  );

  let historyHtml = '';
  if(history.length > 0){
    // Current streak bar (if > 0)
    const currentMs = Date.now() - new Date(t.startedAt).getTime();
    const currentPct = Math.max(3, (currentMs / maxDur) * 100);
    const currentE = fmtElapsed(t.startedAt);
    historyHtml += `<div class="streak-bar-row">
      <span class="streak-bar-dur">${currentE.num}${currentE.unit.charAt(0)}</span>
      <div class="streak-bar" style="width:${currentPct}%;background:${t.color};opacity:1;"></div>
      <span class="streak-bar-label">now</span>
    </div>`;

    // Past streaks (show up to 10)
    history.slice(0,10).forEach(h=>{
      const dur = new Date(h.endedAt) - new Date(h.startedAt);
      const pct = Math.max(3, (dur / maxDur) * 100);
      const days = Math.floor(dur / 86400000);
      const hours = Math.floor((dur % 86400000) / 3600000);
      const durLabel = days >= 1 ? days+'d' : hours+'h';
      const dateLabel = new Date(h.endedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'});
      historyHtml += `<div class="streak-bar-row">
        <span class="streak-bar-dur">${durLabel}</span>
        <div class="streak-bar" style="width:${pct}%;background:${t.color};opacity:0.5;"></div>
        <span class="streak-bar-label">${dateLabel}</span>
      </div>`;
    });
  } else {
    historyHtml = '<div class="streak-history-empty">This is your first streak. Keep going.</div>';
  }

  // Build journal entries.
  const entries = journal.filter(j=>j.trackerId===id)
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  let journalHtml = '';
  if(entries.length > 0){
    entries.slice(0,5).forEach(j=>{
      journalHtml += `<div class="journal-item">
        <span class="del" onclick="event.stopPropagation(); deleteJournalEntry('${j.id}')"><i class="ti ti-x" style="font-size:14px;"></i></span>
        ${j.trigger ? '<div class="trigger">'+escapeHtml(j.trigger)+'</div>' : ''}
        <div class="body">${escapeHtml(j.text)}</div>
        <div class="meta">${new Date(j.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</div>
      </div>`;
    });
    if(entries.length > 5){
      journalHtml += `<div style="font-size:12px;color:var(--text-faint);text-align:center;padding:4px;">+${entries.length-5} more entries</div>`;
    }
  } else {
    journalHtml = '<div class="streak-history-empty">No journal entries yet.</div>';
  }

  content.innerHTML = `
    <h2 class="serif">${escapeHtml(t.name)}</h2>
    <p style="font-size:13px;color:var(--text-muted);margin:-8px 0 18px;">Tracking since ${new Date(t.startedAt).toLocaleString(undefined,{dateStyle:'medium', timeStyle:'short'})}</p>
    <div class="card" style="text-align:center;margin-bottom:16px;">
      <div class="num serif" style="font-size:44px;color:${t.color}">${e.num}</div>
      <div style="color:var(--text-muted);font-size:13px;">${e.unit} clean &middot; ${e.sub}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Streak history</div>
      <div class="streak-bar-list">${historyHtml}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">
        Journal
        <span class="action" onclick="closeModal('modal-tracker-detail'); openJournalEntry('${t.id}')">+ Add entry</span>
      </div>
      ${journalHtml}
    </div>

    <div class="modal-actions" style="margin-top:20px;">
      <button class="btn ghost full" onclick="closeModal('modal-tracker-detail'); openEditTracker('${t.id}')"><i class="ti ti-pencil" style="font-size:14px;vertical-align:-2px;"></i> Edit</button>
      <button class="btn ghost full" onclick="closeModal('modal-tracker-detail'); openRelapseConfirm('${t.id}')">Reset</button>
    </div>
    <button class="btn ghost full" style="margin-top:8px;color:var(--danger);border-color:var(--danger);" onclick="deleteTracker('${t.id}')">Delete tracker</button>
    <button class="btn full" style="margin-top:8px;" onclick="closeModal('modal-tracker-detail')">Close</button>
  `;
  openModal('modal-tracker-detail');
}
async function deleteTracker(id){
  trackers = trackers.filter(t=>t.id!==id);
  reasons = reasons.filter(r=>r.trackerId!==id);
  streakHistory = streakHistory.filter(h=>h.trackerId!==id);
  journal = journal.filter(j=>j.trackerId!==id);
  await saveTrackers();
  await saveReasons();
  await saveStreakHistory();
  await saveJournal();
  closeModal('modal-tracker-detail');
  renderDashboard();
}

// ---------------- REASONS ----------------
function renderReasonsScreen(){
  const sel = document.getElementById('reasons-tracker-select');
  if(trackers.length===0){
    sel.innerHTML = '<option>Add a tracker first</option>';
    document.getElementById('reasons-list').innerHTML = '';
    document.getElementById('reasons-empty').style.display = 'block';
    return;
  }
  const prevVal = sel.value;
  sel.innerHTML = trackers.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  if(prevVal && trackers.find(t=>t.id===prevVal)) sel.value = prevVal;
  renderReasons();
}
function renderReasons(){
  const sel = document.getElementById('reasons-tracker-select');
  const trackerId = sel.value;
  const list = document.getElementById('reasons-list');
  const empty = document.getElementById('reasons-empty');
  const filtered = reasons.filter(r=>r.trackerId===trackerId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  if(filtered.length===0){
    list.innerHTML='';
    empty.style.display='block';
    return;
  }
  empty.style.display='none';
  list.innerHTML = filtered.map(r=>`
    <div class="reason-item">
      <span class="del" onclick="deleteReason('${r.id}')"><i class="ti ti-x" style="font-size:15px;"></i></span>
      ${escapeHtml(r.text)}
      <div class="meta">${new Date(r.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</div>
    </div>
  `).join('');
}
async function deleteReason(id){
  reasons = reasons.filter(r=>r.id!==id);
  await saveReasons();
  renderReasons();
}
function openAddReason(){
  if(trackers.length===0){
    openAddTracker();
    return;
  }
  const sel = document.getElementById('new-reason-tracker');
  sel.innerHTML = trackers.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  const dashSel = document.getElementById('reasons-tracker-select');
  if(dashSel.value) sel.value = dashSel.value;
  document.getElementById('new-reason-text').value = '';
  openModal('modal-add-reason');
}
async function saveNewReason(){
  const trackerId = document.getElementById('new-reason-tracker').value;
  const text = document.getElementById('new-reason-text').value.trim();
  if(!text || !trackerId) return;
  reasons.push({id:uid(), trackerId, text, createdAt:new Date().toISOString()});
  await saveReasons();
  closeModal('modal-add-reason');
  document.getElementById('reasons-tracker-select').value = trackerId;
  renderReasonsScreen();
  // Refresh personalized reflections in the background since reasons changed.
  prefetchReflections();
}
function showMyReasons(){
  switchScreen('reasons');
  // If this intervention is scoped to a specific tracker, jump straight to its reasons.
  if(activeInterventionTrackerId){
    const sel = document.getElementById('reasons-tracker-select');
    if(sel.querySelector(`option[value="${activeInterventionTrackerId}"]`)){
      sel.value = activeInterventionTrackerId;
      renderReasons();
    }
  }
}

// ---------------- EDIT TRACKER ----------------
let editingTrackerId = null;
function openEditTracker(id){
  const t = trackers.find(x=>x.id===id);
  if(!t) return;
  editingTrackerId = id;
  document.getElementById('edit-tracker-name').value = t.name;
  const now = new Date(t.startedAt);
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('edit-tracker-start').value = now.toISOString().slice(0,16);
  const pick = document.getElementById('edit-color-pick');
  pick.innerHTML = COLORS.map(c=>`<span style="background:${c.hex}" class="${c.hex===t.color?'sel':''}" data-hex="${c.hex}" onclick="selectEditColor(this)"></span>`).join('');
  document.getElementById('edit-tracker-hidden').checked = !!t.hidden;
  openModal('modal-edit-tracker');
}
function selectEditColor(el){
  document.querySelectorAll('#edit-color-pick span').forEach(s=>s.classList.remove('sel'));
  el.classList.add('sel');
}
async function saveEditTracker(){
  const t = trackers.find(x=>x.id===editingTrackerId);
  if(!t) return;
  const name = document.getElementById('edit-tracker-name').value.trim();
  if(!name) return;
  const colorEl = document.querySelector('#edit-color-pick span.sel');
  t.name = name;
  if(colorEl) t.color = colorEl.dataset.hex;
  const startVal = document.getElementById('edit-tracker-start').value;
  if(startVal) t.startedAt = new Date(startVal).toISOString();
  t.hidden = document.getElementById('edit-tracker-hidden').checked;
  await saveTrackers();
  closeModal('modal-edit-tracker');
  renderDashboard();
}

// ---------------- JOURNAL ----------------
function openJournalEntry(trackerId){
  const sel = document.getElementById('journal-tracker-select');
  sel.innerHTML = trackers.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  if(trackerId) sel.value = trackerId;
  document.getElementById('journal-trigger').value = '';
  document.getElementById('journal-text').value = '';
  openModal('modal-journal-entry');
}
async function saveJournalEntry(){
  const trackerId = document.getElementById('journal-tracker-select').value;
  const trigger = document.getElementById('journal-trigger').value.trim();
  const text = document.getElementById('journal-text').value.trim();
  if(!text || !trackerId) return;
  journal.push({id:uid(), trackerId, trigger, text, createdAt:new Date().toISOString()});
  await saveJournal();
  closeModal('modal-journal-entry');
}
async function deleteJournalEntry(id){
  journal = journal.filter(j=>j.id!==id);
  await saveJournal();
  // Close and re-render — the detail modal will update on next open.
  closeModal('modal-tracker-detail');
  renderDashboard();
}
function openJournalAfterReset(){
  closeModal('modal-post-reset');
  openJournalEntry(pendingRelapseId);
}

// ---------------- INTERVENTION: BREATHING ----------------
let breathInterval = null;
function startBreathing(){
  openOverlay('overlay-breathing');
  const circle = document.getElementById('breath-circle');
  const label = document.getElementById('breath-label');
  const count = document.getElementById('breath-count');
  let cycle = 0;
  const totalCycles = 6;
  function runCycle(){
    if(cycle >= totalCycles){
      label.textContent = 'Well done';
      count.textContent = 'Notice how you feel now';
      return;
    }
    cycle++;
    count.textContent = `Cycle ${cycle} of ${totalCycles}`;
    label.textContent = 'Breathe in';
    circle.style.transform = 'scale(1.25)';
    breathInterval = setTimeout(()=>{
      label.textContent = 'Hold';
      breathInterval = setTimeout(()=>{
        label.textContent = 'Breathe out';
        circle.style.transform = 'scale(1)';
        breathInterval = setTimeout(runCycle, 4000);
      }, 1500);
    }, 4000);
  }
  runCycle();
}

// ---------------- INTERVENTION: QUOTE ----------------
function startQuote(){
  openOverlay('overlay-quote');
  // Pick a random quote, avoiding the last one shown.
  let idx;
  if(quotePool.length <= 1){
    idx = 0;
  } else {
    do { idx = Math.floor(Math.random() * quotePool.length); }
    while(idx === lastQuoteIndex);
  }
  lastQuoteIndex = idx;
  const q = quotePool[idx];
  document.getElementById('quote-text').textContent = '\u201C' + q.t + '\u201D';

  // Show attribution and source type.
  const sourceEl = document.getElementById('quote-source');
  if(q.src === 'personal'){
    sourceEl.textContent = 'Written for you, from your own reasons';
  } else if(q.a && q.a !== '—'){
    sourceEl.textContent = '— ' + q.a;
  } else {
    sourceEl.textContent = 'Take a breath with this one';
  }
}

// ---------------- INTERVENTION: TIMER ----------------
let timerInterval = null;
let timerSeconds = 600;
let timerRunning = false;
function startTimer(){
  timerSeconds = 600;
  timerRunning = true;
  document.getElementById('timer-toggle').textContent = 'Pause';
  document.getElementById('timer-toggle').style.display = 'inline-block';
  document.querySelector('#overlay-timer .timer-sub').textContent = "Just ride it out till this hits zero. You don't have to decide anything else right now — only this.";
  updateTimerDisplay();
  openOverlay('overlay-timer');
  clearInterval(timerInterval);
  timerInterval = setInterval(()=>{
    if(!timerRunning) return;
    timerSeconds--;
    if(timerSeconds <= 0){
      clearInterval(timerInterval);
      document.getElementById('timer-display').textContent = '0:00';
      document.querySelector('#overlay-timer .timer-sub').textContent = "You made it. However you feel right now, that's ten minutes the urge didn't get to decide for you.";
      document.getElementById('timer-toggle').style.display = 'none';
      return;
    }
    updateTimerDisplay();
  }, 1000);
}
function updateTimerDisplay(){
  const m = Math.floor(timerSeconds/60);
  const s = timerSeconds%60;
  document.getElementById('timer-display').textContent = m+':'+String(s).padStart(2,'0');
}
function toggleTimer(){
  timerRunning = !timerRunning;
  document.getElementById('timer-toggle').textContent = timerRunning ? 'Pause' : 'Resume';
}

// ---------------- INTERVENTION: TAP GAME ----------------
let tapCount = 0;
function startTapGame(){
  tapCount = 0;
  document.getElementById('tap-count').textContent = '0';
  openOverlay('overlay-tap');
}
function doTap(){
  tapCount++;
  document.getElementById('tap-count').textContent = tapCount;
}

// ---------------- OVERLAY HELPERS ----------------
function openOverlay(id){
  document.getElementById(id).classList.add('active');
}
function closeOverlay(id){
  document.getElementById(id).classList.remove('active');
  if(id==='overlay-breathing'){ clearTimeout(breathInterval); }
  if(id==='overlay-timer'){ clearInterval(timerInterval); document.getElementById('timer-toggle').style.display='inline-block'; }
}

// ---------------- KNOWLEDGE ----------------
let activeTopic = 'general';
// Cache for dynamic articles so we don't re-fetch on every tab switch.
let dynamicArticleCache = {};

const TOPIC_META = [
  {k:'general', l:'General'},
  {k:'alcohol', l:'Alcohol'},
  {k:'smoking', l:'Smoking/nicotine'},
  {k:'porn', l:'Compulsive use'},
  {k:'phone', l:'Phone & screens'},
  {k:'gambling', l:'Gambling'},
  {k:'food', l:'Eating patterns'},
];

function renderKnowledge(){
  const chips = document.getElementById('topic-chips');
  // Built-in chips + custom chips with remove buttons.
  let chipHtml = TOPIC_META.map(t=>`<div class="chip ${t.k===activeTopic?'active':''}" onclick="selectTopic('${t.k}')">${t.l}</div>`).join('');
  chipHtml += customTopics.map(t=>`<div class="chip ${t.k===activeTopic?'active':''}" onclick="selectTopic('${t.k}')">${escapeHtml(t.l)}<span class="remove" onclick="event.stopPropagation(); removeCustomTopic('${t.k}')">&times;</span></div>`).join('');
  chips.innerHTML = chipHtml;

  // Clear search input.
  const searchInput = document.getElementById('knowledge-search');
  if(searchInput && document.activeElement !== searchInput) searchInput.value = '';

  // Show static articles immediately as a baseline (only for built-in topics).
  const staticArts = ARTICLES[activeTopic] || [];
  if(staticArts.length) renderArticleList(staticArts);
  else if(!dynamicArticleCache[activeTopic]) renderArticleList([]);

  // If we already fetched dynamic articles for this topic this session, show those instead.
  if(dynamicArticleCache[activeTopic]){
    renderArticleList(dynamicArticleCache[activeTopic]);
    return;
  }

  // Try loading from IndexedDB cache (persisted from a previous session).
  loadCachedArticles(activeTopic).then(cached => {
    if(cached && cached.length){
      dynamicArticleCache[activeTopic] = cached;
      if(activeTopic === cached._topic) renderArticleList(cached);
    }
  });

  // If online, fetch fresh articles from the Netlify function.
  if(navigator.onLine){
    fetchDynamicArticles(activeTopic);
  }
}

function renderArticleList(arts){
  const listEl = document.getElementById('article-list');
  if(arts.length === 0){
    listEl.innerHTML = '<div class="streak-history-empty">No articles found for this topic yet.</div>';
    return;
  }
  listEl.innerHTML = arts.map(a=>`
    <div class="article-card">
      <div class="tag">${escapeHtml(a.tag)}</div>
      <h3>${escapeHtml(a.title)}</h3>
      <p>${escapeHtml(a.body)}</p>
      <a href="${a.url}" target="_blank" rel="noopener">Read more <i class="ti ti-external-link" style="font-size:13px;"></i></a>
    </div>
  `).join('');
}

async function fetchDynamicArticles(topic){
  const listEl = document.getElementById('article-list');
  const loader = document.createElement('div');
  loader.className = 'knowledge-loading';
  loader.innerHTML = '<span>Finding fresh reading material…</span>';
  listEl.appendChild(loader);

  try{
    const res = await fetch('/.netlify/functions/api?action=knowledge&topic=' + encodeURIComponent(topic));
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if(data.articles && data.articles.length){
      data.articles._topic = topic;
      dynamicArticleCache[topic] = data.articles;
      saveCachedArticles(topic, data.articles);
      if(activeTopic === topic){
        renderArticleList(data.articles);
      }
    }
  }catch(e){
    console.error('Dynamic article fetch failed:', e);
  }

  const existing = listEl.querySelector('.knowledge-loading');
  if(existing) existing.remove();
}

async function saveCachedArticles(topic, articles){
  try{
    await window.storage.set('knowledge-' + topic, {articles, ts: Date.now()});
  }catch(e){ console.error('cache save failed', e); }
}

async function loadCachedArticles(topic){
  try{
    const cached = await window.storage.get('knowledge-' + topic);
    if(!cached) return null;
    if(Date.now() - cached.ts > 86400000) return null;
    const arts = cached.articles;
    arts._topic = topic;
    return arts;
  }catch(e){ return null; }
}
function selectTopic(k){
  activeTopic = k;
  renderKnowledge();
}

async function searchCustomTopic(){
  const input = document.getElementById('knowledge-search');
  const query = input.value.trim();
  if(!query) return;
  // Normalize the key.
  const key = query.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,'-');
  // Don't add if it matches a built-in topic.
  if(TOPIC_META.some(t=>t.k===key)) {
    selectTopic(key);
    input.value = '';
    return;
  }
  // Don't add duplicates.
  if(!customTopics.some(t=>t.k===key)){
    customTopics.push({k:key, l:query.charAt(0).toUpperCase()+query.slice(1)});
    await saveCustomTopics();
  }
  input.value = '';
  activeTopic = key;
  renderKnowledge();
}

async function removeCustomTopic(k){
  customTopics = customTopics.filter(t=>t.k!==k);
  await saveCustomTopics();
  // If we were viewing the removed topic, switch back to general.
  if(activeTopic === k){
    activeTopic = 'general';
  }
  renderKnowledge();
}

// ---------------- PWA INSTALL PROMPT ----------------
let deferredInstallEvent = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredInstallEvent = e;
  // Only show the banner if not already installed/standalone
  if(!window.matchMedia('(display-mode: standalone)').matches){
    document.getElementById('install-banner').classList.add('show');
  }
});
window.addEventListener('appinstalled', ()=>{
  document.getElementById('install-banner').classList.remove('show');
  deferredInstallEvent = null;
});
document.getElementById('install-btn').addEventListener('click', async ()=>{
  if(!deferredInstallEvent) return;
  deferredInstallEvent.prompt();
  await deferredInstallEvent.userChoice;
  document.getElementById('install-banner').classList.remove('show');
  deferredInstallEvent = null;
});

// ---------------- SERVICE WORKER ----------------
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(err=>{
      console.error('Service worker registration failed', err);
    });
  });
}

// ---------------- RELAPSE CONFIRM BUTTON ----------------
document.getElementById('confirm-relapse-btn').addEventListener('click', async ()=>{
  const t = trackers.find(x=>x.id===pendingRelapseId);
  if(t){
    // Save the completed streak to history before resetting.
    streakHistory.push({
      id: uid(),
      trackerId: t.id,
      startedAt: t.startedAt,
      endedAt: new Date().toISOString()
    });
    await saveStreakHistory();

    t.startedAt = new Date().toISOString();
    await saveTrackers();
    renderDashboard();
  }
  closeModal('modal-relapse-confirm');
  // Offer to journal about what happened.
  openModal('modal-post-reset');
});

// ---------------- QUOTE PRE-FETCHING ----------------
// On boot (and when reasons change), fetch web-sourced quotes and personalized
// reflections in the background. Cache them in IndexedDB so they're available
// offline. Merge into quotePool so startQuote() draws from all sources.

async function loadCachedQuotes(){
  try{
    const cached = await window.storage.get('quote-pool-web');
    if(cached && cached.quotes && Date.now() - cached.ts < 86400000){
      addToPool(cached.quotes);
    }
  }catch(e){}
  try{
    const cached = await window.storage.get('quote-pool-personal');
    if(cached && cached.reflections){
      addToPool(cached.reflections);
    }
  }catch(e){}
}

function addToPool(items){
  if(!Array.isArray(items)) return;
  for(const item of items){
    // Avoid duplicates by checking the text.
    if(item.t && !quotePool.some(q => q.t === item.t)){
      quotePool.push(item);
    }
  }
}

async function prefetchQuotes(){
  if(!navigator.onLine || trackers.length === 0) return;

  // 1. Fetch web-sourced quotes based on tracked habits.
  const habitNames = trackers.map(t => t.name.toLowerCase());
  // Map habit names to known topic keys where possible.
  const topicKeys = habitNames.map(n => {
    if(/alcohol|drink|beer|wine|sober/.test(n)) return 'alcohol';
    if(/smok|nicotine|vape|cigarette/.test(n)) return 'smoking';
    if(/porn|compulsive/.test(n)) return 'porn';
    if(/phone|scroll|screen|social media/.test(n)) return 'phone';
    if(/gambl|betting|casino/.test(n)) return 'gambling';
    if(/food|eat|binge|snack/.test(n)) return 'food';
    return 'general';
  });
  const uniqueTopics = [...new Set(topicKeys)];

  try{
    const res = await fetch('/.netlify/functions/api?action=quotes&habits=' + encodeURIComponent(uniqueTopics.join(',')));
    if(res.ok){
      const data = await res.json();
      if(data.quotes && data.quotes.length){
        addToPool(data.quotes);
        await window.storage.set('quote-pool-web', {quotes: data.quotes, ts: Date.now()});
      }
    }
  }catch(e){ console.error('Quote prefetch failed:', e); }

  // 2. Fetch personalized reflections (only if there are reasons written).
  await prefetchReflections();
}

async function prefetchReflections(){
  if(!navigator.onLine) return;
  if(reasons.length === 0) return;

  // Build the payload: each tracked habit with its associated reasons.
  const habits = trackers.map(t => ({
    name: t.name,
    reasons: reasons.filter(r => r.trackerId === t.id).map(r => r.text)
  })).filter(h => h.reasons.length > 0);

  if(habits.length === 0) return;

  try{
    const res = await fetch('/.netlify/functions/api?action=reflections', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({habits})
    });
    if(res.ok){
      const data = await res.json();
      if(data.reflections && data.reflections.length){
        // Remove old personal reflections from the pool before adding new ones,
        // so they stay fresh when reasons change.
        quotePool = quotePool.filter(q => q.src !== 'personal');
        addToPool(data.reflections);
        await window.storage.set('quote-pool-personal', {reflections: data.reflections, ts: Date.now()});
      }
    }
  }catch(e){ console.error('Reflections prefetch failed:', e); }
}

// ---------------- BOOT ----------------
async function boot(){
  await loadState();
  renderDashboard();
  setInterval(renderDashboard, 30000);

  // Load cached quotes immediately (instant, from IndexedDB).
  await loadCachedQuotes();

  // Then refresh in the background if online (non-blocking).
  prefetchQuotes();
}
boot();
