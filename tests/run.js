// Checks the pure game logic: answer matching, challenge codes, run building. Run: npm test
const path = require('path');
global.window = { GS_NO_UI: true };
require(path.join(__dirname, '../src/data.js'));
require(path.join(__dirname, '../src/langs.js'));
require(path.join(__dirname, '../app.js')); // built file: run `npm run build` first
const GS = window.GS;
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL: ' + msg); } };
const id = (name) => GS.DATA.find((c) => c.name === name).id;

// Data
ok(GS.DATA.length === 196, '196 countries');
ok(!GS.DATA.some((c) => c.id === 'il' || c.name === 'Israel'), 'Israel is not in the game (owner\'s decision)');
// Flags keep their real proportions.
const ratio = (id) => GS.DATA.find((c) => c.id === id).ratio;
[['mc', 1.25], ['id', 1.5], ['ch', 1], ['va', 1], ['qa', 2.545], ['us', 1.9], ['np', 0.82], ['be', 1.154], ['gb', 2], ['de', 1.667]]
  .forEach(([id, r]) => ok(Math.abs(ratio(id) - r) < 0.01, 'flag proportions ' + id + ' = ' + r + ' (got ' + ratio(id) + ')'));
ok(ratio('mc') !== ratio('id'), 'Monaco and Indonesia flags differ in shape');
const afFlag = require('fs').readFileSync(path.join(__dirname, '..', GS.DATA.find((c) => c.id === 'af').flag), 'utf8');
ok(ratio('af') === 2 && /fill="#fff"/.test(afFlag) && /<path /.test(afFlag) && !/<text/.test(afFlag), 'Afghanistan: the white flag with the Shahada drawn as shapes (owner\'s choice), 1:2');
GS.DATA.forEach((c) => { ok(c.shape && c.shape.length > 20, 'outline for ' + c.name); ok(c.flag && /^flags\/[0-9a-f]{12}\.svg$/.test(c.flag), 'flag file for ' + c.name); ok(c.capital, 'capital for ' + c.name); });
const counts = {}; GS.DATA.forEach((c) => { counts[c.region] = (counts[c.region] || 0) + 1; });
ok(Object.values(counts).reduce((a, b) => a + b) === 196, 'regions add up');

