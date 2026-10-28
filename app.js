/* Geography Speedrun 2f6799b5bf — built from src/js/ by build.js. Edit src/, not this file. */
(function () {
'use strict';
const APP_VERSION = "2f6799b5bf";
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
// Usual timers: Letter rush 12 s per letter, Unscramble 15 s per name (both can be changed in setup).
const LETTER_SEC = 12, SCRAMBLE_SEC = 15;
// ⏳ Countdown style (cfg.countdown): each game gets a time limit instead of a stopwatch — how much can you get
// done? Suggested seconds per question below (× the game's number of questions, rounded up to 10 s); each game's
// limit can be changed in setup (cfg.limits[game] = seconds).
const PER_Q_SEC = { flags: 5, map: 6, capitals: 6, shapes: 6, revcap: 6, mapname: 6, borders: 12, flagmap: 6, duel: 4, lang: 6, chain: 60, all: 5, hot: 90, closer: 5, clues: 40, flagpick: 5, scramble: 0, letter: 0 };
function suggestedLimit(cfg, g, units) {
  const per = g === 'letter' ? (cfg.lrSec || LETTER_SEC) + 3 : g === 'scramble' ? (cfg.scSec || SCRAMBLE_SEC) + 2 : PER_Q_SEC[g] || 6;
  return Math.max(20, Math.ceil(per * Math.max(1, units) / 10) * 10);
}
const secUnits = (sec) => (sec.letters ? sec.letters.length : sec.game === 'borders' ? (sec.countries || []).length : sec.ids.length);
const timeLimit = (cfg, sec) => (cfg.limits && cfg.limits[sec.game] > 0 ? cfg.limits[sec.game] : suggestedLimit(cfg, sec.game, secUnits(sec)));
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
    // Round games (Bigger country, Guess the language, Border chain…): with Mixed N they pick from the whole
    // pool and play N rounds (owner: Mixed 1 = 1 question in every game); country games use their N countries.
    const roundGame = !COUNTRY_COUNT_GAMES.includes(g) && g !== 'borders';
    const ids = cfg.custom && cfg.custom[g] ? cfg.custom[g].slice().sort() : roundGame && cfg.limit ? cfgPool(cfg) : cfgPool(cfg, i);
    const sec = { game: g, kind: kindOfGame(g), ids: shuffle(ids, r) };
    // How many questions this game has (setup's per-game number, cfg.counts[game]); none = the usual amount.
    const want = cfg.counts && cfg.counts[g] > 0 ? cfg.counts[g] : 0;
    const N = (usual) => want || (roundGame && cfg.limit ? cfg.limit : usual);
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
      // Every country of the chosen region(s) starting with the letter counts — a continent = that continent's,
      // Mixed = the whole world (not just the random N, owner). cfgPool without a game index ignores Mixed's N.
      // Letters with at least 2 countries if possible. Name as many as you can before time's up.
      const by = {};
      cfgPool(cfg).forEach((id) => { const L = norm(BY_ID[id].name)[0].toUpperCase(); (by[L] = by[L] || []).push(id); });
      let letters = Object.keys(by).filter((L) => by[L].length >= 2).sort();
      if (!letters.length) letters = Object.keys(by).sort();
      sec.letters = shuffle(letters, r).slice(0, N(1)).map((L) => ({ L, ids: by[L].slice().sort() }));
      sec.ids = sec.letters.flatMap((x) => x.ids);
    } else if (g === 'flagpick') {
      sec.grid = shuffle(sec.ids, r); // the flags in the order they're laid out
    } else if (g === 'lang') {
      // Up to 20 official languages of the region's countries; 4 options each (see langOptions).
      const here = new Set(sec.ids);
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
  if (cfg.kind === 'board' && o && o.countdown) {
    cfg.countdown = true;
    const lim = {};
    if (o.limits) cfg.games.forEach((g) => { const v = Math.round(+o.limits[g] || 0); if (v >= 5 && v <= 7200) lim[g] = v; });
    if (Object.keys(lim).length) cfg.limits = lim; else delete cfg.limits;
  } else { delete cfg.countdown; delete cfg.limits; }
  // Per-game numbers, only for games in the run (and only real ones).
  const counts = {};
  if (cfg.kind === 'board' && o && o.counts) cfg.games.forEach((g) => { const n = Math.floor(+o.counts[g] || 0); if (n > 0 && n < 1000) counts[g] = n; });
  if (Object.keys(counts).length) cfg.counts = counts; else delete cfg.counts;
  return cfg;
}
// Where (after the "+" too): R<mask> = several continents (bit i = CONTINENTS[i]), C<n> = n random countries.
const regionMask = (cfg) => (cfg.regions || []).reduce((m, r) => m | (1 << CONTINENTS.indexOf(r)), 0);
const optLetters = (cfg) => (cfg.hard ? 'N' : '') + (cfg.langType ? 'T' : '') + (cfg.strict ? 'E' : '') + (cfg.allMap ? 'A' : '') + (cfg.regions && cfg.regions.length ? 'R' + regionMask(cfg) : '') + (cfg.limit ? 'C' + cfg.limit : '') + (cfg.counts ? 'Q' + cfg.games.map((g) => cfg.counts[g] || 0).join('.') : '') + (cfg.countdown ? 'D' + (cfg.limits ? 'K' + cfg.games.map((g) => cfg.limits[g] || 0).join('.') : '') : '') + (cfg.lrSec ? 'L' + cfg.lrSec : '') + (cfg.scSec ? 'U' + cfg.scSec : '') + (cfg.kind === 'quick' && MODES.findIndex((x) => x.id === cfg.mode) > 3 ? 'M' + MODES.findIndex((x) => x.id === cfg.mode) : '');
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
  const kk = /K([\d.]+)/.exec(f), limits = {};
  if (kk) kk[1].split('.').forEach((n, k) => { if (cfg.games && cfg.games[k] && +n > 0) limits[cfg.games[k]] = +n; });
  const q = /Q([\d.]+)/.exec(f), counts = {};
  if (q) q[1].split('.').forEach((n, k) => { if (cfg.games && cfg.games[k] && +n > 0) counts[cfg.games[k]] = +n; });
  return withOpts(cfg, { hard: /N/.test(f), langType: /T/.test(f), strict: /E/.test(f), allMap: /A/.test(f), counts, lrSec: (/L(\d+)/.exec(f) || [])[1], scSec: (/U(\d+)/.exec(f) || [])[1], countdown: /D/.test(f), limits });
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
  if (cfg.kind === 'board') return cfg.games.map((g) => gameOf(g).label + (cfg.counts && cfg.counts[g] ? ' ×' + cfg.counts[g] : '')).join(' + ') + ' · ' + (cfg.custom ? 'My misses' : whereLabel(cfg)) + (cfg.hard ? ' · No borders' : '') + (cfg.langType ? ' · Typed' : '') + (cfg.strict ? ' · One shot' : '') + (cfg.allMap ? ' · All countries' : '') + (cfg.countdown ? ' · Countdown' : '') + (cfg.lrSec ? ' · Letters ' + cfg.lrSec + 's' : '') + (cfg.scSec ? ' · Unscramble ' + cfg.scSec + 's' : '') + (cfg.help ? ' · Spelling help' : '');
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
  if (n.length < 3) return [];
  // A bit more forgiving than before (owner found it too strict): 1 letter off for short names, 2 from 6 letters, 3 from 10.
  const max = n.length >= 10 ? 3 : n.length >= 6 ? 2 : 1;
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

window.GS = { timeLimit, suggestedLimit, PER_Q_SEC, LETTER_SEC, SCRAMBLE_SEC, GAME_COUNTS, COUNTRY_COUNT_GAMES, km, bearing, closerOf, hops, shortestRoute, CURRENCY_COUNT, DEMONYM_COUNT, GAME_CATS, NEEDS_MAP, withWhere, cfgPool, whereLabel, CONTINENTS, withOpts, langAnswer, langsReady, langOf, langText, recordMisses, topMisses, todayNum, dailyCfg, duelWinner, GAMES, suggest, editDistance, norm, isRight, answersFor, makeRun, makeBoard, encodeCode, decodeCode, fmtTime, pool, rng, better, compare, GAME_ORDERS, cfgLabel, DATA };
Object.defineProperty(window.GS, 'LANGS', { get: () => (langsReady(), LANGS) });
Object.defineProperty(window.GS, 'LANG_BY', { get: () => (langsReady(), LANG_BY) });
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

/* ---- a session: one run, played by one or more players (pass the phone) ---- */
const imgCache = {};
function preloadFlags(ids) {
  ids.forEach((id) => { if (!imgCache[id]) { const im = new Image(); im.decoding = 'async'; im.src = BY_ID[id].flag; imgCache[id] = im; } });
}
// The map data is a separate file, loaded only when a run has the Map game.
let mapLoading = null;
// Guess the language's sentences: loaded the first time a run needs them.
let langsLoading = null;
function needLangs() {
  if (langsReady()) return Promise.resolve();
  if (!langsLoading) langsLoading = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'langs.js?v=' + APP_VERSION;
    s.onload = () => { langsReady(); res(); }; s.onerror = () => { langsLoading = null; rej(new Error('langs')); };
    document.head.appendChild(s);
  });
  return langsLoading;
}
function loadMap() {
  if (window.GS_MAP) return Promise.resolve(window.GS_MAP);
  if (!mapLoading) mapLoading = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'map.js?v=' + APP_VERSION;
    s.onload = () => res(window.GS_MAP); s.onerror = () => { mapLoading = null; rej(new Error('map')); };
    document.head.appendChild(s);
  });
  return mapLoading;
}

