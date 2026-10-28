/* Geography Speedrun 26d1ba2cb2 — built from src/js/ by build.js. Edit src/, not this file. */
(function () {
'use strict';
const APP_VERSION = "26d1ba2cb2";
/* ---- core: data, answer matching, runs, challenge codes (no DOM; tested by tests/run.js) ---- */
const DATA = window.GS_DATA.countries;
const BY_ID = Object.fromEntries(DATA.map((c) => [c.id, c]));

/* Two kinds of run:
   · board: the JetPunk / Seterra style. One or more games played back to back on one clock:
       flags / shapes / capitals = a grid of everything, pick a tile and type it; map = click the named country.
   · quick: one question at a time (type it or pick from 4), the original mode. */
const GAMES = [
  { id: 'flags', label: 'Flags', em: '🏳️', desc: 'Name every flag' },
  { id: 'map', label: 'Map', em: '🌍', desc: 'Tap the country' },
  { id: 'capitals', label: 'Capitals', em: '🏛️', desc: 'Name every capital' },
  { id: 'shapes', label: 'Shapes', em: '🗺️', desc: 'Name every outline' },
  // "More games" (shown in a fold-out in setup). Keep this order: a game's position is part of the challenge code.
  { id: 'revcap', label: 'Reverse Capitals', em: '🔁', desc: 'Capital → country', more: true },
  { id: 'mapname', label: 'Map: name it', em: '🔦', desc: 'Name the lit-up country', more: true },
  { id: 'borders', label: 'Borders', em: '🧱', desc: 'Name the neighbours', more: true },
  { id: 'flagmap', label: 'Flag → Map', em: '📍', desc: 'Flag → tap the country', more: true },
  { id: 'duel', label: 'Bigger country', em: '⚖️', desc: 'Pick the bigger one', more: true },
];
const MAP_GAMES = new Set(['map', 'mapname', 'flagmap']);
const MODES = [
  { id: 'flags', label: 'Flags', em: '🏳️' },
  { id: 'shapes', label: 'Shapes', em: '🗺️' },
  { id: 'capitals', label: 'Capitals', em: '🏛️' },
  { id: 'mix', label: 'Mix', em: '🔀' },
];
const REGIONS = [
  { id: 'world', label: 'World' }, { id: 'Africa', label: 'Africa' }, { id: 'Asia', label: 'Asia' }, { id: 'Europe', label: 'Europe' },
  { id: 'North America', label: 'North & Central America', short: 'N. America' }, { id: 'South America', label: 'South America', short: 'S. America' }, { id: 'Oceania', label: 'Oceania' },
];
const STYLES = [{ id: 'type', label: 'Type it', em: '⌨️' }, { id: 'pick', label: 'Pick from 4', em: '👆' }];
const SKIP_MS = 10000, WRONG_MS = 5000;
const KINDS = ['flag', 'shape', 'capital'];
const MAP_TRIES = 3;

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
const kindOfGame = (g) => g === 'capitals' ? 'capital' : g === 'shapes' ? 'shape' : MAP_GAMES.has(g) ? 'map' : g === 'revcap' || g === 'borders' ? 'country' : g === 'duel' ? 'duel' : 'flag';

/* ---------------- seeded random ---------------- */
function rng(seed) {
  let a = seed >>> 0;
  return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const pool = (region) => DATA.filter((c) => region === 'world' || c.region === region).map((c) => c.id).sort();
const byName = (ids) => ids.slice().sort((a, b) => BY_ID[a].name.localeCompare(BY_ID[b].name));

// Quick fire: the questions for a config. Same config + seed → same run (that's what makes challenges fair).
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
// Board: the order of the tiles / map prompts for each game. Everything is shuffled (every new run gets a new
// seed, so you can't learn the order); the same code always gives the same order, so challenges stay fair.
function makeBoard(cfg) {
  return cfg.games.map((g, i) => {
    const r = rng((cfg.seed * 31 + i * 7919 + g.length * 104729) >>> 0);
    // A practice run of your misses brings its own list of countries (cfg.custom[game]).
    const ids = cfg.custom && cfg.custom[g] ? cfg.custom[g].slice().sort() : pool(cfg.region);
    const sec = { game: g, kind: kindOfGame(g), ids: shuffle(ids, r) };
    if (g === 'borders') {
      // Countries with at least one land neighbour in the game; each neighbour is one answer ("de>fr").
      sec.countries = sec.ids.filter((id) => BY_ID[id].nb.length);
      sec.ids = sec.countries.flatMap((id) => BY_ID[id].nb.map((n) => id + '>' + n));
    } else if (g === 'duel') {
      // Up to 20 pairs; the two areas always differ by more than 10%, so every round has a clear answer.
      const left = sec.ids.slice(), pairs = [];
      while (left.length > 1 && pairs.length < 20) {
        const a = left.shift();
        const j = left.findIndex((b) => Math.abs(BY_ID[a].area - BY_ID[b].area) > 0.1 * Math.max(BY_ID[a].area, BY_ID[b].area));
        if (j < 0) continue;
        const [b] = left.splice(j, 1);
        pairs.push(r() < 0.5 ? a + '|' + b : b + '|' + a);
      }
      sec.ids = pairs;
    }
    return sec;
  });
}
// The right answer for a duel round "a|b": whichever is bigger.
const duelWinner = (key) => { const [a, b] = key.split('|'); return BY_ID[a].area > BY_ID[b].area ? a : b; };

/* ---------------- challenge codes ---------------- */
// 40 bits → 8 characters (Crockford base 32):
//   K (15 bits, scrambled with the seed) · seed 21 · check 4
//   K = kind 1 · then quick: mode 2, region 3, style 1, count 8  |  board: games 6, region 3, zeros 5
// games = index into GAME_ORDERS (every ordered choice of 1–4 games: 4 + 12 + 24 + 24 = 64).
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SEED_MAX = 1 << 21;
const GAME_ORDERS = (function () { // the original 4 games only (8-character codes)
  const ids = GAMES.slice(0, 4).map((g) => g.id), out = [];
  const go = (cur) => { if (cur.length) out.push(cur.slice()); if (cur.length === ids.length) return; ids.forEach((g) => { if (!cur.includes(g)) { cur.push(g); go(cur); cur.pop(); } }); };
  go([]);
  return out.sort((a, b) => a.length - b.length || a.join().localeCompare(b.join()));
})();
function checkOf(k, seed) {
  let x = Math.imul(seed ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(k + 1, 0x85EBCA6B);
  x ^= x >>> 15; x = Math.imul(x, 0xC2B2AE35); x ^= x >>> 13;
  return (x >>> 0) % 16;
}
const scramble = (seed) => (Math.imul(seed + 7, 0x2C1B3C6D) >>> 9) & 0x7FFF;
function cfgBits(cfg) {
  const g = REGIONS.findIndex((x) => x.id === cfg.region);
  if (cfg.kind === 'board') {
    const gi = GAME_ORDERS.findIndex((o) => o.join() === cfg.games.join());
    return (1 << 14) | (gi << 8) | (g << 5);
  }
  const m = MODES.findIndex((x) => x.id === cfg.mode), s = STYLES.findIndex((x) => x.id === cfg.style);
  return (m << 12) | (g << 9) | (s << 8) | cfg.count;
}
// Longer codes (10+ characters) for board runs that use any of the "More games" (any list of up to 9 games):
//   n−1 (4 bits) · games (4 bits each, index in GAMES) · region 3 · seed 21 · check 6
// The games + region bits are scrambled with the seed; n is not (the decoder needs it to know the layout).
const group = (s) => s.match(/.{1,4}/g).join('-');
function scrambleBits(seed, bits) {
  const r = rng(seed ^ 0x51ed27), out = [];
  for (let i = 0; i < bits; i++) out.push(r() < 0.5 ? 0n : 1n);
  return out.reduce((v, b) => (v << 1n) | b, 0n);
}
const check6 = (p, seed) => { let x = 0x811c9dc5; for (const ch of p.toString(16) + ':' + seed) x = Math.imul(x ^ ch.charCodeAt(0), 0x01000193); return BigInt((x >>> 0) % 64); };
function encodeLong(cfg) {
  const n = cfg.games.length, seed = BigInt(cfg.seed % SEED_MAX), bits = 4 * n + 3;
  let p = 0n;
  cfg.games.forEach((g) => { p = (p << 4n) | BigInt(GAMES.findIndex((x) => x.id === g)); });
  p = (p << 3n) | BigInt(REGIONS.findIndex((x) => x.id === cfg.region));
  const top = (BigInt(n - 1) << BigInt(bits)) | (p ^ scrambleBits(cfg.seed % SEED_MAX, bits));
  let v = (top << 27n) | (seed << 6n) | check6(p, cfg.seed % SEED_MAX);
  let out = '';
  while (v > 0n) { out = B32[Number(v % 32n)] + out; v /= 32n; }
  return group(out.padStart(10, '0'));
}
function decodeLong(t) {
  let v = 0n;
  for (const ch of t) { const i = B32.indexOf(ch); if (i < 0) return null; v = v * 32n + BigInt(i); }
  const check = v & 63n, seed = Number((v >> 6n) & BigInt(SEED_MAX - 1)), top = v >> 27n;
  for (let n = 1; n <= GAMES.length; n++) {
    const bits = 4 * n + 3;
    if ((top >> BigInt(bits)) !== BigInt(n - 1)) continue;
    const p = (top & ((1n << BigInt(bits)) - 1n)) ^ scrambleBits(seed, bits);
    if (check6(p, seed) !== check) continue;
    const g = Number(p & 7n), games = [];
    for (let i = n - 1; i >= 0; i--) games.push(Number((p >> BigInt(3 + 4 * i)) & 15n));
    if (!REGIONS[g] || games.some((x) => !GAMES[x]) || new Set(games).size !== n) return null;
    return { kind: 'board', games: games.map((x) => GAMES[x].id), region: REGIONS[g].id, seed };
  }
  return null;
}
function encodeCode(cfg) {
  if (cfg.kind === 'board' && cfg.games.some((g) => GAMES.findIndex((x) => x.id === g) >= 4)) return encodeLong(cfg);
  const seed = cfg.seed % SEED_MAX, k = cfgBits(cfg);
  let v = ((k ^ scramble(seed)) * SEED_MAX + seed) * 16 + checkOf(k, seed);
  let out = '';
  for (let i = 0; i < 8; i++) { out = B32[v % 32] + out; v = Math.floor(v / 32); }
  return out.slice(0, 4) + '-' + out.slice(4);
}
function decodeCode(text) {
  const t = String(text || '').toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0').replace(/[^0-9A-Z]/g, '');
  if (t.length >= 10 && t.length <= 16) return decodeLong(t);
  if (t.length !== 8) return null;
  let v = 0;
  for (const ch of t) { const i = B32.indexOf(ch); if (i < 0) return null; v = v * 32 + i; }
  const check = v % 16; v = Math.floor(v / 16);
  const seed = v % SEED_MAX; const k = Math.floor(v / SEED_MAX) ^ scramble(seed);
  if (checkOf(k, seed) !== check) return null;
  let cfg;
  if (k >> 14) {
    const gi = (k >> 8) & 63, g = (k >> 5) & 7;
    if ((k & 31) || !GAME_ORDERS[gi] || !REGIONS[g]) return null;
    cfg = { kind: 'board', games: GAME_ORDERS[gi].slice(), region: REGIONS[g].id, seed };
  } else {
    const m = (k >> 12) & 3, g = (k >> 9) & 7, s = (k >> 8) & 1, count = k & 255;
    if (!REGIONS[g]) return null;
    cfg = { kind: 'quick', mode: MODES[m].id, region: REGIONS[g].id, style: STYLES[s].id, count, seed };
    if (count < 1 || count > pool(cfg.region).length) return null;
  }
  return cfg;
}

/* ---------------- scores ---------------- */
// Board runs: most found wins, then the faster time. Quick fire: lowest time (penalties included).
function better(a, b, kind) {
  if (kind === 'board' && a.correct !== b.correct) return a.correct > b.correct;
  return a.time < b.time;
}
const compare = (kind) => (a, b) => better(a, b, kind) ? -1 : better(b, a, kind) ? 1 : 0;

/* ---------------- helpers ---------------- */
function fmtTime(ms) {
  ms = Math.max(0, Math.round(ms / 100) * 100);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), t = Math.floor((ms % 1000) / 100);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return (h ? h + ':' : '') + (h || m ? mm + ':' + String(s).padStart(2, '0') : String(s)) + '.' + t;
}
const fmtDiff = (ms) => (Math.round(Math.abs(ms) / 100) / 10).toFixed(1) + 's';
const gameOf = (id) => GAMES.find((x) => x.id === id);
const modeOf = (id) => MODES.find((x) => x.id === id);
const regionOf = (id) => REGIONS.find((x) => x.id === id);
const styleOf = (id) => STYLES.find((x) => x.id === id);
const regionLabel = (id) => regionOf(id).short || regionOf(id).label;
function cfgTotal(cfg) { return cfg.kind === 'board' ? makeBoard(cfg).reduce((n, sec) => n + sec.ids.length, 0) : cfg.count; }
function cfgLabel(cfg) {
  if (cfg.kind === 'board') return cfg.games.map((g) => gameOf(g).label).join(' + ') + ' · ' + (cfg.custom ? 'My misses' : regionLabel(cfg.region));
  return [modeOf(cfg.mode).label, regionLabel(cfg.region), cfg.count === pool(cfg.region).length ? 'All ' + cfg.count : String(cfg.count), styleOf(cfg.style).label].join(' · ') + ' · Quick';
}
const bestKey = (cfg) => cfg.kind === 'board' ? ['b', cfg.games.join('+'), cfg.region].join('|') : [cfg.mode, cfg.region, cfg.count, cfg.style].join('|');
const newSeed = () => Math.floor(Math.random() * SEED_MAX);

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: fine */ } },
};