// Every country/capital accepts its own shown name.
GS.DATA.forEach((c) => { ok(GS.isRight(c.id, 'flag', c.name), 'name ' + c.name); ok(GS.isRight(c.id, 'capital', c.capital), 'capital ' + c.capital); });
// Common spellings
const yes = [
  ['United States', 'flag', 'USA'], ['United States', 'flag', 'united states of america'], ['United Kingdom', 'flag', 'UK'], ['United Kingdom', 'shape', 'great britain'],
  ['Ivory Coast', 'flag', "cote d'ivoire"], ['Ivory Coast', 'flag', 'Côte d’Ivoire'], ['Czechia', 'flag', 'Czech Republic'], ['Türkiye', 'flag', 'turkey'], ['Türkiye', 'flag', 'turkiye'],
  ['DR Congo', 'flag', 'DRC'], ['DR Congo', 'flag', 'democratic republic of the congo'], ['Republic of the Congo', 'flag', 'congo'],
  ['Saint Kitts and Nevis', 'flag', 'St Kitts & Nevis'], ['Saint Vincent and the Grenadines', 'flag', 'st. vincent and the grenadines'],
  ['Bosnia and Herzegovina', 'flag', 'bosnia'], ['Myanmar', 'flag', 'burma'], ['Eswatini', 'flag', 'swaziland'], ['Timor-Leste', 'flag', 'east timor'], ['Timor-Leste', 'flag', 'timor leste'],
  ['Guinea-Bissau', 'flag', 'guinea bissau'], ['Vatican City', 'flag', 'vatican'], ['Gambia', 'flag', 'the gambia'], ['North Macedonia', 'flag', 'macedonia'], ['Cape Verde', 'flag', 'cabo verde'],
  ['São Tomé and Príncipe', 'flag', 'sao tome and principe'], ['Netherlands', 'flag', 'the netherlands'], ['South Korea', 'flag', 'south korea'], ['North Korea', 'flag', 'north korea'],
  ['United States', 'capital', 'washington dc'], ['United States', 'capital', 'Washington, D.C.'], ['Mexico', 'capital', 'mexico city'], ['Mexico', 'capital', 'mexico'],
  ['Kuwait', 'capital', 'kuwait'], ['San Marino', 'capital', 'san marino'], ['Vatican City', 'capital', 'vatican'], ['Bolivia', 'capital', 'la paz'], ['South Africa', 'capital', 'cape town'],
  ['Ukraine', 'capital', 'kiev'], ['Mongolia', 'capital', 'ulan bator'], ['Colombia', 'capital', 'bogota'], ['Iceland', 'capital', 'reykjavik'], ['Antigua and Barbuda', 'capital', 'st johns'],
  ['Grenada', 'capital', "saint george's"], ['Sri Lanka', 'capital', 'colombo'], ['Netherlands', 'capital', 'the hague'], ['Guatemala', 'capital', 'guatemala'], ['Panama', 'capital', 'panama city'],
];
yes.forEach(([n, k, t]) => ok(GS.isRight(id(n), k, t), 'accepts "' + t + '" for ' + n + ' (' + k + ')'));
const no = [
  ['Niger', 'flag', 'nigeria'], ['Nigeria', 'flag', 'niger'], ['Dominica', 'flag', 'dominican republic'], ['Guinea', 'flag', 'guinea bissau'], ['Equatorial Guinea', 'flag', 'guinea'],
  ['Austria', 'flag', 'australia'], ['India', 'flag', 'in'], ['Sudan', 'flag', 'south sudan'], ['Australia', 'capital', 'sydney'], ['Canada', 'capital', 'toronto'], ['Brazil', 'capital', 'rio'],
  ['Turkey'.length && 'Türkiye', 'capital', 'istanbul'], ['Mexico', 'flag', ''], ['Iran', 'flag', 'iraq'],
];
no.forEach(([n, k, t]) => ok(!GS.isRight(id(n), k, t), 'rejects "' + t + '" for ' + n + ' (' + k + ')'));
// While typing a longer name, a shorter wrong answer is never accepted early: the check is only against the current answer.
ok(!GS.isRight(id('Nigeria'), 'flag', 'Niger'), 'Niger is not Nigeria');