// Extra files some games need: the language sentences, and the globe (d3-geo + outlines) for Hot or cold.
let globeLoading = null;
function needGlobe() {
  if (window.d3 && window.d3.geoOrthographic && window.GS_GLOBE) return Promise.resolve();
  const load = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  if (!globeLoading) globeLoading = load('vendor/d3/d3-array.min.js').then(() => load('vendor/d3/d3-geo.min.js')).then(() => load('globe.js?v=' + APP_VERSION)).catch((e) => { globeLoading = null; throw e; });
  return globeLoading;
}
const needsGlobe = (cfg) => !!(cfg && cfg.kind === 'board' && cfg.games.includes('hot'));
const assetsReady = (cfg) => (!usesLangs(cfg) || langsReady()) && (!needsGlobe(cfg) || !!(window.d3 && window.d3.geoOrthographic && window.GS_GLOBE));
const needAssets = (cfg) => Promise.all([usesLangs(cfg) ? needLangs() : null, needsGlobe(cfg) ? needGlobe() : null]);
function startSession(cfg, players, challenge, daily, practice) {
  if (!assetsReady(cfg)) {
    mount(h('div', { class: 'app' }, h('div', { class: 'cover' }, h('p', { class: 'muted' }, 'Loading…'))));
    needAssets(cfg).then(() => startSession(cfg, players, challenge, daily, practice), () => { toast('Couldn\'t load the game. Check your connection.'); home(); });
    return;
  }
  // One go at the daily run per day on this device.
  if (daily != null && store.get('gs_daily_v1', {})[daily]) { dailyResult(daily); return; }
  S.challenge = null;
  // Practice: board runs you started yourself (never a daily or a friend's challenge), or a misses drill.
  const pr = practice != null ? practice : !!S.setup.practice && cfg.kind === 'board' && daily == null && !challenge;
  // Spelling help: an online room's setting (cfg.help) is the same for everyone in it; otherwise your own switch.
  S.session = { cfg, players, idx: 0, scores: [], challenge, help: cfg.help != null ? !!cfg.help : !!S.setup.help, daily: daily != null ? daily : null, practice: pr };
  if (cfg.kind === 'board') {
    S.session.board = makeBoard(cfg);
    if (cfg.games.some((g) => g === 'flags' || g === 'flagmap' || g === 'duel')) preloadFlags(cfgPool(cfg));
    if (cfg.games.some((g) => NEEDS_MAP.has(g))) loadMap().catch(() => toast('The map didn\'t load. Check your connection.'));
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
  mount(h('div', { class: 'app' }, topbar(cfgLabel(se.cfg), () => { if (se.scores.length) ask('Leave?', 'Leave', home, 'The scores so far will be lost.'); else home(); }),
    h('div', { class: 'cover' },
      many ? h('p', { class: 'eyebrow' }, 'Player ' + (se.idx + 1) + ' of ' + se.players.length) : null,
      h('h2', { class: 'display', style: { fontSize: many ? '54px' : '42px' } }, many ? (se.idx ? 'Pass to ' : '') + name : 'Ready?'),
      h('p', { class: 'muted', style: { maxWidth: '34ch' } }, howTo(se.cfg)),
      se.help ? h('p', { class: 'small muted' }, '💡 Spelling help is on') : null,
      se.challenge && se.challenge.time ? h('p', { class: 'badge' }, 'To beat: ' + (se.cfg.kind === 'board' && se.challenge.correct != null ? se.challenge.correct + '/' + cfgTotal(se.cfg) + ' in ' : '') + fmtTime(se.challenge.time)) : null,
      h('button', { class: 'btn primary', style: { maxWidth: '320px' }, onclick: countdown }, '▶ Go')),
  ));
}
// ✕ in a run: the site's own "are you sure?" box.
function quitRun(leave) {
  if (S.session && S.session.daily != null) ask('Leave today\'s run?', 'Leave', leave, 'You can\'t play it again today.');
  else ask('Stop this run?', 'Stop', leave, 'It won\'t count.');
}
function countdown() {
  // Pressing Go uses up today's daily run (leaving early still counts as your go).
  const se = S.session;
  if (se.daily != null && se.idx === 0) { const d = store.get('gs_daily_v1', {}); if (!d[se.daily]) { d[se.daily] = { left: true }; store.set('gs_daily_v1', d); } }
  const go = () => {
    let n = 3; const el = h('div', { class: 'cd', 'aria-live': 'assertive' }, '3');
    mount(h('div', { class: 'app' }, h('div', { class: 'cover' }, el)));
    const tick = () => { n--; if (n > 0) { el.textContent = String(n); setTimeout(tick, 700); } else (S.session.cfg.kind === 'board' ? boardRun() : quickRun()); };
    setTimeout(tick, 700);
  };
  // Don't start the clock before the map has arrived.
  if (S.session.cfg.kind === 'board' && S.session.cfg.games.some((g) => NEEDS_MAP.has(g)) && !window.GS_MAP) {
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
  // Countdown style: c.left() gives the time left in this game (ms), or null for the usual stopwatch.
  c.left = () => null;
  const loop = () => {
    if (c.over) return;
    const practice = S.session && S.session.practice, left = c.left();
    if (left != null && left <= 0 && c.pauseAt == null && c.onTimeUp) { const f = c.onTimeUp; c.onTimeUp = null; f(); }
    document.querySelectorAll('.timer').forEach((t) => {
      t.textContent = practice ? 'Practice' : left != null ? left <= 0 ? "⏳ Time's up" : '⏳ ' + fmtTime(Math.ceil(Math.max(0, left) / 1000) * 1000).replace(/\.\d+$/, '') : fmtTime(c.elapsed() + c.extra());
      t.classList.toggle('paused', c.pauseAt != null); t.classList.toggle('practice', !!practice); t.classList.toggle('low', left != null && left < 10000);
    });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return c;
}

function finishRun(score) {
  const se = S.session;
  score.kind = se.cfg.kind;
  se.scores.push(score);
  if (se.live) liveFinished(score);
  store.set('gs_misses_v1', recordMisses(store.get('gs_misses_v1', {}), score));
  if (se.practice) { result(score); return; } // practice: no best times, no daily score
  // Daily run: the first finished go of the day is the one that counts.
  if (se.daily != null && se.idx === 0) {
    const d = store.get('gs_daily_v1', {});
    if (!d[se.daily] || d[se.daily].time == null) {
      d[se.daily] = { time: score.time, correct: score.correct, total: score.total,
        sections: (score.sections || []).map((s) => ({ game: s.game, kind: s.kind, ids: s.ids, found: s.found, missed: s.missed, gaveUp: !!s.gaveUp, skipped: !!s.skipped, tries: s.tries || {} })) };
      store.set('gs_daily_v1', d); score.dailyFirst = true;
    }
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
  if (se.live) liveReporter(R);
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
    quit: () => quitRun(() => { R.clock.over = true; home(); }),
  };
  // A game with nothing to ask (e.g. no country in the run has a unique currency) is skipped.
  if (!sec.ids.length) { nextSection(R); return; }
  // Countdown style: this game has its own time limit; when it runs out, what's left counts as missed.
  if (se.cfg.countdown && !se.practice) {
    const limit = timeLimit(se.cfg, sec) * 1000, from = R.clock.elapsed();
    res.limit = limit / 1000;
    R.clock.left = () => limit - (R.clock.elapsed() - from);
    R.clock.onTimeUp = () => { if (R.results[R.sec] === res && !res.gaveUp) timeUp(R, api); };
  } else { R.clock.left = () => null; R.clock.onTimeUp = null; }
  const UI = { borders: bordersGame, duel: duelGame, lang: langGame, chain: chainGame, hot: hotGame, closer: closerGame, clues: cluesGame,
    letter: letterGame, scramble: scrambleGame, currency: currencyGame, flagpick: flagpickGame };
  api.ui = MAP_GAMES.has(sec.game) ? mapGame(api) : (UI[sec.game] || gridGame)(api);
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
function timeUp(R, api) {
  const se = S.session, res = api.res, last = R.sec >= se.board.length - 1;
  R.clock.pause();
  res.gaveUp = true; res.timeUp = true;
  res.missed = res.ids.filter((id) => !res.found.includes(id));
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
  const quit = h('button', { class: 'iconbtn', 'aria-label': 'Stop the run', onclick: () => quitRun(() => { clock.over = true; home(); }) }, '✕');
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
    } else if (q.kind === 'revcap') {
      stage.replaceChildren(h('div', { class: 'ask' }, 'Country with the capital'), h('div', { class: 'big' }, c.capital));
    } else if (q.kind === 'scramble') {
      stage.replaceChildren(h('div', { class: 'ask' }, 'Unscramble'), h('div', { class: 'scramble' }, q.scr.split(' ').map((w) => h('span', { class: 'word' }, w.split('').map((ch) => h('b', null, ch))))));
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
  // One shot (cfg.strict): nothing goes in while typing; Enter answers — right counts, wrong shows the answer in
  // red (missed) and moves on. Spelling help still suggests; tapping a suggestion is your answer.
  const strict = !!S.session.cfg.strict;
  const help = spellingHelp(input, sugEl, kind, () => ids[active], () => accept(), null, strict ? () => { shake(input); showAnswer(); } : null);
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

  // How many you've got, and how many are still to go (found or shown/missed tiles are done).
  function count() { foundEl.textContent = found.size + ' found · ' + (ids.length - found.size - shown.size) + ' left'; }
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
    input.value = ''; help.clear(); count();
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
    if (!strict && isRight(ids[active], kind, input.value)) accept(); else help.update();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (revealed) return; if (strict) { if (!input.value.trim()) return; if (isRight(ids[active], kind, input.value)) accept(); else help.enter(); } else help.enter(); }
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
// onWrong (One shot): a wrong try (a suggestion, or Enter) is final — the game marks it missed instead of a shake.
function spellingHelp(input, el, kindOf, currentId, onRight, matcher, onWrong) {
  let list = [];
  const kind0 = () => (typeof kindOf === 'function' ? kindOf() : kindOf);
  const on = () => !!(S.session && S.session.help);
  const clear = () => { list = []; el.hidden = true; el.replaceChildren(); };
  const tryText = (text) => {
    if (matcher ? matcher(text) : isRight(currentId(), kind0(), text)) { input.value = text; onRight(); }
    else { input.value = text; clear(); if (onWrong) onWrong(); else shake(input); }
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
      if (onWrong) onWrong(); else shake(input);
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
// The map view for a run: its region's view; for several continents, the box round all of them on the world
// map (the whole world if Oceania is one of them — it's split across the world map's edges).
function mapView(M, cfg) {
  const rs = cfg.regions;
  if (!rs || !rs.length) return M.views[cfg.region];
  if (rs.includes('Oceania')) return M.views.world;
  const union = (key) => { const bs = rs.map((r) => M.views[r][key] || M.views[r].box); const x0 = Math.min(...bs.map((b) => b[0])), y0 = Math.min(...bs.map((b) => b[1])); return [x0, y0, Math.max(...bs.map((b) => b[0] + b[2])) - x0, Math.max(...bs.map((b) => b[1] + b[3])) - y0]; };
  return { map: 'world', box: union('box'), tight: union('tight') };
}
function mapGame(api) {
  const { sec, res } = api;
  // Three ways to play the map: 'map' (tap the named country), 'flagmap' (tap the country of the flag shown),
  // 'mapname' (a country lights up in gold; type its name).
  // 'all' = Name them all: no prompt; type any country of the run and it lights up.
  const mode = sec.game, naming = mode === 'mapname', listing = mode === 'all', typing = naming || listing;
  const M = window.GS_MAP, view = mapView(M, S.session.cfg), m = M[view.map];
  // playable = countries you can tap. Normally just the ones in this run (the rest are grey); with
  // 🌍 All countries on the map (cfg.allMap) every country is live, so you can't tell the answers by colour.
  const ids = sec.ids, playable = S.session.cfg.allMap && !listing ? new Set(DATA.map((c) => c.id)) : new Set(ids); // Name them all: never (you'd not know what to name)
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
  const hard = !!S.session.cfg.hard; // no borders: only coasts, until a country is answered
  const svg = h('svg', { class: 'map' + (hard ? ' noborders' : ''), role: 'img', 'aria-label': 'World map', preserveAspectRatio: 'xMidYMid meet' },
    h('rect', { class: 'sea', x: -m.w, y: -m.h, width: m.w * 3, height: m.h * 3 }), ...main.nodes);
  // Magnified boxes (world map only).
  const insets = (view.insets || []).map((ins) => {
    const md = M[ins.map], L = layer(md, ins.name);
    const isvg = h('svg', { class: 'map' + (hard ? ' noborders' : ''), viewBox: ins.box.join(' '), preserveAspectRatio: 'xMidYMid slice' },
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
  const nameInput = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go', placeholder: listing ? 'Type any country…' : 'Type the gold country…', 'aria-label': 'Name the country lit up in gold' });
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
    h('div', { class: 'prompt' }, h('span', { class: 'findlbl' }, h('span', { class: 'eyebrow' }, naming ? 'Name it' : listing ? 'Name them all' : 'Find'), foundEl), typing ? nameBox : target, listing ? null : showBtn, listing ? null : skipBtn),
    typing ? sugEl : null,
    h('div', { class: 'mapbar', 'aria-hidden': 'true' }, barOk, barMiss),
    hint);
  mount(h('div', { class: 'app map-run' }, head, wrap, footer));
  document.body.classList.add('fullscreen');

  /* ---- view: fit, zoom, pan ---- */
  let base, vb;
  const size = () => { const r = svg.getBoundingClientRect(); return { w: r.width || 1, h: r.height || 1, left: r.left, top: r.top }; };
  let fitAll = false;
  function fit(all) {
    stopAnim();
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
    stopAnim();
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
  // Never leave the map stuck to the cursor: if the button-up got lost (released outside the window, the
  // browser dropped the capture, the tab lost focus), forget the drag.
  const dropAll = () => { pts.clear(); pan = null; pinch = null; };
  const drop = (id) => { if (!pts.has(id)) return; pts.delete(id); if (pts.size === 1) { const [p] = [...pts.values()]; pan = { x: p.x, y: p.y, vb: Object.assign({}, vb) }; pinch = null; } if (!pts.size) { pan = null; pinch = null; } };
  svg.addEventListener('lostpointercapture', (e) => drop(e.pointerId));
  const winUp = (e) => drop(e.pointerId);
  window.addEventListener('pointerup', winUp); window.addEventListener('pointercancel', winUp); window.addEventListener('blur', dropAll);
  cleanup.push(() => { window.removeEventListener('pointerup', winUp); window.removeEventListener('pointercancel', winUp); window.removeEventListener('blur', dropAll); });
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' && e.buttons === 0 && pts.size) { dropAll(); return; } // moving with no button held = not dragging
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
    foundEl.textContent = res.found.length + ' found · ' + queue.length + ' left';
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
    if (listing) { nameInput.focus({ preventScroll: true }); return; }
    const t = tries[queue[0]] || 0;
    hint.textContent = t ? '✗'.repeat(t) + ' ' + (MAP_TRIES - t) + ' tries left' : '';
  }
  // Practice: show where it is (map / flag → map: it flashes red and you tap it) or what it's called (name it).
  function showAnswer() {
    if (revealed || ended || must || !queue.length) return;
    const cur = queue[0];
    if (naming) {
      setState(cur, 'miss'); missedN++;
      const w = wrap.getBoundingClientRect(); tapName(w.left + w.width / 2, w.top + 64, BY_ID[cur].name, false);
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
    if (typing || ended || !id || !playable.has(id)) return;
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
  // One shot (cfg.strict): Enter answers; a wrong name is missed (the answer shows) and the next one comes.
  const strict = !!S.session.cfg.strict;
  const listed = (text) => queue.find((id) => isRight(id, 'country', text));
  const help = listing ? spellingHelp(nameInput, sugEl, 'country', () => null, () => listOne(), (text) => !!listed(text))
    : spellingHelp(nameInput, sugEl, 'country', () => queue[0], () => named(), null, strict ? () => { shake(nameInput); showAnswer(); } : null);
  // Name them all: a country of the run, in any order → it lights up where it is.
  function listOne() {
    const id = listed(nameInput.value); if (!id) return;
    res.found.push(id); setState(id, 'g0'); pop(id);
    queue.splice(queue.indexOf(id), 1); nameInput.value = ''; help.clear(); placeAll(); count();
    if (!queue.length) ask();
  }
  function named() {
    const cur = queue[0];
    res.found.push(cur); setState(cur, 'g0'); pop(cur);
    // The ✓ goes at the top of the map: the middle is where the next country flies in.
    const w = wrap.getBoundingClientRect(); tapName(w.left + w.width / 2, w.top + 64, BY_ID[cur].name, true);
    queue.shift(); count(); ask();
  }
  nameInput.addEventListener('input', () => { if (listing && !ended && !revealed) { if (listed(nameInput.value)) listOne(); else help.update(); return; } if (!naming || ended || revealed) return; if (!strict && isRight(queue[0], 'country', nameInput.value)) named(); else help.update(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (listing) { if (!ended && !revealed && nameInput.value.trim()) { if (listed(nameInput.value)) listOne(); else help.enter(); } return; } if (!ended && !revealed) { if (isRight(queue[0], 'country', nameInput.value)) named(); else if (!strict || nameInput.value.trim()) help.enter(); } } });
  /* Map: name it — each new gold country: a smooth flight to it (zoom out a little, travel, zoom in), ending
     with it centred and small enough that you can see its neighbours. Speed 1–10 from the slider (10 = instant). */
  const ANIM_MS = [1800, 1500, 1250, 1050, 850, 700, 550, 400, 250, 0];
  let animLevel = Math.min(10, Math.max(1, +store.get('gs_anim_v1', 6) || 6)), anim = 0;
  const stopAnim = () => { if (anim) cancelAnimationFrame(anim); anim = 0; };
  svg.addEventListener('pointerdown', stopAnim); svg.addEventListener('wheel', stopAnim, { passive: true });
  cleanup.push(stopAnim);
  function flyTo(to) {
    stopAnim();
    const ms = ANIM_MS[animLevel - 1];
    if (!ms) { vb = to; apply(); return; }
    const from = Object.assign({}, vb), ar = from.w / from.h;
    const c0 = { x: from.x + from.w / 2, y: from.y + from.h / 2 }, c1 = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
    // Far apart (compared with the views): rise up in the middle so you see where you're going.
    const dist = Math.hypot(c1.x - c0.x, c1.y - c0.y), wide = Math.max(from.w, to.w);
    const rise = Math.min(1.2, Math.max(0, dist / wide - 0.4) * 0.6);
    const lw0 = Math.log(from.w), lw1 = Math.log(to.w), t0 = performance.now();
    const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = ease(t);
      const w = Math.exp(lw0 + (lw1 - lw0) * e) * (1 + rise * Math.sin(Math.PI * e)), hh = w / ar;
      const cx = c0.x + (c1.x - c0.x) * e, cy = c0.y + (c1.y - c0.y) * e;
      vb = { x: cx - w / 2, y: cy - hh / 2, w, h: hh }; apply();
      anim = t < 1 ? requestAnimationFrame(step) : 0;
    };
    anim = requestAnimationFrame(step);
  }
  // The part of a country to centre on: its marker box for small ones; otherwise its biggest piece plus the
  // pieces near it (so France means mainland France, not French Guiana too).
  const focusBox = {};
  function boxOf(id) {
    if (focusBox[id]) return focusBox[id];
    const k = main.markers.find((x) => x.id === id);
    if (k) return (focusBox[id] = { x: k.x0, y: k.y0, w: k.x1 - k.x0, h: k.y1 - k.y0 });
    const el = els[id][0], parts = (el.getAttribute('d') || '').split(/(?=M)/).filter(Boolean);
    const tmp = h('path', { style: { visibility: 'hidden' } }); svg.appendChild(tmp);
    const bbs = parts.map((d) => { tmp.setAttribute('d', d); const b = tmp.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
    tmp.remove();
    if (!bbs.length) { const b = el.getBBox(); return (focusBox[id] = { x: b.x, y: b.y, w: b.width, h: b.height }); }
    const big = bbs.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    const reach = Math.max(2 * Math.hypot(big.w, big.h), 1), bc = { x: big.x + big.w / 2, y: big.y + big.h / 2 };
    const near = bbs.filter((b) => Math.hypot(b.x + b.w / 2 - bc.x, b.y + b.h / 2 - bc.y) <= reach);
    const x0 = Math.min(...near.map((b) => b.x)), y0 = Math.min(...near.map((b) => b.y));
    const x1 = Math.max(...near.map((b) => b.x + b.w)), y1 = Math.max(...near.map((b) => b.y + b.h));
    return (focusBox[id] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  function showTarget(id) {
    if (!base) return requestAnimationFrame(() => showTarget(id));
    const b = boxOf(id), s = size(), ar = s.w / s.h;
    // The country takes up a bit over a quarter of the screen; never closer than 1/10 of the region (so you still see
    // the neighbours), never wider than the region.
    let vw = Math.max(b.w / 0.28, (b.h / 0.28) * ar, base.w / 10);
    vw = Math.min(vw, base.w);
    const vh = vw / ar;
    let cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    // Huge countries (the view is the whole region): stay on the region rather than slide off into the sea.
    if (vw >= base.w * 0.98) { cx = base.x + base.w / 2 + (cx - (base.x + base.w / 2)) * 0.5; cy = base.y + base.h / 2 + (cy - (base.y + base.h / 2)) * 0.5; }
    flyTo({ x: cx - vw / 2, y: cy - vh / 2, w: vw, h: vh });
  }
  // The slider (Map: name it only), on the map's top-left corner. Saved on this device.
  if (naming) {
    const lvl = h('b', { class: 'num' }, String(animLevel));
    const slider = h('input', { type: 'range', min: '1', max: '10', step: '1', value: String(animLevel), 'aria-label': 'Animation speed' });
    slider.addEventListener('input', () => { animLevel = +slider.value; lvl.textContent = animLevel === 10 ? 'Off' : String(animLevel); store.set('gs_anim_v1', animLevel); });
    slider.addEventListener('change', () => nameInput.focus({ preventScroll: true }));
    if (animLevel === 10) lvl.textContent = 'Off';
    wrap.appendChild(h('label', { class: 'animspeed' }, h('span', null, 'Animation speed'), slider, lvl));
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
  const strict = !!S.session.cfg.strict; // One shot: Enter answers; a wrong neighbour ends this country (rest missed)
  const help = spellingHelp(input, sugEl, 'country', () => queue[0], () => accept(), (text) => !!match(text), strict ? () => { if (!showing) { shake(input); showAnswer(); } } : null);
  // Borders found, and how many countries are still to go.
  function count() { foundEl.textContent = done.size + ' borders · ' + queue.length + (queue.length === 1 ? ' country' : ' countries') + ' left'; }
  function draw() {
    count();
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
  input.addEventListener('input', () => { if (revealed || ended) return; if (!strict && match(input.value)) accept(); else help.update(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!revealed && !ended && !showing) { if (match(input.value)) accept(); else if (!strict || input.value.trim()) help.enter(); } } });
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
  function count() { foundEl.textContent = res.found.length + ' right · ' + Math.max(0, sec.ids.length - i - (busy ? 1 : 0)) + ' left'; }
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

/* Guess the language: a sentence (Article 1 of the Universal Declaration of Human Rights, a real official translation)
   in one of the region's official languages; pick it from 4. A wrong pick shows the right one and counts as missed;
   the clock is stopped while the answer is on screen. On a keyboard: 1–4. */
const LANG_TAG = { zho: 'zh-Hans', jpn: 'ja', kor: 'ko' }; // so Chinese / Japanese characters get the right font
function langQuote(id, cls) {
  const l = langOf(id);
  return h('blockquote', { class: cls || 'lang-text', dir: l.dir, lang: LANG_TAG[l.k] || null }, langText(id));
}
function langGame(api) {
  const { sec, res } = api;
  let i = 0, busy = false, revealed = false;
  const foundEl = h('span', { class: 'found num' });
  const arena = h('div', { class: 'duel langq' });
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = boardHead(api, h('div', { class: 'progress' }, foundEl));
  mount(h('div', { class: 'app grid-run' }, head, arena, footer));
  // Typed mode (setup switch): type the language's name instead of picking it; Pass if you don't know.
  const typed = !!S.session.cfg.langType;
  const input = typed ? h('input', { class: 'input', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go', placeholder: 'Type the language…', 'aria-label': 'The language' }) : null;
  const verdict = h('p', { class: 'lang-verdict center' });
  const strict = !!S.session.cfg.strict; // one shot: Enter answers, a wrong one is missed
  if (typed) {
    input.addEventListener('input', () => { if (!strict && !busy && i < sec.ids.length && langAnswer(langOf(sec.ids[i]).k, input.value)) pick(langOf(sec.ids[i]).k); });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (busy || i >= sec.ids.length || !input.value.trim()) return;
      const k = langOf(sec.ids[i]).k;
      if (langAnswer(k, input.value)) pick(k); else if (strict) { shake(input); pick('~wrong'); } else shake(input);
    });
  }
  function count() { foundEl.textContent = res.found.length + ' right · ' + Math.max(0, sec.ids.length - i - (busy ? 1 : 0)) + ' left'; }
  function draw() {
    const k = sec.ids[i];
    if (typed) {
      verdict.textContent = ''; verdict.className = 'lang-verdict center'; input.value = ''; input.disabled = false;
      arena.replaceChildren(h('p', { class: 'eyebrow center' }, 'Which language?'), langQuote(k), h('div', { class: 'lang-where' }),
        h('div', { class: 'row lang-type' }, input, h('button', { class: 'btn ghost small', style: { width: 'auto', flex: '0 0 auto' }, onmousedown: (e) => e.preventDefault(), onclick: () => pick(null) }, 'Pass')), verdict);
      input.focus({ preventScroll: true });
      return;
    }
    arena.replaceChildren(h('p', { class: 'eyebrow center' }, 'Which language?'), langQuote(k), h('div', { class: 'lang-where' }),
      h('div', { class: 'lang-opts' }, sec.opts[k].map((o, n) => h('button', { class: 'duel-pick lang-pick', 'data-id': o, onclick: () => pick(o) },
        h('b', null, LANG_BY[o].name), h('span', { class: 'key' }, String(n + 1))))));
  }
  function pick(o) {
    if (busy || revealed || i >= sec.ids.length) return;
    busy = true; api.R.clock.pause();
    const id = sec.ids[i], k = langOf(id).k;
    if (o === k) res.found.push(id); else try { navigator.vibrate && navigator.vibrate(40); } catch (e) { /* no vibration */ }
    if (typed) {
      input.disabled = true;
      verdict.textContent = o === k ? '✓ ' + LANG_BY[k].name : (o === null ? '' : '✗ ') + 'It was ' + LANG_BY[k].name;
      verdict.className = 'lang-verdict center ' + (o === k ? 'ok' : 'bad');
    }
    arena.querySelectorAll('.lang-pick').forEach((btn) => {
      const b = btn.getAttribute('data-id');
      btn.classList.add(b === k ? 'right' : b === o ? 'wrong' : 'other');
    });
    arena.querySelector('.lang-where').replaceChildren(...spokenIn(k));
    count();
    setTimeout(() => {
      busy = false; api.R.clock.resume(); i++;
      if (i >= sec.ids.length) { api.done(); return; }
      count(); draw();
    }, o === k ? 700 : 1600);
  }
  const onKey = (e) => {
    if (typed || busy || revealed || i >= sec.ids.length || e.ctrlKey || e.metaKey || e.altKey) return;
    const n = '1234'.indexOf(e.key);
    if (n >= 0 && sec.opts[sec.ids[i]][n]) pick(sec.opts[sec.ids[i]][n]);
  };
  document.addEventListener('keydown', onKey); cleanup.push(() => document.removeEventListener('keydown', onKey));
  count(); draw();
  return {
    completed() { head.classList.add('all-done'); },
    reveal(btn) {
      revealed = true; head.classList.add('gave-up');
      arena.replaceChildren(h('p', { class: 'eyebrow' }, 'Rounds left'), langList(sec.ids.slice(i)));
      footer.hidden = false; footer.replaceChildren(btn);
    },
  };
}
// After you answer: the flags of the countries where it's official (up to 10, then "+n").
function spokenIn(k) {
  const cs = LANG_BY[k].countries.filter((c) => BY_ID[c]);
  return [h('span', { class: 'small muted' }, 'Spoken in')].concat(cs.slice(0, 10).map((c) => h('img', { src: BY_ID[c].flag, alt: BY_ID[c].name, title: BY_ID[c].name, height: 22, width: Math.round(22 * BY_ID[c].ratio) })),
    cs.length > 10 ? [h('span', { class: 'small muted' }, '+' + (cs.length - 10))] : []);
}
// Language name + its sentence (results and give up).
function langList(keys) {
  return h('ul', { class: 'langlist' }, keys.map((id) => h('li', null, h('b', null, langOf(id).name), langQuote(id, 'lang-small'))));
}

/* ---- The newer games (Oct 2026): Border chain, Hot or cold, Closer or further, Clue reveal, Letter rush,
   Unscramble, Currency & people, Flag finder. (Name them all is a mode of the map game in 40-map.) ---- */

// A text box for typing a country, with spelling help, used by most of these games.
function countryBox(placeholder) {
  return h('input', { class: 'input', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go', placeholder, 'aria-label': placeholder });
}
// Which country a typed text names (any country in the game), or null.
const countryFromText = (text) => { const t = String(text || '').trim(); if (!t) return null; const c = DATA.find((x) => isRight(x.id, 'country', t)); return c ? c.id : null; };
const flagImg = (id, hgt) => h('img', { class: 'miniflag', src: BY_ID[id].flag, alt: '', height: hgt || 22, width: Math.round((hgt || 22) * BY_ID[id].ratio) });
const fmtKm = (n) => n.toLocaleString('en-US') + ' km';

/* One question at a time, typed (Unscramble, Currency & people): the answer goes in the moment it's right
   (One shot: on Enter, and a wrong one is missed). Pass shows the answer. */
function typeRounds(api, o) {
  const { sec, res } = api;
  let i = 0, busy = false, revealed = false;
  const strict = !!S.session.cfg.strict;
  const foundEl = h('span', { class: 'found num' });
  const input = countryBox('Type the country…');
  const sugEl = h('div', { class: 'suggest', 'aria-live': 'polite', hidden: true });
  const verdict = h('p', { class: 'lang-verdict center' });
  const stage = h('div', { class: 'qstage' });
  const pass = h('button', { class: 'btn ghost small', style: { width: 'auto', flex: '0 0 auto' }, onmousedown: (e) => e.preventDefault(), onclick: () => next(false) }, 'Pass');
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = boardHead(api, [h('div', { class: 'progress' }, foundEl)]);
  // Optional time limit per question (Unscramble): a bar runs down; at zero the answer shows and it counts as missed.
  const bar = h('i'), clockBar = o.timeMs ? h('div', { class: 'lettertime' }, bar) : null;
  let endsAt = 0, timer = 0;
  const tick = () => { if (busy || revealed) return; const ms = endsAt - performance.now(); bar.style.width = Math.max(0, ms / o.timeMs * 100) + '%'; clockBar.classList.toggle('low', ms < Math.min(5000, o.timeMs / 3)); if (ms <= 0) return next(false); timer = requestAnimationFrame(tick); };
  cleanup.push(() => cancelAnimationFrame(timer));
  mount(h('div', { class: 'app grid-run' }, head, h('div', { class: 'duel' }, stage, clockBar, h('div', { class: 'row lang-type' }, input, o.extra ? o.extra(() => sec.ids[i], stage) : null, pass), sugEl, verdict), footer));
  const cur = () => o.answer(sec.ids[i]);
  const help = spellingHelp(input, sugEl, 'country', cur, () => next(true), null, strict ? () => { shake(input); next(false); } : null);
  function count() { foundEl.textContent = res.found.length + ' right · ' + Math.max(0, sec.ids.length - i - (busy ? 1 : 0)) + ' left'; }
  function draw() {
    verdict.textContent = ''; verdict.className = 'lang-verdict center'; input.value = ''; input.disabled = false; help.clear(); stage.replaceChildren(...o.show(sec.ids[i])); count(); input.focus({ preventScroll: true });
    if (o.timeMs) { cancelAnimationFrame(timer); endsAt = performance.now() + o.timeMs; timer = requestAnimationFrame(tick); }
  }
  function next(right) {
    if (busy || revealed || i >= sec.ids.length) return;
    busy = true; cancelAnimationFrame(timer); api.R.clock.pause(); input.disabled = true; help.clear();
    const id = sec.ids[i];
    if (right) res.found.push(id);
    verdict.textContent = (right ? '✓ ' : 'It was ') + BY_ID[o.answer(id)].name;
    verdict.className = 'lang-verdict center ' + (right ? 'ok' : 'bad');
    count();
    setTimeout(() => { busy = false; api.R.clock.resume(); i++; if (i >= sec.ids.length) { api.done(); return; } draw(); }, right ? 600 : 1500);
  }
  input.addEventListener('input', () => { if (busy || revealed) return; if (!strict && isRight(cur(), 'country', input.value)) next(true); else help.update(); });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return; e.preventDefault();
    if (busy || revealed || !input.value.trim()) return;
    if (isRight(cur(), 'country', input.value)) next(true); else help.enter();
  });
  draw();
  return {
    completed() { head.classList.add('all-done'); },
    reveal(btn) {
      revealed = true; input.disabled = true; head.classList.add('gave-up');
      stage.replaceChildren(h('p', { class: 'eyebrow' }, 'Rounds left'), h('ul', { class: 'pairs' }, sec.ids.slice(i).map((id) => h('li', null, h('span', null, o.text(id)), h('b', null, BY_ID[o.answer(id)].name)))));
      footer.hidden = false; footer.replaceChildren(btn);
    },
  };
}
// Unscramble: the letters of a country's name, mixed up.
// 15 seconds per name (changeable in setup); 🔀 mixes the letters up again.
function scrambleGame(api) {
  const sec = api.sec;
  const tiles = (text) => h('div', { class: 'scramble' }, text.split(' ').map((w) => h('span', { class: 'word' }, w.split('').map((ch) => h('b', null, ch)))));
  return typeRounds(api, { answer: (id) => id, text: (id) => sec.scr[id], timeMs: (S.session.cfg.scSec || SCRAMBLE_SEC) * 1000,
    show: (id) => [h('p', { class: 'eyebrow center' }, 'Unscramble'), tiles(sec.scr[id])],
    extra: (curId, stage) => h('button', { class: 'btn ghost small', style: { width: 'auto', flex: '0 0 auto' }, 'aria-label': 'Mix the letters again', onmousedown: (e) => e.preventDefault(),
      onclick: () => { const id = curId(); if (!id) return; const old = stage.querySelector('.scramble'); if (old) old.replaceWith(tiles(scrambleName(BY_ID[id].name, Math.random))); } }, '🔀') });
}
// Currency & people: "id~c" = its currency, "id~d" = what its people are called.
const currencyClue = (key) => { const [id, t] = key.split('~'), c = BY_ID[id]; return t === 'c' ? c.cur.filter((x) => CURRENCY_COUNT[x] === 1)[0] : c.dem; };
function currencyGame(api) {
  return typeRounds(api, { answer: (key) => key.split('~')[0], text: currencyClue,
    show: (key) => [h('p', { class: 'eyebrow center' }, key.endsWith('~c') ? '💰 Which country uses' : '🧑 Which country\'s people are'), h('div', { class: 'bigclue' }, currencyClue(key))] });
}

/* Clue reveal: clues one by one, hardest first. Type the country any time; "Next clue" shows another.
   After the last clue, "Give up on this one" counts it missed. */
// Clue reveal's clues for a country: a random mix each time (owner) — which clues, their order and their wording
// change from run to run — but always hard ones first (size, coast, hemisphere, languages, continent…), medium
// ones next (region, currency, capital, what people are called) and the giveaways last (neighbours, flag, name).
// Same run (seed) + same country = same clues, so challenges stay fair. Every clue is a fact from the data.
const CLUE_CACHE = {};
function cluesFor(id, seedFor) {
  const seed = seedFor != null ? seedFor : S.session && S.session.cfg ? S.session.cfg.seed : 1, key = seed + ':' + id;
  if (CLUE_CACHE[key]) return CLUE_CACHE[key];
  let hsh = seed >>> 0; for (const ch of id) hsh = Math.imul(hsh ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  const r = rng(hsh), pick = (arr) => arr[Math.floor(r() * arr.length)];
  const c = BY_ID[id], round2 = (a) => { const p = Math.pow(10, Math.max(0, String(Math.round(a)).length - 2)); return Math.round(a / p) * p; };
  const area = round2(c.area).toLocaleString('en-US') + ' km²', nbN = c.nb.length, [lat, lon] = c.ll;
  const langs = c.lang.slice(0, 3).join(', '), cont = regionOf(c.region).label;
  const hard = [
    ['📐', 'Size', pick(['About ' + area, 'It covers roughly ' + area, 'Its area is about ' + area])],
    ['🏖️', 'Coast', c.land ? pick(['Landlocked — no coastline', 'It has no sea coast', 'You can\'t reach it by sea']) : pick(['It has a coastline', 'It touches the sea', 'Not landlocked'])],
    ['🧱', 'Neighbours', nbN ? pick([nbN + (nbN === 1 ? ' country borders it by land' : ' countries border it by land'), 'It has ' + nbN + ' land ' + (nbN === 1 ? 'neighbour' : 'neighbours')]) : pick(['No land borders at all', 'It shares no land border'])],
    ['🧭', 'Hemisphere', 'Its middle is in the ' + (lat >= 0 ? 'Northern' : 'Southern') + ' and ' + (lon >= 0 ? 'Eastern' : 'Western') + ' hemispheres'],
  ];
  if (langs) hard.push(['🗣️', 'Language' + (c.lang.length > 1 ? 's' : ''), pick(['Official: ', 'People there speak ', 'Official language' + (c.lang.length > 1 ? 's' : '') + ': ']) + langs]);
  hard.push(['🌍', 'Continent', pick(['It\'s in ' + cont, 'Continent: ' + cont])]);
  const mid = [
    ['🗺️', 'Part of the world', c.sub || cont],
    ['🏛️', 'Capital', pick(['The capital starts with ' + c.capital[0], 'Its capital begins with "' + c.capital[0] + '"'])],
  ];
  if (c.cur.length) mid.push(['💰', 'Currency', pick(['Money: ', 'They pay with the ', 'Currency: ']) + c.cur.join(', ')]);
  if (c.dem && norm(c.dem) !== norm(c.name)) mid.push(['🧑', 'People', pick(['People there are called ' + c.dem, 'Someone from there is ' + c.dem])]);
  const late = [];
  if (nbN) late.push(['🧱', 'Borders', pick(['It borders ', 'Neighbours: ']) + c.nb.map((n) => BY_ID[n].name).join(', ')]);
  late.push(['🏳️', 'Flag', null]);
  const letters = c.name.replace(/[^A-Za-zÀ-ÿ]/g, '').length;
  late.push(['🔤', 'Name', pick(['Starts with ' + c.name[0] + ' · ' + letters + ' letters', c.name[0] + '… (' + letters + ' letters)'])]);
  // Hard ones in a random order (4–6 of them), then medium in a random order, then the giveaways.
  const list = shuffle(hard, r).concat(shuffle(mid, r), late);
  return (CLUE_CACHE[key] = list);
}
function cluesGame(api) {
  // You start with one clue; every wrong guess (a real country) shows the next one. No clues left → missed.
  // Pass skips the country (missed). One shot: the first wrong guess ends it.
  const { sec, res } = api;
  let i = 0, shown = 1, busy = false, revealed = false, wrong = [];
  const strict = !!S.session.cfg.strict;
  const foundEl = h('span', { class: 'found num' });
  const input = countryBox('Guess the country…');
  const sugEl = h('div', { class: 'suggest', 'aria-live': 'polite', hidden: true });
  const list = h('ol', { class: 'clues' });
  const tried = h('div', { class: 'chain-chips' });
  const verdict = h('p', { class: 'lang-verdict center' });
  const pass = h('button', { class: 'btn ghost small', style: { width: 'auto', flex: '0 0 auto' }, onmousedown: (e) => e.preventDefault(), onclick: () => end(false) }, 'Pass');
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = boardHead(api, [h('div', { class: 'progress' }, foundEl)]);
  mount(h('div', { class: 'app grid-run' }, head, h('div', { class: 'duel' }, list, h('div', { class: 'row lang-type' }, input, pass), sugEl, tried, verdict), footer));
  const help = spellingHelp(input, sugEl, 'country', () => sec.ids[i], () => end(true), (text) => !!countryFromText(text), () => wrongGuess());
  function count() { foundEl.textContent = res.found.length + ' right · ' + Math.max(0, sec.ids.length - i - (busy ? 1 : 0)) + ' left'; }
  function draw() {
    const cl = cluesFor(sec.ids[i]);
    list.replaceChildren(...cl.slice(0, shown).map(([em, label, text]) => h('li', null, h('span', { class: 'cl-em' }, em), h('small', null, label), text == null ? flagImg(sec.ids[i], 40) : h('b', null, text))));
    tried.replaceChildren(...wrong.map((g) => h('span', { class: 'chip c-far' }, BY_ID[g].name)));
    input.placeholder = 'Guess · clue ' + shown + '/' + cl.length;
    count();
  }
  function wrongGuess() {
    if (busy || revealed) return;
    const g = countryFromText(input.value);
    if (!g) { shake(input); return; }
    if (g === sec.ids[i]) return end(true);
    shake(input); input.value = ''; help.clear();
    if (!wrong.includes(g)) wrong.push(g);
    if (strict || shown >= cluesFor(sec.ids[i]).length) return end(false);
    shown++; draw();
  }
  function end(right) {
    if (busy || revealed) return;
    busy = true; api.R.clock.pause(); input.disabled = true; help.clear();
    const id = sec.ids[i];
    if (right) res.found.push(id);
    verdict.textContent = (right ? '✓ ' + BY_ID[id].name + ' · ' + shown + (shown === 1 ? ' clue' : ' clues') : 'It was ' + BY_ID[id].name);
    verdict.className = 'lang-verdict center ' + (right ? 'ok' : 'bad');
    shown = cluesFor(id).length; draw(); count();
    setTimeout(() => {
      busy = false; api.R.clock.resume(); i++; shown = 1; wrong = [];
      if (i >= sec.ids.length) { api.done(); return; }
      verdict.textContent = ''; verdict.className = 'lang-verdict center'; input.value = ''; input.disabled = false; draw(); window.scrollTo(0, 0); input.focus({ preventScroll: true });
    }, right ? 900 : 1800);
  }
  input.addEventListener('input', () => { if (busy || revealed) return; if (!strict && isRight(sec.ids[i], 'country', input.value)) end(true); else help.update(); });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return; e.preventDefault();
    if (busy || revealed || !input.value.trim()) return;
    if (isRight(sec.ids[i], 'country', input.value)) end(true); else if (countryFromText(input.value)) wrongGuess(); else help.enter();
  });
  draw(); input.focus({ preventScroll: true });
  return {
    completed() { head.classList.add('all-done'); },
    reveal(btn) { revealed = true; input.disabled = true; head.classList.add('gave-up'); list.replaceChildren(h('p', { class: 'eyebrow' }, 'The answers'), h('p', { class: 'namelist' }, sec.ids.slice(i).map((id) => BY_ID[id].name).join(' · '))); footer.hidden = false; footer.replaceChildren(btn); },
  };
}

/* Hot or cold (Globle style): a mystery country and a globe. Guess any country; it's painted on the globe by how
   close it is to the mystery one (dark red = bordering or very close, pale = far away), with the distance
   between their nearest borders. Unlimited guesses; "Reveal" gives up on that one (missed). 3 per game.
   Needs d3-geo (vendor/d3, ISC) and src/globe.js (outlines) — loaded by needGlobe() when the run starts. */
let globeFeatures = null;
function globeFeature(id) {
  if (!globeFeatures) {
    globeFeatures = {};
    Object.entries(window.GS_GLOBE).forEach(([k, rings]) => { globeFeatures[k] = { type: 'Feature', id: k, geometry: { type: 'MultiPolygon', coordinates: rings.map((r) => { const pts = []; for (let n = 0; n < r.length; n += 2) pts.push([r[n] / 5, r[n + 1] / 5]); return [pts]; }) } }; });
  }
  // Countries too small for the outlines: a small circle at their centre.
  if (!globeFeatures[id]) globeFeatures[id] = { type: 'Feature', id, geometry: d3.geoCircle().center([BY_ID[id].ll[1], BY_ID[id].ll[0]]).radius(0.7)() };
  return globeFeatures[id];
}
// Distance between two countries' nearest borders (0 = they touch), in km, from the outline points.
const BORDER_KM = {};
function borderKm(a, b) {
  if (a === b) return 0;
  const key = a < b ? a + b : b + a;
  if (BORDER_KM[key] != null) return BORDER_KM[key];
  if (BY_ID[a].nb.includes(b)) return (BORDER_KM[key] = 0);
  const pa = homePoints(a), pb = homePoints(b), R = Math.PI / 180;
  let best = Infinity;
  for (const [x1, y1] of pa) {
    const c1 = Math.cos(y1 * R);
    for (const [x2, y2] of pb) {
      const hv = Math.sin((y2 - y1) * R / 2) ** 2 + c1 * Math.cos(y2 * R) * Math.sin((x2 - x1) * R / 2) ** 2;
      if (hv < best) best = hv;
    }
  }
  return (BORDER_KM[key] = Math.round(2 * 6371 * Math.asin(Math.sqrt(best)) / 10) * 10);
}
// A country's own land for distances: its biggest piece plus pieces within ~1,000 km of it — so overseas
// territories don't count as the country (owner: French Guiana is its own thing, so France isn't "bordering" Brazil;
// same for Hawaii, the Canaries…). Kaliningrad, Alaska, Corsica and Svalbard stay with their country.
const HOME_PTS = {};
function homePoints(id) {
  if (HOME_PTS[id]) return HOME_PTS[id];
  const g = globeFeature(id).geometry, polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((p) => p[0]);
  if (polys.length === 1) return (HOME_PTS[id] = polys[0]);
  const area = (ring) => d3.geoArea({ type: 'Polygon', coordinates: [ring] });
  const big = polys.reduce((x, y) => (area(y) > area(x) ? y : x));
  const R = Math.PI / 180, near = (p, q) => { // closest points of two rings within 1,000 km?
    for (const [x1, y1] of p) for (const [x2, y2] of q) {
      const hv = Math.sin((y2 - y1) * R / 2) ** 2 + Math.cos(y1 * R) * Math.cos(y2 * R) * Math.sin((x2 - x1) * R / 2) ** 2;
      if (2 * 6371 * Math.asin(Math.sqrt(hv)) < 1000) return true;
    }
    return false;
  };
  const keep = polys.filter((p) => p === big || near(p, big));
  return (HOME_PTS[id] = [].concat(...keep));
}
const GLOBE_HEAT = [[0, '#7f0000'], [250, '#b30000'], [750, '#d7301f'], [1500, '#ef6548'], [2500, '#fc8d59'], [4000, '#fdbb84'], [6000, '#fdd49e'], [Infinity, '#fff3dc']];
const globeColour = (d) => GLOBE_HEAT.find(([max]) => d <= max)[1];
function hotGame(api) {
  const { sec, res } = api;
  let i = 0, busy = false, revealed = false, guesses = [], rot = [0, -20], scale = 1, spin = 0;
  const foundEl = h('span', { class: 'found num' });
  const input = countryBox('Guess any country…');
  const sugEl = h('div', { class: 'suggest', 'aria-live': 'polite', hidden: true });
  const list = h('ul', { class: 'hotlist' }), top = h('p', { class: 'eyebrow center' }), verdict = h('p', { class: 'lang-verdict center' });
  const giveBtn = h('button', { class: 'btn ghost small', style: { width: 'auto', flex: '0 0 auto' }, onmousedown: (e) => e.preventDefault(), onclick: () => end(false) }, 'Reveal');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'globe'); svg.setAttribute('viewBox', '0 0 400 400');
  const sphere = document.createElementNS(NS, 'path'); sphere.setAttribute('class', 'g-sea');
  const grat = document.createElementNS(NS, 'path'); grat.setAttribute('class', 'g-grat');
  const land = document.createElementNS(NS, 'g');
  svg.append(sphere, grat, land);
  const paths = {};
  DATA.forEach((c) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', 'g-cty'); land.appendChild(p); paths[c.id] = p; });
  const zoom = h('div', { class: 'zoom' }, h('button', { class: 'iconbtn', 'aria-label': 'Zoom in', onclick: () => { scale = Math.min(4, scale * 1.4); render(); } }, '+'), h('button', { class: 'iconbtn', 'aria-label': 'Zoom out', onclick: () => { scale = Math.max(1, scale / 1.4); render(); } }, '−'));
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = boardHead(api, [h('div', { class: 'progress' }, foundEl)]);
  mount(h('div', { class: 'app grid-run' }, head, h('div', { class: 'duel' }, top, h('div', { class: 'globewrap' }, svg, zoom), h('div', { class: 'row lang-type' }, input, giveBtn), sugEl, verdict, list), footer));
  const proj = d3.geoOrthographic().translate([200, 200]).clipAngle(90), gp = d3.geoPath(proj), graticule = d3.geoGraticule10();
  function render() {
    proj.scale(190 * scale).rotate(rot);
    sphere.setAttribute('d', gp({ type: 'Sphere' })); grat.setAttribute('d', gp(graticule));
    DATA.forEach((c) => paths[c.id].setAttribute('d', gp(globeFeature(c.id)) || ''));
  }
  // Turn the globe so a country is in the middle.
  function turnTo(id) {
    cancelAnimationFrame(spin);
    const [lat, lon] = BY_ID[id].ll, from = rot.slice(), to = [-lon, -lat], t0 = performance.now();
    let dl = to[0] - from[0]; dl = ((dl + 540) % 360) - 180;
    const step = (now) => { const t = Math.min(1, (now - t0) / 650), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; rot = [from[0] + dl * e, from[1] + (to[1] - from[1]) * e]; render(); if (t < 1) spin = requestAnimationFrame(step); };
    spin = requestAnimationFrame(step);
  }
  // Drag to spin.
  let drag = null;
  svg.addEventListener('pointerdown', (e) => { cancelAnimationFrame(spin); svg.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, rot: rot.slice() }; });
  svg.addEventListener('pointermove', (e) => { if (!drag) return; if (e.pointerType === 'mouse' && e.buttons === 0) { drag = null; return; } const k = 0.4 / scale; rot = [drag.rot[0] + (e.clientX - drag.x) * k, Math.max(-85, Math.min(85, drag.rot[1] - (e.clientY - drag.y) * k))]; render(); });
  const stop = () => { drag = null; }; svg.addEventListener('pointerup', stop); svg.addEventListener('pointercancel', stop); svg.addEventListener('lostpointercapture', stop);
  cleanup.push(() => cancelAnimationFrame(spin));
  const help = spellingHelp(input, sugEl, 'country', () => sec.ids[i], () => guess(), (text) => !!countryFromText(text));
  function count() { foundEl.textContent = res.found.length + ' found · ' + Math.max(0, sec.ids.length - i - (busy ? 1 : 0)) + ' left'; }
  function paint() {
    const target = sec.ids[i];
    DATA.forEach((c) => { const p = paths[c.id]; p.removeAttribute('data-hit'); p.style.fill = ''; });
    guesses.forEach((g) => { const p = paths[g]; if (g === target) p.setAttribute('data-hit', '1'); else p.style.fill = globeColour(borderKm(g, target)); });
    top.textContent = 'Mystery country ' + (i + 1) + ' of ' + sec.ids.length + (guesses.length ? ' · ' + guesses.length + (guesses.length === 1 ? ' guess' : ' guesses') : '');
    list.replaceChildren(...guesses.slice().sort((a, b) => borderKm(a, target) - borderKm(b, target)).map((g) => {
      const d = borderKm(g, target);
      return h('li', null, h('span', { class: 'swatch', style: { background: g === target ? 'var(--ok)' : globeColour(d) } }), flagImg(g), h('span', { class: 'hn' }, BY_ID[g].name), h('b', { class: 'num' }, g === target ? '✓' : d === 0 ? 'Bordering' : fmtKm(d)));
    }));
    count();
  }
  function guess() {
    if (busy || revealed) return;
    const g = countryFromText(input.value);
    if (!g) { shake(input); return; }
    input.value = ''; help.clear();
    if (guesses.includes(g)) { toast('Already guessed'); turnTo(g); return; }
    guesses.push(g); paint(); turnTo(g);
    if (g === sec.ids[i]) end(true);
  }
  function end(right) {
    if (busy || revealed) return;
    busy = true; api.R.clock.pause(); input.disabled = true; help.clear();
    const target = sec.ids[i];
    if (right) res.found.push(target); else { guesses.push(target); paint(); turnTo(target); }
    verdict.textContent = right ? '✓ ' + BY_ID[target].name + ' in ' + guesses.length : 'It was ' + BY_ID[target].name;
    verdict.className = 'lang-verdict center ' + (right ? 'ok' : 'bad');
    count();
    setTimeout(() => {
      busy = false; api.R.clock.resume(); i++; guesses = [];
      if (i >= sec.ids.length) { api.done(); return; }
      verdict.textContent = ''; verdict.className = 'lang-verdict center'; input.disabled = false; paint(); window.scrollTo(0, 0); input.focus({ preventScroll: true });
    }, right ? 1300 : 2200);
  }
  input.addEventListener('input', () => { if (!busy && !revealed) help.update(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (countryFromText(input.value)) guess(); else if (input.value.trim()) help.enter(); } });
  render(); paint(); input.focus({ preventScroll: true });
  return {
    completed() { head.classList.add('all-done'); },
    reveal(btn) { revealed = true; input.disabled = true; head.classList.add('gave-up'); list.replaceChildren(h('p', { class: 'eyebrow' }, 'The mystery countries'), h('p', { class: 'namelist' }, sec.ids.slice(i).map((id) => BY_ID[id].name).join(' · '))); footer.hidden = false; footer.replaceChildren(btn); },
  };
}

/* Closer or further: which of two countries is closer to a third? (Centre to centre.) Keys 1 / 2. */
function closerGame(api) {
  const { sec, res } = api;
  let i = 0, busy = false, revealed = false;
  const foundEl = h('span', { class: 'found num' });
  const arena = h('div', { class: 'duel' });
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = boardHead(api, h('div', { class: 'progress' }, foundEl));
  mount(h('div', { class: 'app grid-run' }, head, arena, footer));
  function count() { foundEl.textContent = res.found.length + ' right · ' + Math.max(0, sec.ids.length - i - (busy ? 1 : 0)) + ' left'; }
  function draw() {
    const [t, a, b] = sec.ids[i].split('|');
    arena.replaceChildren(h('p', { class: 'eyebrow center' }, 'Which is closer to'), h('div', { class: 'closer-target' }, flagImg(t, 34), h('b', null, BY_ID[t].name)),
      h('div', { class: 'duel-row' }, [a, b].map((id, k) => h('button', { class: 'duel-pick', 'data-id': id, onclick: () => pick(id) },
        h('span', { class: 'pic flagbox' }, h('img', { src: BY_ID[id].flag, alt: '', width: Math.round(BY_ID[id].ratio * 100), height: 100 })),
        h('b', null, BY_ID[id].name), h('small', { class: 'area' }, ''), h('span', { class: 'key' }, String(k + 1))))));
    count();
  }
  function pick(id) {
    if (busy || revealed || i >= sec.ids.length) return;
    busy = true; api.R.clock.pause();
    const key = sec.ids[i], win = closerOf(key), t = key.split('|')[0];
    if (id === win) res.found.push(key);
    arena.querySelectorAll('.duel-pick').forEach((btn) => { const bid = btn.getAttribute('data-id'); btn.classList.add(bid === win ? 'right' : bid === id ? 'wrong' : 'other'); btn.querySelector('.area').textContent = fmtKm(km(t, bid)); });
    count();
    setTimeout(() => { busy = false; api.R.clock.resume(); i++; if (i >= sec.ids.length) { api.done(); return; } draw(); }, id === win ? 800 : 1500);
  }
  const onKey = (e) => { if (busy || revealed || i >= sec.ids.length) return; const [, a, b] = sec.ids[i].split('|'); if (e.key === '1' || e.key === 'ArrowLeft') pick(a); else if (e.key === '2' || e.key === 'ArrowRight') pick(b); };
  document.addEventListener('keydown', onKey); cleanup.push(() => document.removeEventListener('keydown', onKey));
  draw();
  return {
    completed() { head.classList.add('all-done'); },
    reveal(btn) { revealed = true; head.classList.add('gave-up'); arena.replaceChildren(h('p', { class: 'eyebrow' }, 'Rounds left (closer one)'), h('ul', { class: 'pairs' }, sec.ids.slice(i).map((key) => { const [t] = key.split('|'), w = closerOf(key); return h('li', null, h('span', null, BY_ID[t].name), h('b', null, BY_ID[w].name + ' · ' + fmtKm(km(t, w)))); }))); footer.hidden = false; footer.replaceChildren(btn); },
  };
}

/* Letter rush: a letter; name as many countries (of the run's countries) starting with it as you can in 12 seconds.
   Right ones fill in; wrong ones just don't count. When time's up the ones you missed show, then the next letter. */
const letterMs = () => (S.session.cfg.lrSec || LETTER_SEC) * 1000;
function letterGame(api) {
  const { sec, res } = api;
  let li = 0, busy = false, revealed = false, endsAt = 0, timer = 0;
  const got = new Set();
  const foundEl = h('span', { class: 'found num' });
  const input = countryBox('Type a country…');
  const sugEl = h('div', { class: 'suggest', 'aria-live': 'polite', hidden: true });
  const big = h('div', { class: 'bigletter' }), left = h('p', { class: 'eyebrow center' }), slots = h('div', { class: 'slots' });
  const bar = h('i'), clockBar = h('div', { class: 'lettertime' }, bar);
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = boardHead(api, [h('div', { class: 'progress' }, foundEl)]);
  mount(h('div', { class: 'app grid-run' }, head, h('div', { class: 'duel' }, big, left, clockBar, h('div', { class: 'row lang-type' }, input), sugEl, slots), footer));
  const L = () => sec.letters[li];
  const match = (text) => L() ? L().ids.find((id) => !got.has(id) && isRight(id, 'country', text)) : null;
  const help = spellingHelp(input, sugEl, 'country', () => null, () => take(), (text) => !!match(text));
  function count() { const remaining = sec.ids.length - res.found.length - sec.letters.slice(0, li).reduce((n, x) => n + x.ids.filter((id) => !got.has(id)).length, 0); foundEl.textContent = res.found.length + ' found · ' + Math.max(0, remaining) + ' left'; }
  function draw(showAll) {
    const x = L();
    big.textContent = x.L;
    const n = x.ids.filter((id) => !got.has(id)).length;
    left.textContent = 'Letter ' + (li + 1) + ' of ' + sec.letters.length + ' · ' + n + ' to go';
    slots.replaceChildren(...x.ids.map((id) => h('span', { class: 'slot' + (got.has(id) ? ' got' : showAll ? ' shown' : '') }, got.has(id) || showAll ? BY_ID[id].name : '?')));
    count();
  }
  function tick() {
    if (revealed || busy) return;
    const ms = endsAt - performance.now();
    bar.style.width = Math.max(0, ms / letterMs() * 100) + '%';
    clockBar.classList.toggle('low', ms < Math.min(5000, letterMs() / 3));
    if (ms <= 0) return endLetter();
    timer = requestAnimationFrame(tick);
  }
  function startLetter() { endsAt = performance.now() + letterMs(); input.disabled = false; input.value = ''; help.clear(); draw(false); input.focus({ preventScroll: true }); cancelAnimationFrame(timer); timer = requestAnimationFrame(tick); }
  function take() {
    const id = match(input.value); if (!id || busy) return;
    got.add(id); res.found.push(id); input.value = ''; help.clear(); draw(false);
    if (L().ids.every((x) => got.has(x))) endLetter();
  }
  function endLetter() {
    if (busy) return;
    busy = true; cancelAnimationFrame(timer); api.R.clock.pause(); input.disabled = true; draw(true);
    setTimeout(() => { busy = false; api.R.clock.resume(); li++; if (li >= sec.letters.length) { api.done(); return; } startLetter(); }, L().ids.every((x) => got.has(x)) ? 600 : 1800);
  }
  input.addEventListener('input', () => { if (busy || revealed) return; if (match(input.value)) take(); else help.update(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!busy && !revealed) { if (match(input.value)) take(); else if (input.value.trim()) help.enter(); } } });
  cleanup.push(() => cancelAnimationFrame(timer));
  startLetter();
  return {
    completed() { head.classList.add('all-done'); },
    reveal(btn) {
      revealed = true; cancelAnimationFrame(timer); input.disabled = true; head.classList.add('gave-up');
      slots.replaceChildren(...sec.letters.slice(li).flatMap((x) => x.ids).map((id) => h('span', { class: 'slot' + (got.has(id) ? ' got' : ' shown') }, BY_ID[id].name)));
      footer.hidden = false; footer.replaceChildren(btn);
    },
  };
}

/* Flag finder (Seterra style): a country's name; find its flag among all the flags and tap it. 3 wrong taps
   and its flag flashes red — tap it to go on (it counts as missed). */
function flagpickGame(api) {
  const { sec, res } = api;
  const queue = sec.ids.slice(), tries = res.tries;
  let must = null, revealed = false;
  const foundEl = h('span', { class: 'found num' });
  const target = h('b', { class: 'target' }), hint = h('div', { class: 'maphint', 'aria-live': 'polite' });
  const tiles = {};
  const grid = h('div', { class: 'tiles t-flags flagpick' }, sec.grid.map((id) => (tiles[id] = h('button', { class: 'tile', 'data-id': id, 'aria-label': 'A flag', onclick: () => tap(id) }, tilePic('flags', id), h('span', { class: 'lbl' })))));
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = boardHead(api, [h('div', { class: 'prompt' }, h('span', { class: 'findlbl' }, h('span', { class: 'eyebrow' }, 'Find'), foundEl), target), hint]);
  mount(h('div', { class: 'app wide grid-run' }, head, grid, footer));
  let missedN = 0;
  function count() { foundEl.textContent = res.found.length + ' found · ' + queue.length + ' left'; }
  function ask() { if (!queue.length) { target.textContent = 'Done!'; api.done(); return; } target.textContent = BY_ID[queue[0]].name; const t = tries[queue[0]] || 0; hint.textContent = t ? '✗'.repeat(t) + ' ' + (MAP_TRIES - t) + ' tries left' : ''; count(); }
  function tap(id) {
    if (revealed) { hint.textContent = BY_ID[id].name; return; }
    const cur = queue[0]; if (!cur) return;
    if (must) { if (id === must) { tiles[must].classList.remove('must'); tiles[must].classList.add('missed'); tiles[must].querySelector('.lbl').textContent = BY_ID[must].name; grid.appendChild(tiles[must]); must = null; missedN++; queue.shift(); ask(); } return; }
    if (tiles[id].classList.contains('done') || tiles[id].classList.contains('missed')) return;
    if (id === cur) {
      const t = tries[cur] || 0;
      res.found.push(cur); tiles[cur].classList.add('done', 'g' + t); tiles[cur].querySelector('.lbl').textContent = BY_ID[cur].name;
      grid.appendChild(tiles[cur]); // found flags go to the back, so the ones left are up front (owner)
      queue.shift(); ask(); return;
    }
    tries[cur] = (tries[cur] || 0) + 1;
    tiles[id].classList.remove('wrongflash'); void tiles[id].offsetWidth; tiles[id].classList.add('wrongflash');
    try { navigator.vibrate && navigator.vibrate(40); } catch (e) { /* no vibration */ }
    if (tries[cur] >= MAP_TRIES) { must = cur; tiles[cur].classList.add('must'); tiles[cur].scrollIntoView({ block: 'center', behavior: 'smooth' }); hint.textContent = '✗ That\'s ' + BY_ID[id].name + '. Tap the flashing flag to go on.'; }
    else hint.textContent = '✗ That\'s ' + BY_ID[id].name + ' · ' + (MAP_TRIES - tries[cur]) + ' tries left';
  }
  ask();
  return {
    completed() { head.classList.add('all-done'); },
    reveal(btn) {
      revealed = true; head.classList.add('gave-up');
      queue.forEach((id) => { tiles[id].classList.add('missed'); tiles[id].querySelector('.lbl').textContent = BY_ID[id].name; });
      target.textContent = queue.length + ' missed (in red)'; hint.textContent = '';
      footer.hidden = false; footer.replaceChildren(btn); window.scrollTo(0, 0);
    },
  };
}

/* Border chain (Travle style): get from A to B over land. Type countries; each one is coloured by how useful
   it is — green: on a shortest route, yellow: close to one, red: off course. Solved once your countries join
   A to B. You get (shortest + 4) guesses; either way the shortest route is shown at the end. */
function chainGame(api) {
  const { sec, res } = api;
  const M = window.GS_MAP, md = M.world;
  let i = 0, busy = false, revealed = false, guesses = [];
  const foundEl = h('span', { class: 'found num' });
  const input = countryBox('Type a country on the way…');
  const sugEl = h('div', { class: 'suggest', 'aria-live': 'polite', hidden: true });
  const title = h('div', { class: 'chain-title' }), info = h('p', { class: 'eyebrow center' }), verdict = h('p', { class: 'lang-verdict center' });
  const chips = h('div', { class: 'chain-chips' });
  const paths = {}, dots = h('g', null);
  // Travle style: only the start, the end and the countries you've named are drawn — nothing else gives it away.
  const svg = h('svg', { class: 'map chainmap', preserveAspectRatio: 'xMidYMid meet' }, h('rect', { class: 'sea', x: -md.w, y: -md.h, width: md.w * 3, height: md.h * 3 }),
    ...Object.entries(md.c).map(([id, d]) => (paths[id] = h('path', { class: 'cty', d, 'data-id': id }))), dots);
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = boardHead(api, [h('div', { class: 'progress' }, foundEl)]);
  mount(h('div', { class: 'app grid-run' }, head, h('div', { class: 'duel' }, title, info, h('div', { class: 'chainwrap' }, svg), chips, h('div', { class: 'row lang-type' }, input), sugEl, verdict), footer));
  const help = spellingHelp(input, sugEl, 'country', () => null, () => guess(), (text) => !!countryFromText(text));
  const ends = () => sec.ids[i].split('~');
  const D = () => { const [a, b] = ends(); return hops(a)[b]; };
  const allowed = () => D() - 1 + 4;
  // How useful a guess is: on a shortest route (green), at most 2 steps off (yellow), or not (red).
  function colour(g) { const [a, b] = ends(), da = hops(a)[g], db = hops(b)[g]; if (da == null || db == null) return 'far'; const s = da + db; return s === D() ? 'on' : s <= D() + 2 ? 'near' : 'far'; }
  // Joined up: a path from a to b through only your guesses.
  function joined() { const [a, b] = ends(), ok = new Set(guesses.concat([b])), seen = new Set([a]), q = [a]; while (q.length) { const x = q.shift(); for (const n of BY_ID[x].nb) { if (n === b) return true; if (ok.has(n) && !seen.has(n)) { seen.add(n); q.push(n); } } } return false; }
  function count() { foundEl.textContent = res.found.length + ' solved · ' + Math.max(0, sec.ids.length - i - (busy ? 1 : 0)) + ' left'; }
  // A country's main part (so France is mainland France, not French Guiana too; Russia isn't the whole top).
  const boxes = {};
  function mainBox(id) {
    if (boxes[id]) return boxes[id];
    const parts = (paths[id].getAttribute('d') || '').split(/(?=M)/).filter(Boolean), tmp = h('path', { style: { visibility: 'hidden' } }); svg.appendChild(tmp);
    const bbs = parts.map((d) => { tmp.setAttribute('d', d); const b = tmp.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }); tmp.remove();
    const big = bbs.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a)), reach = Math.max(2 * Math.hypot(big.w, big.h), 1);
    const near = bbs.filter((b) => Math.hypot(b.x + b.w / 2 - big.x - big.w / 2, b.y + b.h / 2 - big.y - big.h / 2) <= reach);
    const x0 = Math.min(...near.map((b) => b.x)), y0 = Math.min(...near.map((b) => b.y));
    return (boxes[id] = { x: x0, y: y0, w: Math.max(...near.map((b) => b.x + b.w)) - x0, h: Math.max(...near.map((b) => b.y + b.h)) - y0 });
  }
  function frame(ids) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ids.forEach((id) => { if (!paths[id]) return; const b = mainBox(id); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
    const r = svg.getBoundingClientRect(), ar = (r.width || 4) / (r.height || 3), pad = Math.max(x1 - x0, y1 - y0) * 0.12 + 8;
    let w = x1 - x0 + 2 * pad, hh = y1 - y0 + 2 * pad; if (w / hh > ar) hh = w / ar; else w = hh * ar;
    svg.setAttribute('viewBox', [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - hh / 2, w, hh].map((v) => Math.round(v * 10) / 10).join(' '));
    // Tiny countries (Vatican City, Monaco…) get a dot so you can see them.
    dots.replaceChildren(...ids.filter((id) => paths[id] && Math.max(mainBox(id).w, mainBox(id).h) < w / 45).map((id) => { const b = mainBox(id); return h('circle', { class: 'dot', cx: b.x + b.w / 2, cy: b.y + b.h / 2, r: w / 70, 'data-st': paths[id].getAttribute('data-st') || 'end' }); }));
  }
  function draw(showRoute) {
    const [a, b] = ends(), route = shortestRoute(a, b);
    title.replaceChildren(flagImg(a, 28), h('b', null, BY_ID[a].name), h('span', { class: 'arrow' }, '→'), flagImg(b, 28), h('b', null, BY_ID[b].name));
    info.textContent = 'Puzzle ' + (i + 1) + ' of ' + sec.ids.length + ' · guesses left ' + Math.max(0, allowed() - guesses.length) + ' · shortest: ' + (D() - 1) + ' in between';
    Object.values(paths).forEach((p) => p.removeAttribute('data-st'));
    paths[a] && paths[a].setAttribute('data-st', 'end'); paths[b] && paths[b].setAttribute('data-st', 'end');
    guesses.forEach((g) => paths[g] && paths[g].setAttribute('data-st', 'c-' + colour(g)));
    if (showRoute) route.slice(1, -1).forEach((g) => { if (!guesses.includes(g) && paths[g]) paths[g].setAttribute('data-st', 'c-route'); });
    chips.replaceChildren(...guesses.map((g) => h('span', { class: 'chip c-' + colour(g) }, BY_ID[g].name)));
    requestAnimationFrame(() => frame((showRoute ? route : [a, b]).concat(guesses)));
    count();
  }
  function guess() {
    if (busy || revealed) return;
    const g = countryFromText(input.value);
    if (!g) { shake(input); return; }
    input.value = ''; help.clear();
    const [a, b] = ends();
    if (g === a || g === b || guesses.includes(g)) { toast(guesses.includes(g) ? 'Already guessed' : 'That\'s the start or the end'); return; }
    guesses.push(g); draw(false);
    if (joined()) return end(true);
    if (guesses.length >= allowed()) end(false);
  }
  function end(right) {
    busy = true; api.R.clock.pause(); input.disabled = true;
    const [a, b] = ends(), key = sec.ids[i];
    if (right) res.found.push(key);
    verdict.replaceChildren(h('span', null, (right ? '✓ Joined up in ' + guesses.length + ' · ' : '✗ ') + 'Shortest: '), h('b', null, shortestRoute(a, b).map((x) => BY_ID[x].name).join(' → ')));
    verdict.className = 'lang-verdict center chain-verdict ' + (right ? 'ok' : 'bad');
    draw(true);
    setTimeout(() => {
      busy = false; api.R.clock.resume(); i++; guesses = [];
      if (i >= sec.ids.length) { api.done(); return; }
      verdict.replaceChildren(); verdict.className = 'lang-verdict center'; input.disabled = false; draw(false); window.scrollTo(0, 0); input.focus({ preventScroll: true });
    }, 2600);
  }
  input.addEventListener('input', () => { if (!busy && !revealed) help.update(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (countryFromText(input.value)) guess(); else if (input.value.trim()) help.enter(); } });
  draw(false); input.focus({ preventScroll: true });
  return {
    completed() { head.classList.add('all-done'); },
    reveal(btn) {
      revealed = true; input.disabled = true; head.classList.add('gave-up');
      verdict.replaceChildren(h('ul', { class: 'pairs' }, sec.ids.slice(i).map((key) => { const [a, b] = key.split('~'); return h('li', null, h('span', null, BY_ID[a].name + ' → ' + BY_ID[b].name), h('b', null, shortestRoute(a, b).slice(1, -1).map((x) => BY_ID[x].name).join(' → '))); })));
      verdict.className = 'center';
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
  catch (e) { copyBox('Copy this link and send it', url); }
}

// What you missed, per game.
function missedBoard(sec) {
  const G = gameOf(sec.game);
  const head = h('p', { class: 'eyebrow' }, G.em + ' ' + G.label + ' · ' + sec.found.length + '/' + sec.ids.length + (sec.skipped ? ' (not played)' : sec.timeUp ? " (time's up)" : sec.gaveUp ? ' (gave up)' : ''));
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
  } else if (sec.game === 'chain') {
    body = h('ul', { class: 'pairs' }, sec.missed.map((key) => { const [a, b] = key.split('~'); return h('li', null, h('span', null, BY_ID[a].name + ' → ' + BY_ID[b].name), h('b', null, shortestRoute(a, b).slice(1, -1).map((x) => BY_ID[x].name).join(' → '))); }));
  } else if (sec.game === 'closer') {
    body = h('ul', { class: 'pairs' }, sec.missed.map((key) => { const [t] = key.split('|'), w = closerOf(key); return h('li', null, h('span', null, 'Closer to ' + BY_ID[t].name), h('b', null, BY_ID[w].name)); }));
  } else if (sec.game === 'currency') {
    body = h('ul', { class: 'pairs' }, sec.missed.map((key) => h('li', null, h('span', null, currencyClue(key)), h('b', null, BY_ID[key.split('~')[0]].name))));
  } else if (sec.game === 'lang') {
    body = langList(sec.missed);
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
    return h('li', null, pic, h('div', { class: 'q' }, answerText(x.id, x.kind), h('small', null, x.kind === 'capital' ? 'Capital of ' + c.name : x.kind === 'flag' ? 'Flag' : x.kind === 'revcap' ? 'Capital: ' + c.capital : x.kind === 'scramble' ? 'Unscramble' : 'Outline')), h('span', { class: 'x' }, x.how === 'skip' ? 'SKIP +10s' : 'WRONG +5s'));
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
  document.querySelectorAll('.livebar').forEach((e) => e.remove());
  const se = S.session, many = se.players.length > 1, last = se.idx >= se.players.length - 1, board = se.cfg.kind === 'board';
  mount(h('div', { class: 'app' },
    topbar(cfgLabel(se.cfg), null),
    h('div', { class: 'center stack', style: { gap: '6px' } },
      many ? h('p', { class: 'eyebrow' }, score.name) : null,
      h('div', { class: 'result-time' }, se.practice ? score.correct + '/' + score.total : fmtTime(score.time)),
      se.practice ? h('p', { class: 'small muted' }, '🧘 Practice') : null,
      score.best ? h('div', null, h('span', { class: 'badge' }, '★ New best on this device')) : null,
      se.help ? h('p', { class: 'small muted' }, '💡 With spelling help') : null,
      se.daily != null ? h('p', { class: 'small muted' }, '📅 Daily · ' + dayLabel(se.daily)) : null),
    se.daily != null ? h('button', { class: 'btn gold small', onclick: () => shareDaily(se.daily, store.get('gs_daily_v1', {})[se.daily] || score) }, '📤 Share today\'s result') : null,
    versus(score, se.challenge, se.cfg.kind),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, score.correct + '/' + score.total), h('span', null, board ? 'Found' : 'Right')),
      board ? h('div', { class: 'stat' }, h('b', null, Math.round(score.correct / score.total * 100) + '%'), h('span', null, 'Score')) : h('div', { class: 'stat' }, h('b', null, fmtTime(score.raw)), h('span', null, 'Clock')),
      board ? h('div', { class: 'stat' }, h('b', null, String(score.sections.length)), h('span', null, score.sections.length > 1 ? 'Games' : 'Game')) : h('div', { class: 'stat' }, h('b', null, '+' + score.pen / 1000 + 's'), h('span', null, 'Penalty'))),
    many && !last ? h('button', { class: 'btn primary', onclick: () => { se.idx++; cover(); } }, 'Next: ' + se.players[se.idx + 1] + ' →') : null,
    many && last ? h('button', { class: 'btn primary', onclick: leaderboard }, '🏁 See who won') : null,
    se.live ? liveResults() : null,
    !many && !se.practice && !se.live ? h('div', { class: 'card sky' },
      h('p', { class: 'eyebrow' }, 'Challenge a friend'),
      h('div', { class: 'code num' }, encodeCode(se.cfg)),
      !S.myName && score.name === 'You' ? nameField() : null,
      h('button', { class: 'btn primary small', onclick: () => { if (score.name === 'You' && S.myName) score.name = S.myName; share(se.cfg, score); } }, '📤 Send challenge')) : null,
    h('div', { class: 'stack' }, board ? score.sections.map(missedBoard) : missedQuick(score)),
    se.live ? h('button', { class: 'btn ghost small', onclick: () => home() }, '⌂ Leave room') : !many ? afterButtons() : null,
  ));
}
function afterButtons() {
  const se = S.session;
  return h('div', { class: 'stack' },
    h('div', { class: 'row' },
      h('button', { class: 'btn primary small', onclick: () => startSession(Object.assign({}, se.cfg, { seed: newSeed() }), se.players, null, null, se.practice) }, '🎲 Play again'),
      se.daily == null ? h('button', { class: 'btn ghost small', onclick: () => startSession(se.cfg, se.players, se.challenge, se.daily, se.practice) }, '↻ Same order') : null),
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
    h('button', { class: 'btn ghost small', onclick: async () => { try { await navigator.clipboard.writeText(resultText); toast('Results copied'); } catch (e) { copyBox('Copy the results', resultText); } } }, '📋 Copy results'),
    afterButtons()));
}

/* ---- Online race (Firebase Realtime Database) ----
   One phone creates a room (a 5-letter code), friends join with the code or the link, the host starts, and
   everyone plays the same run at the same moment on their own phone. Each phone sends its progress (how many
   found) a couple of times a second; a live bar shows the standings, and the results show everyone.

   Data, in the database: rooms/CODE = { host, cfg, round, state: 'lobby' | 'play', startAt, createdAt,
     players: { uid: { name, joined, found, sec, done, time, correct, total, round } } }
   Players sign in anonymously (no account). Rules: database.rules.json (paste into the Firebase console).

   NET hides the backend: Firebase normally; with ?net=local a stand-in that keeps rooms in localStorage and
   works between tabs of one browser (used by the tests, which can't reach Firebase). */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC44-tG1wwY7dWpNCNe8_57eFpzWvPW0pg',
  authDomain: 'geography-speedrun.firebaseapp.com',
  databaseURL: 'https://geography-speedrun-default-rtdb.firebaseio.com',
  projectId: 'geography-speedrun',
  storageBucket: 'geography-speedrun.firebasestorage.app',
  messagingSenderId: '333346422677',
  appId: '1:333346422677:web:25962b0b04a1a87687c09c',
};
const ROOM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const LOCAL_NET = new URLSearchParams(location.search).get('net') === 'local' || window.GS_NET === 'local';

const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });

function firebaseNet() {
  let db, uid, offset = 0;
  return {
    async init() {
      if (uid) return uid;
      if (!window.firebase) {
        await loadScript('vendor/firebase/firebase-app-compat.js');
        await Promise.all([loadScript('vendor/firebase/firebase-auth-compat.js'), loadScript('vendor/firebase/firebase-database-compat.js')]);
      }
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      const cred = await firebase.auth().signInAnonymously();
      uid = cred.user.uid;
      db = firebase.database();
      db.ref('.info/serverTimeOffset').on('value', (s) => { offset = s.val() || 0; });
      return uid;
    },
    uid: () => uid,
    now: () => Date.now() + offset,
    async create(code, room) { const r = await db.ref('rooms/' + code).transaction((cur) => (cur === null ? room : undefined)); return r.committed; },
    async get(code) { return (await db.ref('rooms/' + code).get()).val(); },
    update(path, obj) { return db.ref(path).update(obj); },
    watch(code, cb) { const ref = db.ref('rooms/' + code); const f = (s) => cb(s.val()); ref.on('value', f); return () => ref.off('value', f); },
    onLeave(path) { db.ref(path).onDisconnect().update({ gone: true }); },
  };
}
function localNet() {
  const KEY = 'gs_net_local_v1';
  const all = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const save = (v) => { localStorage.setItem(KEY, JSON.stringify(v)); window.dispatchEvent(new Event('gs-local-net')); };
  const setPath = (obj, path, val) => { const ks = path.split('/'); let o = obj; ks.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; }); o[ks[ks.length - 1]] = val; };
  let uid = null;
  return {
    async init() { uid = uid || sessionStorage.getItem('gs_local_uid') || 'u' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('gs_local_uid', uid); return uid; },
    uid: () => uid,
    now: () => Date.now(),
    async create(code, room) { const v = all(); if (v.rooms && v.rooms[code]) return false; setPath(v, 'rooms/' + code, room); save(v); return true; },
    async get(code) { const v = all(); return (v.rooms && v.rooms[code]) || null; },
    async update(path, obj) { const v = all(); Object.entries(obj).forEach(([k, val]) => setPath(v, path + '/' + k, val)); save(v); },
    watch(code, cb) {
      const f = () => { const v = all(); cb((v.rooms && v.rooms[code]) || null); };
      window.addEventListener('storage', f); window.addEventListener('gs-local-net', f); setTimeout(f, 0);
      return () => { window.removeEventListener('storage', f); window.removeEventListener('gs-local-net', f); };
    },
    onLeave() {},
  };
}
const NET = LOCAL_NET ? localNet() : firebaseNet();

/* ---------------- screens ---------------- */
const LIVE = { code: null, room: null, unwatch: null, startedRound: 0, reporter: null };
function liveStop() { if (LIVE.unwatch) LIVE.unwatch(); LIVE.unwatch = null; if (LIVE.reporter) clearInterval(LIVE.reporter); LIVE.reporter = null; document.querySelectorAll('.livebar').forEach((e) => e.remove()); }
const myName = () => S.myName || 'Player';
async function liveReady() {
  try { await NET.init(); return true; } catch (e) { toast('Couldn\'t connect. Check your internet.'); return false; }
}

// Host: make a room with this run, then wait in the lobby.
async function liveCreate(cfg) {
  if (!S.myName) return toast('Add your name first');
  mount(h('div', { class: 'app' }, h('div', { class: 'cover' }, h('p', { class: 'muted' }, 'Connecting…'))));
  if (!(await liveReady())) return setup();
  for (let tries = 0; tries < 6; tries++) {
    const code = Array.from({ length: 5 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join('');
    const room = { host: NET.uid(), cfg, round: 0, state: 'lobby', createdAt: NET.now(), players: { [NET.uid()]: { name: myName(), joined: NET.now() } } };
    try { if (await NET.create(code, room)) return liveLobby(code); } catch (e) { break; }
  }
  toast('Couldn\'t make a room. Try again.'); setup();
}

// The Online screen (home → 🌐 Online): host a match, join one (code, link or QR), or play a challenge code.
async function liveJoin(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 5) return toast('Room codes are 5 letters');
  if (!S.myName) return toast('Add your name first');
  if (!(await liveReady())) return;
  let room;
  try { room = await NET.get(code); } catch (e) { return toast('Couldn\'t connect. Check your internet.'); }
  if (!room) return toast('Room not found');
  if (room.state === 'play' && !(room.players && room.players[NET.uid()])) return toast('That race has started');
  await NET.update('rooms/' + code + '/players/' + NET.uid(), { name: myName(), joined: NET.now(), gone: null });
  liveLobby(code);
}
function onlineHub(prefill) {
  if (typeof prefill !== 'string') prefill = '';
  let room, chal, chalInfo;
  const playChallenge = () => {
    const cfg = decodeCode(chal.value);
    if (!cfg) return toast('Code not found');
    startSession(cfg, [S.myName || 'You'], null);
  };
  const checkChal = () => { const cfg = decodeCode(chal.value); chalInfo.textContent = cfg ? '✓ ' + cfgLabel(cfg) : ''; };
  mount(h('div', { class: 'app', 'data-screen': 'online' }, topbar('Online', home),
    nameField(),
    h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Host a match'),
      h('button', { class: 'btn primary', onclick: () => { if (!S.myName) return toast('Add your name first'); S.setup.kind = 'board'; S.setup.group = 'live'; store.set('gs_setup_v2', S.setup); setup(); } }, '🌐 Host match')),
    h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Join a match'),
      room = h('input', { class: 'input code', style: { fontSize: '30px' }, placeholder: 'ABCDE', maxlength: 5, value: prefill, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Room code', onkeydown: (e) => { if (e.key === 'Enter') liveJoin(room.value); } }),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost small', onclick: () => scanQR((code) => { room.value = code; liveJoin(code); }) }, '📷 Scan QR'),
        h('button', { class: 'btn primary small', onclick: () => liveJoin(room.value) }, 'Join'))),
    (() => { const c = h2hCard(); return c ? h('div', { class: 'card' }, c) : null; })(),
    h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Challenge code'),
      chal = h('input', { class: 'input code', style: { fontSize: '24px' }, placeholder: 'ABCD-1234', maxlength: 20, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Challenge code', oninput: () => checkChal(), onkeydown: (e) => { if (e.key === 'Enter') playChallenge(); } }),
      chalInfo = h('p', { class: 'small muted' }),
      h('button', { class: 'btn ghost small', onclick: playChallenge }, '▶ Play'))));
}
// Kept for old links/buttons.
const liveJoinScreen = (code) => onlineHub(code);

/* ---------------- QR codes ---------------- */
// Draw a QR code (dark on white so any phone camera can read it).
async function qrSvg(text) {
  if (!window.qrcode) await loadScript('vendor/qr/qrcode.js');
  const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(), m = 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + (n + 2 * m) + ' ' + (n + 2 * m)); svg.setAttribute('class', 'qr'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR code to join');
  svg.innerHTML = '<rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#0f0c21" shape-rendering="crispEdges"/>';
  return svg;
}
// Scan a QR code with the camera; calls back with the room code.
async function scanQR(onCode) {
  const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
  const msg = h('p', { class: 'small muted center' }, 'Point at the QR code');
  let stream = null, done = false;
  const stop = () => { done = true; if (stream) stream.getTracks().forEach((t) => t.stop()); bg.remove(); };
  const bg = modal(h('p', { class: 'eyebrow' }, 'Scan to join'), video, msg, h('button', { class: 'btn ghost small', onclick: stop }, 'Cancel'));
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
  catch (e) { msg.textContent = 'Camera not available. Type the code instead.'; return; }
  video.srcObject = stream; video.play().catch(() => {});
  const detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
  if (!detector && !window.jsQR) { try { await loadScript('vendor/qr/jsQR.js'); } catch (e) { msg.textContent = 'Scanner didn\'t load. Type the code instead.'; return; } }
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const found = (text) => {
    const m = /[?&]room=([A-Za-z]{5})/.exec(text || '') || /^\s*([A-Za-z]{5})\s*$/.exec(text || '');
    if (!m) { msg.textContent = 'That QR code isn\'t a room'; return false; }
    stop(); onCode(m[1].toUpperCase()); return true;
  };
  const tick = async () => {
    if (!done && !document.body.contains(bg)) stop(); // closed by tapping outside
    if (done) return;
    if (video.readyState >= 2) {
      try {
        if (detector) { const r = await detector.detect(video); if (r[0] && found(r[0].rawValue)) return; }
        else {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight; ctx.drawImage(video, 0, 0);
          const r = window.jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
          if (r && found(r.data)) return;
        }
      } catch (e) { /* try the next frame */ }
    }
    setTimeout(tick, 200);
  };
  tick();
}

function liveLink(code) { return location.origin + location.pathname + '?room=' + code; }
function liveLobby(code) {
  liveStop();
  LIVE.code = code;
  NET.onLeave('rooms/' + code + '/players/' + NET.uid());
  const list = h('ul', { class: 'list board' });
  const startBtn = h('button', { class: 'btn primary', onclick: () => liveStartRound() }, '▶ Start race');
  const wait = h('p', { class: 'muted center' }, 'Waiting for the host…');
  const what = h('p', { class: 'muted center' });
  const qrBox = h('div', { class: 'qrbox' });
  mount(h('div', { class: 'app' }, topbar('Online race', () => { liveStop(); home(); }),
    h('div', { class: 'center stack', style: { gap: '4px' } }, h('p', { class: 'eyebrow' }, 'Room'), h('div', { class: 'code roomcode' }, code), what),
    qrBox,
    h('div', { class: 'linkrow' }, h('input', { class: 'input', readonly: true, value: liveLink(code), 'aria-label': 'Join link', onfocus: (e) => e.target.select() }),
      h('button', { class: 'btn ghost small', onclick: async () => { try { await navigator.clipboard.writeText(liveLink(code)); toast('Link copied'); } catch (e) { copyBox('Copy the link', liveLink(code)); } } }, 'Copy')),
    h('button', { class: 'btn ghost small', onclick: () => shareRoom(code) }, '📤 Share'),
    list, startBtn, wait));
  qrSvg(liveLink(code)).then((svg) => qrBox.replaceChildren(svg)).catch(() => qrBox.remove());
  LIVE.unwatch = NET.watch(code, (room) => {
    if (!room) { toast('The room was closed'); liveStop(); home(); return; }
    LIVE.room = room;
    const host = room.host === NET.uid();
    what.textContent = cfgLabel(room.cfg);
    needAssets(room.cfg).catch(() => {}); // fetch what the games need while waiting
    const ps = Object.entries(room.players || {}).filter(([, p]) => !p.gone);
    list.replaceChildren(...ps.map(([id, p]) => h('li', null, h('span', { class: 'rank' }, id === room.host ? '★' : '•'), h('div', { class: 'q' }, p.name + (id === NET.uid() ? ' (you)' : '')))));
    startBtn.hidden = !host; wait.hidden = host;
    if (room.state === 'play' && room.round > LIVE.startedRound) liveBegin(room);
  });
}
async function shareRoom(code) {
  const url = liveLink(code), text = 'Race me in Geography Speedrun! Room ' + code;
  if (navigator.share) { try { await navigator.share({ title: 'Geography Speedrun race', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + '\n' + url); toast('Invite copied'); } catch (e) { copyBox('Send this link', url); }
}
// Host: start (or restart) the race 4 seconds from now, for everyone. A new round gets a new order.
async function liveStartRound(next) {
  const room = LIVE.room; if (!room || room.host !== NET.uid()) return;
  S.liveNext = null;
  const round = (room.round || 0) + 1;
  const reset = {};
  Object.keys(room.players || {}).forEach((id) => { reset['players/' + id + '/found'] = 0; reset['players/' + id + '/done'] = null; reset['players/' + id + '/time'] = null; reset['players/' + id + '/correct'] = null; reset['players/' + id + '/round'] = round; });
  // The host's new choice from the setup screen, or the same games with a new order.
  const cfg = next || (round === 1 ? room.cfg : Object.assign({}, room.cfg, { seed: newSeed() }));
  await NET.update('rooms/' + LIVE.code, Object.assign(reset, { cfg, round, state: 'play', picking: null, startAt: NET.now() + 4000 }));
}
// Everyone: the countdown runs to the shared start time, then the same run starts on every phone.
function liveBegin(room) {
  LIVE.startedRound = room.round;
  if (!assetsReady(room.cfg)) { needAssets(room.cfg).then(() => liveBegin2(room), () => toast('Couldn\'t load the game')); return; }
  liveBegin2(room);
}
function liveBegin2(room) {
  const code = LIVE.code;
  startSession(room.cfg, [myName()], null, null, false);
  S.session.live = { code, round: room.round };
  const el = h('div', { class: 'cd', 'aria-live': 'assertive' }, '');
  mount(h('div', { class: 'app' }, h('div', { class: 'cover' }, h('p', { class: 'eyebrow' }, 'Room ' + code + ' · round ' + room.round), el, h('p', { class: 'muted' }, howTo(room.cfg)))));
  const go = () => {
    const left = room.startAt - NET.now();
    if (left <= 0) {
      const begin = () => { boardRun(); liveBar(); };
      if (room.cfg.games.some((g) => NEEDS_MAP.has(g)) && !window.GS_MAP) loadMap().then(begin, () => toast('The map didn\'t load'));
      else begin();
      return;
    }
    el.textContent = String(Math.ceil(left / 1000));
    setTimeout(go, Math.min(250, left));
  };
  go();
}
// While playing: send my progress whenever it changes (at most twice a second).
function liveReporter(R) {
  const se = S.session, path = 'rooms/' + se.live.code + '/players/' + NET.uid();
  let last = -1, lastAt = 0;
  // Send when it changes, and again every few seconds anyway (in case an update got lost on a bad connection).
  const flush = () => {
    if (S.session !== se || R.clock.over) return;
    const found = R.results.reduce((n, r) => n + (r ? r.found.length : 0), 0);
    if (found !== last || Date.now() - lastAt > 3000) { last = found; lastAt = Date.now(); NET.update(path, { found, sec: R.sec }).catch(() => {}); }
  };
  if (LIVE.reporter) clearInterval(LIVE.reporter);
  LIVE.reporter = setInterval(() => { if (S.session !== se || R.clock.over) { clearInterval(LIVE.reporter); LIVE.reporter = null; return; } flush(); }, 500);
  // Send straight away when the app goes to the background (switching apps, locking the phone).
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide); cleanup.push(() => document.removeEventListener('visibilitychange', onHide));
  window.addEventListener('pagehide', flush);
}
function liveFinished(score) {
  const se = S.session;
  if (LIVE.reporter) { clearInterval(LIVE.reporter); LIVE.reporter = null; }
  NET.update('rooms/' + se.live.code + '/players/' + NET.uid(), { found: score.correct, correct: score.correct, total: score.total, time: score.time, done: true }).catch(() => {});
}
// Standings, best first: finished players by score then time, then everyone else by how many they've found.
function liveStandings(room) {
  const total = cfgTotal(room.cfg);
  return Object.entries(room.players || {}).filter(([, p]) => !p.gone || p.done).map(([id, p]) => ({ id, name: p.name, found: p.found || 0, sec: p.sec || 0, done: !!p.done, time: p.time, correct: p.correct, total }))
    .sort((a, b) => (b.done && a.done) ? (b.correct - a.correct || a.time - b.time) : (b.found - a.found || (b.done ? 1 : 0) - (a.done ? 1 : 0)));
}
// Which game a friend who's still playing is on ("🏛️ Capitals"), or just "playing…" when the host hid it.
function livePeek(room, p) {
  if (room.cfg.noPeek) return 'playing…';
  const g = room.cfg.games[Math.min(p.sec || 0, room.cfg.games.length - 1)];
  return gameOf(g).em + ' ' + gameOf(g).label;
}
// The little bar of standings at the bottom of the screen during a race.
function liveBar() {
  document.querySelectorAll('.livebar').forEach((e) => e.remove());
  const bar = h('div', { class: 'livebar', 'aria-live': 'off' });
  document.body.appendChild(bar);
  const draw = (room) => {
    if (!room || !S.session || !S.session.live) return bar.remove();
    // You see your own progress; a friend's score only once they've finished. Until then, just which game
    // they're on (unless the host turned that off).
    const total = cfgTotal(room.cfg), me = NET.uid(), all = liveStandings(room);
    const st = all.filter((p) => p.done).concat(all.filter((p) => !p.done && p.id === me), all.filter((p) => !p.done && p.id !== me).sort((a, b) => a.name.localeCompare(b.name)));
    bar.replaceChildren(...st.slice(0, 5).map((p, i) => h('span', { class: 'lb' + (p.id === me ? ' me' : '') + (p.done ? ' done' : '') },
      h('b', null, (p.done ? (i + 1) + '. ' : '') + p.name), ' ' + (p.done ? '✓ ' + p.correct + '/' + total : p.id === me ? p.found + '/' + total : livePeek(room, p)))));
  };
  if (LIVE.room) draw(LIVE.room);
  const prev = LIVE.unwatch;
  if (prev) prev();
  LIVE.unwatch = NET.watch(LIVE.code, (room) => { LIVE.room = room; draw(room); if (room && room.state === 'play' && room.round > LIVE.startedRound) liveBegin(room); });
}
/* Head-to-head: once everyone in a round has finished, each rival you raced counts a win, loss or tie for you
   (on this device, by their player id, so a new name keeps the record). gs_h2h_v1 = { uid: { name, w, l, t } }. */
function h2hRecord(room) {
  const me = room.players && room.players[NET.uid()];
  if (!me || !me.done || !room.round) return;
  const st = liveStandings(room);
  if (st.some((p) => !p.done)) return;
  const seen = store.get('gs_h2h_seen_v1', []), key = LIVE.code + ':' + room.round + ':' + room.createdAt;
  if (seen.includes(key)) return;
  const book = store.get('gs_h2h_v1', {}), mine = { correct: me.correct, time: me.time };
  st.forEach((p) => {
    if (p.id === NET.uid()) return;
    const r = book[p.id] = book[p.id] || { name: p.name, w: 0, l: 0, t: 0 };
    r.name = p.name; r.at = Date.now();
    if (better(mine, p, 'board')) r.w++; else if (better(p, mine, 'board')) r.l++; else r.t++;
  });
  store.set('gs_h2h_v1', book);
  store.set('gs_h2h_seen_v1', seen.concat([key]).slice(-200));
}
function h2hCard(ids) {
  const book = store.get('gs_h2h_v1', {});
  const rows = Object.entries(book).filter(([id]) => !ids || ids.includes(id)).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, ids ? 8 : 6);
  if (!rows.length) return null;
  return h('div', { class: 'h2h' }, h('p', { class: 'eyebrow' }, '⚔️ Head to head'),
    h('ul', { class: 'pairs' }, rows.map(([, r]) => h('li', null, h('span', null, 'You vs ' + r.name), h('b', { class: 'num ' + (r.w > r.l ? 'up' : r.w < r.l ? 'down' : '') }, r.w + ' – ' + r.l + (r.t ? ' · ' + r.t + 'T' : ''))))));
}
// A room's run: the host's spelling help and "see what game others are on" are for everyone. (Firebase can't
// store undefined, so options are only added when they're on.)
function liveCfg(cfg, st) {
  if (st.help) cfg.help = true;
  if (st.peek === false) cfg.noPeek = true;
  return cfg;
}
// Host, "Another round": back to the game list to change anything, then Start round (setup's button).
function liveNextRound() {
  NET.update('rooms/' + LIVE.code, { picking: true }).catch(() => {});
  if (LIVE.room && LIVE.room.cfg) {
    const c = LIVE.room.cfg; Object.assign(S.setup, { kind: 'board', games: c.games.slice(), help: !!c.help, hard: !!c.hard, langType: !!c.langType, strict: !!c.strict, allMap: !!c.allMap, peek: !c.noPeek, counts: Object.assign({}, c.counts || {}), countdown: !!c.countdown, limits: Object.assign({}, c.limits || {}), lrSec: c.lrSec, scSec: c.scSec });
    if (c.regions) Object.assign(S.setup, { multi: true, regions: c.regions.slice() });
    else Object.assign(S.setup, { multi: false, region: c.limit ? 'mixed' : c.region }, c.limit ? { mixN: c.limit } : {});
  }
  S.liveNext = LIVE.code; setup();
}
// Back out of picking: to the room's lobby (where the host can also just start the same games again).
function liveBackToRoom() {
  const code = S.liveNext; S.liveNext = null;
  NET.update('rooms/' + code, { picking: null }).catch(() => {});
  liveLobby(code);
}
// On the results screen: everyone's results, updating as they finish. Players still playing show no score
// (you only see how they did once they've finished).
function liveResults() {
  const box = h('div', { class: 'card sky' });
  const draw = (room) => {
    if (!room) return;
    const all = liveStandings(room), host = room.host === NET.uid(), waiting = all.filter((p) => !p.done).length;
    const st = all.filter((p) => p.done).concat(all.filter((p) => !p.done).sort((a, b) => a.name.localeCompare(b.name)));
    box.replaceChildren(h('p', { class: 'eyebrow' }, '🌐 Room ' + LIVE.code + (waiting ? ' · ' + waiting + ' still playing' : '')),
      h('ul', { class: 'list board' }, st.map((p, i) => h('li', { class: i === 0 && p.done ? 'first' : null }, h('span', { class: 'rank' }, p.done ? String(i + 1) : '–'),
        h('div', { class: 'q' }, p.name + (p.id === NET.uid() ? ' (you)' : ''), h('small', null, p.done ? p.correct + '/' + p.total + ' found' : 'still playing' + (room.cfg.noPeek ? '…' : ' · ' + livePeek(room, p)))),
        h('div', { class: 't' }, p.done ? fmtTime(p.time) : '…')))),
      ...[(h2hRecord(room), h2hCard(st.map((p) => p.id)))].filter(Boolean),
      host ? h('button', { class: 'btn primary small', onclick: liveNextRound }, '🔁 Another round')
        : h('p', { class: 'small muted center' }, room.picking ? 'The host is picking the next round…' : 'The host can start another round'));
  };
  if (LIVE.room) draw(LIVE.room);
  if (LIVE.unwatch) LIVE.unwatch();
  LIVE.unwatch = NET.watch(LIVE.code, (room) => { LIVE.room = room; draw(room); if (room && room.state === 'play' && room.round > LIVE.startedRound) liveBegin(room); });
  return box;
}

// A ?room=CODE link opens the join screen.
(function () {
  const q = new URLSearchParams(location.search), code = (q.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length === 5) S.joinRoom = code;
})();

/* ---- start ---- */
if (S.joinRoom) liveJoinScreen(S.joinRoom); else home();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

/* New versions: phones kept showing an old copy of the site. Check version.json when the app opens, when it comes
   back to the front and every 10 minutes; if there's a newer build, reload — straight away on the home screen,
   otherwise the next time you go home (never in the middle of a run). Once per version, so it can't loop. */
function reloadForUpdate(v) {
  try { if (sessionStorage.getItem('gs_reloaded') === v) return false; sessionStorage.setItem('gs_reloaded', v); } catch (e) { return false; }
  location.reload();
  return true;
}
function checkUpdate() {
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()).then((j) => {
    if (!j.version || j.version === APP_VERSION) return;
    S.updateReady = j.version;
    if (document.querySelector('[data-screen="home"]')) reloadForUpdate(j.version);
  }).catch(() => {});
}
checkUpdate();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
setInterval(checkUpdate, 600000);
// For the browser tests: the current session (read-only).
try { Object.defineProperty(window.GS, 'session', { get: () => S.session }); window.GS.cluesFor = cluesFor; window.GS.borderKm = borderKm; window.GS.needAssets = needAssets; } catch (e) { /* already there */ }

})();
