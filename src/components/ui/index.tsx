import { C, FONT } from '../../App';

// ── Card ──────────────────────────────────────────────
export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'white', borderRadius: 20, padding: '14px 16px',
      boxShadow: C.shadow, marginBottom: 10, fontFamily: FONT, ...style,
    }}>
      {children}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────
export function Badge({ label, bg, color, emoji }: { label: string; bg: string; color: string; emoji?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, background: bg, color,
      borderRadius: 6, padding: '2px 8px', display: 'inline-flex',
      alignItems: 'center', gap: 3,
    }}>
      {emoji}{label}
    </span>
  );
}

// ── SectionTitle ──────────────────────────────────────
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 13, fontWeight: 700, color: C.barkLight, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
      {children}
    </p>
  );
}

// ── PinModal ──────────────────────────────────────────
export function PinModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState(false);
  const CORRECT_PIN = '0423';

  const handleSubmit = () => {
    if (pin === CORRECT_PIN) { onSuccess(); }
    else { setError(true); setPin(''); setTimeout(() => setError(false), 1500); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 24, padding: '28px 24px', width: '100%', maxWidth: 320, boxShadow: '0 8px 32px rgba(107,92,78,0.2)', fontFamily: FONT }}>
        <p style={{ textAlign: 'center', fontSize: 32, margin: '0 0 8px' }}>🔒</p>
        <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 16, color: C.bark, margin: '0 0 4px' }}>輸入 PIN 碼</p>
        <p style={{ textAlign: 'center', fontSize: 12, color: C.barkLight, margin: '0 0 20px' }}>此資訊受保護</p>
        <input
          type="password" inputMode="numeric" maxLength={4}
          value={pin} onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="••••"
          style={{
            width: '100%', padding: '12px', textAlign: 'center', fontSize: 24, letterSpacing: 8,
            borderRadius: 14, border: `2px solid ${error ? '#E76F51' : C.creamDark}`,
            background: error ? '#FFF0EC' : C.cream, outline: 'none',
            fontFamily: FONT, boxSizing: 'border-box', marginBottom: 12,
            transition: 'border-color 0.2s',
          }}
          autoFocus
        />
        {error && <p style={{ textAlign: 'center', color: '#E76F51', fontSize: 12, marginBottom: 8 }}>PIN 碼錯誤，請再試一次</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>取消</button>
          <button onClick={handleSubmit} style={{ flex: 2, padding: 12, borderRadius: 12, border: 'none', background: C.sage, color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>確認</button>
        </div>
      </div>
    </div>
  );
}

// ── ImageUpload ───────────────────────────────────────
export function ImageUpload({ onUpload, label = "上傳圖片" }: { onUpload: (file: File) => void; label?: string }) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }} />
      <button
        onClick={() => ref.current?.click()}
        style={{
          padding: '10px 16px', borderRadius: 12, border: `2px dashed ${C.creamDark}`,
          background: C.cream, color: C.barkLight, fontWeight: 600, fontSize: 13,
          cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        📷 {label}
      </button>
    </>
  );
}

import React from 'react';
