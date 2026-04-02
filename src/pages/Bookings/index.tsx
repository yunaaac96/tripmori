import { useState, useRef } from 'react';
import { C, FONT, cardStyle } from '../../App';
import PageHeader from '../../components/layout/PageHeader';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

// ── QR Code for OTS car rental ──────────────────────────
const QR_SRC = '/ots-qr.png';

// ── Static booking data ──────────────────────────────────
const FLIGHTS = [
  {
    id: 'f1', direction: '去程',
    airline: '台灣虎航', flightNo: 'IT 230',
    dep: { airport: 'TPE', name: '台北桃園', time: '06:50' },
    arr: { airport: 'OKA', name: '沖繩那霸', time: '09:20' },
    date: '2026-04-23',
    notes: '有加購貴賓室，可提前到機場',
    costPerPerson: null,
  },
  {
    id: 'f2', direction: '回程',
    airline: '樂桃航空', flightNo: 'MM 929',
    dep: { airport: 'OKA', name: '沖繩那霸', time: '16:45' },
    arr: { airport: 'TPE', name: '台北桃園', time: '17:20' },
    date: '2026-04-26',
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

// ── Custom booking types ─────────────────────────────────
const BOOKING_TYPES: Record<string, { emoji: string; label: string; bg: string; color: string }> = {
  activity:  { emoji: '🎡', label: '景點/活動', bg: '#E0F0D8', color: '#4A7A35' },
  transport: { emoji: '🚌', label: '交通票券', bg: '#D8EDF8', color: '#2A6A9A' },
  show:      { emoji: '🎭', label: '表演/票券', bg: '#F0E8FF', color: '#6A3A9A' },
  ferry:     { emoji: '🛥', label: '船票/渡輪', bg: '#E0F4F8', color: '#2A7A8A' },
  other:     { emoji: '📦', label: '其他',      bg: '#F0F0F0', color: '#6A6A6A' },
};

const EMPTY_FORM = {
  title: '', type: 'activity', confirmCode: '',
  notes: '', date: '', cost: '', currency: 'JPY', qrUrl: '',
};

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 8px' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: C.barkLight, margin: 0, letterSpacing: 1 }}>{children}</p>
      {action}
    </div>
  );
}

