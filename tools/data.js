// Builds the country data for Geography Speedrun (run: npm run data).
// Inputs (all build-time only; nothing is loaded from them at runtime):
//  · world-countries (ODbL 1.0, mledoze/countries): names, other spellings, capitals, regions
//  · world-atlas (ISC) = Natural Earth (public domain): country outlines, drawn with d3-geo
//  · svg-country-flags (public domain; Wikipedia's flag SVGs): flag pictures in their real proportions and colours
// Outputs:
//  · src/data.js     window.GS_DATA = { countries: [...] } (outline paths inline)
//  · flags/*.svg     one file per flag, named by content hash so the file name never gives the answer
//  · licenses/       licence texts
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const nm = (p) => path.join(root, 'node_modules', p);

// 193 UN members + the 2 UN observer states + Kosovo and Taiwan, minus the countries the owner left out of the game.
const EXTRA = ['VA', 'PS', 'XK', 'TW'];
const LEAVE_OUT = ['IL']; // owner's decision: Israel is not in the game
const COUNT = 196;

// Names people actually type, on top of the data's own spellings.
const NAME_ALIASES = {
  US: ['USA', 'US', 'America', 'United States of America', 'The States'],
  GB: ['UK', 'Britain', 'Great Britain', 'England'],
  AE: ['UAE', 'Emirates'],
  CD: ['DRC', 'DR Congo', 'Democratic Republic of the Congo', 'Congo-Kinshasa', 'Congo Kinshasa', 'Zaire'],
  CG: ['Congo', 'Republic of Congo', 'Congo-Brazzaville', 'Congo Brazzaville'],
  CF: ['CAR'],
  CI: ["Côte d'Ivoire", 'Cote dIvoire'],
  CZ: ['Czech Republic'],
  TR: ['Turkey'],
  SZ: ['Swaziland'],
  MM: ['Burma'],
  MK: ['Macedonia'],
  CV: ['Cabo Verde'],
  TL: ['East Timor'],
  VA: ['Vatican', 'Holy See'],
  BA: ['Bosnia'],
  KR: ['Korea', 'Republic of Korea'],
  KP: ['DPRK'],
  FM: ['Federated States of Micronesia'],
  PG: ['PNG'],
  ST: ['Sao Tome'],
  KN: ['St Kitts', 'Saint Kitts'],
  VC: ['St Vincent', 'Saint Vincent'],
  TT: ['Trinidad'],
  AG: ['Antigua'],
  GW: ['Guinea Bissau'],
  NL: ['Holland'],
  PS: ['State of Palestine'],
  LA: ['Lao'],
  BN: ['Brunei Darussalam'],
  RU: ['Russian Federation'],
  MD: ['Republic of Moldova'],
  GM: ['The Gambia'],
  BS: ['The Bahamas'],
};
// Codes and short forms in the data that we do NOT accept as typed answers (too easy / ambiguous).
const SHORT_OK = /^(USA|US|UK|UAE|DRC|CAR|PNG|DPRK)$/;

