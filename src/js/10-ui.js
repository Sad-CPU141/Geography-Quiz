/* ---- shared UI: DOM helper, menus, setup ---- */
const SVGNS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'g', 'circle', 'rect']);
function h(tag, props, ...kids) {
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVGNS, tag) : document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.entries(v).forEach(([sk, sv]) => sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv));
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat(Infinity).forEach((k) => { if (k == null || k === false) return; el.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k))); });
  return el;
}
const root = document.getElementById('root');
let cleanup = []; // things to undo when the screen changes (key listeners, timers)
// A screen that's redrawn in place (e.g. setup after tapping an option) keeps its scroll position; a new screen
// starts at the top. Screens that redraw in place mark their top element with data-screen.
let lastScreen = null;
function mount(...nodes) {
  cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); cleanup = [];
  document.body.classList.remove('fullscreen');
  const list = nodes.filter(Boolean), key = list[0] && list[0].getAttribute && list[0].getAttribute('data-screen');
  const same = key && key === lastScreen, y = window.scrollY;
  root.replaceChildren(...list);
  window.scrollTo(0, same ? y : 0);
  lastScreen = key || null;
}
let toastTimer;
function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h('div', { class: 'toast', role: 'status' }, msg); document.body.appendChild(t);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2600);
}
const shapeSvg = (id, cls) => h('svg', { class: cls, viewBox: '0 0 600 450', role: 'img', 'aria-label': 'Country outline' }, h('path', { d: BY_ID[id].shape }));
const topbar = (title, onBack) => h('div', { class: 'topbar' }, onBack ? h('button', { class: 'iconbtn', 'aria-label': 'Back', onclick: onBack }, '←') : h('span', { class: 'iconspace' }), h('div', { class: 'title' }, title), h('span', { class: 'iconspace' }));
function seg(items, current, onPick, n) {
  return h('div', { class: 'seg', style: { '--n': n || items.length } }, items.map((it) =>
    h('button', { class: 'opt', 'aria-pressed': String(it.id === current), onclick: () => onPick(it.id) }, it.em ? h('span', { class: 'em', 'aria-hidden': 'true' }, it.em) : null, it.label, it.sub ? h('small', null, it.sub) : null)));
}
// A one-line on/off switch.
function optRow(label, on, onSet) {
  return h('div', { class: 'optrow' }, h('span', null, label),
    h('button', { class: 'switch', role: 'switch', 'aria-checked': String(on), 'aria-label': label, onclick: () => onSet(!on) }, h('i')));
}
function modal(...kids) {
  const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(); } }, h('div', { class: 'card modal', role: 'dialog', 'aria-modal': 'true' }, ...kids));
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  function close() { document.removeEventListener('keydown', onKey, true); bg.remove(); }
  bg.close = close;
  // remove() from anywhere also drops the Escape listener.
  const rm = bg.remove.bind(bg); bg.remove = () => { document.removeEventListener('keydown', onKey, true); rm(); };
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(bg);
  return bg;
}
// The site's own "are you sure?" box (instead of the browser's confirm()).
function ask(title, yesLabel, onYes, note) {
  let bg = null;
  const no = h('button', { class: 'btn ghost small', onclick: () => bg.remove() }, 'Cancel');
  bg = modal(h('h2', { class: 'display', style: { fontSize: '30px' } }, title), note ? h('p', { class: 'small muted' }, note) : null,
    h('button', { class: 'btn danger small', onclick: () => { bg.remove(); onYes(); } }, yesLabel), no);
  no.focus();
}
// When copying isn't allowed: show the text to copy by hand (instead of the browser's prompt()).
function copyBox(title, text) {
  const ta = h('textarea', { class: 'copybox', readonly: true, rows: Math.min(6, text.split('\n').length + 1) });
  ta.value = text;
  const bg = modal(h('p', { class: 'eyebrow' }, title), ta, h('button', { class: 'btn primary small', onclick: () => bg.remove() }, 'Done'));
  ta.focus(); ta.select();
}

/* ---------------- app state ---------------- */
const S = {
  setup: Object.assign({ kind: 'board', games: ['flags'], mode: 'flags', region: 'world', count: 25, style: 'type', group: false }, store.get('gs_setup_v2', {})),
  myName: store.get('gs_name_v1', ''),
  players: store.get('gs_players_v1', []),
  challenge: null, // { cfg, name, time, correct } from a link
  session: null,
};
if (!Array.isArray(S.setup.games) || !S.setup.games.length) S.setup.games = ['flags'];

// A challenge link: ?c=CODE&n=Name&t=ms&s=correct
(function readLink() {
  const q = new URLSearchParams(location.search);
  if (!q.get('c')) return;
  const cfg = decodeCode(q.get('c'));
  if (cfg) {
    const t = parseInt(q.get('t'), 10), s = parseInt(q.get('s'), 10);
    S.challenge = { cfg, name: (q.get('n') || 'Your friend').slice(0, 24), time: Number.isFinite(t) && t > 0 ? t : null, correct: Number.isFinite(s) ? s : null };
  } else S.badLink = true;
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
})();