/* ---------------- spelling help ---------------- */
// Optimal string alignment distance (Levenshtein + swapped neighbours), stopping early past `max`.
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v); if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}
// All spellings to compare against, for countries or capitals: [normalised spelling, id].
const spellCache = {};
function spellings(kind) {
  const k = kind === 'capital' ? 'capital' : 'country';
  if (!spellCache[k]) {
    spellCache[k] = [];
    DATA.forEach((c) => (k === 'capital' ? [c.capital, ...c.capitals] : [c.name, ...c.names]).forEach((x) => { const n = norm(x); if (n.length >= 3) spellCache[k].push([n, c.id]); }));
  }
  return spellCache[k];
}
// "Did you mean …?" — the closest country (or capital) to what was typed, if it's close enough. Compares against
// every country in the world, not just the right answer, so the hint never gives the answer away.
// Returns up to 2 equally close suggestions, nearest in length first: [{ id, text }], or [] when nothing is close.
function suggest(typed, kind) {
  const n = norm(typed);
  if (n.length < 4) return [];
  const max = n.length >= 12 ? 3 : n.length >= 7 ? 2 : 1;
  let bestD = max + 1, hits = [];
  for (const [s, id] of spellings(kind)) {
    if (s === n) return []; // already spelled right (for some country)
    const d = editDistance(n, s, bestD);
    if (d < bestD) { bestD = d; hits = [[id, s]]; } else if (d === bestD) hits.push([id, s]);
  }
  if (bestD > max) return [];
  const seen = new Set(), out = [];
  hits.sort((x, y) => Math.abs(x[1].length - n.length) - Math.abs(y[1].length - n.length))
    .forEach(([id]) => { if (!seen.has(id) && out.length < 2) { seen.add(id); out.push({ id, text: kind === 'capital' ? BY_ID[id].capital : BY_ID[id].name }); } });
  return out;
}

/* ---------------- what you keep missing ---------------- */
// Per game, how often each country was missed (minus how often it was got right since), across all runs on this
// device. Only games that ask about one country at a time on a list are tracked.
const MISS_GAMES = ['flags', 'shapes', 'capitals', 'revcap', 'map', 'mapname', 'flagmap'];
const QUICK_GAME = { flag: 'flags', shape: 'shapes', capital: 'capitals' };
function recordMisses(book, score) {
  const add = (g, id, d) => { if (!MISS_GAMES.includes(g) || !BY_ID[id]) return; book[g] = book[g] || {}; const n = (book[g][id] || 0) + d; if (n > 0) book[g][id] = n; else delete book[g][id]; };
  if (score.sections) score.sections.forEach((sec) => { if (sec.skipped) return; sec.missed.forEach((id) => add(sec.game, id, 1)); sec.found.forEach((id) => add(sec.game, id, -1)); });
  if (score.res) score.res.forEach((x) => add(QUICK_GAME[x.kind], x.id, x.ok ? -1 : 1));
  return book;
}
const topMisses = (book, g, n) => Object.entries(book[g] || {}).sort((a, b) => b[1] - a[1] || BY_ID[a[0]].name.localeCompare(BY_ID[b[0]].name)).slice(0, n);

/* ---------------- daily run ---------------- */
// The same run for everyone on the same day (Eastern time): a continent (they take turns) and two games, in an order
// picked from the date. Day numbers count days since 1 Jan 1970 (UTC).
const DAILY_REGIONS = ['Europe', 'Africa', 'Asia', 'North America', 'South America', 'Oceania'];
const DAILY_GAMES = ['flags', 'map', 'capitals', 'shapes', 'revcap', 'flagmap'];
// The day changes at midnight Eastern time (Toronto), as the owner asked.
function todayNum(now) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now ? new Date(now) : new Date());
  const v = (t) => +p.find((x) => x.type === t).value;
  return Math.floor(Date.UTC(v('year'), v('month') - 1, v('day')) / 86400000);
}
function dailyCfg(day) {
  const r = rng((day * 2654435761) >>> 0);
  return { kind: 'board', games: shuffle(DAILY_GAMES, r).slice(0, 2), region: DAILY_REGIONS[day % DAILY_REGIONS.length], seed: Math.floor(r() * SEED_MAX) };
}
const dayLabel = (day) => new Date(day * 86400000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

window.GS = { recordMisses, topMisses, todayNum, dailyCfg, duelWinner, GAMES, suggest, editDistance, norm, isRight, answersFor, makeRun, makeBoard, encodeCode, decodeCode, fmtTime, pool, rng, better, compare, GAME_ORDERS, cfgLabel, DATA };
if (window.GS_NO_UI) return;

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
  const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) bg.remove(); } }, h('div', { class: 'card modal' }, ...kids));
  document.body.appendChild(bg);
  return bg;
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
  const c = S.challenge;
  mount(h('div', { class: 'app' },
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
      h('button', { class: 'btn ghost', onclick: codeEntry }, '🔑 Enter a challenge code'),
      missCount() ? h('button', { class: 'btn ghost', onclick: misses }, '🎯 My misses') : null,
      h('button', { class: 'btn ghost', onclick: bests }, '⏱ Best times')),
    h('div', { class: 'foot' }, h('a', { href: '../' }, '← Game Night'), ' · ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); credits(); } }, 'Credits'), ' · ' + DATA.length + ' countries'),
  ));
  S.badLink = false;
}

// The Daily run: same for everyone today. Your first go counts; you can replay, but the score stays.
function dailyCard() {
  const day = todayNum(), cfg = dailyCfg(day), mine = store.get('gs_daily_v1', {})[day];
  let streak = 0; const all = store.get('gs_daily_v1', {});
  for (let d = day; all[d]; d--) streak++;
  return h('div', { class: 'card daily' },
    h('div', { class: 'daily-top' }, h('p', { class: 'eyebrow' }, '📅 Daily run · ' + dayLabel(day)), streak > 1 ? h('span', { class: 'badge' }, '🔥 ' + streak + ' days') : null),
    h('div', { class: 'daily-what' }, regionOf(cfg.region).label + ': ' + cfg.games.map((g) => gameOf(g).em + ' ' + gameOf(g).label).join(' → ')),
    mine ? h('p', null, 'Your score today: ', h('b', null, mine.correct + '/' + mine.total + ' in ' + fmtTime(mine.time))) : h('p', { class: 'small muted' }, 'New run at midnight ET'),
    h('div', { class: 'row' },
      mine ? h('button', { class: 'btn ghost small', onclick: () => shareDaily(day, mine) }, '📤 Share') : null,
      h('button', { class: 'btn ' + (mine ? 'ghost' : 'gold') + ' small', onclick: () => startSession(cfg, [S.myName || 'You'], null, day) }, mine ? '↻ Play again' : '▶ Play today\'s run')));
}
async function shareDaily(day, mine) {
  const cfg = dailyCfg(day);
  const url = location.origin + location.pathname + '?' + new URLSearchParams({ c: encodeCode(cfg).replace(/-/g, ''), n: S.myName || 'A friend', t: String(mine.time), s: String(mine.correct) }).toString();
  const text = 'Geography Speedrun · Daily ' + dayLabel(day) + '\n' + regionOf(cfg.region).label + ': ' + cfg.games.map((g) => gameOf(g).label).join(' + ') + '\n' + mine.correct + '/' + mine.total + ' in ' + fmtTime(mine.time);
  if (navigator.share) { try { await navigator.share({ title: 'Geography Speedrun daily', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + '\n' + url); toast('Daily result copied'); } catch (e) { prompt('Copy and send:', text + '\n' + url); }
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
    ? { kind: 'board', games: st.games.slice(), region: st.region, seed: newSeed() }
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
      st.kind === 'board' ? optRow('🧘 Practice (no clock)', !!st.practice, set('practice')) : null),
    h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Who is playing'),
      seg([{ id: false, label: 'Just me', em: '🙋' }, { id: true, label: 'Pass the phone', em: '👥' }], st.group, set('group'), 2),
      st.group ? [
        h('div', { class: 'chips' }, S.players.map((p, i) => h('span', { class: 'chip' }, p, h('button', { 'aria-label': 'Remove ' + p, onclick: () => { S.players.splice(i, 1); store.set('gs_players_v1', S.players); setup(); } }, '✕')))),
        h('div', { class: 'row' }, nameInput = h('input', { id: 'pname', class: 'input', placeholder: 'Add a player', maxlength: 24, onkeydown: (e) => { if (e.key === 'Enter') addPlayer(); } }), h('button', { class: 'btn ghost small', style: { flex: '0 0 auto', width: 'auto' }, onclick: addPlayer }, '+ Add')),
      ] : nameField()),
    h('button', {
      class: 'btn primary', disabled: st.group && S.players.length < 2,
      onclick: () => startSession(cfgNow(), st.group ? S.players.slice() : [S.myName || 'You'], null),
    }, st.group && S.players.length < 2 ? 'Add at least 2 players' : '▶ Start'),
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
    games.length ? h('button', { class: 'btn ghost small', onclick: () => { if (confirm('Clear your misses?')) { store.set('gs_misses_v1', {}); misses(); } } }, 'Clear') : null));
}

