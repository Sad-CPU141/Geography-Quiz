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
  liveStop();
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

function setup() {
  const st = S.setup;
  const save = () => store.set('gs_setup_v2', st);
  const set = (k) => (v) => { st[k] = v; save(); setup(); };
  const regionItems = REGIONS.map((r) => ({ id: r.id, label: r.short || r.label, sub: pool(r.id).length + '' }));
  const n = pool(st.region).length;
  let nameInput;
  const addPlayer = () => {
    const v = (nameInput.value || '').trim().slice(0, 24); if (!v) return;
    if (S.players.length >= 8) return toast('8 players max');
    if (S.players.some((p) => p.toLowerCase() === v.toLowerCase())) return toast('That name is taken');
    S.players.push(v); store.set('gs_players_v1', S.players); setup();
    setTimeout(() => document.querySelector('#pname') && document.querySelector('#pname').focus(), 0);
  };

  // Board: which games, in which order.
  function gamesCard() {
    const move = (g, d) => { const i = st.games.indexOf(g), j = i + d; if (j < 0 || j >= st.games.length) return; [st.games[i], st.games[j]] = [st.games[j], st.games[i]]; save(); setup(); };
    const toggle = (g) => { if (st.games.includes(g)) { if (st.games.length === 1) return toast('Pick at least one game'); st.games = st.games.filter((x) => x !== g); } else st.games.push(g); save(); setup(); };
    const row = (g) => {
      const on = st.games.includes(g), i = st.games.indexOf(g), G = gameOf(g);
      return h('div', { class: 'game-row' + (on ? ' on' : ''), 'data-game': g },
        h('button', { class: 'game-pick', 'data-game': g, 'aria-pressed': String(on), onclick: () => toggle(g) },
          h('span', { class: 'game-num' }, on ? String(i + 1) : '+'),
          h('span', { class: 'game-txt' }, h('b', null, G.em + ' ' + G.label), h('small', null, G.desc))),
        on && st.games.length > 1 ? h('span', { class: 'game-move' },
          h('button', { class: 'iconbtn sm', 'aria-label': 'Move ' + G.label + ' up', disabled: i === 0, onclick: () => move(g, -1) }, '↑'),
          h('button', { class: 'iconbtn sm', 'aria-label': 'Move ' + G.label + ' down', disabled: i === st.games.length - 1, onclick: () => move(g, 1) }, '↓')) : null);
    };
    // The 4 main games, then the others in a fold-out so the list stays short.
    const main = GAMES.filter((g) => !g.more).map((g) => g.id), more = GAMES.filter((g) => g.more).map((g) => g.id);
    const moreOn = more.filter((g) => st.games.includes(g)).length;
    const open = st.showMore != null ? st.showMore : moreOn > 0;
    return h('div', { class: 'card' },
      h('p', { class: 'eyebrow' }, 'Games'),
      h('div', { class: 'games' }, main.map(row)),
      h('button', { class: 'more-toggle', 'aria-expanded': String(open), onclick: () => { st.showMore = !open; save(); setup(); } },
        h('span', null, (open ? '▾ ' : '▸ ') + 'More games'), h('small', null, more.length + ' more' + (moreOn ? ' · ' + moreOn + ' picked' : ''))),
      open ? h('div', { class: 'games' }, more.map(row)) : null,
      st.games.length > 1 ? h('p', { class: 'small muted' }, st.games.map((g) => gameOf(g).label).join(' → ')) : null);
  }
  function quickCards() {
    const counts = (st.region === 'world' ? [10, 25, 50] : [10, 20]).filter((x) => x < n).concat([n]);
    if (!counts.includes(st.count)) st.count = counts.includes(25) ? 25 : counts[Math.min(1, counts.length - 1)];
    return [
      h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'What to name'), seg(MODES, st.mode, set('mode'), 4)),
      h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'How many'), seg(counts.map((c) => ({ id: c, label: c === n ? 'All ' + c : String(c) })), st.count, set('count'), counts.length)),
      h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'How to answer'), seg(STYLES, st.style, set('style'), 2),
        h('p', { class: 'small muted' }, st.style === 'type' ? 'Skip +10s' : 'Wrong +5s')),
    ];
  }
  const cfgNow = () => st.kind === 'board'
    ? withOpts({ kind: 'board', games: st.games.slice(), region: st.region, seed: newSeed() }, st)
    : { kind: 'quick', mode: st.mode, region: st.region, count: st.count, style: st.style, seed: newSeed() };
  mount(h('div', { class: 'app', 'data-screen': 'setup' },
    topbar('New run', home),
    h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Style'),
      seg([{ id: 'board', label: 'Full board', em: '🧩', sub: 'All at once' }, { id: 'quick', label: 'Quick fire', em: '⚡', sub: 'One at a time' }], st.kind, set('kind'), 2)),
    st.kind === 'board' ? gamesCard() : null,
    h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Where'), seg(regionItems.slice(0, 4), st.region, set('region'), 4), seg(regionItems.slice(4), st.region, set('region'), 3)),
    st.kind === 'quick' ? quickCards() : null,
    h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Options'),
      st.kind === 'board' || st.style === 'type' ? optRow('💡 Spelling help', !!st.help, set('help')) : null,
      st.kind === 'board' ? optRow('🧘 Practice (no clock)', !!st.practice, set('practice')) : null,
      st.kind === 'board' && st.games.some((g) => MAP_GAMES.has(g)) ? optRow('🧱 Map: no borders', !!st.hard, set('hard')) : null,
      st.kind === 'board' && st.games.includes('lang') ? optRow('⌨️ Languages: type it', !!st.langType, set('langType')) : null),
    h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Who is playing'),
      seg([{ id: false, label: 'Just me', em: '🙋' }, { id: true, label: 'Pass the phone', em: '👥' }].concat(st.kind === 'board' ? [{ id: 'live', label: 'Online', em: '🌐' }] : []), st.kind === 'quick' && st.group === 'live' ? false : st.group, set('group'), st.kind === 'board' ? 3 : 2),
      st.group === true ? [
        h('div', { class: 'chips' }, S.players.map((p, i) => h('span', { class: 'chip' }, p, h('button', { 'aria-label': 'Remove ' + p, onclick: () => { S.players.splice(i, 1); store.set('gs_players_v1', S.players); setup(); } }, '✕')))),
        h('div', { class: 'row' }, nameInput = h('input', { id: 'pname', class: 'input', placeholder: 'Add a player', maxlength: 24, onkeydown: (e) => { if (e.key === 'Enter') addPlayer(); } }), h('button', { class: 'btn ghost small', style: { flex: '0 0 auto', width: 'auto' }, onclick: addPlayer }, '+ Add')),
      ] : nameField()),
    st.group === 'live' && st.kind === 'board' ? h('button', { class: 'btn primary', onclick: () => liveCreate(cfgNow()) }, '🌐 Create room') :
    h('button', {
      class: 'btn primary', disabled: st.group === true && S.players.length < 2,
      onclick: () => startSession(cfgNow(), st.group === true ? S.players.slice() : [S.myName || 'You'], null),
    }, st.group === true && S.players.length < 2 ? 'Add at least 2 players' : '▶ Start'),
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