/* ---------------- screens ---------------- */
function home() {
  liveStop(); S.liveNext = null;
  if (S.updateReady && reloadForUpdate(S.updateReady)) return;
  const c = S.challenge;
  mount(h('div', { class: 'app', 'data-screen': 'home' },
    h('header', { class: 'hero' },
      h('span', { class: 'tag' }, '● Game night'),
      h('h1', { class: 'display logo' }, 'Geography', h('span', null, 'Speedrun')),
      h('p', null, 'Geography against the clock.')),
    S.badLink ? h('p', { class: 'small muted center' }, 'That challenge link didn\'t work (it may be from an older version). Ask for a new one.') : null,
    c ? h('div', { class: 'card sky' },
      h('p', { class: 'eyebrow' }, 'Challenge from ' + c.name),
      h('div', { class: 'display', style: { fontSize: '30px' } }, c.time ? fmtTime(c.time) : 'Same run'),
      h('p', { class: 'muted' }, cfgLabel(c.cfg) + (c.correct != null ? ' · ' + c.correct + '/' + cfgTotal(c.cfg) + ' right' : '')),
      nameField(),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost small', onclick: () => { S.challenge = null; home(); } }, 'Not now'),
        h('button', { class: 'btn primary small', onclick: () => { startSession(c.cfg, [S.myName || 'You'], c); } }, 'Take it on'))) : null,
    dailyCard(),
    h('div', { class: 'stack' },
      h('button', { class: 'btn primary', onclick: setup }, '▶ New run'),
      h('button', { class: 'btn ghost', onclick: () => onlineHub() }, '🌐 Online'),
      missCount() ? h('button', { class: 'btn ghost', onclick: misses }, '🎯 My misses') : null,
      h('button', { class: 'btn ghost', onclick: bests }, '⏱ Best times')),
    h('div', { class: 'foot' }, h('a', { href: '../' }, '← Game Night'), ' · ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); credits(); } }, 'Credits'), ' · ' + DATA.length + ' countries'),
  ));
  S.badLink = false;
}

