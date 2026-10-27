// Renders the app icons from the logo mark (SVG) with Playwright. Run: node tools/icons.js
// The mark: a gold stopwatch whose face is a sky-blue globe.
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const mark = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
<defs><radialGradient id="g" cx="50%" cy="0%" r="90%"><stop offset="0" stop-color="#3a2f78"/><stop offset="1" stop-color="#0f0c21"/></radialGradient>
<clipPath id="face"><circle cx="32" cy="36" r="16"/></clipPath></defs>
<rect width="64" height="64" fill="url(#g)"/>
<g transform="translate(${pad} ${pad}) scale(${(64 - 2 * pad) / 64})">
<rect x="27" y="6" width="10" height="5" rx="2" fill="#ffc83d"/><rect x="30" y="10" width="4" height="5" fill="#e9a400"/>
<rect x="45" y="14" width="7" height="4" rx="2" fill="#ffc83d" transform="rotate(45 48.5 16)"/>
<circle cx="32" cy="36" r="21" fill="#ffc83d"/><circle cx="32" cy="36" r="17.5" fill="#e9a400"/>
<circle cx="32" cy="36" r="16" fill="#5aa8ff"/>
<g clip-path="url(#face)" fill="none" stroke="#04193a" stroke-width="1.6" opacity=".55">
<ellipse cx="32" cy="36" rx="7" ry="16"/><line x1="32" y1="20" x2="32" y2="52"/><line x1="16" y1="36" x2="48" y2="36"/>
<path d="M18 28 Q32 31 46 28"/><path d="M18 44 Q32 41 46 44"/></g>
<path d="M24 30 q4-4 8-2 q2 3 6 2 q2 4-2 7 q-3 1-3 5 q-4 2-5-2 q-3-3-4-6z" fill="#f3e7c3" opacity=".95"/>
<line x1="32" y1="36" x2="40" y2="25" stroke="#0f0c21" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="36" r="2.6" fill="#0f0c21"/>
</g></svg>`;
(async () => {
  const b = await chromium.launch();
  const out = [['icon-192.png', 192, 2], ['icon-512.png', 512, 2], ['apple-touch-icon.png', 180, 5], ['icon-maskable-512.png', 512, 11], ['favicon.png', 64, 0]];
  for (const [f, s, pad] of out) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<html><body style="margin:0">${mark(pad)}</body></html>`);
    await p.screenshot({ path: path.join(__dirname, '..', 'icons', f) });
    await p.close();
  }
  await b.close(); console.log('icons done');
})();