// Codes (quick fire and board), every setting combination round-trips.
const regions = ['world', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
for (let i = 0; i < 1500; i++) {
  const modes = ['flags', 'shapes', 'capitals', 'mix'];
  const region = regions[i % 7];
  const cfg = { kind: 'quick', mode: modes[i % 4], region, style: i % 3 ? 'type' : 'pick', count: 1 + (i * 7) % GS.pool(region).length, seed: (i * 2654435761) % (1 << 21) };
  const code = GS.encodeCode(cfg), back = GS.decodeCode(code);
  ok(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code), 'code format ' + code);
  ok(back && JSON.stringify(back) === JSON.stringify(cfg), 'quick code round trip ' + code + ' ' + JSON.stringify(cfg) + ' → ' + JSON.stringify(back));
  ok(GS.decodeCode(code.toLowerCase().replace('-', ' ')) !== null, 'lowercase code ' + code);
}
ok(GS.GAME_ORDERS.length === 64, '64 game orders');
GS.GAME_ORDERS.forEach((games, gi) => regions.forEach((region, ri) => {
  const cfg = { kind: 'board', games: games.slice(), region, seed: (gi * 7919 + ri * 104729 + 13) % (1 << 21) };
  const code = GS.encodeCode(cfg), back = GS.decodeCode(code);
  ok(back && JSON.stringify(back) === JSON.stringify(cfg), 'board code round trip ' + code + ' ' + JSON.stringify(cfg) + ' → ' + JSON.stringify(back));
}));
// Long codes: any list of up to 9 games, in any order, with the new games.
const allGames = GS.GAMES.map((g) => g.id);
for (let i = 0; i < 1500; i++) {
  const r = GS.rng(i + 77), n = 1 + Math.floor(r() * 9);
  const games = allGames.slice().sort(() => r() - 0.5).slice(0, n);
  if (!games.some((g) => allGames.indexOf(g) >= 4)) games[0] = allGames[4 + (i % 5)];
  const cfg = { kind: 'board', games: [...new Set(games)], region: regions[i % 7], seed: Math.floor(r() * (1 << 21)) };
  const code = GS.encodeCode(cfg), back = GS.decodeCode(code);
  ok(code.replace(/-/g, '').length >= 10, 'long code ' + code);
  ok(back && JSON.stringify(back) === JSON.stringify(cfg), 'long code round trip ' + code + ' ' + JSON.stringify(cfg) + ' → ' + JSON.stringify(back));
}
ok(GS.encodeCode({ kind: 'board', games: ['flags', 'map'], region: 'world', seed: 5 }).replace('-', '').length === 8, 'runs with only the 4 main games keep 8-character codes');
let lcaught = 0;
for (let i = 0; i < 300; i++) {
  const cfg = { kind: 'board', games: ['borders', 'duel'], region: 'Europe', seed: i * 977 };
  const code = GS.encodeCode(cfg).replace(/-/g, ''); const pos = i % code.length; const ch = code[pos] === 'A' ? 'B' : 'A';
  const bad = GS.decodeCode(code.slice(0, pos) + ch + code.slice(pos + 1));
  if (!bad || JSON.stringify(bad) === JSON.stringify(cfg)) lcaught++;
}
ok(lcaught / 300 > 0.9, 'long code typos caught (' + lcaught + '/300)');

