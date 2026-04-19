/**
 * generate-pwa-assets.mjs
 *
 * Generates:
 *   - public/icons/icon-{192,512}-mono.png  (black TM on transparent, for iOS tinted mode)
 *   - public/icons/icon-180.png             (180×180 apple-touch-icon, solid bg)
 *   - public/splash/*.png                   (iOS launch screen images, all device sizes)
 *
 * Run: node scripts/generate-pwa-assets.mjs
 */

import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const ICONS_DIR = join(ROOT, 'public/icons');
const SPLASH_DIR = join(ROOT, 'public/splash');

mkdirSync(SPLASH_DIR, { recursive: true });

// ── Design tokens ────────────────────────────────────────────────────────────
const BG_CREAM  = { r: 247, g: 244, b: 235, alpha: 1 }; // #F7F4EB
const BG_GREEN  = { r:  58, g:  90, b:  58, alpha: 1 }; // #3A5A3A
const LOGO_SRC  = join(ICONS_DIR, 'icon-512-light.png'); // source icon

// ── Helper: SVG mono icon (black TM on transparent) ─────────────────────────
const monoSvg = (size) => {
  const fs = Math.round(size * 0.42);
  const ls = -(size * 0.02).toFixed(1);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<text fill="black" x="${size / 2}" y="${Math.round(size * 0.56)}"` +
    ` font-family="Georgia,'Times New Roman',serif"` +
    ` font-size="${fs}" font-weight="700"` +
    ` text-anchor="middle" dominant-baseline="middle"` +
    ` letter-spacing="${ls}">TM</text>` +
    `</svg>`
  );
};

// ── 1. Monochrome icons ──────────────────────────────────────────────────────
console.log('── Monochrome icons ──────────────────────────────────────────');
for (const size of [192, 512]) {
  await sharp(monoSvg(size))
    .png()
    .toFile(join(ICONS_DIR, `icon-${size}-mono.png`));
  console.log(`  ✅ icon-${size}-mono.png  (${size}×${size}, transparent bg)`);
}

// ── 2. apple-touch-icon 180×180 ─────────────────────────────────────────────
console.log('\n── apple-touch-icon ──────────────────────────────────────────');
await sharp(LOGO_SRC).resize(180, 180).png()
  .toFile(join(ICONS_DIR, 'icon-180.png'));
console.log('  ✅ icon-180.png  (180×180, solid bg for iOS home screen)');

// ── 3. Splash screens ────────────────────────────────────────────────────────
console.log('\n── Splash screens ────────────────────────────────────────────');

/**
 * Each entry: { w, h, name }
 *   w×h = physical pixel dimensions iOS expects for the image
 *   name = filename (without .png)
 *
 * Media query reference:
 *   screen and (device-width: Xcss) and (device-height: Ycss)
 *   and (-webkit-device-pixel-ratio: R) and (orientation: portrait)
 */
const SPLASH_SIZES = [
  // ── iPhone ──────────────────────────────────────────────────────────────
  { w: 1320, h: 2868, name: 'iphone-16promax' },  // 440×956 @3×  (iPhone 16 Pro Max)
  { w: 1206, h: 2622, name: 'iphone-16pro'    },  // 402×874 @3×  (iPhone 16 Pro)
  { w: 1290, h: 2796, name: 'iphone-15promax' },  // 430×932 @3×  (15 Pro Max / 14 Pro Max)
  { w: 1179, h: 2556, name: 'iphone-15pro'    },  // 393×852 @3×  (15 Pro / 14 Pro)
  { w: 1284, h: 2778, name: 'iphone-15plus'   },  // 428×926 @3×  (15 Plus / 14 Plus)
  { w: 1170, h: 2532, name: 'iphone-15'       },  // 390×844 @3×  (15 / 14 / 13)
  { w: 1125, h: 2436, name: 'iphone-x'        },  // 375×812 @3×  (X / XS / 11 Pro / 13 mini / 12 mini)
  { w: 1242, h: 2688, name: 'iphone-xsmax'    },  // 414×896 @3×  (XS Max / 11 Pro Max)
  { w:  828, h: 1792, name: 'iphone-xr'       },  // 414×896 @2×  (XR / 11)
  { w: 1242, h: 2208, name: 'iphone-8plus'    },  // 414×736 @3×  (8 Plus / 7 Plus)
  { w:  750, h: 1334, name: 'iphone-se'       },  // 375×667 @2×  (SE 2nd / 3rd / 8 / 7 / 6)
  { w:  640, h: 1136, name: 'iphone-se1'      },  // 320×568 @2×  (SE 1st gen)
  // ── iPad ────────────────────────────────────────────────────────────────
  { w: 2048, h: 2732, name: 'ipad-pro-129'    },  // 1024×1366 @2×
  { w: 1668, h: 2388, name: 'ipad-pro-11'     },  //  834×1194 @2×
  { w: 1640, h: 2360, name: 'ipad-air'        },  //  820×1180 @2×
  { w: 1488, h: 2266, name: 'ipad-mini6'      },  //  744×1133 @2×
  { w: 1536, h: 2048, name: 'ipad-9th'        },  //  768×1024 @2×
];

for (const { w, h, name } of SPLASH_SIZES) {
  // Logo: 20% of shorter dimension, centred slightly above vertical midpoint
  const logoSz = Math.round(Math.min(w, h) * 0.22);
  const left   = Math.round((w - logoSz) / 2);
  const top    = Math.round(h * 0.5 - logoSz * 0.65);

  // Cream background
  const bg = await sharp({
    create: { width: w, height: h, channels: 4, background: BG_CREAM },
  }).png().toBuffer();

  // Resize logo (preserve RGBA so it composites properly)
  const logo = await sharp(LOGO_SRC)
    .resize(logoSz, logoSz, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp(bg)
    .composite([{ input: logo, left, top }])
    .png({ compressionLevel: 8 })
    .toFile(join(SPLASH_DIR, `${name}.png`));

  console.log(`  ✅ ${name}.png  (${w}×${h})`);
}

console.log('\n🎉 All PWA assets generated!');
console.log('   Next: git add public/ && git commit -m "feat: add PWA splash screens & mono icons"');