// Capitals: shown answer + other answers that are accepted.
// Rule for extras: another official capital, the seat of government, or a common spelling/older name.
const CAPITALS = {
  US: ['Washington, D.C.', 'Washington', 'Washington DC', 'DC'],
  ZA: ['Pretoria', 'Cape Town', 'Bloemfontein'],
  BO: ['Sucre', 'La Paz'],
  MN: ['Ulaanbaatar', 'Ulan Bator'],
  MM: ['Naypyidaw', 'Nay Pyi Taw', 'Naypyitaw'],
  LK: ['Sri Jayawardenepura Kotte', 'Kotte', 'Colombo'],
  SZ: ['Mbabane', 'Lobamba'],
  KI: ['South Tarawa', 'Tarawa'],
  PW: ['Ngerulmud', 'Melekeok'],
  SM: ['San Marino', 'City of San Marino'],
  MY: ['Kuala Lumpur', 'Putrajaya'],
  BJ: ['Porto-Novo', 'Cotonou'],
  CI: ['Yamoussoukro', 'Abidjan'],
  NL: ['Amsterdam', 'The Hague'],
  TZ: ['Dodoma', 'Dar es Salaam'],
  IL: ['Jerusalem', 'Tel Aviv'],
  PS: ['Ramallah', 'East Jerusalem', 'Jerusalem'],
  KZ: ['Astana', 'Nur-Sultan'],
  UA: ['Kyiv', 'Kiev'],
  AG: ["St. John's", "Saint John's"],
  GD: ["St. George's", "Saint George's"],
  YE: ["Sana'a", 'Sanaa', 'Aden'],
  IS: ['Reykjavík', 'Reykjavik'],
  LU: ['Luxembourg', 'Luxembourg City'],
  MC: ['Monaco', 'Monaco-Ville'],
  VA: ['Vatican City'],
  SG: ['Singapore'],
  DJ: ['Djibouti', 'Djibouti City'],
  KW: ['Kuwait City'],
  TO: ["Nuku'alofa", 'Nukualofa'],
  BI: ['Gitega'],
  ID: ['Jakarta', 'Nusantara'],
  NR: ['Yaren'],
  CV: ['Praia'],
  TW: ['Taipei'],
  XK: ['Pristina', 'Prishtina'],
  KG: ['Bishkek'],
  TM: ['Ashgabat', 'Ashkhabad'],
  CH: ['Bern', 'Berne'],
  RO: ['Bucharest'],
  MD: ['Chișinău', 'Chisinau', 'Kishinev'],
};

// Region groups for the sets (from the data's region; Americas split into North & Central / South).
function regionOf(c) {
  if (c.region === 'Americas') return c.subregion === 'South America' ? 'South America' : 'North America';
  return c.region; // Africa, Asia, Europe, Oceania
}

// Outline crops: [lonMin, lonMax, latMin, latMax] — keep the familiar main territory so far-off
// islands/territories don't shrink the outline to a dot. Everything else uses an automatic rule.
const BOX = {
  US: [-126, -65, 23, 50], FR: [-6, 10, 41, 52], ES: [-10, 5, 35, 45], PT: [-10, -6, 36.5, 42.5], NO: [4, 32, 57, 72],
  NL: [3, 8, 50, 54], CL: [-80, -60, -60, -15], EC: [-82, -75, -6, 2], AU: [112, 155, -45, -9], NZ: [165, 179, -48, -33],
  GB: [-9, 2, 49.5, 61], DK: [7, 16, 54, 58], RU: [-180, 180, 40, 82], CO: [-80, -66, -5, 13.5], VE: [-74, -59, 0, 13],
  ZA: [15, 34, -35, -21], FJ: [-180, 180, -21, -15.5], IN: [67, 98, 6, 37], YE: [42, 54, 12, 19.5], HN: [-90, -83, 12.5, 16.5]
};
// No automatic crop (archipelagos where the spread IS the shape).
const KEEP_ALL = new Set(['ID', 'PH', 'JP', 'GR', 'HR', 'MV', 'BS', 'SB', 'VU', 'TO', 'MH', 'TV', 'FM', 'KI', 'CV', 'ST', 'KM', 'SC', 'TT', 'AG', 'KN', 'VC', 'GD', 'PW', 'WS', 'MT', 'MY', 'CA', 'TL', 'PG', 'GQ', 'NR']);

// Flags that changed after svg-country-flags was last updated (2021): taken from flag-icons (MIT, kept current),
// which only has a 4:3 version, and widened back to the real proportions.
//  · Kyrgyzstan: new flag from December 2023 (straight sun rays), 5:3.
//  · Syria: the green-white-black flag with three red stars, in official use since 2025, 3:2.
const fromFlagIcons = (cc) => fs.readFileSync(nm('flag-icons/flags/4x3/' + cc + '.svg'), 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s+id="flag-icons-[a-z-]+"/, '');
//  · Afghanistan: the owner chose the white flag (black Shahada on white, 1:2), in use since August 2021. Drawn by
//    tools/afghan-flag.mjs as shapes (calligraphic Amiri Bold outlines), so it looks the same on every device.
const NEWER_FLAGS = {
  AF: () => fs.readFileSync(path.join(root, 'tools/flags/af.svg'), 'utf8'), // drawn by tools/afghan-flag.mjs
  KG: () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480"><rect width="800" height="480" fill="#e8112d"/><g transform="translate(80 0)">' + fromFlagIcons('kg').replace(/fill="red"/g, 'fill="#e8112d"').replace(/fill="#ff0"/g, 'fill="#ffef00"') + '</g></svg>',
  SY: () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480"><rect width="720" height="480"/><rect width="720" height="320" fill="#fff"/><rect width="720" height="160" fill="#007a3d"/><g transform="translate(40 0)">' + fromFlagIcons('sy').replace(/<path d="M0 0h640v480H0Z"\/>|<path fill="#fff" d="M0 0h640v320H0Z"\/>|<path fill="#007a3d" d="M0 0h640v160H0Z"\/>/g, '') + '</g></svg>',
};
const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);

