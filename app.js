/* ============================================================
   Tournament Brackets — no dependencies, saves to localStorage
   ============================================================ */

const KEY = 'tournamentBrackets.v1';
const MAX_PHOTO_PX = 400;      // photos are downscaled before storing
const JPEG_QUALITY = 0.82;

let state = {
  title: 'Tournament',
  teams: [],
  picks: {},                       // bracket: match key -> winning team id
  scores: {},                      // points counter: team id -> running total
  life: { count: 4, start: 40, useEntrants: false, players: [] },   // commander life
  step: 1,                         // how much the +/- buttons move
  sort: 'lineup',                  // 'lineup' keeps cards still, 'points' ranks them
  theme: 'aurora'
};
let editingId = null;                 // team currently being edited, or null
let draftPhotos = [null, null];       // photos held in the form
let draftSize = 1;                    // 1 = solo entrant (default), 2 = pair
let zoom = 1;
let lastSignature = '';               // bracket shape — entrance anims only on change
let lastChampion = null;              // to fire confetti once per new champion
let lastPick = null;                  // {key, team} to pop the slot just chosen
let simulating = false;
let lastBoardSig = '';                // scoreboard team set — entrance anim only on change

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const THEMES = ['aurora', 'kart', 'music', 'halloween', 'christmas', 'newyear', 'mtg', 'darts', 'beerpong'];

/* Each skin renames the furniture. Missing semi/quarter falls back to Round N. */
const THEME_WORDS = {
  aurora:    { round: 'Round', semi: 'Semifinals', quarter: 'Quarterfinals', final: 'Final',
               match: 'Match', decided: 'Decided', champ: 'Champion', leader: 'Leading' },
  kart:      { round: 'Race', final: 'Final Race', match: 'Heat', decided: 'Finished',
               champ: "Winner's Circle", leader: 'Leading' },
  music:     { round: 'Set', final: 'Encore', match: 'Track', decided: 'Played',
               champ: 'Headliner', leader: 'Now playing' },
  halloween: { round: 'Haunt', final: 'Final Fright', match: 'Duel', decided: 'Survived',
               champ: 'Sole Survivor', leader: 'Haunting' },
  christmas: { round: 'Round', semi: 'Semifinals', final: 'Grand Finale', match: 'Match',
               decided: 'Wrapped', champ: 'Top of the Tree', leader: 'Nice list' },
  newyear:   { round: 'Round', semi: 'Semifinals', final: 'Countdown', match: 'Match',
               decided: 'Done', champ: 'Toast of the Night', leader: 'Frontrunner' },
  mtg:       { round: 'Round', semi: 'Semifinals', final: 'Final Duel', match: 'Duel',
               decided: 'Resolved', champ: 'Archmage', leader: 'Ahead' },
  darts:     { round: 'Leg', final: 'Final Leg', match: 'Board', decided: 'Checked out',
               champ: 'Checkout', leader: 'On a finish' },
  beerpong:  { round: 'Round', semi: 'Semifinals', final: 'Last Cup', match: 'Table',
               decided: 'Sunk', champ: 'Last Cup Standing', leader: 'Hot hand' }
};
const words = () => THEME_WORDS[state.theme] || THEME_WORDS.aurora;

/* What rides the connector line up to the next round. */
const TRAVEL_GLYPHS = { kart: '🏎️', music: '🎵', halloween: '🦇', christmas: '🎁', newyear: '✨', mtg: '🃏', darts: '🎯', beerpong: '🏓' };

const THEME_TOASTS = {
  aurora: '✨ Aurora restored',
  kart: '🏁 Grand Prix — start your engines',
  music: '🎵 Music — cue the next track',
  halloween: '🎃 Halloween — something stirs',
  christmas: '🎄 Christmas — let it snow',
  newyear: '🎆 New Year — ten, nine, eight…',
  mtg: '🃏 MTG — shuffle up and deal',
  darts: '🎯 Darts — game on',
  beerpong: '🥤 Beer pong — rack them up'
};

/* ---------------- storage ---------------- */

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.teams)) {
      state = {
        title: parsed.title || 'Tournament',
        teams: parsed.teams.map(normalizeTeam),
        picks: parsed.picks && typeof parsed.picks === 'object' ? parsed.picks : {},
        scores: normalizeScores(parsed.scores),
        life: normalizeLife(parsed.life),
        step: [1, 5, 10].includes(Number(parsed.step)) ? Number(parsed.step) : 1,
        sort: parsed.sort === 'points' ? 'points' : 'lineup',
        theme: THEMES.includes(parsed.theme) ? parsed.theme : 'aurora'
      };
    }
  } catch (err) {
    console.warn('Could not read saved tournament', err);
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    toast('Storage full — export to a file, or use smaller photos');
    console.warn(err);
  }
}

function normalizeTeam(t) {
  const raw = Array.isArray(t.players) ? t.players : [];
  const players = [0, 1].map(i => ({
    name: String((raw[i] && raw[i].name) || ''),
    photo: (raw[i] && raw[i].photo) || null
  }));

  // size 1 = a solo entrant, 2 = a pair. Older saves have no size field, so
  // infer it from whether a second person was ever filled in.
  let size = Number(t.size);
  if (size !== 1 && size !== 2) {
    size = (players[1].name || players[1].photo) ? 2 : 1;
  }
  if (size === 1) players.length = 1;

  return { id: t.id || uid(), name: String(t.name || 'Entrant'), size, players };
}

const isSolo = team => team.players.length === 1;

function normalizeScores(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, value] of Object.entries(raw)) {
    const n = toPoints(value);
    if (n) out[id] = n;
  }
  return out;
}

/** Points are whole numbers and may go negative (penalties). */
function toPoints(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.min(99999, Math.max(-9999, n));
}

const uid = () => 't' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

/* ---------------- helpers ---------------- */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const teamById = id => state.teams.find(t => t.id === id) || null;

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

let toastTimer;
function toast(msg) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/**
 * In-app replacement for window.confirm(), which webviews (including the app's
 * own browser pane) silently auto-dismiss — that made every delete a no-op.
 */
function askConfirm(message, { sub = '', okLabel = 'Delete' } = {}) {
  return new Promise(resolve => {
    const modal = $('#modal'), ok = $('#modalOk'), cancel = $('#modalCancel');
    $('#modalMsg').textContent = message;
    $('#modalSub').textContent = sub;
    ok.textContent = okLabel;
    modal.hidden = false;
    ok.focus();

    const done = value => {
      modal.hidden = true;
      ok.removeEventListener('click', yes);
      cancel.removeEventListener('click', no);
      modal.removeEventListener('click', backdrop);
      document.removeEventListener('keydown', key);
      resolve(value);
    };
    const yes = () => done(true);
    const no = () => done(false);
    const backdrop = e => { if (e.target === modal) done(false); };
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
    };

    ok.addEventListener('click', yes);
    cancel.addEventListener('click', no);
    modal.addEventListener('click', backdrop);
    document.addEventListener('keydown', key);
  });
}

function bump(el) {
  if (!el || calm) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 300);
}

