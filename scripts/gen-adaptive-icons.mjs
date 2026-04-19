/**
 * gen-adaptive-icons.mjs
 *
 * Single-shot adaptive asset generator that treats the restored wordmark
 * icons (public/icons/icon-{192,512}-light.png) as the source of truth.
 *
 * Outputs:
 *   icon-180.png                  → apple-touch-icon (resize of 192-light)
 *   icon-{192,512}-mono.png       → black-on-transparent for iOS tinted mode
 *   icon-{192,512}-maskable.png   → wordmark with safe-zone padding on cream bg
 *
 * Run once: node scripts/gen-adaptive-icons.mjs
 */
import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ICONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/icons');
const CREAM = { r: 247, g: 244, b: 235, alpha: 1 };
const src512 = join(ICONS_DIR, 'icon-512-light.png');

// 1. icon-180.png (apple-touch-icon) — plain resize, keep cream bg
await sharp(src512).resize(180, 180).png().toFile(join(ICONS_DIR, 'icon-180.png'));
console.log('icon-180.png');

// 2. Monochrome: non-cream pixels → solid black, cream → transparent
async function makeMono(size) {
  // Resize source to target
  const resized = await sharp(src512).resize(size, size).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = resized;
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // distance from cream bg
    const dr = r - CREAM.r, dg = g - CREAM.g, db = b - CREAM.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    const isLogo = dist > 40; // any non-cream pixel counts as logo
    out[i] = 0; out[i + 1] = 0; out[i + 2] = 0;
    out[i + 3] = isLogo ? 255 : 0;
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(join(ICONS_DIR, `icon-${size}-mono.png`));
  console.log(`icon-${size}-mono.png`);
}
await makeMono(192);
await makeMono(512);

// 3. Maskable with safe zone: shrink logo to ~70% and centre on cream
async function makeMaskable(size) {
  const inner = Math.round(size * 0.70);
  const logoBuf = await sharp(src512).resize(inner, inner, { fit: 'contain', background: CREAM }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: CREAM } })
    .composite([{ input: logoBuf, gravity: 'center' }])
    .png()
    .toFile(join(ICONS_DIR, `icon-${size}-maskable.png`));
  console.log(`icon-${size}-maskable.png`);
}
await makeMaskable(192);
await makeMaskable(512);

console.log('\nDone. Adaptive assets regenerated.');
