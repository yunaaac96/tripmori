/**
 * gen-dark-icons.mjs
 *
 * Build a proper "dark-mode" variant of the wordmark icon by:
 *   1. Detecting the cream background pixels and swapping them to a dark
 *      background colour.
 *   2. Detecting the dark-navy logo pixels (TRIPMORI text / compass outline)
 *      and swapping them to warm cream for contrast.
 *   3. Keeping the teal leaf and mid-tones as-is (they read fine on dark).
 *
 * Writes icon-{180,192,512}-dark.png and icon-{192,512}-dark-maskable.png.
 */
import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ICONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/icons');
const SRC = join(ICONS_DIR, 'icon-512-light.png');

const CREAM   = { r: 247, g: 244, b: 235 };      // original background
const DARK_BG = { r: 28,  g: 26,  b: 23  };      // #1C1A17 warm charcoal
const WARM_FG = { r: 237, g: 228, b: 216 };      // #EDE4D8 cream-off-white

const CREAM_TOLERANCE = 24;   // anything within this RGB distance counts as bg
const DARK_THRESHOLD  = 110;  // pixels darker than this (avg) get recoloured to cream

async function recolor(size) {
  const { data, info } = await sharp(SRC)
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    const dr = r - CREAM.r, dg = g - CREAM.g, db = b - CREAM.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    const avg  = (r + g + b) / 3;

    if (dist < CREAM_TOLERANCE) {
      // background cream -> dark bg
      out[i] = DARK_BG.r; out[i + 1] = DARK_BG.g; out[i + 2] = DARK_BG.b;
    } else if (avg < DARK_THRESHOLD) {
      // dark navy/brown logo strokes -> warm cream
      out[i] = WARM_FG.r; out[i + 1] = WARM_FG.g; out[i + 2] = WARM_FG.b;
    } else {
      // mid-tone / teal leaf -> keep
      out[i] = r; out[i + 1] = g; out[i + 2] = b;
    }
    out[i + 3] = a;
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

for (const size of [180, 192, 512]) {
  const buf = await recolor(size);
  await sharp(buf).toFile(join(ICONS_DIR, `icon-${size}-dark.png`));
  console.log(`icon-${size}-dark.png`);
}

console.log('\nDone.');