// Borders: every answer is a real two-way land border; islands are left out.
const bb = GS.makeBoard({ kind: 'board', games: ['borders'], region: 'world', seed: 3 })[0];
ok(bb.countries.length > 140 && bb.countries.every((id) => GS.DATA.find((c) => c.id === id).nb.length), 'borders: ' + bb.countries.length + ' countries with neighbours');
ok(bb.ids.every((k) => { const [a, b] = k.split('>'); return GS.DATA.find((c) => c.id === b).nb.includes(a); }), 'borders are two-way');
const nbOf = (id) => GS.DATA.find((c) => c.id === id).nb;
ok(nbOf('fr').join() === 'ad,be,ch,de,es,it,lu,mc', 'France borders: ' + nbOf('fr'));
ok(nbOf('ca').join() === 'us' && nbOf('gb').join() === 'ie' && nbOf('jp').length === 0 && nbOf('lk').length === 0, 'Canada, UK, Japan, Sri Lanka borders');
ok(!GS.DATA.some((c) => c.nb.includes('il')), 'no borders with a country left out of the game');
// Bigger country: up to 20 rounds, areas always >10% apart, no country twice.
const dd = GS.makeBoard({ kind: 'board', games: ['duel'], region: 'world', seed: 11 })[0];
ok(dd.ids.length === 20, 'duel: 20 rounds');
const seen = new Set(); let fair = true;
dd.ids.forEach((k) => { const [a, b] = k.split('|'); seen.add(a); seen.add(b); const A = GS.DATA.find((c) => c.id === a).area, B = GS.DATA.find((c) => c.id === b).area; if (Math.abs(A - B) <= 0.1 * Math.max(A, B)) fair = false; });
ok(fair && seen.size === 40, 'duel: clear winners, 40 different countries');
ok(GS.duelWinner('ru|ca') === 'ru' && GS.duelWinner('mc|va') === 'mc', 'duel winner by area');
// Guess the language: 20 rounds of the region's official languages, 4 different options, fair wrong options.
const LB = GS.LANG_BY;
ok(GS.LANGS.length > 100 && ['ara', 'zho', 'eng', 'spa', 'hin', 'rus', 'jpn', 'swa', 'fra', 'por'].every((k) => LB[k]), 'languages: the big ones are there');
ok(GS.LANGS.every((l) => [l.text, ...l.more].every((t) => t.length > 15 && t.length < 200 && !/[\[\]<>]|&\w+;/.test(t))), 'language sentences are clean and short');
ok(LB.ara.dir === 'rtl' && LB.urd.dir === 'rtl' && LB.div.script === 'Thaana' && LB.eng.dir === 'ltr', 'right-to-left and scripts');
ok(LB.tha.text.includes('เกียรติศักดิ์'), 'Thai editorial correction applied');
['world', 'Europe', 'Africa', 'Asia', 'North America', 'South America', 'Oceania'].forEach((reg) => {
  for (let s = 1; s < 30; s++) {
    const sec = GS.makeBoard({ kind: 'board', games: ['lang'], region: reg, seed: s * 131 })[0];
    const here = new Set(GS.pool(reg));
    const good = sec.ids.length >= 10 && sec.ids.length <= 20 && new Set(sec.ids).size === sec.ids.length && sec.ids.every((id) => GS.langOf(id).countries.some((c) => here.has(c)) && GS.langText(id)) &&
      sec.ids.every((id) => { const k = GS.langOf(id).k, o = sec.opts[id]; return o.length === 4 && new Set(o).size === 4 && o.includes(k) && !o.some((x) => (LB[k].close || []).includes(x)); });
    ok(good, 'lang board ' + reg + ' seed ' + s);
  }
});
const lw = GS.makeBoard({ kind: 'board', games: ['lang'], region: 'world', seed: 5 })[0];
ok(lw.ids.length === 20, 'lang: 20 rounds on the world');
const na = GS.makeBoard({ kind: 'board', games: ['lang'], region: 'North America', seed: 3 })[0];
ok(na.ids.length === 10 && ['eng', 'fra', 'spa', 'hat'].every((k) => na.ids.includes(k)), 'lang: North America (4 languages) gets 10 rounds, every language at least once');
ok(new Set(GS.makeBoard({ kind: 'board', games: ['lang'], region: 'North America', seed: 8 })[0].ids.map((id) => [...GS.makeBoard({ kind: 'board', games: ['lang'], region: 'North America', seed: 8 })[0].opts[id]].sort().join())).size > 1, 'lang: options vary in a small region');
ok(lw.ids.filter((k) => LB[k].script !== 'Latin').every((k) => lw.opts[k].every((o) => LB[o].script !== 'Latin')) && lw.ids.every((k) => !k.includes('~')), 'lang: non-Latin sentences get non-Latin options');
ok(JSON.stringify(GS.makeBoard({ kind: 'board', games: ['lang'], region: 'Asia', seed: 9 })) === JSON.stringify(GS.makeBoard({ kind: 'board', games: ['lang'], region: 'Asia', seed: 9 })), 'lang: same seed, same run');
const lc = { kind: 'board', games: ['lang', 'flags'], region: 'Africa', seed: 4242 };
ok(JSON.stringify(GS.decodeCode(GS.encodeCode(lc))) === JSON.stringify(lc), 'lang: challenge code round trip');
// Daily run: same all day, different tomorrow, always two games and a continent.
const d1 = GS.dailyCfg(20388), d2 = GS.dailyCfg(20388), d3 = GS.dailyCfg(20389);
ok(JSON.stringify(d1) === JSON.stringify(d2) && JSON.stringify(d1) !== JSON.stringify(d3), 'daily: same day same run, next day different');
for (let d = 20000; d < 20060; d++) { const c = GS.dailyCfg(d); ok(c.games.length === 2 && c.region !== 'world' && GS.decodeCode(GS.encodeCode(c)) !== null, 'daily ' + d + ' ok'); }

