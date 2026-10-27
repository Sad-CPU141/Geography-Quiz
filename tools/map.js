// Builds the clickable world map for the Map game (run: npm run map, after npm run data).
// Natural Earth 1:50m outlines (public domain) via world-atlas (ISC), Natural Earth projection (d3-geo).
// Output: src/map.js → window.GS_MAP = {
//   world:   { w, h, land, c: { id: path }, dot: { id: [x, y] } }   (centred on 0°)
//   pacific: { ... }                                               (centred on 170°E, for Oceania)
//   views:   { region: { map, box: [x, y, w, h] } } }
// "land" is everything that isn't one of the 197 countries (Greenland, W. Sahara, territories…), drawn grey.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const nm = (p) => path.join(root, 'node_modules', p);

// Areas the data keeps separate that people click as part of a country.
const MERGE = { Somaliland: 'so', 'N. Cyprus': 'cy', 'Cyprus U.N. Buffer Zone': 'cy', Kosovo: 'xk', 'Hong Kong': 'cn', Macao: 'cn', 'Åland': 'fi' };
const W = 2000;
const EPS = 0.3; // simplification tolerance in map pixels
const DOT_AREA = 30; // countries smaller than this (px² on the world map) also get a tap circle

// Region views as lon/lat boxes [lonMin, lonMax, latMin, latMax].
const VIEWS = {
  world: ['world', null],
  Africa: ['world', [-26, 64, -37, 38]],
  Europe: ['world', [-25, 48, 34, 71]],
  Asia: ['world', [25, 150, -12, 56]],
  'North America': ['world', [-140, -55, 6, 62]],
  'South America': ['world', [-93, -30, -57, 14]],
  Oceania: ['pacific', [110, 212, -48, 14]],
};

(async () => {
  const d3 = await import('d3-geo');
  const topo = await import('topojson-client');
  const load = (r) => { const w = require(nm('world-atlas/countries-' + r + '.json')); return topo.feature(w, w.objects.countries).features; };
  const f50 = load('50m'), f10 = load('10m');
  global.window = {}; require(path.join(root, 'src/data.js'));
  const DATA = window.GS_DATA.countries;
  const byNum = {};
  require(nm('world-countries/countries.json')).forEach((c) => { byNum[c.ccn3] = c.cca2.toLowerCase(); });
  const ours = new Set(DATA.map((c) => c.id));
  const idOf = (f) => MERGE[f.properties.name] || (byNum[f.id] && ours.has(byNum[f.id]) ? byNum[f.id] : null);
  let feats = f50.filter((f) => f.properties.name !== 'Antarctica');
  // Tuvalu is only in the 1:10m data.
  const tv = f10.find((f) => f.id === '798'); if (tv && !feats.some((f) => f.id === '798')) feats.push(tv);

  function dp(pts) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); let mx = 0, mi = -1;
      const [ax, ay] = pts[a], [bx, by] = pts[b]; const dx = bx - ax, dy = by - ay; const L = Math.hypot(dx, dy);
      for (let i = a + 1; i < b; i++) { const dd = L ? Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L : Math.hypot(pts[i][0] - ax, pts[i][1] - ay); if (dd > mx) { mx = dd; mi = i; } }
      if (mx > EPS) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  // Draw a feature: projection stream → rings → simplified compact path data.
  function draw(proj, f) {
    const rings = []; let cur = null;
    const stream = proj.stream({
      point(x, y) { cur.push([x, y]); }, lineStart() { cur = []; }, lineEnd() { if (cur.length > 2) rings.push(cur); cur = null; },
      polygonStart() {}, polygonEnd() {}, sphere() {},
    });
    d3.geoStream(f, stream);
    let d = '';
    rings.forEach((ring) => {
      let pts = ring.map(([x, y]) => [r1(x), r1(y)]);
      let far = 0, fd = -1; pts.forEach((q, i) => { const dd = Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]); if (dd > fd) { fd = dd; far = i; } });
      pts = far > 0 ? dp(pts.slice(0, far + 1)).concat(dp(pts.slice(far)).slice(1)) : pts;
      pts = pts.filter((p, i) => !i || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
      if (pts.length < 3) return;
      let [px, py] = pts[0];
      d += 'M' + px + ' ' + py;
      for (let i = 1; i < pts.length; i++) { const [x, y] = pts[i]; if (i === pts.length - 1 && x === pts[0][0] && y === pts[0][1]) break; d += 'l' + r1(x - px) + (y - py >= 0 ? ' ' : '') + r1(y - py); px = x; py = y; }
      d += 'z';
    });
    return d.replace(/(\D)0\./g, '$1.').replace(/-0\./g, '-.');
  }

  function build(rotate, keep) {
    const proj = d3.geoNaturalEarth1().rotate(rotate).precision(0.2);
    proj.fitWidth(W, { type: 'Sphere' });
    const H = Math.ceil(d3.geoPath(proj).bounds({ type: 'Sphere' })[1][1]);
    const path0 = d3.geoPath(proj);
    const c = {}, dot = {}, area = {}, cent = {}; let land = '';
    feats.forEach((f) => {
      if (keep && !keep(f)) return;
      const id = idOf(f);
      const d = draw(proj, f);
      if (!id) { land += d; return; }
      c[id] = (c[id] || '') + d;
      const a = path0.area(f);
      area[id] = (area[id] || 0) + a;
      if (!cent[id] || a > cent[id][2]) cent[id] = [...path0.centroid(f), a];
    });
    Object.keys(c).forEach((id) => { if (area[id] < DOT_AREA) dot[id] = [r1(cent[id][0]), r1(cent[id][1])]; });
    return { proj, map: { w: W, h: H, land, c, dot } };
  }
  const world = build([0, 0]);
  const lonOf = (f) => d3.geoCentroid(f)[0];
  const pacific = build([-170, 0], (f) => { const lon = lonOf(f); return lon > 60 || lon < -100; });
  const missing = DATA.filter((x) => !world.map.c[x.id]).map((x) => x.id);
  if (missing.length) throw new Error('Not on the map: ' + missing.join(','));

  const views = {};
  for (const [reg, [which, box]] of Object.entries(VIEWS)) {
    const { proj, map } = which === 'world' ? world : pacific;
    if (!box) { views[reg] = { map: which, box: [0, 0, map.w, map.h] }; continue; }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
      const p = proj([box[0] + (box[1] - box[0]) * i / 20, box[2] + (box[3] - box[2]) * j / 20]);
      if (!p) continue; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
    views[reg] = { map: which, box: [Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0)] };
    // Every country of the region must be on that map.
    DATA.filter((x) => x.region === reg).forEach((x) => { if (!map.c[x.id]) throw new Error(x.id + ' missing on ' + which + ' map'); });
  }
  const js = '/* World map for the Map game, generated by tools/map.js — do not edit by hand.\n   Natural Earth (public domain) via world-atlas (ISC). */\nwindow.GS_MAP = ' +
    JSON.stringify({ world: world.map, pacific: pacific.map, views }) + ';\n';
  fs.writeFileSync(path.join(root, 'src/map.js'), js);
  console.log('map: ' + Math.round(js.length / 1024) + ' KB · dots: ' + Object.keys(world.map.dot).join(' '));
})().catch((e) => { console.error(e); process.exit(1); });
