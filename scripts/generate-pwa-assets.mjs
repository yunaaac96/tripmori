/**
 * generate-pwa-assets.mjs
 *
 * Source: public/logo.png  (3776×1120 TRIPMORI wordmark)
 * Extracts the compass icon and generates:
 *
 *   public/icons/icon-{32,48,180,192,512}.png        (standard icons)
 *   public/icons/icon-{192,512}-dark.png             (maskable, dark bg)
 *   public/icons/icon-{192,512}-mono.png             (monochrome, transparent bg)
 *   public/icons/favicon-{32,48}.png                 (browser favicon)
 *   public/icons/splash-inline-80.b64               (base64 PNG for inline splash)
 *   public/splash/*.png                              (iOS launch screens)
 *
 * Run: node scripts/generate-pwa-assets.mjs
 */

import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const ICONS_DIR  = join(ROOT, 'public/icons');
const SPLASH_DIR = join(ROOT, 'public/splash');

mkdirSync(SPLASH_DIR, { recursive: true });

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG_CREAM = { r: 247, g: 244, b: 235, alpha: 1 }; // #F7F4EB  (light bg)
const BG_GREEN = { r:  58, g:  90, b:  58, alpha: 1 }; // #3A5A3A  (dark / maskable bg)
const BG_TRANS = { r:   0, g:   0, b:   0, alpha: 0 }; // transparent (monochrome)

// ── Compass crop from logo.png ─────────────────────────────────────────────────
// logo.png = 3776×1120  "TRIPMORI" wordmark; compass ≈ x:2250-3020 y:70-1050
const LOGO_SRC     = join(ROOT, 'public/logo.png');
const COMPASS_CROP = { left: 2250, top: 70, width: 770, height: 980 };

// Produce a resized compass buffer on a given background colour
async function compassOnBg(size, bg) {
  const iconBuf = await sharp(LOGO_SRC)
    .extract(COMPASS_CROP)
    .resize(Math.round(size * 0.78), Math.round(size * 0.78), {
      fit: 'contain',
      background: bg,
    })
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{
      input: iconBuf,
      gravity: 'center',
    }])
    .png()
    .toBuffer();
}

// Monochrome version: extract compass shape, make it black on transparent
async function compassMono(size) {
  // Extract on white bg, then use it as the alpha channel via threshold trick:
  // 1. Extract compass on white bg
  // 2. Negate (white areas become black, dark areas become white)
  // 3. Use as alpha channel over a solid black image
  const onWhite = await sharp(LOGO_SRC)
    .extract(COMPASS_CROP)
    .resize(Math.round(size * 0.78), Math.round(size * 0.78), {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toBuffer();

  // Create a size×size canvas with the compass centred
  const offset = Math.round(size * 0.11);
  const iconSize = Math.round(size * 0.78);

  // Build: black pixels where compass is dark, transparent elsewhere
  const alphaMask = await sharp(onWhite)
    .greyscale()
    .negate()            // dark logo lines → bright (high alpha)
    .threshold(60)       // binarise
    .toBuffer();

  const blackLayer = await sharp({
    create: { width: iconSize, height: iconSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } },
  }).png().toBuffer();

  const composited = await sharp(blackLayer)
    .joinChannel(alphaMask)
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: BG_TRANS },
  })
    .composite([{ input: composited, top: offset, left: offset }])
    .png()
    .toBuffer();
}

// ── 1. Standard icons (cream bg) ───────────────────────────────────────────────
console.log('── Standard icons (cream bg) ────────────────────────────────');
for (const size of [32, 48, 180, 192, 512]) {
  const buf = await compassOnBg(size, BG_CREAM);
  const name = size === 32 ? 'favicon-32.png'
             : size === 48 ? 'favicon-48.png'
             : `icon-${size}.png`;
  await sharp(buf).toFile(join(ICONS_DIR, name));
  // Also update the -light variant for backward compat
  if ([192, 512].includes(size)) {
    await sharp(buf).toFile(join(ICONS_DIR, `icon-${size}-light.png`));
  }
  if ([32, 48].includes(size)) {
    await sharp(buf).toFile(join(ICONS_DIR, `favicon-${size}-light.png`));
  }
  console.log(`  ✅ ${name}  (${size}×${size}, cream bg)`);
}

// ── 2. icon-180 (apple-touch-icon) ────────────────────────────────────────────
// Already written above as icon-180.png; alias for clarity
console.log('  ✅ icon-180.png  ← apple-touch-icon');

