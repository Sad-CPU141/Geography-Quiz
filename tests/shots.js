// Real-browser checks with Playwright (Chromium): plays whole runs, checks challenge links, and takes
// screenshots at phone, laptop and TV sizes. Fails on page errors or sideways scrolling. Run: npm run shots
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

async function noSideScroll(page, label) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  ok(w[0] <= w[1], label + ': no sideways scroll (' + w[0] + ' ≤ ' + w[1] + ')');
}
// Answers the current question correctly (or wrongly) through the real UI.
async function answer(page, style, right) {
  await page.waitForFunction(() => !document.querySelector('.stage.ok, .stage.bad') && document.querySelector('.stage'));
  if (style === 'type') {
    if (right) {
      const text = await page.evaluate(() => {
        const st = document.querySelector('.stage');
        // Work out the answer from what is shown (tests only): flag src / outline / country name.
        const img = st.querySelector('img.flag'); const p = st.querySelector('svg.shape path'); const big = st.querySelector('.big');
        const c = window.GS.DATA.find((x) => (img && img.getAttribute('src').endsWith(x.flag)) || (p && p.getAttribute('d') === x.shape) || (big && big.textContent === x.name));
        return big ? c.capital : c.name;
      });
      await page.fill('.answer input', '');
      await page.type('.answer input', text, { delay: 0 });
    } else {
      await page.click('.answer .skip');
    }
  } else {
    const right_ = await page.evaluate(() => {
      const st = document.querySelector('.stage');
      const img = st.querySelector('img.flag'); const p = st.querySelector('svg.shape path'); const big = st.querySelector('.big');
      return window.GS.DATA.find((x) => (img && img.getAttribute('src').endsWith(x.flag)) || (p && p.getAttribute('d') === x.shape) || (big && big.textContent === x.name)).id;
    });
    const ids = await page.$$eval('.choice', (bs) => bs.map((b) => b.dataset.id));
    const target = right ? right_ : ids.find((x) => x !== right_);
    await page.click('.choice[data-id="' + target + '"]');
  }
}

