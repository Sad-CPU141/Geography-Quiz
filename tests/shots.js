// Real-browser checks with Playwright (Chromium): plays boards, the map game, combined runs, quick fire,
// pass-the-phone and a challenge link, and takes screenshots at phone, laptop and TV sizes.
// Fails on page errors or sideways scrolling. Run: npm run shots
const path = require('path');
const http = require('http');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'shots'); fs.mkdirSync(outDir, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
// Served under /Geography-Quiz/ like on GitHub Pages.
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/Geography-Quiz/, '');
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const BASE = 'http://localhost:' + server.address().port + '/Geography-Quiz/';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL: ' + m); } else console.log('ok  ' + m); };
const SIZES = [['phone', 360, 780], ['laptop', 1366, 768], ['tv', 1920, 1080]];
const only = process.argv[2];

async function noSideScroll(page, label) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  ok(w[0] <= w[1], label + ': no sideways scroll (' + w[0] + ' ≤ ' + w[1] + ')');
}
async function setupBoard(page, games, region) {
  await page.click('text=New run'); await page.waitForSelector('.seg');
  await page.click('.opt:has-text("Full board")');
  // Turn games on/off to match `games`.
  for (const G of ['Flags', 'Map', 'Capitals', 'Shapes', 'Flags', 'Map', 'Capitals', 'Shapes']) {
    const isOn = !!(await page.$('.game-row.on .game-pick:has-text("' + G + '")'));
    if (games.includes(G) !== isOn && !(isOn && !games.includes(G) && (await page.$$('.game-row.on')).length === 1)) await page.click('.game-pick:has-text("' + G + '")');
  }
  for (const g of games) { const isOn = await page.$('.game-row.on .game-pick:has-text("' + g + '")'); if (!isOn) await page.click('.game-pick:has-text("' + g + '")'); }
  // Order: move each game up into its place with the arrows.
  for (let j = 0; j < games.length; j++) {
    const on = await page.$$eval('.game-row.on .game-txt b', (bs) => bs.map((b) => b.textContent.split(' ').slice(1).join(' ')));
    for (let i = on.indexOf(games[j]); i > j; i--) await page.click('[aria-label="Move ' + games[j] + ' up"]');
  }
  await page.click('.opt:has-text("' + region + '")');
  await page.click('.opt:has-text("Just me")');
}
// Type the answer for the selected tile (tests read it from the data).
async function typeActive(page, kind) {
  const ans = await page.evaluate((kind) => { const id = document.querySelector('.tile.active').dataset.id; const c = window.GS.DATA.find((x) => x.id === id); return kind === 'capital' ? c.capital : c.name; }, kind);
  // Type like a person: stop as soon as it's accepted (e.g. "Bosnia" is enough for Bosnia and Herzegovina).
  for (let i = 0; i < ans.length; i++) {
    await page.keyboard.type(ans[i]);
    if (await page.$eval('.typebar input', (el) => el.value === '' || el.disabled)) return;
  }
}
// Tap a country on the map like a person would: a point inside it that isn't covered, zooming in if needed.
async function tapCountry(page, id) {
  for (let z = 0; z < 8; z++) {
    const pt = await page.evaluate((id) => {
      const els = [...document.querySelectorAll('.map [data-id="' + id + '"]')].filter((e) => e.style.display !== 'none' && e.getBoundingClientRect().width > 0).reverse(); // dots/boxes first
      const wrap = document.querySelector('.mapwrap').getBoundingClientRect();
      const inside = (x, y) => x > wrap.left + 2 && x < wrap.right - 2 && y > wrap.top + 2 && y < wrap.bottom - 2 && !(x > wrap.right - 64 && y < wrap.top + 175); // not under the zoom buttons
      let zoomAt = null;
      for (const el of els) {
        if (el.tagName === 'circle' || el.tagName === 'rect') { const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; const hit = document.elementFromPoint(cx, cy); if (inside(cx, cy) && hit === el) return { x: cx, y: cy }; }
        const bb = el.getBBox(), m = el.getScreenCTM();
        for (let i = 1; i < 40; i++) for (let j = 1; j < 40; j++) {
          const p = new DOMPoint(bb.x + bb.width * i / 40, bb.y + bb.height * j / 40);
          if (el.isPointInFill && !el.isPointInFill(p)) continue;
          const sp0 = p.matrixTransform(m), sp = { x: Math.round(sp0.x), y: Math.round(sp0.y) };
          if (!zoomAt) zoomAt = { x: sp.x, y: sp.y };
          if (!inside(sp.x, sp.y)) continue;
          const hit = document.elementFromPoint(sp.x, sp.y);
          if (hit && hit.getAttribute('data-id') === id) return { x: sp.x, y: sp.y };
        }
      }
      const circle = els.find((e) => e.tagName === 'circle');
      if (circle) { const r = circle.getBoundingClientRect(); zoomAt = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      if (!zoomAt) { const r = els[0].getBoundingClientRect(); zoomAt = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      return { zoomAt: { x: Math.min(Math.max(zoomAt.x, wrap.left + 5), wrap.right - 70), y: Math.min(Math.max(zoomAt.y, wrap.top + 5), wrap.bottom - 5) } };
    }, id);
    if (pt.x != null) { await page.mouse.click(pt.x, pt.y); return true; }
    if (z === 0) { await resetView(page, 'all'); continue; } // maybe it's off screen: show it all
    if (process.env.DBG) console.log('zoom for', id, JSON.stringify(pt), await page.getAttribute('svg.map', 'viewBox'));
    await page.mouse.move(pt.zoomAt.x, pt.zoomAt.y); await page.mouse.wheel(0, -400); await page.waitForTimeout(30);
  }
  return false;
}
async function resetView(page, want) { // want: 'all' or 'start'
  for (let i = 0; i < 2; i++) { if ((await page.getAttribute('svg.map', 'data-fit')) === want) return; await page.click('[aria-label="Show the whole map"]'); }
}
const targetId = (page) => page.evaluate(() => { const n = document.querySelector('.prompt .target').textContent; const c = window.GS.DATA.find((x) => x.name === n); return c && c.id; });

(async () => {
  const b = await chromium.launch();
  for (const [label, W, H] of SIZES) {
    if (only && only !== label) continue;
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: label === 'phone' ? 2 : 1 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(BASE); await page.waitForSelector('.logo');
    await page.screenshot({ path: path.join(outDir, label + '-01-home.png') }); await noSideScroll(page, label + ' home');

    // 1. Flags board, whole world: 5 right, switch tiles, then give up.
    await setupBoard(page, ['Flags'], 'World');
    await page.screenshot({ path: path.join(outDir, label + '-02-setup.png'), fullPage: true }); await noSideScroll(page, label + ' setup');
    await page.click('button:has-text("Start")'); await page.click('button:has-text("Go")');
    await page.waitForSelector('.tile.active');
    ok((await page.$$('.tile')).length === 196, label + ': 196 flag tiles');
    for (let i = 0; i < 4; i++) await typeActive(page, 'flag');
    const tiles = await page.$$('.tile:not(.done)');
    await tiles[30].click();
    ok(await tiles[30].evaluate((t) => t.classList.contains('active')), label + ': tapping a tile selects it');
    await typeActive(page, 'flag');
    ok((await page.$$('.tile.done')).length === 5, label + ': 5 flags done');
    const before = await page.$eval('.tile.active', (t) => t.dataset.id);
    await page.type('.typebar input', 'Zzzland'); await page.keyboard.press('Enter');
    ok(await page.$eval('.tile.active', (t) => t.dataset.id) === before, label + ': Enter on a wrong answer stays on the same flag');
    ok(await page.$eval('.typebar input', (i) => i.classList.contains('shake')), label + ': wrong + Enter shakes');
    ok(!(await page.isVisible('.suggest')), label + ': no spelling help when it is off');
    await page.fill('.typebar input', '');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, label + '-03-flags-board.png') }); await noSideScroll(page, label + ' flags board');
    await page.click('button:has-text("Give up")'); await page.click('button:has-text("Give up and show me")');
    await page.waitForSelector('.tile.missed');
    ok((await page.$$('.tile.missed')).length === 191, label + ': give up shows 191 missed');
    await page.screenshot({ path: path.join(outDir, label + '-04-flags-gaveup.png') });
    await page.click('button:has-text("See results")'); await page.waitForSelector('.result-time');
    ok((await page.textContent('.stat b')).trim() === '5/196', label + ': result 5/196');
    await page.screenshot({ path: path.join(outDir, label + '-05-result-flags.png'), fullPage: true }); await noSideScroll(page, label + ' result');

    // 2. Combined run, Europe: Map first (2 misses on the first, 3 strikes on the second), then Capitals all typed.
    await page.click('button:has-text("Home")');
    await setupBoard(page, ['Map', 'Capitals'], 'Europe');
    await page.click('.card:has-text("Spelling help") .opt:has-text("On")');
    const order = await page.$$eval('.game-row.on .game-txt b', (bs) => bs.map((x) => x.textContent));
    ok(/Map/.test(order[0]) && /Capitals/.test(order[1]), label + ': order Map → Capitals (' + order.join(', ') + ')');
    await page.click('button:has-text("Start")'); await page.click('button:has-text("Go")');
    await page.waitForSelector('.map .cty');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, label + '-06-map.png') }); await noSideScroll(page, label + ' map');
    let n = 0, misses = 0;
    while (await page.$('.prompt .target') && n < 60) {
      const id = await targetId(page); if (!id) break;
      if (n === 0 || n === 1) {
        // Wrong taps: pick another European country.
        const wrongs = await page.evaluate((id) => window.GS.DATA.filter((c) => c.region === 'Europe' && c.id !== id && ['de', 'fr', 'es', 'pl', 'ua', 'it'].includes(c.id)
          && !document.querySelector('.map path[data-id="' + c.id + '"]').getAttribute('data-st')).map((c) => c.id), id); // not already found
        const k = n === 0 ? 2 : 3;
        for (let w = 0; w < k; w++) { await tapCountry(page, wrongs[w]); await page.waitForTimeout(60); }
        if (n === 1) {
          misses++;
          ok(await page.$eval('.map [data-id="' + id + '"]', (e) => e.getAttribute('data-st') === 'must'), label + ': after 3 misses the country flashes red');
          ok((await targetId(page)) === id, label + ': and the game waits for it');
          await tapCountry(page, id);
          ok((await targetId(page)) !== id, label + ': tapping it moves on');
          ok(await page.$eval('.map [data-id="' + id + '"]', (e) => e.getAttribute('data-st') === 'miss'), label + ': it stays red (missed)');
          n++; continue;
        }
      }
      const tapped = await tapCountry(page, id);
      if (!tapped) { console.log('could not tap ' + id); await page.screenshot({ path: path.join(outDir, label + '-fail-tap.png') }); break; }
      await resetView(page, 'start');
      n++;
      if (n === 3) await page.screenshot({ path: path.join(outDir, label + '-07-map-playing.png') });
      if (await page.$('.typebar')) break;
    }
    await page.waitForSelector('.typebar input', { timeout: 5000 }).catch(async (e) => { await page.screenshot({ path: path.join(outDir, label + '-fail-map.png') }); console.log('n=' + n, await page.textContent('.bhead')); throw e; });
    ok(true, label + ': map finished after ' + n + ' prompts, now on Capitals');
    // Spelling help: a misspelt capital (two letters swapped) offers the right spelling; tapping it is accepted.
    const cap = await page.evaluate(() => { const id = document.querySelector('.tile.active').dataset.id; return window.GS.DATA.find((x) => x.id === id).capital; });
    const typo = cap.length > 5 ? cap.slice(0, 2) + cap[3] + cap[2] + cap.slice(4) : null;
    if (typo && !(await page.evaluate((t) => window.GS.suggest(t, 'capital').length !== 1, typo))) {
      await page.type('.typebar input', typo);
      await page.waitForSelector('.suggest .sug', { timeout: 4000 }).catch(async (e) => { await page.screenshot({ path: path.join(outDir, label + '-fail-sug.png') }); console.log('typo', typo, 'value', await page.inputValue('.typebar input'), await page.evaluate(() => document.querySelector('.suggest').outerHTML)); throw e; });
      ok((await page.textContent('.suggest .sug')).trim() === cap, label + ': did you mean "' + cap + '" for "' + typo + '"');
      await page.screenshot({ path: path.join(outDir, label + '-08a-spelling-help.png') });
      const doneBefore = (await page.$$('.tile.done')).length;
      await page.click('.suggest .sug');
      ok((await page.$$('.tile.done')).length === doneBefore + 1, label + ': tapping the suggestion accepts it');
    } else console.log('(skipped spelling check for ' + cap + ')');
    for (let i = 0; i < 46; i++) { await page.waitForSelector('.tile.active', { timeout: 3000 }).catch(() => {}); if (!(await page.$('.tile.active'))) break; await typeActive(page, 'capital'); }
    await page.waitForSelector('.result-time');
    const st = (await page.textContent('.stat b')).trim();
    ok(st === '91/92', label + ': combined result 91/92 (got ' + st + ')');
    await page.screenshot({ path: path.join(outDir, label + '-08-result-combo.png'), fullPage: true }); await noSideScroll(page, label + ' combo result');

    // 3. Quick fire still works.
    await page.click('button:has-text("Change")'); await page.click('.opt:has-text("Quick fire")');
    await page.click('.opt:has-text("Flags")'); await page.click('.opt:has-text("10")'); await page.click('.opt:has-text("Type it")');
    await page.click('button:has-text("Start")'); await page.click('button:has-text("Go")'); await page.waitForSelector('.answer input');
    for (let i = 0; i < 10; i++) {
      await page.waitForFunction(() => !document.querySelector('.stage.ok, .stage.bad') && document.querySelector('.stage img'));
      const name = await page.evaluate(() => { const src = document.querySelector('.stage img').getAttribute('src'); return window.GS.DATA.find((c) => src.endsWith(c.flag)).name; });
      await page.type('.answer input', name);
    }
    await page.waitForSelector('.result-time');
    ok((await page.textContent('.stat b')).trim() === '10/10', label + ': quick fire 10/10');
    ok(errors.length === 0, label + ': no page errors ' + JSON.stringify(errors));
    await ctx.close();
  }

  // Islands: Oceania and the Caribbean on a phone, tapping each island country's ring (a little off-centre,
  // as a thumb would) instead of the island itself.
  for (const region of only && only !== 'islands' ? [] : ['Oceania', 'N. America']) {
    const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await setupBoard(page, ['Map'], region);
    await page.click('button:has-text("Start")'); await page.click('button:has-text("Go")'); await page.waitForSelector('.map .cty');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, 'islands-' + region.replace(/\W/g, '') + '.png') });
    let ringTaps = 0, total = 0;
    for (let k = 0; k < 40; k++) {
      const id = await targetId(page); if (!id) break;
      total++;
      await resetView(page, 'start');
      const ring = await page.evaluate((id) => { const c = [...document.querySelectorAll('.map circle[data-id="' + id + '"], .map rect[data-id="' + id + '"]')].find((e) => e.style.display !== 'none'); if (!c) return null; const r = c.getBoundingClientRect(), w = document.querySelector('.mapwrap').getBoundingClientRect();
        const x = r.left + r.width / 2 + 3, y = r.top + r.height / 2 + 2; return x > w.left && x < w.right && y > w.top && y < w.bottom && !(x > w.right - 64 && y < w.top + 175) ? { x, y } : null; }, id);
      if (ring) { await page.mouse.click(ring.x, ring.y); ringTaps++; } else await tapCountry(page, id);
      await page.waitForTimeout(40);
      if ((await targetId(page)) === id) { console.log('ring/tap missed ' + id, JSON.stringify(ring), await page.textContent('.maphint'), await page.getAttribute('svg.map', 'viewBox')); await tapCountry(page, id); }
      if (await page.$('.result-time')) break;
    }
    await page.waitForSelector('.result-time');
    const st = (await page.textContent('.stat b')).trim();
    ok(st === total + '/' + total, region + ' islands: all found first time (' + st + ', ' + ringTaps + ' by ring)');
    ok(errors.length === 0, region + ': no page errors ' + JSON.stringify(errors));
    await ctx.close();
  }
  // World map on a laptop: the Caribbean and Pacific insets work (tap Dominica, Tonga, … inside them).
  if (!only || only === 'islands') {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await setupBoard(page, ['Map'], 'World');
    await page.click('button:has-text("Start")'); await page.click('button:has-text("Go")'); await page.waitForSelector('.map .cty');
    await page.waitForTimeout(300);
    ok(await page.isVisible('.inset-left') && await page.isVisible('.inset-right'), 'world map shows the Caribbean and Pacific insets');
    await page.screenshot({ path: path.join(outDir, 'world-insets.png') });
    // Skip until a country that's in an inset comes up, then tap it there. Do that 5 times.
    const inInset = await page.evaluate(() => [...new Set([...document.querySelectorAll('.inset [data-id]')].filter((e) => e.style.display !== 'none' && e.getBoundingClientRect().width > 0 && !e.classList.contains('off')).map((e) => e.getAttribute('data-id')))]);
    ok(['dm', 'lc', 'to', 'fj', 'ws'].every((id) => inInset.includes(id)), 'Dominica, St Lucia, Tonga, Fiji and Samoa are in the insets');
    let viaInset = 0;
    for (let k = 0; k < 400 && viaInset < 5; k++) {
      const id = await targetId(page);
      if (!inInset.includes(id)) { await page.click('.prompt button:has-text("Skip")'); continue; }
      const before = parseInt(await page.textContent('.found'), 10);
      const pt = await page.evaluate((id) => {
        for (const el of document.querySelectorAll('.inset [data-id="' + id + '"]')) {
          if (el.style.display === 'none') continue;
          const r = el.getBoundingClientRect(); if (!r.width) continue;
          for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) { const x = Math.round(r.left + r.width * i / 10), y = Math.round(r.top + r.height * j / 10); const hit = document.elementFromPoint(x, y); if (hit && hit.getAttribute('data-id') === id) return { x, y }; }
        }
        return null;
      }, id);
      if (!pt) { await page.click('.prompt button:has-text("Skip")'); continue; }
      await page.mouse.click(pt.x, pt.y);
      const okTap = parseInt(await page.textContent('.found'), 10) === before + 1;
      if (!okTap) console.log('inset tap', id, JSON.stringify(pt), await page.textContent('.maphint'), await page.evaluate((p) => { const e = document.elementFromPoint(p.x, p.y); return e.outerHTML.slice(0, 90) + ' in ' + (e.closest('.inset') ? 'inset' : 'main'); }, pt));
      ok(okTap, 'found ' + id + ' by tapping it in the inset');
      viaInset++;
    }
    ok(viaInset === 5, 'tapped 5 countries inside the insets');
    ok(errors.length === 0, 'world map: no page errors ' + JSON.stringify(errors));
    await ctx.close();
  }
  if (only === 'islands') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }

  if (!only) {
    // Challenge link for a board run: the friend gets the same tile order.
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await setupBoard(page, ['Shapes'], 'S. America');
    await page.fill('input[placeholder="Name"]', 'Xrazt');
    await page.click('button:has-text("Start")'); await page.click('button:has-text("Go")'); await page.waitForSelector('.tile.active');
    const orderA = await page.$$eval('.tile', (ts) => ts.map((t) => t.dataset.id));
    await page.screenshot({ path: path.join(outDir, 'shapes-board.png') });
    for (let i = 0; i < 12; i++) await typeActive(page, 'shape');
    await page.waitForSelector('.result-time');
    await page.click('button:has-text("Send challenge")'); await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const link = (clip.match(/https?:\S+/) || [])[0];
    ok(!!link && /n=Xrazt/.test(link) && /s=12/.test(link), 'share link: ' + link);
    const p2 = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    p2.on('pageerror', (e) => errors.push(e.message));
    await p2.goto(link); await p2.waitForSelector('.card.sky');
    ok((await p2.textContent('.card.sky')).includes('12/12'), 'challenge card shows 12/12');
    await p2.click('button:has-text("Take it on")'); await p2.click('button:has-text("Go")'); await p2.waitForSelector('.tile.active');
    ok(JSON.stringify(await p2.$$eval('.tile', (ts) => ts.map((t) => t.dataset.id))) === JSON.stringify(orderA), 'friend gets the same tile order');
    for (let i = 0; i < 11; i++) await typeActive(p2, 'shape');
    await p2.click('button:has-text("Give up")'); await p2.click('button:has-text("Give up and show me")'); await p2.click('button:has-text("See results")');
    await p2.waitForSelector('.versus');
    ok((await p2.textContent('.versus')).includes('Xrazt wins'), 'versus: ' + (await p2.textContent('.versus')));
    await p2.screenshot({ path: path.join(outDir, 'challenge-result.png'), fullPage: true });
    ok(errors.length === 0, 'no page errors in challenge flow ' + JSON.stringify(errors));
  }
  await b.close(); server.close();
  console.log(fails ? fails + ' FAILED' : 'all browser checks passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