function bests() {
  const b = store.get('gs_best_v2', {});
  const rows = Object.entries(b).sort((x, y) => x[1].label.localeCompare(y[1].label));
  mount(h('div', { class: 'app', 'data-screen': 'bests' }, topbar('Best times', home),
    rows.length ? h('ul', { class: 'list board' }, rows.map(([k, v]) =>
      h('li', null, h('div', { class: 'q' }, v.label, h('small', null, v.correct + '/' + v.total + ' right' + (v.name ? ' · ' + v.name : ''))), h('div', { class: 't' }, fmtTime(v.time))))) :
      h('p', { class: 'muted center' }, 'No runs yet. Your best for each kind of run shows up here.'),
    rows.length ? h('button', { class: 'btn ghost small', onclick: () => { if (confirm('Clear all best times on this device?')) { store.set('gs_best_v2', {}); bests(); } } }, 'Clear best times') : null));
}

function credits() {
  const bg = modal(h('h2', { class: 'display' }, 'Credits'),
    h('p', { class: 'small' }, 'Flags: flag-icons (MIT licence). Maps and country outlines: Natural Earth (public domain) via world-atlas (ISC). Names and capitals: world-countries by mledoze (ODbL 1.0). Some outlines are cropped to the main territory. Licence texts are in the licenses folder.'),
    h('p', { class: 'small muted' }, DATA.length + ' countries: the UN member states except Israel, Vatican City and Palestine (UN observers), Kosovo and Taiwan. Flags are shown in their real proportions. Where a country has more than one capital or a separate seat of government, either one counts. Grey areas on the map (like Greenland or Western Sahara) aren\'t in the game.'),
    h('button', { class: 'btn ghost small', onclick: () => bg.remove() }, 'Close'));
}

/* ---- a session: one run, played by one or more players (pass the phone) ---- */
const imgCache = {};
function preloadFlags(ids) {
  ids.forEach((id) => { if (!imgCache[id]) { const im = new Image(); im.decoding = 'async'; im.src = BY_ID[id].flag; imgCache[id] = im; } });
}
// The map data is a separate file, loaded only when a run has the Map game.
let mapLoading = null;
function loadMap() {
  if (window.GS_MAP) return Promise.resolve(window.GS_MAP);
  if (!mapLoading) mapLoading = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'map.js?v=' + APP_VERSION;
    s.onload = () => res(window.GS_MAP); s.onerror = () => { mapLoading = null; rej(new Error('map')); };
    document.head.appendChild(s);
  });
  return mapLoading;
}

function startSession(cfg, players, challenge, daily, practice) {
  S.challenge = null;
  // Practice: board runs you started yourself (never a daily or a friend's challenge), or a misses drill.
  const pr = practice != null ? practice : !!S.setup.practice && cfg.kind === 'board' && daily == null && !challenge;
  S.session = { cfg, players, idx: 0, scores: [], challenge, help: !!S.setup.help, daily: daily != null ? daily : null, practice: pr };
  if (cfg.kind === 'board') {
    S.session.board = makeBoard(cfg);
    if (cfg.games.some((g) => g === 'flags' || g === 'flagmap' || g === 'duel')) preloadFlags(pool(cfg.region));
    if (cfg.games.some((g) => MAP_GAMES.has(g))) loadMap().catch(() => toast('The map didn\'t load. Check your connection.'));
  } else {
    S.session.questions = makeRun(cfg);
    preloadFlags(S.session.questions.filter((q) => q.kind === 'flag').map((q) => q.id));
  }
  cover();
}
function howTo(cfg) {
  if (cfg.kind === 'quick') return cfg.count + ' ' + modeOf(cfg.mode).label.toLowerCase() + ' · ' + (cfg.style === 'type' ? 'type it' : 'pick from 4');
  return makeBoard(cfg).map((sec) => gameOf(sec.game).em + ' ' + gameOf(sec.game).label + ' ' + sec.ids.length).join('  →  ');
}
function cover() {
  const se = S.session, name = se.players[se.idx], many = se.players.length > 1;
  mount(h('div', { class: 'app' }, topbar(cfgLabel(se.cfg), () => { if (confirm('Leave this run?')) home(); }),
    h('div', { class: 'cover' },
      many ? h('p', { class: 'eyebrow' }, 'Player ' + (se.idx + 1) + ' of ' + se.players.length) : null,
      h('h2', { class: 'display', style: { fontSize: many ? '54px' : '42px' } }, many ? (se.idx ? 'Pass to ' : '') + name : 'Ready?'),
      h('p', { class: 'muted', style: { maxWidth: '34ch' } }, howTo(se.cfg)),
      se.help ? h('p', { class: 'small muted' }, '💡 Spelling help is on') : null,
      se.challenge && se.challenge.time ? h('p', { class: 'badge' }, 'To beat: ' + (se.cfg.kind === 'board' && se.challenge.correct != null ? se.challenge.correct + '/' + cfgTotal(se.cfg) + ' in ' : '') + fmtTime(se.challenge.time)) : null,
      h('button', { class: 'btn primary', style: { maxWidth: '320px' }, onclick: countdown }, '▶ Go')),
  ));
}
function countdown() {
  const go = () => {
    let n = 3; const el = h('div', { class: 'cd', 'aria-live': 'assertive' }, '3');
    mount(h('div', { class: 'app' }, h('div', { class: 'cover' }, el)));
    const tick = () => { n--; if (n > 0) { el.textContent = String(n); setTimeout(tick, 700); } else (S.session.cfg.kind === 'board' ? boardRun() : quickRun()); };
    setTimeout(tick, 700);
  };
  // Don't start the clock before the map has arrived.
  if (S.session.cfg.kind === 'board' && S.session.cfg.games.some((g) => MAP_GAMES.has(g)) && !window.GS_MAP) {
    mount(h('div', { class: 'app' }, h('div', { class: 'cover' }, h('p', { class: 'muted' }, 'Loading the map…'))));
    loadMap().then(go, () => { toast('The map didn\'t load. Check your connection and try again.'); cover(); });
  } else go();
}