// What you keep missing: misses go up, getting it right brings them down, only list games count.
let book = {};
book = GS.recordMisses(book, { sections: [{ game: 'flags', missed: ['fr', 'de'], found: ['it'] }, { game: 'borders', missed: ['de>fr'], found: [] }, { game: 'map', missed: [], found: [], skipped: true }] });
book = GS.recordMisses(book, { sections: [{ game: 'flags', missed: ['fr'], found: ['de'] }] });
book = GS.recordMisses(book, { res: [{ id: 'jp', kind: 'capital', ok: false }, { id: 'fr', kind: 'flag', ok: false }] });
ok(book.flags.fr === 3 && !book.flags.de && !book.flags.it && !book.borders && book.capitals.jp === 1, 'misses book: ' + JSON.stringify(book));
ok(GS.topMisses(book, 'flags', 5)[0][0] === 'fr', 'most-missed first');
const pr = GS.makeBoard({ kind: 'board', games: ['flags'], region: 'world', seed: 1, custom: { flags: ['fr', 'jp', 'br'] } })[0];
ok(pr.ids.length === 3 && pr.ids.slice().sort().join() === 'br,fr,jp', 'practice board uses just your misses');

// A typo in a code is caught most of the time (4-bit check).
let caught = 0, tries = 0;
for (let i = 0; i < 400; i++) {
  const cfg = i % 2 ? { kind: 'quick', mode: 'flags', region: 'world', style: 'type', count: 25, seed: i * 977 } : { kind: 'board', games: ['map', 'flags'], region: 'Europe', seed: i * 977 };
  const code = GS.encodeCode(cfg).replace('-', '');
  const pos = i % 8; const ch = code[pos] === 'A' ? 'B' : 'A';
  const bad = GS.decodeCode(code.slice(0, pos) + ch + code.slice(pos + 1));
  tries++; if (!bad || JSON.stringify(bad) === JSON.stringify(cfg)) caught++;
}
ok(caught / tries > 0.85, 'most code typos caught (' + caught + '/' + tries + ')');
ok(GS.decodeCode('hello') === null && GS.decodeCode('') === null, 'junk codes rejected');

// Boards: same seed → same tile/prompt order; capitals A–Z; flags/map shuffled.
const bcfg = { kind: 'board', games: ['flags', 'map', 'capitals', 'shapes'], region: 'world', seed: 4242 };
const b1 = GS.makeBoard(bcfg), b2 = GS.makeBoard(bcfg), b3 = GS.makeBoard(Object.assign({}, bcfg, { seed: 99 }));
ok(JSON.stringify(b1) === JSON.stringify(b2), 'board: same seed → same boards');
ok(JSON.stringify(b1) !== JSON.stringify(b3), 'board: other seed → other boards');
ok(b1.map((s) => s.game).join() === 'flags,map,capitals,shapes', 'board keeps the chosen order');
b1.forEach((s) => ok(s.ids.length === 196 && new Set(s.ids).size === 196, s.game + ': all 196 once'));
const caps = b1[2].ids.map((id) => GS.DATA.find((c) => c.id === id).name);
ok(caps.join() !== caps.slice().sort((a, b) => a.localeCompare(b)).join(), 'capitals board is shuffled, not A–Z');
ok(b3[2].ids.join() !== b1[2].ids.join(), 'capitals order changes with a new seed');

// Spelling help: close misspellings get the right name; exact names and short bits get nothing.
const sug = (t, k) => GS.suggest(t, k).map((x) => x.text);
[['Kyrgistan', 'Kyrgyzstan'], ['Phillipines', 'Philippines'], ['Columbia', 'Colombia'], ['Lichtenstein', 'Liechtenstein'], ['Madagaskar', 'Madagascar'], ['Austrailia', 'Australia'], ['Turkmenistna', 'Turkmenistan']]
  .forEach(([t, want]) => ok(sug(t, 'flag').includes(want), 'did you mean ' + want + ' for "' + t + '" → ' + sug(t, 'flag')));
[['Ouagadogou', 'Ouagadougou'], ['Bucarest', 'Bucharest'], ['Tblisi', 'Tbilisi'], ['Kiyv', 'Kyiv'], ['Reykavik', 'Reykjavík']]
  .forEach(([t, want]) => ok(sug(t, 'capital').includes(want), 'did you mean ' + want + ' for "' + t + '" → ' + sug(t, 'capital')));
