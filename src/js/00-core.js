/* ---- core: data, answer matching, runs, challenge codes (no DOM; tested by tests/run.js) ---- */
const DATA = window.GS_DATA.countries;
const BY_ID = Object.fromEntries(DATA.map((c) => [c.id, c]));
// Guess the language data (src/langs.js, from tools/langs.mjs). It's big (~12 sentences × 116 languages), so the
// page loads it only when a run needs it (needLangs in 20-session); langsReady() picks it up once it's there.
let LANGS = [], LANG_BY = {};
function langsReady() {
  if (!LANGS.length && window.GS_LANGS) { LANGS = window.GS_LANGS; LANG_BY = Object.fromEntries(LANGS.map((l) => [l.k, l])); }
  return LANGS.length > 0;
}
langsReady();
const usesLangs = (cfg) => !!(cfg && cfg.kind === 'board' && cfg.games.includes('lang'));
const langOf = (id) => LANG_BY[id.split('~')[0]];
// Typed answers for a language: its name, the parts of "Chinese (Mandarin)", and other names people use.
function langAnswer(k, typed) {
  const l = LANG_BY[k], t = norm(typed);
  if (!t) return false;
  const names = [l.name, l.name.replace(/\s*\(.*\)/, ''), ...((/\((.*)\)/.exec(l.name) || [])[1] ? [/\((.*)\)/.exec(l.name)[1]] : []), ...(l.alt || [])];
  return names.some((n) => norm(n) === t);
}
// A round id is "ara~3": the language and which of its sentences (a random one each round).
const langText = (id) => { const [k, n] = id.split('~'); return LANG_BY[k].texts[+n || 0]; };

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
  { id: 'lang', label: 'Guess the language', em: '🗣️', desc: 'Name the language', more: true },
  // Added Oct 2026 (indexes 11+ need the wider "+V" codes).
  { id: 'chain', label: 'Border chain', em: '🔗', desc: 'Neighbour to neighbour, A → B', more: true },
  { id: 'all', label: 'Name them all', em: '📝', desc: 'Type every country you know', more: true },
  { id: 'hot', label: 'Hot or cold', em: '🔥', desc: 'Find the mystery country', more: true },
  { id: 'closer', label: 'Closer or further', em: '📏', desc: 'Which is closer?', more: true },
  { id: 'clues', label: 'Clue reveal', em: '🕵️', desc: 'Guess from clues', more: true },
  { id: 'letter', label: 'Letter rush', em: '🔤', desc: 'Countries starting with…', more: true },
  { id: 'scramble', label: 'Unscramble', em: '🔀', desc: 'Unjumble the name', more: true },
  { id: 'currency', label: 'Currency & people', em: '💰', desc: 'Kwacha? Malagasy?', more: true, retired: true }, // removed (owner); kept so old codes keep their places
  { id: 'flagpick', label: 'Flag finder', em: '🔎', desc: 'Name → find its flag', more: true },
];
// Setup groups the games in tabs (a game can be in more than one).
const GAME_CATS = [
  { id: 'classic', label: 'Classic', games: ['flags', 'map', 'capitals', 'shapes'] },
  { id: 'maps', label: 'Map', games: ['map', 'mapname', 'flagmap', 'all', 'borders', 'chain'] },
  { id: 'flags', label: 'Flags', games: ['flags', 'flagpick', 'flagmap'] },
  { id: 'words', label: 'Words', games: ['capitals', 'revcap', 'scramble', 'letter', 'lang'] },
  { id: 'puzzles', label: 'Puzzles', games: ['clues', 'hot', 'closer', 'duel', 'chain'] },
];
// Per-game "how many" (setup): country games take a number of countries (normal = all of the run's); the others a
// number of rounds/puzzles/letters (normal = def). opts = the choices offered.
// Normal timers: Letter rush 12 s per letter, Unscramble 15 s per name (both can be changed in setup).
const LETTER_SEC = 12, SCRAMBLE_SEC = 15;
const COUNTRY_COUNT_GAMES = ['flags', 'map', 'capitals', 'shapes', 'revcap', 'mapname', 'flagmap', 'all', 'flagpick'];
const GAME_COUNTS = {
  borders: { def: 0, opts: [5, 10, 20, 30], unit: 'countries' },
  duel: { def: 20, opts: [5, 10, 20, 30], unit: 'rounds' }, lang: { def: 20, opts: [5, 10, 20, 30], unit: 'rounds' },
  closer: { def: 1, opts: [5, 10, 20, 30], unit: 'rounds' }, chain: { def: 1, opts: [1, 2, 3, 5, 8, 10], unit: 'puzzles' },
  hot: { def: 1, opts: [1, 2, 3, 5, 8], unit: 'countries' }, clues: { def: 1, opts: [3, 5, 10, 15, 20], unit: 'countries' },
  letter: { def: 1, opts: [1, 3, 5, 8, 10], unit: 'letters' }, scramble: { def: 1, opts: [5, 10, 15, 20, 30], unit: 'names' },
};
COUNTRY_COUNT_GAMES.forEach((g) => { GAME_COUNTS[g] = { def: 0, opts: [5, 10, 15, 20, 30, 50], unit: 'countries' }; });
const MAP_GAMES = new Set(['map', 'mapname', 'flagmap', 'all']);
// Games that draw the world map (the map file is loaded before they start).
const NEEDS_MAP = new Set(['map', 'mapname', 'flagmap', 'all', 'chain']);
const MODES = [
  { id: 'flags', label: 'Flags', em: '🏳️' },
  { id: 'shapes', label: 'Shapes', em: '🗺️' },
  { id: 'capitals', label: 'Capitals', em: '🏛️' },
  { id: 'mix', label: 'Mix', em: '🔀' },
  // Added Oct 2026 (index 4+ → "+M4" after the code, the base code says flags).
  { id: 'revcap', label: 'Capital → country', em: '🔁' },
  { id: 'scramble', label: 'Unscramble', em: '🧩' },
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
const kindOfGame = (g) => g === 'capitals' ? 'capital' : g === 'shapes' ? 'shape' : g === 'all' ? 'country' : MAP_GAMES.has(g) ? 'map'
  : ['revcap', 'borders', 'hot', 'clues', 'letter', 'scramble', 'currency'].includes(g) ? 'country' : ['duel', 'lang', 'chain', 'closer'].includes(g) ? g : 'flag';

/* ---------------- seeded random ---------------- */
function rng(seed) {
  let a = seed >>> 0;
  return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const pool = (region) => DATA.filter((c) => region === 'world' || c.region === region).map((c) => c.id).sort();
// The countries in a run: one continent or the world (cfg.region), several continents (cfg.regions), and
// optionally only N of them picked at random from those (cfg.limit — "Mixed"). Each game in a run gets its own N
// (game = its position), so you can't carry the same countries from one game to the next; same seed = same picks.
const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
function cfgPool(cfg, game) {
  let ids = cfg.regions && cfg.regions.length ? DATA.filter((c) => cfg.regions.includes(c.region)).map((c) => c.id).sort() : pool(cfg.region);
  if (cfg.limit && cfg.limit < ids.length && game != null) ids = shuffle(ids, rng((cfg.seed * 2654435761 + 97 + game * 7907) >>> 0)).slice(0, cfg.limit).sort();
  return ids;
}
const byName = (ids) => ids.slice().sort((a, b) => BY_ID[a].name.localeCompare(BY_ID[b].name));

// Quick fire: the questions for a config. Same config + seed → same run (that's what makes challenges fair).
function makeRun(cfg) {
  const r = rng(cfg.seed);
  const ids = shuffle(cfgPool(cfg), r).slice(0, cfg.count);
  return ids.map((id) => {
    const kind = cfg.mode === 'mix' ? KINDS[Math.floor(r() * 3)] : cfg.mode === 'flags' ? 'flag' : cfg.mode === 'shapes' ? 'shape' : cfg.mode === 'revcap' ? 'revcap' : cfg.mode === 'scramble' ? 'scramble' : 'capital';
    const q = { id, kind };
    if (kind === 'scramble') q.scr = scrambleName(BY_ID[id].name, r);
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
    const ids = cfg.custom && cfg.custom[g] ? cfg.custom[g].slice().sort() : cfgPool(cfg, i);
    const sec = { game: g, kind: kindOfGame(g), ids: shuffle(ids, r) };
    // How many questions this game has (setup's per-game number, cfg.counts[game]); 0/none = the normal amount.
    const want = cfg.counts && cfg.counts[g] > 0 ? cfg.counts[g] : 0;
    const N = (normal) => want || normal;
    if (want && COUNTRY_COUNT_GAMES.includes(g)) sec.ids = sec.ids.slice(0, want);
    if (g === 'borders') {
      // Countries with at least one land neighbour in the game; each neighbour is one answer ("de>fr").
      sec.countries = sec.ids.filter((id) => BY_ID[id].nb.length);
      if (want) sec.countries = sec.countries.slice(0, want);
      sec.ids = sec.countries.flatMap((id) => BY_ID[id].nb.map((n) => id + '>' + n));
    } else if (g === 'duel') {
      // Up to 20 pairs of similar size (owner): 10–35% apart when possible (never less than 10%, so there's a clear answer).
      const left = sec.ids.slice(), pairs = [], gap = (a, b) => Math.abs(BY_ID[a].area - BY_ID[b].area) / Math.max(BY_ID[a].area, BY_ID[b].area);
      while (left.length > 1 && pairs.length < N(20)) {
        const a = left.shift();
        let j = left.findIndex((b) => gap(a, b) > 0.1 && gap(a, b) < 0.35);
        if (j < 0) j = left.findIndex((b) => gap(a, b) > 0.1);
        if (j < 0) continue;
        const [b] = left.splice(j, 1);
        pairs.push(r() < 0.5 ? a + '|' + b : b + '|' + a);
      }
      sec.ids = pairs;
    } else if (g === 'chain') {
      // 5 puzzles "a~b": two countries joined by land, 2–5 countries apart on the shortest route.
      sec.ids = chainPuzzles(sec.ids, r, N(1));
    } else if (g === 'hot') {
      sec.ids = sec.ids.slice(0, N(1)); // 1 mystery country unless set (unlimited guesses)
    } else if (g === 'closer') {
      // Up to 20 "t|a|b": which of a, b is closer to t?
      const from = sec.ids.length >= 8 ? sec.ids : shuffle(DATA.map((c) => c.id).sort(), r), rounds = [];
      for (let k = 0; k < 400 && rounds.length < N(1); k++) {
        const [t, a, b] = shuffle(from, r).slice(0, 3);
        const da = km(t, a), db = km(t, b);
        // Harder (owner): the two are close in distance — 7–22% apart — so you have to think, but there's still a clear answer.
        const gap = Math.abs(da - db) / Math.max(da, db);
        if (gap > 0.07 && gap < (k < 300 ? 0.22 : 0.5) && !rounds.some((x) => x.startsWith(t + '|'))) rounds.push(t + '|' + a + '|' + b);
      }
      sec.ids = rounds;
    } else if (g === 'clues') {
      sec.ids = sec.ids.slice(0, N(1));
    } else if (g === 'scramble') {
      sec.ids = sec.ids.slice(0, N(1));
      sec.scr = {}; sec.ids.forEach((id) => { sec.scr[id] = scrambleName(BY_ID[id].name, r); });
    } else if (g === 'currency') {
      // Up to 15 rounds: a currency or a demonym that belongs to only one country in the game ("id~c" / "id~d").
      const keys = [];
      sec.ids.forEach((id) => {
        const c = BY_ID[id], cur = c.cur.filter((x) => CURRENCY_COUNT[x] === 1), dem = c.dem && DEMONYM_COUNT[c.dem] === 1 && norm(c.dem) !== norm(c.name);
        const opts = (cur.length ? ['c'] : []).concat(dem ? ['d'] : []);
        if (opts.length) keys.push(id + '~' + opts[Math.floor(r() * opts.length)]);
      });
      sec.ids = keys.slice(0, 15);
    } else if (g === 'letter') {
      // Letters that start a country of the run (and at least 3 in the world); every country in the game starting
      // with it counts (owner: spam any of them, not just the region's). Name as many as you can before time's up.
      const by = {}, here = new Set();
      DATA.forEach((c) => { const L = norm(c.name)[0].toUpperCase(); (by[L] = by[L] || []).push(c.id); });
      sec.ids.forEach((id) => here.add(norm(BY_ID[id].name)[0].toUpperCase()));
      let letters = [...here].filter((L) => by[L].length >= 3).sort();
      if (!letters.length) letters = [...here].sort();
      sec.letters = shuffle(letters, r).slice(0, N(1)).map((L) => ({ L, ids: by[L].slice().sort() }));
      sec.ids = sec.letters.flatMap((x) => x.ids);
    } else if (g === 'flagpick') {
      sec.grid = shuffle(sec.ids, r); // the flags in the order they're laid out
    } else if (g === 'lang') {
      // Up to 20 official languages of the region's countries; 4 options each (see langOptions).
      const here = new Set(cfgPool(cfg, i));
      // A region with under 10 languages (the Americas) also gets their other sentences, up to 10 rounds.
      const langs = LANGS.filter((l) => l.countries.some((c) => here.has(c)));
      // Each language once, with one of its sentences picked at random (so you can't learn "this sentence = X").
      let ids = shuffle(langs.map((l) => l.k), r).slice(0, N(20)).map((k) => k + '~' + Math.floor(r() * LANG_BY[k].texts.length));
      if (ids.length < Math.min(10, N(20))) ids = ids.concat(shuffle(langs.flatMap((l) => l.texts.map((t, n) => l.k + '~' + n)).filter((id) => !ids.includes(id)), r).slice(0, Math.min(10, N(20)) - ids.length));
      sec.ids = shuffle(ids, r);
      sec.opts = {};
      sec.ids.forEach((id) => { sec.opts[id] = langOptions(id.split('~')[0], here, r); });
    }
    return sec;
  });
}
// Guess the language: the right one + 3 wrong ones. Wrong ones in the same writing when possible (Arabic vs Persian vs
// Urdu, not Arabic vs French), up to 2 of the region's languages first; never one that's almost the same language (`close`).
function langOptions(k, here, r) {
  const L = LANG_BY[k], bad = new Set([k].concat(L.close || []));
  const ok = LANGS.filter((x) => !bad.has(x.k));
  // "Near" = spoken in the run's region and on the same continent as the answer (so Latin gets Italian or Romanian
  // rather than Zulu on a World run).
  const conts = new Set(L.countries.map((c) => BY_ID[c].region));
  const near = (x) => x.countries.some((c) => here.has(c) && conts.has(BY_ID[c].region));
  const tiers = [shuffle(ok.filter((x) => x.script === L.script && near(x)), r).slice(0, 2), ok.filter((x) => x.script === L.script),
    L.script === 'Latin' ? [] : ok.filter((x) => x.script !== 'Latin' && x.script !== L.script), ok];
  const out = [];
  tiers.forEach((t) => shuffle(t.map((x) => x.k), r).forEach((x) => { if (out.length < 3 && !out.includes(x) && !out.some((o) => (LANG_BY[o].close || []).includes(x))) out.push(x); }));
  return shuffle([k].concat(out), r);
}
/* ---------------- geography helpers for the newer games ---------------- */
// Distance (km) between two countries' centre points, and the compass direction from one to the other.
function km(a, b) {
  const [la1, lo1] = BY_ID[a].ll, [la2, lo2] = BY_ID[b].ll, R = Math.PI / 180;
  const h = Math.sin((la2 - la1) * R / 2) ** 2 + Math.cos(la1 * R) * Math.cos(la2 * R) * Math.sin((lo2 - lo1) * R / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}
function bearing(a, b) { // degrees clockwise from north, from a towards b
  const [la1, lo1] = BY_ID[a].ll, [la2, lo2] = BY_ID[b].ll, R = Math.PI / 180;
  const y = Math.sin((lo2 - lo1) * R) * Math.cos(la2 * R), x = Math.cos(la1 * R) * Math.sin(la2 * R) - Math.sin(la1 * R) * Math.cos(la2 * R) * Math.cos((lo2 - lo1) * R);
  return (Math.atan2(y, x) / R + 360) % 360;
}
const closerOf = (key) => { const [t, a, b] = key.split('|'); return km(t, a) < km(t, b) ? a : b; };
// Land-border steps between countries (breadth-first over the game's two-way borders). hops(a)[b] = steps.
const HOPS = {};
function hops(a) {
  if (HOPS[a]) return HOPS[a];
  const d = { [a]: 0 }, q = [a];
  while (q.length) { const x = q.shift(); BY_ID[x].nb.forEach((n) => { if (d[n] == null) { d[n] = d[x] + 1; q.push(n); } }); }
  return (HOPS[a] = d);
}
// One shortest route a → b (list of countries, a and b included), or null.
function shortestRoute(a, b) {
  const db = hops(b); if (db[a] == null) return null;
  const route = [a];
  while (route[route.length - 1] !== b) { const x = route[route.length - 1]; route.push(BY_ID[x].nb.filter((n) => db[n] === db[x] - 1).sort()[0]); }
  return route;
}
// Border chain puzzles: start in the run's countries; the end 3–6 steps away (in the run's countries if possible).
function chainPuzzles(pool, r, n) {
  const inPool = new Set(pool), out = [];
  const starts = shuffle(pool.filter((id) => BY_ID[id].nb.length), r);
  const tryFrom = (list, near) => {
    for (const a of list) {
      if (out.length >= n || out.some((k) => k.startsWith(a + '~'))) continue;
      const d = hops(a), far = Object.keys(d).filter((b) => d[b] >= 3 && d[b] <= 6 && (!near || inPool.has(b))).sort();
      if (far.length) out.push(a + '~' + far[Math.floor(r() * far.length)]);
    }
  };
  tryFrom(starts, true); tryFrom(starts, false);
  if (out.length < n) tryFrom(shuffle(DATA.filter((c) => c.nb.length).map((c) => c.id).sort(), r), false); // islands only: anywhere
  return out.slice(0, n);
}
// Mix up a name's letters (word by word, so "United Kingdom" stays two words); never the name itself.
function scrambleName(name, r) {
  const words = name.toUpperCase().split(' ');
  for (let k = 0; k < 20; k++) {
    const out = words.map((w) => (w.length < 2 ? w : shuffle(w.split(''), r).join(''))).join(' ');
    if (norm(out) !== norm(name)) return out;
  }
  return words.map((w) => w.split('').reverse().join('')).join(' ');
}
// How many countries in the game use each currency / demonym (Currency & people only asks about unique ones).
const CURRENCY_COUNT = {}, DEMONYM_COUNT = {};
DATA.forEach((c) => { c.cur.forEach((x) => { CURRENCY_COUNT[x] = (CURRENCY_COUNT[x] || 0) + 1; }); if (c.dem) DEMONYM_COUNT[c.dem] = (DEMONYM_COUNT[c.dem] || 0) + 1; });
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
  let m = MODES.findIndex((x) => x.id === cfg.mode); const s = STYLES.findIndex((x) => x.id === cfg.style);
  if (m > 3) m = 0; // newer modes go after the "+" (M4, M5)
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
// w = bits per game: 4 (games 0–15) or 5 for runs with the newer games (marked "+V" after the code).
function encodeLong(cfg, w) {
  w = w || 4;
  const n = cfg.games.length, seed = BigInt(cfg.seed % SEED_MAX), bits = w * n + 3;
  let p = 0n;
  cfg.games.forEach((g) => { p = (p << BigInt(w)) | BigInt(GAMES.findIndex((x) => x.id === g)); });
  p = (p << 3n) | BigInt(REGIONS.findIndex((x) => x.id === cfg.region));
  const top = (BigInt(n - 1) << BigInt(bits)) | (p ^ scrambleBits(cfg.seed % SEED_MAX, bits));
  let v = (top << 27n) | (seed << 6n) | check6(p, cfg.seed % SEED_MAX);
  let out = '';
  while (v > 0n) { out = B32[Number(v % 32n)] + out; v /= 32n; }
  return group(out.padStart(10, '0'));
}
function decodeLong(t, w) {
  w = w || 4;
  let v = 0n;
  for (const ch of t) { const i = B32.indexOf(ch); if (i < 0) return null; v = v * 32n + BigInt(i); }
  const check = v & 63n, seed = Number((v >> 6n) & BigInt(SEED_MAX - 1)), top = v >> 27n;
  for (let n = 1; n <= GAMES.length; n++) {
    const bits = w * n + 3;
    if ((top >> BigInt(bits)) !== BigInt(n - 1)) continue;
    const p = (top & ((1n << BigInt(bits)) - 1n)) ^ scrambleBits(seed, bits);
    if (check6(p, seed) !== check) continue;
    const g = Number(p & 7n), games = [];
    for (let i = n - 1; i >= 0; i--) games.push(Number((p >> BigInt(3 + w * i)) & BigInt((1 << w) - 1)));
    if (!REGIONS[g] || games.some((x) => !GAMES[x]) || new Set(games).size !== n) return null;
    return { kind: 'board', games: games.map((x) => GAMES[x].id), region: REGIONS[g].id, seed };
  }
  return null;
}
// Run options that change how a game plays (part of the code, after a "+": N = map with no borders,
// T = type the language instead of picking it). Only kept when the run has a game they apply to.
// One shot (cfg.strict, E in codes): answers only go in with Enter, and a wrong one is missed — for games you type in.
const TYPING_GAMES = ['flags', 'shapes', 'capitals', 'revcap', 'mapname', 'borders', 'scramble', 'currency'];
const hasTypingGame = (cfg) => cfg.kind === 'board' && (cfg.games.some((g) => TYPING_GAMES.includes(g)) || (cfg.games.includes('lang') && !!cfg.langType));
const hasMapGame = (cfg) => cfg.kind === 'board' && cfg.games.some((g) => MAP_GAMES.has(g));
function withOpts(cfg, o) {
  if (o && o.hard && hasMapGame(cfg)) cfg.hard = true; else delete cfg.hard;
  if (o && o.langType && cfg.kind === 'board' && cfg.games.includes('lang')) cfg.langType = true; else delete cfg.langType;
  if (o && o.strict && hasTypingGame(cfg)) cfg.strict = true; else delete cfg.strict;
  if (o && o.allMap && hasMapGame(cfg)) cfg.allMap = true; else delete cfg.allMap;
  // Timers (seconds) for Letter rush and Unscramble, when set to something other than normal.
  const secs = (v, def) => { const n = Math.round(+v || 0); return n >= 3 && n <= 120 && n !== def ? n : 0; };
  if (cfg.kind === 'board' && cfg.games.includes('letter') && o && secs(o.lrSec, LETTER_SEC)) cfg.lrSec = secs(o.lrSec, LETTER_SEC); else delete cfg.lrSec;
  if (cfg.kind === 'board' && cfg.games.includes('scramble') && o && secs(o.scSec, SCRAMBLE_SEC)) cfg.scSec = secs(o.scSec, SCRAMBLE_SEC); else delete cfg.scSec;
  // Per-game numbers, only for games in the run (and only real ones).
  const counts = {};
  if (cfg.kind === 'board' && o && o.counts) cfg.games.forEach((g) => { const n = Math.floor(+o.counts[g] || 0); if (n > 0 && n < 1000) counts[g] = n; });
  if (Object.keys(counts).length) cfg.counts = counts; else delete cfg.counts;
  return cfg;
}
// Where (after the "+" too): R<mask> = several continents (bit i = CONTINENTS[i]), C<n> = n random countries.
const regionMask = (cfg) => (cfg.regions || []).reduce((m, r) => m | (1 << CONTINENTS.indexOf(r)), 0);
const optLetters = (cfg) => (cfg.hard ? 'N' : '') + (cfg.langType ? 'T' : '') + (cfg.strict ? 'E' : '') + (cfg.allMap ? 'A' : '') + (cfg.regions && cfg.regions.length ? 'R' + regionMask(cfg) : '') + (cfg.limit ? 'C' + cfg.limit : '') + (cfg.counts ? 'Q' + cfg.games.map((g) => cfg.counts[g] || 0).join('.') : '') + (cfg.lrSec ? 'L' + cfg.lrSec : '') + (cfg.scSec ? 'U' + cfg.scSec : '') + (cfg.kind === 'quick' && MODES.findIndex((x) => x.id === cfg.mode) > 3 ? 'M' + MODES.findIndex((x) => x.id === cfg.mode) : '');
// Several continents / a random number: tidy into the canonical form (1 continent → region; all 6 → world).
function withWhere(cfg, regions, limit) {
  delete cfg.regions; delete cfg.limit;
  const rs = CONTINENTS.filter((r) => (regions || []).includes(r));
  if (rs.length === 1) cfg.region = rs[0];
  else if (rs.length > 1 && rs.length < 6) { cfg.region = 'world'; cfg.regions = rs; }
  else if (rs.length === 6) cfg.region = 'world';
  const n = Math.floor(+limit || 0);
  if (n >= 1 && n < cfgPool(cfg).length) cfg.limit = n;
  return cfg;
}
const wideCode = (cfg) => cfg.kind === 'board' && cfg.games.some((g) => GAMES.findIndex((x) => x.id === g) >= 15);
function encodeCode(cfg) {
  const f = optLetters(cfg) + (wideCode(cfg) ? 'V' : '');
  return (wideCode(cfg) ? encodeLong(cfg, 5) : encodeBase(cfg)) + (f ? '+' + f : '');
}
function encodeBase(cfg) {
  if (cfg.kind === 'board' && cfg.games.some((g) => GAMES.findIndex((x) => x.id === g) >= 4)) return encodeLong(cfg);
  const seed = cfg.seed % SEED_MAX, k = cfgBits(cfg);
  let v = ((k ^ scramble(seed)) * SEED_MAX + seed) * 16 + checkOf(k, seed);
  let out = '';
  for (let i = 0; i < 8; i++) { out = B32[v % 32] + out; v = Math.floor(v / 32); }
  return out.slice(0, 4) + '-' + out.slice(4);
}
function decodeCode(text) {
  const [main, flags] = String(text || '').split('+');
  const f = String(flags || '').toUpperCase();
  const cfg = /V/.test(f) ? decodeLong(String(main || '').toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0').replace(/[^0-9A-Z]/g, ''), 5) : decodeBase(main);
  if (!cfg) return null;
  const mask = /R(\d+)/.exec(f), lim = /C(\d+)/.exec(f);
  if (mask || lim) {
    if (cfg.region !== 'world' && mask) return null;
    withWhere(cfg, mask ? CONTINENTS.filter((r, i) => +mask[1] & (1 << i)) : [], lim ? +lim[1] : 0);
    if (cfg.kind === 'quick' && cfg.count > cfgPool(cfg).length) return null;
  }
  const mm = /M(\d)/.exec(f);
  if (mm && cfg.kind === 'quick' && MODES[+mm[1]]) cfg.mode = MODES[+mm[1]].id;
  const q = /Q([\d.]+)/.exec(f), counts = {};
  if (q) q[1].split('.').forEach((n, k) => { if (cfg.games && cfg.games[k] && +n > 0) counts[cfg.games[k]] = +n; });
  return withOpts(cfg, { hard: /N/.test(f), langType: /T/.test(f), strict: /E/.test(f), allMap: /A/.test(f), counts, lrSec: (/L(\d+)/.exec(f) || [])[1], scSec: (/U(\d+)/.exec(f) || [])[1] });
}
function decodeBase(text) {
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
// "Africa + Asia", "Mixed 30", "Europe · 20 random"…
function whereLabel(cfg) {
  const base = cfg.regions && cfg.regions.length ? cfg.regions.map(regionLabel).join(' + ') : regionLabel(cfg.region);
  if (!cfg.limit) return base;
  return cfg.region === 'world' && !(cfg.regions && cfg.regions.length) ? 'Mixed ' + cfg.limit : base + ' · ' + cfg.limit + ' random';
}
function cfgTotal(cfg) { return cfg.kind === 'board' ? makeBoard(cfg).reduce((n, sec) => n + sec.ids.length, 0) : cfg.count; }
function cfgLabel(cfg) {
  if (cfg.kind === 'board') return cfg.games.map((g) => gameOf(g).label + (cfg.counts && cfg.counts[g] ? ' ×' + cfg.counts[g] : '')).join(' + ') + ' · ' + (cfg.custom ? 'My misses' : whereLabel(cfg)) + (cfg.hard ? ' · No borders' : '') + (cfg.langType ? ' · Typed' : '') + (cfg.strict ? ' · One shot' : '') + (cfg.allMap ? ' · All countries' : '') + (cfg.lrSec ? ' · Letters ' + cfg.lrSec + 's' : '') + (cfg.scSec ? ' · Unscramble ' + cfg.scSec + 's' : '') + (cfg.help ? ' · Spelling help' : '');
  return [modeOf(cfg.mode).label, whereLabel(cfg), cfg.count === cfgPool(cfg).length ? 'All ' + cfg.count : String(cfg.count), styleOf(cfg.style).label].join(' · ') + ' · Quick';
}
const bestKey = (cfg) => cfg.kind === 'board' ? ['b', cfg.games.join('+'), cfg.region].join('|') + (optLetters(cfg) ? '|' + optLetters(cfg) : '') : [cfg.mode, cfg.region, cfg.count, cfg.style].join('|') + (optLetters(cfg) ? '|' + optLetters(cfg) : '');
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
const MISS_GAMES = ['flags', 'shapes', 'capitals', 'revcap', 'map', 'mapname', 'flagmap', 'flagpick', 'scramble'];
const QUICK_GAME = { flag: 'flags', shape: 'shapes', capital: 'capitals', revcap: 'revcap', scramble: 'scramble' };
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
// Guess the language joins the daily games from 29 Oct 2026 (so days already played keep their run).
const LANG_DAILY_FROM = Date.UTC(2026, 9, 29) / 86400000;
function dailyCfg(day) {
  const r = rng((day * 2654435761) >>> 0);
  return { kind: 'board', games: shuffle(day >= LANG_DAILY_FROM ? DAILY_GAMES.concat(['lang']) : DAILY_GAMES, r).slice(0, 2), region: DAILY_REGIONS[day % DAILY_REGIONS.length], seed: Math.floor(r() * SEED_MAX) };
}
const dayLabel = (day) => new Date(day * 86400000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

window.GS = { LETTER_SEC, SCRAMBLE_SEC, GAME_COUNTS, COUNTRY_COUNT_GAMES, km, bearing, closerOf, hops, shortestRoute, CURRENCY_COUNT, DEMONYM_COUNT, GAME_CATS, NEEDS_MAP, withWhere, cfgPool, whereLabel, CONTINENTS, withOpts, langAnswer, langsReady, langOf, langText, recordMisses, topMisses, todayNum, dailyCfg, duelWinner, GAMES, suggest, editDistance, norm, isRight, answersFor, makeRun, makeBoard, encodeCode, decodeCode, fmtTime, pool, rng, better, compare, GAME_ORDERS, cfgLabel, DATA };
Object.defineProperty(window.GS, 'LANGS', { get: () => (langsReady(), LANGS) });
Object.defineProperty(window.GS, 'LANG_BY', { get: () => (langsReady(), LANG_BY) });
if (window.GS_NO_UI) return;