// ── 3. Dark / maskable icons (green bg) ───────────────────────────────────────
console.log('\n── Maskable icons (dark green bg) ───────────────────────────');
for (const size of [192, 512]) {
  const buf = await compassOnBg(size, BG_GREEN);
  await sharp(buf).toFile(join(ICONS_DIR, `icon-${size}-dark.png`));
  console.log(`  ✅ icon-${size}-dark.png  (maskable)`);
}

// ── 4. Monochrome icons (transparent bg, for iOS 18 tinted mode) ──────────────
console.log('\n── Monochrome icons (transparent bg) ────────────────────────');
for (const size of [192, 512]) {
  const buf = await compassMono(size);
  await sharp(buf).toFile(join(ICONS_DIR, `icon-${size}-mono.png`));
  console.log(`  ✅ icon-${size}-mono.png  (monochrome)`);
}

// ── 5. Inline splash base64 (80×80 compass on cream, for HTML data URI) ───────
console.log('\n── Inline splash data-URI icon ───────────────────────────────');
const splashIconBuf = await compassOnBg(80, BG_CREAM);
const splashB64 = `data:image/png;base64,${splashIconBuf.toString('base64')}`;
writeFileSync(join(ICONS_DIR, 'splash-inline-80.b64'), splashB64);
console.log(`  ✅ splash-inline-80.b64  (${splashB64.length} chars)`);

// ── 6. Splash screens ─────────────────────────────────────────────────────────
console.log('\n── Splash screens ────────────────────────────────────────────');

const SPLASH_SIZES = [
  // ── iPhone (portrait) ────────────────────────────────────────────────────
  { w: 1320, h: 2868, name: 'iphone-16promax' },  // 440×956 @3×
  { w: 1206, h: 2622, name: 'iphone-16pro'    },  // 402×874 @3×
  { w: 1290, h: 2796, name: 'iphone-15promax' },  // 430×932 @3×
  { w: 1179, h: 2556, name: 'iphone-15pro'    },  // 393×852 @3×
  { w: 1284, h: 2778, name: 'iphone-15plus'   },  // 428×926 @3×
  { w: 1170, h: 2532, name: 'iphone-15'       },  // 390×844 @3×
  { w: 1125, h: 2436, name: 'iphone-x'        },  // 375×812 @3×
  { w: 1242, h: 2688, name: 'iphone-xsmax'    },  // 414×896 @3×
  { w:  828, h: 1792, name: 'iphone-xr'       },  // 414×896 @2×
  { w: 1242, h: 2208, name: 'iphone-8plus'    },  // 414×736 @3×
  { w:  750, h: 1334, name: 'iphone-se'       },  // 375×667 @2×
  { w:  640, h: 1136, name: 'iphone-se1'      },  // 320×568 @2×
  // ── iPad (portrait) ──────────────────────────────────────────────────────
  { w: 2048, h: 2732, name: 'ipad-pro-129'    },  // 1024×1366 @2×
  { w: 1668, h: 2388, name: 'ipad-pro-11'     },  //  834×1194 @2×
  { w: 1640, h: 2360, name: 'ipad-air'        },  //  820×1180 @2×
  { w: 1488, h: 2266, name: 'ipad-mini6'      },  //  744×1133 @2×
  { w: 1536, h: 2048, name: 'ipad-9th'        },  //  768×1024 @2×
];

// Reuse the 512 light icon as the centred logo on splash
const splashLogo512 = await compassOnBg(512, BG_CREAM);

for (const { w, h, name } of SPLASH_SIZES) {
  const logoSz = Math.round(Math.min(w, h) * 0.20);
  const left   = Math.round((w - logoSz) / 2);
  const top    = Math.round(h * 0.5 - logoSz * 0.65);

  const bg   = await sharp({ create: { width: w, height: h, channels: 4, background: BG_CREAM } }).png().toBuffer();
  const logo = await sharp(splashLogo512).resize(logoSz, logoSz).toBuffer();

  await sharp(bg)
    .composite([{ input: logo, left, top }])
    .png({ compressionLevel: 8 })
    .toFile(join(SPLASH_DIR, `${name}.png`));

  console.log(`  ✅ ${name}.png  (${w}×${h})`);
}

console.log('\n🎉 All PWA assets generated from logo.png compass icon!');
