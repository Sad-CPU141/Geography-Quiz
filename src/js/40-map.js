/* ---- the Map game (Seterra style) ----
   The whole map (or the region). It names a country; tap it. Right first time = green, second = yellow,
   third = orange; three wrong taps and it turns red, counts as missed, and you have to tap it to go on (like
   Seterra). Pinch / drag / scroll to zoom and pan, or use the + − buttons.
   Small countries, Seterra style: a little white dot where a country is too small to see, a dashed box round a
   spread-out island group, and (on the world map, on a big enough screen) magnified Caribbean and Pacific boxes.
   A tap on the sea just next to a dot or box counts for it. */
function mapGame(api) {
  const { sec, res } = api;
  // Three ways to play the map: 'map' (tap the named country), 'flagmap' (tap the country of the flag shown),
  // 'mapname' (a country lights up in gold; type its name).
  const mode = sec.game, naming = mode === 'mapname';
  const M = window.GS_MAP, view = M.views[S.session.cfg.region], m = M[view.map];
  const ids = sec.ids, playable = new Set(ids);
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
  const svg = h('svg', { class: 'map', role: 'img', 'aria-label': 'World map', preserveAspectRatio: 'xMidYMid meet' },
    h('rect', { class: 'sea', x: -m.w, y: -m.h, width: m.w * 3, height: m.h * 3 }), ...main.nodes);
  // Magnified boxes (world map only).
  const insets = (view.insets || []).map((ins) => {
    const md = M[ins.map], L = layer(md, ins.name);
    const isvg = h('svg', { class: 'map', viewBox: ins.box.join(' '), preserveAspectRatio: 'xMidYMid slice' },
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
  const nameInput = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go', placeholder: 'Type the gold country…', 'aria-label': 'Name the country lit up in gold' });
  const nameBox = h('div', { class: 'namebox' }, nameInput);
  const sugEl = h('div', { class: 'suggest', 'aria-live': 'polite', hidden: true });
  const hint = h('div', { class: 'maphint', 'aria-live': 'polite' });
  const foundEl = h('span', { class: 'found num' });
  const barOk = h('i', { class: 'b-ok' }), barMiss = h('i', { class: 'b-miss' });
  const portrait = () => window.innerHeight > window.innerWidth * 1.15;
  const skipBtn = h('button', { class: 'btn ghost giveup', onclick: () => skip() }, 'Skip');
  const footer = h('div', { class: 'reveal-bar floating', hidden: true });
  const head = h('div', { class: 'bhead' },
    h('div', { class: 'hud' },
      h('button', { class: 'iconbtn', 'aria-label': 'Stop the run', onclick: api.quit }, '✕'),
      h('div', { class: 'secname' }, h('b', null, gameOf(mode).em + ' ' + api.label), api.part ? h('small', null, 'Game ' + api.part) : null),
      h('div', { class: 'timer num' }, fmtTime(api.R.clock.elapsed())),
      h('button', { class: 'btn ghost giveup', onclick: () => { if (!revealed && !ended) api.giveUp(); } }, 'Give up')),
    h('div', { class: 'prompt' }, h('span', { class: 'findlbl' }, h('span', { class: 'eyebrow' }, naming ? 'Name it' : 'Find'), foundEl), naming ? nameBox : target, skipBtn),
    naming ? sugEl : null,
    h('div', { class: 'mapbar', 'aria-hidden': 'true' }, barOk, barMiss),
    hint);
  mount(h('div', { class: 'app map-run' }, head, wrap, footer));
  document.body.classList.add('fullscreen');

  /* ---- view: fit, zoom, pan ---- */
  let base, vb;
  const size = () => { const r = svg.getBoundingClientRect(); return { w: r.width || 1, h: r.height || 1, left: r.left, top: r.top }; };
  let fitAll = false;
  function fit(all) {
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
  svg.addEventListener('pointermove', (e) => {
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
    foundEl.textContent = res.found.length + ' / ' + ids.length + ' found';
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
    const t = tries[queue[0]] || 0;
    hint.textContent = t ? '✗'.repeat(t) + ' ' + (MAP_TRIES - t) + ' tries left' : '';
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
    if (naming || ended || !id || !playable.has(id)) return;
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
  const help = spellingHelp(nameInput, sugEl, 'country', () => queue[0], () => named());
  function named() {
    const cur = queue[0];
    res.found.push(cur); setState(cur, 'g0'); pop(cur);
    const r = (els[cur][0]).getBoundingClientRect(); tapName(r.left + r.width / 2, r.top + r.height / 2, BY_ID[cur].name, true);
    queue.shift(); count(); ask();
  }
  nameInput.addEventListener('input', () => { if (!naming || ended || revealed) return; if (isRight(queue[0], 'country', nameInput.value)) named(); else help.update(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!ended && !revealed) { if (isRight(queue[0], 'country', nameInput.value)) named(); else help.enter(); } } });
  // Bring the gold country into view: zoom in on it if it's small or off screen.
  function showTarget(id) {
    if (!base) return requestAnimationFrame(() => showTarget(id));
    const el = els[id][0], bb = el.getBBox(), s = size();
    const onScreen = el.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    const visible = onScreen.right > w.left + 20 && onScreen.left < w.right - 20 && onScreen.bottom > w.top + 20 && onScreen.top < w.bottom - 20;
    const big = Math.max(onScreen.width, onScreen.height) >= 24;
    if (visible && big) return;
    // A view about 6× the country's size (but not smaller than a fifth of the region), centred on it.
    const ar = s.w / s.h, cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    let vw = Math.max(bb.width * 6, bb.height * 6 * ar, base.w / 5);
    vw = Math.min(vw, base.w);
    vb = { x: cx - vw / 2, y: cy - vw / ar / 2, w: vw, h: vw / ar }; apply();
  }
  count(); ask();
  if (portrait() && !store.get('gs_tip_sideways', false)) {
    hint.textContent = 'Tip: turn your phone sideways for a bigger map. Pinch to zoom.';
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
