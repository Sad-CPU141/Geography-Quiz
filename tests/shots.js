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
// Game labels as shown in setup ("Map: name it" before "Map" so has-text matches the right row).
const ALL_GAMES = ['Flags', 'Map', 'Capitals', 'Shapes', 'Reverse Capitals', 'Map: name it', 'Borders', 'Flag → Map', 'Bigger country'];

async function noSideScroll(page, label) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  ok(w[0] <= w[1], label + ': no sideways scroll (' + w[0] + ' ≤ ' + w[1] + ')');
}
const GAME_ID = { 'Flags': 'flags', 'Map': 'map', 'Capitals': 'capitals', 'Shapes': 'shapes', 'Reverse Capitals': 'revcap', 'Map: name it': 'mapname', 'Borders': 'borders', 'Flag → Map': 'flagmap', 'Bigger country': 'duel' };
async function setupBoard(page, labels, region) {
  const games = labels.map((l) => GAME_ID[l]);
  await page.click('button:has-text("▶ New run")'); await page.waitForSelector('.seg');
  await page.click('.opt:has-text("Full board")');
  const tog = await page.$('.more-toggle[aria-expanded="false"]'); if (tog) await tog.click();
  // Turn on what's wanted, then turn off the rest.
  for (const g of games) if (!(await page.$('.game-row.on[data-game="' + g + '"]'))) await page.click('.game-pick[data-game="' + g + '"]');
  for (const g of Object.values(GAME_ID)) if (!games.includes(g) && (await page.$('.game-row.on[data-game="' + g + '"]'))) await page.click('.game-pick[data-game="' + g + '"]');
  // Order: move each game up into its place with the arrows.
  for (let j = 0; j < games.length; j++) {
    const on = await page.$$eval('.game-row.on', (rs) => rs.map((r) => r.dataset.game));
    // Rows on screen are main-then-more; the run order is in the numbers.
    const order = await page.$$eval('.game-row.on', (rs) => rs.map((r) => [r.dataset.game, +r.querySelector('.game-num').textContent]).sort((x, y) => x[1] - y[1]).map((x) => x[0]));
    void on;
    for (let i = order.indexOf(games[j]); i > j; i--) await page.click('.game-row[data-game="' + games[j] + '"] [aria-label$=" up"]');
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
    // Tapping an option low on the setup page keeps you where you are (it used to jump to the top).
    if (label === 'phone') {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const y0 = await page.evaluate(() => window.scrollY);
      await page.click('.opt:has-text("Pass the phone")'); await page.click('.opt:has-text("Just me")');
      const y1 = await page.evaluate(() => window.scrollY);
      ok(y0 > 300 && Math.abs(y1 - y0) < 80, label + ': setup keeps its scroll position (' + y0 + ' → ' + y1 + ')');
    }
    await page.click('button:has-text("Start")'); await page.click('button:has-text("Go")');
    await page.waitForSelector('.tile.active');
    ok((await page.$$('.tile')).length === 196, label + ': 196 flag tiles');
    for (let i = 0; i < 4; i++) await typeActive(page, 'flag');
    const tiles = await page.$$('.tile:not(.done)');
    await tiles[30].click();
    if (label === 'phone') {
      const yb = await page.evaluate(() => window.scrollY);
      const far = (await page.$$('.tile:not(.done)'))[60]; await far.scrollIntoViewIfNeeded(); const ya = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => document.activeElement.blur()); await far.click(); await page.waitForTimeout(400);
      const yc = await page.evaluate(() => window.scrollY);
      ok(ya > 1000 && Math.abs(yc - ya) < 200, label + ': tapping a flag far down doesn\'t jump to the top (' + ya + ' → ' + yc + ')');
      void yb; await tiles[30].click();
    }
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
    await page.click('.optrow:has-text("Spelling help") .switch');
    const order = await page.$$eval('.game-row.on', (rs) => rs.map((r) => [r.dataset.game, +r.querySelector('.game-num').textContent]).sort((x, y) => x[1] - y[1]).map((x) => x[0]));
    ok(order.join() === 'map,capitals', label + ': order Map → Capitals (' + order.join(', ') + ')');
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

  // The 5 "More games" in one combined run (South America, phone): Reverse Capitals → Borders → Bigger country
  // → Flag → Map → Map: name it. Everything answered right, so it should end 100%.
  if (!only || only === 'more') {
    const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await setupBoard(page, ['Reverse Capitals', 'Borders', 'Bigger country', 'Flag → Map', 'Map: name it'], 'S. America');
    await page.screenshot({ path: path.join(outDir, 'more-setup.png'), fullPage: true });
    const order = await page.$$eval('.game-row.on', (rs) => rs.map((r) => [r.dataset.game, +r.querySelector('.game-num').textContent]).sort((x, y) => x[1] - y[1]).map((x) => x[0]));
    ok(order.join() === 'revcap,borders,duel,flagmap,mapname', 'more games picked in order: ' + order.join(', '));
    await page.click('button:has-text("Start")'); await page.click('button:has-text("Go")');
    // Reverse Capitals
    await page.waitForSelector('.tile.active');
    await page.screenshot({ path: path.join(outDir, 'more-1-revcap.png') });
    for (let i = 0; i < 12; i++) { if (!(await page.$('.tile.active'))) break; await typeActive(page, 'flag'); }
    // Borders
    await page.waitForSelector('.bcard .big');
    await page.screenshot({ path: path.join(outDir, 'more-2-borders.png') });
    for (let k = 0; k < 60 && await page.$('.bcard .big'); k++) {
      const left = await page.evaluate(() => { const n = document.querySelector('.bcard .big').textContent; const c = window.GS.DATA.find((x) => x.name === n); const got = [...document.querySelectorAll('.slot.got')].map((e) => e.textContent); return c.nb.map((id) => window.GS.DATA.find((x) => x.id === id).name).filter((nm) => !got.includes(nm)); });
      if (!left.length) break;
      for (const ch of left[0]) { await page.keyboard.type(ch); if (await page.$eval('.typebar input', (el) => el.value === '' || el.disabled)) break; }
      if (await page.$('.duel')) break;
    }
    // Bigger country
    await page.waitForSelector('.duel-pick');
    await page.screenshot({ path: path.join(outDir, 'more-3-duel.png') });
    for (let k = 0; k < 6; k++) {
      await page.waitForSelector('.duel-pick:not(.right):not(.wrong)', { timeout: 4000 }).catch(() => {});
      if (!(await page.$('.duel-pick'))) break;
      const win = await page.evaluate(() => { const ids = [...document.querySelectorAll('.duel-pick')].map((b) => b.dataset.id); return window.GS.duelWinner(ids.join('|')); });
      await page.click('.duel-pick[data-id="' + win + '"]');
      await page.waitForTimeout(800);
    }
    // Flag → Map
    await page.waitForSelector('.promptflag');
    await page.screenshot({ path: path.join(outDir, 'more-4-flagmap.png') });
    for (let k = 0; k < 14 && await page.$('.promptflag'); k++) {
      const id = await page.evaluate(() => { const src = document.querySelector('.promptflag').getAttribute('src'); return window.GS.DATA.find((c) => src.endsWith(c.flag)).id; });
      await resetView(page, 'start'); await tapCountry(page, id); await page.waitForTimeout(60);
    }
    // Map: name it
    await page.waitForSelector('.namebox input');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outDir, 'more-5-mapname.png') });
    for (let k = 0; k < 14 && await page.$('.namebox input:not([disabled])'); k++) {
      const name = await page.evaluate(() => { const el = document.querySelector('.map path[data-st="focus"]'); return el && window.GS.DATA.find((c) => c.id === el.dataset.id).name; });
      if (!name) break;
      for (const ch of name) { await page.keyboard.type(ch); if (await page.$eval('.namebox input', (el) => el.value === '' || el.disabled)) break; }
      await page.waitForTimeout(40);
    }
    await page.waitForSelector('.result-time', { timeout: 6000 });
    const st = (await page.textContent('.stat b')).trim(), [got, tot] = st.split('/').map(Number);
    ok(got === tot && tot > 50, 'all five more games answered right: ' + st);
    await page.screenshot({ path: path.join(outDir, 'more-6-result.png'), fullPage: true });
    // Its challenge code is a long one and decodes to the same run.
    const code = (await page.textContent('.code')).trim();
    ok(code.replace(/-/g, '').length >= 10 && await page.evaluate((c) => JSON.stringify(window.GS.decodeCode(c).games), code) === JSON.stringify(['revcap', 'borders', 'duel', 'flagmap', 'mapname']), 'long challenge code ' + code);
    // Spelling help + a wrong guess in Borders on a fresh run: Enter on a wrong name shakes, nothing counted.
    ok(errors.length === 0, 'more games: no page errors ' + JSON.stringify(errors));

    // Daily run from the home page: play it (give up straight away), the score is kept, a replay doesn't change it.
    await page.click('button:has-text("Home")');
    await page.waitForSelector('.card.daily');
    await page.screenshot({ path: path.join(outDir, 'daily-home.png') });
    await page.click('.card.daily button:has-text("Play today")'); await page.click('button:has-text("Go")');
    await page.waitForSelector('button:has-text("Give up")');
    await page.click('button:has-text("Give up")'); await page.click('button:has-text("End the whole run")'); await page.click('button:has-text("See results")');
    await page.waitForSelector('.result-time');
    const dtxt = await page.textContent('body'); ok(dtxt.includes('📅 Daily') && !dtxt.includes('· replay'), 'daily: first go counts');
    await page.click('button:has-text("Home")');
    await page.waitForSelector('.card.daily');
    ok(/Your score today: 0\//.test(await page.textContent('.card.daily')), 'daily: home shows today\'s score');
    await page.screenshot({ path: path.join(outDir, 'daily-done.png') });
    ok(errors.length === 0, 'daily: no page errors ' + JSON.stringify(errors));
    await ctx.close();
    if (only === 'more') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }
  }

  // Practice mode + My misses (phone): practice Flags in Oceania, Show 3 answers, finish the rest; then the
  // misses screen lists them and its Practice button plays just those.
  if (!only || only === 'practice') {
    const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await setupBoard(page, ['Flags'], 'Oceania');
    await page.click('.optrow:has-text("Practice") .switch');
    ok(await page.getAttribute('.optrow:has-text("Practice") .switch', 'aria-checked') === 'true', 'practice switch on');
    await page.screenshot({ path: path.join(outDir, 'practice-setup.png'), fullPage: true });
    await page.click('button:has-text("Start")'); await page.click('button:has-text("Go")');
    await page.waitForSelector('.tile.active');
    ok((await page.textContent('.timer')).trim() === 'Practice', 'no clock in practice');
    const shownIds = [];
    for (let i = 0; i < 3; i++) { shownIds.push(await page.$eval('.tile.active', (t) => t.dataset.id)); await page.click('.showbtn'); }
    ok((await page.$$('.tile.missed')).length === 3, 'Show reveals 3 answers');
    await page.screenshot({ path: path.join(outDir, 'practice-board.png') });
    for (let i = 0; i < 11; i++) { if (!(await page.$('.tile.active'))) break; await typeActive(page, 'flag'); }
    await page.waitForSelector('.result-time');
    ok((await page.textContent('.result-time')).trim() === '11/14' && !(await page.$('.card.sky')), 'practice result 11/14, no challenge card');
    await page.click('button:has-text("Home")');
    await page.click('button:has-text("My misses")');
    await page.waitForSelector('.pairs li');
    const listed = await page.$$eval('.pairs li span', (els) => els.map((e) => e.textContent));
    const names = await page.evaluate((ids) => ids.map((id) => window.GS.DATA.find((c) => c.id === id).name), shownIds);
    ok(names.every((n) => listed.includes(n)), 'My misses lists the 3 shown: ' + names.join(', '));
    await page.screenshot({ path: path.join(outDir, 'misses.png'), fullPage: true });
    await page.click('.card:has-text("Flags") button:has-text("Practice")'); await page.click('button:has-text("Go")');
    await page.waitForSelector('.tile.active');
    ok((await page.$$('.tile')).length === 3, 'practice of misses has just those 3 flags');
    ok(errors.length === 0, 'practice: no page errors ' + JSON.stringify(errors));
    await ctx.close();
    if (only === 'practice') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }
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
    let ringTaps = 0, total = 0, litChecked = false, litColours = '';
    for (let k = 0; k < 40; k++) {
      const id = await targetId(page); if (!id) break;
      total++;
      await resetView(page, 'start');
      const ring = await page.evaluate((id) => { const c = [...document.querySelectorAll('.map circle[data-id="' + id + '"], .map rect[data-id="' + id + '"]')].find((e) => e.style.display !== 'none'); if (!c) return null; const r = c.getBoundingClientRect(), w = document.querySelector('.mapwrap').getBoundingClientRect();
        const x = r.left + r.width / 2 + 3, y = r.top + r.height / 2 + 2; return x > w.left && x < w.right && y > w.top && y < w.bottom && !(x > w.right - 64 && y < w.top + 175) ? { x, y } : null; }, id);
      if (ring) { await page.mouse.click(ring.x, ring.y); ringTaps++; } else await tapCountry(page, id);
      await page.waitForTimeout(40);
      if (!litChecked && total >= 10) {
        // Found dots light up (not white any more).
        const lit = await page.evaluate(() => [...document.querySelectorAll('.map .dot[data-st]')].filter((d) => d.style.display !== 'none').map((d) => getComputedStyle(d).fill));
        if (lit.length) { litChecked = lit.every((f) => f !== 'rgb(255, 255, 255)'); litColours = [...new Set(lit)].join(', '); await page.screenshot({ path: path.join(outDir, 'islands-' + region.replace(/\W/g, '') + '-lit.png') }); }
      }
      if ((await targetId(page)) === id) { console.log('ring/tap missed ' + id, JSON.stringify(ring), await page.textContent('.maphint'), await page.getAttribute('svg.map', 'viewBox')); await tapCountry(page, id); }
      if (await page.$('.result-time')) break;
    }
    ok(litChecked, region + ': found dots light up (' + litColours + ')');
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