// The Daily run: same for everyone today. Your first go counts; you can replay, but the score stays.
// The daily run can be played once per day on a device. Once you've pressed Go it's used up (leaving early
// counts); after that the card opens your result instead.
function dailyCard() {
  const day = todayNum(), cfg = dailyCfg(day), mine = store.get('gs_daily_v1', {})[day];
  let streak = 0; const all = store.get('gs_daily_v1', {});
  for (let d = day; all[d]; d--) streak++;
  const done = mine && mine.time != null;
  return h('div', { class: 'card daily' + (mine ? ' played' : ''), onclick: mine ? (e) => { if (!e.target.closest('button')) dailyResult(day); } : null },
    h('div', { class: 'daily-top' }, h('p', { class: 'eyebrow' }, '📅 Daily run · ' + dayLabel(day)), streak > 1 ? h('span', { class: 'badge' }, '🔥 ' + streak + ' days') : null),
    h('div', { class: 'daily-what' }, regionOf(cfg.region).label + ': ' + cfg.games.map((g) => gameOf(g).em + ' ' + gameOf(g).label).join(' → ')),
    done ? h('p', null, 'Your score today: ', h('b', null, mine.correct + '/' + mine.total + ' in ' + fmtTime(mine.time))) : mine ? h('p', null, 'You left today\'s run early') : null,
    mine ? h('p', { class: 'small muted' }, 'Next run at midnight ET') : h('p', { class: 'small muted' }, 'One go a day · new run at midnight ET'),
    h('div', { class: 'row' },
      done ? h('button', { class: 'btn ghost small', onclick: () => shareDaily(day, mine) }, '📤 Share') : null,
      mine ? h('button', { class: 'btn ghost small', onclick: () => dailyResult(day) }, '📊 How I did') :
        h('button', { class: 'btn gold small', onclick: () => startSession(cfg, [S.myName || 'You'], null, day) }, '▶ Play today\'s run')));
}
// Today's daily result (from the card): time, score and what you missed in each game.
function dailyResult(day) {
  const cfg = dailyCfg(day), mine = store.get('gs_daily_v1', {})[day];
  if (!mine) { home(); return; }
  if (mine.sections && mine.sections.some((x) => x.game === 'lang') && !langsReady()) { needLangs().then(() => dailyResult(day), () => home()); return; }
  const done = mine.time != null;
  mount(h('div', { class: 'app', 'data-screen': 'daily' }, topbar('📅 Daily · ' + dayLabel(day), home),
    h('p', { class: 'center muted' }, regionOf(cfg.region).label + ': ' + cfg.games.map((g) => gameOf(g).em + ' ' + gameOf(g).label).join(' → ')),
    done ? h('div', { class: 'center stack', style: { gap: '6px' } }, h('div', { class: 'result-time' }, fmtTime(mine.time))) : h('p', { class: 'center' }, 'You left this run early.'),
    done ? h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, mine.correct + '/' + mine.total), h('span', null, 'Found')),
      h('div', { class: 'stat' }, h('b', null, Math.round(mine.correct / mine.total * 100) + '%'), h('span', null, 'Score'))) : null,
    done ? h('button', { class: 'btn gold small', onclick: () => shareDaily(day, mine) }, '📤 Share') : null,
    mine.sections ? h('div', { class: 'stack' }, mine.sections.map(missedBoard)) : null,
    h('p', { class: 'small muted center' }, 'Next run at midnight ET'),
    h('button', { class: 'btn ghost small', onclick: home }, '⌂ Home')));
}
async function shareDaily(day, mine) {
  const cfg = dailyCfg(day);
  const url = location.origin + location.pathname + '?' + new URLSearchParams({ c: encodeCode(cfg).replace(/-/g, ''), n: S.myName || 'A friend', t: String(mine.time), s: String(mine.correct) }).toString();
  const text = 'Geography Speedrun · Daily ' + dayLabel(day) + '\n' + regionOf(cfg.region).label + ': ' + cfg.games.map((g) => gameOf(g).label).join(' + ') + '\n' + mine.correct + '/' + mine.total + ' in ' + fmtTime(mine.time);
  if (navigator.share) { try { await navigator.share({ title: 'Geography Speedrun daily', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + '\n' + url); toast('Daily result copied'); } catch (e) { copyBox('Copy and send', text + '\n' + url); }
}

function nameField() {
  return h('label', { class: 'field' }, h('span', { class: 'eyebrow' }, 'Your name'),
    h('input', { class: 'input', value: S.myName, maxlength: 24, placeholder: 'Name', autocomplete: 'nickname', oninput: (e) => { S.myName = e.target.value.trim(); store.set('gs_name_v1', S.myName); } }));
}

// Time limits: shown as m:ss; typed as m:ss or seconds.
const fmtSecs = (x) => Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0');
function parseSecs(t) {
  t = String(t || '').trim(); if (!t) return 0;
  const m = /^(\d+)\s*[:.]\s*(\d{1,2})$/.exec(t);
  return m ? +m[1] * 60 + +m[2] : Math.round(+t.replace(/s$/i, '') || 0);
}
function setup() {
  const st = S.setup;
  if (S.liveNext) { st.kind = 'board'; st.group = 'live'; } // picking the next round of an online race
  st.games = (st.games || []).filter((g) => gameOf(g) && !gameOf(g).retired); // can be empty (owner): then Start waits for a game
  const save = () => store.set('gs_setup_v2', st);
  const set = (k) => (v) => { st[k] = v; save(); setup(); };
  const regionItems = REGIONS.map((r) => ({ id: r.id, label: r.short || r.label, sub: pool(r.id).length + '' }));
  if (!Array.isArray(st.regions)) st.regions = [];
  if (!(st.mixN >= 1)) st.mixN = 30;
  const mixedOk = st.kind === 'board'; // Mixed (N random countries) is for board runs; Quick fire has its own "How many"
  // Where this run is: one region, several continents, or N random countries.
  const where = (cfg) => st.multi ? withWhere(cfg, st.regions) : st.region === 'mixed' ? (mixedOk ? withWhere(Object.assign(cfg, { region: 'world' }), [], Math.min(196, st.mixN)) : Object.assign(cfg, { region: 'world' })) : cfg;
  const noWhere = st.multi && !st.regions.length;
  const noGames = st.kind === 'board' && !st.games.length;
  const n = noWhere ? 0 : cfgPool(where({ kind: 'board', games: [], region: st.region, seed: 1 })).length;
  let nameInput;
  const addPlayer = () => {
    const v = (nameInput.value || '').trim().slice(0, 24); if (!v) return;
    if (S.players.length >= 8) return toast('8 players max');
    if (S.players.some((p) => p.toLowerCase() === v.toLowerCase())) return toast('That name is taken');
    S.players.push(v); store.set('gs_players_v1', S.players); setup();
    setTimeout(() => document.querySelector('#pname') && document.querySelector('#pname').focus(), 0);
  };

  // Board: which games, in which order. "Your run" lists the picked games (move ↑ ↓, remove ✕); below, the games
  // in tabs (Classic, Map, Flags, Words, Puzzles) — tap one to add it to the run (or take it out).
  function gamesCard() {
    const move = (g, d) => { const i = st.games.indexOf(g), j = i + d; if (j < 0 || j >= st.games.length) return; [st.games[i], st.games[j]] = [st.games[j], st.games[i]]; save(); setup(); };
    const toggle = (g) => { if (st.games.includes(g)) st.games = st.games.filter((x) => x !== g); else st.games.push(g); save(); setup(); };
    const cat = GAME_CATS.find((c) => c.id === st.cat) || GAME_CATS[0];
    if (!st.counts || typeof st.counts !== 'object') st.counts = {};
    // How many for this game: type a number, or leave it empty for the default.
    // Country games: empty = all of them ("all 46"; with Mixed 5 it's "all 5"); a number = that many ("10 of 46").
    // Round games: empty = the usual number ("1 puzzle"), or with Mixed the Mixed number ("5 puzzles").
    const mixed = st.region === 'mixed' && !st.multi && st.kind === 'board';
    const perGame = mixed ? Math.min(st.mixN, n) : n;
    if (!st.limits || typeof st.limits !== 'object') st.limits = {};
    const units = { countries: ['country', 'countries'], rounds: ['round', 'rounds'], puzzles: ['puzzle', 'puzzles'], letters: ['letter', 'letters'], names: ['name', 'names'] };
    const plural = (k, u) => (units[u] ? units[u][k === 1 ? 0 : 1] : u);
    // How many questions a game will have (for the countdown's suggested time).
    const unitsOf = (g) => {
      const c = GAME_COUNTS[g]; if (!c) return perGame;
      const v = st.counts[g] || 0, def = mixed ? st.mixN : c.def;
      return !c.def ? (v ? Math.min(v, perGame) : perGame) : Math.min(v || def, g === 'letter' ? 26 : 999);
    };
    const secsBox = (k, usual, what) => h('label', { class: 'howmany-row' },
      h('input', { class: 'howmany secs', type: 'number', inputmode: 'numeric', min: 3, max: 120, placeholder: String(usual), value: st[k] && +st[k] !== usual ? String(st[k]) : '', 'aria-label': 'Seconds per ' + what,
        onchange: (e) => { const v = Math.round(+e.target.value || 0); if (v >= 3 && v <= 120 && v !== usual) st[k] = v; else delete st[k]; save(); setup(); } }),
      h('small', null, 's per ' + what));
    // Countdown style: the time limit for this game, e.g. 1:30 or 90 (seconds). Empty = the suggested time.
    const limitBox = (g) => {
      const sug = suggestedLimit({ lrSec: st.lrSec, scSec: st.scSec }, g, unitsOf(g)), v = st.limits[g] || 0;
      return h('label', { class: 'howmany-row' }, h('span', { 'aria-hidden': 'true' }, '⏳'),
        h('input', { class: 'howmany limit', type: 'text', inputmode: 'numeric', placeholder: fmtSecs(sug), value: v ? fmtSecs(v) : '', 'aria-label': 'Time limit for ' + gameOf(g).label,
          onchange: (e) => { const x = parseSecs(e.target.value); if (x >= 5 && x <= 7200 && x !== sug) st.limits[g] = x; else delete st.limits[g]; save(); setup(); } }),
        h('small', null, v ? 'time limit' : 'suggested'));
    };
    const howMany = (g) => {
      const c = GAME_COUNTS[g]; if (!c) return null;
      const byCountry = !c.def, v = st.counts[g] || 0, def = mixed ? st.mixN : c.def;
      const box = h('input', { class: 'howmany', type: 'number', inputmode: 'numeric', min: 1, max: 999, placeholder: byCountry ? 'All' : String(def), value: v ? String(v) : '', 'aria-label': 'How many ' + c.unit + ' in ' + gameOf(g).label,
        onchange: (e) => { const x = Math.floor(+e.target.value || 0); if (x > 0) st.counts[g] = Math.min(999, x); else delete st.counts[g]; save(); setup(); } });
      const note = byCountry ? (v && v < perGame ? 'of ' + perGame + ' ' + plural(perGame, c.unit) : 'all ' + perGame + ' ' + plural(perGame, c.unit))
        : plural(unitsOf(g), c.unit);
      return h('label', { class: 'howmany-row' }, box, h('small', null, note));
    };
    const extras = (g) => h('span', { class: 'game-extras' }, howMany(g),
      g === 'letter' ? secsBox('lrSec', LETTER_SEC, 'letter') : g === 'scramble' ? secsBox('scSec', SCRAMBLE_SEC, 'name') : null,
      st.countdown ? limitBox(g) : null);
    const picked = st.games.map((g, i) => {
      const G = gameOf(g);
      return h('div', { class: 'game-row on', 'data-game': g },
        h('span', { class: 'game-num' }, String(i + 1)),
        h('span', { class: 'game-txt' }, h('b', null, G.em + ' ' + G.label), extras(g)),
        h('span', { class: 'game-move' },
          st.games.length > 1 ? [h('button', { class: 'iconbtn sm', 'aria-label': 'Move ' + G.label + ' up', disabled: i === 0, onclick: () => move(g, -1) }, '↑'),
            h('button', { class: 'iconbtn sm', 'aria-label': 'Move ' + G.label + ' down', disabled: i === st.games.length - 1, onclick: () => move(g, 1) }, '↓')] : null,
          h('button', { class: 'iconbtn sm rm', 'aria-label': 'Remove ' + G.label, onclick: () => toggle(g) }, '✕')));
    });
    const row = (g) => {
      const on = st.games.includes(g), G = gameOf(g);
      return h('button', { class: 'game-pick' + (on ? ' on' : ''), 'data-game': g, 'aria-pressed': String(on), onclick: () => toggle(g) },
        h('span', { class: 'game-em', 'aria-hidden': 'true' }, G.em), h('span', { class: 'game-txt' }, h('b', null, G.label), h('small', null, G.desc)), h('span', { class: 'game-tick' }, on ? '✓' : '+'));
    };
    return h('div', { class: 'card' },
      h('p', { class: 'eyebrow' }, 'Timer'),
      seg([{ id: false, label: 'Stopwatch', em: '⏱️', sub: 'Fastest wins' }, { id: true, label: 'Countdown', em: '⏳', sub: 'Most done in time' }], !!st.countdown, set('countdown'), 2),
      h('p', { class: 'eyebrow' }, 'Your run'),
      h('div', { class: 'games picked' }, picked),
      h('button', { class: 'btn primary add-games', onclick: () => gameBrowser(st, () => { save(); setup(); }) }, '＋ Add games'));
  }
  // Options: the ones that are on (or changed) show; the rest are in a fold-out. Each has a ? that explains it.
  function optionsCard() {
    const board = st.kind === 'board', has = (g) => board && st.games.includes(g), mapG = board && st.games.some((g) => MAP_GAMES.has(g));
    const all = [
      { k: 'help', label: '💡 Spelling help', on: board || st.style === 'type', tip: 'Shows "Did you mean …?" when you\'re a letter or two off. Tapping it answers.' },
      { k: 'practice', label: '🧘 Practice', on: board && st.group !== 'live', tip: 'No clock and a Show answer button. Nothing is saved.' },
      { k: 'hard', label: '🧱 Map: no borders', on: mapG, tip: 'Maps show coastlines only — no borders between countries until you answer them.' },
      { k: 'allMap', label: '🌍 Map: all countries tappable', on: mapG, tip: 'Every country on the map can be tapped, not just the ones in this run, so colours don\'t give the answers away.' },
      { k: 'langType', label: '⌨️ Languages: type it', on: has('lang'), tip: 'Type the language\'s name instead of picking from 4.' },
      { k: 'strict', label: '🎯 One shot', on: board && (st.games.some((g) => TYPING_GAMES.includes(g)) || (has('lang') && st.langType)), tip: 'Answers only go in when you press Enter. A wrong one is missed and you move on.' },
      { k: 'peek', label: '👀 See what game others are on', on: board && st.group === 'live', invert: true, tip: 'Online: while a friend is still playing you see which game they\'re on (never their score).' },
    ].filter((o) => o.on);
    const isOn = (o) => o.num ? !!(st[o.k] && +st[o.k] !== o.num) : o.invert ? st[o.k] !== false : !!st[o.k];
    const row = (o) => {
      const tip = h('p', { class: 'opt-tip', hidden: true }, o.tip);
      const q = h('button', { class: 'opt-q', title: o.tip, 'aria-label': 'What is ' + o.label.replace(/^\S+ /, '') + '?', onclick: () => { tip.hidden = !tip.hidden; } }, '?');
      const ctl = o.num
        ? h('input', { class: 'howmany secs', type: 'number', inputmode: 'numeric', min: 3, max: 120, placeholder: String(o.num), value: st[o.k] && +st[o.k] !== o.num ? String(st[o.k]) : '', 'aria-label': o.label,
          onchange: (e) => { const v = Math.round(+e.target.value || 0); if (v >= 3 && v <= 120 && v !== o.num) st[o.k] = v; else delete st[o.k]; save(); setup(); } })
        : h('button', { class: 'switch', role: 'switch', 'aria-checked': String(isOn(o)), 'aria-label': o.label, onclick: () => { st[o.k] = o.invert ? !isOn(o) : !st[o.k]; save(); setup(); } }, h('i'));
      return h('div', { class: 'optwrap' }, h('div', { class: 'optrow' }, h('span', { class: 'opt-name' }, o.label, q), ctl), tip);
    };
    // Spelling help and Practice always show (owner); the others show when on, the rest fold away.
    const always = (o) => o.k === 'help' || o.k === 'practice';
    const active = all.filter((o) => always(o) || isOn(o)), rest = all.filter((o) => !always(o) && !isOn(o));
    if (!all.length) return null;
    const open = !!st.optsOpen;
    return h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Options'),
      active.map(row),
      rest.length ? h('button', { class: 'more-toggle', 'aria-expanded': String(open), onclick: () => { st.optsOpen = !open; save(); setup(); } },
        h('span', null, (open ? '▾ ' : '▸ ') + (active.length ? 'More options' : 'Options')), h('small', null, rest.length + (active.length ? ' more' : ''))) : null,
      open ? rest.map(row) : null);
  }
  function quickCards() {
    const counts = (n > 60 ? [10, 25, 50] : [10, 20]).filter((x) => x < n).concat([n]);
    if (!counts.includes(st.count)) st.count = counts.includes(25) ? 25 : counts[Math.min(1, counts.length - 1)];
    return [
      h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'What to name'), seg(MODES, st.mode, set('mode'), 3)),
      h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'How many'), seg(counts.map((c) => ({ id: c, label: c === n ? 'All ' + c : String(c) })), st.count, set('count'), counts.length)),
      h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'How to answer'), seg(STYLES, st.style, set('style'), 2),
        h('p', { class: 'small muted' }, st.style === 'type' ? 'Skip +10s' : 'Wrong +5s')),
    ];
  }
  const cfgNow = () => st.kind === 'board'
    ? withOpts(where({ kind: 'board', games: st.games.slice(), region: st.region, seed: newSeed() }), st)
    : where({ kind: 'quick', mode: st.mode, region: st.region, count: st.count, style: st.style, seed: newSeed() });
  const toggleRegion = (r) => { st.regions = st.regions.includes(r) ? st.regions.filter((x) => x !== r) : st.regions.concat([r]); save(); setup(); };
  const mixItem = { id: 'mixed', label: 'Mixed', em: '🎲', sub: String(st.mixN) };
  function whereCard() {
    const cur = st.region === 'mixed' && !mixedOk ? 'world' : st.region;
    return h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Where'),
      st.multi
        ? h('div', { class: 'seg', style: { '--n': 3 } }, CONTINENTS.map((r) => h('button', { class: 'opt', 'aria-pressed': String(st.regions.includes(r)), onclick: () => toggleRegion(r) },
          regionLabel(r), h('small', null, String(pool(r).length)))))
        : [seg(regionItems.slice(0, 4), cur, set('region'), 4), seg(regionItems.slice(4).concat(mixedOk ? [mixItem] : []), cur, set('region'), mixedOk ? 4 : 3)],
      !st.multi && st.region === 'mixed' && mixedOk ? h('div', { class: 'optrow' }, h('span', null, 'Random countries'),
        h('input', { class: 'input num mixn', type: 'number', inputmode: 'numeric', min: 1, max: 196, value: String(st.mixN), 'aria-label': 'How many random countries',
          onchange: (e) => { st.mixN = Math.max(1, Math.min(196, Math.round(+e.target.value) || 30)); save(); setup(); } })) : null,
      optRow('🗺️ Pick several', !!st.multi, (v) => { st.multi = v; if (v && !st.regions.length && CONTINENTS.includes(st.region)) st.regions = [st.region]; save(); setup(); }),
      st.multi ? h('p', { class: 'small muted' }, st.regions.length ? n + ' countries' : 'Pick at least one') : null);
  }
  mount(h('div', { class: 'app', 'data-screen': 'setup' },
    S.liveNext ? topbar('Next round · ' + S.liveNext, () => liveBackToRoom()) : topbar('New run', home),
    S.liveNext ? null : h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Style'),
      seg([{ id: 'board', label: 'Full board', em: '🧩', sub: 'All at once' }, { id: 'quick', label: 'Quick fire', em: '⚡', sub: 'One at a time' }], st.kind, set('kind'), 2)),
    st.kind === 'board' ? gamesCard() : null,
    whereCard(),
    st.kind === 'quick' ? quickCards() : null,
    optionsCard(),
    S.liveNext ? null : h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Who is playing'),
      seg([{ id: false, label: 'Just me', em: '🙋' }, { id: true, label: 'Pass the phone', em: '👥' }].concat(st.kind === 'board' ? [{ id: 'live', label: 'Online', em: '🌐' }] : []), st.kind === 'quick' && st.group === 'live' ? false : st.group, set('group'), st.kind === 'board' ? 3 : 2),
      st.group === true ? [
        h('div', { class: 'chips' }, S.players.map((p, i) => h('span', { class: 'chip' }, p, h('button', { 'aria-label': 'Remove ' + p, onclick: () => { S.players.splice(i, 1); store.set('gs_players_v1', S.players); setup(); } }, '✕')))),
        h('div', { class: 'row' }, nameInput = h('input', { id: 'pname', class: 'input', placeholder: 'Add a player', maxlength: 24, onkeydown: (e) => { if (e.key === 'Enter') addPlayer(); } }), h('button', { class: 'btn ghost small', style: { flex: '0 0 auto', width: 'auto' }, onclick: addPlayer }, '+ Add')),
      ] : nameField()),
    S.liveNext ? h('button', { class: 'btn primary', disabled: noWhere || noGames, onclick: () => liveStartRound(liveCfg(cfgNow(), st)) }, '▶ Start round ' + ((LIVE.room && LIVE.room.round || 0) + 1)) :
    st.group === 'live' && st.kind === 'board' ? h('button', { class: 'btn primary', disabled: noWhere || noGames, onclick: () => liveCreate(liveCfg(cfgNow(), st)) }, noGames ? 'Add a game first' : '🌐 Create room') :
    h('button', {
      class: 'btn primary', disabled: noWhere || noGames || (st.group === true && S.players.length < 2),
      onclick: () => startSession(cfgNow(), st.group === true ? S.players.slice() : [S.myName || 'You'], null),
    }, noGames ? 'Add a game first' : st.group === true && S.players.length < 2 ? 'Add at least 2 players' : '▶ Start'),
  ));
}