/* ---------------- the clock ---------------- */
function makeClock() {
  const c = { start: performance.now(), paused: 0, pauseAt: null, over: false };
  c.elapsed = () => (c.pauseAt != null ? c.pauseAt : performance.now()) - c.start - c.paused;
  c.pause = () => { if (c.pauseAt == null) c.pauseAt = performance.now(); };
  c.resume = () => { if (c.pauseAt != null) { c.paused += performance.now() - c.pauseAt; c.pauseAt = null; } };
  // Every element with class "timer" on screen shows this clock (plus any penalty).
  c.extra = () => 0;
  const loop = () => {
    if (c.over) return;
    const practice = S.session && S.session.practice;
    document.querySelectorAll('.timer').forEach((t) => { t.textContent = practice ? 'Practice' : fmtTime(c.elapsed() + c.extra()); t.classList.toggle('paused', c.pauseAt != null); t.classList.toggle('practice', !!practice); });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return c;
}

function finishRun(score) {
  const se = S.session;
  score.kind = se.cfg.kind;
  se.scores.push(score);
  store.set('gs_misses_v1', recordMisses(store.get('gs_misses_v1', {}), score));
  if (se.practice) { result(score); return; } // practice: no best times, no daily score
  // Daily run: the first finished go of the day is the one that counts.
  if (se.daily != null && se.idx === 0) {
    const d = store.get('gs_daily_v1', {});
    if (!d[se.daily]) { d[se.daily] = { time: score.time, correct: score.correct, total: score.total }; store.set('gs_daily_v1', d); score.dailyFirst = true; }
  }
  const k = bestKey(se.cfg), b = store.get('gs_best_v2', {});
  score.best = !b[k] || better(score, b[k], se.cfg.kind);
  if (score.best) { b[k] = { label: cfgLabel(se.cfg), time: score.time, correct: score.correct, total: score.total, name: score.name, at: Date.now() }; store.set('gs_best_v2', b); }
  result(score);
}

/* ---------------- board runs: one or more games back to back ---------------- */
function boardRun() {
  const se = S.session;
  const R = { clock: makeClock(), sec: 0, results: [] };
  se.run = R;
  playSection(R);
}
function playSection(R) {
  const se = S.session, sec = se.board[R.sec];
  const res = { game: sec.game, kind: sec.kind, ids: sec.ids, found: [], missed: [], gaveUp: false, tries: {} };
  R.results[R.sec] = res;
  const api = {
    R, sec, res, practice: !!se.practice, label: gameOf(sec.game).label, part: se.board.length > 1 ? (R.sec + 1) + '/' + se.board.length : '',
    // Called by the game when every country is found.
    done() { R.clock.pause(); api.ui && api.ui.completed && api.ui.completed(); setTimeout(() => { R.clock.resume(); nextSection(R); }, 700); },
    giveUp: () => giveUpDialog(R, api),
    quit: () => { if (confirm('Stop this run? It won\'t count.')) { R.clock.over = true; home(); } },
  };
  api.ui = MAP_GAMES.has(sec.game) ? mapGame(api) : sec.game === 'borders' ? bordersGame(api) : sec.game === 'duel' ? duelGame(api) : gridGame(api);
}
function giveUpDialog(R, api) {
  const se = S.session, more = R.sec < se.board.length - 1;
  const bg = modal(
    h('h2', { class: 'display' }, 'Give up?'),
    h('button', { class: 'btn primary small', onclick: () => { bg.remove(); reveal(R, api, false); } }, more ? 'Give up on ' + api.label + ', go on' : 'Give up and show me'),
    more ? h('button', { class: 'btn ghost small', onclick: () => { bg.remove(); reveal(R, api, true); } }, 'End the whole run') : null,
    h('button', { class: 'btn ghost small', onclick: () => bg.remove() }, 'Keep playing'));
}
// Give up: show what was missed (the clock is stopped while you look), then carry on.
function reveal(R, api, endAll) {
  const se = S.session, res = api.res;
  R.clock.pause();
  res.gaveUp = true;
  res.missed = res.ids.filter((id) => !res.found.includes(id));
  if (endAll) {
    for (let i = R.sec + 1; i < se.board.length; i++) { const s = se.board[i]; R.results[i] = { game: s.game, kind: s.kind, ids: s.ids, found: [], missed: s.ids.slice(), gaveUp: true, skipped: true, tries: {} }; }
  }
  const last = endAll || R.sec >= se.board.length - 1;
  api.ui.reveal(h('button', { class: 'btn primary small', onclick: () => { R.clock.resume(); if (last) finishBoard(R); else { R.sec++; playSection(R); } } },
    last ? 'See results →' : 'Next: ' + gameOf(se.board[R.sec + 1].game).label + ' →'));
}
function nextSection(R) {
  const se = S.session;
  R.results[R.sec].missed = R.results[R.sec].ids.filter((id) => !R.results[R.sec].found.includes(id));
  if (R.sec >= se.board.length - 1) return finishBoard(R);
  R.sec++; playSection(R);
}
function finishBoard(R) {
  const se = S.session;
  R.clock.over = true;
  const time = Math.round(R.clock.elapsed());
  const correct = R.results.reduce((s, r) => s + r.found.length, 0), total = R.results.reduce((s, r) => s + r.ids.length, 0);
  finishRun({ name: se.players[se.idx], raw: time, pen: 0, time, correct, total, sections: R.results });
}

/* ---------------- quick fire: one question at a time ---------------- */
function quickRun() {
  const se = S.session, cfg = se.cfg, Q = se.questions;
  const clock = makeClock();
  const R = { i: 0, pen: 0, res: [], busy: false };
  clock.extra = () => R.pen;

  const timerEl = h('div', { class: 'timer num' }, '0.0');
  const countEl = h('div', { class: 'count num' });
  const penEl = h('div', { class: 'pen num' });
  const barEl = h('i');
  const stage = h('div', { class: 'stage' });
  const revealEl = h('div', { class: 'reveal', 'aria-live': 'polite' });
  let input, choicesEl, help;
  const answerArea = h('div');
  if (cfg.style === 'type') {
    input = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Your answer' });
    const skipBtn = h('button', { class: 'btn ghost skip' }, 'Skip +10s');
    const sugEl = h('div', { class: 'suggest', 'aria-live': 'polite', hidden: true });
    help = spellingHelp(input, sugEl, () => Q[R.i].kind, () => Q[R.i].id, () => done(true, 'typed'));
    answerArea.append(h('div', { class: 'answer' }, input, skipBtn), sugEl);
    input.addEventListener('input', () => { if (R.busy) return; if (isRight(Q[R.i].id, Q[R.i].kind, input.value)) done(true, 'typed'); else help.update(); });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return; e.preventDefault();
      if (R.busy) return;
      if (isRight(Q[R.i].id, Q[R.i].kind, input.value)) return done(true, 'typed');
      help.enter();
    });
    skipBtn.addEventListener('click', () => { if (!R.busy) { done(false, 'skip'); input.focus(); } });
  } else {
    choicesEl = h('div', { class: 'choices' });
    answerArea.append(choicesEl);
  }
  const quit = h('button', { class: 'iconbtn', 'aria-label': 'Stop the run', onclick: () => { if (confirm('Stop this run? It won\'t count.')) { clock.over = true; home(); } } }, '✕');
  mount(h('div', { class: 'app run' },
    h('div', { class: 'hud' }, quit, countEl, timerEl, penEl),
    h('div', { class: 'bar' }, barEl),
    stage, revealEl, answerArea));
  cleanup.push(() => { clock.over = true; });

  function show() {
    const q = Q[R.i], c = BY_ID[q.id];
    countEl.replaceChildren(String(R.i + 1) + '/' + Q.length, h('small', null, 'DONE ' + R.res.filter((x) => x.ok).length));
    penEl.replaceChildren(R.pen ? '+' + R.pen / 1000 + 's' : '+0s', h('small', null, 'PENALTY'));
    barEl.style.width = (R.i / Q.length * 100) + '%';
    stage.className = 'stage';
    revealEl.textContent = '';
    const kindChip = cfg.mode === 'mix' ? h('span', { class: 'eyebrow kind' }, q.kind === 'flag' ? '🏳️ Flag' : q.kind === 'shape' ? '🗺️ Shape' : '🏛️ Capital') : null;
    if (q.kind === 'flag') {
      const im = imgCache[q.id] && imgCache[q.id].complete ? imgCache[q.id].cloneNode() : h('img', { src: c.flag });
      im.className = 'flag'; im.alt = 'A flag'; im.width = Math.round(c.ratio * 480); im.height = 480;
      stage.replaceChildren(...[kindChip, im].filter(Boolean));
    } else if (q.kind === 'shape') {
      stage.replaceChildren(...[kindChip, h('span', { class: 'reg' }, regionLabel(c.region)), shapeSvg(q.id, 'shape')].filter(Boolean));
    } else {
      stage.replaceChildren(...[kindChip, h('div', { class: 'ask' }, 'Capital of'), h('div', { class: 'big' }, c.name)].filter(Boolean));
    }
    if (input) {
      input.value = ''; help.clear();
      input.placeholder = q.kind === 'capital' ? 'Type the capital…' : 'Type the country…';
      input.focus({ preventScroll: true });
    } else {
      choicesEl.replaceChildren(...q.opts.map((id) => h('button', { class: 'choice', 'data-id': id, onclick: () => pick(id) }, answerText(id, q.kind))));
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
    R.busy = true; clock.pause(); if (help) help.clear();
    const q = Q[R.i];
    if (!ok) { R.pen += how === 'skip' ? SKIP_MS : WRONG_MS; try { navigator.vibrate && navigator.vibrate(60); } catch (e) { /* no vibration */ } }
    R.res.push({ id: q.id, kind: q.kind, ok, how });
    stage.classList.add(ok ? 'ok' : 'bad');
    if (!ok) revealEl.textContent = '→ ' + answerText(q.id, q.kind);
    // The clock is stopped while the answer is on screen, so the pause costs nobody anything.
    setTimeout(() => {
      R.i++; R.busy = false;
      if (R.i >= Q.length) return finish();
      clock.resume(); show();
    }, ok ? 180 : 1000);
  }
  function finish() {
    clock.over = true;
    const raw = clock.elapsed();
    finishRun({ name: se.players[se.idx], raw, pen: R.pen, time: Math.round(raw + R.pen), correct: R.res.filter((x) => x.ok).length, total: Q.length, res: R.res });
  }
  if (choicesEl) {
    const onKey = (e) => { const k = parseInt(e.key, 10); if (k >= 1 && k <= 4) { const q = Q[R.i]; if (q && q.opts[k - 1]) pick(q.opts[k - 1]); } };
    document.addEventListener('keydown', onKey);
    cleanup.push(() => document.removeEventListener('keydown', onKey));
  }
  show();
}

/* ---- board games on a grid (JetPunk style): flags, shapes, capitals ----
   Every country is a tile. One tile is selected; type its answer and it fills in and the next empty tile is
   selected. Tap any tile (or ◀ ▶) to switch. */
function tilePic(game, id) {
  // Flags keep their real proportions (Monaco 5:4, Indonesia 3:2, Qatar 28:11, Nepal's two pennants…), centred in
  // the same-size box.
  if (game === 'flags') return h('span', { class: 'pic flagbox' }, h('img', { src: BY_ID[id].flag, alt: 'A flag', loading: 'lazy', width: Math.round(BY_ID[id].ratio * 100), height: 100 }));
  if (game === 'shapes') return shapeSvg(id, 'pic');
  if (game === 'revcap') return h('span', { class: 'pic name' }, BY_ID[id].capital);
  return h('span', { class: 'pic name' }, BY_ID[id].name);
}
function gridGame(api) {
  const { sec, res } = api;
  const game = sec.game, kind = sec.kind, ids = sec.ids;
  const found = new Set();
  let active = 0, revealed = false;

  const foundEl = h('span', { class: 'found num', 'aria-live': 'polite' });
  const input = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'next',
    placeholder: kind === 'capital' ? 'Type the capital…' : 'Type the country…', 'aria-label': 'Answer for the selected tile' });
  const preview = h('div', { class: 'preview' });
  const sugEl = h('div', { class: 'suggest', 'aria-live': 'polite', hidden: true });
  const help = spellingHelp(input, sugEl, kind, () => ids[active], () => accept());
  const tiles = ids.map((id, i) => h('button', { class: 'tile', 'data-id': id, 'aria-label': kind === 'capital' ? 'Capital of ' + BY_ID[id].name : game === 'revcap' ? 'Country with the capital ' + BY_ID[id].capital : 'Tile ' + (i + 1),
    onmousedown: (e) => e.preventDefault(), onclick: () => { if (!revealed) select(i, true); } },
  tilePic(game, id), h('span', { class: 'lbl' })));
  const grid = h('div', { class: 'tiles t-' + (game === 'revcap' ? 'capitals' : game) }, tiles);
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = h('div', { class: 'bhead' },
    h('div', { class: 'hud' },
      h('button', { class: 'iconbtn', 'aria-label': 'Stop the run', onclick: api.quit }, '✕'),
      h('div', { class: 'secname' }, h('b', null, gameOf(game).em + ' ' + api.label), api.part ? h('small', null, 'Game ' + api.part) : null),
      h('div', { class: 'timer num' }, fmtTime(api.R.clock.elapsed())),
      h('button', { class: 'btn ghost giveup', onclick: () => { if (!revealed) api.giveUp(); } }, 'Give up')),
    h('div', { class: 'typebar' },
      preview,
      h('button', { class: 'iconbtn', 'aria-label': 'Previous', onmousedown: (e) => e.preventDefault(), onclick: () => step(-1) }, '◀'),
      input,
      h('button', { class: 'iconbtn', 'aria-label': 'Next', onmousedown: (e) => e.preventDefault(), onclick: () => step(1) }, '▶')),
    sugEl,
    h('div', { class: 'progress' }, foundEl, api.practice ? h('button', { class: 'showbtn', onmousedown: (e) => e.preventDefault(), onclick: () => showAnswer() }, '👁 Show answer') : null));
  mount(h('div', { class: 'app wide grid-run' }, head, grid, footer));

  function count() { foundEl.textContent = found.size + ' / ' + ids.length + ' found'; }
  function select(i, focus) {
    tiles[active].classList.remove('active');
    active = i;
    const t = tiles[i];
    t.classList.add('active');
    preview.replaceChildren(tilePic(game, ids[i]));
    preview.classList.toggle('name', game === 'capitals' || game === 'revcap');
    input.value = ''; help.clear();
    t.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    if (focus) keepFocus(input, t);
  }
  // The next tile that isn't found yet, going forwards (d = 1) or backwards (d = -1) and wrapping round.
  function nextOpen(from, d) {
    for (let k = 1; k <= ids.length; k++) { const i = ((from + d * k) % ids.length + ids.length) % ids.length; if (!found.has(ids[i]) && !shown.has(ids[i])) return i; }
    return -1;
  }
  // Practice: show the answer for the selected tile (counts as missed) and go to the next one.
  const shown = new Set();
  function showAnswer() {
    const id = ids[active];
    if (revealed || found.has(id) || shown.has(id)) return;
    shown.add(id);
    const t = tiles[active];
    t.classList.remove('active'); t.classList.add('missed');
    t.querySelector('.lbl').textContent = answerText(id, kind);
    input.value = ''; help.clear();
    const n = nextOpen(active, 1);
    if (n < 0) { input.blur(); api.done(); return; }
    select(n, true);
  }
  function step(d) { if (revealed) return; const i = nextOpen(active, d); if (i >= 0) select(i, true); }
  function accept() {
    const id = ids[active];
    if (revealed || found.has(id)) return;
    found.add(id); res.found.push(id);
    const t = tiles[active];
    t.classList.remove('active'); t.classList.add('done');
    t.querySelector('.lbl').textContent = answerText(id, kind);
    count(); help.clear();
    const n = nextOpen(active, 1);
    if (n < 0) { input.value = ''; input.blur(); api.done(); return; }
    select(n, true);
  }
  // Right answer → accepted the moment it's typed. Enter on a wrong answer just shakes (it never skips).
  input.addEventListener('input', () => {
    if (revealed) return;
    if (isRight(ids[active], kind, input.value)) accept(); else help.update();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (!revealed) help.enter(); }
    else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); step(-1); }
  });
  count(); select(0, true);

  return {
    completed() { head.classList.add('all-done'); foundEl.textContent = 'All ' + ids.length + ' found!'; },
    reveal(btn) {
      revealed = true; help.clear();
      input.disabled = true; input.value = ''; input.placeholder = 'Gave up';
      tiles[active].classList.remove('active');
      ids.forEach((id, i) => { if (!found.has(id)) { tiles[i].classList.add('missed'); tiles[i].querySelector('.lbl').textContent = answerText(id, kind); } });
      head.classList.add('gave-up');
      foundEl.textContent = found.size + ' / ' + ids.length + ' found · missed ' + (ids.length - found.size) + ' (in red)';
      footer.hidden = false; footer.replaceChildren(btn);
      window.scrollTo(0, 0);
    },
  };
}

