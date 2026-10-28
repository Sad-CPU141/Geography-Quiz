// Builds the data for "Guess the language" (run: node tools/langs.mjs, after npm run data).
// Every official language of the countries in the game (from world-countries) that has a complete translation of
// the Universal Declaration of Human Rights in the `udhr` package (Unicode's UDHR project; the declaration is
// copyright-free). The sentence shown is Article 1 (its first sentence when it's long) — a real, official
// translation, never one we wrote ourselves.
// Output: src/langs.js → window.GS_LANGS = [{ k, name, dir, script, text, more: [2 more sentences], countries: [ids], close? }]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { udhr } from 'udhr';
const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const decl = path.join(root, 'node_modules/udhr/declaration');
const countries = require(path.join(root, 'node_modules/world-countries/countries.json'));
global.window = {}; require(path.join(root, 'src/data.js'));
const ours = new Set(window.GS_DATA.countries.map((c) => c.id));

// world-countries language code → UDHR file (where the codes differ, or to pick the standard variant).
const FILE = {
  ara: 'arb', zho: 'cmn_hans', swa: 'swh', msa: 'mly_latn', sqi: 'als', aze: 'azj_latn', fas: 'pes_1', prs: 'pes_2',
  pus: 'pbu', mlg: 'plt', mon: 'khk', uzb: 'uzn_latn', grn: 'gug', aym: 'ayr', kon: 'kng', fil: 'tgl', por: 'por_PT',
  deu: 'deu_1996', srp: 'srp_cyrl', ell: 'ell_monotonic', ron: 'ron_2006', nya: 'nya_chechewa', tso: 'tso_MZ',
  hat: 'hat_kreyol', tuk: 'tuk_latn', bos: 'bos_latn', gsw: 'gsw1', ber: 'zgh', que: 'quz', tam: 'tam', lin: 'lin',
};
// Display names (English) where the data's name isn't the usual one.
const NAME = {
  ron: 'Romanian', nya: 'Chichewa', ssw: 'Swati', fas: 'Persian', prs: 'Dari', ckb: 'Kurdish (Sorani)', div: 'Dhivehi',
  zho: 'Chinese (Mandarin)', msa: 'Malay', grn: 'Guaraní', ber: 'Tamazight', sot: 'Sesotho', tsn: 'Setswana', nso: 'Sepedi',
  ell: 'Greek', nob: 'Norwegian', toi: 'Tonga (Zambia)', gsw: 'Swiss German', mri: 'Māori', zdj: 'Comorian', fil: 'Filipino', kon: 'Kikongo',
};
// Other names people type for a language (Typed mode). The data's own name is added too when it differs.
const ALT = {
  fas: ['Farsi'], prs: ['Afghan Persian', 'Persian'], zho: ['Mandarin', 'Chinese'], fil: ['Tagalog'], mya: ['Myanmar'], div: ['Maldivian', 'Divehi'],
  khm: ['Cambodian'], swa: ['Kiswahili'], sot: ['Sotho', 'Southern Sotho'], tsn: ['Tswana'], nso: ['Northern Sotho', 'Pedi'], nya: ['Nyanja', 'Chewa'],
  run: ['Rundi'], kon: ['Kongo'], ber: ['Berber', 'Amazigh'], hat: ['Haitian', 'Creole', 'Kreyol'], ell: ['Modern Greek'], nob: ['Bokmal', 'Norwegian Bokmal'],
  ckb: ['Kurdish', 'Sorani', 'Central Kurdish'], toi: ['Tonga', 'Chitonga'], ton: ['Tonga'], mri: ['Maori'], grn: ['Guarani'], ssw: ['Swazi', 'siSwati'],
  nbl: ['Ndebele', 'Southern Ndebele'], ltz: ['Luxembourgish', 'Letzeburgesch'], gle: ['Irish Gaelic', 'Gaelic'], msa: ['Malaysian', 'Bahasa Malaysia'],
  ind: ['Bahasa Indonesia', 'Bahasa'], kir: ['Kirghiz'], tgk: ['Tajiki'], pus: ['Pushto'], amh: ['Amharic'], tir: ['Tigrinya'], dzo: ['Bhutanese'],
  lao: ['Laotian'], sin: ['Sinhalese'], tpi: ['Pidgin'], bis: ['Bichelamar'], smo: ['Samoan'], fij: ['Fijian'], mah: ['Marshallese'], crs: ['Seselwa', 'Creole'],
  zdj: ['Shikomori', 'Comoran'], cnr: ['Montenegrin'], gsw: ['Swiss German', 'Schweizerdeutsch'], roh: ['Romansh', 'Romansch'], lat: ['Latin'], hye: ['Armenian'],
  kat: ['Georgian'], mlt: ['Maltese'], uzb: ['Uzbek'], aze: ['Azeri'], que: ['Quechua'], aym: ['Aymara'], lin: ['Lingala'], sag: ['Sango'], lua: ['Luba-Kasai', 'Tshiluba'],
};
const SKIP = new Set(['nno', 'bar']); // Nynorsk would duplicate Norwegian; Austro-Bavarian isn't a standard written language
const stageOf = Object.fromEntries(udhr.map((d) => [d.code, d.stage]));
const dirOf = Object.fromEntries(udhr.map((d) => [d.code, d.direction]));

