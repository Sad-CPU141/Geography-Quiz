// Checks the pure game logic: answer matching, challenge codes, run building. Run: npm test
const path = require('path');
global.window = { GS_NO_UI: true };
require(path.join(__dirname, '../src/data.js'));
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