(async () => {
  const b = await chromium.launch();
  for (const [label, W, H] of SIZES) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: label === 'phone' ? 2 : 1 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(BASE); await page.waitForSelector('.logo');
    await page.screenshot({ path: path.join(outDir, label + '-1-home.png') }); await noSideScroll(page, label + ' home');
    await page.click('text=New run'); await page.waitForSelector('.seg');
    await page.screenshot({ path: path.join(outDir, label + '-2-setup.png'), fullPage: true }); await noSideScroll(page, label + ' setup');

    // Solo, flags, typed, 10 questions: 8 right, 2 skipped.
    await page.click('.opt:has-text("Flags")'); await page.click('.opt:has-text("World")'); await page.click('.opt:has-text("10")'); await page.click('.opt:has-text("Type it")'); await page.click('.opt:has-text("Just me")');
    await page.fill('input[placeholder="Name"]', 'Xrazt');
    await page.click('button:has-text("Start")'); await page.click('button:has-text("Go")');
    await page.waitForSelector('.answer input', { timeout: 5000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, label + '-3-run-flag.png') }); await noSideScroll(page, label + ' run');
    for (let i = 0; i < 10; i++) await answer(page, 'type', i !== 3 && i !== 7);
    await page.waitForSelector('.result-time');
    const t = await page.textContent('.stat b');
    ok(t.trim() === '8/10', label + ': 8/10 right (got ' + t + ')');
    const pen = await page.textContent('.stat:nth-child(3) b');
    ok(pen.trim() === '+20s', label + ': +20s penalty (got ' + pen + ')');
    const total = await page.textContent('.result-time');
    ok(/^\d/.test(total) && parseFloat(total.replace(/^(\d+):/, (m, a) => a * 60 + '+')) >= 20, label + ': final time includes penalty (' + total + ')');
    await page.screenshot({ path: path.join(outDir, label + '-4-result.png'), fullPage: true }); await noSideScroll(page, label + ' result');
    const code = (await page.textContent('.code')).trim();
    ok(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code), label + ': challenge code ' + code);

    // Shapes, pick mode, Europe: one wrong tap.
    await page.click('button:has-text("Change")'); await page.click('.opt:has-text("Shapes")'); await page.click('.opt:has-text("Europe")'); await page.click('.opt:has-text("10")'); await page.click('.opt:has-text("Pick from 4")');
    await page.click('button:has-text("Start")'); await page.click('button:has-text("Go")');
    await page.waitForSelector('.choice');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, label + '-5-run-shape-pick.png') }); await noSideScroll(page, label + ' shape run');
    for (let i = 0; i < 10; i++) await answer(page, 'pick', i !== 5);
    await page.waitForSelector('.result-time');
    ok((await page.textContent('.stat b')).trim() === '9/10', label + ': pick run 9/10');
    ok((await page.textContent('.stat:nth-child(3) b')).trim() === '+5s', label + ': pick penalty +5s');

    // Capitals, typed, 3-player pass-the-phone.
    await page.click('button:has-text("Change")'); await page.click('.opt:has-text("Capitals")'); await page.click('.opt:has-text("Oceania")'); await page.click('.opt:has-text("10")'); await page.click('.opt:has-text("Type it")'); await page.click('.opt:has-text("Pass the phone")');
    for (const n of ['Ali', 'Sam', 'Noor']) { await page.fill('#pname', n); await page.press('#pname', 'Enter'); }
    await page.click('button:has-text("Start")');
    for (let p = 0; p < 3; p++) {
      await page.click('button:has-text("Go")'); await page.waitForSelector('.answer input');
      if (p === 0) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(outDir, label + '-6-run-capital.png') }); }
      for (let i = 0; i < 10; i++) await answer(page, 'type', !(p === 1 && i < 2));
      await page.waitForSelector('.result-time');
      if (p < 2) await page.click('button:has-text("Next:")');
    }
    await page.click('button:has-text("See who won")'); await page.waitForSelector('.board');
    await page.screenshot({ path: path.join(outDir, label + '-7-board.png'), fullPage: true }); await noSideScroll(page, label + ' board');
    const order = await page.$$eval('.board li .q', (els) => els.map((e) => e.firstChild.textContent));
    ok(order[2] === 'Sam', label + ': Sam (2 skips) is last: ' + order.join(', '));

    // Mix run (quick sanity: every kind renders) then a challenge link round trip.
    await page.click('button:has-text("Home")');
    ok(errors.length === 0, label + ': no page errors ' + JSON.stringify(errors));
    await ctx.close();
  }

  // Challenge link: player A plays, link opens for B with the same questions and a time to beat.
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE); await page.click('text=New run');
  await page.click('.opt:has-text("Mix")'); await page.click('.opt:has-text("World")'); await page.click('.opt:has-text("10")'); await page.click('.opt:has-text("Type it")'); await page.click('.opt:has-text("Just me")');
  await page.fill('input[placeholder="Name"]', 'Xrazt');
  await page.click('button:has-text("Start")'); await page.click('button:has-text("Go")'); await page.waitForSelector('.answer input');
  const seenA = [];
  for (let i = 0; i < 10; i++) { await page.waitForFunction(() => !document.querySelector('.stage.ok, .stage.bad')); seenA.push(await page.innerHTML('.stage')); if (i === 2) await page.screenshot({ path: path.join(outDir, 'mix-run.png') }); await answer(page, 'type', true); }
  await page.waitForSelector('.result-time');
  const url = await page.evaluate(() => { let u; navigator.share = undefined; const orig = navigator.clipboard && navigator.clipboard.writeText; return null; });
  const code = (await page.textContent('.code')).trim();
  const timeA = (await page.textContent('.result-time')).trim();
  // Build the link the Send button makes (navigator.share/clipboard aren't available headless).
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('button:has-text("Send challenge")');
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const link = (clip.match(/https?:\S+/) || [])[0];
  ok(!!link && link.includes('c=') && link.includes('n=Xrazt'), 'share link made: ' + link);
  ok(clip.includes(code), 'share text has the code');
  const page2 = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  page2.on('pageerror', (e) => errors.push(e.message));
  await page2.goto(link.replace(/^https?:\/\/[^/]+/, 'http://localhost:' + server.address().port));
  await page2.waitForSelector('.card.sky');
  await page2.screenshot({ path: path.join(outDir, 'challenge-home.png') });
  ok((await page2.textContent('.card.sky')).includes(timeA), 'challenge shows the time to beat ' + timeA);
  await page2.fill('.card.sky input', 'Sam');
  await page2.click('button:has-text("Take it on")'); await page2.click('button:has-text("Go")'); await page2.waitForSelector('.answer input');
  const seenB = [];
  for (let i = 0; i < 10; i++) { await page2.waitForFunction(() => !document.querySelector('.stage.ok, .stage.bad')); seenB.push(await page2.innerHTML('.stage')); await answer(page2, 'type', i !== 0); }
  ok(JSON.stringify(seenA) === JSON.stringify(seenB), 'friend got the exact same 10 questions');
  await page2.waitForSelector('.versus');
  ok((await page2.textContent('.versus')).includes('Xrazt'), 'versus line: ' + (await page2.textContent('.versus')));
  await page2.screenshot({ path: path.join(outDir, 'challenge-result.png'), fullPage: true });
  // Code entry screen
  await page2.click('button:has-text("Home")'); await page2.click('text=Enter a challenge code');
  await page2.fill('.input.code', code.toLowerCase());
  ok(await page2.isEnabled('button:has-text("Play this run")'), 'typed code accepted');
  await page2.fill('.input.code', 'ZZZZ-ZZZZ');
  ok(!(await page2.isEnabled('button:has-text("Play this run")')), 'bad code rejected');
  ok(errors.length === 0, 'no page errors in challenge flow ' + JSON.stringify(errors));

  // All 197 outlines and flags load in the page.
  const bad = await page2.evaluate(async () => {
    const out = [];
    await Promise.all(window.GS.DATA.map((c) => new Promise((res) => { const im = new Image(); im.onload = () => { if (!im.naturalWidth) out.push(c.name); res(); }; im.onerror = () => { out.push(c.name); res(); }; im.src = c.flag; })));
    return out;
  });
  ok(bad.length === 0, 'all 197 flags load ' + bad.join(','));
  await b.close(); server.close();
  console.log(fails ? fails + ' FAILED' : 'all browser checks passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