function codeEntry() {
  let inp, info;
  const btn = h('button', { class: 'btn primary', disabled: true, onclick: () => { const cfg = decodeCode(inp.value); if (cfg) startSession(cfg, S.setup.group && S.players.length >= 2 ? S.players.slice() : [S.myName || 'You'], null); } }, '▶ Play this run');
  const check = () => {
    const cfg = decodeCode(inp.value);
    info.replaceChildren(cfg ? h('p', { class: 'muted' }, '✓ ' + cfgLabel(cfg)) : h('p', { class: 'small muted' }, inp.value.replace(/[^0-9a-z]/gi, '').length >= 8 ? 'Code not found' : 'e.g. ABCD-1234'));
    btn.disabled = !cfg;
  };
  mount(h('div', { class: 'app' }, topbar('Challenge code', home),
    h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Friend\'s code'),
      inp = h('input', { class: 'input code', style: { fontSize: '28px' }, placeholder: 'ABCD-1234', maxlength: 12, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', oninput: () => check() }),
      info = h('div')),
    btn));
  check(); inp.focus();
}

// What you keep missing: the countries you get wrong most, per game, with a practice run for each.
const missCount = () => Object.values(store.get('gs_misses_v1', {})).reduce((n, g) => n + Object.keys(g).length, 0);
function misses() {
  const book = store.get('gs_misses_v1', {});
  const games = MISS_GAMES.filter((g) => book[g] && Object.keys(book[g]).length);
  const practise = (g) => {
    const ids = topMisses(book, g, 30).map(([id]) => id);
    startSession({ kind: 'board', games: [g], region: 'world', seed: newSeed(), custom: { [g]: ids } }, [S.myName || 'You'], null, null, true);
  };
  mount(h('div', { class: 'app', 'data-screen': 'misses' }, topbar('My misses', home),
    games.length ? games.map((g) => {
      const list = topMisses(book, g, 12), G = gameOf(g);
      return h('div', { class: 'card' },
        h('div', { class: 'daily-top' }, h('p', { class: 'eyebrow' }, G.em + ' ' + G.label), h('button', { class: 'btn primary small', style: { width: 'auto' }, onclick: () => practise(g) }, '🧘 Practice')),
        h('ul', { class: 'pairs' }, list.map(([id, n]) => h('li', null, h('span', null, g === 'capitals' ? BY_ID[id].name + ' → ' + BY_ID[id].capital : g === 'revcap' ? BY_ID[id].capital + ' → ' + BY_ID[id].name : BY_ID[id].name), h('b', null, '×' + n)))));
    }) : h('p', { class: 'muted center' }, 'Nothing yet'),
    games.length ? h('button', { class: 'btn ghost small', onclick: () => ask('Clear your misses?', 'Clear', () => { store.set('gs_misses_v1', {}); misses(); }) }, 'Clear') : null));
}

