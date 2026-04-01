import { useState } from 'react';
import { C, FONT, cardStyle } from '../../App';
import PageHeader from '../../components/layout/PageHeader';

// ── QR Code (base64 encoded from ots-qr.png) ──────────
// Falls back to /ots-qr.png in public folder
const QR_SRC = '/ots-qr.png';

// ── Static booking data (hardcoded so it never disappears) ──
const FLIGHTS = [
  {
    id: 'f1', direction: '去程',
    airline: '台灣虎航', flightNo: 'IT 230',
    dep: { airport: 'TPE', name: '台北桃園', time: '06:50' },
    arr: { airport: 'OKA', name: '沖繩那霸', time: '09:20' },
    date: '2026-04-23',
    passengers: ['uu', 'brian'],
    notes: '有加購貴賓室，可提前到機場',
    costPerPerson: null,
  },
  {
    id: 'f2', direction: '回程',
    airline: '樂桃航空', flightNo: 'MM 929',
    dep: { airport: 'OKA', name: '沖繩那霸', time: '16:45' },
    arr: { airport: 'TPE', name: '台北桃園', time: '17:20' },
    date: '2026-04-26',
    passengers: ['uu', 'brian'],
    notes: '',
    costPerPerson: 10017,
  },
];

const HOTELS = [
  {
    id: 'h1',
    name: '雷克沖繩北谷溫泉度假村',
    nameJa: 'レクー沖縄北谷スパ&リゾート',
    address: '沖繩縣中頭郡北谷町字美濱34番地2',
    roomType: '海景雙人房',
    checkIn:  '2026-04-23  14:00',
    checkOut: '2026-04-24  11:00',
    totalCost: 3943, currency: 'TWD', costPerPerson: 1971.5,
    confirmCode: '1616327200916576', pin: '5983',
    notes: '緊鄰美國村，步行可達沖繩海灘，設有天然溫泉及高空無邊際泳池',
    mapUrl: 'https://share.google/c6eO7mgX4n2TkEvg9',
  },
  {
    id: 'h2',
    name: '沖繩逸之彩飯店',
    nameJa: '沖縄逸の彩 温泉リゾートホテル',
    address: '沖繩縣那霸市牧志3丁目18番33號',
    roomType: '大床房',
    checkIn:  '2026-04-24  15:00',
    checkOut: '2026-04-26  11:00',
    totalCost: 6929, currency: 'TWD', costPerPerson: 3464.5,
    confirmCode: '1616327200935988', pin: '5762',
    notes: '設有露天溫泉、游泳池，提供免費宵夜拉麵、飲料與啤酒暢飲',
    mapUrl: 'https://share.google/uFxCdkeWJ0tBQoViF',
  },
];

const CAR = {
  company: 'OTS', carType: 'S級別 1台',
  pickupLocation: '臨空豐崎營業所（那霸機場）', pickupTime: '2026-04-23  11:00',
  returnLocation: '臨空豐崎營業所（那霸機場）', returnTime: '2026-04-26  13:30',
  totalCost: 26290, currency: 'JPY',
  confirmCode: 'OTS1402455',
  notes: '需國際駕照、日文譯本',
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, fontWeight: 700, color: C.barkLight, margin: '20px 0 8px', letterSpacing: 1 }}>{children}</p>;
}