/* Focus the answer box without the page jumping. Some phone browsers (iOS Safari especially) scroll to the top
   when an input inside a sticky header gets focus, so: don't refocus if it already has focus, and if the page
   jumped anyway, put it back where it was (also once more after the keyboard has finished opening). */
function keepFocus(input, tile) {
  if (document.activeElement === input) return;
  const y = window.scrollY;
  input.focus({ preventScroll: true });
  const restore = () => { if (window.scrollY < y - 40) { window.scrollTo(0, y); if (tile) tile.scrollIntoView({ block: 'nearest' }); } };
  requestAnimationFrame(restore); setTimeout(restore, 350);
}

/* Spelling help ("Did you mean …?"), used by the boards and Quick fire. Only on when the player turned it on.
   Suggestions come from every country (or capital) in the world, not just the right answer. Tapping one (or
   Enter when there's only one) tries it: right → accepted; wrong → it shakes like any wrong answer. */
function shake(input) { input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); }
function spellingHelp(input, el, kindOf, currentId, onRight, matcher) {
  let list = [];
  const kind0 = () => (typeof kindOf === 'function' ? kindOf() : kindOf);
  const on = () => !!(S.session && S.session.help);
  const clear = () => { list = []; el.hidden = true; el.replaceChildren(); };
  const tryText = (text) => {
    if (matcher ? matcher(text) : isRight(currentId(), kind0(), text)) { input.value = text; onRight(); }
    else { input.value = text; clear(); shake(input); }
    input.focus({ preventScroll: true });
  };
  return {
    clear,
    update() {
      if (!on()) return;
      list = suggest(input.value, kind0());
      if (!list.length) return clear();
      el.hidden = false;
      el.replaceChildren(...[h('span', null, 'Did you mean'), list.map((x, i) => [i ? h('span', null, 'or') : null,
        h('button', { class: 'sug', onmousedown: (e) => e.preventDefault(), onclick: () => tryText(x.text) }, x.text)]), h('span', null, '?')].flat(2).filter(Boolean));
    },
    enter() {
      if (on() && list.length === 1) return tryText(list[0].text);
      shake(input);
    },
  };
}

/* ---- the Map game (Seterra style) ----
   The whole map (or the region). It names a country; tap it. Right first time = green, second = yellow,
   third = orange; three wrong taps and it turns red, counts as missed, and you have to tap it to go on (like
   Seterra). Pinch / drag / scroll to zoom and pan, or use the + − buttons.
   Small countries, Seterra style: a little white dot where a country is too small to see, a dashed box round a
   spread-out island group, and (on the world map, on a big enough screen) magnified Caribbean and Pacific boxes.
   A tap on the sea just next to a dot or box counts for it. */
