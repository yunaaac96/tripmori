import imageCompression from 'browser-image-compression';

export async function compressImage(file: File): Promise<File> {
  const options = {
    maxSizeMB: 0.8,           // 最大 800KB
    maxWidthOrHeight: 1920,   // 最大 1920px
    useWebWorker: true,
    fileType: 'image/webp',   // 轉為 WebP 節省空間
  };
  return imageCompression(file, options);
}