export default function BookingsPage({ bookings: _b }: { bookings: any[] }) {
  const [showQR, setShowQR] = useState(false);
  const [qrErr, setQrErr]   = useState(false);

  return (
    <div style={{ fontFamily: FONT }}>
      <PageHeader title="旅行預訂" subtitle="機票 · 住宿 · 租車" emoji="✈️" color={C.sky} />

      <div style={{ padding: '8px 16px 80px' }}>

        {/* ── 航班 ── */}
        <SectionTitle>✈️ 航班資訊</SectionTitle>
        {FLIGHTS.map(f => (
          <div key={f.id} style={{ borderRadius: 24, overflow: 'hidden', boxShadow: C.shadow, marginBottom: 14 }}>
            {/* 頂部彩色帶 */}
            <div style={{ background: `linear-gradient(135deg, ${C.sageDark}, ${C.sage})`, padding: '16px 20px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{f.airline}　{f.flightNo}</span>
                <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: 20, padding: '2px 10px' }}>{f.direction}　{f.date}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'white' }}>
                {/* 出發 */}
                <div style={{ textAlign: 'center', minWidth: 68 }}>
                  <p style={{ fontSize: 28, fontWeight: 900, margin: 0, lineHeight: 1 }}>{f.dep.airport}</p>
                  <p style={{ fontSize: 10, opacity: 0.8, margin: '3px 0 0' }}>{f.dep.name}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 0' }}>{f.dep.time}</p>
                </div>
                {/* 中間箭頭 */}
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ borderTop: '2px dashed rgba(255,255,255,0.5)', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', fontSize: 18 }}>✈️</span>
                  </div>
                </div>
                {/* 抵達 */}
                <div style={{ textAlign: 'center', minWidth: 68 }}>
                  <p style={{ fontSize: 28, fontWeight: 900, margin: 0, lineHeight: 1 }}>{f.arr.airport}</p>
                  <p style={{ fontSize: 10, opacity: 0.8, margin: '3px 0 0' }}>{f.arr.name}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 0' }}>{f.arr.time}</p>
                </div>
              </div>
            </div>
            {/* 撕票線 */}
            <div style={{ height: 1, background: 'repeating-linear-gradient(90deg,#E0D9C8 0,#E0D9C8 8px,transparent 8px,transparent 16px)', margin: '0 16px' }} />
            {/* 下半部 */}
            <div style={{ background: 'var(--tm-card-bg)', padding: '10px 18px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>乘客</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '2px 0 0' }}>{f.passengers.join('、')}</p>
                </div>
                {f.costPerPerson && (
                  <div>
                    <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>每人票價</p>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.earth, margin: '2px 0 0' }}>NT$ {f.costPerPerson.toLocaleString()}</p>
                  </div>
                )}
              </div>
              {f.notes && <p style={{ fontSize: 11, color: C.barkLight, margin: '8px 0 0', fontStyle: 'italic' }}>💡 {f.notes}</p>}
            </div>
          </div>
        ))}

        {/* ── 住宿 ── */}
        <SectionTitle>🏨 住宿安排</SectionTitle>
        {HOTELS.map(h => (
          <div key={h.id} style={{ ...cardStyle }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 50, height: 50, borderRadius: 16, background: `linear-gradient(135deg,${C.sky},${C.sageLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🌸</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{h.name}</p>
                <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>{h.nameJa}</p>
                <p style={{ fontSize: 10, color: C.barkLight, margin: '3px 0 0' }}>📍 {h.address}</p>
              </div>
            </div>

            {/* Check-in / Check-out */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div style={{ background: '#EAF8E6', borderRadius: 12, padding: '8px 10px' }}>
                <p style={{ fontSize: 10, color: '#4A7A35', fontWeight: 700, margin: 0 }}>📥 Check-in</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '3px 0 0' }}>{h.checkIn}</p>
              </div>
              <div style={{ background: '#FFF2E6', borderRadius: 12, padding: '8px 10px' }}>
                <p style={{ fontSize: 10, color: '#9A5A00', fontWeight: 700, margin: 0 }}>📤 Check-out</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '3px 0 0' }}>{h.checkOut}</p>
              </div>
            </div>

            {/* 費用 + 訂單 + PIN */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
              <div style={{ background: C.cream, borderRadius: 12, padding: '7px 8px' }}>
                <p style={{ fontSize: 9, color: C.barkLight, margin: 0 }}>每人分攤</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.earth, margin: '2px 0 0' }}>NT$ {h.costPerPerson.toLocaleString()}</p>
              </div>
              <div style={{ background: '#FFF8E1', borderRadius: 12, padding: '7px 8px' }}>
                <p style={{ fontSize: 9, color: C.barkLight, margin: 0 }}>訂單編號</p>
                <p style={{ fontSize: 10, fontWeight: 700, color: C.bark, margin: '2px 0 0', wordBreak: 'break-all' }}>{h.confirmCode}</p>
              </div>
              <div style={{ background: '#FFEBEB', borderRadius: 12, padding: '7px 8px' }}>
                <p style={{ fontSize: 9, color: C.barkLight, margin: 0 }}>PIN 碼</p>
                <p style={{ fontSize: 16, fontWeight: 900, color: '#C0392B', margin: '2px 0 0', letterSpacing: 2 }}>{h.pin}</p>
              </div>
            </div>

            {h.notes && <p style={{ fontSize: 11, color: C.barkLight, fontStyle: 'italic', margin: '4px 0 6px' }}>💡 {h.notes}</p>}
            {h.mapUrl && (
              <a href={h.mapUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: C.sky, fontWeight: 600, textDecoration: 'none' }}>
                🗺 查看地圖
              </a>
            )}
          </div>
        ))}

        {/* ── 租車 ── */}
        <SectionTitle>🚗 租車資訊</SectionTitle>
        <div style={cardStyle}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: '#FFF2CC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🚗</div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{CAR.company}　{CAR.carType}</p>
              <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>預約編號：{CAR.confirmCode}</p>
            </div>
          </div>

          {/* 取還車時間 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div style={{ background: '#EAF8E6', borderRadius: 12, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: '#4A7A35', fontWeight: 700, margin: '0 0 4px' }}>🟢 取車</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: 0 }}>{CAR.pickupLocation}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.earth, margin: '4px 0 0' }}>{CAR.pickupTime}</p>
            </div>
            <div style={{ background: '#FFEBEB', borderRadius: 12, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: '#9A3A3A', fontWeight: 700, margin: '0 0 4px' }}>🔴 還車</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: 0 }}>{CAR.returnLocation}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.earth, margin: '4px 0 0' }}>{CAR.returnTime}</p>
            </div>
          </div>

          {/* 費用 */}
          <div style={{ background: '#FFF8E1', borderRadius: 12, padding: '8px 14px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: C.barkLight }}>費用</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.earth }}>¥ {CAR.totalCost.toLocaleString()}</span>
          </div>

          <p style={{ fontSize: 11, color: '#9A3A3A', fontWeight: 600, margin: '0 0 10px' }}>⚠️ {CAR.notes}</p>

          {/* QR Code 展開按鈕 */}
          <button
            onClick={() => setShowQR(v => !v)}
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 12,
              border: `1.5px solid ${showQR ? C.sageDark : C.creamDark}`,
              background: showQR ? C.sage : 'var(--tm-card-bg)',
              color: showQR ? 'white' : C.bark,
              fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.2s',
            }}
          >
            <span>{showQR ? '▲' : '▼'}</span>
            {showQR ? '收起 QR Code' : '📱 展開報到 QR Code'}
          </button>

          {showQR && (
            <div style={{ marginTop: 12, padding: 16, background: 'var(--tm-card-bg)', borderRadius: 14, border: `1.5px solid ${C.creamDark}`, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 12px', fontWeight: 600 }}>OTS 取車報到 QR Code</p>
              {!qrErr ? (
                <img
                  src={QR_SRC}
                  alt="OTS QR Code"
                  style={{ width: 200, height: 200, imageRendering: 'pixelated' }}
                  onError={() => setQrErr(true)}
                />
              ) : (
                <div style={{ padding: '20px 16px', background: '#FAE0E0', borderRadius: 10 }}>
                  <p style={{ fontSize: 12, color: '#9A3A3A', margin: 0, fontWeight: 600 }}>QR Code 圖片未找到</p>
                  <p style={{ fontSize: 11, color: C.barkLight, margin: '4px 0 0' }}>請將圖片命名為 ots-qr.png<br/>放入 public/ 資料夾</p>
                </div>
              )}
              <p style={{ fontSize: 10, color: C.barkLight, margin: '10px 0 0' }}>OTS1402455　臨空豐崎營業所</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