// "…word[corrected word]": the text before the bracket ends with the start of the correction (Thai has no spaces,
// so we look for the overlap); swap in the correction. Otherwise drop the bracket.
function fixWord(w, a, b) {
  for (let i = 0; i < a.length; i++) if (b.startsWith(a.slice(i))) return a.slice(0, i) + b;
  return a;
}
function article(code, n) {
  const html = fs.readFileSync(path.join(decl, code + '.html'), 'utf8');
  const m = new RegExp('<article data-number="' + n + '">([\\s\\S]*?)<\\/article>').exec(html);
  if (!m) return null;
  const p = /<p>([\s\S]*?)<\/p>/.exec(m[1]);
  if (!p) return null;
  // A word followed by its [correction] (e.g. Thai): keep the correction.
  let t = p[1].replace(/<[^>]+>/g, '')
    .replace(/(\S*)\[([^\]]+)\]/gu, fixWord)
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  if (t.length > 170) {
    const cut = /^(.{25,190}?[.。।።؟!?։။។៕])(\s|$)/u.exec(t);
    t = cut ? cut[1] : t.slice(0, 150).replace(/\s+\S*$/, '') + '…';
  }
  return t;
}
function scriptOf(t) {
  const tests = [['Thaana', /[ހ-޿]/], ['Arabic', /[؀-ۿ]/], ['Cyrillic', /[Ѐ-ӿ]/], ['Greek', /[Ͱ-Ͽ]/],
    ['Han', /[一-鿿]/], ['Kana', /[぀-ヿ]/], ['Hangul', /[가-힯]/], ['Indic', /[ऀ-෿]/], ['Thai/Lao', /[฀-໿]/],
    ['Tibetan', /[ༀ-࿿]/], ['Myanmar', /[က-႟]/], ['Georgian', /[Ⴀ-ჿ]/], ['Ethiopic', /[ሀ-፿]/],
    ['Khmer', /[ក-៿]/], ['Armenian', /[԰-֏]/], ['Tifinagh', /[ⴰ-⵿]/]];
  for (const [n, re] of tests) if (re.test(t)) return n;
  return 'Latin';
}

const langs = {};
countries.forEach((c) => {
  const id = c.cca2.toLowerCase();
  if (!ours.has(id)) return;
  Object.entries(c.languages || {}).forEach(([k, name]) => { if (!SKIP.has(k)) (langs[k] = langs[k] || { name, countries: [] }).countries.push(id); });
});
const out = [], missing = [];
for (const [k, v] of Object.entries(langs)) {
  const code = FILE[k] || k;
  if (!fs.existsSync(path.join(decl, code + '.html')) || stageOf[code] < 4) { missing.push(k + ' ' + v.name); continue; }
  const text = article(code, 1);
  // Two more short sentences (Articles 3–6), used when a region has only a few languages.
  const more = [3, 4, 5, 6].map((n) => article(code, n)).filter((t) => t && t.length <= 170 && !t.endsWith('…')).slice(0, 2);
  if (!text) { missing.push(k + ' (no article 1)'); continue; }
  const alt = [...new Set([...(ALT[k] || []), v.name])].filter((a) => a !== (NAME[k] || v.name));
  out.push({ k, name: NAME[k] || v.name, alt, dir: dirOf[code] === 'rtl' ? 'rtl' : 'ltr', script: scriptOf(text), text, more, countries: v.countries.sort() });
}
out.sort((a, b) => a.name.localeCompare(b.name));
// Languages so close in writing that they'd be unfair as wrong options for each other.
const CLOSE = [['bos', 'hrv', 'cnr', 'srp'], ['ind', 'msa'], ['fas', 'prs'], ['sot', 'nso', 'tsn'], ['kin', 'run'], ['tpi', 'bis'],
  ['ces', 'slk'], ['dan', 'nob', 'swe'], ['rus', 'ukr', 'bel'], ['bul', 'mkd', 'srp'], ['hin', 'nep'], ['zul', 'xho', 'ssw', 'nbl'],
  ['afr', 'nld'], ['kaz', 'kir'], ['tha', 'lao']];
out.forEach((l) => {
  const near = [...new Set(CLOSE.filter((g) => g.includes(l.k)).flat())].filter((x) => x !== l.k && out.some((o) => o.k === x));
  if (near.length) l.close = near;
});
const js = '/* Data for "Guess the language", generated by tools/langs.mjs — do not edit by hand.\n' +
  '   Sentences: Article 1 of the Universal Declaration of Human Rights in each language (the `udhr` package, from\n' +
  '   Unicode\'s UDHR project; the declaration is copyright-free). Official languages: world-countries (ODbL). */\n' +
  'window.GS_LANGS = [\n' + out.map((l) => ' ' + JSON.stringify(l)).join(',\n') + '\n];\n';
fs.writeFileSync(path.join(root, 'src/langs.js'), js);
console.log('langs: ' + out.length + ' languages, ' + Math.round(js.length / 1024) + ' KB. Not available: ' + missing.join(', '));