function bests() {
  const b = store.get('gs_best_v2', {});
  const rows = Object.entries(b).sort((x, y) => x[1].label.localeCompare(y[1].label));
  mount(h('div', { class: 'app', 'data-screen': 'bests' }, topbar('Best times', home),
    rows.length ? h('ul', { class: 'list board' }, rows.map(([k, v]) =>
      h('li', null, h('div', { class: 'q' }, v.label, h('small', null, v.correct + '/' + v.total + ' right' + (v.name ? ' · ' + v.name : ''))), h('div', { class: 't' }, fmtTime(v.time))))) :
      h('p', { class: 'muted center' }, 'No runs yet. Your best for each kind of run shows up here.'),
    rows.length ? h('button', { class: 'btn ghost small', onclick: () => ask('Clear best times?', 'Clear', () => { store.set('gs_best_v2', {}); bests(); }) }, 'Clear best times') : null));
}

function credits() {
  const bg = modal(h('h2', { class: 'display' }, 'Credits'),
    h('p', { class: 'small' }, 'Flags: flag-icons (MIT licence). Maps and country outlines: Natural Earth (public domain) via world-atlas (ISC). Names and capitals: world-countries by mledoze (ODbL 1.0). Some outlines are cropped to the main territory. Licence texts are in the licenses folder.'),
    h('p', { class: 'small muted' }, DATA.length + ' countries: the UN member states except Israel, Vatican City and Palestine (UN observers), Kosovo and Taiwan. Flags are shown in their real proportions. Where a country has more than one capital or a separate seat of government, either one counts. Grey areas on the map (like Greenland or Western Sahara) aren\'t in the game.'),
    h('button', { class: 'btn ghost small', onclick: () => bg.remove() }, 'Close'));
}


