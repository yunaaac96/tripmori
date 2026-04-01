import { useEffect, useRef, useState } from 'react';
import { C, FONT } from '../App';

interface Props {
  file: File;
  onCrop: (blob: Blob) => void;
  onCancel: () => void;
}

export default function CropModal({ file, onCrop, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgSrc, setImgSrc] = useState('');
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const SIZE = 260; // crop circle diameter

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!imgSrc || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      canvas.width = SIZE;
      canvas.height = SIZE;
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
      ctx.clip();
      const s = scale * Math.max(SIZE / img.width, SIZE / img.height);
      const w = img.width * s;
      const h = img.height * s;
      ctx.drawImage(img, (SIZE - w) / 2 + offset.x, (SIZE - h) / 2 + offset.y, w, h);
      ctx.restore();
    };
    img.src = imgSrc;
  }, [imgSrc, offset, scale]);

  const handleConfirm = () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob(blob => { if (blob) onCrop(blob); }, 'image/jpeg', 0.92);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 24, padding: '24px 20px', width: '100%', maxWidth: 340, fontFamily: FONT }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: C.bark, margin: '0 0 16px', textAlign: 'center' }}>裁切頭像</p>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <canvas ref={canvasRef} width={SIZE} height={SIZE}
            style={{ borderRadius: '50%', border: `3px solid ${C.creamDark}`, display: 'block', maxWidth: '100%' }} />
        </div>

        {/* Move controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: C.barkLight, fontWeight: 600 }}>左右位移</label>
          <label style={{ fontSize: 11, color: C.barkLight, fontWeight: 600 }}>上下位移</label>
          <input type="range" min={-100} max={100} value={offset.x}
            onChange={e => setOffset(o => ({ ...o, x: Number(e.target.value) }))} style={{ width: '100%' }} />
          <input type="range" min={-100} max={100} value={offset.y}
            onChange={e => setOffset(o => ({ ...o, y: Number(e.target.value) }))} style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: C.barkLight, fontWeight: 600, display: 'block', marginBottom: 4 }}>縮放</label>
          <input type="range" min={0.5} max={3} step={0.05} value={scale}
            onChange={e => setScale(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
            取消
          </button>
          <button onClick={handleConfirm}
            style={{ flex: 2, padding: '11px 0', borderRadius: 12, border: 'none', background: C.earth, color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
            ✓ 確認裁切
          </button>
        </div>
      </div>
    </div>
  );
}
