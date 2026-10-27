// Checks the pure game logic: answer matching, challenge codes, run building. Run: npm test
const path = require('path');
global.window = { GS_NO_UI: true };
require(path.join(__dirname, '../src/data.js'));
require(path.join(__dirname, '../src/app.js'));
const GS = window.GS;
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL: ' + msg); } };
const id = (name) => GS.DATA.find((c) => c.name === name).id;

// Data
ok(GS.DATA.length === 197, '197 countries');
GS.DATA.forEach((c) => { ok(c.shape && c.shape.length > 20, 'outline for ' + c.name); ok(c.flag && /^flags\/[0-9a-f]{12}\.svg$/.test(c.flag), 'flag file for ' + c.name); ok(c.capital, 'capital for ' + c.name); });
const counts = {}; GS.DATA.forEach((c) => { counts[c.region] = (counts[c.region] || 0) + 1; });
ok(Object.values(counts).reduce((a, b) => a + b) === 197, 'regions add up');

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

// Codes
for (let i = 0; i < 2000; i++) {
  const modes = ['flags', 'shapes', 'capitals', 'mix'], regions = ['world', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
  const region = regions[i % 7];
  const cfg = { mode: modes[i % 4], region, style: i % 3 ? 'type' : 'pick', count: 1 + (i * 7) % GS.pool(region).length, seed: (i * 2654435761) % (1 << 22) };
  const code = GS.encodeCode(cfg);
  const back = GS.decodeCode(code);
  ok(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code), 'code format ' + code);
  ok(back && JSON.stringify(back) === JSON.stringify(cfg), 'code round trip ' + code + ' ' + JSON.stringify(cfg) + ' → ' + JSON.stringify(back));
  ok(GS.decodeCode(code.toLowerCase().replace('-', ' ')) !== null, 'lowercase code ' + code);
}
// A typo in a code is caught (most of the time — 4-bit check).
let caught = 0, tries = 0;
for (let i = 0; i < 300; i++) {
  const cfg = { mode: 'flags', region: 'world', style: 'type', count: 25, seed: i * 977 };
  const code = GS.encodeCode(cfg).replace('-', '');
  const pos = i % 8; const ch = code[pos] === 'A' ? 'B' : 'A';
  tries++; if (!GS.decodeCode(code.slice(0, pos) + ch + code.slice(pos + 1)) || JSON.stringify(GS.decodeCode(code.slice(0, pos) + ch + code.slice(pos + 1))) === JSON.stringify(cfg)) caught++;
}
ok(caught / tries > 0.8, 'most code typos caught (' + caught + '/' + tries + ')');
ok(GS.decodeCode('hello') === null && GS.decodeCode('') === null, 'junk codes rejected');

// Runs are the same for the same seed, different for another seed.
const cfg = { mode: 'mix', region: 'world', style: 'pick', count: 50, seed: 12345 };
const a = GS.makeRun(cfg), b = GS.makeRun(cfg), c = GS.makeRun(Object.assign({}, cfg, { seed: 54321 }));
ok(JSON.stringify(a) === JSON.stringify(b), 'same seed → same run');
ok(JSON.stringify(a) !== JSON.stringify(c), 'other seed → other run');
ok(new Set(a.map((q) => q.id)).size === 50, 'no repeats');
a.forEach((q) => { ok(q.opts.length === 4 && q.opts.includes(q.id) && new Set(q.opts).size === 4, 'options ok'); });
['flag', 'shape', 'capital'].forEach((k) => ok(a.some((q) => q.kind === k), 'mix has ' + k));
const all = GS.makeRun({ mode: 'flags', region: 'world', style: 'type', count: 197, seed: 1 });
ok(all.length === 197 && new Set(all.map((q) => q.id)).size === 197, 'all 197');
const oc = GS.makeRun({ mode: 'capitals', region: 'Oceania', style: 'pick', count: 14, seed: 9 });
ok(oc.every((q) => GS.DATA.find((c) => c.id === q.id).region === 'Oceania'), 'region filter');

ok(GS.fmtTime(102345) === '1:42.3' && GS.fmtTime(9050) === '9.1' && GS.fmtTime(60000) === '1:00.0', 'time format');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
