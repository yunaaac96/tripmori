// imageCompress.ts
import imageCompression from 'browser-image-compression';
export async function compressImage(file: File): Promise<File> {
  return imageCompression(file, { maxSizeMB: 0.8, maxWidthOrHeight: 1920, useWebWorker: true });
}

// date.ts
export const formatDate = (d: Date) =>
  d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
export const formatTime = (d: Date) =>
  d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });

// Picks a high-contrast foreground (white vs. near-black) for a given avatar
// background hex. The avatar swatch stays the same in both light and dark
// mode, so this is computed purely from the bg — the choice is independent
// of the surrounding page theme. Falls back to dark for non-hex inputs (e.g.
// CSS var fallbacks like `var(--tm-sage)`), which is the safer default for
// the pastel palette in use. Uses near-black #14100C rather than a softer
// warm brown so Chinese characters' thin strokes stay readable on bright
// pastels under display dimming / dark-mode auto-tinting.
export const avatarTextColor = (bg: string | undefined): string => {
  const DARK = '#14100C';
  if (!bg || !bg.startsWith('#')) return DARK;
  const hex = bg.replace('#', '');
  const full = hex.length === 3 ? hex.replace(/(.)/g, '$1$1') : hex;
  if (full.length !== 6) return DARK;
  const parts = [full.slice(0, 2), full.slice(2, 4), full.slice(4, 6)].map(h => parseInt(h, 16));
  if (parts.some(Number.isNaN)) return DARK;
  const [r, g, b] = parts.map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // 0.22 is the luminance where white-on-bg and DARK-on-bg have equal WCAG
  // contrast; above → dark is better, below → white is better.
  return L < 0.22 ? '#FFFFFF' : DARK;
};