function mapGame(api) {
  const { sec, res } = api;
  // Three ways to play the map: 'map' (tap the named country), 'flagmap' (tap the country of the flag shown),
  // 'mapname' (a country lights up in gold; type its name).
  const mode = sec.game, naming = mode === 'mapname';
  const M = window.GS_MAP, view = M.views[S.session.cfg.region], m = M[view.map];
  const ids = sec.ids, playable = new Set(ids);
  const queue = ids.slice();
  const tries = res.tries;
  let revealed = false, ended = false, must = null; // must = a missed country you have to tap to go on

  /* ---- drawing ---- */
  const els = {}; // id → every element showing that country (map paths, inset paths, dots, boxes)
  const addEl = (id, el) => (els[id] = els[id] || []).push(el);
  // Countries, grey land, and marker elements for one map (the main one or an inset).
  function layer(md, where) {
    const zones = h('g', null), g = h('g', null), dots = h('g', null), markers = [];
    g.appendChild(h('path', { class: 'land', d: md.land }));
    Object.entries(md.c).forEach(([id, d]) => {
      const p = h('path', { class: 'cty' + (playable.has(id) ? '' : ' off'), d, 'data-id': id });
      g.appendChild(p); if (playable.has(id)) addEl(id, p);
    });
    Object.entries(md.mk || {}).forEach(([id, [x0, y0, x1, y1, cx, cy, area, island]]) => {
      if (!playable.has(id)) return;
      const dot = h('circle', { class: 'dot', cx, cy, r: 1, 'data-id': id, style: { display: 'none' } });
      const zone = h('rect', { class: 'zone', x: x0, y: y0, width: x1 - x0, height: y1 - y0, 'data-id': id, style: { display: 'none' } });
      dots.appendChild(dot); zones.appendChild(zone); addEl(id, dot); addEl(id, zone);
      markers.push({ id, x0, y0, x1, y1, cx, cy, area, island, dot, zone, where });
    });
    return { nodes: [zones, g, dots], markers };
  }
  const main = layer(m, 'main');
  const svg = h('svg', { class: 'map', role: 'img', 'aria-label': 'World map', preserveAspectRatio: 'xMidYMid meet' },
    h('rect', { class: 'sea', x: -m.w, y: -m.h, width: m.w * 3, height: m.h * 3 }), ...main.nodes);
  // Magnified boxes (world map only).
  const insets = (view.insets || []).map((ins) => {
    const md = M[ins.map], L = layer(md, ins.name);
    const isvg = h('svg', { class: 'map', viewBox: ins.box.join(' '), preserveAspectRatio: 'xMidYMid slice' },
      h('rect', { class: 'sea', x: ins.box[0] - 50, y: ins.box[1] - 50, width: ins.box[2] + 100, height: ins.box[3] + 100 }), ...L.nodes);
    const box = h('div', { class: 'inset inset-' + ins.where, style: { aspectRatio: ins.box[2] + ' / ' + ins.box[3] } }, isvg, h('span', { class: 'inset-name' }, ins.name));
    isvg.addEventListener('click', (e) => tap(e.clientX, e.clientY));
    // Countries this box covers: their dots/boxes are hidden on the main map while it's showing.
    const covered = new Set(L.markers.filter((k) => k.cx >= ins.box[0] && k.cx <= ins.box[0] + ins.box[2] && k.cy >= ins.box[1] && k.cy <= ins.box[1] + ins.box[3]).map((k) => k.id));
    return { ins, box, svg: isvg, markers: L.markers, covered, shown: false };
  });
  const wrap = h('div', { class: 'mapwrap' }, svg, ...insets.map((i) => i.box),
    h('div', { class: 'zoom' },
      h('button', { class: 'iconbtn', 'aria-label': 'Zoom in', onclick: () => zoomBy(0.6) }, '+'),
      h('button', { class: 'iconbtn', 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 0.6) }, '−'),
      h('button', { class: 'iconbtn', 'aria-label': 'Show the whole map', onclick: () => fit(!fitAll) }, '⤢')));
  const target = h('b', { class: 'target' });
  // Map: name it — an input instead of the country's name.
  const nameInput = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go', placeholder: 'Type the gold country…', 'aria-label': 'Name the country lit up in gold' });
  const nameBox = h('div', { class: 'namebox' }, nameInput);
  const sugEl = h('div', { class: 'suggest', 'aria-live': 'polite', hidden: true });
  const hint = h('div', { class: 'maphint', 'aria-live': 'polite' });
  const foundEl = h('span', { class: 'found num' });
  const barOk = h('i', { class: 'b-ok' }), barMiss = h('i', { class: 'b-miss' });
  const portrait = () => window.innerHeight > window.innerWidth * 1.15;
  const skipBtn = h('button', { class: 'btn ghost giveup', onclick: () => skip() }, 'Skip');
  const showBtn = api.practice ? h('button', { class: 'btn ghost giveup', onclick: () => showAnswer() }, 'Show') : null;
  const footer = h('div', { class: 'reveal-bar floating', hidden: true });
  const head = h('div', { class: 'bhead' },
    h('div', { class: 'hud' },
      h('button', { class: 'iconbtn', 'aria-label': 'Stop the run', onclick: api.quit }, '✕'),
      h('div', { class: 'secname' }, h('b', null, gameOf(mode).em + ' ' + api.label), api.part ? h('small', null, 'Game ' + api.part) : null),
      h('div', { class: 'timer num' }, fmtTime(api.R.clock.elapsed())),
      h('button', { class: 'btn ghost giveup', onclick: () => { if (!revealed && !ended) api.giveUp(); } }, 'Give up')),
    h('div', { class: 'prompt' }, h('span', { class: 'findlbl' }, h('span', { class: 'eyebrow' }, naming ? 'Name it' : 'Find'), foundEl), naming ? nameBox : target, showBtn, skipBtn),
    naming ? sugEl : null,
    h('div', { class: 'mapbar', 'aria-hidden': 'true' }, barOk, barMiss),
    hint);
  mount(h('div', { class: 'app map-run' }, head, wrap, footer));
  document.body.classList.add('fullscreen');

  /* ---- view: fit, zoom, pan ---- */
  let base, vb;
  const size = () => { const r = svg.getBoundingClientRect(); return { w: r.width || 1, h: r.height || 1, left: r.left, top: r.top }; };
  let fitAll = false;
  function fit(all) {
    fitAll = !!all;
    // A phone held upright starts on a tighter view of the region; ⤢ switches to the whole region and back.
    const s = size(), [bx, by, bw, bh] = !all && portrait() && view.tight ? view.tight : view.box;
    const ar = s.w / s.h;
    let w = bw, hh = bh;
    if (bw / bh > ar) {
      // Wider than the screen (a phone held upright): rather than shrink it to a strip, fill more of the height
      // and show 70% of the width, centred. Drag to see the edges; ⤢ shows the whole region.
      w = all ? bw : Math.max(bh * ar, bw * 0.7); hh = w / ar;
    } else w = bh * ar;
    base = { x: bx + bw / 2 - w / 2, y: by + bh / 2 - hh / 2, w, h: hh };
    vb = Object.assign({}, base); apply();
    svg.setAttribute('data-fit', fitAll ? 'all' : 'start');
  }
  const fullW = () => Math.max(view.box[2], view.box[3] * size().w / size().h);
  function apply() {
    const s = size();
    svg.setAttribute('viewBox', [vb.x, vb.y, vb.w, vb.h].map((v) => Math.round(v * 10) / 10).join(' '));
    const px = vb.w / s.w; // map units per screen pixel
    // Insets show on the world map when the screen is big enough and you haven't zoomed in.
    const showInsets = s.w >= 620 && s.h >= 380 && vb.w >= base.w * 0.8;
    insets.forEach((i) => {
      i.shown = showInsets; i.box.hidden = !showInsets;
      if (showInsets) { const r = i.svg.getBoundingClientRect(); placeMarkers(i.markers, i.ins.box[2] / (r.width || 1), () => false); }
    });
    placeMarkers(main.markers, px, (id) => insets.some((i) => i.shown && i.covered.has(id)));
  }
  const placeAll = () => apply();
  // Dot or dashed box for each small country, from how big it is on screen right now.
  function placeMarkers(list, px, hidden) {
    list.forEach((k) => {
      const sw = (k.x1 - k.x0) / px, sh = (k.y1 - k.y0) / px, big = Math.max(sw, sh);
      let mode = '';
      if (!hidden(k.id)) {
        if (big < 9) mode = 'dot';
        else if (k.island && k.area / (px * px) < 0.15 * sw * sh) mode = 'zone'; // spread-out island group
      }
      k.mode = mode;
      k.dot.style.display = mode === 'dot' ? '' : 'none';
      k.zone.style.display = mode === 'zone' ? '' : 'none';
      if (mode === 'dot') k.dot.setAttribute('r', String((k.dot.hasAttribute('data-st') ? 6 : 4.5) * px));
      if (mode === 'zone') { const pad = 5 * px; k.zone.setAttribute('x', k.x0 - pad); k.zone.setAttribute('y', k.y0 - pad); k.zone.setAttribute('width', k.x1 - k.x0 + 2 * pad); k.zone.setAttribute('height', k.y1 - k.y0 + 2 * pad); k.zone.setAttribute('rx', 4 * px); }
    });
  }
  function zoomAt(f, cx, cy) { // cx, cy: screen point that stays put
    const s = size();
    const nw = Math.min(fullW() * 1.4, Math.max(fullW() / 40, vb.w * f));
    const k = nw / vb.w;
    const px = vb.x + (cx - s.left) / s.w * vb.w, py = vb.y + (cy - s.top) / s.h * vb.h;
    vb = { x: px - (px - vb.x) * k, y: py - (py - vb.y) * k, w: nw, h: vb.h * k };
    apply();
  }
  function zoomBy(f) { const s = size(); zoomAt(f, s.left + s.w / 2, s.top + s.h / 2); }
  const pts = new Map(); let pan = null, pinch = null, moved = false;
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { pan = { x: e.clientX, y: e.clientY, vb: Object.assign({}, vb) }; moved = false; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vb: Object.assign({}, vb) }; moved = true; }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = size();
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const nw = Math.min(fullW() * 1.4, Math.max(fullW() / 40, pinch.vb.w * pinch.d / d)), k = nw / pinch.vb.w;
      const px = pinch.vb.x + (pinch.mx - s.left) / s.w * pinch.vb.w, py = pinch.vb.y + (pinch.my - s.top) / s.h * pinch.vb.h;
      vb = { x: px - (mx - s.left) / s.w * nw, y: py - (my - s.top) / s.h * pinch.vb.h * k, w: nw, h: pinch.vb.h * k };
      apply();
    } else if (pan) {
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (!moved && Math.hypot(dx, dy) > 6) moved = true;
      if (moved) { vb.x = pan.vb.x - dx / s.w * vb.w; vb.y = pan.vb.y - dy / s.h * vb.h; apply(); }
    }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    const wasSingle = pts.size === 1;
    pts.delete(e.pointerId);
    if (wasSingle && !moved && e.type === 'pointerup') tap(e.clientX, e.clientY);
    if (pts.size === 1) { const [p] = [...pts.values()]; pan = { x: p.x, y: p.y, vb: Object.assign({}, vb) }; pinch = null; }
    if (!pts.size) { pan = null; pinch = null; }
  };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
  const onResize = () => fit(fitAll);
  window.addEventListener('resize', onResize);
  cleanup.push(() => window.removeEventListener('resize', onResize));

  /* ---- the game ---- */
  const setState = (id, st) => { (els[id] || []).forEach((el) => { if (st) el.setAttribute('data-st', st); else el.removeAttribute('data-st'); }); if (base) apply(); };
  let missedN = 0;
  function count() {
    foundEl.textContent = res.found.length + ' / ' + ids.length + ' found';
    barOk.style.width = (res.found.length / ids.length * 100) + '%'; barMiss.style.width = (missedN / ids.length * 100) + '%';
  }
  // The name of what you tapped, floating where you tapped (green when right, red when wrong).
  function tapName(x, y, text, ok) {
    document.querySelectorAll('.tapname').forEach((t) => t.remove());
    const t = h('div', { class: 'tapname ' + (ok ? 'ok' : 'bad'), style: { left: x + 'px', top: y + 'px' } }, (ok ? '✓ ' : '✗ ') + text);
    document.body.appendChild(t); setTimeout(() => t.remove(), 950);
  }
  const pop = (id) => (els[id] || []).forEach((el) => { el.classList.remove('pop'); void el.getBoundingClientRect(); el.classList.add('pop'); });
  function ask() {
    if (!queue.length) { ended = true; target.textContent = 'Done!'; nameInput.disabled = true; skipBtn.disabled = true; hint.textContent = ''; api.done(); return; }
    const cur = queue[0];
    if (mode === 'flagmap') target.replaceChildren(h('img', { class: 'promptflag', src: BY_ID[cur].flag, alt: 'The flag to find', width: Math.round(BY_ID[cur].ratio * 60), height: 60 }));
    else target.textContent = naming ? '' : BY_ID[cur].name;
    if (naming) { setState(cur, 'focus'); showTarget(cur); nameInput.value = ''; help.clear(); nameInput.focus({ preventScroll: true }); }
    const t = tries[queue[0]] || 0;
    hint.textContent = t ? '✗'.repeat(t) + ' ' + (MAP_TRIES - t) + ' tries left' : '';
  }
  // Practice: show where it is (map / flag → map: it flashes red and you tap it) or what it's called (name it).
  function showAnswer() {
    if (revealed || ended || must || !queue.length) return;
    const cur = queue[0];
    if (naming) {
      setState(cur, 'miss'); missedN++;
      const r = els[cur][0].getBoundingClientRect(); tapName(r.left + r.width / 2, r.top + r.height / 2, BY_ID[cur].name, false);
      hint.textContent = 'That was ' + BY_ID[cur].name;
      queue.shift(); count(); ask(); return;
    }
    tries[cur] = MAP_TRIES; must = cur; setState(cur, 'must');
    hint.textContent = BY_ID[cur].name + ' is flashing red: tap it';
    showMust(cur);
  }
  function skip() {
    if (revealed || must || ended || queue.length < 2) return;
    if (naming) setState(queue[0], null);
    queue.push(queue.shift()); ask();
  }
  // Which country a tap means: the country (or dot / box) under the finger; on the sea, the nearest dot or box
  // within 16 px (Seterra-style forgiving taps for small islands). Inside an inset, only that inset counts.
  function pickAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const hit = el && el.closest && el.closest('[data-id]');
    const id = hit && hit.getAttribute('data-id');
    if (id && playable.has(id)) return id;
    // Just missed a small coastline? Look a few pixels around the finger for a country before giving up.
    for (const r of [3, 6, 10]) for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, e2 = document.elementFromPoint(x + r * Math.cos(a), y + r * Math.sin(a));
      const h2 = e2 && e2.closest && e2.closest('[data-id]'), id2 = h2 && h2.getAttribute('data-id');
      if (id2 && playable.has(id2) && !h2.classList.contains('zone') && (e2.closest('.inset') || null) === (el && el.closest ? el.closest('.inset') : null)) return id2;
    }
    const inInset = el && el.closest && el.closest('.inset');
    const list = inInset ? (insets.find((i) => i.box === inInset) || { markers: [] }).markers : main.markers;
    let best = null, bestD = 16;
    list.forEach((k) => {
      if (!k.mode) return;
      const r = (k.mode === 'dot' ? k.dot : k.zone).getBoundingClientRect();
      const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = k.id; }
    });
    return best || id;
  }
  function tap(x, y) {
    const id = pickAt(x, y);
    if (revealed) { if (id) hint.textContent = BY_ID[id] ? BY_ID[id].name : ''; return; }
    if (naming || ended || !id || !playable.has(id)) return;
    const cur = queue[0];
    if (must) {
      // After three misses you have to tap the right one (in red) before the next country.
      if (id === must) { setState(must, 'miss'); must = null; missedN++; queue.shift(); count(); ask(); }
      else { hint.textContent = 'Tap ' + BY_ID[must].name + ' (flashing red) to go on'; }
      return;
    }
    if (res.found.includes(id)) return;
    if (id === cur) {
      const t = tries[cur] || 0;
      res.found.push(cur); setState(cur, 'g' + t); pop(cur); tapName(x, y, BY_ID[cur].name, true);
      placeAll(); queue.shift(); count(); ask();
      return;
    }
    // Wrong country.
    tries[cur] = (tries[cur] || 0) + 1;
    if (!(els[id][0].getAttribute('data-st'))) { setState(id, 'flash'); setTimeout(() => { if (els[id][0].getAttribute('data-st') === 'flash') setState(id, null); }, 450); }
    try { navigator.vibrate && navigator.vibrate(40); } catch (e) { /* no vibration */ }
    tapName(x, y, BY_ID[id].name, false);
    if (tries[cur] >= MAP_TRIES) {
      must = cur; setState(cur, 'must');
      hint.textContent = '✗ That\'s ' + BY_ID[id].name + '. ' + BY_ID[cur].name + ' is flashing red: tap it to go on.';
      showMust(cur);
    } else {
      hint.textContent = '✗ That\'s ' + BY_ID[id].name + ' · ' + (MAP_TRIES - tries[cur]) + ' tries left';
    }
  }
  // Make sure the missed country is on screen (zoom out to the region view if it isn't).
  function showMust(id) {
    const w = wrap.getBoundingClientRect();
    const seen = els[id].some((el) => { const r = el.getBoundingClientRect(); return r.width + r.height > 0 && r.right > w.left && r.left < w.right && r.bottom > w.top && r.top < w.bottom; });
    if (!seen) fit(true);
  }
  requestAnimationFrame(() => fit(false));
  // Map: name it.
  const help = spellingHelp(nameInput, sugEl, 'country', () => queue[0], () => named());
  function named() {
    const cur = queue[0];
    res.found.push(cur); setState(cur, 'g0'); pop(cur);
    const r = (els[cur][0]).getBoundingClientRect(); tapName(r.left + r.width / 2, r.top + r.height / 2, BY_ID[cur].name, true);
    queue.shift(); count(); ask();
  }
  nameInput.addEventListener('input', () => { if (!naming || ended || revealed) return; if (isRight(queue[0], 'country', nameInput.value)) named(); else help.update(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!ended && !revealed) { if (isRight(queue[0], 'country', nameInput.value)) named(); else help.enter(); } } });
  // Bring the gold country into view: zoom in on it if it's small or off screen.
  function showTarget(id) {
    if (!base) return requestAnimationFrame(() => showTarget(id));
    const el = els[id][0], bb = el.getBBox(), s = size();
    const onScreen = el.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    const visible = onScreen.right > w.left + 20 && onScreen.left < w.right - 20 && onScreen.bottom > w.top + 20 && onScreen.top < w.bottom - 20;
    const big = Math.max(onScreen.width, onScreen.height) >= 24;
    if (visible && big) return;
    // A view about 6× the country's size (but not smaller than a fifth of the region), centred on it.
    const ar = s.w / s.h, cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    let vw = Math.max(bb.width * 6, bb.height * 6 * ar, base.w / 5);
    vw = Math.min(vw, base.w);
    vb = { x: cx - vw / 2, y: cy - vw / ar / 2, w: vw, h: vw / ar }; apply();
  }
  count(); ask();
  if (portrait() && !store.get('gs_tip_sideways', false)) {
    hint.textContent = 'Turn sideways for a bigger map';
    store.set('gs_tip_sideways', true);
  }

  return {
    completed() { head.classList.add('all-done'); },
    reveal(btn) {
      revealed = true; skipBtn.disabled = true; must = null; nameInput.disabled = true; help.clear(); if (naming && queue[0]) setState(queue[0], null);
      ids.forEach((id) => { if (!res.found.includes(id)) setState(id, 'miss'); });
      target.textContent = (ids.length - res.found.length) + ' missed (in red)';
      hint.textContent = 'Tap a country to see its name.';
      head.classList.add('gave-up');
      footer.hidden = false; footer.replaceChildren(btn);
    },
  };
}

