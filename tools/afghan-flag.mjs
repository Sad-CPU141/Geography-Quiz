// Draws the white Afghanistan flag (black Shahada on white, 1:2) as plain SVG shapes, so it looks the same on
// every device instead of depending on the phone's Arabic font. The inscription is shaped with HarfBuzz and drawn
// from the glyph outlines of the Amiri Bold calligraphic font (SIL Open Font License).
// Run: node tools/afghan-flag.mjs  → tools/flags/af.svg (used by tools/data.js)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import * as hb from 'harfbuzzjs';
const require = createRequire(import.meta.url);
const wawoff = require('wawoff2');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const woff2 = fs.readFileSync(path.join(root, 'node_modules/@fontsource/amiri/files/amiri-arabic-700-normal.woff2'));
const ttf = await wawoff.decompress(woff2);
const face = new hb.Face(new hb.Blob(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength))), font = new hb.Font(face);
const buffer = new hb.Buffer();
buffer.addText('لا إله إلا الله محمد رسول الله');
buffer.guessSegmentProperties();
hb.shape(font, buffer);
const infos = buffer.getGlyphInfos(), pos = buffer.getGlyphPositions();
let x = 0, glyphs = '';
infos.forEach((g, i) => {
  const p = font.glyphToPath(g.codepoint), P = pos[i];
  if (p) glyphs += '<path transform="translate(' + (x + P.xOffset) + ' ' + (-P.yOffset) + ') scale(1 -1)" d="' + p + '"/>';
  x += P.xAdvance;
});
// Fit the inscription to 90% of the flag's width, centred (font units: the text sits around y = -600…+300).
const W = 1000, H = 500, k = (W * 0.9) / x;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '"><rect width="' + W + '" height="' + H + '" fill="#fff"/>' +
  '<g fill="#000" stroke="#000" stroke-width="28" stroke-linejoin="round" transform="translate(' + (W - x * k) / 2 + ' ' + (H / 2 + 0.22 * 1000 * k) + ') scale(' + k + ')">' + glyphs + '</g></svg>';
fs.mkdirSync(path.join(root, 'tools/flags'), { recursive: true });
fs.writeFileSync(path.join(root, 'tools/flags/af.svg'), svg);
console.log('af flag: ' + Math.round(svg.length / 1024) + ' KB');
