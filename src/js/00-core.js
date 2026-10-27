/* ---- core: data, answer matching, runs, challenge codes (no DOM; tested by tests/run.js) ---- */
const DATA = window.GS_DATA.countries;
const BY_ID = Object.fromEntries(DATA.map((c) => [c.id, c]));

/* Two kinds of run:
   · board: the JetPunk / Seterra style. One or more games played back to back on one clock:
       flags / shapes / capitals = a grid of everything, pick a tile and type it; map = click the named country.
   · quick: one question at a time (type it or pick from 4), the original mode. */
const GAMES = [
  { id: 'flags', label: 'Flags', em: '🏳️', desc: 'Every flag on one board. Tap a flag, type the country.' },
  { id: 'map', label: 'Map', em: '🌍', desc: 'The whole map. Tap the country it asks for.' },
  { id: 'capitals', label: 'Capitals', em: '🏛️', desc: 'Every country in a box. Tap one, type its capital.' },
  { id: 'shapes', label: 'Shapes', em: '🗺️', desc: 'Every country outline on one board. Tap one, type the country.' },
  // "More games" (shown in a fold-out in setup). Keep this order: a game's position is part of the challenge code.
  { id: 'revcap', label: 'Reverse Capitals', em: '🔁', desc: 'Every capital in a box. Tap one, type its country.', more: true },
  { id: 'mapname', label: 'Map: name it', em: '🔦', desc: 'A country lights up on the map. Type its name.', more: true },
  { id: 'borders', label: 'Borders', em: '🧱', desc: 'Name every country that shares a land border with it.', more: true },
  { id: 'flagmap', label: 'Flag → Map', em: '📍', desc: 'See a flag, tap that country on the map.', more: true },
  { id: 'duel', label: 'Bigger country', em: '⚖️', desc: 'Two countries: tap the one with more land area.', more: true },
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
    const ids = pool(cfg.region);
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
  if (cfg.kind === 'board') return cfg.games.map((g) => gameOf(g).label).join(' + ') + ' · ' + regionLabel(cfg.region);
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

/* ---------------- daily run ---------------- */
// The same run for everyone on the same (UTC) day: a continent (they take turns) and two games, in an order
// picked from the date. Day numbers count days since 1 Jan 1970 (UTC).
const DAILY_REGIONS = ['Europe', 'Africa', 'Asia', 'North America', 'South America', 'Oceania'];
const DAILY_GAMES = ['flags', 'map', 'capitals', 'shapes', 'revcap', 'flagmap'];
const todayNum = () => Math.floor(Date.now() / 86400000);
function dailyCfg(day) {
  const r = rng((day * 2654435761) >>> 0);
  return { kind: 'board', games: shuffle(DAILY_GAMES, r).slice(0, 2), region: DAILY_REGIONS[day % DAILY_REGIONS.length], seed: Math.floor(r() * SEED_MAX) };
}
const dayLabel = (day) => new Date(day * 86400000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

window.GS = { dailyCfg, duelWinner, GAMES, suggest, editDistance, norm, isRight, answersFor, makeRun, makeBoard, encodeCode, decodeCode, fmtTime, pool, rng, better, compare, GAME_ORDERS, cfgLabel, DATA };
if (window.GS_NO_UI) return;
