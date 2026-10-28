// Afghanistan's white Shahada flag (owner's choice). Traced from tools/flags/af-source.png — the public-domain
// Wikipedia flag (File:Flag of the Taliban.svg, 1:2), supplied by the owner — into vector shapes with potrace.
// Run: node tools/afghan-flag.mjs → tools/flags/af.svg (then npm run data).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const potrace = require('potrace');
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'flags');
// Trace at the picture's own size (1280×640); scale to 1000×500.
potrace.trace(path.join(dir, 'af-source.png'), { threshold: 128, turdSize: 8, optTolerance: 0.3, alphaMax: 1 }, (err, svg) => {
  if (err) throw err;
  const w = +/width="(\d+)"/.exec(svg)[1];
  const d = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(' ').replace(/-?\d+\.\d+/g, (n) => String(Math.round(+n * 10) / 10));
  const out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500"><rect width="1000" height="500" fill="#fff"/>' +
    '<path transform="scale(' + (1000 / w) + ')" fill="#000" fill-rule="evenodd" d="' + d + '"/></svg>\n';
  fs.writeFileSync(path.join(dir, 'af.svg'), out);
  console.log('af.svg: ' + Math.round(out.length / 1024) + ' KB');
});