ok(sug('Germany', 'flag').length === 0 && sug('Ger', 'flag').length === 0 && sug('xqzzpt', 'flag').length === 0, 'no suggestion for exact, short or nonsense');
ok(sug('Nigera', 'flag').length === 2, 'two equally close: Niger / Nigeria');
ok(GS.suggest('Kyrgistan', 'flag').every((x) => GS.isRight(x.id, 'flag', x.text)), 'suggested text is accepted for its own country');
ok(b1[0].ids.join() !== b1[1].ids.join(), 'flags and map orders differ');
const eu = GS.makeBoard({ kind: 'board', games: ['map'], region: 'Europe', seed: 1 })[0];
ok(eu.ids.length === 46 && eu.ids.every((id) => GS.DATA.find((c) => c.id === id).region === 'Europe'), 'region board');

// Ranking: board = most found, then time. Quick = time.
ok(GS.better({ correct: 10, time: 90000 }, { correct: 9, time: 30000 }, 'board'), 'board: more found beats faster');
ok(GS.better({ correct: 10, time: 30000 }, { correct: 10, time: 31000 }, 'board'), 'board: tie on found → faster wins');
ok(GS.better({ correct: 5, time: 30000 }, { correct: 10, time: 31000 }, 'quick'), 'quick: faster wins');
ok(GS.fmtTime(3725000) === '1:02:05.0', 'hours format');

// Map data covers every country.
require(path.join(__dirname, '../map.js'));
const M = window.GS_MAP;
GS.DATA.forEach((c) => ok(!!M.world.c[c.id], 'on the world map: ' + c.name));
GS.DATA.filter((c) => c.region === 'Oceania').forEach((c) => ok(!!M.pacific.c[c.id], 'on the Pacific map: ' + c.name));
ok(!M.world.c.il, 'Israel is grey (not playable) on the map');
ok(M.views.world.insets.length === 2, 'world map has Caribbean + Pacific insets');
['jm', 'dm', 'lc', 'bb', 'gd', 'ag', 'kn', 'vc', 'tt', 'bs'].forEach((id) => ok(!!M.world.mk[id], 'Caribbean marker data: ' + id));
['fj', 'to', 'ws', 'tv', 'ki', 'mh', 'fm', 'pw', 'nr', 'sb', 'vu'].forEach((id) => ok(!!M.pacific.mk[id], 'Pacific marker data: ' + id));
['world', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'].forEach((r) => ok(M.views[r] && M.views[r].box.length === 4, 'view for ' + r));

// Runs are the same for the same seed, different for another seed.
const cfg = { kind: 'quick', mode: 'mix', region: 'world', style: 'pick', count: 50, seed: 12345 };
const a = GS.makeRun(cfg), b = GS.makeRun(cfg), c = GS.makeRun(Object.assign({}, cfg, { seed: 54321 }));
ok(JSON.stringify(a) === JSON.stringify(b), 'same seed → same run');
ok(JSON.stringify(a) !== JSON.stringify(c), 'other seed → other run');
ok(new Set(a.map((q) => q.id)).size === 50, 'no repeats');
a.forEach((q) => { ok(q.opts.length === 4 && q.opts.includes(q.id) && new Set(q.opts).size === 4, 'options ok'); });
['flag', 'shape', 'capital'].forEach((k) => ok(a.some((q) => q.kind === k), 'mix has ' + k));
const all = GS.makeRun({ kind: 'quick', mode: 'flags', region: 'world', style: 'type', count: 196, seed: 1 });
ok(all.length === 196 && new Set(all.map((q) => q.id)).size === 196, 'all 196');
const oc = GS.makeRun({ kind: 'quick', mode: 'capitals', region: 'Oceania', style: 'pick', count: 14, seed: 9 });
ok(oc.every((q) => GS.DATA.find((c) => c.id === q.id).region === 'Oceania'), 'region filter');

ok(GS.fmtTime(102345) === '1:42.3' && GS.fmtTime(9050) === '9.1' && GS.fmtTime(60000) === '1:00.0', 'time format');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
