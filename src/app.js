/* Geography Speedrun — timed flags, country shapes and capitals runs.
   Plain JavaScript, no libraries. The pure parts (answer matching, challenge codes, run building) are in
   window.GS so tests can check them. Country data: src/data.js (built by tools/data.js). */
(function () {
  'use strict';
  const DATA = window.GS_DATA.countries;
  const BY_ID = Object.fromEntries(DATA.map((c) => [c.id, c]));

  /* ---------------- settings & constants ---------------- */
  const MODES = [
    { id: 'flags', label: 'Flags', em: '🏳️', ask: 'Which country?' },
    { id: 'shapes', label: 'Shapes', em: '🗺️', ask: 'Which country?' },
    { id: 'capitals', label: 'Capitals', em: '🏛️', ask: 'Capital of' },
    { id: 'mix', label: 'Mix', em: '🔀', ask: '' },
  ];
  const REGIONS = [
    { id: 'world', label: 'World' }, { id: 'Africa', label: 'Africa' }, { id: 'Asia', label: 'Asia' }, { id: 'Europe', label: 'Europe' },
    { id: 'North America', label: 'North & Central America', short: 'N. America' }, { id: 'South America', label: 'South America', short: 'S. America' }, { id: 'Oceania', label: 'Oceania' },
  ];
  const STYLES = [{ id: 'type', label: 'Type it', em: '⌨️' }, { id: 'pick', label: 'Pick from 4', em: '👆' }];
  const SKIP_MS = 10000, WRONG_MS = 5000;
  const KINDS = ['flag', 'shape', 'capital'];

  /* ---------------- answer matching ---------------- */
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/&/g, ' and ').replace(/\bsaint\b/g, 'st').replace(/\bste?\.?(?=\s)/g, 'st')
      .replace(/^\s*the\s+/, '').replace(/[^a-z]/g, '');
  }
  // Every accepted spelling, normalised. "City" at the end / "City of" at the start is optional.
  function acceptSet(list) {
    const set = new Set();
    list.forEach((x) => { const n = norm(x); if (!n) return; set.add(n); const t = n.replace(/^cityof/, '').replace(/city$/, ''); if (t.length > 2) set.add(t); });
    return set;
  }
  const accCache = {};
  function answersFor(id, kind) {
    const k = id + ':' + kind;
    if (!accCache[k]) { const c = BY_ID[id]; accCache[k] = kind === 'capital' ? acceptSet([c.capital, ...c.capitals]) : acceptSet([c.name, ...c.names]); }
    return accCache[k];
  }
  function isRight(id, kind, typed) {
    const n = norm(typed); if (!n) return false;
    const set = answersFor(id, kind);
    return set.has(n) || set.has(n.replace(/^cityof/, '').replace(/city$/, ''));
  }
  const answerText = (id, kind) => kind === 'capital' ? BY_ID[id].capital : BY_ID[id].name;

  /* ---------------- seeded random ---------------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const pool = (region) => DATA.filter((c) => region === 'world' || c.region === region).map((c) => c.id).sort();

  // The questions for a config. The same config + seed always gives the same run (that's what makes challenges fair).
  function makeRun(cfg) {
    const r = rng(cfg.seed);
    const ids = shuffle(pool(cfg.region), r).slice(0, cfg.count);
    return ids.map((id) => {
      const kind = cfg.mode === 'mix' ? KINDS[Math.floor(r() * 3)] : cfg.mode === 'flags' ? 'flag' : cfg.mode === 'shapes' ? 'shape' : 'capital';
      const q = { id, kind };
      if (cfg.style === 'pick') {
        // 3 wrong options from the same region when possible (harder than random ones).
        const c = BY_ID[id];
        let same = DATA.filter((x) => x.id !== id && x.region === c.region).map((x) => x.id).sort();
        if (same.length < 3) same = DATA.filter((x) => x.id !== id).map((x) => x.id).sort();
        q.opts = shuffle([id, ...shuffle(same, r).slice(0, 3)], r);
      }
      return q;
    });
  }

  /* ---------------- challenge codes ---------------- */
  // 40 bits → 8 characters (Crockford base 32): mode 2 · region 3 · style 1 · count 8 · seed 22 · check 4.
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const SEED_MAX = 1 << 22;
  // 4 check bits from a hash of everything else, so most typos give an invalid code instead of a different run.
  function checkOf(m, g, s, count, seed) {
    let x = Math.imul(seed ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul((((m * 8 + g) * 2 + s) * 256 + count) + 1, 0x85EBCA6B);
    x ^= x >>> 15; x = Math.imul(x, 0xC2B2AE35); x ^= x >>> 13;
    return (x >>> 0) % 16;
  }
  const scramble = (seed) => (Math.imul(seed + 7, 0x2C1B3C6D) >>> 9) & 0x3FFF;
  function encodeCode(cfg) {
    const m = MODES.findIndex((x) => x.id === cfg.mode), g = REGIONS.findIndex((x) => x.id === cfg.region), s = STYLES.findIndex((x) => x.id === cfg.style);
    // The settings bits are scrambled with the seed so codes don't all start the same way.
    let v = (((m * 8 + g) * 2 + s) * 256 + cfg.count) ^ scramble(cfg.seed % SEED_MAX);
    v = v * SEED_MAX + (cfg.seed % SEED_MAX);
    const check = checkOf(m, g, s, cfg.count, cfg.seed % SEED_MAX);
    v = v * 16 + check;
    let out = '';
    for (let i = 0; i < 8; i++) { out = B32[v % 32] + out; v = Math.floor(v / 32); }
    return out.slice(0, 4) + '-' + out.slice(4);
  }
  function decodeCode(text) {
    const t = String(text || '').toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0').replace(/[^0-9A-Z]/g, '');
    if (t.length !== 8) return null;
    let v = 0;
    for (const ch of t) { const i = B32.indexOf(ch); if (i < 0) return null; v = v * 32 + i; }
    const check = v % 16; v = Math.floor(v / 16);
    const seed = v % SEED_MAX; v = Math.floor(v / SEED_MAX) ^ scramble(seed);
    const count = v % 256; v = Math.floor(v / 256);
    const s = v % 2; v = Math.floor(v / 2);
    const g = v % 8; const m = Math.floor(v / 8);
    if (!MODES[m] || !REGIONS[g] || !STYLES[s]) return null;
    if (checkOf(m, g, s, count, seed) !== check) return null;
    const cfg = { mode: MODES[m].id, region: REGIONS[g].id, style: STYLES[s].id, count, seed };
    if (count < 1 || count > pool(cfg.region).length) return null;
    return cfg;
  }

  /* ---------------- helpers ---------------- */
  function fmtTime(ms) {
    ms = Math.max(0, Math.round(ms / 100) * 100);
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), t = Math.floor((ms % 1000) / 100);
    return (m ? m + ':' + String(s).padStart(2, '0') : String(s)) + '.' + t;
  }
  const fmtDiff = (ms) => (Math.round(Math.abs(ms) / 100) / 10).toFixed(1) + 's';
  const modeOf = (id) => MODES.find((x) => x.id === id);
  const regionOf = (id) => REGIONS.find((x) => x.id === id);
  const styleOf = (id) => STYLES.find((x) => x.id === id);
  const cfgLabel = (cfg) => [modeOf(cfg.mode).label, regionOf(cfg.region).short || regionOf(cfg.region).label, cfg.count === pool(cfg.region).length ? 'All ' + cfg.count : String(cfg.count), styleOf(cfg.style).label].join(' · ');
  const bestKey = (cfg) => [cfg.mode, cfg.region, cfg.count, cfg.style].join('|');
  const newSeed = () => Math.floor(Math.random() * SEED_MAX);

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: fine */ } },
  };

  window.GS = { norm, isRight, answersFor, makeRun, encodeCode, decodeCode, fmtTime, pool, rng, DATA };
  if (window.GS_NO_UI) return;

  /* ---------------- tiny DOM helper ---------------- */
  function h(tag, props, ...kids) {
    const el = document.createElementNS(tag === 'svg' || tag === 'path' ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml', tag);
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
  function mount(...nodes) { root.replaceChildren(...nodes.filter(Boolean)); window.scrollTo(0, 0); }
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

  /* ---------------- app state ---------------- */
  const S = {
    setup: Object.assign({ mode: 'flags', region: 'world', count: 25, style: 'type', group: false }, store.get('gs_setup_v1', {})),
    myName: store.get('gs_name_v1', ''),
    players: store.get('gs_players_v1', []),
    challenge: null, // { cfg, name, time, correct } from a link
    session: null,   // { cfg, players: [names], idx, scores: [], challenge }
  };

  // A challenge link: ?c=CODE&n=Name&t=ms&s=correct
  (function readLink() {
    const q = new URLSearchParams(location.search);
    if (!q.get('c')) return;
    const cfg = decodeCode(q.get('c'));
    if (cfg) {
      const t = parseInt(q.get('t'), 10), s = parseInt(q.get('s'), 10);
      S.challenge = { cfg, name: (q.get('n') || 'Your friend').slice(0, 24), time: Number.isFinite(t) && t > 0 ? t : null, correct: Number.isFinite(s) ? s : null };
    }
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  })();

  /* ---------------- screens ---------------- */
  function home() {
    const c = S.challenge;
    mount(h('div', { class: 'app' },
      h('header', { class: 'hero' },
        h('span', { class: 'tag' }, '● Game night'),
        h('h1', { class: 'display logo' }, 'Geography', h('span', null, 'Speedrun')),
        h('p', null, 'Flags, country shapes and capitals against the clock. Then send a friend the exact same run.')),
      c ? h('div', { class: 'card sky' },
        h('p', { class: 'eyebrow' }, 'Challenge from ' + c.name),
        h('div', { class: 'display', style: { fontSize: '30px' } }, c.time ? fmtTime(c.time) : 'Same run'),
        h('p', { class: 'muted' }, cfgLabel(c.cfg) + (c.correct != null ? ' · ' + c.correct + '/' + c.cfg.count + ' right' : '')),
        nameField(),
        h('div', { class: 'row' },
          h('button', { class: 'btn ghost small', onclick: () => { S.challenge = null; home(); } }, 'Not now'),
          h('button', { class: 'btn primary small', onclick: () => { startSession(c.cfg, [S.myName || 'You'], c); } }, 'Take it on'))) : null,
      h('div', { class: 'stack' },
        h('button', { class: 'btn primary', onclick: setup }, '▶ New run'),
        h('button', { class: 'btn ghost', onclick: codeEntry }, '🔑 Enter a challenge code'),
        h('button', { class: 'btn ghost', onclick: bests }, '⏱ Best times')),
      h('div', { class: 'foot' }, h('a', { href: '../' }, '← Game Night'), ' · ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); credits(); } }, 'Credits'), ' · 197 countries'),
    ));
  }

  function nameField() {
    return h('label', { class: 'field' }, h('span', { class: 'eyebrow' }, 'Your name (shown to your friend)'),
      h('input', { class: 'input', value: S.myName, maxlength: 24, placeholder: 'Name', autocomplete: 'nickname', oninput: (e) => { S.myName = e.target.value.trim(); store.set('gs_name_v1', S.myName); } }));
  }

  function setup() {
    const st = S.setup;
    const n = pool(st.region).length;
    const counts = (st.region === 'world' ? [10, 25, 50] : [10, 20]).filter((x) => x < n).concat([n]);
    if (!counts.includes(st.count)) st.count = counts.includes(25) ? 25 : counts[Math.min(1, counts.length - 1)];
    const save = () => store.set('gs_setup_v1', st);
    const set = (k) => (v) => { st[k] = v; save(); setup(); };
    const regionItems = REGIONS.map((r) => ({ id: r.id, label: r.short || r.label, sub: pool(r.id).length + '' }));
    let nameInput;
    const addPlayer = () => {
      const v = (nameInput.value || '').trim().slice(0, 24); if (!v) return;
      if (S.players.length >= 8) return toast('8 players max');
      if (S.players.some((p) => p.toLowerCase() === v.toLowerCase())) return toast('That name is taken');
      S.players.push(v); store.set('gs_players_v1', S.players); setup();
      setTimeout(() => document.querySelector('#pname') && document.querySelector('#pname').focus(), 0);
    };
    mount(h('div', { class: 'app' },
      topbar('New run', home),
      h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'What to name'), seg(MODES.map((m) => ({ id: m.id, label: m.label, em: m.em })), st.mode, set('mode'), 4)),
      h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Where'), seg(regionItems.slice(0, 4), st.region, set('region'), 4), seg(regionItems.slice(4), st.region, set('region'), 3)),
      h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'How many'), seg(counts.map((c) => ({ id: c, label: c === n ? 'All ' + c : String(c) })), st.count, set('count'), counts.length)),
      h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'How to answer'), seg(STYLES, st.style, set('style'), 2),
        h('p', { class: 'small muted' }, st.style === 'type' ? 'Type the answer and it moves on by itself. Skip = +10s.' : 'Tap the right one of four. A wrong tap = +5s.')),
      h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Who is playing'),
        seg([{ id: false, label: 'Just me', em: '🙋' }, { id: true, label: 'Pass the phone', em: '👥' }], st.group, set('group'), 2),
        st.group ? [
          h('p', { class: 'small muted' }, 'Everyone plays the same run, one after another. Fastest time wins.'),
          h('div', { class: 'chips' }, S.players.map((p, i) => h('span', { class: 'chip' }, p, h('button', { 'aria-label': 'Remove ' + p, onclick: () => { S.players.splice(i, 1); store.set('gs_players_v1', S.players); setup(); } }, '✕')))),
          h('div', { class: 'row' }, nameInput = h('input', { id: 'pname', class: 'input', placeholder: 'Add a player', maxlength: 24, onkeydown: (e) => { if (e.key === 'Enter') addPlayer(); } }), h('button', { class: 'btn ghost small', style: { flex: '0 0 auto', width: 'auto' }, onclick: addPlayer }, '+ Add')),
        ] : nameField()),
      h('button', {
        class: 'btn primary', disabled: st.group && S.players.length < 2,
        onclick: () => startSession({ mode: st.mode, region: st.region, count: st.count, style: st.style, seed: newSeed() }, st.group ? S.players.slice() : [S.myName || 'You'], null),
      }, st.group && S.players.length < 2 ? 'Add at least 2 players' : '▶ Start'),
    ));
  }

  function codeEntry() {
    let inp, info;
    const check = () => {
      const cfg = decodeCode(inp.value);
      info.replaceChildren(cfg ? h('p', { class: 'muted' }, '✓ ' + cfgLabel(cfg)) : h('p', { class: 'small muted' }, inp.value.replace(/[^0-9a-z]/gi, '').length >= 8 ? 'That code doesn\'t look right. Check it and try again.' : 'Codes look like ABCD-1234.'));
      btn.disabled = !cfg;
    };
    const btn = h('button', { class: 'btn primary', disabled: true, onclick: () => { const cfg = decodeCode(inp.value); if (cfg) startSession(cfg, S.setup.group && S.players.length >= 2 ? S.players.slice() : [S.myName || 'You'], null); } }, '▶ Play this run');
    mount(h('div', { class: 'app' }, topbar('Challenge code', home),
      h('div', { class: 'card' }, h('p', null, 'Got a code from a friend? Type it here to play the exact same run.'),
        inp = h('input', { class: 'input code', style: { fontSize: '28px' }, placeholder: 'ABCD-1234', maxlength: 12, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', oninput: () => check() }),
        info = h('div')),
      btn));
    check(); inp.focus();
  }

  function bests() {
    const b = store.get('gs_best_v1', {});
    const rows = Object.entries(b).sort((x, y) => x[0].localeCompare(y[0]));
    mount(h('div', { class: 'app' }, topbar('Best times', home),
      rows.length ? h('ul', { class: 'list board' }, rows.map(([k, v]) => {
        const [mode, region, count, style] = k.split('|');
        return h('li', null, h('div', { class: 'q' }, cfgLabel({ mode, region, count: +count, style }), h('small', null, v.correct + '/' + count + ' right' + (v.name ? ' · ' + v.name : ''))), h('div', { class: 't' }, fmtTime(v.time)));
      })) : h('p', { class: 'muted center' }, 'No runs yet. Your best time for each kind of run shows up here.'),
      rows.length ? h('button', { class: 'btn ghost small', onclick: () => { if (confirm('Clear all best times on this device?')) { store.set('gs_best_v1', {}); bests(); } } }, 'Clear best times') : null));
  }

  function credits() {
    const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) bg.remove(); } },
      h('div', { class: 'card modal' }, h('h2', { class: 'display' }, 'Credits'),
        h('p', { class: 'small' }, 'Flags: flag-icons (MIT licence). Country outlines: Natural Earth (public domain) via world-atlas (ISC). Names and capitals: world-countries by mledoze (ODbL 1.0). Some outlines are cropped to the main territory. Licence texts are in the licenses folder.'),
        h('p', { class: 'small muted' }, '197 countries: the 193 UN members, Vatican City and Palestine (UN observers), Kosovo and Taiwan. Where a country has more than one capital or a separate seat of government, either one counts.'),
        h('button', { class: 'btn ghost small', onclick: () => bg.remove() }, 'Close')));
    document.body.appendChild(bg);
  }

  /* ---------------- a session: one run, played by 1+ players ---------------- */
  const imgCache = {};
  function preload(questions) {
    questions.forEach((q) => { if (q.kind === 'flag' && !imgCache[q.id]) { const im = new Image(); im.decoding = 'async'; im.src = BY_ID[q.id].flag; imgCache[q.id] = im; } });
  }
  function startSession(cfg, players, challenge) {
    S.challenge = null;
    S.session = { cfg, questions: makeRun(cfg), players, idx: 0, scores: [], challenge };
    preload(S.session.questions);
    cover();
  }
  function cover() {
    const se = S.session, name = se.players[se.idx], many = se.players.length > 1;
    mount(h('div', { class: 'app' }, topbar(cfgLabel(se.cfg), () => { if (confirm('Leave this run?')) home(); }),
      h('div', { class: 'cover' },
        many ? h('p', { class: 'eyebrow' }, 'Player ' + (se.idx + 1) + ' of ' + se.players.length) : null,
        h('h2', { class: 'display', style: { fontSize: many ? '54px' : '42px' } }, many ? (se.idx ? 'Pass to ' : '') + name : 'Ready?'),
        h('p', { class: 'muted', style: { maxWidth: '32ch' } }, se.cfg.count + ' ' + (se.cfg.mode === 'capitals' ? 'capitals' : se.cfg.mode === 'mix' ? 'mixed questions' : se.cfg.mode) + '. ' +
          (se.cfg.style === 'type' ? 'Type each answer; it moves on by itself. Skip adds 10 seconds.' : 'Tap the right answer. A wrong tap adds 5 seconds.') + ' The clock starts after 3, 2, 1.'),
        se.challenge && se.challenge.time ? h('p', { class: 'badge' }, 'Time to beat: ' + fmtTime(se.challenge.time)) : null,
        h('button', { class: 'btn primary', style: { maxWidth: '320px' }, onclick: countdown }, '▶ Go')),
    ));
  }
  function countdown() {
    let n = 3; const el = h('div', { class: 'cd', 'aria-live': 'assertive' }, '3');
    mount(h('div', { class: 'app' }, h('div', { class: 'cover' }, el)));
    const tick = () => { n--; if (n > 0) { el.textContent = String(n); setTimeout(tick, 700); } else runScreen(); };
    setTimeout(tick, 700);
  }

  function runScreen() {
    const se = S.session, cfg = se.cfg, Q = se.questions;
    const R = { i: 0, start: performance.now(), paused: 0, pauseAt: null, pen: 0, res: [], busy: false, over: false };
    const now = () => performance.now();
    const elapsed = () => (R.pauseAt != null ? R.pauseAt : now()) - R.start - R.paused;
    const pause = () => { if (R.pauseAt == null) R.pauseAt = now(); };
    const resume = () => { if (R.pauseAt != null) { R.paused += now() - R.pauseAt; R.pauseAt = null; } };

    const timerEl = h('div', { class: 'timer num' }, '0.0');
    const countEl = h('div', { class: 'count num' });
    const penEl = h('div', { class: 'pen num' });
    const barEl = h('i');
    const stage = h('div', { class: 'stage' });
    const reveal = h('div', { class: 'reveal', 'aria-live': 'polite' });
    let input, choicesEl, skipBtn;
    const answerArea = h('div');
    if (cfg.style === 'type') {
      input = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Your answer' });
      skipBtn = h('button', { class: 'btn ghost skip' }, 'Skip +10s');
      answerArea.append(h('div', { class: 'answer' }, input, skipBtn), h('p', { class: 'hint' }, 'Spelling counts, but accents, capitals and dashes don\'t.'));
      input.addEventListener('input', () => { if (!R.busy && isRight(Q[R.i].id, Q[R.i].kind, input.value)) done(true, 'typed'); });
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return; e.preventDefault();
        if (R.busy) return;
        if (isRight(Q[R.i].id, Q[R.i].kind, input.value)) return done(true, 'typed');
        input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
      });
      skipBtn.addEventListener('click', () => { if (!R.busy) { done(false, 'skip'); input.focus(); } });
    } else {
      choicesEl = h('div', { class: 'choices' });
      answerArea.append(choicesEl, h('p', { class: 'hint' }, 'On a keyboard: 1 2 3 4'));
    }
    const quit = h('button', { class: 'iconbtn', 'aria-label': 'Stop the run', onclick: () => { if (confirm('Stop this run? It won\'t count.')) { R.over = true; home(); } } }, '✕');
    mount(h('div', { class: 'app run' },
      h('div', { class: 'hud' }, quit, countEl, timerEl, penEl),
      h('div', { class: 'bar' }, barEl),
      stage, reveal, answerArea));

    function show() {
      const q = Q[R.i], c = BY_ID[q.id];
      countEl.replaceChildren(String(R.i + 1) + '/' + Q.length, h('small', null, 'DONE ' + R.res.filter((x) => x.ok).length));
      penEl.replaceChildren(R.pen ? '+' + R.pen / 1000 + 's' : '+0s', h('small', null, 'PENALTY'));
      barEl.style.width = (R.i / Q.length * 100) + '%';
      stage.className = 'stage';
      reveal.textContent = '';
      const kindChip = cfg.mode === 'mix' ? h('span', { class: 'eyebrow kind' }, q.kind === 'flag' ? '🏳️ Flag' : q.kind === 'shape' ? '🗺️ Shape' : '🏛️ Capital') : null;
      if (q.kind === 'flag') {
        const im = imgCache[q.id] && imgCache[q.id].complete ? imgCache[q.id].cloneNode() : h('img', { src: c.flag });
        im.className = 'flag'; im.alt = 'A flag'; im.width = 640; im.height = 480;
        stage.replaceChildren(...[kindChip, im].filter(Boolean));
      } else if (q.kind === 'shape') {
        stage.replaceChildren(...[kindChip, h('span', { class: 'reg' }, regionOf(c.region).short || c.region), shapeSvg(q.id, 'shape')].filter(Boolean));
      } else {
        stage.replaceChildren(...[kindChip, h('div', { class: 'ask' }, 'Capital of'), h('div', { class: 'big' }, c.name)].filter(Boolean));
      }
      if (input) {
        input.value = '';
        input.placeholder = q.kind === 'capital' ? 'Type the capital…' : 'Type the country…';
        input.focus({ preventScroll: true });
      } else {
        choicesEl.replaceChildren(...q.opts.map((id, k) => h('button', { class: 'choice', 'data-id': id, onclick: () => pick(id) }, answerText(id, q.kind))));
      }
    }
    function pick(id) {
      if (R.busy) return;
      const q = Q[R.i];
      const btn = choicesEl.querySelector('[data-id="' + id + '"]');
      if (id === q.id) { btn.classList.add('right'); done(true, 'pick'); }
      else { btn.classList.add('wrong'); choicesEl.querySelector('[data-id="' + q.id + '"]').classList.add('right'); done(false, 'wrong'); }
    }
    function done(ok, how) {
      R.busy = true; pause();
      const q = Q[R.i];
      if (!ok) { R.pen += how === 'skip' ? SKIP_MS : WRONG_MS; try { navigator.vibrate && navigator.vibrate(60); } catch (e) { /* no vibration */ } }
      R.res.push({ id: q.id, kind: q.kind, ok, how, typed: input && !ok ? input.value : undefined });
      stage.classList.add(ok ? 'ok' : 'bad');
      if (!ok) reveal.textContent = '→ ' + answerText(q.id, q.kind);
      // The clock is stopped while the answer is on screen, so the pause costs nobody anything.
      setTimeout(() => {
        R.i++; R.busy = false;
        if (R.i >= Q.length) return finish();
        resume(); show();
      }, ok ? 180 : 1000);
    }
    function finish() {
      R.over = true;
      const raw = elapsed();
      const score = { name: se.players[se.idx], raw, pen: R.pen, time: Math.round(raw + R.pen), correct: R.res.filter((x) => x.ok).length, total: Q.length, res: R.res };
      se.scores.push(score);
      const k = bestKey(cfg), b = store.get('gs_best_v1', {});
      score.best = !b[k] || score.time < b[k].time;
      if (score.best) { b[k] = { time: score.time, correct: score.correct, name: score.name, at: Date.now() }; store.set('gs_best_v1', b); }
      result(score);
    }
    function loop() {
      if (R.over) return;
      timerEl.textContent = fmtTime(elapsed() + R.pen);
      timerEl.classList.toggle('paused', R.pauseAt != null);
      requestAnimationFrame(loop);
    }
    if (choicesEl) {
      const onKey = (e) => { if (R.over) return document.removeEventListener('keydown', onKey); const k = parseInt(e.key, 10); if (k >= 1 && k <= 4) { const q = Q[R.i]; if (q && q.opts[k - 1]) pick(q.opts[k - 1]); } };
      document.addEventListener('keydown', onKey);
    }
    show(); loop();
  }

  /* ---------------- results ---------------- */
  function shareUrl(cfg, score) {
    const p = new URLSearchParams({ c: encodeCode(cfg).replace('-', ''), n: score.name, t: String(score.time), s: String(score.correct) });
    return location.origin + location.pathname + '?' + p.toString();
  }
  async function share(cfg, score) {
    const url = shareUrl(cfg, score);
    const text = score.name + ' ran Geography Speedrun (' + cfgLabel(cfg) + ') in ' + fmtTime(score.time) + ' with ' + score.correct + '/' + score.total + ' right. Beat it! Code: ' + encodeCode(cfg);
    if (navigator.share) { try { await navigator.share({ title: 'Geography Speedrun challenge', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text + '\n' + url); toast('Challenge link copied'); }
    catch (e) { prompt('Copy this link and send it:', url); }
  }
  function missedList(score) {
    const miss = score.res.filter((x) => !x.ok);
    if (!miss.length) return h('p', { class: 'center' }, h('span', { class: 'badge' }, 'Perfect run! 🎯'));
    return [h('p', { class: 'eyebrow' }, 'Missed (' + miss.length + ')'), h('ul', { class: 'list' }, miss.map((x) => {
      const c = BY_ID[x.id];
      const pic = x.kind === 'flag' ? h('img', { class: 'mini', src: c.flag, alt: '' }) : x.kind === 'shape' ? shapeSvg(x.id, 'mini') : h('span', { class: 'mini', style: { background: 'none', fontSize: '24px', textAlign: 'center' } }, '🏛️');
      return h('li', null, pic, h('div', { class: 'q' }, answerText(x.id, x.kind), h('small', null, x.kind === 'capital' ? 'Capital of ' + c.name : x.kind === 'flag' ? 'Flag' : 'Outline')), h('span', { class: 'x' }, x.how === 'skip' ? 'SKIP +10s' : 'WRONG +5s'));
    }))];
  }
  function result(score) {
    const se = S.session, many = se.players.length > 1, last = se.idx >= se.players.length - 1;
    const ch = se.challenge;
    let vs = null;
    if (ch && ch.time) {
      const d = score.time - ch.time;
      vs = h('p', { class: 'versus ' + (d < 0 ? 'win' : d > 0 ? 'lose' : '') }, d < 0 ? 'You beat ' + ch.name + ' by ' + fmtDiff(d) + '! 🏆' : d > 0 ? ch.name + ' wins by ' + fmtDiff(d) + '.' : 'Dead heat with ' + ch.name + '!');
    }
    mount(h('div', { class: 'app' },
      topbar(cfgLabel(se.cfg), null),
      h('div', { class: 'center stack', style: { gap: '6px' } },
        many ? h('p', { class: 'eyebrow' }, score.name) : null,
        h('div', { class: 'result-time' }, fmtTime(score.time)),
        score.best ? h('div', null, h('span', { class: 'badge' }, '★ New best on this device')) : null),
      vs,
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('b', null, score.correct + '/' + score.total), h('span', null, 'Right')),
        h('div', { class: 'stat' }, h('b', null, fmtTime(score.raw)), h('span', null, 'Clock')),
        h('div', { class: 'stat' }, h('b', null, '+' + score.pen / 1000 + 's'), h('span', null, 'Penalty'))),
      many && !last ? h('button', { class: 'btn primary', onclick: () => { se.idx++; cover(); } }, 'Next: ' + se.players[se.idx + 1] + ' →') : null,
      many && last ? h('button', { class: 'btn primary', onclick: board }, '🏁 See who won') : null,
      !many ? h('div', { class: 'card sky' },
        h('p', { class: 'eyebrow' }, 'Challenge a friend'),
        h('p', { class: 'small' }, 'They get the exact same questions in the same order, and see your time to beat.'),
        h('div', { class: 'code num' }, encodeCode(se.cfg)),
        !S.myName && score.name === 'You' ? nameField() : null,
        h('button', { class: 'btn primary small', onclick: () => { if (score.name === 'You' && S.myName) score.name = S.myName; share(se.cfg, score); } }, '📤 Send challenge')) : null,
      h('div', { class: 'stack' }, missedList(score)),
      !many ? afterButtons() : null,
    ));
  }
  function afterButtons() {
    const se = S.session;
    return h('div', { class: 'stack' },
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost small', onclick: () => startSession(se.cfg, se.players, se.challenge) }, '↻ Same run'),
        h('button', { class: 'btn ghost small', onclick: () => startSession(Object.assign({}, se.cfg, { seed: newSeed() }), se.players, null) }, '🎲 New run')),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost small', onclick: setup }, '⚙ Change'),
        h('button', { class: 'btn ghost small', onclick: home }, '⌂ Home')));
  }
  function board() {
    const se = S.session;
    const ranked = se.scores.slice().sort((a, b) => a.time - b.time);
    const resultText = 'Geography Speedrun (' + cfgLabel(se.cfg) + ')\n' + ranked.map((s, i) => (i + 1) + '. ' + s.name + ' ' + fmtTime(s.time) + ' (' + s.correct + '/' + s.total + ')').join('\n') + '\nCode: ' + encodeCode(se.cfg);
    mount(h('div', { class: 'app' },
      topbar('Results', null),
      h('div', { class: 'center' }, h('p', { class: 'eyebrow' }, 'Winner'), h('h2', { class: 'display', style: { fontSize: '56px', color: 'var(--gold)' } }, ranked[0].name)),
      h('ul', { class: 'list board' }, ranked.map((s, i) => h('li', { class: i === 0 ? 'first' : null },
        h('span', { class: 'rank' }, String(i + 1)), h('div', { class: 'q' }, s.name, h('small', null, s.correct + '/' + s.total + ' right · +' + s.pen / 1000 + 's penalty')),
        h('div', { class: 't' }, fmtTime(s.time), i ? h('small', null, '+' + fmtDiff(s.time - ranked[0].time)) : null)))),
      h('button', { class: 'btn ghost small', onclick: async () => { try { await navigator.clipboard.writeText(resultText); toast('Results copied'); } catch (e) { prompt('Copy the results:', resultText); } } }, '📋 Copy results'),
      afterButtons()));
  }

  /* ---------------- start ---------------- */
  home();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