/* ---------------- the game browser (Roblox style) ----------------
   "＋ Add games" opens a sheet of game cards: a picture of the game, its name and a ＋ to add it. Tap a card for
   a bigger picture, what it is and an example. Tabs filter by kind (All, Classic, Map, Flags, Words, Puzzles). */
const GAME_INFO = {
  flags: ['Every flag of the region on one board. Pick a tile and type the country.', 'A red circle on white → Japan'],
  map: ['A country is named; tap it on the map. Three wrong taps and it flashes red.', 'Find: Peru → tap it'],
  capitals: ['Every country of the region; type each one\'s capital.', 'Kenya → Nairobi'],
  shapes: ['Country outlines only — no map, no names. Type the country.', 'A boot shape → Italy'],
  revcap: ['Capitals on the tiles; type the country each one belongs to.', 'Canberra → Australia'],
  mapname: ['A country lights up gold on the map and the map flies to it. Type its name.', 'Gold country in South America → Bolivia'],
  borders: ['A country is shown; name every country it shares a land border with.', 'Spain → France, Portugal, Andorra'],
  flagmap: ['A flag is shown; tap its country on the map.', 'Maple-leaf flag → tap Canada'],
  duel: ['Two countries; tap the one with more land area.', 'Egypt or Nigeria? → Egypt'],
  lang: ['A real sentence in an official language; pick (or type) which language it is.', '"Alle Menschen sind frei…" → German'],
  chain: ['Get from one country to another over land by naming the countries in between, like Travle. Only the countries you name appear on the map. At the end you see the shortest route.', 'France → Poland: Germany'],
  all: ['No prompts: type every country of the region you can remember. Each one lights up on the map.', 'Europe: France, Spain, Italy…'],
  hot: ['A mystery country on a globe, like Globle. Guess any country; it\'s painted redder the closer it is. Unlimited guesses.', 'Brazil: 1,200 km → Bolivia: bordering → Paraguay ✓'],
  closer: ['Which of two countries is closer to a third? The two are close calls.', 'Closer to Japan: Philippines or Thailand?'],
  clues: ['One clue to start; every wrong guess shows the next one. Fewer clues = better.', 'About 88,000 km², landlocked… → Hungary'],
  letter: ['A letter and 12 seconds: name as many countries starting with it as you can.', 'S → Spain, Sweden, Sudan…'],
  scramble: ['A country\'s letters, mixed up. Type the real name.', 'NDEWES → Sweden'],
  flagpick: ['A country is named; find its flag among all the flags (Seterra style).', 'Find: Ireland → tap 🇮🇪'],
};
const artFlag = (id) => h('img', { class: 'art-flag', src: BY_ID[id].flag, alt: '' });
// A crop of the real world map (once map.js is loaded): countries coloured by st (id → 'gold' | 'ok' | 'near' | 'bad'),
// optionally only those countries drawn (Travle style). vb = [x, y, w, h] on the world map.
function mapArt(vb, st, only) {
  const M = window.GS_MAP.world;
  const paths = Object.entries(M.c).filter(([id]) => !only || st[id]).map(([id, d]) => h('path', { class: 'cty' + (st[id] ? ' a-' + st[id] : ''), d }));
  return h('svg', { class: 'map art-map', viewBox: vb.join(' '), preserveAspectRatio: 'xMidYMid slice' }, h('rect', { class: 'sea', x: vb[0] - 50, y: vb[1] - 50, width: vb[2] + 100, height: vb[3] + 100 }), only ? null : h('path', { class: 'land', d: M.land }), ...paths);
}
// A small globe (once d3 + the outlines are loaded), turned to [lon, lat], countries coloured by colour.
function globeArt(rot, colours) {
  const proj = d3.geoOrthographic().translate([100, 100]).scale(92).rotate(rot).clipAngle(90), gp = d3.geoPath(proj);
  return h('svg', { class: 'globe art-globe', viewBox: '0 0 200 200' }, h('path', { class: 'g-sea', d: gp({ type: 'Sphere' }) }), h('path', { class: 'g-grat', d: gp(d3.geoGraticule10()) }),
    ...DATA.map((c) => h('path', { class: 'g-cty', d: gp(globeFeature(c.id)) || '', style: colours[c.id] ? { fill: colours[c.id] } : null })));
}
function gameArt(g) {
  const A = (cls, ...kids) => h('div', { class: 'art art-' + cls }, ...kids);
  const haveMap = !!window.GS_MAP, haveGlobe = !!(window.d3 && window.d3.geoOrthographic && window.GS_GLOBE);
  if (haveMap) {
    switch (g) {
      case 'map': return A('mapbox', mapArt([470, 480, 320, 240], { pe: 'ok' }), h('span', { class: 'art-pin', style: { left: '38%', top: '28%' } }, '📍'), h('span', { class: 'art-chip' }, 'Find: Peru'));
      case 'mapname': return A('mapbox', mapArt([520, 520, 240, 180], { bo: 'gold' }), h('span', { class: 'art-chip' }, 'Name it: ?'));
      case 'flagmap': return A('mapbox', mapArt([1110, 410, 200, 150], { ke: 'ok' }), h('img', { class: 'art-flag corner', src: BY_ID.ke.flag, alt: '' }), h('span', { class: 'art-pin', style: { left: '48%', top: '30%' } }, '📍'));
      case 'borders': return A('mapbox', mapArt([920, 170, 200, 150], { es: 'gold', fr: 'ok', pt: 'near', ad: 'near' }), h('span', { class: 'art-chips' }, h('i', { class: 'ok' }, 'France'), h('i', null, '?'), h('i', null, '?')));
      case 'all': return A('mapbox', mapArt([915, 115, 290, 218], { fr: 'ok', es: 'ok', it: 'ok', de: 'ok', pl: 'ok', pt: 'ok' }), h('span', { class: 'art-chip' }, '6 found · 40 left'));
      case 'chain': return A('mapbox', mapArt([955, 140, 190, 142], { fr: 'gold', de: 'ok', pl: 'gold', it: 'bad' }, true), h('span', { class: 'art-chip' }, 'France → Poland'));
    }
  }
  if (haveGlobe && g === 'hot') return A('globebox', globeArt([58, 18], { br: '#7f0000', pe: '#ef6548', co: '#fdbb84', py: '#35d07f' }), h('span', { class: 'art-chip' }, 'Paraguay ✓ in 4'));
  switch (g) {
    case 'flags': return A('grid', ...['jp', 'br', 'ca', 'ke'].map(artFlag));
    case 'map': return A('shape', shapeSvg('pe', 'art-shape'), h('span', { class: 'art-pin' }, '📍'), h('span', { class: 'art-chip' }, 'Find: Peru'));
    case 'capitals': return A('ui', h('span', { class: 'ui-tile' }, artFlag('ke'), h('b', null, 'Kenya')), h('span', { class: 'ui-input' }, 'Nairobi', h('em', null, '✓')));
    case 'shapes': return A('ui', h('span', { class: 'ui-tile shape' }, shapeSvg('it', 'art-shape')), h('span', { class: 'ui-input' }, 'Italy', h('em', null, '✓')));
    case 'revcap': return A('ui', h('span', { class: 'ui-tile' }, h('b', null, 'Canberra')), h('span', { class: 'ui-input' }, 'Australia', h('em', null, '✓')));
    case 'mapname': return A('shape gold', shapeSvg('bo', 'art-shape'), h('span', { class: 'art-chip' }, 'Name it'));
    case 'borders': return A('shape', shapeSvg('es', 'art-shape'), h('span', { class: 'art-chips' }, h('i', { class: 'ok' }, 'France'), h('i', null, '?'), h('i', null, '?')));
    case 'flagmap': return A('flagpin', artFlag('ca'), h('span', { class: 'art-pin' }, '📍'));
    case 'duel': return A('vs', h('span', { class: 'ui-pick ok' }, artFlag('eg'), h('small', null, 'Egypt')), h('b', null, '⚖️'), h('span', { class: 'ui-pick' }, artFlag('ng'), h('small', null, 'Nigeria')));
    case 'lang': return A('quote', h('b', null, '"Alle Menschen sind frei…"'), h('span', { class: 'ui-opts' }, h('i', { class: 'ok' }, 'German'), h('i', null, 'Dutch'), h('i', null, 'Danish'), h('i', null, 'Swedish')));
    case 'chain': return A('chain', artFlag('fr'), h('i', { class: 'ok' }, 'Germany'), artFlag('pl'));
    case 'all': return A('list', ...['France', 'Spain', 'Italy', 'Peru', '?', '?'].map((n) => h('i', { class: n === '?' ? '' : 'ok' }, n)));
    case 'hot': return A('globe', h('span', { class: 'art-ball' }, h('i', { style: { left: '30%', top: '35%', background: '#b30000' } }), h('i', { style: { left: '55%', top: '55%', background: '#fc8d59' } }), h('i', { style: { left: '42%', top: '68%', background: '#fdd49e' } })));
    case 'closer': return A('closer', artFlag('jp'), h('small', null, 'closer?'), h('span', { class: 'art-two' }, artFlag('ph'), artFlag('th')));
    case 'clues': return A('clues', h('i', null, '📐 About 88,000 km²'), h('i', null, '🏖️ Landlocked'), h('i', { class: 'dim' }, '🗣️ ?'));
    case 'letter': return A('letter', h('b', null, 'S'), h('span', { class: 'art-chips' }, h('i', { class: 'ok' }, 'Spain'), h('i', { class: 'ok' }, 'Sudan'), h('i', null, '?')));
    case 'scramble': return A('ui', h('span', { class: 'art-scramble' }, ...'NDEWES'.split('').map((c) => h('i', null, c))), h('span', { class: 'ui-input' }, 'Sweden', h('em', null, '✓')));
    case 'flagpick': return A('flagpick', h('span', { class: 'art-chip top' }, 'Find: Ireland'), h('span', { class: 'art-grid six' }, ...['ci', 'ie', 'it', 'mx', 'in', 'ne'].map((id) => { const im = artFlag(id); if (id === 'ie') im.classList.add('hit'); return im; })));
    default: return A('text', h('b', null, gameOf(g).em));
  }
}
function gameBrowser(st, done) {
  let tab = st.browseTab || 'all', open = null;
  const sheet = h('div', { class: 'gb-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Games' });
  const bg = h('div', { class: 'gb-bg', onclick: (e) => { if (e.target === bg) close(); } }, sheet);
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); if (open) { open = null; draw(); } else close(); } };
  function close() { document.removeEventListener('keydown', onKey, true); bg.remove(); st.browseTab = tab; done(); }
  const toggle = (g) => {
    if (st.games.includes(g)) st.games = st.games.filter((x) => x !== g); else st.games.push(g);
    draw();
  };
  const addBtn = (g, big) => { const on = st.games.includes(g); return h('button', { class: 'gb-add' + (on ? ' on' : '') + (big ? ' big' : ''), 'aria-label': (on ? 'Remove ' : 'Add ') + gameOf(g).label, onclick: (e) => { e.stopPropagation(); toggle(g); } }, on ? (big ? '✓ In your run' : '✓') : (big ? '＋ Add to run' : '＋')); };
  function draw() {
    const head = h('div', { class: 'gb-head' },
      open ? h('button', { class: 'iconbtn', 'aria-label': 'Back', onclick: () => { open = null; draw(); } }, '←') : h('span', { class: 'iconspace' }),
      h('b', null, open ? gameOf(open).label : 'Games' + (st.games.length ? ' · ' + st.games.length + ' picked' : '')),
      // In a game's details, ✕ goes back to all the games (owner); on the list it closes the browser.
      h('button', { class: 'iconbtn', 'aria-label': open ? 'Back to all games' : 'Done', onclick: () => { if (open) { open = null; draw(); } else close(); } }, '✕'));
    if (open) {
      const info = GAME_INFO[open] || [gameOf(open).desc, ''];
      sheet.replaceChildren(head, h('div', { class: 'gb-detail' }, h('div', { class: 'gb-art big' }, gameArt(open)),
        h('div', { class: 'gb-title' }, h('b', null, gameOf(open).em + ' ' + gameOf(open).label), addBtn(open, true)),
        h('p', null, info[0]), info[1] ? h('p', { class: 'gb-example' }, h('small', null, 'Example'), h('span', null, info[1])) : null));
      return;
    }
    const tabs = [{ id: 'all', label: 'All', games: GAMES.filter((x) => !x.retired).map((x) => x.id) }].concat(GAME_CATS);
    const cur = tabs.find((t) => t.id === tab) || tabs[0];
    sheet.replaceChildren(head,
      h('div', { class: 'cat-tabs' }, tabs.map((t) => h('button', { class: 'cat-tab', 'data-cat': t.id, 'aria-selected': String(t.id === cur.id), onclick: () => { tab = t.id; draw(); } }, t.label))),
      h('div', { class: 'gb-grid' }, cur.games.map((g) => h('div', { class: 'gb-card' + (st.games.includes(g) ? ' on' : ''), 'data-game': g, role: 'button', tabindex: '0', onclick: () => { open = g; draw(); sheet.scrollTop = 0; }, onkeydown: (e) => { if (e.key === 'Enter') { open = g; draw(); } } },
        h('div', { class: 'gb-art' }, gameArt(g)),
        h('div', { class: 'gb-foot' }, h('b', null, gameOf(g).label), addBtn(g))))));
  }
  draw();
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(bg);
  // Real map and globe pictures: fetch them, then redraw (cards show simple pictures until then).
  Promise.all([loadMap().catch(() => null), needGlobe().catch(() => null)]).then(() => { if (bg.isConnected) { const y = sheet.scrollTop; draw(); sheet.scrollTop = y; } });
}
