/**
 * CropModal — 正方形頭像裁切器
 * 使用方式：選好圖片後顯示此 modal，用戶可拖曳＋縮放後確認，
 * onCrop 回傳裁切後的 Blob，可直接上傳到 Firebase Storage。
 */
import { useEffect, useRef, useState } from 'react';
import { C, FONT } from '../App';

const CROP_SIZE = 280; // 裁切框像素（螢幕座標）
const OUTPUT_SIZE = 400; // 輸出圖片像素

interface Props {
  file: File;
  onCrop: (blob: Blob) => void;
  onCancel: () => void;
}

export default function CropModal({ file, onCrop, onCancel }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const imgRef     = useRef<HTMLImageElement | null>(null);
  const [scale, setScale]   = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // offset of img center from crop frame center
  const [imgLoaded, setImgLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 });

  // Initial scale: cover the crop frame
  const minScale = () => {
    const { w, h } = naturalSize;
    return Math.max(CROP_SIZE / w, CROP_SIZE / h);
  };

  // Load image
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      const ms = Math.max(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight);
      setScale(ms);
      setOffset({ x: 0, y: 0 });
      setImgLoaded(true);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Draw preview on canvas
  useEffect(() => {
    if (!imgLoaded || !imgRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width  = CROP_SIZE;
    canvas.height = CROP_SIZE;

    const img = imgRef.current;
    const drawW = img.naturalWidth  * scale;
    const drawH = img.naturalHeight * scale;
    const x = CROP_SIZE / 2 - drawW / 2 + offset.x;
    const y = CROP_SIZE / 2 - drawH / 2 + offset.y;

    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
    ctx.drawImage(img, x, y, drawW, drawH);

    // Circular clip overlay
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, [imgLoaded, scale, offset]);

  // Touch/mouse drag
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  const clampOffset = (ox: number, oy: number, sc: number) => {
    if (!imgRef.current) return { x: ox, y: oy };
    const { w, h } = naturalSize;
    const hw = w * sc / 2;
    const hh = h * sc / 2;
    const maxX = Math.max(0, hw - CROP_SIZE / 2);
    const maxY = Math.max(0, hh - CROP_SIZE / 2);
    return { x: Math.min(maxX, Math.max(-maxX, ox)), y: Math.min(maxY, Math.max(-maxY, oy)) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    setOffset(clampOffset(drag.current.ox + dx, drag.current.oy + dy, scale));
  };
  const onPointerUp = () => { drag.current = null; };

  const handleScaleChange = (v: number) => {
    setScale(v);
    setOffset(o => clampOffset(o.x, o.y, v));
  };

  const handleConfirm = () => {
    if (!imgRef.current) return;
    const out = document.createElement('canvas');
    out.width  = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const ctx = out.getContext('2d')!;

    // Compute src rect in natural image coordinates
    const drawW = imgRef.current.naturalWidth  * scale;
    const drawH = imgRef.current.naturalHeight * scale;
    const imgX = CROP_SIZE / 2 - drawW / 2 + offset.x; // top-left of drawn image in crop frame
    const imgY = CROP_SIZE / 2 - drawH / 2 + offset.y;
    // Crop frame top-left in drawn image coords
    const srcX = (0 - imgX) / scale;
    const srcY = (0 - imgY) / scale;
    const srcW = CROP_SIZE / scale;
    const srcH = CROP_SIZE / scale;

    // Circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(imgRef.current, srcX, srcY, srcW, srcH, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.restore();

    out.toBlob(blob => { if (blob) onCrop(blob); }, 'image/jpeg', 0.9);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 500, fontFamily: FONT }}>
      <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>拖曳移動、滑桿縮放，選取想要的區域</p>

      {/* Crop frame */}
      <div style={{ position: 'relative', width: CROP_SIZE, height: CROP_SIZE, borderRadius: '50%', overflow: 'hidden', border: '3px solid white', boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)', cursor: 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}>
        <canvas ref={canvasRef} style={{ width: CROP_SIZE, height: CROP_SIZE, display: 'block', userSelect: 'none' }} />
      </div>

      {/* Zoom slider */}
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 16, color: 'white' }}>🔍</span>
        <input
          type="range"
          min={minScale()}
          max={minScale() * 4}
          step={0.01}
          value={scale}
          onChange={e => handleScaleChange(Number(e.target.value))}
          style={{ width: 180, accentColor: C.earth }}
        />
        <span style={{ fontSize: 16, color: 'white' }}>🔎</span>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button onClick={onCancel}
          style={{ padding: '12px 28px', borderRadius: 14, border: '1.5px solid rgba(255,255,255,0.4)', background: 'transparent', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: FONT }}>
          取消
        </button>
        <button onClick={handleConfirm} disabled={!imgLoaded}
          style={{ padding: '12px 32px', borderRadius: 14, border: 'none', background: C.earth, color: 'white', fontWeight: 700, fontSize: 14, cursor: imgLoaded ? 'pointer' : 'default', fontFamily: FONT, opacity: imgLoaded ? 1 : 0.5 }}>
          ✓ 使用此區域
        </button>
      </div>
    </div>
  );
}