/* ---- Borders and Bigger country ---- */

// Shared header for the one-at-a-time board games.
function boardHead(api, extra) {
  const head = h('div', { class: 'bhead' },
    h('div', { class: 'hud' },
      h('button', { class: 'iconbtn', 'aria-label': 'Stop the run', onclick: api.quit }, '✕'),
      h('div', { class: 'secname' }, h('b', null, gameOf(api.sec.game).em + ' ' + api.label), api.part ? h('small', null, 'Game ' + api.part) : null),
      h('div', { class: 'timer num' }, fmtTime(api.R.clock.elapsed())),
      h('button', { class: 'btn ghost giveup', onclick: () => api.giveUp() }, 'Give up')),
    extra);
  return head;
}

/* Borders: a country is shown; name every country it shares a land border with (any order). Each neighbour is
   one point. Skip moves on and brings the country back later. */
function bordersGame(api) {
  const { sec, res } = api;
  const queue = sec.countries.slice();
  let revealed = false, ended = false;
  const done = new Set(); // "de>fr" keys found
  const foundEl = h('span', { class: 'found num' });
  const input = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go', placeholder: 'Type a neighbour…', 'aria-label': 'A neighbouring country' });
  const sugEl = h('div', { class: 'suggest', 'aria-live': 'polite', hidden: true });
  const skipBtn = h('button', { class: 'btn ghost giveup', onclick: () => skip() }, 'Skip');
  const showBtn = api.practice ? h('button', { class: 'btn ghost giveup', onclick: () => showAnswer() }, 'Show') : null;
  const card = h('div', { class: 'bcard' });
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = boardHead(api, [h('div', { class: 'typebar' }, input, showBtn, skipBtn), sugEl, h('div', { class: 'progress' }, foundEl)]);
  mount(h('div', { class: 'app wide grid-run' }, head, card, footer));
  const remaining = (id) => BY_ID[id].nb.filter((n) => !done.has(id + '>' + n));
  // Which still-missing neighbour of the current country does this text name?
  const match = (text) => { const cur = queue[0]; return cur ? remaining(cur).find((n) => isRight(n, 'country', text)) : null; };
  const help = spellingHelp(input, sugEl, 'country', () => queue[0], () => accept(), (text) => !!match(text));
  function count() { foundEl.textContent = done.size + ' / ' + sec.ids.length + ' borders'; }
  function draw() {
    const cur = queue[0];
    if (!cur) return;
    const c = BY_ID[cur];
    card.replaceChildren(
      h('div', { class: 'bcard-top' }, shapeSvg(cur, 'bshape'), h('div', null, h('p', { class: 'eyebrow' }, 'Countries bordering'), h('div', { class: 'big' }, c.name), h('p', { class: 'small muted' }, c.nb.length + (c.nb.length === 1 ? ' neighbour' : ' neighbours')))),
      h('div', { class: 'slots' }, c.nb.map((n) => { const got = done.has(cur + '>' + n); return h('span', { class: 'slot' + (got ? ' got' : '') }, got ? BY_ID[n].name : '?'); })));
  }
  function accept() {
    const n = match(input.value), cur = queue[0];
    if (!n) return;
    done.add(cur + '>' + n); res.found.push(cur + '>' + n);
    input.value = ''; help.clear(); count();
    if (!remaining(cur).length) {
      queue.shift();
      if (!queue.length) { ended = true; draw(); input.disabled = true; skipBtn.disabled = true; api.done(); return; }
    }
    draw(); input.focus({ preventScroll: true });
  }
  // Practice: show the neighbours you haven't named (they count as missed), then the next country.
  let showing = false;
  function showAnswer() {
    if (revealed || ended || showing || !queue[0]) return;
    showing = true;
    const cur = queue[0];
    card.querySelectorAll('.slot').forEach((el, k) => { const n = BY_ID[cur].nb[k]; if (!done.has(cur + '>' + n)) { el.classList.add('shown'); el.textContent = BY_ID[n].name; } });
    setTimeout(() => {
      showing = false; queue.shift(); input.value = ''; help.clear();
      if (!queue.length) { ended = true; input.disabled = true; skipBtn.disabled = true; api.done(); return; }
      draw(); input.focus({ preventScroll: true });
    }, 1400);
  }
  function skip() { if (revealed || ended || queue.length < 2) return; queue.push(queue.shift()); input.value = ''; help.clear(); draw(); input.focus({ preventScroll: true }); }
  input.addEventListener('input', () => { if (revealed || ended) return; if (match(input.value)) accept(); else help.update(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!revealed && !ended) { if (match(input.value)) accept(); else help.enter(); } } });
  count(); draw(); input.focus({ preventScroll: true });
  return {
    completed() { head.classList.add('all-done'); },
    reveal(btn) {
      revealed = true; input.disabled = true; skipBtn.disabled = true; help.clear();
      head.classList.add('gave-up');
      const left = sec.countries.filter((id) => remaining(id).length);
      card.replaceChildren(h('p', { class: 'eyebrow' }, 'Borders you missed (in red)'), h('ul', { class: 'pairs' }, left.map((id) => h('li', null, h('span', null, BY_ID[id].name), h('b', null, remaining(id).map((n) => BY_ID[n].name).join(', '))))));
      footer.hidden = false; footer.replaceChildren(btn);
      window.scrollTo(0, 0);
    },
  };
}

/* Bigger country: two countries; tap the one with more land area (areas from the world-countries data).
   A wrong pick shows the right one and counts as missed; either way both areas are shown for a moment (the
   clock is stopped while they're on screen). On a keyboard: 1 / 2 or ← / →. */
function duelGame(api) {
  const { sec, res } = api;
  let i = 0, busy = false, revealed = false;
  const foundEl = h('span', { class: 'found num' });
  const arena = h('div', { class: 'duel' });
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = boardHead(api, h('div', { class: 'progress' }, foundEl));
  mount(h('div', { class: 'app grid-run' }, head, arena, footer));
  const fmtArea = (a) => a.toLocaleString('en-US') + ' km²';
  function count() { foundEl.textContent = res.found.length + ' / ' + sec.ids.length + ' right · round ' + Math.min(i + 1, sec.ids.length); }
  function draw() {
    const [a, b] = sec.ids[i].split('|');
    arena.replaceChildren(h('p', { class: 'eyebrow center' }, 'Which is bigger?'), h('div', { class: 'duel-row' }, [a, b].map((id, k) => h('button', { class: 'duel-pick', 'data-id': id, onclick: () => pick(id) },
      h('span', { class: 'pic flagbox' }, h('img', { src: BY_ID[id].flag, alt: '', width: Math.round(BY_ID[id].ratio * 100), height: 100 })),
      h('b', null, BY_ID[id].name), h('small', { class: 'area' }, ''), h('span', { class: 'key' }, String(k + 1))))));
  }
  function pick(id) {
    if (busy || revealed || i >= sec.ids.length) return;
    busy = true; api.R.clock.pause();
    const key = sec.ids[i], win = duelWinner(key);
    if (id === win) res.found.push(key); else try { navigator.vibrate && navigator.vibrate(40); } catch (e) { /* no vibration */ }
    arena.querySelectorAll('.duel-pick').forEach((btn) => {
      const bid = btn.getAttribute('data-id');
      btn.classList.add(bid === win ? 'right' : bid === id ? 'wrong' : 'other');
      btn.querySelector('.area').textContent = fmtArea(BY_ID[bid].area);
    });
    count();
    setTimeout(() => {
      busy = false; api.R.clock.resume(); i++;
      if (i >= sec.ids.length) { api.done(); return; }
      count(); draw();
    }, id === win ? 700 : 1300);
  }
  const onKey = (e) => {
    if (busy || revealed || i >= sec.ids.length) return;
    const [a, b] = sec.ids[i].split('|');
    if (e.key === '1' || e.key === 'ArrowLeft') pick(a); else if (e.key === '2' || e.key === 'ArrowRight') pick(b);
  };
  document.addEventListener('keydown', onKey); cleanup.push(() => document.removeEventListener('keydown', onKey));
  count(); draw();
  return {
    completed() { head.classList.add('all-done'); },
    reveal(btn) {
      revealed = true; head.classList.add('gave-up');
      arena.replaceChildren(h('p', { class: 'eyebrow' }, 'Rounds left (bigger one first)'), h('ul', { class: 'pairs' }, sec.ids.slice(i).map((key) => { const w = duelWinner(key), l = key.split('|').find((x) => x !== w); return h('li', null, h('span', null, BY_ID[w].name + ' > ' + BY_ID[l].name), h('b', null, fmtArea(BY_ID[w].area))); })));
      footer.hidden = false; footer.replaceChildren(btn);
    },
  };
}