/* ---------------- photos ---------------- */

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(new Error('Not an image'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode image'));
      img.onload = () => {
        const scale = Math.min(1, MAX_PHOTO_PX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function avatarHTML(player) {
  if (player && player.photo) {
    return `<img src="${player.photo}" alt="${esc(player.name || 'Participant')}" title="${esc(player.name || '')}">`;
  }
  return `<span class="ph" title="${esc((player && player.name) || '')}">${esc(initials(player && player.name))}</span>`;
}

const avatarsHTML = (team, cls) => `<div class="${cls}">${team.players.map(avatarHTML).join('')}</div>`;

function playerLine(team) {
  const names = team.players.map(p => p.name).filter(Boolean);
  if (names.length) return names.join(' & ');
  return isSolo(team) ? 'No name yet' : 'No participant names';
}

/* ---------------- bracket model ---------------- */

/** Standard seeding order for a bracket of `size`: 1 vs size, 2 vs size-1, ... */
function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    const next = [];
    for (const s of order) next.push(s, n + 1 - s);
    order = next;
  }
  return order;
}

/**
 * Rebuilds the whole bracket from teams + picks, so it is always consistent.
 * A slot holds a team, a bye (nothing will ever arrive) or is pending (its
 * feeder match is undecided). Byes auto-advance; pending slots do not.
 */
function buildBracket() {
  const teams = state.teams;
  const n = teams.length;
  if (n < 2) return null;

  let size = 1;
  while (size < n) size *= 2;

  const order = seedOrder(size);
  let slots = [];
  for (let i = 0; i < size; i += 2) {
    slots.push({
      a: { team: order[i] <= n ? teams[order[i] - 1].id : null, pending: false },
      b: { team: order[i + 1] <= n ? teams[order[i + 1] - 1].id : null, pending: false }
    });
  }

  const rounds = [];
  let r = 0;
  for (;;) {
    const matches = slots.map((s, i) => {
      const key = r + '-' + i;
      const a = s.a, b = s.b;
      let winner = null;
      let bye = false;
      if (a.team && b.team) {
        const pick = state.picks[key];
        if (pick === a.team || pick === b.team) winner = pick;
      } else if (a.team && !b.pending) { winner = a.team; bye = true; }
      else if (b.team && !a.pending) { winner = b.team; bye = true; }
      const live = !!(a.team || b.team || a.pending || b.pending);
      return { r, i, key, a, b, winner, bye, live };
    });
    rounds.push(matches);
    if (matches.length === 1) break;
    slots = [];
    for (let i = 0; i < matches.length; i += 2) {
      const m1 = matches[i], m2 = matches[i + 1];
      slots.push({
        a: { team: m1.winner, pending: !m1.winner && m1.live },
        b: { team: m2.winner, pending: !m2.winner && m2.live }
      });
    }
    r++;
  }
  return rounds;
}

function roundLabel(r, total) {
  const w = words();
  const fromEnd = total - 1 - r;
  if (fromEnd === 0) return w.final;
  if (fromEnd === 1 && w.semi) return w.semi;
  if (fromEnd === 2 && w.quarter) return w.quarter;
  return `${w.round} ${r + 1}`;
}

/* ---------------- theme ---------------- */

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  const blurb = $('#themeBlurb');
  if (blurb) {
    // counted from THEMES so the copy cannot drift out of date again
    const n = NUMBER_WORDS[THEMES.length] || THEMES.length;
    blurb.textContent = `Switch the whole site between ${n} skins.`;
  }
  $$('.theme-opt').forEach(b => {
    const on = b.dataset.themePick === state.theme;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function setTheme(name) {
  if (state.theme === name) return;
  state.theme = name;
  save();
  applyTheme();
  lastSignature = '';        // let the bracket re-animate into the new skin
  renderAll();
  moveGlider();
  toast(THEME_TOASTS[name] || 'Theme changed');
}

/* ---------------- points counter ---------------- */

const pointsOf = id => toPoints(state.scores[id] || 0);

function setPoints(id, value) {
  const v = toPoints(value);
  if (v === 0) delete state.scores[id];
  else state.scores[id] = v;
}

/** Highest first; equal scores keep their line-up order. Used for badges + info. */
function rankedTeams() {
  return withPoints().sort((a, b) => b.pts - a.pts || a.seed - b.seed);
}

const withPoints = () =>
  state.teams.map((team, seed) => ({ team, seed, pts: pointsOf(team.id) }));

/** What order the cards actually appear in on screen. */
const displayOrder = () => (state.sort === 'points' ? rankedTeams() : withPoints());

/** Is there a single team clearly ahead? */
function clearLeader() {
  const ranked = rankedTeams();
  const top = ranked[0];
  if (!top || top.pts <= 0) return null;
  if (ranked.length > 1 && ranked[1].pts >= top.pts) return null;
  return top;
}

function renderPoints() {
  const any = state.teams.length > 0;
  $('#pointsEmpty').hidden = any;
  $('.points-bar').hidden = !any;
  $('#scoreboard').hidden = !any;
  // scoped to this view's own switches - .step-opt is shared with the entry-type
  // switch on the Entrants form, which must not be reset from here
  $$('.step-opt[data-step-pick], .step-opt[data-sort-pick]').forEach(b => {
    const on = b.dataset.stepPick
      ? Number(b.dataset.stepPick) === state.step
      : b.dataset.sortPick === state.sort;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  if (!any) return;

  const board = $('#scoreboard');

  // FLIP: remember where each card sits, so a re-sort glides instead of jumping
  const before = new Map();
  board.querySelectorAll('.score-card').forEach(c => before.set(c.dataset.id, c.getBoundingClientRect()));

  const signature = state.teams.map(t => t.id).slice().sort().join(',');
  board.classList.toggle('no-anim', calm || signature === lastBoardSig);
  lastBoardSig = signature;

  board.innerHTML = displayOrder().map((r, i) => scoreCardHTML(r, i)).join('');
  flipCards(board.querySelectorAll('.score-card'), before);
  refreshLeaderBadges();
  updatePointsInfo();
}

function scoreCardHTML(r, i) {
  return `
    <article class="score-card" data-id="${r.team.id}" style="--i:${i}">
      <div class="sc-id">
        ${avatarsHTML(r.team, 'avatars')}
        <div class="sc-name">
          <b>${esc(r.team.name)}</b>
          <span>${esc(playerLine(r.team))}</span>
        </div>
        <span class="sc-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      </div>
      <div class="sc-disc">
        <input class="sc-value" type="number" inputmode="numeric" value="${r.pts}"
               aria-label="${esc(r.team.name)} points">
      </div>
      <div class="sc-steps">
        <button class="step up" data-dir="1" title="Add ${state.step}" aria-label="Add ${state.step} points">+</button>
        <button class="step down" data-dir="-1" title="Subtract ${state.step}" aria-label="Subtract ${state.step} points">−</button>
      </div>
    </article>`;
}

function flipCards(nodes, before) {
  if (calm || !before.size) return;
  nodes.forEach(node => {
    const was = before.get(node.dataset.id);
    if (!was) return;
    const now = node.getBoundingClientRect();
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    if (!dx && !dy) return;
    node.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      { duration: 460, easing: 'cubic-bezier(.22,1,.36,1)' }
    );
  });
}

function updatePointsInfo() {
  const total = withPoints().reduce((sum, r) => sum + r.pts, 0);
  const top = clearLeader();
  $('#pointsInfo').innerHTML =
    `<b>${state.teams.length}</b> teams · <b>${total}</b> points on the board` +
    (top ? ` · leading: <b>${esc(top.team.name)}</b> on ${top.pts}` : '');
}

/** Adds/removes the leader badge in place — no rebuilding, so nothing jumps. */
function refreshLeaderBadges() {
  const top = clearLeader();
  $$('#scoreboard .score-card').forEach(card => {
    const isLeader = !!top && card.dataset.id === top.team.id;
    card.classList.toggle('leader', isLeader);
    const badge = card.querySelector('.sc-crown');
    if (isLeader && !badge) {
      const el = document.createElement('span');
      el.className = 'sc-crown';
      el.textContent = words().leader;
      card.prepend(el);
    } else if (!isLeader && badge) {
      badge.remove();
    }
  });
}

/**
 * Updates one card's number where it stands. Rebuilding the board on every
 * click replayed the entrance animation and made the whole page lurch.
 */
function updateCard(id, dir) {
  const card = $(`#scoreboard .score-card[data-id="${id}"]`);
  if (!card) return renderPoints();
  const input = card.querySelector('.sc-value');
  input.value = pointsOf(id);
  if (dir && !calm) {
    input.classList.remove('up', 'down');
    void input.offsetWidth;
    input.classList.add(dir > 0 ? 'up' : 'down');
    const disc = card.querySelector('.sc-disc');   // spins the vinyl in the Music skin
    if (disc) {
      disc.classList.remove('kick');
      void disc.offsetWidth;
      disc.classList.add('kick');
      setTimeout(() => disc.classList.remove('kick'), 700);
    }
  }
  refreshLeaderBadges();
  updatePointsInfo();
  if (state.sort === 'points') reorderBoard();
}

/** Re-ranks by moving the existing cards, which keeps scroll and focus put. */
function reorderBoard() {
  const board = $('#scoreboard');
  const cards = Array.from(board.querySelectorAll('.score-card'));
  const before = new Map(cards.map(c => [c.dataset.id, c.getBoundingClientRect()]));
  let moved = false;
  rankedTeams().forEach((r, i) => {
    const card = board.querySelector(`.score-card[data-id="${r.team.id}"]`);
    if (!card) return;
    if (cards[i] !== card) moved = true;
    board.appendChild(card);
  });
  if (moved) flipCards(board.querySelectorAll('.score-card'), before);
}

function wirePoints() {
  const board = $('#scoreboard');

  // + / -
  board.addEventListener('click', e => {
    const btn = e.target.closest('.step');
    if (!btn) return;
    const card = btn.closest('.score-card');
    const id = card.dataset.id;
    const dir = Number(btn.dataset.dir);
    setPoints(id, pointsOf(id) + dir * state.step);
    save();

    const rect = btn.getBoundingClientRect();
    if (dir > 0) spray({ x: rect.left + rect.width / 2, y: rect.top, count: 9, power: 5.5, size: 0.55, decay: 0.05 });

    updateCard(id, dir);
  });

  // typing an exact total: update live, re-sort once the field is left
  board.addEventListener('input', e => {
    const input = e.target.closest('.sc-value');
    if (!input) return;
    setPoints(input.closest('.score-card').dataset.id, input.value);
    save();
    updatePointsInfo();
  });
  board.addEventListener('change', e => {
    const input = e.target.closest('.sc-value');
    if (input) updateCard(input.closest('.score-card').dataset.id, 0);
  });

  $$('.step-opt[data-step-pick]').forEach(b => b.addEventListener('click', () => {
    state.step = Number(b.dataset.stepPick);
    save();
    renderPoints();
  }));

  $$('.step-opt[data-sort-pick]').forEach(b => b.addEventListener('click', () => {
    state.sort = b.dataset.sortPick;
    save();
    renderPoints();
    toast(state.sort === 'points' ? 'Ranking by points' : 'Keeping line-up order');
  }));

  $('#btnResetPoints').addEventListener('click', async () => {
    if (!Object.keys(state.scores).length) return;
    const ok = await askConfirm('Reset every counter to zero?', {
      sub: 'Teams, photos and bracket results are untouched.',
      okLabel: 'Reset'
    });
    if (!ok) return;
    state.scores = {};
    save();
    renderPoints();
    toast('Counters back to zero');
  });
}

/* ---------------- commander life counter ---------------- */

const LIFE_COUNTS = [2, 3, 4, 5, 6];
const LIFE_STARTS = [20, 30, 40];
const LETHAL_CMD = 21;                       // commander damage that kills outright

/* Which way each seat faces, so players read their own total from their chair. */
const SEAT_ROTATIONS = {
  2: [180, 0],
  3: [90, 270, 0],
  4: [90, 270, 90, 270],
  5: [90, 270, 90, 270, 0],
  6: [90, 270, 90, 270, 90, 270]
};

function normalizeLife(raw) {
  const out = { count: 4, start: 40, useEntrants: false, players: [] };
  if (raw && typeof raw === 'object') {
    if (LIFE_COUNTS.includes(Number(raw.count))) out.count = Number(raw.count);
    const s = Math.round(Number(raw.start));
    if (Number.isFinite(s) && s > 0 && s <= 999) out.start = s;
    out.useEntrants = !!raw.useEntrants;
    if (Array.isArray(raw.players)) {
      out.players = raw.players.slice(0, 6).map(p => ({
        life: Number.isFinite(Number(p && p.life)) ? Math.round(Number(p.life)) : out.start,
        cmd: Array.isArray(p && p.cmd) ? p.cmd.slice(0, 6).map(n => Math.max(0, Math.round(Number(n) || 0))) : []
      }));
    }
  }
  syncLifeSeats(out);
  return out;
}

/** Keeps the seat array the same length as the chosen player count. */
function syncLifeSeats(life) {
  while (life.players.length < life.count) {
    life.players.push({ life: life.start, cmd: [] });
  }
  life.players.length = life.count;
  for (const p of life.players) {
    while (p.cmd.length < life.count) p.cmd.push(0);
    p.cmd.length = life.count;
  }
}

function resetLife() {
  state.life.players = [];
  syncLifeSeats(state.life);
  for (const p of state.life.players) {
    p.life = state.life.start;
    p.cmd = new Array(state.life.count).fill(0);
  }
}

/** Seat labels come from the entrant list when asked for, otherwise Player N. */
function seatName(i) {
  if (state.life.useEntrants && state.teams[i]) return state.teams[i].name;
  return `Player ${i + 1}`;
}

function seatTeam(i) {
  return state.life.useEntrants ? state.teams[i] || null : null;
}

/* ---------------- render: life ---------------- */

function renderLife() {
  syncLifeSeats(state.life);

  $$('.step-opt[data-seats-pick]').forEach(b => {
    const on = Number(b.dataset.seatsPick) === state.life.count;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  $$('.step-opt[data-start-pick]').forEach(b => {
    const on = Number(b.dataset.startPick) === state.life.start;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  $('#useEntrants').checked = state.life.useEntrants;
  $('#useEntrants').disabled = state.teams.length < 2;

  const grid = $('#lifeGrid');
  const rotations = SEAT_ROTATIONS[state.life.count] || SEAT_ROTATIONS[4];
  grid.dataset.count = state.life.count;
  grid.innerHTML = state.life.players.map((seat, i) => seatHTML(seat, i, rotations[i] || 0)).join('');
  updateLifeInfo();
}

function seatHTML(seat, i, rot) {
  const team = seatTeam(i);
  const dead = seat.life <= 0;
  const cmdOut = seat.cmd.some((n, from) => from !== i && n >= LETHAL_CMD);

  return `
    <div class="life-panel rot-${rot} ${dead || cmdOut ? 'down' : ''}" data-seat="${i}">
      <div class="life-inner">
        <button class="life-step minus" data-delta="-1" aria-label="${esc(seatName(i))} minus one">&minus;</button>

        <div class="life-mid">
          <div class="life-name">
            ${team ? avatarsHTML(team, 'av') : ''}
            <span>${esc(seatName(i))}</span>
          </div>
          <div class="life-total">${seat.life}</div>
          ${dead ? '<div class="life-out">Out</div>' : cmdOut ? '<div class="life-out">Cmd</div>' : ''}
          <div class="cmd-strip">
            ${seat.cmd.map((n, from) => from === i ? '' : `
              <button class="cmd-chip ${n >= LETHAL_CMD ? 'lethal' : n ? 'hit' : ''}"
                      data-from="${from}"
                      title="Commander damage from ${esc(seatName(from))} - click +1, right-click -1">${n}</button>`).join('')}
          </div>
        </div>

        <button class="life-step plus" data-delta="1" aria-label="${esc(seatName(i))} plus one">+</button>
      </div>
    </div>`;
}

function updateLifeInfo() {
  const alive = state.life.players.filter(p => p.life > 0 && !p.cmd.some(n => n >= LETHAL_CMD)).length;
  const lowest = Math.min(...state.life.players.map(p => p.life));
  $('#lifeInfo').innerHTML =
    `<b>${state.life.count}</b> players from <b>${state.life.start}</b> life · ` +
    (alive <= 1 ? '<b>game over</b>' : `${alive} still in · lowest ${lowest}`);
}

/** Repaints one seat in place - the grid is never rebuilt mid-game. */
function paintSeat(i) {
  const panel = $(`#lifeGrid .life-panel[data-seat="${i}"]`);
  const seat = state.life.players[i];
  if (!panel || !seat) return;

  const dead = seat.life <= 0;
  const cmdOut = seat.cmd.some((n, from) => from !== i && n >= LETHAL_CMD);
  panel.classList.toggle('down', dead || cmdOut);
  panel.querySelector('.life-total').textContent = seat.life;

  const out = panel.querySelector('.life-out');
  const label = dead ? 'Out' : cmdOut ? 'Cmd' : '';
  if (label && !out) {
    const el = document.createElement('div');
    el.className = 'life-out';
    el.textContent = label;
    panel.querySelector('.life-total').after(el);
  } else if (label && out) {
    out.textContent = label;
  } else if (!label && out) {
    out.remove();
  }

  panel.querySelectorAll('.cmd-chip').forEach(chip => {
    const n = seat.cmd[Number(chip.dataset.from)] || 0;
    chip.textContent = n;
    chip.classList.toggle('hit', n > 0 && n < LETHAL_CMD);
    chip.classList.toggle('lethal', n >= LETHAL_CMD);
  });
  updateLifeInfo();
}

function nudgeLife(i, delta, origin) {
  const seat = state.life.players[i];
  if (!seat) return;
  seat.life += delta;
  save();
  paintSeat(i);

  const total = $(`#lifeGrid .life-panel[data-seat="${i}"] .life-total`);
  if (total && !calm) {
    total.classList.remove('up', 'down-tick');
    void total.offsetWidth;
    total.classList.add(delta > 0 ? 'up' : 'down-tick');
  }
  if (delta > 0 && origin && !calm) {
    spray({ x: origin.x, y: origin.y, count: 7, power: 5, size: .5, decay: .06 });
  }
}

function wireLife() {
  const grid = $('#lifeGrid');

  grid.addEventListener('click', e => {
    const step = e.target.closest('.life-step');
    if (step) {
      const i = Number(step.closest('.life-panel').dataset.seat);
      nudgeLife(i, Number(step.dataset.delta), { x: e.clientX, y: e.clientY });
      return;
    }
    const chip = e.target.closest('.cmd-chip');
    if (chip) {
      const i = Number(chip.closest('.life-panel').dataset.seat);
      const from = Number(chip.dataset.from);
      const seat = state.life.players[i];
      seat.cmd[from] = Math.max(0, (seat.cmd[from] || 0) + 1);
      seat.life -= 1;                       // commander damage takes life too
      save();
      paintSeat(i);
    }
  });

  // right-click a chip to take commander damage back off
  grid.addEventListener('contextmenu', e => {
    const chip = e.target.closest('.cmd-chip');
    if (!chip) return;
    e.preventDefault();
    const i = Number(chip.closest('.life-panel').dataset.seat);
    const from = Number(chip.dataset.from);
    const seat = state.life.players[i];
    if (!seat.cmd[from]) return;
    seat.cmd[from] -= 1;
    seat.life += 1;
    save();
    paintSeat(i);
  });

  $$('.step-opt[data-seats-pick]').forEach(b => b.addEventListener('click', () => {
    state.life.count = Number(b.dataset.seatsPick);
    syncLifeSeats(state.life);
    save();
    renderLife();
  }));

  $$('.step-opt[data-start-pick]').forEach(b => b.addEventListener('click', () => {
    state.life.start = Number(b.dataset.startPick);
    resetLife();
    save();
    renderLife();
    toast(`Everyone back to ${state.life.start}`);
  }));

  $('#useEntrants').addEventListener('change', () => {
    state.life.useEntrants = $('#useEntrants').checked;
    save();
    renderLife();
  });

  $('#btnResetLife').addEventListener('click', async () => {
    const touched = state.life.players.some(p => p.life !== state.life.start || p.cmd.some(Boolean));
    if (touched) {
      const ok = await askConfirm('Start a new game?', {
        sub: `Everyone goes back to ${state.life.start} life and commander damage clears.`,
        okLabel: 'New game'
      });
      if (!ok) return;
    }
    resetLife();
    save();
    renderLife();
    toast('New game');
  });
}

/* ---------------- render: teams ---------------- */

function renderTeams() {
  const list = $('#teamList');
  const count = state.teams.length;
  $('#teamCount').textContent = count;
  $('#teamCount2').textContent = count;
  $('#teamsEmpty').hidden = count > 0;
  $('#btnGoBracket').disabled = count < 2;

  // remember where each row sits so a reorder can glide instead of jumping
  const before = new Map();
  list.querySelectorAll('.team-row').forEach(r => before.set(r.dataset.id, r.getBoundingClientRect()));
  const known = new Set(before.keys());
  const firstPaint = known.size === 0;

  list.innerHTML = state.teams.map((t, idx) => `
    <li class="team-row" data-id="${t.id}" draggable="true" style="--i:${idx}">
      <span class="seed" title="Seed ${idx + 1}">${idx + 1}</span>
      ${avatarsHTML(t, 'avatars')}
      <div class="team-meta">
        <div class="tn">${esc(t.name)}</div>
        <div class="pn">${esc(playerLine(t))}</div>
      </div>
      <div class="row-actions">
        <button class="icon-btn" data-act="up" title="Move up" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-btn" data-act="down" title="Move down" ${idx === count - 1 ? 'disabled' : ''}>↓</button>
        <button class="icon-btn" data-act="edit" title="Edit">✎</button>
        <button class="icon-btn del" data-act="del" title="Delete">✕</button>
      </div>
    </li>`).join('');

  if (!calm) {
    list.querySelectorAll('.team-row').forEach(row => {
      if (firstPaint) row.classList.add('fresh');                 // staggered first paint
      else if (!known.has(row.dataset.id)) row.classList.add('fresh', 'now');
    });
  }
  flipCards(list.querySelectorAll('.team-row'), before);
}

/* ---------------- render: bracket ---------------- */

function renderBracket() {
  const rounds = buildBracket();
  const scroll = $('#bracketScroll');
  const bar = $('.bracket-bar');
  const empty = $('#bracketEmpty');

  if (!rounds) {
    scroll.hidden = true;
    bar.hidden = true;
    empty.hidden = false;
    $('#champion').hidden = true;
    lastChampion = null;
    return;
  }
  scroll.hidden = false;
  bar.hidden = false;
  empty.hidden = true;

  const size = rounds[0].length * 2;
  const byes = size - state.teams.length;
  const decided = rounds.flat().filter(m => m.winner && !m.bye).length;
  const playable = rounds.flat().filter(m => !m.bye).length;
  $('#bracketInfo').innerHTML =
    `<b>${state.teams.length}</b> teams · <b>${rounds.length}</b> rounds · ${size}-team bracket` +
    (byes ? ` · ${byes} bye${byes > 1 ? 's' : ''}` : '') +
    ` · <b>${decided}/${playable}</b> matches played`;

  // Only replay entrance animations when the bracket's shape actually changes.
  const signature = state.teams.map(t => t.id).join(',') + '|' + rounds.length;
  const fresh = signature !== lastSignature;
  lastSignature = signature;

  let d = 0;
  const html = rounds.map((matches, r) => `
    <div class="round" data-round="${r}">
      <div class="round-label"><b>${roundLabel(r, rounds.length)}</b></div>
      <div class="round-body">
        ${matches.map(m => matchHTML(m, d++)).join('')}
      </div>
    </div>`).join('');

  const wrap = $('#bracket');
  wrap.classList.toggle('no-anim', !fresh || calm);
  // paths live in their own <g> so redraws never wipe a travelling token
  wrap.innerHTML = `<svg class="connectors" id="connectors" aria-hidden="true"><g class="paths"></g></svg>${html}`;

  const champ = rounds[rounds.length - 1][0].winner;
  renderChampion(champ);
  if (champ && champ !== lastChampion) fireConfetti();
  lastChampion = champ;

  const pick = lastPick;
  lastPick = null;
  requestAnimationFrame(() => {
    drawConnectors(fresh && !calm);
    if (pick) celebrateWin(pick);
  });
  $$('#bracket img').forEach(img => {
    if (!img.complete) img.addEventListener('load', () => requestAnimationFrame(() => drawConnectors(false)), { once: true });
  });
  observeBracket();
}

function matchHTML(m, d) {
  // the round pill already names the stage, so the card just numbers the matchup
  // (the round is the "Race", an individual matchup inside it is a "Heat")
  const label = `${words().match} ${m.i + 1}`;
  const ready = m.a.team && m.b.team && !m.winner;
  // no status text until the match has actually been won — a live match just pulses
  const status = m.bye ? 'Bye' : m.winner ? words().decided : '';
  return `
    <div class="match ${m.winner ? 'decided' : ''} ${ready ? 'live' : ''}" data-key="${m.key}" style="--d:${d}">
      <div class="match-head"><span>${label}</span><span class="st">${status}</span></div>
      ${slotHTML(m, m.a)}
      ${slotHTML(m, m.b)}
    </div>`;
}

function slotHTML(m, slot) {
  const team = teamById(slot.team);
  if (!team) {
    return `<div class="slot empty">
      <div class="av"><span class="ph">–</span></div>
      <div class="info"><div class="name">${slot.pending ? 'To be decided' : 'Bye'}</div></div>
      <span class="mark"></span></div>`;
  }
  const isWinner = m.winner === slot.team;
  const isLoser = m.winner && !isWinner;
  const seed = state.teams.findIndex(t => t.id === slot.team) + 1;
  return `
    <button class="slot ${isWinner ? 'winner' : ''} ${isLoser ? 'loser' : ''}" data-team="${slot.team}" data-key="${m.key}">
      ${avatarsHTML(team, 'av')}
      <div class="info">
        <div class="name">${esc(team.name)}</div>
        <div class="sub">#${seed} · ${esc(playerLine(team))}</div>
      </div>
      <span class="mark">${isWinner ? '✔' : ''}</span>
    </button>`;
}

/** Kart and Music skins supply their own emoji mark in CSS. */
const champMark = id => (state.theme === 'aurora' ? trophySVG(id) : '');

/** Gradient trophy mark — no gold anywhere. */
function trophySVG(gradId) {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="${gradId}" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop stop-color="#a78bfa"/><stop offset=".55" stop-color="#e879f9"/><stop offset="1" stop-color="#22d3ee"/>
      </linearGradient>
    </defs>
    <path d="M7.5 3.5h9V9a4.5 4.5 0 0 1-9 0V3.5Z" stroke="url(#${gradId})" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M7.5 5H4.6v1.4A3.4 3.4 0 0 0 8 9.8M16.5 5h2.9v1.4A3.4 3.4 0 0 1 16 9.8" stroke="url(#${gradId})" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M12 13.6V17M8.6 20.4h6.8" stroke="url(#${gradId})" stroke-width="1.7" stroke-linecap="round"/>
  </svg>`;
}

function renderChampion(teamId) {
  const box = $('#champion');
  const team = teamById(teamId);
  if (!team) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `
    <span class="cup" id="cupIcon" title="Celebrate again">${champMark('champGrad')}</span>
    <div>
      <div class="lbl">${words().champ}</div>
      <div class="cname">${esc(team.name)}</div>
      <div class="cplayers">${esc(playerLine(team))}</div>
    </div>
    ${avatarsHTML(team, 'cav')}`;
  $('#cupIcon').addEventListener('click', fireConfetti);
}

/** Elbow lines from each match to the match it feeds. */
function drawConnectors(animate) {
  const wrap = $('#bracket');
  const svg = $('#connectors');
  if (!wrap || !svg) return;

  const box = wrap.getBoundingClientRect();
  const scale = wrap.offsetWidth ? box.width / wrap.offsetWidth : 1;
  const rel = el => {
    const r = el.getBoundingClientRect();
    return {
      left: (r.left - box.left) / scale,
      right: (r.right - box.left) / scale,
      mid: (r.top + r.height / 2 - box.top) / scale
    };
  };

  svg.setAttribute('viewBox', `0 0 ${wrap.offsetWidth} ${wrap.offsetHeight}`);
  svg.setAttribute('width', wrap.offsetWidth);
  svg.setAttribute('height', wrap.offsetHeight);

  const rounds = $$('#bracket .round');
  const out = [];
  let d = 0;
  for (let r = 0; r < rounds.length - 1; r++) {
    const kids = Array.from(rounds[r].querySelectorAll('.match'));
    const parents = Array.from(rounds[r + 1].querySelectorAll('.match'));
    kids.forEach((kid, i) => {
      const parent = parents[Math.floor(i / 2)];
      if (!parent) return;
      const k = rel(kid), p = rel(parent);
      const midX = (k.right + p.left) / 2;
      const decided = kid.classList.contains('decided');
      const len = Math.abs(midX - k.right) + Math.abs(p.mid - k.mid) + Math.abs(p.left - midX) + 4;
      out.push(
        `<path class="${decided ? 'flow' : ''} ${animate ? 'draw' : ''}" data-key="${kid.dataset.key}"
           d="M ${k.right} ${k.mid} L ${midX} ${k.mid} L ${midX} ${p.mid} L ${p.left} ${p.mid}"
           stroke="${decided ? 'rgba(52,211,153,.85)' : 'rgba(255,255,255,.13)'}"
           style="--len:${len};--d:${d++};${animate && !decided ? `stroke-dasharray:${len};` : ''}"/>`
      );
    });
  }
  let group = svg.querySelector('g.paths');
  if (!group) {
    group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'paths');
    svg.insertBefore(group, svg.firstChild);
  }
  group.innerHTML = out.join('');
}

let bracketObserver = null;
function observeBracket() {
  if (typeof ResizeObserver === 'undefined') return;
  const wrap = $('#bracket');
  if (!wrap) return;
  if (bracketObserver) bracketObserver.disconnect();
  bracketObserver = new ResizeObserver(() => requestAnimationFrame(() => drawConnectors(false)));
  bracketObserver.observe(wrap);
}

/* ---------------- confetti ---------------- */

const PALETTES = {
  aurora: ['#a78bfa', '#8b5cf6', '#e879f9', '#22d3ee', '#34d399', '#ffffff'],
  kart: ['#ff4757', '#1d78ff', '#ffd93d', '#22c55e', '#ffffff', '#171a33'],
  music: ['#e2482a', '#0e7c73', '#1d1a15', '#fffdf9', '#d97706', '#8c1c13'],
  halloween: ['#ff7518', '#8b5cf6', '#7cb518', '#f4f0ea', '#1a1020', '#ff9d4d'],
  christmas: ['#c1121f', '#2d6a4f', '#ffffff', '#f1e3c8', '#95d5b2', '#9b2226'],
  newyear: ['#e8eaf0', '#4dabff', '#ff5fa2', '#8b5cf6', '#ffffff', '#5eead4'],
  mtg: ['#8c2f26', '#1f5fa8', '#1f6b3a', '#6b4b1f', '#f3e9cf', '#2a2438'],
  darts: ['#c8102e', '#1a7a44', '#f2ead6', '#3fbf6f', '#0d1712', '#8c1024'],
  beerpong: ['#d0342c', '#1f6fb2', '#f2b23e', '#fffaf2', '#2f9e57', '#7b4a24']
};
const confettiColors = () => PALETTES[state.theme] || PALETTES.aurora;
let particles = [];
let particleRaf = null;

function sizeConfetti() {
  const canvas = $('#confetti');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** One shared loop, so overlapping bursts never wipe each other's frames. */
function runParticles() {
  const ctx = $('#confetti').getContext('2d');
  const tick = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    particles = particles.filter(p => {
      p.vy += p.g;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= p.decay;
      if (p.life <= 0 || p.y > innerHeight + 40) return false;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      return true;
    });
    if (particles.length) particleRaf = requestAnimationFrame(tick);
    else { particleRaf = null; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  };
  if (!particleRaf) particleRaf = requestAnimationFrame(tick);
}

function spray({ x, y, count = 40, power = 9, spreadX = 0, up = 1, size = 1, decay = 0.012, gravity = 0.28 }) {
  if (calm) return;
  const colors = confettiColors();
  for (let i = 0; i < count; i++) {
    const angle = (Math.random() - 0.5) * Math.PI * 0.9;
    particles.push({
      x: x + (Math.random() - 0.5) * spreadX,
      y: y + (Math.random() - 0.5) * 12,
      vx: Math.sin(angle) * power * (0.5 + Math.random()),
      vy: -Math.abs(Math.cos(angle)) * power * up * (0.6 + Math.random()),
      w: (4 + Math.random() * 5) * size,
      h: (6 + Math.random() * 7) * size,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      g: gravity,
      decay,
      c: colors[(Math.random() * colors.length) | 0],
      life: 1
    });
  }
  runParticles();
}

/** Big burst for a crowned champion. */
function fireConfetti() {
  spray({
    x: innerWidth / 2, y: innerHeight * 0.3,
    count: 150, power: 13, spreadX: innerWidth * 0.5, decay: 0.009
  });
}

/* ---------------- win celebration ---------------- */

function celebrateWin(pick) {
  const slot = $(`#bracket .slot[data-key="${pick.key}"][data-team="${pick.team}"]`);
  if (!slot) return;

  if (!calm) {
    slot.classList.add('pop', 'flash');
    setTimeout(() => slot.classList.remove('flash'), 900);
    const r = slot.getBoundingClientRect();
    spray({
      x: pick.x != null ? pick.x : r.left + r.width / 2,
      y: pick.y != null ? pick.y : r.top + r.height / 2,
      count: 26, power: 7.5, spreadX: 30, size: 0.8, decay: 0.024
    });
  }
  travelToNextRound(pick.key);
}

/** Sends a glowing token along the connector into the match the winner joins. */
function travelToNextRound(key) {
  const [r, i] = key.split('-').map(Number);
  const arrive = () => {
    const parent = $(`#bracket .match[data-key="${r + 1}-${Math.floor(i / 2)}"]`);
    if (!parent) return;
    const slot = parent.querySelectorAll('.slot')[i % 2];
    if (!slot) return;
    slot.classList.remove('arrive');
    void slot.offsetWidth;
    slot.classList.add('arrive');
    setTimeout(() => slot.classList.remove('arrive'), 800);
  };

  const svg = $('#connectors');
  const path = svg && svg.querySelector(`path[data-key="${key}"]`);
  if (!path || calm || typeof path.getTotalLength !== 'function') return arrive();

  const len = path.getTotalLength();
  const ns = 'http://www.w3.org/2000/svg';
  const glyph = TRAVEL_GLYPHS[state.theme] || null;
  const racing = !!glyph;
  const dot = document.createElementNS(ns, racing ? 'text' : 'circle');
  dot.setAttribute('class', 'travel');
  if (racing) {
    dot.setAttribute('font-size', '22');
    dot.setAttribute('text-anchor', 'middle');
    dot.setAttribute('dominant-baseline', 'central');
    dot.textContent = glyph;
  } else {
    dot.setAttribute('r', '5');
  }
  svg.appendChild(dot);
  const place = (x, y) => {
    dot.setAttribute(racing ? 'x' : 'cx', x);
    dot.setAttribute(racing ? 'y' : 'cy', y);
  };

  const duration = 620;
  const start = performance.now();
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const p = path.getPointAtLength(eased * len);
    place(p.x, p.y);
    dot.setAttribute('opacity', t > 0.85 ? (1 - t) / 0.15 : 1);
    if (t < 1) requestAnimationFrame(step);
    else { dot.remove(); arrive(); }
  };
  requestAnimationFrame(step);
}

/* ---------------- trace a team on hover ---------------- */

function wireTrace() {
  const wrap = $('#bracket');
  wrap.addEventListener('pointerover', e => {
    const slot = e.target.closest('.slot[data-team]');
    if (!slot) return;
    const id = slot.dataset.team;
    wrap.classList.add('tracing');
    wrap.querySelectorAll(`.slot[data-team="${id}"]`).forEach(s => s.classList.add('trace'));
  });
  wrap.addEventListener('pointerout', e => {
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.slot[data-team]')) return;
    wrap.classList.remove('tracing');
    wrap.querySelectorAll('.slot.trace').forEach(s => s.classList.remove('trace'));
  });
}

/* ---------------- drag to re-seed ---------------- */

let dragId = null;

function wireDrag() {
  const list = $('#teamList');

  list.addEventListener('dragstart', e => {
    const row = e.target.closest('.team-row');
    if (!row) return;
    dragId = row.dataset.id;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });

  list.addEventListener('dragend', () => {
    dragId = null;
    $$('.team-row').forEach(r => r.classList.remove('dragging', 'drop-above', 'drop-below'));
  });

  list.addEventListener('dragover', e => {
    if (!dragId) return;
    e.preventDefault();
    const row = e.target.closest('.team-row');
    $$('.team-row').forEach(r => r.classList.remove('drop-above', 'drop-below'));
    if (!row || row.dataset.id === dragId) return;
    const r = row.getBoundingClientRect();
    row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below');
  });

  list.addEventListener('drop', e => {
    if (!dragId) return;
    e.preventDefault();
    const row = e.target.closest('.team-row');
    if (!row || row.dataset.id === dragId) return;
    const from = state.teams.findIndex(t => t.id === dragId);
    let to = state.teams.findIndex(t => t.id === row.dataset.id);
    const r = row.getBoundingClientRect();
    const after = e.clientY >= r.top + r.height / 2;
    const [moved] = state.teams.splice(from, 1);
    if (from < to) to--;
    state.teams.splice(after ? to + 1 : to, 0, moved);
    save();
    renderAll();
    toast('Re-seeded');
  });
}

/* ---------------- form ---------------- */

function renderForm() {
  const solo = draftSize === 1;
  const noun = solo ? 'player' : 'team';
  $('#formHeading').textContent = `${editingId ? 'Edit' : 'Add a'} ${noun}`;
  $('#btnSaveTeam').textContent = editingId ? 'Save changes' : `Add ${noun}`;
  $('#btnCancelEdit').hidden = !editingId;
  $('#playersWrap').classList.toggle('solo', solo);
  $('#player2').hidden = solo;
  $('#pname1').placeholder = solo ? 'Player name' : 'Participant 1';
  $$('.step-opt[data-size-pick]').forEach(b => {
    const on = Number(b.dataset.sizePick) === draftSize;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  [1, 2].forEach(slot => {
    const drop = $(`.photo-drop[data-drop="${slot}"]`);
    const img = drop.querySelector('.preview');
    const clear = drop.querySelector('.photo-clear');
    const photo = draftPhotos[slot - 1];
    if (photo) { img.src = photo; drop.classList.add('has-photo'); clear.hidden = false; }
    else { img.removeAttribute('src'); drop.classList.remove('has-photo'); clear.hidden = true; }
  });
}

function resetForm() {
  editingId = null;
  draftPhotos = [null, null];
  draftSize = 1;
  $('#teamName').value = '';
  $$('.p-name').forEach(i => (i.value = ''));
  $('#formError').hidden = true;
  renderForm();
}

function startEdit(id) {
  const t = teamById(id);
  if (!t) return;
  editingId = id;
  draftSize = t.players.length;
  draftPhotos = [t.players[0].photo, t.players[1] ? t.players[1].photo : null];
  $('#teamName').value = t.name;
  $('.p-name[data-name="1"]').value = t.players[0].name;
  $('.p-name[data-name="2"]').value = t.players[1] ? t.players[1].name : '';
  renderForm();
  showView('teams');
  $('.form-card').scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'nearest' });
  $('#teamName').focus();
}

function saveTeamFromForm() {
  const name = $('#teamName').value.trim();
  const p1 = $('.p-name[data-name="1"]').value.trim();
  const p2 = $('.p-name[data-name="2"]').value.trim();
  const err = $('#formError');

  const solo = draftSize === 1;
  if (!name && !p1 && (solo || !p2)) {
    err.textContent = solo
      ? 'Give the player a name.'
      : 'Give the team a name, or at least one participant.';
    err.hidden = false;
    return;
  }
  const players = solo
    ? [{ name: p1, photo: draftPhotos[0] }]
    : [{ name: p1, photo: draftPhotos[0] }, { name: p2, photo: draftPhotos[1] }];
  const payload = {
    name: name || (solo ? p1 : [p1, p2].filter(Boolean).join(' & ')),
    size: draftSize,
    players
  };

  if (editingId) {
    Object.assign(teamById(editingId), payload);
    toast('Team updated');
  } else {
    state.teams.push({ id: uid(), ...payload });
    toast(`${payload.name} is in`);
    bump($('#teamCount'));
    bump($('#teamCount2'));
  }
  save();
  resetForm();
  renderAll();
}

/* ---------------- views ---------------- */

function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
  $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === name));
  moveGlider();
  if (name === 'bracket') requestAnimationFrame(() => drawConnectors(!calm));
}

function moveGlider() {
  const active = $('.tab.is-active');
  const glider = $('#tabGlider');
  if (!active || !glider) return;
  glider.style.width = active.offsetWidth + 'px';
  glider.style.transform = `translateX(${active.offsetLeft - 5}px)`;
}

function renderAll() {
  renderTeams();
  renderBracket();
  renderPoints();
  renderLife();
}

/* ---------------- simulate ---------------- */

async function simulate() {
  if (simulating) return;
  simulating = true;
  $('#btnSimulate').disabled = true;
  for (let guard = 0; guard < 300; guard++) {
    const rounds = buildBracket();
    if (!rounds) break;
    const open = rounds.flat().filter(m => m.a.team && m.b.team && !m.winner);
    if (!open.length) break;
    const m = open[0];
    state.picks[m.key] = Math.random() < 0.5 ? m.a.team : m.b.team;
    lastPick = { key: m.key, team: state.picks[m.key] };
    renderBracket();
    await sleep(calm ? 0 : 420);   // long enough for the travel animation to land
  }
  save();
  simulating = false;
  $('#btnSimulate').disabled = false;
}

/* ---------------- export / import ---------------- */

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.title || 'tournament').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Exported');
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.teams)) throw new Error('Missing teams');
      state = {
        title: parsed.title || 'Tournament',
        teams: parsed.teams.map(normalizeTeam),
        picks: parsed.picks && typeof parsed.picks === 'object' ? parsed.picks : {},
        scores: normalizeScores(parsed.scores),
        life: normalizeLife(parsed.life),
        step: [1, 5, 10].includes(Number(parsed.step)) ? Number(parsed.step) : 1,
        sort: parsed.sort === 'points' ? 'points' : 'lineup',
        theme: THEMES.includes(parsed.theme) ? parsed.theme : 'aurora'
      };
      $('#tourneyTitle').value = state.title;
      lastSignature = '';
      lastChampion = null;
      applyTheme();
      save();
      resetForm();
      renderAll();
      toast(`Loaded ${state.teams.length} teams`);
    } catch (e) {
      toast('That file does not look like a tournament export');
    }
  };
  reader.readAsText(file);
}

