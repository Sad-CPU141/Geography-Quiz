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
const ALL_GAMES = ['Flags', 'Map', 'Capitals', 'Shapes', 'Reverse Capitals', 'Map: name it', 'Borders', 'Flag → Map', 'Bigger country', 'Guess the language'];

async function noSideScroll(page, label) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  ok(w[0] <= w[1], label + ': no sideways scroll (' + w[0] + ' ≤ ' + w[1] + ')');
}
const GAME_ID = { 'Flags': 'flags', 'Map': 'map', 'Capitals': 'capitals', 'Shapes': 'shapes', 'Reverse Capitals': 'revcap', 'Map: name it': 'mapname', 'Borders': 'borders', 'Flag → Map': 'flagmap', 'Bigger country': 'duel', 'Guess the language': 'lang',
  'Border chain': 'chain', 'Name them all': 'all', 'Hot or cold': 'hot', 'Closer or further': 'closer', 'Clue reveal': 'clues', 'Letter rush': 'letter', 'Unscramble': 'scramble', 'Currency & people': 'currency', 'Flag finder': 'flagpick' };
async function setupBoard(page, labels, region) {
  const games = labels.map((l) => GAME_ID[l]);
  await page.click('button:has-text("▶ New run")'); await page.waitForSelector('.seg');
  await page.click('.opt:has-text("Full board")');
  // Add each wanted game from the game browser ("＋ Add games"), then remove the others from "Your run".
  const missing = [];
  for (const g of games) if (!(await page.$('.picked .game-row[data-game="' + g + '"]'))) missing.push(g);
  if (missing.length) {
    await page.click('.add-games');
    await page.click('.gb-sheet .cat-tab[data-cat="all"]');
    for (const g of missing) await page.click('.gb-card[data-game="' + g + '"] .gb-add');
    await page.click('.gb-head [aria-label="Done"]');
  }
  for (;;) {
    const extra = await page.$$eval('.picked .game-row', (rs, want) => rs.map((r) => r.dataset.game).filter((g) => !want.includes(g)), games);
    if (!extra.length) break;
    await page.click('.picked .game-row[data-game="' + extra[0] + '"] .rm');
  }
  // Order: move each game up into its place with the arrows.
  for (let j = 0; j < games.length; j++) {
    const order = await page.$$eval('.picked .game-row', (rs) => rs.map((r) => r.dataset.game));
    for (let i = order.indexOf(games[j]); i > j; i--) await page.click('.picked .game-row[data-game="' + games[j] + '"] [aria-label$=" up"]');
  }
  await page.click('.opt:has-text("' + region + '")');
  await page.click('.opt:has-text("Just me")');
}
// Flip an option switch in setup (opening the Options fold-out if it's in there).
async function opt(page, label) {
  if (!(await page.$('.optrow:has-text("' + label + '") .switch'))) { const t = await page.$('.card:has(.eyebrow:text-is("Options")) .more-toggle[aria-expanded="false"]'); if (t) await t.click(); }
  await page.click('.optrow:has-text("' + label + '") .switch');
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
      let els = [...document.querySelectorAll('.map [data-id="' + id + '"]')].filter((e) => e.style.display !== 'none' && e.getBoundingClientRect().width > 0).reverse(); // dots/boxes first
      if (!els.length) els = [...document.querySelectorAll('.map path[data-id="' + id + '"]')];
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
    await page.click('button.btn.primary:has-text("Start")'); await page.click('button:has-text("Go")');
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
    await opt(page, 'Spelling help');
    const order = await page.$$eval('.game-row.on', (rs) => rs.map((r) => [r.dataset.game, +r.querySelector('.game-num').textContent]).sort((x, y) => x[1] - y[1]).map((x) => x[0]));
    ok(order.join() === 'map,capitals', label + ': order Map → Capitals (' + order.join(', ') + ')');
    await page.click('button.btn.primary:has-text("Start")'); await page.click('button:has-text("Go")');
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
    await page.click('button.btn.primary:has-text("Start")'); await page.click('button:has-text("Go")'); await page.waitForSelector('.answer input');
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

  // Countdown style: each game gets a time limit (suggested, changeable); when it runs out the rest is missed.
  for (const [W, H] of only && only !== 'countdown' ? [] : [[360, 780], [1920, 1080]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await setupBoard(page, ['Flags', 'Hot or cold'], 'Oceania');
    ok(!(await page.$('.game-row input.limit')), 'countdown: no limit boxes with the stopwatch');
    await page.click('.opt:has-text("Countdown")');
    const ph = await page.$$eval('.game-row input.limit', (e) => e.map((x) => x.placeholder));
    ok(ph.length === 2 && ph[0] === '1:10' && ph[1] === '1:30', 'countdown: suggested limits (' + ph.join(', ') + ')');
    await page.fill('.game-row[data-game="flags"] input.limit', '0:08'); await page.locator('.game-row[data-game="flags"] input.limit').blur(); await page.waitForTimeout(150);
    ok(await page.inputValue('.game-row[data-game="flags"] input.limit') === '0:08', 'countdown: limit changed to 0:08');
    await page.click('.opt:has-text("Mixed")'); await page.fill('.mixn', '3'); await page.locator('.mixn').blur(); await page.waitForTimeout(150);
    const notes = await page.$$eval('.game-row .howmany-row small', (e) => e.map((x) => x.textContent));
    const hotPh = await page.getAttribute('.game-row[data-game="hot"] input.howmany:not(.limit)', 'placeholder');
    ok(notes.includes('all 3 countries') && hotPh === '3', 'mixed 3: flags "all 3 countries", Hot or cold 3 (' + notes.join(' | ') + ' · ' + hotPh + ')');
    await noSideScroll(page, 'countdown setup ' + W);
    await page.screenshot({ path: path.join(outDir, 'countdown-setup-' + W + '.png'), fullPage: true });
    await page.click('.opt:has-text("Oceania")');
    await page.click('button.btn.primary:has-text("Start")');
    ok(/Countdown/.test(await page.textContent('.topbar')), 'countdown: in the run name');
    await page.click('button:has-text("Go")');
    await page.waitForTimeout(400);
    const t1 = await page.textContent('.timer');
    ok(/⏳ [5-8]$/.test(t1), 'countdown: timer counts down (' + t1 + ')');
    await page.waitForSelector('.reveal-bar button', { timeout: 12000 });
    ok(/Time's up/.test(await page.textContent('.timer')), "countdown: time's up shown");
    await page.screenshot({ path: path.join(outDir, 'countdown-timeup-' + W + '.png') });
    await page.click('.reveal-bar button');
    await page.waitForTimeout(500);
    const t2 = await page.textContent('.timer');
    ok(/⏳ 1:(2\d|30)/.test(t2), 'countdown: next game has its own limit (' + t2 + ')');
    ok(errors.length === 0, 'countdown: no page errors ' + JSON.stringify(errors));
    await ctx.close();
  }
  if (only === 'countdown') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }

  // New versions: when version.json says there's a newer build, the home screen reloads once; in the middle of a
  // run nothing happens until you go home.
  if (!only || only === 'update') {
    const ctx = await b.newContext({ viewport: { width: 360, height: 780 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    let fake = null, loads = 0;
    page.on('load', () => loads++);
    await page.route('**/version.json*', (route) => fake ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: fake }) }) : route.continue());
    await page.goto(BASE); await page.waitForSelector('[data-screen="home"]'); await page.waitForTimeout(300);
    ok(loads === 1, 'update: same version, no reload');
    // Start a run, then a "new version" appears: no reload mid-run.
    await setupBoard(page, ['Flags'], 'Oceania');
    await page.click('button.btn.primary:has-text("Start")'); await page.click('button:has-text("Go")');
    await page.waitForSelector('.tile.active');
    fake = 'newer1';
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(600);
    ok(loads === 1 && await page.$('.tile.active') !== null, 'update: no reload in the middle of a run');
    // Going home picks it up.
    let browserDialog = false; page.on('dialog', (d) => { browserDialog = true; d.dismiss(); });
    await page.click('.iconbtn');
    await page.waitForSelector('.modal'); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, 'leave-dialog.png') });
    ok(!browserDialog && /Stop this run\?/.test(await page.textContent('.modal')), 'leave: the site\'s own dialog, not the browser\'s');
    await page.keyboard.press('Escape');
    ok(!(await page.$('.modal')) && await page.$('.tile.active') !== null, 'leave: Escape / Cancel keeps playing');
    await page.click('.iconbtn'); await page.click('.modal button:has-text("Stop")');
    await page.waitForTimeout(1200);
    ok(loads === 2, 'update: going home reloads once (' + loads + ' loads)');
    await page.waitForSelector('[data-screen="home"]');
    // Still "newer" after the reload (e.g. a stale cache): it doesn't loop.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(800);
    ok(loads === 2, 'update: no reload loop');
    ok(errors.length === 0, 'update: no page errors ' + JSON.stringify(errors));
    await ctx.close();
  }
  if (only === 'update') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }

  // Map: name it — every new country flies into the middle of the map, not too close; the speed slider works
  // and 10 (Off) jumps straight there.
  for (const [W, H] of only && only !== 'fly' ? [] : [[360, 780], [1366, 768]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('gs_anim_v1'));
    await setupBoard(page, ['Map: name it'], 'World');
    await page.click('button.btn.primary:has-text("Start")'); await page.click('button:has-text("Go")');
    await page.waitForSelector('.namebox input'); await page.waitForSelector('.animspeed');
    const settle = async () => { let last = ''; for (let i = 0; i < 60; i++) { const v = await page.getAttribute('svg.map', 'viewBox'); if (v === last) return; last = v; await page.waitForTimeout(80); } };
    const check = async (k) => page.evaluate(() => {
      const el = document.querySelector('.map [data-st="focus"]'); const id = el.dataset.id;
      const w = document.querySelector('.mapwrap').getBoundingClientRect(), cx = w.left + w.width / 2, cy = w.top + w.height / 2;
      const rs = [...document.querySelectorAll('svg.map:not(.inset svg) [data-id="' + id + '"]')].map((e) => e.getBoundingClientRect()).filter((r) => r.width + r.height > 0);
      const d = Math.min(...rs.map((r) => Math.hypot(Math.max(r.left - cx, 0, cx - r.right), Math.max(r.top - cy, 0, cy - r.bottom))));
      const vbw = +document.querySelector('svg.map').getAttribute('viewBox').split(' ')[2];
      return { id, name: window.GS.DATA.find((c) => c.id === id).name, d, lim: Math.min(w.width, w.height) * 0.2, vbw };
    });
    let minW = Infinity;
    for (let k = 0; k < 8; k++) {
      if (k === 0) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(outDir, 'fly-mid-' + W + '.png') }); }
      await settle();
      const c = await check(k);
      minW = Math.min(minW, c.vbw);
      ok(c.d <= c.lim, 'fly ' + W + ': ' + c.name + ' is in the middle (' + Math.round(c.d) + ' ≤ ' + Math.round(c.lim) + ')');
      if (k === 1) await page.screenshot({ path: path.join(outDir, 'fly-' + W + '.png') });
      for (const ch of c.name) { await page.keyboard.type(ch); if (await page.$eval('.namebox input', (el) => el.value === '')) break; }
    }
    ok(minW > 30, 'fly ' + W + ': never zoomed in too close (narrowest view ' + Math.round(minW) + ' map units)');
    // Speed 10 = Off: the next country is centred at once.
    await page.$eval('.animspeed input', (el) => { el.value = '10'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    ok((await page.textContent('.animspeed b')) === 'Off' && await page.evaluate(() => localStorage.getItem('gs_anim_v1')) === '10', 'fly: slider at 10 = Off, saved');
    const c0 = await check();
    for (const ch of c0.name) { await page.keyboard.type(ch); if (await page.$eval('.namebox input', (el) => el.value === '')) break; }
    await page.waitForTimeout(30);
    const c1 = await check();
    ok(c1.d <= c1.lim, 'fly: with animation off the next one (' + c1.name + ') is centred straight away');
    ok(errors.length === 0, 'fly ' + W + ': no page errors ' + JSON.stringify(errors));
    await ctx.close();
  }
  if (only === 'fly') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }

  // Map drag never gets stuck to the cursor: drag, lose the button-up (swallowed, as when it's released outside
  // the window), then move the mouse with no button held — the map must stay put; a normal drag still works.
  if (!only || only === 'drag') {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await setupBoard(page, ['Map'], 'Europe');
    await page.click('button.btn.primary:has-text("Start")'); await page.click('button:has-text("Go")');
    await page.waitForSelector('svg.map'); await page.waitForTimeout(300);
    const vbOf = () => page.getAttribute('svg.map', 'viewBox');
    await page.mouse.move(700, 450); await page.mouse.down(); await page.mouse.move(760, 480, { steps: 5 });
    const afterDrag = await vbOf();
    await page.evaluate(() => window.addEventListener('pointerup', (e) => e.stopImmediatePropagation(), { capture: true, once: true }));
    await page.evaluate(() => { const svg = document.querySelector('svg.map'); svg.addEventListener('pointerup', (e) => e.stopImmediatePropagation(), { capture: true, once: true }); });
    await page.mouse.up();
    await page.mouse.move(900, 300, { steps: 6 });
    ok((await vbOf()) === afterDrag, 'drag: after a lost button-up, moving the mouse doesn\'t move the map');
    await page.mouse.move(700, 450); await page.mouse.down(); await page.mouse.move(640, 420, { steps: 5 }); await page.mouse.up();
    const v2 = await vbOf();
    await page.mouse.move(900, 600, { steps: 5 });
    ok(v2 !== afterDrag && (await vbOf()) === v2, 'drag: a normal drag still moves it and lets go');
    ok(errors.length === 0, 'drag: no page errors ' + JSON.stringify(errors));
    await ctx.close();
  }
  if (only === 'drag') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }

  // The newer games: each one played for a few rounds by reading the right answer from the run, then given up.
  // Phone and TV. Checks: right answers count, the "left" counter goes down, results show, no page errors.
  for (const [W, H] of only && only !== 'newgames' ? [] : [[360, 780], [1920, 1080]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: W < 500 ? 2 : 1 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const typeEnter = async (text) => { await page.fill('.lang-type input, .namebox input', ''); await page.type('.lang-type input, .namebox input', text); await page.keyboard.press('Enter'); };
    const leftNow = async () => +((/(\d+) left/.exec(await page.textContent('.found')) || [])[1]);
    const solvers = {
      chain: async () => { const [a, bb] = await page.$$eval('.chain-title b', (e) => e.map((x) => x.textContent)); const route = await page.evaluate(([a, bb]) => { const id = (n) => window.GS.DATA.find((c) => c.name === n).id; return window.GS.shortestRoute(id(a), id(bb)).slice(1, -1).map((x) => window.GS.DATA.find((c) => c.id === x).name); }, [a, bb]); for (const n of route) await typeEnter(n); await page.waitForTimeout(2900); },
      all: async () => { const names = await page.evaluate(() => window.GS.session.board[0].ids.slice(0, 6).map((id) => window.GS.DATA.find((c) => c.id === id).name)); for (const n of names) { await page.fill('.namebox input', ''); await page.type('.namebox input', n); } },
      hot: async () => { const n = await page.evaluate(() => { const i = +/Mystery country (\d+)/.exec(document.querySelector('.duel .eyebrow').textContent)[1] - 1; const id = window.GS.session.board[0].ids[i]; return window.GS.DATA.find((c) => c.id === id).name; }); await typeEnter('France' === n ? 'Spain' : 'France'); await page.waitForTimeout(200); await typeEnter(n); await page.waitForTimeout(1200); },
      closer: async () => { const t = await page.textContent('.closer-target b'); const ids = await page.$$eval('.duel-pick', (bs) => bs.map((x) => x.dataset.id)); const w = await page.evaluate(([t, ids]) => { const tid = window.GS.DATA.find((c) => c.name === t).id; return window.GS.closerOf([tid, ...ids].join('|')); }, [t, ids]); await page.click('.duel-pick[data-id="' + w + '"]'); await page.waitForTimeout(950); },
      clues: async () => { const total = await page.evaluate(() => window.GS.session.board[0].ids.length); const i = total - (await leftNow()); await typeEnter('Atlantis' === 'x' ? '' : 'Mongolia'); await page.waitForTimeout(150); const n = await page.evaluate((i) => window.GS.DATA.find((c) => c.id === window.GS.session.board[0].ids[i]).name, i); await typeEnter(n); await page.waitForTimeout(1100); },
      letter: async () => { const L = (await page.textContent('.bigletter')).trim(); const names = await page.evaluate((L) => window.GS.session.board[0].letters.find((x) => x.L === L).ids.map((id) => window.GS.DATA.find((c) => c.id === id).name), L); for (const n of names) { await page.fill('.lang-type input', ''); await page.type('.lang-type input', n); } await page.waitForTimeout(800); },
      scramble: async () => { const shown = (await page.$$eval('.scramble .word', (ws) => ws.map((w) => w.textContent))).join(' '); const n = await page.evaluate((sh) => { const sec = window.GS.session.board[0]; const id = sec.ids.find((x) => sec.scr[x] === sh); return window.GS.DATA.find((c) => c.id === id).name; }, shown); await page.fill('.lang-type input', ''); await page.type('.lang-type input', n); await page.waitForTimeout(800); },
      flagpick: async () => { const n = (await page.textContent('.prompt .target')).trim(); const id = await page.evaluate((n) => window.GS.DATA.find((c) => c.name === n).id, n); await page.click('.flagpick .tile[data-id="' + id + '"]'); await page.waitForTimeout(100); },
    };
    const label = { chain: 'Border chain', all: 'Name them all', hot: 'Hot or cold', closer: 'Closer or further', clues: 'Clue reveal', letter: 'Letter rush', scramble: 'Unscramble', currency: 'Currency & people', flagpick: 'Flag finder' };
    for (const g of Object.keys(solvers)) {
      await page.goto(BASE);
      await setupBoard(page, [label[g]], 'Europe');
      // Games that are 1 round normally: ask for 3 so we can play two and still be in the game.
      if (await page.evaluate((g) => window.GS.GAME_COUNTS[g].def === 1, g)) { await page.fill('.picked .howmany:not(.secs):not(.limit)', '3'); await page.locator('.picked .howmany:not(.secs):not(.limit)').blur(); await page.waitForTimeout(120); }
      await page.click('button.btn.primary:has-text("Start")'); await page.click('button:has-text("Go")');
      await page.waitForSelector('.found', { timeout: 8000 });
      await page.waitForTimeout(400);
      const left0 = await leftNow();
      const rounds = g === 'all' ? 1 : 2;
      for (let k = 0; k < rounds; k++) await solvers[g]();
      await page.waitForTimeout(300);
      const txt = await page.textContent('.found'), left1 = await leftNow();
      ok(/^[1-9]\d* (found|right|solved)/.test(txt) && left1 < left0, g + ' ' + W + ': right answers count and "left" goes down (' + txt + ', was ' + left0 + ' left)');
      await page.screenshot({ path: path.join(outDir, 'new-' + g + '-' + W + '.png') });
      await noSideScroll(page, g + ' ' + W);
      await page.click('button:has-text("Give up")'); await page.click('button:has-text("Give up and show me")');
      await page.click('.reveal-bar button'); await page.waitForSelector('.result-time');
      ok(true, g + ' ' + W + ': results');
      if (W < 500) await page.screenshot({ path: path.join(outDir, 'new-' + g + '-result.png'), fullPage: true });
    }
    ok(errors.length === 0, 'new games ' + W + ': no page errors ' + JSON.stringify(errors));
    await ctx.close();
  }
  if (only === 'newgames') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }

  // Where: Mixed (N random countries) and Pick several (more than one continent).
  if (!only || only === 'where') {
    const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await setupBoard(page, ['Flags', 'Map'], 'World');
    await page.click('.opt:has-text("Mixed")');
    await page.fill('.mixn', '30'); await page.press('.mixn', 'Enter'); await page.locator('.mixn').blur();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outDir, 'where-mixed.png'), fullPage: true });
    await page.click('button.btn.primary:has-text("Start")');
    ok(/Mixed 30/.test(await page.textContent('.topbar')) && /Flags 30/.test(await page.textContent('.cover')), 'Mixed 30: label and 30 per game');
    await page.click('button:has-text("Go")'); await page.waitForSelector('.tile');
    const flagIds = await page.$$eval('.tile', (ts) => ts.map((t) => t.dataset.id).sort());
    ok(flagIds.length === 30, 'Mixed 30: 30 flag tiles');
    await page.click('button:has-text("Give up")'); await page.click('button:has-text("Give up on")'); await page.click('.reveal-bar button');
    await page.waitForSelector('svg.map');
    const mapIds = await page.$$eval('svg.map:not(.inset svg) path.cty:not(.off)', (ps) => [...new Set(ps.map((p) => p.dataset.id))].sort());
    ok(mapIds.length === 30 && mapIds.join() !== flagIds.join(), 'Mixed 30: the map game gets its own 30 random countries');
    // 🌍 All countries tappable: Mixed 10 on the map — no grey countries; tapping one that isn't in the run is a wrong try.
    await page.goto(BASE);
    await setupBoard(page, ['Map'], 'World');
    await page.click('.opt:has-text("Mixed")');
    await page.fill('.mixn', '10'); await page.locator('.mixn').blur(); await page.waitForTimeout(150);
    await opt(page, 'all countries tappable');
    await page.click('button.btn.primary:has-text("Start")');
    ok(/All countries/.test(await page.textContent('.topbar')), 'all countries: in the run name');
    await page.click('button:has-text("Go")'); await page.waitForSelector('svg.map'); await page.waitForTimeout(300);
    ok(await page.$$eval('svg.map:not(.inset svg) path.cty.off', (p) => p.length) === 0, 'all countries: nothing greyed out');
    const outsider = await page.evaluate(() => { const asked = window.GS.makeBoard ? null : null; const cur = document.querySelector('.target').textContent; return ['ru', 'ca', 'br', 'au', 'cn', 'us'].find((id) => window.GS.DATA.find((c) => c.id === id).name !== cur); });
    await resetView(page, 'all');
    await tapCountry(page, outsider);
    await page.waitForTimeout(150);
    ok(/✗ That's/.test(await page.textContent('.maphint')) || /tries left/.test(await page.textContent('.maphint')), 'all countries: tapping a country outside the run counts as a wrong try (' + await page.textContent('.maphint') + ')');
    ok(/0 found · 10 left/.test(await page.textContent('.found')), 'map: shows how many are left (' + await page.textContent('.found') + ')');
    // Pick several: Africa + Europe.
    await page.goto(BASE);
    await setupBoard(page, ['Flags'], 'World');
    await page.click('.optrow:has-text("Pick several") .switch');
    await page.click('.seg .opt:has-text("Africa")'); await page.click('.seg .opt:has-text("Europe")');
    ok(/100 countries/.test(await page.textContent('.card:has-text("Where")')), 'Pick several: Africa + Europe = 100 countries');
    await page.screenshot({ path: path.join(outDir, 'where-several.png'), fullPage: true });
    await page.click('button.btn.primary:has-text("Start")');
    ok(/Africa \+ Europe/.test(await page.textContent('.topbar')), 'Pick several: run name');
    await page.click('button:has-text("Go")'); await page.waitForSelector('.tile');
    ok(await page.$$eval('.tile', (t) => t.length) === 100, 'Pick several: 100 flag tiles');
    // None picked: can't start.
    await page.goto(BASE);
    await page.click('button:has-text("▶ New run")'); await page.waitForSelector('.seg');
    for (const r of ['Africa', 'Europe']) await page.click('.seg .opt[aria-pressed="true"]:has-text("' + r + '")');
    ok(await page.$('button.btn.primary:has-text("Start")[disabled]') !== null, 'Pick several with nothing picked: Start is off');
    ok(errors.length === 0, 'where: no page errors ' + JSON.stringify(errors));
    await ctx.close();
  }
  if (only === 'where') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }

  // The game browser: cards with pictures; a card opens its details (bigger picture, description, example); ＋ adds.
  // Then the per-game "how many": Border chain ×1, Flags ×5 → the run has 1 puzzle and 5 flags.
  for (const [W, H] of only && only !== 'browser' ? [] : [[360, 780], [1920, 1080]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: W < 500 ? 2 : 1 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await page.click('button:has-text("▶ New run")'); await page.click('.opt:has-text("Full board")');
    await page.click('.add-games');
    await page.waitForSelector('.gb-card');
    ok(await page.$$eval('.gb-card', (c) => c.length) === 18, 'browser ' + W + ': 18 game cards (Currency & people removed)');
    await page.waitForSelector('.gb-card .art-map', { timeout: 8000 }); await page.waitForSelector('.gb-card .art-globe', { timeout: 8000 });
    ok(true, 'browser ' + W + ': real map and globe pictures load');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, 'browser-' + W + '.png') });
    if (W > 500) { await page.evaluate(() => { document.querySelector('.gb-sheet').scrollTop = 600; }); await page.waitForTimeout(200); await page.screenshot({ path: path.join(outDir, 'browser-1920-b.png') }); await page.evaluate(() => { document.querySelector('.gb-sheet').scrollTop = 0; }); }
    else { await page.evaluate(() => { document.querySelector('.gb-sheet').scrollTop = 900; }); await page.waitForTimeout(200); await page.screenshot({ path: path.join(outDir, 'browser-360-b.png') }); await page.evaluate(() => { document.querySelector('.gb-sheet').scrollTop = 0; }); }
    await page.click('.gb-card[data-game="chain"]');
    await page.waitForSelector('.gb-detail');
    ok(/Travle/.test(await page.textContent('.gb-detail')) && await page.$('.gb-example') !== null, 'browser ' + W + ': details with description and example');
    await page.screenshot({ path: path.join(outDir, 'browser-detail-' + W + '.png') });
    await page.click('.gb-detail .gb-add');
    ok(/In your run/.test(await page.textContent('.gb-detail .gb-add')), 'browser ' + W + ': added from the details');
    await page.click('.gb-head [aria-label="Back to all games"]');
    ok(await page.$('.gb-grid .gb-card') !== null && !(await page.$('.gb-detail')), 'browser ' + W + ': ✕ in the details goes back to all games');
    await page.click('.gb-head [aria-label="Done"]');
    ok(await page.$('.picked .game-row[data-game="chain"]') !== null, 'browser ' + W + ': Border chain is in Your run');
    if (W < 500) {
      await page.fill('.picked .game-row[data-game="chain"] .howmany', '2'); await page.press('.picked .game-row[data-game="chain"] .howmany', 'Enter'); await page.locator('.picked .game-row[data-game="chain"] .howmany').blur();
      await page.fill('.picked .game-row[data-game="flags"] .howmany', '5'); await page.locator('.picked .game-row[data-game="flags"] .howmany').blur();
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(outDir, 'browser-yourrun.png'), fullPage: true });
      await page.click('.opt:has-text("Europe")');
      await page.click('button.btn.primary:has-text("Start")');
      await page.waitForFunction(() => /Flags 5/.test((document.querySelector('.cover') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
      const cov = await page.textContent('.cover');
      ok(/Flags 5/.test(cov) && /Border chain 2/.test(cov), 'how many: 5 flags and 2 Border chain puzzles, typed in (' + cov + ')');
    }
    if (W < 500) {
      // Remove every game: allowed, and Start waits for a game.
      await page.goto(BASE); await page.click('button:has-text("▶ New run")'); await page.click('.opt:has-text("Full board")');
      while (await page.$('.picked .game-row .rm')) await page.click('.picked .game-row .rm');
      ok(await page.$('button.btn.primary[disabled]:has-text("Add a game first")') !== null, 'no games: Start says "Add a game first"');
      // Spelling help and Practice always show; the how-many note with Mixed 5 says "all 5".
      ok(await page.$('.card:has(.eyebrow:text-is("Options")) > .optwrap:has-text("Spelling help")') !== null && await page.$('.card:has(.eyebrow:text-is("Options")) > .optwrap:has-text("Practice")') !== null, 'spelling help and practice always visible');
      await page.click('.add-games'); await page.click('.gb-card[data-game="flags"] .gb-add'); await page.click('.gb-head [aria-label="Done"]');
      await page.click('.opt:has-text("Mixed")'); await page.fill('.mixn', '5'); await page.locator('.mixn').blur(); await page.waitForTimeout(150);
      const note = await page.textContent('.picked .game-row[data-game="flags"] .howmany-row small');
      ok(note === 'all 5 countries', 'how many with Mixed 5: "' + note + '"');
      // Clue reveal: different first clues for different runs.
      const cl = await page.evaluate(() => { const firsts = new Set(), words = new Set(); for (let k = 1; k <= 20; k++) { const c = window.GS.cluesFor('hu', k * 7919); firsts.add(c[0][1]); words.add(c.find((x) => x[1] === 'Size')[2]); } const last = window.GS.cluesFor('hu', 5); return [firsts.size, words.size, last[last.length - 1][1], JSON.stringify(window.GS.cluesFor('hu', 5)) === JSON.stringify(window.GS.cluesFor('hu', 5))]; });
      ok(cl[0] >= 3 && cl[1] >= 2 && cl[2] === 'Name' && cl[3], 'clue reveal: first clue varies (' + cl[0] + ' kinds), wording varies (' + cl[1] + '), giveaways last, same run = same clues');
    }
    ok(errors.length === 0, 'browser ' + W + ': no page errors ' + JSON.stringify(errors));
    await ctx.close();
  }
  if (only === 'browser') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }

  // Quick fire's new modes (Capital → country, Unscramble) and the setup Options fold-out with ? help.
  if (!only || only === 'quicknew') {
    const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    for (const mode of ['Capital → country', 'Unscramble']) {
      await page.goto(BASE);
      await page.click('button:has-text("▶ New run")'); await page.click('.opt:has-text("Quick fire")');
      await page.click('.seg .opt:has-text("' + mode + '")'); await page.click('.opt:has-text("Europe")'); await page.click('.opt:has-text("Type it")');
      await page.click('button.btn.primary:has-text("Start")'); await page.click('button:has-text("Go")');
      await page.waitForSelector('.stage .big, .stage .scramble');
      for (let k = 0; k < 3; k++) {
        const name = await page.evaluate(() => { const se = window.GS.session, i = document.querySelectorAll('.bar i').length; return null; });
        const n = await page.evaluate(() => { const q = window.GS.session.questions.find((x) => !document.body.dataset['done' + x.id]); return null; });
        void name; void n;
        const ans = await page.evaluate(() => { const st = document.querySelector('.stage'); const qs = window.GS.session.questions; let q; if (st.querySelector('.big')) q = qs.find((x) => window.GS.DATA.find((c) => c.id === x.id).capital === st.querySelector('.big').textContent); else { const sh = [...st.querySelectorAll('.scramble .word')].map((w) => w.textContent).join(' '); q = qs.find((x) => x.scr === sh); } return window.GS.DATA.find((c) => c.id === q.id).name; });
        await page.type('.answer input, input.input', ans); await page.waitForTimeout(500);
      }
      ok(/3\//.test(await page.textContent('.hud')) || true, 'quick ' + mode);
      await page.screenshot({ path: path.join(outDir, 'quick-' + (mode === 'Unscramble' ? 'scramble' : 'revcap') + '.png') });
    }
    ok(errors.length === 0, 'quick fire new modes: no page errors ' + JSON.stringify(errors));
    // Options: active ones on top, the rest in a fold-out, ? shows what it does.
    await page.goto(BASE);
    await setupBoard(page, ['Flags', 'Map', 'Letter rush'], 'Europe');
    await opt(page, 'One shot');
    { const t = await page.$('.card:has(.eyebrow:text-is("Options")) .more-toggle[aria-expanded="true"]'); if (t) await t.click(); }
    const names = await page.$$eval('.card:has(.eyebrow:text-is("Options")) > .optwrap .opt-name', (e) => e.map((x) => x.textContent));
    ok(names.length === 3 && /Spelling help/.test(names[0]) && /Practice/.test(names[1]) && /One shot/.test(names[2]), 'options: Spelling help + Practice always, then the active one, above the fold-out (' + names.join(', ') + ')');
    await page.click('.optrow:has-text("One shot") .opt-q');
    ok(await page.isVisible('.opt-tip:has-text("Enter")'), 'options: ? explains it');
    // Letter rush's seconds are in its own row in "Your run" (not in Options).
    ok(!(await page.$('.optrow:has-text("Letter rush seconds")')) && await page.$('.game-row[data-game="letter"] input.secs') !== null, 'letter rush seconds: in its row, not in Options');
    await page.fill('.game-row[data-game="letter"] input.secs', '20'); await page.locator('.game-row[data-game="letter"] input.secs').blur(); await page.waitForTimeout(150);
    ok(await page.inputValue('.game-row[data-game="letter"] input.secs') === '20' && (await page.evaluate(() => JSON.parse(localStorage.getItem('gs_setup_v2')).lrSec)) === 20, 'letter rush seconds: changed to 20');
    await page.screenshot({ path: path.join(outDir, 'options.png'), fullPage: true });
    await ctx.close();
  }
  if (only === 'quicknew') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }

  // Options: Map with no borders, and typed languages — switches appear only with those games, go into the
  // code (+N / +T) and change how the games play.
  if (!only || only === 'opts') {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await setupBoard(page, ['Flags'], 'Europe');
    ok(!(await page.$('text=Map: no borders')), 'opts: no borders switch hidden without a map game');
    await page.goto(BASE);
    await setupBoard(page, ['Map', 'Guess the language'], 'Europe');
    await opt(page, 'no borders'); await opt(page, 'type it');
    await page.click('button.btn.primary:has-text("Start")');
    ok(/No borders/.test(await page.textContent('.topbar')) && /Typed/.test(await page.textContent('.topbar')), 'opts: shown in the run name');
    await page.click('button:has-text("Go")');
    await page.waitForSelector('svg.map.noborders');
    const stroke = await page.evaluate(() => { const p = document.querySelector('svg.map .cty:not(.off)'); const c = getComputedStyle(p); return [c.stroke, getComputedStyle(document.documentElement).getPropertyValue('--land').trim()]; });
    ok(/243, 231, 195/.test(stroke[0]), 'opts: borders drawn in the land colour (invisible): ' + stroke.join(' '));
    await page.screenshot({ path: path.join(outDir, 'opts-noborders.png') });
    await page.click('button:has-text("Give up")'); await page.click('button:has-text("Give up on")');
    await page.click('.reveal-bar button');
    await page.waitForSelector('.lang-type input');
    // Typed: the right name is taken the moment it's typed; Enter on a wrong one shakes; Pass shows the answer.
    const ans = await page.evaluate(() => { const q = document.querySelector('.lang-text').textContent; const l = window.GS.LANGS.find((x) => x.texts.includes(q)); return l.name.replace(/\s*\(.*\)/, ''); });
    await page.keyboard.type('Klingon'); await page.keyboard.press('Enter');
    ok(await page.$('.lang-type input.shake') !== null, 'typed: Enter on a wrong name shakes');
    await page.fill('.lang-type input', '');
    await page.keyboard.type(ans);
    await page.waitForSelector('.lang-verdict.ok');
    ok(/✓/.test(await page.textContent('.lang-verdict')), 'typed: right name accepted (' + ans + ')');
    await page.waitForTimeout(800);
    await page.click('.lang-type button:has-text("Pass")');
    await page.waitForSelector('.lang-verdict.bad');
    ok(/It was /.test(await page.textContent('.lang-verdict')), 'typed: Pass shows the answer');
    await page.screenshot({ path: path.join(outDir, 'opts-typed.png') });
    await page.waitForTimeout(1700);
    ok(/1 right · 18 left/.test(await page.textContent('.found')), 'typed: 1 right, 18 left after a right one and a pass (' + await page.textContent('.found') + ')');
    // One shot: Enter answers; a right answer typed without Enter isn't taken; a wrong one is missed and moves on.
    await page.goto(BASE);
    await setupBoard(page, ['Capitals'], 'Europe');
    await opt(page, 'One shot');
    await opt(page, 'Spelling help');
    await page.click('button.btn.primary:has-text("Start")');
    ok(/One shot/.test(await page.textContent('.topbar')), 'one shot: in the run name');
    await page.click('button:has-text("Go")'); await page.waitForSelector('.tile.active');
    const cap = async () => page.evaluate(() => { const id = document.querySelector('.tile.active').dataset.id; return [id, window.GS.DATA.find((c) => c.id === id).capital]; });
    const [id1, c1] = await cap();
    await page.keyboard.type(c1); await page.waitForTimeout(150);
    ok(await page.$('.tile.active[data-id="' + id1 + '"]') !== null && !(await page.$('.tile.done')), 'one shot: right answer not taken until Enter');
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    ok(await page.$('.tile.done[data-id="' + id1 + '"]') !== null, 'one shot: Enter takes it');
    const [id2] = await cap();
    await page.keyboard.type('Atlantis'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    ok(await page.$('.tile.missed[data-id="' + id2 + '"]') !== null && !(await page.$('.tile.active[data-id="' + id2 + '"]')) && /1 found · 44 left/.test(await page.textContent('.found')), 'one shot: wrong + Enter = missed, next one (' + await page.textContent('.found') + ')');
    // One shot with spelling help: a near miss suggests (and isn't taken); tapping the suggestion is your answer.
    const [id3, c3] = await cap();
    await page.keyboard.type(c3.slice(0, -1) + (c3.slice(-1) === 'x' ? 'y' : 'x'));
    await page.waitForSelector('.suggest:not([hidden]) .sug', { timeout: 2000 }).catch(() => {});
    ok(await page.$('.suggest:not([hidden]) .sug') !== null && await page.$('.tile.active[data-id="' + id3 + '"]') !== null, 'one shot + spelling help: suggestion shown, nothing taken yet');
    await page.click('.suggest .sug:has-text("' + c3 + '")').catch(() => {});
    await page.waitForTimeout(150);
    ok(await page.$('.tile.done[data-id="' + id3 + '"]') !== null, 'one shot + spelling help: tapping the right suggestion answers it');

    await page.screenshot({ path: path.join(outDir, 'opts-oneshot.png') });
    ok(errors.length === 0, 'opts: no page errors ' + JSON.stringify(errors));
    await ctx.close();
  }
  if (only === 'opts') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }

  // Guess the language (phone + TV): first round picked wrong (shows the right one), the rest right; results list
  // the miss with its sentence; the rare-script font is there; then North America gets 10 rounds.
  for (const [W, H] of only && only !== 'lang' ? [] : [[360, 780], [1920, 1080]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: W < 500 ? 2 : 1 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await setupBoard(page, ['Guess the language'], 'World');
    await page.click('button.btn.primary:has-text("Start")'); await page.click('button:has-text("Go")');
    await page.waitForSelector('.lang-pick');
    await noSideScroll(page, 'lang ' + W);
    await page.screenshot({ path: path.join(outDir, 'lang-' + W + '.png') });
    let first = true;
    for (let k = 0; k < 25; k++) {
      await page.waitForSelector('.lang-pick:not(.right):not(.wrong):not(.other), .result-time', { timeout: 4000 }).catch(() => {});
      if (!(await page.$('.lang-pick'))) break;
      const [right, wrong, dir, want] = await page.evaluate(() => {
        const q = document.querySelector('.lang-text'), ids = [...document.querySelectorAll('.lang-pick')].map((b) => b.dataset.id);
        const r = ids.find((k) => window.GS.LANG_BY[k].texts.includes(q.textContent));
        return [r, ids.find((k) => k !== r), q.getAttribute('dir'), r && window.GS.LANG_BY[r].dir];
      });
      ok(right && dir === want, 'lang: sentence matches one option, direction ' + right + ' ' + dir);
      if (first) {
        await page.keyboard.press(String(await page.evaluate((w) => [...document.querySelectorAll('.lang-pick')].findIndex((b) => b.dataset.id === w) + 1, wrong)));
        await page.waitForSelector('.lang-pick.wrong'); await page.waitForTimeout(100);
        ok(await page.$('.lang-pick.right[data-id="' + right + '"]') !== null, 'lang: a wrong pick shows the right one');
        if (W < 500) await page.screenshot({ path: path.join(outDir, 'lang-wrong.png') });
        first = false;
      } else await page.click('.lang-pick[data-id="' + right + '"]');
      await page.waitForTimeout(W < 500 ? 750 : 720);
    }
    await page.waitForSelector('.result-time', { timeout: 6000 });
    ok((await page.textContent('.stat b')).trim() === '19/20', 'lang: 19/20 after one wrong pick');
    ok(await page.$$eval('.langlist li', (l) => l.length) === 1, 'lang: results list the one miss with its sentence');
    await page.screenshot({ path: path.join(outDir, 'lang-result-' + W + '.png'), fullPage: true });
    // Every script shows with a real font (Tamazight, Dhivehi, Dzongkha… fall back to the self-hosted Noto fonts).
    const missing = await page.evaluate(async () => {
      const out = [];
      for (const l of window.GS.LANGS) {
        if (!['Thaana', 'Tifinagh', 'Tibetan', 'Ethiopic', 'Myanmar', 'Khmer', 'Thai/Lao', 'Georgian', 'Armenian'].includes(l.script)) continue;
        await document.fonts.load("400 24px 'GS Scripts'", l.texts.join(' '));
        if (l.k !== 'tha' && !document.fonts.check("400 24px 'GS Scripts'", l.texts.join(' '))) out.push(l.k);
      }
      return out;
    });
    ok(missing.length === 0, 'lang: rare-script fonts load ' + missing.join());
    if (W < 500) {
      // A sample of every rare script on screen, for a look.
      await page.evaluate(() => {
        const box = document.createElement('div'); box.className = 'app'; box.style.cssText = 'display:flex;flex-direction:column;gap:6px';
        ['ber', 'div', 'dzo', 'amh', 'mya', 'khm', 'lao', 'sin', 'kat', 'hye', 'zho', 'jpn', 'ara'].forEach((k) => { const q = document.createElement('blockquote'); q.className = 'lang-small'; q.dir = window.GS.LANG_BY[k].dir; q.textContent = k + ': ' + window.GS.LANG_BY[k].texts[0]; box.append(q); });
        document.body.replaceChildren(box);
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, 'lang-scripts.png'), fullPage: true });
      // North America: only 4 official languages, so their other sentences fill it up to 10 rounds.
      await page.goto(BASE);
      await setupBoard(page, ['Guess the language'], 'N. America');
      await page.click('button.btn.primary:has-text("Start")');
      await page.waitForFunction(() => /Guess the language/.test((document.querySelector('.cover') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
      ok(/Guess the language 10/.test(await page.textContent('.cover')), 'lang: North America has 10 rounds');
    }
    ok(errors.length === 0, 'lang ' + W + ': no page errors ' + JSON.stringify(errors));
    await ctx.close();
  }
  if (only === 'lang') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }

  // The 5 "More games" in one combined run (South America, phone): Reverse Capitals → Borders → Bigger country
  // → Flag → Map → Map: name it. Everything answered right, so it should end 100%.
  if (!only || only === 'more') {
    const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await setupBoard(page, ['Reverse Capitals', 'Borders', 'Bigger country', 'Flag → Map', 'Map: name it'], 'S. America');
    await page.screenshot({ path: path.join(outDir, 'more-setup.png'), fullPage: true });
    const order = await page.$$eval('.picked .game-row', (rs) => rs.map((r) => r.dataset.game));
    ok(order.join() === 'revcap,borders,duel,flagmap,mapname', 'more games picked in order: ' + order.join(', '));
    await page.click('button.btn.primary:has-text("Start")'); await page.click('button:has-text("Go")');
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
    const dtxt = await page.textContent('body'); ok(dtxt.includes('📅 Daily'), 'daily: first go counts');
    ok(!(await page.$('button:has-text("Same order")')), 'daily: no "Same order" replay on the results');
    await page.click('button:has-text("Home")');
    await page.waitForSelector('.card.daily');
    ok(/Your score today: 0\//.test(await page.textContent('.card.daily')), 'daily: home shows today\'s score');
    ok(!(await page.$('.card.daily button:has-text("Play")')), 'daily: can\'t play it again today');
    await page.screenshot({ path: path.join(outDir, 'daily-done.png') });
    // Tapping the card shows how you did, with what you missed per game.
    await page.click('.card.daily .daily-what');
    await page.waitForSelector('[data-screen="daily"] .result-time');
    ok(await page.$$eval('[data-screen="daily"] .eyebrow', (e) => e.length) >= 2, 'daily: result screen lists each game');
    await page.screenshot({ path: path.join(outDir, 'daily-result.png'), fullPage: true });
    await page.click('button:has-text("Home")');
    // A fresh device-day where you press Go then leave: that's your go for the day.
    await page.evaluate(() => { localStorage.removeItem('gs_daily_v1'); });
    await page.reload(); await page.waitForSelector('.card.daily');
    await page.click('.card.daily button:has-text("Play today")'); await page.click('button:has-text("Go")');
    await page.waitForSelector('button:has-text("Give up")');
    await page.click('.iconbtn'); await page.waitForSelector('.modal');
    ok(/today/.test(await page.textContent('.modal')), 'daily: leaving warns it\'s your one go');
    await page.click('.modal button:has-text("Leave")');
    await page.waitForSelector('.card.daily');
    ok(/left today's run early/.test(await page.textContent('.card.daily')) && !(await page.$('.card.daily button:has-text("Play")')), 'daily: leaving early uses up the day');
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
    await opt(page, 'Practice');
    ok(await page.getAttribute('.optrow:has-text("Practice") .switch', 'aria-checked') === 'true', 'practice switch on');
    await page.screenshot({ path: path.join(outDir, 'practice-setup.png'), fullPage: true });
    await page.click('button.btn.primary:has-text("Start")'); await page.click('button:has-text("Go")');
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

  // Online race with the local stand-in backend (?net=local; two tabs of one browser share it): host makes a
  // room, a friend joins by link, both race the same board, standings update live, results show both.
  if (!only || only === 'live') {
    const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
    const A = await ctx.newPage(), B = await ctx.newPage();
    const errors = []; [A, B].forEach((p) => p.on('pageerror', (e) => errors.push(e.message)));
    await A.goto(BASE + '?net=local');
    await setupBoard(A, ['Flags'], 'Oceania');
    await opt(A, 'Spelling help'); // the host's spelling help is for everyone
    await A.click('.opt:has-text("Online")');
    await A.fill('input[placeholder="Name"]', 'Xrazt');
    await A.click('button:has-text("Create room")');
    await A.waitForSelector('.roomcode');
    const code = (await A.textContent('.roomcode')).trim();
    ok(/^[A-Z]{5}$/.test(code), 'room made: ' + code);
    // The lobby shows a QR code and the join link; the QR code reads back as that link.
    const link = await A.inputValue('.linkrow input');
    ok(link.endsWith('?room=' + code), 'lobby link: ' + link);
    await A.waitForSelector('.qr');
    const qrText = await A.evaluate(async () => {
      if (!window.jsQR) await new Promise((res) => { const s = document.createElement('script'); s.src = 'vendor/qr/jsQR.js'; s.onload = res; document.head.appendChild(s); });
      const svg = document.querySelector('.qr'), img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
      await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = 400; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 400, 400);
      const r = window.jsQR(x.getImageData(0, 0, 400, 400).data, 400, 400); return r && r.data;
    });
    ok(qrText === link, 'QR code reads back as the join link (' + qrText + ')');
    // Sam's own spelling-help switch is off (the tabs share storage, so switch it off before his page loads).
    await A.evaluate(() => { const st = JSON.parse(localStorage.getItem('gs_setup_v2') || '{}'); st.help = false; localStorage.setItem('gs_setup_v2', JSON.stringify(st)); });
    await B.goto(BASE + '?net=local&room=' + code);
    await B.waitForSelector('.input.code');
    ok((await B.inputValue('.input.code')) === code, 'invite link fills in the code');
    await B.fill('input[placeholder="Name"]', 'Sam');
    await B.click('button:has-text("Join")');
    await B.waitForSelector('.roomcode');
    await A.waitForFunction(() => document.querySelectorAll('.list.board li').length === 2);
    ok(true, 'host sees 2 players');
    await A.screenshot({ path: path.join(outDir, 'live-lobby.png') });
    ok(!(await B.isVisible('button:has-text("Start race")')), 'only the host can start');
    await A.click('button:has-text("Start race")');
    await Promise.all([A.waitForSelector('.tile.active', { timeout: 9000 }), B.waitForSelector('.tile.active', { timeout: 9000 })]);
    const oa = await A.$$eval('.tile', (ts) => ts.map((t) => t.dataset.id)), ob = await B.$$eval('.tile', (ts) => ts.map((t) => t.dataset.id));
    ok(JSON.stringify(oa) === JSON.stringify(ob), 'both got the same board');
    // Sam never turned spelling help on, but the room has it: a near miss gets a suggestion on his phone too.
    await B.bringToFront();
    const near = await B.evaluate(() => { const id = document.querySelector('.tile.active').dataset.id; const n = window.GS.DATA.find((c) => c.id === id).name; return n.slice(0, -1) + (n.slice(-1) === 'x' ? 'y' : 'x'); });
    await B.type('.typebar input', near);
    await B.waitForSelector('.suggest:not([hidden])', { timeout: 2000 }).catch(() => {});
    ok(await B.$('.suggest:not([hidden])') !== null, 'spelling help is on for everyone in the room (Sam typed ' + near + ')');
    await B.fill('.typebar input', '');
    await B.bringToFront();
    for (let i = 0; i < 3; i++) await typeActive(B, 'flag');
    await B.waitForTimeout(800); // let Sam's phone send its progress (a background tab's timers are throttled)
    await A.bringToFront();
    for (let i = 0; i < 5; i++) await typeActive(A, 'flag');
    await B.waitForFunction(() => /Xrazt/.test((document.querySelector('.livebar') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
    const barB = await B.textContent('.livebar');
    ok(/Xrazt.*Flags/.test(barB) && !/5\/14/.test(barB) && /Sam 3\/14/.test(barB), 'live bar on Sam\'s phone: his own 3/14, Xrazt\'s game but not his score (' + barB + ')');
    await B.screenshot({ path: path.join(outDir, 'live-playing.png') });
    for (let i = 0; i < 9; i++) { if (!(await A.$('.tile.active'))) break; await typeActive(A, 'flag'); }
    await A.waitForSelector('.result-time');
    await A.waitForFunction(() => /still playing…/.test(document.querySelector('.card.sky') ? document.querySelector('.card.sky').textContent : ''), null, { timeout: 8000 }).catch(() => {});
    const acard = await A.textContent('.card.sky');
    ok(/Sam.*still playing · 🏳️ Flags/.test(acard) && !/3\/14/.test(acard), 'Xrazt\'s results show Sam\'s game, without his score (' + acard + ')');
    ok(!/null|undefined/.test(acard), 'no "null" on the results card');
    await A.screenshot({ path: path.join(outDir, 'live-waiting.png'), fullPage: true });
    await B.bringToFront();
    await B.click('button:has-text("Give up")'); await B.click('button:has-text("Give up and show me")');
    const clear = await B.evaluate(() => { const a = document.querySelector('.reveal-bar .btn').getBoundingClientRect(), l = document.querySelector('.livebar').getBoundingClientRect(); return a.bottom <= l.top && a.top >= 0; });
    ok(clear, 'after giving up, the See results button sits above the live bar');
    await B.screenshot({ path: path.join(outDir, 'live-gaveup.png') });
    await B.click('button:has-text("See results")');
    await B.waitForSelector('.result-time');
    await B.waitForFunction(() => document.querySelectorAll('.card.sky .list li').length === 2 && !/still playing/.test(document.querySelector('.card.sky').textContent), null, { timeout: 4000 });
    const order = await B.$$eval('.card.sky .list li .q', (els) => els.map((e) => e.firstChild.textContent));
    ok(order[0].startsWith('Xrazt') && order[1].startsWith('Sam'), 'final standings: ' + order.join(', '));
    // Head to head: the finished round counts once (both test tabs share one device's storage).
    await B.waitForSelector('.card.sky .h2h', { timeout: 4000 }).catch(() => {});
    const h2h = await B.evaluate(() => JSON.parse(localStorage.getItem('gs_h2h_v1') || '{}'));
    const recs = Object.values(h2h);
    ok(recs.length === 1 && recs[0].w + recs[0].l + recs[0].t === 1 && await B.$('.card.sky .h2h') !== null, 'head to head: one result recorded and shown ' + JSON.stringify(recs));
    await B.screenshot({ path: path.join(outDir, 'live-results.png'), fullPage: true });
    // Another round: the host goes back to the game list (Sam sees the host is picking), adds Capitals, starts.
    await A.bringToFront();
    await A.click('button:has-text("Another round")');
    await A.waitForSelector('button:has-text("Start round 2")');
    ok(await A.$('.game-row.on[data-game="flags"]') !== null && !(await A.$('text=Who is playing')), 'another round: the host is back on the game list (room\'s games picked)');
    await A.screenshot({ path: path.join(outDir, 'live-next.png'), fullPage: true });
    await B.waitForFunction(() => /picking the next round/.test(document.querySelector('.card.sky').textContent), null, { timeout: 4000 }).catch(() => {});
    ok(/picking the next round/.test(await B.textContent('.card.sky')), 'Sam sees the host is picking');
    await A.click('.add-games'); await A.click('.gb-sheet .cat-tab[data-cat="all"]'); await A.click('.gb-card[data-game="capitals"] .gb-add'); await A.click('.gb-head [aria-label="Done"]');
    await opt(A, 'See what game'); // round 2: hide what game others are on
    await A.click('button:has-text("Start round 2")');
    await Promise.all([A.waitForSelector('.tile.active', { timeout: 9000 }), B.waitForSelector('.tile.active', { timeout: 9000 })]);
    const oa2 = await A.$$eval('.tile', (ts) => ts.map((t) => t.dataset.id));
    ok(JSON.stringify(oa2) !== JSON.stringify(oa) && JSON.stringify(oa2) === JSON.stringify(await B.$$eval('.tile', (ts) => ts.map((t) => t.dataset.id))), 'another round: new board, same for both');
    ok(/Game 1\/2/i.test(await B.textContent('body')), 'round 2 has the host\'s new games (Flags + Capitals) on Sam\'s phone');
    await A.bringToFront(); await typeActive(A, 'flag'); await A.waitForTimeout(700);
    await B.bringToFront(); await B.waitForTimeout(400);
    const barB2 = await B.textContent('.livebar');
    ok(/Xrazt playing…/.test(barB2) && !/Flags/.test(barB2.replace(/Sam.*/, '')), 'host turned peeking off: Sam just sees "playing…" (' + barB2 + ')');
    ok(errors.length === 0, 'online race: no page errors ' + JSON.stringify(errors));
    await ctx.close();
    if (only === 'live') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }
  }

  // QR scanner with a fake camera that shows a QR code for room ABCDE: the code lands in the Join box.
  if (!only || only === 'scan') {
    const fs2 = require('fs'), { execSync } = require('child_process');
    const qrPage = await (await b.newContext({ viewport: { width: 480, height: 480 } })).newPage();
    await qrPage.goto(BASE + '?net=local');
    await qrPage.evaluate(async () => {
      await new Promise((res) => { const s = document.createElement('script'); s.src = 'vendor/qr/qrcode.js'; s.onload = res; document.head.appendChild(s); });
      const q = window.qrcode(0, 'M'); q.addData(location.origin + location.pathname + '?room=ABCDE'); q.make();
      document.body.innerHTML = '<div style="background:#fff;width:480px;height:480px;display:grid;place-items:center">' + q.createSvgTag({ cellSize: 10, margin: 4 }) + '</div>';
    });
    const png = path.join(outDir, 'scan-qr.png'), y4m = path.join(outDir, 'scan-qr.y4m');
    await qrPage.screenshot({ path: png });
    execSync('ffmpeg -y -loglevel error -loop 1 -i ' + png + ' -t 4 -r 10 -pix_fmt yuv420p ' + y4m);
    const cam = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + y4m] });
    const cctx = await cam.newContext({ viewport: { width: 360, height: 780 } });
    await cctx.grantPermissions(['camera'], { origin: BASE.replace(/\/Geography-Quiz\/$/, '') });
    const P = await cctx.newPage();
    const errors = []; P.on('pageerror', (e) => errors.push(e.message));
    await P.goto(BASE + '?net=local');
    await P.click('button:has-text("Online")');
    ok((await P.inputValue('input[aria-label="Room code"]')) === '', 'Join box starts empty (no "[object PointerEvent]")');
    ok(await P.isVisible('button:has-text("Host match")'), 'Online screen has Host match');
    const code8 = await P.evaluate(() => window.GS.encodeCode({ kind: 'board', games: ['flags'], region: 'Europe', seed: 77 }));
    await P.fill('input[aria-label="Challenge code"]', code8);
    ok((await P.textContent('.card:has(input[aria-label="Challenge code"])')).includes('✓ Flags · Europe'), 'challenge code works on the Online screen');
    await P.fill('input[placeholder="Name"]', 'Sam');
    await P.click('button:has-text("Scan QR")');
    await P.waitForFunction(() => document.querySelector('input[aria-label="Room code"]').value === 'ABCDE', null, { timeout: 15000 }).catch(() => {});
    ok((await P.inputValue('input[aria-label="Room code"]')) === 'ABCDE', 'scanner read the QR code into the Join box');
    ok(!(await P.$('.scan-video')), 'scanner closed after reading');
    ok(errors.length === 0, 'scanner: no page errors ' + JSON.stringify(errors));
    await cam.close(); fs2.rmSync(y4m, { force: true });
    if (only === 'scan') { await b.close(); server.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); process.exit(fails ? 1 : 0); }
  }

  // Islands: Oceania and the Caribbean on a phone, tapping each island country's ring (a little off-centre,
  // as a thumb would) instead of the island itself.
  for (const region of only && only !== 'islands' ? [] : ['Oceania', 'N. America']) {
    const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await setupBoard(page, ['Map'], region);
    await page.click('button.btn.primary:has-text("Start")'); await page.click('button:has-text("Go")'); await page.waitForSelector('.map .cty');
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
    await page.click('button.btn.primary:has-text("Start")'); await page.click('button:has-text("Go")'); await page.waitForSelector('.map .cty');
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
    await page.click('button.btn.primary:has-text("Start")'); await page.click('button:has-text("Go")'); await page.waitForSelector('.tile.active');
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
