import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../web/public/brand');
fs.mkdirSync(OUT, { recursive: true });

// ---- Brand constants (spec §4.5) -------------------------------------------
const YELLOW = '#FFCC00';
const BLACK = '#111111';
const LIGHT = '#F3F4F6';

// Gear path in a 0..24 coordinate space (same motif as the site header / favicon).
const GEAR =
  'M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z';

function loadFont(file) {
  const buf = fs.readFileSync(path.join(__dirname, file));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
const stencil = loadFont('BlackOpsOne-Regular.ttf');
const mono = loadFont('ShareTechMono-Regular.ttf');

// Lay out a string as a single vector path with optional letter tracking.
// Returns { d, box:{x1,y1,x2,y2} } in user units.
function textPath(font, text, size, x, baselineY, tracking = 0) {
  const all = new opentype.Path();
  let cx = x;
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    const gp = glyph.getPath(cx, baselineY, size);
    all.commands.push(...gp.commands);
    cx += (glyph.advanceWidth / font.unitsPerEm) * size + tracking;
  }
  return { d: all.toPathData(2), box: all.getBoundingBox() };
}

// ---- Square gear icon ------------------------------------------------------
// viewBox 0..240. Gear scaled to leave breathing room; optional black tile.
function iconSVG(px, { tile }) {
  const VB = 240;
  const scale = 6.6;
  const g = 24 * scale;
  const off = (VB - g) / 2;
  const bg = tile
    ? `<rect width="${VB}" height="${VB}" rx="34" fill="${BLACK}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${VB} ${VB}">
  ${bg}
  <path transform="translate(${off} ${off}) scale(${scale})" fill="${YELLOW}" d="${GEAR}"/>
</svg>`;
}

// ---- Horizontal lockup: gear + EASTERN PRO (+ optional tagline) -------------
function lockupSVG(px, { tile, tagline }) {
  const PAD = 56;
  const GEAR_H = 200;
  const gScale = GEAR_H / 24;
  const GAP = 56; // gear -> text
  const TITLE = 150;
  const TAG = 34;
  const TAG_TRACK = 5;
  const textX = GEAR_H + GAP;

  // Title baseline placed at an arbitrary Y; measure, then place tagline under it.
  const title = textPath(stencil, 'EASTERN PRO', TITLE, textX, 1000);
  let blockTop = title.box.y1;
  let blockBottom = title.box.y2;

  let tag = null;
  if (tagline) {
    const probe = textPath(mono, 'X', TAG, 0, 1000);
    const ascent = 1000 - probe.box.y1;
    const tagBaseline = title.box.y2 + 26 + ascent;
    tag = textPath(mono, 'HEAVY EQUIPMENT RENTALS & DUMPSTERS', TAG, textX, tagBaseline, TAG_TRACK);
    blockBottom = tag.box.y2;
  }

  // Vertically center the gear on the text block.
  const blockCenter = (blockTop + blockBottom) / 2;
  const gearTop = blockCenter - GEAR_H / 2;
  const gearBottom = blockCenter + GEAR_H / 2;

  const minY = Math.min(gearTop, blockTop);
  const maxY = Math.max(gearBottom, blockBottom);
  const maxX = Math.max(GEAR_H, title.box.x2, tag ? tag.box.x2 : 0);

  const vbX = -PAD;
  const vbY = minY - PAD;
  const vbW = maxX + PAD * 2;
  const vbH = maxY - minY + PAD * 2;
  const height = Math.round((px * vbH) / vbW);

  const bg = tile
    ? `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" rx="40" fill="${BLACK}"/>`
    : '';
  const tagEl = tag ? `<path fill="${LIGHT}" d="${tag.d}"/>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${height}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">
  ${bg}
  <path transform="translate(0 ${gearTop}) scale(${gScale})" fill="${YELLOW}" d="${GEAR}"/>
  <path fill="${YELLOW}" d="${title.d}"/>
  ${tagEl}
</svg>`;
}

async function emit(name, svg) {
  await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, name));
  // Also drop the source SVG for vector-perfect scaling later.
  console.log('  ', name);
}

const log = [];
async function run() {
  console.log('icons (on black tile):');
  for (const s of [1024, 512, 256, 180, 128, 64, 48, 32, 16]) {
    await emit(`gear-icon-${s}.png`, iconSVG(s, { tile: true }));
  }
  console.log('icons (transparent gear):');
  for (const s of [1024, 512, 256, 128]) {
    await emit(`gear-transparent-${s}.png`, iconSVG(s, { tile: false }));
  }
  console.log('horizontal lockup w/ tagline (transparent — for dark bg):');
  for (const w of [2000, 1200, 800]) {
    await emit(`logo-horizontal-${w}.png`, lockupSVG(w, { tile: false, tagline: true }));
  }
  console.log('horizontal lockup w/ tagline (on black):');
  for (const w of [2000, 1200, 800]) {
    await emit(`logo-horizontal-onblack-${w}.png`, lockupSVG(w, { tile: true, tagline: true }));
  }
  console.log('wordmark only — gear + EASTERN PRO (on black):');
  for (const w of [2000, 1200, 800]) {
    await emit(`logo-wordmark-onblack-${w}.png`, lockupSVG(w, { tile: true, tagline: false }));
  }

  // Save canonical source SVGs (vector masters).
  fs.writeFileSync(path.join(OUT, 'gear-icon.svg'), iconSVG(512, { tile: true }));
  fs.writeFileSync(path.join(OUT, 'gear-transparent.svg'), iconSVG(512, { tile: false }));
  fs.writeFileSync(path.join(OUT, 'logo-horizontal.svg'), lockupSVG(2000, { tile: false, tagline: true }));
  fs.writeFileSync(path.join(OUT, 'logo-horizontal-onblack.svg'), lockupSVG(2000, { tile: true, tagline: true }));
  fs.writeFileSync(path.join(OUT, 'logo-wordmark-onblack.svg'), lockupSVG(2000, { tile: true, tagline: false }));
  console.log('source SVGs written.');
}

run().then(() => console.log('done ->', OUT));
