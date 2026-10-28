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