/* ---------------- events ---------------- */

function wire() {
  $$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
  $('#btnGoBracket').addEventListener('click', () => showView('bracket'));
  window.addEventListener('load', moveGlider);

  const title = $('#tourneyTitle');
  title.value = state.title;
  title.addEventListener('input', () => {
    state.title = title.value.trim() || 'Tournament';
    save();
  });

  // photo pickers
  [1, 2].forEach(slot => {
    const drop = $(`.photo-drop[data-drop="${slot}"]`);
    const file = $(`.p-file[data-file="${slot}"]`);
    const use = async f => {
      try {
        draftPhotos[slot - 1] = await readPhoto(f);
        renderForm();
      } catch (err) {
        toast('Could not use that image');
      }
    };

    drop.addEventListener('click', e => {
      if (e.target.closest('.photo-clear')) return;
      file.click();
    });
    drop.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
    });
    drop.querySelector('.photo-clear').addEventListener('click', e => {
      e.stopPropagation();
      draftPhotos[slot - 1] = null;
      file.value = '';
      renderForm();
    });
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (f) use(f);
    });
    ['dragenter', 'dragover'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragover'); }));
    drop.addEventListener('drop', e => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) use(f);
    });
  });

  // form
  $('#btnSaveTeam').addEventListener('click', saveTeamFromForm);
  $('#btnCancelEdit').addEventListener('click', resetForm);
  ['#teamName', '.p-name[data-name="1"]', '.p-name[data-name="2"]'].forEach(sel =>
    $(sel).addEventListener('keydown', e => { if (e.key === 'Enter') saveTeamFromForm(); }));

  // team rows
  $('#teamList').addEventListener('click', async e => {
    const btn = e.target.closest('.icon-btn');
    if (!btn) return;
    const row = e.target.closest('.team-row');
    const id = row.dataset.id;
    const act = btn.dataset.act;

    if (act === 'edit') return startEdit(id);

    if (act === 'del') {
      const team = teamById(id);
      if (!team) return;
      const ok = await askConfirm(`Delete ${team.name}?`, {
        sub: isSolo(team)
          ? 'The player and their photo are removed, and the bracket re-seeds.'
          : 'The team and both photos are removed, and the bracket re-seeds.'
      });
      if (!ok) return;
      row.classList.add('removing');
      await sleep(calm ? 0 : 200);
      const at = state.teams.findIndex(t => t.id === id);   // re-read: the await let time pass
      if (at === -1) return;
      state.teams.splice(at, 1);
      if (editingId === id) resetForm();
      save();
      renderAll();
      toast(`${team.name} removed`);
      return;
    }

    const idx = state.teams.findIndex(t => t.id === id);
    if (act === 'up' && idx > 0) {
      [state.teams[idx - 1], state.teams[idx]] = [state.teams[idx], state.teams[idx - 1]];
    }
    if (act === 'down' && idx < state.teams.length - 1) {
      [state.teams[idx + 1], state.teams[idx]] = [state.teams[idx], state.teams[idx + 1]];
    }
    save();
    renderAll();
  });

  $('#btnShuffle').addEventListener('click', () => {
    for (let i = state.teams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.teams[i], state.teams[j]] = [state.teams[j], state.teams[i]];
    }
    state.picks = {};
    lastSignature = '';
    save();
    renderAll();
    toast('Seeds shuffled — results cleared');
  });

  $('#btnClearTeams').addEventListener('click', async () => {
    if (!state.teams.length) return;
    const ok = await askConfirm(`Delete all ${state.teams.length} teams?`, {
      sub: 'Every team, photo and result goes. Export first if you want a backup.',
      okLabel: 'Delete all'
    });
    if (!ok) return;
    state.teams = [];
    state.picks = {};
    save();
    resetForm();
    renderAll();
  });

  // bracket picks
  $('#bracket').addEventListener('click', e => {
    const slot = e.target.closest('.slot');
    if (!slot || slot.classList.contains('empty')) return;
    const { key, team } = slot.dataset;
    const clearing = state.picks[key] === team;
    state.picks[key] = clearing ? null : team;
    lastPick = clearing ? null : { key, team, x: e.clientX, y: e.clientY };
    save();
    renderBracket();
  });

  $('#btnResetPicks').addEventListener('click', () => {
    state.picks = {};
    lastChampion = null;
    save();
    renderBracket();
    toast('Results cleared');
  });

  $('#btnSimulate').addEventListener('click', simulate);

  const setZoom = v => {
    zoom = Math.min(1.3, Math.max(0.5, Math.round(v * 10) / 10));
    $('#bracketZoom').style.zoom = zoom;
    $('#zoomLabel').textContent = Math.round(zoom * 100) + '%';
    requestAnimationFrame(() => drawConnectors(false));
  };
  $('#btnZoomIn').addEventListener('click', () => setZoom(zoom + 0.1));
  $('#btnZoomOut').addEventListener('click', () => setZoom(zoom - 0.1));
  document.addEventListener('keydown', e => {
    if (!$('#modal').hidden) return;            // the dialog owns the keyboard
    if (e.target.matches('input,textarea')) {
      if (e.key === 'Escape' && editingId) resetForm();
      return;
    }
    if (e.key === '+' || e.key === '=') setZoom(zoom + 0.1);
    if (e.key === '-') setZoom(zoom - 0.1);
    if (e.key === 'Escape' && editingId) resetForm();
  });

  // export / import
  $('#btnExport').addEventListener('click', exportJSON);
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', () => {
    const f = $('#importFile').files[0];
    if (f) importJSON(f);
    $('#importFile').value = '';
  });

  window.addEventListener('resize', () => {
    moveGlider();
    sizeConfetti();
    requestAnimationFrame(() => drawConnectors(false));
  });

  $$('.theme-opt').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themePick)));

  $$('.step-opt[data-size-pick]').forEach(b => b.addEventListener('click', () => {
    draftSize = Number(b.dataset.sizePick);
    renderForm();
  }));

  wireDrag();
  wireTrace();
  wirePoints();
  wireLife();
}

/* ---------------- boot ---------------- */

load();
applyTheme();
sizeConfetti();
wire();
renderForm();
renderAll();
moveGlider();