(async () => {
  const d3 = await import('d3-geo');
  const topo = await import('topojson-client');
  const countries = require(nm('world-countries/countries.json'));
  const sel = countries.filter((c) => (c.unMember || EXTRA.includes(c.cca2)) && !LEAVE_OUT.includes(c.cca2));
  if (sel.length !== COUNT) throw new Error('Expected ' + COUNT + ' countries, got ' + sel.length);

  const load = (res) => { const w = require(nm('world-atlas/countries-' + res + '.json')); return topo.feature(w, w.objects.countries).features; };
  const f50 = load('50m'), f10 = load('10m');
  const find = (list, c) => list.find((f) => f.id === c.ccn3) || (c.cca2 === 'XK' ? list.find((f) => f.properties.name === 'Kosovo') : null);

  const W = 600, H = 450, PAD = 24;
  // Planar helpers (lon/lat → Mercator). Robust against the odd ring winding in the 1:10m data.
  const merc = ([lon, lat]) => [lon * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360))];
  function ringStats(ring) {
    let a = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const pts = ring.map(merc);
    for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    pts.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
    return { area: Math.abs(a / 2), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  }
  function outline(c) {
    // 1:50m outlines; Tuvalu is only in the 1:10m data.
    const f = find(f50, c) || find(f10, c);
    if (!f) throw new Error('No outline for ' + c.cca2);
    let polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    // Unwrap longitudes so countries across the 180° line (Fiji, Russia, Kiribati) stay in one piece.
    const ref = polys[0][0][0][0];
    const unwrap = (lon) => { let d = lon - ref; while (d > 180) d -= 360; while (d < -180) d += 360; return ref + d; };
    polys = polys.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => [unwrap(lon), lat])));
    const box = BOX[c.cca2];
    if (box) {
      polys = polys.filter((poly) => { const r = poly[0]; const lon = r.reduce((s, p) => s + p[0], 0) / r.length, lat = r.reduce((s, p) => s + p[1], 0) / r.length;
        const L = ((lon + 540) % 360) - 180; return L >= box[0] && L <= box[1] && lat >= box[2] && lat <= box[3]; });
    } else if (!KEEP_ALL.has(c.cca2) && polys.length > 1) {
      // Automatic: keep parts near the biggest part.
      const parts = polys.map((p) => ({ p, s: ringStats(p[0]) })).sort((x, y) => y.s.area - x.s.area);
      const m = parts[0].s;
      const R = Math.max(0.07, Math.sqrt(m.area / Math.PI) * 2.2);
      polys = parts.filter((x) => Math.hypot(x.s.cx - m.cx, x.s.cy - m.cy) <= R).map((x) => x.p);
    }
    if (!polys.length) throw new Error('Crop removed everything for ' + c.cca2);
    // Fit to the picture.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    polys.forEach((poly) => poly[0].forEach((p) => { const [x, y] = merc(p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
    const k = Math.min((W - 2 * PAD) / (x1 - x0 || 1e-9), (H - 2 * PAD) / (y1 - y0 || 1e-9));
    const ox = (W - (x1 - x0) * k) / 2 - x0 * k, oy = (H - (y1 - y0) * k) / 2 - y0 * k;
    const proj = (p) => { const [x, y] = merc(p); return [x * k + ox, y * k + oy]; };
    const dots = KEEP_ALL.has(c.cca2) || polys.length === 1;
    const geo2 = { coordinates: polys };
    // Project, simplify (Douglas–Peucker, in pixels) and write compact relative path data.
    const EPS = 0.55;
    function dp(pts) {
      if (pts.length < 3) return pts;
      const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
      const st = [[0, pts.length - 1]];
      while (st.length) {
        const [a, b] = st.pop(); let mx = 0, mi = -1;
        const [ax, ay] = pts[a], [bx, by] = pts[b]; const dx = bx - ax, dy = by - ay; const L = Math.hypot(dx, dy) || 1;
        for (let i = a + 1; i < b; i++) { const dd = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L; if (dd > mx) { mx = dd; mi = i; } }
        if (mx > EPS) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
      }
      return pts.filter((_, i) => keep[i]);
    }
    let d = '';
    const r1 = (v) => Math.round(v * 2) / 2;
    geo2.coordinates.forEach((poly) => poly.forEach((ring) => {
      let pts = ring.map((p) => proj(p).map(r1));
      // A ring is closed (first point = last), so split it at its farthest point before simplifying.
      let far = 0, fd = -1; pts.forEach((q, i) => { const dd = Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]); if (dd > fd) { fd = dd; far = i; } });
      pts = far > 0 ? dp(pts.slice(0, far + 1)).concat(dp(pts.slice(far)).slice(1)) : pts;
      const uniq = pts.filter((p, i) => !i || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
      const xs0 = uniq.map((p) => p[0]), ys0 = uniq.map((p) => p[1]);
      const tiny = Math.max(Math.max(...xs0) - Math.min(...xs0), Math.max(...ys0) - Math.min(...ys0)) < 5;
      if (tiny && !dots) return; // a speck far too small to see on a big country: leave it out
      if (uniq.length < 4 || tiny) {
        // A speck (atoll) in an island country: draw a small dot so it can be seen.
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const cx = r1((Math.min(...xs) + Math.max(...xs)) / 2), cy = r1((Math.min(...ys) + Math.max(...ys)) / 2);
        d += 'M' + (cx - 3) + ' ' + cy + 'a3 3 0 1 0 6 0a3 3 0 1 0-6 0Z';
        return;
      }
      let px = uniq[0][0], py = uniq[0][1];
      d += 'M' + px + ' ' + py;
      for (let i = 1; i < uniq.length - 1; i++) { const [x, y] = uniq[i]; d += 'l' + fmt(x - px) + fmt(y - py, true); px = x; py = y; }
      d += 'Z';
    }));
    return d;
  }
  function fmt(v, second) { const s = String(Math.round(v * 2) / 2); return (second && v >= 0 ? ' ' : '') + s; }

  // Land neighbours (from world-countries) are kept only when they're in the game too.
  const by3 = {}; countries.forEach((c) => { by3[c.cca3] = c.cca2.toLowerCase(); });
  const ours = new Set(sel.map((c) => c.cca2.toLowerCase()));
  fs.rmSync(path.join(root, 'flags'), { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'flags'), { recursive: true });
  const out = sel.map((c) => {
    const cc = c.cca2;
    // Flag file (id attribute removed: it contains the country code).
    // Flag file: Wikipedia's SVG in its real proportions. Titles, descriptions, metadata and comments are removed
    // (they name the country).
    let svg = (NEWER_FLAGS[cc] ? NEWER_FLAGS[cc]() : fs.readFileSync(nm('svg-country-flags/svg/' + cc.toLowerCase() + '.svg'), 'utf8'))
      .replace(/<!--[\s\S]*?-->/g, '').replace(/<(title|desc|metadata)[\s\S]*?<\/\1>/g, '').replace(/<\?xml[^>]*>\s*/, '')
      .replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/g, '').replace(/\s(sodipodi|inkscape):[\w-]+="[^"]*"/g, '')
      .replace(/\s[\w:-]+="[^"]*[Ff]lag[ _]of[^"]*"/g, '');
    if (/[Ff]lag[ _]of/.test(svg)) throw new Error('Flag file still names its country: ' + cc);
    const vb = svg.match(/viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/);
    const wh = svg.match(/<svg[^>]*\swidth="([\d.]+)[^"]*"[^>]*\sheight="([\d.]+)/);
    const ratio = vb ? +vb[1] / +vb[2] : wh ? +wh[1] / +wh[2] : 1.5;
    // Give every file a real width and height (same proportions) so browsers know its size before it loads.
    svg = svg.replace(/<svg([^>]*)>/, (m, attrs) => '<svg' + attrs.replace(/\s(width|height)="[^"]*"/g, '') + ' width="' + Math.round(ratio * 400) + '" height="400"' + (vb ? '' : ' viewBox="0 0 ' + wh[1] + ' ' + wh[2] + '" preserveAspectRatio="none"') + '>');
    const flag = 'flags/' + sha(svg) + '.svg';
    fs.writeFileSync(path.join(root, flag), svg);
    // Names.
    const names = new Set([c.name.common, c.name.official, ...(NAME_ALIASES[cc] || [])]);
    c.altSpellings.forEach((s) => { if (s.length > 3 || SHORT_OK.test(s)) names.add(s); });
    const name = cc === 'CI' ? 'Ivory Coast' : cc === 'TR' ? 'Türkiye' : c.name.common;
    const caps = CAPITALS[cc] || c.capital;
    if (!caps || !caps.length) throw new Error('No capital for ' + cc);
    return { id: cc.toLowerCase(), name, ratio: Math.round(ratio * 1000) / 1000, area: Math.round(c.area), nb: (c.borders || []).map((b) => by3[b]).filter((x) => x && ours.has(x)).sort(), names: [...names].filter((n) => n !== name), capital: caps[0], capitals: caps.slice(1), region: regionOf(c), flag, shape: outline(c),
      // Facts for the newer games (Hot or cold, Closer or further, Clue reveal, Currency & people), all from world-countries.
      ll: c.latlng.map((v) => Math.round(v * 100) / 100), land: !!c.landlocked, sub: c.subregion || '',
      cur: Object.values(c.currencies || {}).map((x) => x.name), lang: Object.values(c.languages || {}), dem: ((c.demonyms || {}).eng || {}).m || '' };
  }).sort((a, b) => a.name.localeCompare(b.name));
  // Only keep borders both countries agree on (drops e.g. Sri Lanka → India, which is a sea border).
  const byId = Object.fromEntries(out.map((c) => [c.id, c]));
  const mutual = out.map((c) => c.nb.filter((n) => byId[n].nb.includes(c.id)));
  out.forEach((c, i) => { c.nb = mutual[i]; });

  const js = '/* Country data for Geography Speedrun, generated by tools/data.js — do not edit by hand.\n' +
    '   Names/capitals: world-countries (ODbL 1.0). Outlines: Natural Earth (public domain) via world-atlas (ISC). Flags: svg-country-flags (public domain, from Wikipedia). */\n' +
    'window.GS_DATA = { countries: [\n' + out.map((c) => ' ' + JSON.stringify(c)).join(',\n') + '\n] };\n';
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/data.js'), js);

  const lic = path.join(root, 'licenses'); fs.mkdirSync(lic, { recursive: true });
  fs.copyFileSync(nm('world-countries/LICENSE'), path.join(lic, 'world-countries-ODbL.txt'));
  fs.copyFileSync(nm('world-atlas/LICENSE'), path.join(lic, 'world-atlas-ISC.txt'));
  fs.writeFileSync(path.join(lic, 'svg-country-flags-PD.txt'), 'Flag SVGs from svg-country-flags (https://github.com/hjnilsson/country-flags), taken from Wikipedia.\nThe package is marked public domain ("PD"): flags are generally not under copyright. Use of national flags may have other legal restrictions.\n');
  fs.rmSync(path.join(lic, 'flag-icons-MIT.txt'), { force: true });
  const by = {}; out.forEach((c) => { by[c.region] = (by[c.region] || 0) + 1; });
  console.log('data: ' + out.length + ' countries', by, Math.round(js.length / 1024) + ' KB');
})().catch((e) => { console.error(e); process.exit(1); });
