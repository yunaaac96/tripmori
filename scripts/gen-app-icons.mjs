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

async function onBg(size, bg, coverage = 1.0) {
  const inner = Math.round(size * coverage);
  const iconBuf = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: TRANS })
    .toBuffer();

  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: iconBuf, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function mono(size) {
  // Turn any non-transparent pixel into solid black; keep alpha as-is.
  const { data, info } = await sharp(SRC)
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

async function transparent(size) {
  return sharp(SRC).resize(size, size, { fit: 'contain', background: TRANS }).png().toBuffer();
}

// ── 180 — apple-touch-icon default (cream bg) + transparent variant ───────────
await sharp(await onBg(180, CREAM)).toFile(join(ICONS_DIR, 'icon-180.png'));
console.log('icon-180.png');
await sharp(await transparent(180)).toFile(join(ICONS_DIR, 'icon-180-transparent.png'));
console.log('icon-180-transparent.png');

// ── 192 / 512 — light (cream) ─────────────────────────────────────────────────
for (const size of [192, 512]) {
  await sharp(await onBg(size, CREAM)).toFile(join(ICONS_DIR, `icon-${size}-light.png`));
  console.log(`icon-${size}-light.png`);
}

// ── 192 / 512 — dark (warm charcoal, no recolour needed: mark is already mid-tone) ─
for (const size of [192, 512]) {
  await sharp(await onBg(size, DARK_BG)).toFile(join(ICONS_DIR, `icon-${size}-dark.png`));
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
