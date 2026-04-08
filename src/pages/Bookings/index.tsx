import { useState, useRef, useEffect } from 'react';
import { C, FONT, cardStyle } from '../../App';
import PageHeader from '../../components/layout/PageHeader';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDoc } from 'firebase/firestore';

// ── QR Code for OTS car rental ──────────────────────────
const QR_SRC = '/ots-qr.png';

// ── Hardcoded defaults (used if Firestore has no overrides) ──
const DEFAULT_FLIGHTS = [
  {
    id: 'f1', direction: '去程',
    airline: '台灣虎航', flightNo: 'IT 230',
    dep: { airport: 'TPE', name: '台北桃園', time: '06:50' },
    arr: { airport: 'OKA', name: '沖繩那霸', time: '09:20' },
    date: '2026-04-23', notes: '有加購貴賓室，可提前到機場', costPerPerson: '',
  },
  {
    id: 'f2', direction: '回程',
    airline: '樂桃航空', flightNo: 'MM 929',
    dep: { airport: 'OKA', name: '沖繩那霸', time: '16:45' },
    arr: { airport: 'TPE', name: '台北桃園', time: '17:20' },
    date: '2026-04-26', notes: '', costPerPerson: '10017',
  },
];

const DEFAULT_HOTELS = [
  {
    id: 'h1', name: '雷克沖繩北谷溫泉度假村', nameJa: 'レクー沖縄北谷スパ&リゾート',
    address: '沖繩縣中頭郡北谷町字美濱34番地2', roomType: '海景雙人房',
    checkIn: '2026-04-23  14:00', checkOut: '2026-04-24  11:00',
    totalCost: '3943', currency: 'TWD', costPerPerson: '1971.5',
    confirmCode: '1616327200916576', pin: '5983',
    notes: '緊鄰美國村，步行可達沖繩海灘，設有天然溫泉及高空無邊際泳池',
    mapUrl: 'https://share.google/c6eO7mgX4n2TkEvg9',
  },
  {
    id: 'h2', name: '沖繩逸之彩飯店', nameJa: '沖縄逸の彩 温泉リゾートホテル',
    address: '沖繩縣那霸市牧志3丁目18番33號', roomType: '大床房',
    checkIn: '2026-04-24  15:00', checkOut: '2026-04-26  11:00',
    totalCost: '6929', currency: 'TWD', costPerPerson: '3464.5',
    confirmCode: '1616327200935988', pin: '5762',
    notes: '設有露天溫泉、游泳池，提供免費宵夜拉麵、飲料與啤酒暢飲',
    mapUrl: 'https://share.google/uFxCdkeWJ0tBQoViF',
  },
];

const DEFAULT_CAR = {
  company: 'OTS', carType: 'S級別 1台',
  pickupLocation: '臨空豐崎營業所（那霸機場）', pickupTime: '2026-04-23  11:00',
  returnLocation: '臨空豐崎營業所（那霸機場）', returnTime: '2026-04-26  13:30',
  totalCost: '26290', currency: 'JPY', confirmCode: 'OTS1402455',
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

const EMPTY_CUSTOM_FORM = {
  title: '', type: 'activity', confirmCode: '',
  notes: '', date: '', cost: '', currency: 'JPY', qrUrl: '',
};

// ── Helper: Section title with optional action ────────────
function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 8px' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: C.barkLight, margin: 0, letterSpacing: 1 }}>{children}</p>
      {action}
    </div>
  );
}

function EditBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      ✏️
    </button>
  );
}

