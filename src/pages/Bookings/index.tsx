import { useState } from 'react';
import { C, FONT, cardStyle } from '../../App';
import PageHeader from '../../components/layout/PageHeader';
import { SectionTitle, PinModal } from '../../components/ui/index';

export default function BookingsPage({ bookings }: { bookings: any[] }) {
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pendingItem, setPendingItem] = useState<any>(null);
  const [revealedItem, setRevealedItem] = useState<string | null>(null);

  const flights = bookings.filter(b => b.type === 'flight');
  const hotels  = bookings.filter(b => b.type === 'hotel');
  const cars    = bookings.filter(b => b.type === 'car');

  const handleReveal = (id: string) => {
    if (pinUnlocked) { setRevealedItem(id); return; }
    setPendingItem(id);
    setShowPin(true);
  };

  const fmtTime = (ts: any) => ts?.toDate?.()?.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) || '—';
  const fmtDate = (ts: any) => ts?.toDate?.()?.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) || '—';

  return (
    <div style={{ fontFamily: FONT }}>
      {showPin && (
        <PinModal
          onSuccess={() => { setPinUnlocked(true); setShowPin(false); if (pendingItem) setRevealedItem(pendingItem); }}
          onClose={() => setShowPin(false)}
        />
      )}

      <PageHeader title="旅行預訂" subtitle="機票 · 住宿 · 租車" emoji="✈️" color={C.sky} />

      <div style={{ padding: 16 }}>
        {/* ── 機票：登機證樣式 ── */}
        <SectionTitle>✈️ 航班資訊</SectionTitle>
        {flights.map(b => (
          <div key={b.id} style={{ borderRadius: 24, overflow: 'hidden', boxShadow: C.shadow, marginBottom: 16 }}>
            {/* 登機證上半 */}
            <div style={{ background: `linear-gradient(135deg, ${C.sageDark} 0%, ${C.sage} 100%)`, padding: '18px 22px 22px' }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', margin: '0 0 10px', fontWeight: 600 }}>
                {b.airline} · {b.flightNo}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'white' }}>
                <div>
                  <p style={{ fontSize: 32, fontWeight: 900, margin: 0, lineHeight: 1 }}>{b.departure?.airport}</p>
                  <p style={{ fontSize: 11, opacity: 0.8, margin: '2px 0 0' }}>{b.departure?.airportName}</p>
                </div>
                <div style={{ flex: 1, borderTop: '2px dashed rgba(255,255,255,0.4)', position: 'relative' }}>
                  <span style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', fontSize: 16 }}>✈️</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 32, fontWeight: 900, margin: 0, lineHeight: 1 }}>{b.arrival?.airport}</p>
                  <p style={{ fontSize: 11, opacity: 0.8, margin: '2px 0 0' }}>{b.arrival?.airportName}</p>
                </div>
              </div>
            </div>
            {/* 撕票線 */}
            <div style={{ height: 1, background: 'repeating-linear-gradient(90deg, #E0D9C8 0, #E0D9C8 8px, transparent 8px, transparent 16px)', margin: '0 16px' }} />
            {/* 登機證下半 */}
            <div style={{ background: 'white', padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                ['出發', fmtTime(b.departure?.time)],
                ['抵達', fmtTime(b.arrival?.time)],
                ['日期', fmtDate(b.departure?.time)],
                ['乘客', (b.passengers || []).join(', ')],
                ['確認碼', revealedItem === b.id ? b.confirmCode : '••••••'],
                ['備註', b.notes?.slice(0, 10) || '—'],
              ].map(([label, val], i) => (
                <div key={label} onClick={() => label === '確認碼' && handleReveal(b.id)} style={{ cursor: label === '確認碼' ? 'pointer' : 'default' }}>
                  <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: label === '確認碼' ? C.earth : C.bark, margin: '2px 0 0' }}>{val}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* ── 住宿 ── */}
        <SectionTitle>🏨 住宿安排</SectionTitle>
        {hotels.map(b => (
          <div key={b.id} style={cardStyle}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: `linear-gradient(135deg, ${C.sky}, ${C.sageLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🌸</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{b.name}</p>
                {b.nameJa && <p style={{ fontSize: 11, color: C.barkLight, margin: '1px 0 0' }}>{b.nameJa}</p>}
                <p style={{ fontSize: 11, color: C.barkLight, margin: '3px 0 0' }}>📍 {b.address}</p>
                <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>
                  Check-in {fmtDate(b.checkIn)} {b.checkIn?.toDate?.()?.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) || ''} ·
                  Check-out {fmtDate(b.checkOut)}
                </p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
              <div style={{ background: C.cream, borderRadius: 12, padding: '8px 12px' }}>
                <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>每人分攤</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.earth, margin: '2px 0 0' }}>NT$ {b.costPerPerson?.toLocaleString()}</p>
              </div>
              <div style={{ background: C.cream, borderRadius: 12, padding: '8px 12px', cursor: 'pointer' }}
                onClick={() => handleReveal(b.id + '_pin')}>
                <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>訂單確認碼</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.earth, margin: '2px 0 0' }}>
                  {revealedItem === b.id + '_pin' ? b.confirmCode : '🔒 點擊查看'}
                </p>
              </div>
            </div>
            {b.notes && <p style={{ fontSize: 11, color: C.barkLight, margin: '10px 0 0', fontStyle: 'italic' }}>💡 {b.notes}</p>}
            {b.mapUrl && (
              <a href={b.mapUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: C.sky, fontWeight: 600, textDecoration: 'none' }}>
                🗺 查看地圖
              </a>
            )}
          </div>
        ))}

        {/* ── 租車 ── */}
        {cars.length > 0 && (
          <>
            <SectionTitle>🚗 租車資訊</SectionTitle>
            {cars.map(b => (
              <div key={b.id} style={cardStyle}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: '#FFF2CC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🚗</div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{b.company} · {b.carType}</p>
                    <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>預約：{b.confirmCode}</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[['取車地點', b.pickupLocation], ['還車地點', b.returnLocation],
                    ['取車時間', fmtDate(b.pickupTime)], ['還車時間', fmtDate(b.returnTime)]].map(([l, v]) => (
                    <div key={l} style={{ background: C.cream, borderRadius: 10, padding: '8px 10px' }}>
                      <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>{l}</p>
                      <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '2px 0 0' }}>{v}</p>
                    </div>
                  ))}
                </div>
                {b.notes && <p style={{ fontSize: 11, color: '#9A3A3A', margin: '10px 0 0', fontWeight: 600 }}>⚠️ {b.notes}</p>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
