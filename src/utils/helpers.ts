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