export default function BookingsPage({ bookings, firestore }: { bookings: any[]; firestore?: any }) {
  const { db, TRIP_ID, Timestamp, addDoc, deleteDoc, collection, doc, isReadOnly } = firestore || {};

  // OTS car QR
  const [showCarQR, setShowCarQR] = useState(false);
  const [carQrErr, setCarQrErr]   = useState(false);

  // Custom bookings
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showQrFor, setShowQrFor] = useState<string | null>(null);
  const [deleting, setDeleting]   = useState<string | null>(null);

  const qrFileRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleUploadQR = async (file: File) => {
    if (!TRIP_ID) return;
    setUploading(true);
    try {
      const storage = getStorage();
      const path = `bookings/${TRIP_ID}/${Date.now()}_qr`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      set('qrUrl', url);
    } catch (e) { console.error(e); alert('QR Code 上傳失敗'); }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !addDoc || !TRIP_ID) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'trips', TRIP_ID, 'bookings'), {
        title: form.title.trim(),
        type: form.type,
        confirmCode: form.confirmCode.trim(),
        notes: form.notes.trim(),
        date: form.date,
        cost: form.cost ? parseFloat(form.cost) : null,
        currency: form.currency,
        qrUrl: form.qrUrl,
        createdAt: Timestamp.now(),
      });
      setForm({ ...EMPTY_FORM });
      setShowAdd(false);
    } catch (e) { console.error(e); alert('新增失敗，請重試'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('確定要刪除這筆預訂？')) return;
    setDeleting(id);
    try { await deleteDoc(doc(db, 'trips', TRIP_ID, 'bookings', id)); }
    catch (e) { console.error(e); }
    setDeleting(null);
  };

  const sortedBookings = [...(bookings || [])].sort((a, b) =>
    (a.date || '').localeCompare(b.date || '')
  );

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
                <div style={{ textAlign: 'center', minWidth: 68 }}>
                  <p style={{ fontSize: 28, fontWeight: 900, margin: 0, lineHeight: 1 }}>{f.dep.airport}</p>
                  <p style={{ fontSize: 10, opacity: 0.8, margin: '3px 0 0' }}>{f.dep.name}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 0' }}>{f.dep.time}</p>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ borderTop: '2px dashed rgba(255,255,255,0.5)', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', fontSize: 18 }}>✈️</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center', minWidth: 68 }}>
                  <p style={{ fontSize: 28, fontWeight: 900, margin: 0, lineHeight: 1 }}>{f.arr.airport}</p>
                  <p style={{ fontSize: 10, opacity: 0.8, margin: '3px 0 0' }}>{f.arr.name}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 0' }}>{f.arr.time}</p>
                </div>
              </div>
            </div>
            {/* 撕票線 */}
            <div style={{ height: 1, background: 'repeating-linear-gradient(90deg,#E0D9C8 0,#E0D9C8 8px,transparent 8px,transparent 16px)', margin: '0 16px' }} />
            {/* 下半部（移除乘客區塊） */}
            <div style={{ background: 'var(--tm-card-bg)', padding: '10px 18px 14px' }}>
              {f.costPerPerson && (
                <div style={{ marginBottom: 6 }}>
                  <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>每人票價</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.earth, margin: '2px 0 0' }}>NT$ {f.costPerPerson.toLocaleString()}</p>
                </div>
              )}
              {f.notes && <p style={{ fontSize: 11, color: C.barkLight, margin: '4px 0 0', fontStyle: 'italic' }}>💡 {f.notes}</p>}
            </div>
          </div>
        ))}

        {/* ── 住宿 ── */}
        <SectionTitle>🏨 住宿安排</SectionTitle>
        {HOTELS.map(h => (
          <div key={h.id} style={{ ...cardStyle, textAlign: 'left' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 50, height: 50, borderRadius: 16, background: `linear-gradient(135deg,${C.sky},${C.sageLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🌸</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{h.name}</p>
                <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>{h.nameJa}</p>
                <p style={{ fontSize: 10, color: C.barkLight, margin: '3px 0 0' }}>📍 {h.address}</p>
              </div>
            </div>
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
          <div style={{ background: '#FFF8E1', borderRadius: 12, padding: '8px 14px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: C.barkLight }}>費用</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.earth }}>¥ {CAR.totalCost.toLocaleString()}</span>
          </div>
          <p style={{ fontSize: 11, color: '#9A3A3A', fontWeight: 600, margin: '0 0 10px' }}>⚠️ {CAR.notes}</p>
          <button onClick={() => setShowCarQR(v => !v)}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1.5px solid ${showCarQR ? C.sageDark : C.creamDark}`, background: showCarQR ? C.sage : 'var(--tm-card-bg)', color: showCarQR ? 'white' : C.bark, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s' }}>
            <span>{showCarQR ? '▲' : '▼'}</span>
            {showCarQR ? '收起 QR Code' : '📱 展開報到 QR Code'}
          </button>
          {showCarQR && (
            <div style={{ marginTop: 12, padding: 16, background: 'var(--tm-card-bg)', borderRadius: 14, border: `1.5px solid ${C.creamDark}`, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 12px', fontWeight: 600 }}>OTS 取車報到 QR Code</p>
              {!carQrErr ? (
                <img src={QR_SRC} alt="OTS QR Code" style={{ width: 200, height: 200, imageRendering: 'pixelated' }} onError={() => setCarQrErr(true)} />
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

        {/* ── 其他預訂（動態，來自 Firestore）── */}
        <SectionTitle action={
          !isReadOnly && (
            <button onClick={() => setShowAdd(true)}
              style={{ fontSize: 12, fontWeight: 700, color: 'white', background: C.earth, border: 'none', borderRadius: 10, padding: '5px 12px', cursor: 'pointer', fontFamily: FONT }}>
              ＋ 新增
            </button>
          )
        }>
          📋 其他預訂
        </SectionTitle>

        {sortedBookings.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0 8px', color: C.barkLight }}>
            <p style={{ fontSize: 13, margin: '0 0 4px' }}>尚無其他預訂</p>
            {!isReadOnly && <p style={{ fontSize: 11, margin: 0 }}>點擊右上角「＋ 新增」加入行程相關預訂</p>}
          </div>
        )}

        {sortedBookings.map(b => {
          const typeInfo = BOOKING_TYPES[b.type] || BOOKING_TYPES.other;
          const isQrOpen = showQrFor === b.id;
          return (
            <div key={b.id} style={{ ...cardStyle, textAlign: 'left' }}>
              {/* Header */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                <div style={{ width: 46, height: 46, borderRadius: 14, background: typeInfo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                  {typeInfo.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{b.title}</p>
                  <span style={{ fontSize: 10, fontWeight: 700, color: typeInfo.color, background: typeInfo.bg, borderRadius: 6, padding: '1px 6px' }}>{typeInfo.label}</span>
                </div>
                {!isReadOnly && (
                  <button onClick={() => handleDelete(b.id)} disabled={deleting === b.id}
                    style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: '#FAE0E0', border: 'none', color: '#9A3A3A', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: deleting === b.id ? 0.5 : 1 }}>
                    🗑
                  </button>
                )}
              </div>

              {/* Info chips */}
              {(b.date || b.confirmCode || b.cost) && (
                <div style={{ display: 'grid', gridTemplateColumns: [b.date, b.confirmCode, b.cost].filter(Boolean).length === 1 ? '1fr' : [b.date, b.confirmCode, b.cost].filter(Boolean).length === 2 ? '1fr 1fr' : '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                  {b.date && (
                    <div style={{ background: '#EAF8E6', borderRadius: 12, padding: '7px 10px' }}>
                      <p style={{ fontSize: 9, color: '#4A7A35', fontWeight: 700, margin: 0 }}>📅 日期</p>
                      <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '2px 0 0' }}>{b.date}</p>
                    </div>
                  )}
                  {b.confirmCode && (
                    <div style={{ background: '#FFF8E1', borderRadius: 12, padding: '7px 10px' }}>
                      <p style={{ fontSize: 9, color: C.barkLight, fontWeight: 700, margin: 0 }}>訂單編號</p>
                      <p style={{ fontSize: 11, fontWeight: 700, color: C.bark, margin: '2px 0 0', wordBreak: 'break-all' }}>{b.confirmCode}</p>
                    </div>
                  )}
                  {b.cost && (
                    <div style={{ background: C.cream, borderRadius: 12, padding: '7px 10px' }}>
                      <p style={{ fontSize: 9, color: C.barkLight, fontWeight: 700, margin: 0 }}>費用</p>
                      <p style={{ fontSize: 12, fontWeight: 700, color: C.earth, margin: '2px 0 0' }}>
                        {b.currency === 'TWD' ? 'NT$' : b.currency === 'USD' ? '$' : '¥'} {Number(b.cost).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {b.notes && <p style={{ fontSize: 11, color: C.barkLight, fontStyle: 'italic', margin: '0 0 8px' }}>💡 {b.notes}</p>}

              {/* QR Code toggle */}
              {b.qrUrl && (
                <>
                  <button onClick={() => setShowQrFor(isQrOpen ? null : b.id)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${isQrOpen ? C.sageDark : C.creamDark}`, background: isQrOpen ? C.sage : 'var(--tm-card-bg)', color: isQrOpen ? 'white' : C.bark, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 }}>
                    <span>{isQrOpen ? '▲' : '▼'}</span>
                    {isQrOpen ? '收起 QR Code' : '📱 展開 QR Code'}
                  </button>
                  {isQrOpen && (
                    <div style={{ marginTop: 10, padding: 16, background: 'var(--tm-card-bg)', borderRadius: 14, border: `1.5px solid ${C.creamDark}`, textAlign: 'center' }}>
                      <img src={b.qrUrl} alt="QR Code" style={{ maxWidth: 220, width: '100%', height: 'auto', borderRadius: 8 }} />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

      </div>

      {/* ── 新增預訂 底部面板 ── */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>📋 新增預訂</p>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Type selector */}
              <div>
                <label style={labelSt}>類型</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {Object.entries(BOOKING_TYPES).map(([key, info]) => (
                    <button key={key} onClick={() => set('type', key)}
                      style={{ padding: '9px 10px', borderRadius: 12, border: `2px solid ${form.type === key ? info.color : '#E0D9C8'}`, background: form.type === key ? info.bg : 'var(--tm-card-bg)', color: info.color, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 5 }}>
                      {info.emoji} {info.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label style={labelSt}>預訂名稱 *</label>
                <input style={inputSt} placeholder="例：美麗海水族館門票" value={form.title} onChange={e => set('title', e.target.value)} />
              </div>

              {/* Date */}
              <div>
                <label style={labelSt}>日期（選填）</label>
                <input style={{ ...inputSt, padding: '10px 8px' }} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
              </div>

              {/* Confirm code */}
              <div>
                <label style={labelSt}>訂單編號（選填）</label>
                <input style={inputSt} placeholder="預訂確認碼" value={form.confirmCode} onChange={e => set('confirmCode', e.target.value)} />
              </div>

              {/* Cost */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 90, flexShrink: 0 }}>
                  <label style={labelSt}>幣別</label>
                  <select style={{ ...inputSt, padding: '10px 8px' }} value={form.currency} onChange={e => set('currency', e.target.value)}>
                    <option value="JPY">JPY ¥</option>
                    <option value="TWD">TWD NT$</option>
                    <option value="USD">USD $</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelSt}>費用（選填）</label>
                  <input style={inputSt} type="number" placeholder="0" value={form.cost} onChange={e => set('cost', e.target.value)} />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label style={labelSt}>備註（選填）</label>
                <textarea style={{ ...inputSt, minHeight: 60, resize: 'vertical' as const, lineHeight: 1.6 }} placeholder="注意事項、兌換說明..." value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>

              {/* QR Code upload */}
              <div>
                <label style={labelSt}>QR Code（選填）</label>
                <input ref={qrFileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    if (f) await handleUploadQR(f);
                    e.target.value = '';
                  }} />
                {form.qrUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)' }}>
                    <img src={form.qrUrl} alt="QR" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'contain', border: `1px solid ${C.creamDark}` }} />
                    <div>
                      <p style={{ fontSize: 11, color: '#4A7A35', fontWeight: 700, margin: 0 }}>✓ QR Code 已上傳</p>
                      <button onClick={() => set('qrUrl', '')} style={{ fontSize: 11, color: '#9A3A3A', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT, fontWeight: 600, marginTop: 2 }}>✕ 移除</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => qrFileRef.current?.click()} disabled={uploading}
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `2px dashed ${C.creamDark}`, background: 'var(--tm-card-bg)', color: uploading ? C.sageLight : C.barkLight, fontWeight: 600, fontSize: 13, cursor: uploading ? 'default' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxSizing: 'border-box' }}>
                    {uploading ? '⏳ 上傳中...' : '📱 上傳 QR Code 圖片'}
                  </button>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => { setShowAdd(false); setForm({ ...EMPTY_FORM }); }}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                  取消
                </button>
                <button onClick={handleSave} disabled={saving || !form.title.trim()}
                  style={{ flex: 2, padding: 12, borderRadius: 12, border: 'none', background: C.earth, color: 'white', fontWeight: 700, fontSize: 14, cursor: saving || !form.title.trim() ? 'default' : 'pointer', fontFamily: FONT, opacity: saving || !form.title.trim() ? 0.6 : 1 }}>
                  {saving ? '儲存中...' : '✓ 新增預訂'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const labelSt: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#8C7B6E', display: 'block', marginBottom: 6 };
const inputSt: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--tm-cream-dark)', background: 'var(--tm-input-bg)', fontSize: 15, color: 'var(--tm-bark)', outline: 'none', fontFamily: "'M PLUS Rounded 1c', 'Noto Sans TC', sans-serif" };