/* ---- results, challenges, leaderboard ---- */
function shareUrl(cfg, score) {
  const p = new URLSearchParams({ c: encodeCode(cfg).replace('-', ''), n: score.name, t: String(score.time), s: String(score.correct) });
  return location.origin + location.pathname + '?' + p.toString();
}
async function share(cfg, score) {
  const url = shareUrl(cfg, score);
  const text = score.name + ' ran Geography Speedrun (' + cfgLabel(cfg) + (S.session && S.session.help ? ', with spelling help' : '') + '): ' + score.correct + '/' + score.total + ' in ' + fmtTime(score.time) + '. Beat it! Code: ' + encodeCode(cfg);
  if (navigator.share) { try { await navigator.share({ title: 'Geography Speedrun challenge', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + '\n' + url); toast('Challenge link copied'); }
  catch (e) { prompt('Copy this link and send it:', url); }
}

// What you missed, per game.
function missedBoard(sec) {
  const G = gameOf(sec.game);
  const head = h('p', { class: 'eyebrow' }, G.em + ' ' + G.label + ' · ' + sec.found.length + '/' + sec.ids.length + (sec.skipped ? ' (not played)' : sec.gaveUp ? ' (gave up)' : ''));
  // Map: how many were right on the first tap.
  const first = (sec.game === 'map' || sec.game === 'flagmap') && sec.found.length ? sec.found.filter((id) => !(sec.tries && sec.tries[id])).length : null;
  const firstLine = first != null ? h('p', { class: 'small muted' }, '🎯 First tap right: ' + first + '/' + sec.ids.length + ' (' + Math.round(first / sec.ids.length * 100) + '%)') : null;
  if (!sec.missed.length) return h('div', { class: 'stack sm' }, head, firstLine, h('p', { class: 'small' }, h('span', { class: 'badge' }, 'All found 🎯')));
  let body;
  if (sec.game === 'flags' || sec.game === 'shapes') {
    body = h('div', { class: 'tiles small t-' + sec.game }, sec.missed.map((id) => h('div', { class: 'tile missed' }, tilePic(sec.game, id), h('span', { class: 'lbl' }, BY_ID[id].name))));
  } else if (sec.game === 'capitals') {
    body = h('ul', { class: 'pairs' }, sec.missed.map((id) => h('li', null, h('span', null, BY_ID[id].name), h('b', null, BY_ID[id].capital))));
  } else if (sec.game === 'revcap') {
    body = h('ul', { class: 'pairs' }, sec.missed.map((id) => h('li', null, h('span', null, BY_ID[id].capital), h('b', null, BY_ID[id].name))));
  } else if (sec.game === 'borders') {
    const by = {}; sec.missed.forEach((key) => { const [c, n] = key.split('>'); (by[c] = by[c] || []).push(BY_ID[n].name); });
    body = h('ul', { class: 'pairs' }, Object.entries(by).map(([c, ns]) => h('li', null, h('span', null, BY_ID[c].name), h('b', null, ns.join(', ')))));
  } else if (sec.game === 'duel') {
    body = h('ul', { class: 'pairs' }, sec.missed.map((key) => { const w = duelWinner(key), l = key.split('|').find((x) => x !== w); return h('li', null, h('span', null, BY_ID[w].name + ' > ' + BY_ID[l].name), h('b', null, BY_ID[w].area.toLocaleString('en-US') + ' km²')); }));
  } else {
    body = h('p', { class: 'namelist' }, sec.missed.map((id) => BY_ID[id].name).join(' · '));
  }
  return h('div', { class: 'stack sm' }, head, firstLine, body);
}
function missedQuick(score) {
  const miss = score.res.filter((x) => !x.ok);
  if (!miss.length) return h('p', { class: 'center' }, h('span', { class: 'badge' }, 'Perfect run! 🎯'));
  return [h('p', { class: 'eyebrow' }, 'Missed (' + miss.length + ')'), h('ul', { class: 'list' }, miss.map((x) => {
    const c = BY_ID[x.id];
    const pic = x.kind === 'flag' ? h('img', { class: 'mini', src: c.flag, alt: '' }) : x.kind === 'shape' ? shapeSvg(x.id, 'mini') : h('span', { class: 'mini', style: { background: 'none', fontSize: '24px', textAlign: 'center' } }, '🏛️');
    return h('li', null, pic, h('div', { class: 'q' }, answerText(x.id, x.kind), h('small', null, x.kind === 'capital' ? 'Capital of ' + c.name : x.kind === 'flag' ? 'Flag' : 'Outline')), h('span', { class: 'x' }, x.how === 'skip' ? 'SKIP +10s' : 'WRONG +5s'));
  }))];
}
function versus(score, ch, kind) {
  if (!ch || !ch.time) return null;
  const them = { time: ch.time, correct: ch.correct == null ? score.correct : ch.correct };
  const win = better(score, them, kind), lose = better(them, score, kind);
  let why = '';
  if (kind === 'board' && them.correct !== score.correct) why = ' (' + score.correct + ' vs ' + them.correct + ' found)';
  else why = ' by ' + fmtDiff(score.time - them.time);
  return h('p', { class: 'versus ' + (win ? 'win' : lose ? 'lose' : '') }, win ? 'You beat ' + ch.name + why + '! 🏆' : lose ? ch.name + ' wins' + why + '.' : 'Dead heat with ' + ch.name + '!');
}
function result(score) {
  const se = S.session, many = se.players.length > 1, last = se.idx >= se.players.length - 1, board = se.cfg.kind === 'board';
  mount(h('div', { class: 'app' },
    topbar(cfgLabel(se.cfg), null),
    h('div', { class: 'center stack', style: { gap: '6px' } },
      many ? h('p', { class: 'eyebrow' }, score.name) : null,
      h('div', { class: 'result-time' }, se.practice ? score.correct + '/' + score.total : fmtTime(score.time)),
      se.practice ? h('p', { class: 'small muted' }, '🧘 Practice') : null,
      score.best ? h('div', null, h('span', { class: 'badge' }, '★ New best on this device')) : null,
      se.help ? h('p', { class: 'small muted' }, '💡 With spelling help') : null,
      se.daily != null ? h('p', { class: 'small muted' }, '📅 Daily · ' + dayLabel(se.daily) + (score.dailyFirst ? '' : ' · replay')) : null),
    se.daily != null ? h('button', { class: 'btn gold small', onclick: () => shareDaily(se.daily, store.get('gs_daily_v1', {})[se.daily] || score) }, '📤 Share today\'s result') : null,
    versus(score, se.challenge, se.cfg.kind),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, score.correct + '/' + score.total), h('span', null, board ? 'Found' : 'Right')),
      board ? h('div', { class: 'stat' }, h('b', null, Math.round(score.correct / score.total * 100) + '%'), h('span', null, 'Score')) : h('div', { class: 'stat' }, h('b', null, fmtTime(score.raw)), h('span', null, 'Clock')),
      board ? h('div', { class: 'stat' }, h('b', null, String(score.sections.length)), h('span', null, score.sections.length > 1 ? 'Games' : 'Game')) : h('div', { class: 'stat' }, h('b', null, '+' + score.pen / 1000 + 's'), h('span', null, 'Penalty'))),
    many && !last ? h('button', { class: 'btn primary', onclick: () => { se.idx++; cover(); } }, 'Next: ' + se.players[se.idx + 1] + ' →') : null,
    many && last ? h('button', { class: 'btn primary', onclick: leaderboard }, '🏁 See who won') : null,
    !many && !se.practice ? h('div', { class: 'card sky' },
      h('p', { class: 'eyebrow' }, 'Challenge a friend'),
      h('div', { class: 'code num' }, encodeCode(se.cfg)),
      !S.myName && score.name === 'You' ? nameField() : null,
      h('button', { class: 'btn primary small', onclick: () => { if (score.name === 'You' && S.myName) score.name = S.myName; share(se.cfg, score); } }, '📤 Send challenge')) : null,
    h('div', { class: 'stack' }, board ? score.sections.map(missedBoard) : missedQuick(score)),
    !many ? afterButtons() : null,
  ));
}
function afterButtons() {
  const se = S.session;
  return h('div', { class: 'stack' },
    h('div', { class: 'row' },
      h('button', { class: 'btn primary small', onclick: () => startSession(Object.assign({}, se.cfg, { seed: newSeed() }), se.players, null, null, se.practice) }, '🎲 Play again'),
      h('button', { class: 'btn ghost small', onclick: () => startSession(se.cfg, se.players, se.challenge, se.daily, se.practice) }, '↻ Same order')),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost small', onclick: setup }, '⚙ Change'),
      h('button', { class: 'btn ghost small', onclick: home }, '⌂ Home')));
}
function leaderboard() {
  const se = S.session;
  const ranked = se.scores.slice().sort(compare(se.cfg.kind));
  const resultText = 'Geography Speedrun (' + cfgLabel(se.cfg) + ')\n' + ranked.map((s, i) => (i + 1) + '. ' + s.name + ' ' + s.correct + '/' + s.total + ' in ' + fmtTime(s.time)).join('\n') + '\nCode: ' + encodeCode(se.cfg);
  mount(h('div', { class: 'app' },
    topbar('Results', null),
    h('div', { class: 'center' }, h('p', { class: 'eyebrow' }, 'Winner'), h('h2', { class: 'display', style: { fontSize: '56px', color: 'var(--gold)' } }, ranked[0].name)),
    h('ul', { class: 'list board' }, ranked.map((s, i) => h('li', { class: i === 0 ? 'first' : null },
      h('span', { class: 'rank' }, String(i + 1)),
      h('div', { class: 'q' }, s.name, h('small', null, s.correct + '/' + s.total + (se.cfg.kind === 'board' ? ' found' : ' right · +' + s.pen / 1000 + 's penalty'))),
      h('div', { class: 't' }, fmtTime(s.time), i && s.correct === ranked[0].correct ? h('small', null, '+' + fmtDiff(s.time - ranked[0].time)) : null)))),
    h('button', { class: 'btn ghost small', onclick: async () => { try { await navigator.clipboard.writeText(resultText); toast('Results copied'); } catch (e) { prompt('Copy the results:', resultText); } } }, '📋 Copy results'),
    afterButtons()));
}

/* ---- start ---- */
home();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

})();