// ── Main component ───────────────────────────────────────
export default function BookingsPage({ bookings, firestore, project }: { bookings: any[]; firestore?: any; project?: any }) {
  const { db, TRIP_ID, Timestamp, addDoc, updateDoc, deleteDoc, collection, doc, isReadOnly, role } = firestore || {};
  const isOwner   = role === 'owner';
  const isVisitor = isReadOnly; // 訪客：隱藏訂單編號/PIN/費用/QR Code

  // ── Static data state ──
  // null = not yet loaded / new project (show "待更新")
  // [] or array = loaded from Firestore (may be empty)
  // DEFAULT_* = fallback for the hardcoded demo trip only
  const [flights, setFlights] = useState<any[] | null>(null);
  const [hotels,  setHotels]  = useState<any[] | null>(null);
  const [car,     setCar]     = useState<any | null>(null);
  const [staticLoaded, setStaticLoaded] = useState(false);

  useEffect(() => {
    if (!db || !TRIP_ID) return;
    getDoc(doc(db, 'trips', TRIP_ID)).then(snap => {
      if (!snap.exists()) { setStaticLoaded(true); return; }
      const d = snap.data();
      // 若欄位存在（含空陣列）就用 Firestore 資料，否則視為待更新
      setFlights('staticFlights' in d ? d.staticFlights : null);
      setHotels ('staticHotels'  in d ? d.staticHotels  : null);
      setCar    ('staticCar'     in d ? d.staticCar     : null);
      // 舊版預設行程沿用 hardcoded 資料（保持相容）
      if (!('staticFlights' in d) && TRIP_ID === '74pfE7RXyEIusEdRV0rZ') {
        setFlights(DEFAULT_FLIGHTS);
        setHotels (DEFAULT_HOTELS);
        setCar    (DEFAULT_CAR);
      }
      setStaticLoaded(true);
    }).catch(() => setStaticLoaded(true));
  }, [db, TRIP_ID]);

  // ── Static edit modal state ──────────────────────────────
  type EditType = 'flight' | 'hotel' | 'car' | null;
  const [editType,  setEditType]  = useState<EditType>(null);
  const [editIndex, setEditIndex] = useState<number>(0);
  const [editForm,  setEditForm]  = useState<any>({});
  const [staticSaving, setStaticSaving] = useState(false);

  const openEdit = (type: EditType, idx = 0) => {
    setEditType(type);
    setEditIndex(idx);
    if (type === 'flight') setEditForm({ ...flights[idx] });
    if (type === 'hotel')  setEditForm({ ...hotels[idx] });
    if (type === 'car')    setEditForm({ ...car });
  };

  const setF = (key: string, val: any) => setEditForm((p: any) => ({ ...p, [key]: val }));
  const setDep = (key: string, val: string) => setEditForm((p: any) => ({ ...p, dep: { ...p.dep, [key]: val } }));
  const setArr = (key: string, val: string) => setEditForm((p: any) => ({ ...p, arr: { ...p.arr, [key]: val } }));

  const handleStaticSave = async () => {
    if (!updateDoc || !doc || !db || !TRIP_ID) return;
    setStaticSaving(true);
    try {
      if (editType === 'flight') {
        const updated = flights.map((f, i) => i === editIndex ? editForm : f);
        await updateDoc(doc(db, 'trips', TRIP_ID), { staticFlights: updated });
        setFlights(updated);
      } else if (editType === 'hotel') {
        const updated = hotels.map((h, i) => i === editIndex ? editForm : h);
        await updateDoc(doc(db, 'trips', TRIP_ID), { staticHotels: updated });
        setHotels(updated);
      } else if (editType === 'car') {
        await updateDoc(doc(db, 'trips', TRIP_ID), { staticCar: editForm });
        setCar(editForm);
      }
      setEditType(null);
    } catch (e) { console.error(e); alert('儲存失敗，請重試'); }
    setStaticSaving(false);
  };

  // ── Car QR ───────────────────────────────────────────────
  const [showCarQR, setShowCarQR] = useState(false);
  const [carQrErr, setCarQrErr]   = useState(false);

  // ── Custom bookings ──────────────────────────────────────
  const [showAdd, setShowAdd]           = useState(false);
  const [editBookingId, setEditBookingId] = useState<string | null>(null);
  const [customForm, setCustomForm]     = useState({ ...EMPTY_CUSTOM_FORM });
  const [saving, setSaving]             = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [showQrFor, setShowQrFor]       = useState<string | null>(null);
  const [deleting, setDeleting]         = useState<string | null>(null);
  const [toggling, setToggling]         = useState<string | null>(null);

  const qrFileRef = useRef<HTMLInputElement>(null);
  const setC = (k: string, v: string) => setCustomForm(p => ({ ...p, [k]: v }));

  const openEditBooking = (b: any) => {
    setEditBookingId(b.id);
    setCustomForm({
      title: b.title || '', type: b.type || 'activity',
      confirmCode: b.confirmCode || '', notes: b.notes || '',
      date: b.date || '', cost: b.cost ? String(b.cost) : '',
      currency: b.currency || 'JPY', qrUrl: b.qrUrl || '',
    });
    setShowAdd(true);
  };

  const closeCustomForm = () => {
    setShowAdd(false); setEditBookingId(null); setCustomForm({ ...EMPTY_CUSTOM_FORM });
  };

  const handleToggleUsed = async (b: any) => {
    if (!updateDoc || !doc || !db || !TRIP_ID) return;
    setToggling(b.id);
    try { await updateDoc(doc(db, 'trips', TRIP_ID, 'bookings', b.id), { used: !b.used }); }
    catch (e) { console.error(e); }
    setToggling(null);
  };

  const handleMoveOrder = async (b: any, dir: 'up' | 'down', sortedList: any[]) => {
    if (!updateDoc || !doc || !db || !TRIP_ID) return;
    const idx = sortedList.findIndex((x: any) => x.id === b.id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sortedList.length) return;
    const swapItem = sortedList[swapIdx];
    const bOrder   = b.sortOrder        ?? (b.createdAt?.toMillis?.()        || 0);
    const swpOrder = swapItem.sortOrder ?? (swapItem.createdAt?.toMillis?.() || 0);
    try {
      await updateDoc(doc(db, 'trips', TRIP_ID, 'bookings', b.id),        { sortOrder: swpOrder });
      await updateDoc(doc(db, 'trips', TRIP_ID, 'bookings', swapItem.id), { sortOrder: bOrder });
    } catch (e) { console.error(e); }
  };

  const handleUploadQR = async (file: File) => {
    if (!TRIP_ID) return;
    setUploading(true);
    try {
      const storage = getStorage();
      const sRef = storageRef(storage, `bookings/${TRIP_ID}/${Date.now()}_qr`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      setC('qrUrl', url);
    } catch (e) { console.error(e); alert('QR Code 上傳失敗'); }
    setUploading(false);
  };

  const handleCustomSave = async () => {
    if (!customForm.title.trim() || !TRIP_ID) return;
    setSaving(true);
    const payload = {
      title: customForm.title.trim(), type: customForm.type,
      confirmCode: customForm.confirmCode.trim(), notes: customForm.notes.trim(),
      date: customForm.date, cost: customForm.cost ? parseFloat(customForm.cost) : null,
      currency: customForm.currency, qrUrl: customForm.qrUrl,
    };
    try {
      if (editBookingId && updateDoc && doc) {
        await updateDoc(doc(db, 'trips', TRIP_ID, 'bookings', editBookingId), payload);
      } else if (addDoc) {
        await addDoc(collection(db, 'trips', TRIP_ID, 'bookings'), {
          ...payload, createdAt: Timestamp.now(), sortOrder: Date.now(),
        });
      }
      closeCustomForm();
    } catch (e) { console.error(e); alert('儲存失敗，請重試'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('確定要刪除這筆預訂？')) return;
    setDeleting(id);
    try { await deleteDoc(doc(db, 'trips', TRIP_ID, 'bookings', id)); }
    catch (e) { console.error(e); }
    setDeleting(null);
  };

  const sortedBookings = [...(bookings || [])].sort((a: any, b: any) => {
    const ao = a.sortOrder ?? (a.createdAt?.toMillis?.() || 0);
    const bo = b.sortOrder ?? (b.createdAt?.toMillis?.() || 0);
    return ao - bo;
  });

  return (
    <div style={{ fontFamily: FONT }}>
      <PageHeader title="旅行預訂" subtitle="機票・住宿・租車・票券" emoji="✈️" color={C.sky} />

      <div style={{ padding: '8px 16px 80px' }}>

        {/* ── 航班 ── */}
        <SectionTitle>✈️ 航班資訊</SectionTitle>
        {!staticLoaded ? null : flights === null || flights.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '24px 16px' }}>
            <p style={{ fontSize: 28, margin: '0 0 8px' }}>✈️</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: '0 0 4px' }}>航班資訊待更新</p>
            <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>擁有者可點擊右上方 ✏️ 填入航班資料</p>
            {!isReadOnly && (
              <button onClick={() => { setEditType('flight'); setEditIndex(0); setEditForm({ id: 'f1', direction: '去程', airline: '', flightNo: '', dep: { airport: '', name: '', time: '' }, arr: { airport: '', name: '', time: '' }, date: '', notes: '', costPerPerson: '' }); }}
                style={{ marginTop: 12, padding: '8px 20px', borderRadius: 12, border: 'none', background: C.sage, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                ＋ 新增航班
              </button>
            )}
          </div>
        ) : (flights || []).map((f, idx) => (
          <div key={f.id || idx} style={{ borderRadius: 24, overflow: 'hidden', boxShadow: C.shadow, marginBottom: 14 }}>
            <div style={{ background: `linear-gradient(135deg, ${C.sageDark}, ${C.sage})`, padding: '16px 20px 20px', position: 'relative' }}>
              {!isReadOnly && (
                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                  <button onClick={() => openEdit('flight', idx)}
                    style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.25)', color: 'white', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    ✏️
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingRight: !isReadOnly ? 36 : 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{f.airline}　{f.flightNo}</span>
                <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: 20, padding: '2px 10px' }}>{f.direction}　{f.date}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'white' }}>
                <div style={{ textAlign: 'center', minWidth: 68 }}>
                  <p style={{ fontSize: 28, fontWeight: 900, margin: 0, lineHeight: 1 }}>{f.dep?.airport}</p>
                  <p style={{ fontSize: 10, opacity: 0.8, margin: '3px 0 0' }}>{f.dep?.name}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 0' }}>{f.dep?.time}</p>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ borderTop: '2px dashed rgba(255,255,255,0.5)', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', fontSize: 18 }}>✈️</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center', minWidth: 68 }}>
                  <p style={{ fontSize: 28, fontWeight: 900, margin: 0, lineHeight: 1 }}>{f.arr?.airport}</p>
                  <p style={{ fontSize: 10, opacity: 0.8, margin: '3px 0 0' }}>{f.arr?.name}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 0' }}>{f.arr?.time}</p>
                </div>
              </div>
            </div>
            <div style={{ height: 1, background: 'repeating-linear-gradient(90deg,#E0D9C8 0,#E0D9C8 8px,transparent 8px,transparent 16px)', margin: '0 16px' }} />
            {f.notes && (
              <div style={{ background: 'var(--tm-card-bg)', padding: '10px 18px 14px' }}>
                <p style={{ fontSize: 11, color: C.barkLight, margin: 0, fontStyle: 'italic' }}>💡 {f.notes}</p>
              </div>
            )}
          </div>
        ))}

        {/* ── 住宿 ── */}
        <SectionTitle>🏨 住宿安排</SectionTitle>
        {!staticLoaded ? null : hotels === null || hotels.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '24px 16px' }}>
            <p style={{ fontSize: 28, margin: '0 0 8px' }}>🏨</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: '0 0 4px' }}>住宿安排待更新</p>
            <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>擁有者可點擊 ✏️ 填入訂房資訊</p>
            {!isReadOnly && (
              <button onClick={() => { setEditType('hotel'); setEditIndex(0); setEditForm({ id: 'h1', name: '', nameJa: '', address: '', roomType: '', checkIn: '', checkOut: '', totalCost: '', currency: project?.currency || 'JPY', costPerPerson: '', confirmCode: '', pin: '', notes: '', mapUrl: '' }); }}
                style={{ marginTop: 12, padding: '8px 20px', borderRadius: 12, border: 'none', background: C.earth, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                ＋ 新增住宿
              </button>
            )}
          </div>
        ) : (hotels || []).map((h, idx) => (
          <div key={h.id || idx} style={{ ...cardStyle, textAlign: 'left' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 50, height: 50, borderRadius: 16, background: `linear-gradient(135deg,${C.sky},${C.sageLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🌸</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{h.name}</p>
                <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>{h.nameJa}</p>
                <p style={{ fontSize: 10, color: C.barkLight, margin: '3px 0 0' }}>📍 {h.address}</p>
              </div>
              {!isReadOnly && <EditBtn onClick={() => openEdit('hotel', idx)} />}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div className="tm-booking-checkin" style={{ background: '#EAF8E6', borderRadius: 12, padding: '8px 10px' }}>
                <p style={{ fontSize: 10, color: '#4A7A35', fontWeight: 700, margin: 0 }}>📥 Check-in</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '3px 0 0' }}>{h.checkIn}</p>
              </div>
              <div className="tm-booking-checkout" style={{ background: '#FFF2E6', borderRadius: 12, padding: '8px 10px' }}>
                <p style={{ fontSize: 10, color: '#9A5A00', fontWeight: 700, margin: 0 }}>📤 Check-out</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '3px 0 0' }}>{h.checkOut}</p>
              </div>
            </div>
            {isVisitor ? (
              <div className="tm-booking-lock" style={{ background: '#F5F5F5', borderRadius: 12, padding: '9px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>🔒</span>
                <span style={{ fontSize: 11, color: C.barkLight, fontWeight: 600 }}>訂單詳細資訊僅旅伴可查看</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                <div className="tm-booking-order" style={{ background: '#FFF8E1', borderRadius: 12, padding: '7px 10px' }}>
                  <p style={{ fontSize: 9, color: C.barkLight, margin: 0 }}>訂單編號</p>
                  <p style={{ fontSize: 10, fontWeight: 700, color: C.bark, margin: '2px 0 0', wordBreak: 'break-all' }}>{h.confirmCode}</p>
                </div>
                <div className="tm-booking-pin" style={{ background: '#FFEBEB', borderRadius: 12, padding: '7px 10px' }}>
                  <p style={{ fontSize: 9, color: C.barkLight, margin: 0 }}>PIN 碼</p>
                  <p style={{ fontSize: 16, fontWeight: 900, color: '#C0392B', margin: '2px 0 0', letterSpacing: 2 }}>{h.pin}</p>
                </div>
              </div>
            )}
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
        {!staticLoaded ? null : car === null ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '24px 16px' }}>
            <p style={{ fontSize: 28, margin: '0 0 8px' }}>🚗</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: '0 0 4px' }}>此行程未安排租車</p>
            <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>如有租車需求，擁有者可點擊下方按鈕新增</p>
            {!isReadOnly && (
              <button onClick={() => { setEditType('car'); setEditForm({ company: '', carType: '', pickupLocation: '', pickupTime: '', returnLocation: '', returnTime: '', totalCost: '', currency: 'JPY', confirmCode: '', notes: '' }); }}
                style={{ marginTop: 12, padding: '8px 20px', borderRadius: 12, border: 'none', background: '#FFC107', color: '#333', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                ＋ 新增租車
              </button>
            )}
          </div>
        ) : (
        <div style={cardStyle}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: '#FFF2CC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🚗</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{car.company}　{car.carType}</p>
              {!isVisitor && <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>預約編號：{car.confirmCode}</p>}
            </div>
            {!isReadOnly && <EditBtn onClick={() => openEdit('car')} />}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div className="tm-booking-pickup" style={{ background: '#EAF8E6', borderRadius: 12, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: '#4A7A35', fontWeight: 700, margin: '0 0 4px' }}>🟢 取車</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: 0 }}>{car.pickupLocation}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.earth, margin: '4px 0 0' }}>{car.pickupTime}</p>
            </div>
            <div className="tm-booking-return" style={{ background: '#FFEBEB', borderRadius: 12, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: '#9A3A3A', fontWeight: 700, margin: '0 0 4px' }}>🔴 還車</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: 0 }}>{car.returnLocation}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.earth, margin: '4px 0 0' }}>{car.returnTime}</p>
            </div>
          </div>
          {isVisitor ? (
            <div className="tm-booking-lock" style={{ background: '#F5F5F5', borderRadius: 12, padding: '9px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>🔒</span>
              <span style={{ fontSize: 11, color: C.barkLight, fontWeight: 600 }}>費用與訂單詳情僅旅伴可查看</span>
            </div>
          ) : (
            <div className="tm-booking-cost" style={{ background: '#FFF8E1', borderRadius: 12, padding: '8px 14px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.barkLight }}>費用</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.earth }}>
                {car.currency === 'JPY' ? '¥' : 'NT$'} {Number(car.totalCost).toLocaleString()}
              </span>
            </div>
          )}
          <p style={{ fontSize: 11, color: '#9A3A3A', fontWeight: 600, margin: '0 0 10px' }}>⚠️ {car.notes}</p>
          {!isVisitor && (
            <>
              <button onClick={() => setShowCarQR(v => !v)}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1.5px solid ${showCarQR ? C.sageDark : C.creamDark}`, background: showCarQR ? C.sage : 'var(--tm-card-bg)', color: showCarQR ? 'white' : C.bark, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span>{showCarQR ? '▲' : '▼'}</span>
                {showCarQR ? '收起 QR Code' : '📱 展開報到 QR Code'}
              </button>
              {showCarQR && (
                <div style={{ marginTop: 12, padding: 16, background: 'var(--tm-card-bg)', borderRadius: 14, border: `1.5px solid ${C.creamDark}`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 12px', fontWeight: 600 }}>OTS 取車報到 QR Code</p>
                  {!carQrErr ? (
                    <img src={QR_SRC} alt="OTS QR Code" style={{ width: 200, height: 200, imageRendering: 'pixelated', display: 'block' }} onError={() => setCarQrErr(true)} />
                  ) : (
                    <div style={{ padding: '20px 16px', background: '#FAE0E0', borderRadius: 10 }}>
                      <p style={{ fontSize: 12, color: '#9A3A3A', margin: 0, fontWeight: 600 }}>QR Code 圖片未找到</p>
                      <p style={{ fontSize: 11, color: C.barkLight, margin: '4px 0 0' }}>請將圖片命名為 ots-qr.png<br/>放入 public/ 資料夾</p>
                    </div>
                  )}
                  <p style={{ fontSize: 10, color: C.barkLight, margin: '10px 0 0' }}>{car.confirmCode}　{car.pickupLocation}</p>
                </div>
              )}
            </>
          )}
        </div>
        )}

        {/* ── 其他預訂（動態）── */}
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

        {sortedBookings.map((b, bIdx) => {
          const typeInfo = BOOKING_TYPES[b.type] || BOOKING_TYPES.other;
          const isQrOpen = showQrFor === b.id;
          return (
            <div key={b.id} style={{ ...cardStyle, textAlign: 'left', opacity: b.used ? 0.72 : 1 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <div style={{ width: 46, height: 46, borderRadius: 14, background: b.used ? '#E0E0E0' : typeInfo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, position: 'relative' }}>
                  {typeInfo.emoji}
                  {b.used && <span style={{ position: 'absolute', bottom: 0, right: 0, fontSize: 10, background: '#4A7A35', color: 'white', borderRadius: 6, padding: '1px 4px', fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0, textDecoration: b.used ? 'line-through' : 'none' }}>{b.title}</p>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: typeInfo.color, background: typeInfo.bg, borderRadius: 6, padding: '1px 6px' }}>{typeInfo.label}</span>
                    {b.used && <span style={{ fontSize: 10, fontWeight: 700, color: '#4A7A35', background: '#E0F0D8', borderRadius: 6, padding: '1px 6px' }}>✅ 已使用</span>}
                  </div>
                </div>
                {!isReadOnly && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => handleMoveOrder(b, 'up', sortedBookings)} disabled={bIdx === 0}
                        style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontSize: 11, cursor: bIdx === 0 ? 'default' : 'pointer', opacity: bIdx === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▲</button>
                      <button onClick={() => handleMoveOrder(b, 'down', sortedBookings)} disabled={bIdx === sortedBookings.length - 1}
                        style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontSize: 11, cursor: bIdx === sortedBookings.length - 1 ? 'default' : 'pointer', opacity: bIdx === sortedBookings.length - 1 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▼</button>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => openEditBooking(b)}
                        style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✏️</button>
                      <button onClick={() => handleDelete(b.id)} disabled={deleting === b.id}
                        style={{ width: 26, height: 26, borderRadius: 6, background: '#FAE0E0', border: 'none', color: '#9A3A3A', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: deleting === b.id ? 0.5 : 1 }}>🗑</button>
                    </div>
                  </div>
                )}
              </div>
              {/* Mark used button */}
              {!isReadOnly && (
                <button onClick={() => handleToggleUsed(b)} disabled={toggling === b.id}
                  style={{ marginBottom: 8, padding: '5px 12px', borderRadius: 10, border: `1.5px solid ${b.used ? '#4A7A35' : C.creamDark}`, background: b.used ? '#E0F0D8' : 'var(--tm-card-bg)', color: b.used ? '#4A7A35' : C.barkLight, fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: FONT }}>
                  {b.used ? '↩ 標記為未使用' : '✅ 標記為已使用'}
                </button>
              )}
              {isVisitor ? (
                /* Visitor: show date only, hide confirmCode/cost/qr */
                b.date && (
                  <div className="tm-booking-date" style={{ background: '#EAF8E6', borderRadius: 12, padding: '7px 10px', marginBottom: 8, display: 'inline-block' }}>
                    <p style={{ fontSize: 9, color: '#4A7A35', fontWeight: 700, margin: 0 }}>📅 日期</p>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '2px 0 0' }}>{b.date}</p>
                  </div>
                )
              ) : (
                (b.date || b.confirmCode || b.cost) && (
                  <div style={{ display: 'grid', gridTemplateColumns: [b.date, b.confirmCode, b.cost].filter(Boolean).length >= 3 ? '1fr 1fr 1fr' : [b.date, b.confirmCode, b.cost].filter(Boolean).length === 2 ? '1fr 1fr' : '1fr', gap: 6, marginBottom: 8 }}>
                    {b.date && (
                      <div className="tm-booking-date" style={{ background: '#EAF8E6', borderRadius: 12, padding: '7px 10px' }}>
                        <p style={{ fontSize: 9, color: '#4A7A35', fontWeight: 700, margin: 0 }}>📅 日期</p>
                        <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '2px 0 0' }}>{b.date}</p>
                      </div>
                    )}
                    {b.confirmCode && (
                      <div className="tm-booking-order" style={{ background: '#FFF8E1', borderRadius: 12, padding: '7px 10px' }}>
                        <p style={{ fontSize: 9, color: C.barkLight, fontWeight: 700, margin: 0 }}>訂單編號</p>
                        <p style={{ fontSize: 11, fontWeight: 700, color: C.bark, margin: '2px 0 0', wordBreak: 'break-all' }}>{b.confirmCode}</p>
                      </div>
                    )}
                    {b.cost && (
                      <div className="tm-booking-cost" style={{ background: C.cream, borderRadius: 12, padding: '7px 10px' }}>
                        <p style={{ fontSize: 9, color: C.barkLight, fontWeight: 700, margin: 0 }}>費用</p>
                        <p style={{ fontSize: 12, fontWeight: 700, color: C.earth, margin: '2px 0 0' }}>
                          {b.currency === 'TWD' ? 'NT$' : b.currency === 'USD' ? '$' : '¥'} {Number(b.cost).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                )
              )}
              {b.notes && <p style={{ fontSize: 11, color: C.barkLight, fontStyle: 'italic', margin: '0 0 8px' }}>💡 {b.notes}</p>}
              {!isVisitor && b.qrUrl && (
                <>
                  <button onClick={() => setShowQrFor(isQrOpen ? null : b.id)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${isQrOpen ? C.sageDark : C.creamDark}`, background: isQrOpen ? C.sage : 'var(--tm-card-bg)', color: isQrOpen ? 'white' : C.bark, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 }}>
                    <span>{isQrOpen ? '▲' : '▼'}</span>
                    {isQrOpen ? '收起 QR Code' : '📱 展開 QR Code'}
                  </button>
                  {isQrOpen && (
                    <div style={{ marginTop: 10, padding: 16, background: 'var(--tm-card-bg)', borderRadius: 14, border: `1.5px solid ${C.creamDark}`, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <img src={b.qrUrl} alt="QR Code" style={{ maxWidth: 220, width: 'auto', height: 'auto', maxHeight: 220, borderRadius: 8, display: 'block', margin: '0 auto' }} />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

      </div>

      {/* ══════════════════════════════════════════════════════
          ── Edit static booking modal (owner only) ──
          ══════════════════════════════════════════════════════ */}
      {editType && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}
          onClick={e => { if (e.target === e.currentTarget) setEditType(null); }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>
                {editType === 'flight' ? '✈️ 編輯航班' : editType === 'hotel' ? '🏨 編輯住宿' : '🚗 編輯租車'}
              </p>
              <button onClick={() => setEditType(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* ── Flight form ── */}
              {editType === 'flight' && (<>
                <Row>
                  <Field label="方向">
                    <select style={selSt} value={editForm.direction} onChange={e => setF('direction', e.target.value)}>
                      <option>去程</option><option>回程</option>
                    </select>
                  </Field>
                  <Field label="日期"><input style={inSt} type="date" value={editForm.date || ''} onChange={e => setF('date', e.target.value)} /></Field>
                </Row>
                <Row>
                  <Field label="航空公司"><input style={inSt} value={editForm.airline || ''} onChange={e => setF('airline', e.target.value)} /></Field>
                  <Field label="航班號"><input style={inSt} placeholder="IT 230" value={editForm.flightNo || ''} onChange={e => setF('flightNo', e.target.value)} /></Field>
                </Row>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.barkLight, margin: '4px 0 0' }}>出發</p>
                <Row>
                  <Field label="機場代碼"><input style={inSt} placeholder="TPE" value={editForm.dep?.airport || ''} onChange={e => setDep('airport', e.target.value)} /></Field>
                  <Field label="機場名稱"><input style={inSt} placeholder="台北桃園" value={editForm.dep?.name || ''} onChange={e => setDep('name', e.target.value)} /></Field>
                  <Field label="時間"><input style={inSt} type="time" value={editForm.dep?.time || ''} onChange={e => setDep('time', e.target.value)} /></Field>
                </Row>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.barkLight, margin: '4px 0 0' }}>抵達</p>
                <Row>
                  <Field label="機場代碼"><input style={inSt} placeholder="OKA" value={editForm.arr?.airport || ''} onChange={e => setArr('airport', e.target.value)} /></Field>
                  <Field label="機場名稱"><input style={inSt} placeholder="沖繩那霸" value={editForm.arr?.name || ''} onChange={e => setArr('name', e.target.value)} /></Field>
                  <Field label="時間"><input style={inSt} type="time" value={editForm.arr?.time || ''} onChange={e => setArr('time', e.target.value)} /></Field>
                </Row>
                <Field label="每人票價（NT$，選填）"><input style={inSt} type="number" value={editForm.costPerPerson || ''} onChange={e => setF('costPerPerson', e.target.value)} /></Field>
                <Field label="備註"><textarea style={{ ...inSt, minHeight: 60, resize: 'vertical' as const, lineHeight: 1.6 }} value={editForm.notes || ''} onChange={e => setF('notes', e.target.value)} /></Field>
              </>)}

              {/* ── Hotel form ── */}
              {editType === 'hotel' && (<>
                <Field label="飯店名稱 *"><input style={inSt} value={editForm.name || ''} onChange={e => setF('name', e.target.value)} /></Field>
                <Field label="當地名稱（選填）"><input style={inSt} value={editForm.nameJa || ''} onChange={e => setF('nameJa', e.target.value)} /></Field>
                <Row>
                  <Field label="Check-in *"><input style={inSt} placeholder="2026-04-23  14:00" value={editForm.checkIn || ''} onChange={e => setF('checkIn', e.target.value)} /></Field>
                  <Field label="Check-out *"><input style={inSt} placeholder="2026-04-24  11:00" value={editForm.checkOut || ''} onChange={e => setF('checkOut', e.target.value)} /></Field>
                </Row>
                <Field label="訂單編號 *"><input style={inSt} value={editForm.confirmCode || ''} onChange={e => setF('confirmCode', e.target.value)} /></Field>
                <Row>
                  <Field label="幣別">
                    <select style={selSt} value={editForm.currency || project?.currency || 'JPY'} onChange={e => setF('currency', e.target.value)}>
                      {project?.currency && project.currency !== 'TWD' && <option value={project.currency}>{project.currency}</option>}
                      <option value="TWD">TWD</option>
                      {(!project?.currency || project.currency === 'TWD') && <option value="JPY">JPY</option>}
                    </select>
                  </Field>
                  <Field label="總費用（選填）"><input style={inSt} type="number" value={editForm.totalCost || ''} onChange={e => setF('totalCost', e.target.value)} /></Field>
                  <Field label="每人分攤（選填）"><input style={inSt} type="number" value={editForm.costPerPerson || ''} onChange={e => setF('costPerPerson', e.target.value)} /></Field>
                </Row>
                <Field label="地址（選填）"><input style={inSt} value={editForm.address || ''} onChange={e => setF('address', e.target.value)} /></Field>
                <Row>
                  <Field label="房型（選填）"><input style={inSt} value={editForm.roomType || ''} onChange={e => setF('roomType', e.target.value)} /></Field>
                  <Field label="PIN 碼（選填）"><input style={inSt} value={editForm.pin || ''} onChange={e => setF('pin', e.target.value)} /></Field>
                </Row>
                <Field label="備註（選填）"><textarea style={{ ...inSt, minHeight: 60, resize: 'vertical' as const, lineHeight: 1.6 }} value={editForm.notes || ''} onChange={e => setF('notes', e.target.value)} /></Field>
                <Field label="地圖連結（選填）"><input style={inSt} placeholder="https://..." value={editForm.mapUrl || ''} onChange={e => setF('mapUrl', e.target.value)} /></Field>
              </>)}

              {/* ── Car form ── */}
              {editType === 'car' && (<>
                <Row>
                  <Field label="租車公司"><input style={inSt} value={editForm.company || ''} onChange={e => setF('company', e.target.value)} /></Field>
                  <Field label="車型"><input style={inSt} value={editForm.carType || ''} onChange={e => setF('carType', e.target.value)} /></Field>
                </Row>
                <Field label="取車地點"><input style={inSt} value={editForm.pickupLocation || ''} onChange={e => setF('pickupLocation', e.target.value)} /></Field>
                <Field label="取車時間"><input style={inSt} placeholder="2026-04-23  11:00" value={editForm.pickupTime || ''} onChange={e => setF('pickupTime', e.target.value)} /></Field>
                <Field label="還車地點"><input style={inSt} value={editForm.returnLocation || ''} onChange={e => setF('returnLocation', e.target.value)} /></Field>
                <Field label="還車時間"><input style={inSt} placeholder="2026-04-26  13:30" value={editForm.returnTime || ''} onChange={e => setF('returnTime', e.target.value)} /></Field>
                <Row>
                  <Field label="幣別">
                    <select style={selSt} value={editForm.currency || 'JPY'} onChange={e => setF('currency', e.target.value)}>
                      <option value="JPY">JPY</option><option value="TWD">TWD</option>
                    </select>
                  </Field>
                  <Field label="總費用"><input style={inSt} type="number" value={editForm.totalCost || ''} onChange={e => setF('totalCost', e.target.value)} /></Field>
                </Row>
                <Field label="預約編號"><input style={inSt} value={editForm.confirmCode || ''} onChange={e => setF('confirmCode', e.target.value)} /></Field>
                <Field label="備註"><textarea style={{ ...inSt, minHeight: 60, resize: 'vertical' as const, lineHeight: 1.6 }} value={editForm.notes || ''} onChange={e => setF('notes', e.target.value)} /></Field>
              </>)}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button onClick={() => setEditType(null)}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                  取消
                </button>
                <button onClick={handleStaticSave} disabled={staticSaving}
                  style={{ flex: 2, padding: 12, borderRadius: 12, border: 'none', background: C.sage, color: 'white', fontWeight: 700, fontSize: 14, cursor: staticSaving ? 'default' : 'pointer', fontFamily: FONT, opacity: staticSaving ? 0.6 : 1 }}>
                  {staticSaving ? '儲存中...' : '✓ 儲存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 新增自訂預訂底部面板 ── */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}
          onClick={e => { if (e.target === e.currentTarget) closeCustomForm(); }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>{editBookingId ? '✏️ 修改預訂' : '📋 新增預訂'}</p>
              <button onClick={closeCustomForm} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lblSt}>類型</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {Object.entries(BOOKING_TYPES).map(([key, info]) => (
                    <button key={key} onClick={() => setC('type', key)}
                      style={{ padding: '9px 10px', borderRadius: 12, border: `2px solid ${customForm.type === key ? info.color : '#E0D9C8'}`, background: customForm.type === key ? info.bg : 'var(--tm-card-bg)', color: info.color, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 5 }}>
                      {info.emoji} {info.label}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="預訂名稱 *"><input style={inSt} placeholder="例：美麗海水族館門票" value={customForm.title} onChange={e => setC('title', e.target.value)} /></Field>
              <Field label="日期（選填）"><input style={{ ...inSt, padding: '10px 8px' }} type="date" value={customForm.date} onChange={e => setC('date', e.target.value)} /></Field>
              <Field label="訂單編號（選填）"><input style={inSt} placeholder="預訂確認碼" value={customForm.confirmCode} onChange={e => setC('confirmCode', e.target.value)} /></Field>
              <Row>
                <div style={{ width: 90, flexShrink: 0 }}>
                  <label style={lblSt}>幣別</label>
                  <select style={selSt} value={customForm.currency} onChange={e => setC('currency', e.target.value)}>
                    <option value="JPY">JPY ¥</option>
                    <option value="TWD">TWD NT$</option>
                    <option value="USD">USD $</option>
                  </select>
                </div>
                <Field label="費用（選填）"><input style={inSt} type="number" placeholder="0" value={customForm.cost} onChange={e => setC('cost', e.target.value)} /></Field>
              </Row>
              <Field label="備註（選填）"><textarea style={{ ...inSt, minHeight: 60, resize: 'vertical' as const, lineHeight: 1.6 }} placeholder="注意事項..." value={customForm.notes} onChange={e => setC('notes', e.target.value)} /></Field>
              <div>
                <label style={lblSt}>QR Code（選填）</label>
                <input ref={qrFileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={async e => { const f = e.target.files?.[0]; if (f) await handleUploadQR(f); e.target.value = ''; }} />
                {customForm.qrUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)' }}>
                    <img src={customForm.qrUrl} alt="QR" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'contain' }} />
                    <div>
                      <p style={{ fontSize: 11, color: '#4A7A35', fontWeight: 700, margin: 0 }}>✓ 已上傳</p>
                      <button onClick={() => setC('qrUrl', '')} style={{ fontSize: 11, color: '#9A3A3A', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT, fontWeight: 600 }}>✕ 移除</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => qrFileRef.current?.click()} disabled={uploading}
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `2px dashed ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 600, fontSize: 13, cursor: uploading ? 'default' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxSizing: 'border-box' }}>
                    {uploading ? '⏳ 上傳中...' : '📱 上傳 QR Code 圖片'}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={closeCustomForm}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                  取消
                </button>
                <button onClick={handleCustomSave} disabled={saving || !customForm.title.trim()}
                  style={{ flex: 2, padding: 12, borderRadius: 12, border: 'none', background: C.earth, color: 'white', fontWeight: 700, fontSize: 14, cursor: saving || !customForm.title.trim() ? 'default' : 'pointer', fontFamily: FONT, opacity: saving || !customForm.title.trim() ? 0.6 : 1 }}>
                  {saving ? '儲存中...' : editBookingId ? '✓ 儲存修改' : '✓ 新增預訂'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared layout helpers ────────────────────────────────
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 8 }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label style={lblSt}>{label}</label>
      {children}
    </div>
  );
}

const lblSt: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#8C7B6E', display: 'block', marginBottom: 6 };
const inSt: React.CSSProperties  = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 12, border: '1.5px solid var(--tm-cream-dark)', background: 'var(--tm-input-bg)', fontSize: 14, color: 'var(--tm-bark)', outline: 'none', fontFamily: "'M PLUS Rounded 1c', 'Noto Sans TC', sans-serif" };
const selSt: React.CSSProperties = { ...inSt, padding: '11px 8px' };
