/**
 * gen-app-icons.mjs
 *
 * Single source: public/brand-icon.png (1024×1024, transparent bg).
 * Regenerates the complete app-icon set:
 *
 *   icon-180.png              apple-touch-icon default (cream bg)
 *   icon-180-transparent.png  apple-touch-icon transparent variant
 *   icon-{192,512}-light.png  manifest "any" (cream bg)
 *   icon-{192,512}-dark.png   manifest dark variant (warm charcoal bg)
 *   icon-{192,512}-maskable.png  manifest "maskable" (72% safe zone, cream bg)
 *   icon-{192,512}-mono.png   manifest "monochrome" (alpha → solid black, transparent bg)
 *
 * Run: node scripts/gen-app-icons.mjs
 */
import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC       = join(ROOT, 'public/brand-icon.png');
const ICONS_DIR = join(ROOT, 'public/icons');

const CREAM     = { r: 247, g: 244, b: 235, alpha: 1 };   // #F7F4EB
const DARK_BG   = { r: 28,  g: 26,  b: 23,  alpha: 1 };   // #1C1A17
const TRANS     = { r: 0,   g: 0,   b: 0,   alpha: 0 };

// Brand palette (matches src/index.css light-mode tokens) — remap the saturated
// forest green & gold-amber in brand-icon.png to the softer Japanese-style
// website colours so the installed app icon visually matches the app.
const GREEN_SRC = [64, 96, 80];    // #406050 forest green in source
const AMBER_SRC = [208, 160, 96];  // #D0A060 gold-amber in source
const GREEN_DST = [143, 175, 126]; // #8FAF7E --tm-sage
const AMBER_DST = [196, 149, 106]; // #C4956A --tm-earth

// Pre-process the source once:
//   1. Trim the source's own transparent padding so the mark fills the canvas
//      edge-to-edge (coverage settings below then produce consistent padding
//      regardless of how much breathing room the source PNG has).
//   2. Remap dominant brand colours to website palette.
async function softenedSource() {
  const trimmed = await sharp(SRC).trim().toBuffer();
  const { data, info } = await sharp(trimmed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 10) { out[i+3] = 0; continue; }
    const dGreen = Math.abs(r - GREEN_SRC[0]) + Math.abs(g - GREEN_SRC[1]) + Math.abs(b - GREEN_SRC[2]);
    const dAmber = Math.abs(r - AMBER_SRC[0]) + Math.abs(g - AMBER_SRC[1]) + Math.abs(b - AMBER_SRC[2]);
    const [nr, ng, nb] = dGreen <= dAmber ? GREEN_DST : AMBER_DST;
    out[i] = nr; out[i + 1] = ng; out[i + 2] = nb; out[i + 3] = a;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

const SOFT_SRC = await softenedSource();

async function onBg(size, bg, coverage = 1.0) {
  const inner = Math.round(size * coverage);
  const iconBuf = await sharp(SOFT_SRC)
    .resize(inner, inner, { fit: 'contain', background: TRANS })
    .toBuffer();

  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: iconBuf, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function mono(size) {
  // Turn any non-transparent pixel into solid black; keep alpha as-is.
  const { data, info } = await sharp(SOFT_SRC)
    .resize(size, size, { fit: 'contain', background: TRANS })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = 0; out[i + 1] = 0; out[i + 2] = 0;
    out[i + 3] = data[i + 3];
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function transparent(size, coverage = STD_COVERAGE) {
  const inner = Math.round(size * coverage);
  const iconBuf = await sharp(SOFT_SRC)
    .resize(inner, inner, { fit: 'contain', background: TRANS })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: TRANS } })
    .composite([{ input: iconBuf, gravity: 'center' }])
    .png()
    .toBuffer();
}

// Standard icons use 60% coverage (≈20% inner padding per side) applied to the
// already-trimmed source. Because the compass mark is visually heavy (solid
// ring + letters + filled needle), it needs more breathing room than lighter
// icons (Fitdays "F", Reminders dots) to read at the same perceived weight.
const STD_COVERAGE = 0.68;

// ── 180 — apple-touch-icon default (cream bg) + transparent variant ───────────
await sharp(await onBg(180, CREAM, STD_COVERAGE)).toFile(join(ICONS_DIR, 'icon-180.png'));
console.log('icon-180.png');
await sharp(await transparent(180)).toFile(join(ICONS_DIR, 'icon-180-transparent.png'));
console.log('icon-180-transparent.png');

// ── 192 / 512 — light (cream) ─────────────────────────────────────────────────
for (const size of [192, 512]) {
  await sharp(await onBg(size, CREAM, STD_COVERAGE)).toFile(join(ICONS_DIR, `icon-${size}-light.png`));
  console.log(`icon-${size}-light.png`);
}

// ── 192 / 512 — dark (warm charcoal, no recolour needed: mark is already mid-tone) ─
for (const size of [192, 512]) {
  await sharp(await onBg(size, DARK_BG, STD_COVERAGE)).toFile(join(ICONS_DIR, `icon-${size}-dark.png`));
  console.log(`icon-${size}-dark.png`);
}

// ── 192 / 512 — maskable (72% safe zone on cream) ─────────────────────────────
for (const size of [192, 512]) {
  await sharp(await onBg(size, CREAM, 0.72)).toFile(join(ICONS_DIR, `icon-${size}-maskable.png`));
  console.log(`icon-${size}-maskable.png`);
}

// ── 192 / 512 — monochrome (black silhouette, transparent bg) ─────────────────
for (const size of [192, 512]) {
  await sharp(await mono(size)).toFile(join(ICONS_DIR, `icon-${size}-mono.png`));
  console.log(`icon-${size}-mono.png`);
}

console.log('\nDone.');
