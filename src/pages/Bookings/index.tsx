import { useState, useRef, useEffect } from 'react';
import { auth } from '../../config/firebase';
import { C, FONT, cardStyle, ExpandableNotes } from '../../App';
import PageHeader from '../../components/layout/PageHeader';
import CurrencyPicker from '../../components/CurrencyPicker';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDoc, updateDoc, doc as fsDoc } from 'firebase/firestore';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMapPin, faBus, faStar, faShip, faEllipsis, faPen, faTrashCan, faClipboardList, faLightbulb, faCircleExclamation, faUsers, faSquareCheck, faLocationDot, faLock, faPlane, faBed, faCircleDot, faMap } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';

const BOOKING_TYPE_ICONS: Record<string, IconDefinition> = {
  activity:  faMapPin,
  transport: faBus,
  show:      faStar,
  ferry:     faShip,
  other:     faEllipsis,
};

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
  carMode: 'rental', // 'rental' | 'charter'
  company: 'OTS', carType: 'S級別 1台',
  pickupLocation: '臨空豐崎營業所（那霸機場）', pickupTime: '2026-04-23  11:00',
  returnLocation: '臨空豐崎營業所（那霸機場）', returnTime: '2026-04-26  13:30',
  totalCost: '26290', currency: 'JPY', confirmCode: 'OTS1402455',
  notes: '需國際駕照、日文譯本',
  qrUrl: '/ots-qr.png',
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
export default function BookingsPage({ bookings, members = [], firestore, project }: { bookings: any[]; members?: any[]; firestore?: any; project?: any }) {
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
      // 舊版預設行程沿用 hardcoded 資料，並同步寫入 Firestore 供其他頁面（如倒數）讀取
      if (!('staticFlights' in d) && TRIP_ID === '74pfE7RXyEIusEdRV0rZ') {
        setFlights(DEFAULT_FLIGHTS);
        setHotels (DEFAULT_HOTELS);
        setCar    (DEFAULT_CAR);
        // Write defaults to Firestore so Schedule page can read flight times
        updateDoc(fsDoc(db, 'trips', TRIP_ID), {
          staticFlights: DEFAULT_FLIGHTS,
          staticHotels:  DEFAULT_HOTELS,
          staticCar:     DEFAULT_CAR,
        }).catch(console.error);
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
  // participants state (member IDs)
  const [editParticipants,   setEditParticipants]   = useState<string[]>([]);
  const [customParticipants, setCustomParticipants] = useState<string[]>([]);
  const [expandedHotelIds, setExpandedHotelIds] = useState<Set<string>>(new Set());
  const [expensePrompt, setExpensePrompt] = useState<{ type: string; name: string; amount: number; currency: string; date: string; participantNames?: string[] } | null>(null);
  const [expenseSaving, setExpenseSaving] = useState(false);

  // All-flights form (manage structure: add / remove flights)
  const [allFlightsForm, setAllFlightsForm] = useState<any[]>([]);

  // Single-flight edit (per-card ✏️ — includes participants)
  const [editFlightIdx,         setEditFlightIdx]         = useState<number | null>(null);
  const [singleFlightForm,      setSingleFlightForm]      = useState<any>({});
  const [singleFlightParticipants, setSingleFlightParticipants] = useState<string[]>([]);

  const projCurrency = project?.currency || 'JPY';

  const BLANK_FLIGHT = (dir = '去程', idx = 0) => ({
    id: `f${idx + 1}`, direction: dir, airline: '', flightNo: '',
    dep: { airport: '', name: '', time: '' },
    arr: { airport: '', name: '', time: '' },
    date: '', notes: '', costPerPerson: '',
  });

  // Section-level: manage all flights (add / remove) — does NOT touch participants
  const openFlightEdit = () => {
    const src = flights?.length ? flights.map((f: any) => ({ ...f })) : [BLANK_FLIGHT('去程', 0)];
    setAllFlightsForm(src);
    setEditType('flight');
  };

  // Per-card: edit a single flight including its own participants
  const openSingleFlightEdit = (idx: number) => {
    const f = (flights || [])[idx];
    if (!f) return;
    setSingleFlightForm({ ...f, dep: { ...f.dep }, arr: { ...f.arr } });
    setSingleFlightParticipants(f.participants || []);
    setEditFlightIdx(idx);
  };

  const setSF    = (k: string, v: any)    => setSingleFlightForm((p: any) => ({ ...p, [k]: v }));
  const setSFDep = (k: string, v: string) => setSingleFlightForm((p: any) => ({ ...p, dep: { ...p.dep, [k]: v } }));
  const setSFArr = (k: string, v: string) => setSingleFlightForm((p: any) => ({ ...p, arr: { ...p.arr, [k]: v } }));

  const handleSingleFlightSave = async () => {
    if (!updateDoc || !db || !TRIP_ID || editFlightIdx === null) return;
    setStaticSaving(true);
    try {
      const updated = (flights || []).map((f: any, i: number) =>
        i === editFlightIdx ? { ...singleFlightForm, participants: singleFlightParticipants } : f
      );
      await updateDoc(doc(db, 'trips', TRIP_ID), { staticFlights: updated });
      setFlights(updated);
      setEditFlightIdx(null);
    } catch (e) { console.error(e); alert('儲存失敗，請重試'); }
    setStaticSaving(false);
  };

  const openEdit = (type: EditType, idx = 0) => {
    setEditType(type);
    setEditIndex(idx);
    if (type === 'hotel' && hotels[idx])  { setEditForm({ currency: projCurrency, ...hotels[idx], nameLocal: hotels[idx].nameLocal || hotels[idx].nameJa || '' }); setEditParticipants(hotels[idx].participants || []); }
    if (type === 'car')    { setEditForm({ carMode: 'rental', currency: projCurrency, ...car }); setEditParticipants(car?.participants || []); }
  };

  // Helpers for hotel/car forms (single editForm)
  const setF = (key: string, val: any) => setEditForm((p: any) => ({ ...p, [key]: val }));
  const setDep = (key: string, val: string) => setEditForm((p: any) => ({ ...p, dep: { ...p.dep, [key]: val } }));
  const setArr = (key: string, val: string) => setEditForm((p: any) => ({ ...p, arr: { ...p.arr, [key]: val } }));

  // Helpers for all-flights form
  const setFF  = (idx: number, key: string, val: any) =>
    setAllFlightsForm(prev => prev.map((f, i) => i === idx ? { ...f, [key]: val } : f));
  const setFDep = (idx: number, key: string, val: string) =>
    setAllFlightsForm(prev => prev.map((f, i) => i === idx ? { ...f, dep: { ...f.dep, [key]: val } } : f));
  const setFArr = (idx: number, key: string, val: string) =>
    setAllFlightsForm(prev => prev.map((f, i) => i === idx ? { ...f, arr: { ...f.arr, [key]: val } } : f));

  // ── Date+time helpers ────────────────────────────────────
  const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
    const h = String(Math.floor(i / 2)).padStart(2, '0');
    const m = i % 2 === 0 ? '00' : '30';
    return `${h}:${m}`;
  });
  const splitDT = (val: string) => {
    const parts = (val || '').trim().split(/\s+/);
    return { date: parts[0] || '', time: parts[1] || '' };
  };
  const joinDT = (date: string, time: string) => `${date}  ${time}`;

  const handleStaticSave = async () => {
    if (!updateDoc || !doc || !db || !TRIP_ID) return;
    setStaticSaving(true);
    try {
      if (editType === 'flight') {
        // Preserve each flight's existing participants (managed per-card via openSingleFlightEdit)
        const existing = flights || [];
        const updated = allFlightsForm.map((f: any, i: number) => ({
          ...f, participants: existing[i]?.participants || f.participants || [],
        }));
        await updateDoc(doc(db, 'trips', TRIP_ID), { staticFlights: updated });
        setFlights(updated);
      } else if (editType === 'hotel') {
        const updated = hotels.map((h: any, i: number) => i === editIndex ? { ...editForm, participants: editParticipants } : h);
        await updateDoc(doc(db, 'trips', TRIP_ID), { staticHotels: updated });
        setHotels(updated);
        if (editForm.totalCost && Number(editForm.totalCost) > 0) {
          const ptcNames = editParticipants.map(id => members.find((m: any) => m.id === id)?.name).filter(Boolean) as string[];
          setExpensePrompt({ type: 'hotel', name: editForm.name || '住宿', amount: Number(editForm.totalCost), currency: editForm.currency || 'TWD', date: (editForm.checkIn || '').split(/\s+/)[0], participantNames: ptcNames.length ? ptcNames : undefined });
        }
      } else if (editType === 'car') {
        const updated = { ...editForm, participants: editParticipants };
        await updateDoc(doc(db, 'trips', TRIP_ID), { staticCar: updated });
        setCar(updated);
        if (editForm.totalCost && Number(editForm.totalCost) > 0) {
          const ptcNames = editParticipants.map(id => members.find((m: any) => m.id === id)?.name).filter(Boolean) as string[];
          setExpensePrompt({ type: 'car', name: editForm.company || '租車/包車', amount: Number(editForm.totalCost), currency: editForm.currency || 'JPY', date: (editForm.pickupTime || '').split(/\s+/)[0], participantNames: ptcNames.length ? ptcNames : undefined });
        }
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

  const qrFileRef    = useRef<HTMLInputElement>(null);
  const carQrFileRef = useRef<HTMLInputElement>(null);
  const [uploadingCarQr, setUploadingCarQr] = useState(false);
  const setC = (k: string, v: string) => setCustomForm(p => ({ ...p, [k]: v }));

  const openEditBooking = (b: any) => {
    setEditBookingId(b.id);
    setCustomForm({
      title: b.title || '', type: b.type || 'activity',
      confirmCode: b.confirmCode || '', notes: b.notes || '',
      date: b.date || '', cost: b.cost ? String(b.cost) : '',
      currency: b.currency || 'JPY', qrUrl: b.qrUrl || '',
    });
    setCustomParticipants(b.participants || []);
    setShowAdd(true);
  };

  const closeCustomForm = () => {
    setShowAdd(false); setEditBookingId(null); setCustomForm({ ...EMPTY_CUSTOM_FORM }); setCustomParticipants([]);
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

  const handleUploadCarQR = async (file: File) => {
    if (!TRIP_ID) return;
    setUploadingCarQr(true);
    try {
      const storage = getStorage();
      const sRef = storageRef(storage, `bookings/${TRIP_ID}/${Date.now()}_car_qr`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      setF('qrUrl', url);
    } catch (e) { console.error(e); alert('QR Code 上傳失敗'); }
    setUploadingCarQr(false);
  };

  const BOOKING_TYPE_TO_EXPENSE: Record<string, string> = {
    activity: 'attraction', transport: 'transport', show: 'attraction', ferry: 'transport', other: 'other',
  };

  const handleCustomSave = async () => {
    if (!customForm.title.trim() || !TRIP_ID) return;
    setSaving(true);
    const payload = {
      title: customForm.title.trim(), type: customForm.type,
      confirmCode: customForm.confirmCode.trim(), notes: customForm.notes.trim(),
      date: customForm.date, cost: customForm.cost ? parseFloat(customForm.cost) : null,
      currency: customForm.currency, qrUrl: customForm.qrUrl,
      participants: customParticipants,
    };
    try {
      if (editBookingId && updateDoc && doc) {
        await updateDoc(doc(db, 'trips', TRIP_ID, 'bookings', editBookingId), payload);
      } else if (addDoc) {
        await addDoc(collection(db, 'trips', TRIP_ID, 'bookings'), {
          ...payload, createdAt: Timestamp.now(), sortOrder: Date.now(),
        });
      }
      const costNum = customForm.cost ? parseFloat(customForm.cost) : 0;
      closeCustomForm();
      if (costNum > 0) {
        const ptcNames = customParticipants.map(id => members.find((m: any) => m.id === id)?.name).filter(Boolean) as string[];
        setExpensePrompt({
          type: BOOKING_TYPE_TO_EXPENSE[customForm.type] as any || 'other',
          name: customForm.title.trim(),
          amount: costNum,
          currency: customForm.currency || projCurrency,
          date: customForm.date || '',
          participantNames: ptcNames.length ? ptcNames : undefined,
        });
      }
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

  // ── Participant helpers ─────────────────────────────────
  const myUid    = auth.currentUser?.uid;
  const myMember = myUid ? members.find((m: any) => m.googleUid === myUid) : null;

  const [participantPopover, setParticipantPopover] = useState<string[] | null>(null);

  const ParticipantAvatars = ({ ids }: { ids: string[] }) => {
    if (!ids?.length) return null;
    const ptc = ids.map((id: string) => members.find((m: any) => m.id === id)).filter(Boolean);
    if (!ptc.length) return null;
    const names = ptc.map((m: any) => m.name);
    return (
      <div style={{ position: 'relative', display: 'inline-flex', marginTop: 8, cursor: 'pointer' }}
        onClick={e => { e.stopPropagation(); setParticipantPopover(participantPopover ? null : names); }}>
        {ptc.map((m: any, i: number) => (
          <div key={m.id} title={m.name} style={{ width: 24, height: 24, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--tm-card-bg)', background: m.color || C.cream, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: i === 0 ? 0 : -6, boxShadow: C.shadowSm }}>
            {m.avatarUrl ? <img src={m.avatarUrl} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 10, fontWeight: 700, color: 'white' }}>{(m.name || '?')[0]}</span>}
          </div>
        ))}
      </div>
    );
  };

  const ParticipantSelector = ({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) => {
    if (!members.length) return null;
    return (
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 8 }}>
          參與人 <span style={{ fontWeight: 400, opacity: 0.7 }}>(選填)</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
          {[...members].sort((a: any, b: any) => { if (a.id === myMember?.id) return -1; if (b.id === myMember?.id) return 1; return 0; }).map((m: any) => {
            const sel = value.includes(m.id);
            const canToggle = isOwner || myMember?.id === m.id;
            return (
              <button key={m.id}
                onClick={() => { if (canToggle) onChange(sel ? value.filter(id => id !== m.id) : [...value, m.id]); }}
                title={!canToggle ? '編輯者僅能確認自己的參與狀態' : sel ? '取消參與' : '確認參與'}
                style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: canToggle ? 'pointer' : 'default', padding: 0, opacity: sel ? 1 : canToggle ? 0.4 : 0.2, transition: 'opacity 0.15s' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', border: `3px solid ${sel ? m.color || C.sage : 'transparent'}`, boxSizing: 'border-box' as const, background: m.color || C.cream, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {m.avatarUrl ? <img src={m.avatarUrl} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{(m.name || '?')[0]}</span>}
                </div>
                <span style={{ fontSize: 10, color: C.barkLight, fontWeight: sel ? 700 : 400, maxWidth: 48, textAlign: 'center' as const, lineHeight: 1.2, wordBreak: 'break-all' as const }}>{m.name}</span>
              </button>
            );
          })}
        </div>
        {!isOwner && !myMember && (
          <p style={{ fontSize: 10, color: C.barkLight, margin: '6px 0 0', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 4 }}><FontAwesomeIcon icon={faLightbulb} style={{ fontSize: 9 }} /> 請至「成員」頁綁定帳號，即可確認自己的參與狀態</p>
        )}
      </div>
    );
  };

  const toggleHotelExpanded = (key: string) => setExpandedHotelIds(prev => {
    const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next;
  });

  const handleExpenseImport = async () => {
    if (!expensePrompt || !addDoc || !db || !TRIP_ID) return;
    setExpenseSaving(true);
    try {
      const { type, name, amount, currency, date, participantNames } = expensePrompt;
      const amountTWD = currency === 'TWD' ? amount : currency === 'JPY' ? Math.round(amount * 0.22) : Math.round(amount * 0.0022); // IDR approx
      // Map type to expense category and description prefix
      const catMap: Record<string, { cat: string; prefix: string }> = {
        hotel:      { cat: 'hotel',      prefix: '住宿' },
        car:        { cat: 'transport',  prefix: '租車/包車' },
        transport:  { cat: 'transport',  prefix: '交通' },
        attraction: { cat: 'attraction', prefix: '景點' },
        other:      { cat: 'other',      prefix: '其他' },
      };
      const mapped = catMap[type] || catMap.other;
      const splitWith = participantNames && participantNames.length > 0 ? participantNames : [];
      const notes = !participantNames?.length ? '⚠️ 尚未設定參與人，請至記帳確認分帳對象' : '';
      await addDoc(collection(db, 'trips', TRIP_ID, 'expenses'), {
        description: `${mapped.prefix} - ${name}`,
        amount, currency, amountTWD,
        category: mapped.cat,
        payer: '', splitMode: 'equal', splitWith,
        percentages: {}, customAmounts: {}, subItems: [],
        date, notes, receiptUrl: '',
        createdAt: Timestamp.now(),
      });
      setExpensePrompt(null);
    } catch (e) { console.error(e); alert('新增記帳失敗，請重試'); }
    setExpenseSaving(false);
  };

  return (
    <div style={{ fontFamily: FONT }} onClick={() => participantPopover && setParticipantPopover(null)}>

      {/* ── Participant popover ── */}
      {participantPopover && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500 }} onClick={() => setParticipantPopover(null)}>
          <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: 'var(--tm-sheet-bg)', borderRadius: 16, padding: '14px 20px', boxShadow: '0 4px 24px rgba(0,0,0,0.18)', maxWidth: 320, width: 'calc(100% - 48px)', zIndex: 501 }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.barkLight, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 5 }}><FontAwesomeIcon icon={faUsers} style={{ fontSize: 11 }} /> 參與人員</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {participantPopover.map(name => (
                <span key={name} style={{ fontSize: 13, fontWeight: 600, color: C.bark, background: C.cream, borderRadius: 10, padding: '4px 12px' }}>{name}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      <PageHeader title="旅行預訂" subtitle="機票・住宿・租車・票券" emoji="✈️" color={C.sky} />

      <div style={{ padding: '8px 16px 80px' }}>

        {/* ── 航班 ── */}
        <SectionTitle action={!isReadOnly && flights?.length ? (
          <button onClick={openFlightEdit} style={{ fontSize: 11, fontWeight: 700, color: C.sageDark, background: 'none', border: `1.5px solid ${C.sageDark}`, borderRadius: 10, padding: '4px 10px', cursor: 'pointer', fontFamily: FONT }}>
            ＋ 新增 / 管理
          </button>
        ) : undefined}><FontAwesomeIcon icon={faPlane} style={{ marginRight: 6 }} />航班資訊</SectionTitle>
        {!staticLoaded ? null : flights === null || flights.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '24px 16px' }}>
            <p style={{ fontSize: 28, margin: '0 0 8px', color: C.sageLight }}><FontAwesomeIcon icon={faPlane} /></p>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: '0 0 4px' }}>航班資訊待更新</p>
            <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>擁有者可點擊右上方 <FontAwesomeIcon icon={faPen} style={{ fontSize: 10 }} /> 填入航班資料</p>
            {!isReadOnly && (
              <button onClick={openFlightEdit}
                style={{ marginTop: 12, padding: '8px 20px', borderRadius: 12, border: 'none', background: C.sage, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                ＋ 新增航班
              </button>
            )}
          </div>
        ) : (flights || []).map((f, idx) => (
          <div key={f.id || idx} style={{ borderRadius: 24, overflow: 'hidden', boxShadow: C.shadow, marginBottom: 14 }}>
            <div style={{ background: `linear-gradient(135deg, ${C.sageDark}, ${C.sage})`, padding: '16px 20px 16px', position: 'relative' }}>
              {/* Per-card ✏️ — opens single-flight editor */}
              {!isReadOnly && (
                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                  <button onClick={() => openSingleFlightEdit(idx)}
                    style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.25)', color: 'white', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FontAwesomeIcon icon={faPen} />
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
                    <span style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', fontSize: 14, color: 'white' }}><FontAwesomeIcon icon={faPlane} /></span>
                  </div>
                </div>
                <div style={{ textAlign: 'center', minWidth: 68 }}>
                  <p style={{ fontSize: 28, fontWeight: 900, margin: 0, lineHeight: 1 }}>{f.arr?.airport}</p>
                  <p style={{ fontSize: 10, opacity: 0.8, margin: '3px 0 0' }}>{f.arr?.name}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 0' }}>{f.arr?.time}</p>
                </div>
              </div>
              {/* Participant avatar strip — bottom of green card */}
              {(() => {
                const ptc = (f.participants || []).map((id: string) => members.find((m: any) => m.id === id)).filter(Boolean);
                return ptc.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                    {ptc.map((m: any, i: number) => (
                      <div key={m.id} title={m.name} style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', border: '2.5px solid white', background: m.color || 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: i === 0 ? 0 : -8, flexShrink: 0 }}>
                        {m.avatarUrl ? <img src={m.avatarUrl} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>{(m.name || '?')[0]}</span>}
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>
            {f.notes && (
              <div style={{ background: 'var(--tm-card-bg)', padding: '10px 18px 14px' }}>
                <ExpandableNotes notes={f.notes} color={C.barkLight} margin="0" />
              </div>
            )}
          </div>
        ))}

        {/* ── 住宿 ── */}
        <SectionTitle><FontAwesomeIcon icon={faBed} style={{ marginRight: 6 }} />住宿安排</SectionTitle>
        {!staticLoaded ? null : hotels === null || hotels.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '24px 16px' }}>
            <p style={{ fontSize: 28, margin: '0 0 8px', color: C.sageLight }}><FontAwesomeIcon icon={faBed} /></p>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: '0 0 4px' }}>住宿安排待更新</p>
            <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>擁有者可點擊 <FontAwesomeIcon icon={faPen} style={{ fontSize: 10 }} /> 填入訂房資訊</p>
            {!isReadOnly && (
              <button onClick={() => { setEditType('hotel'); setEditIndex(0); setEditForm({ id: 'h1', name: '', nameLocal: '', address: '', roomType: '', checkIn: '', checkOut: '', totalCost: '', currency: project?.currency || 'JPY', costPerPerson: '', confirmCode: '', pin: '', notes: '', mapUrl: '' }); }}
                style={{ marginTop: 12, padding: '8px 20px', borderRadius: 12, border: 'none', background: C.earth, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                ＋ 新增住宿
              </button>
            )}
          </div>
        ) : (hotels || []).map((h, idx) => {
          const hotelKey = h.id || String(idx);
          const isExpanded = expandedHotelIds.has(hotelKey);
          return (
          <div key={hotelKey} style={{ ...cardStyle, textAlign: 'left' }}>
            {/* ── Always visible: header ── */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 50, height: 50, borderRadius: 16, background: `linear-gradient(135deg,${C.sky},${C.sageLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🌸</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0, wordBreak: 'break-word' }}>{h.name}</p>
                {(h.nameLocal || h.nameJa) && <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>{h.nameLocal || h.nameJa}</p>}
                {h.address && <p style={{ fontSize: 10, color: C.barkLight, margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 3 }}><FontAwesomeIcon icon={faLocationDot} style={{ fontSize: 9 }} /> {h.address}</p>}
              </div>
              {!isReadOnly && <EditBtn onClick={() => openEdit('hotel', idx)} />}
            </div>
            {/* ── Always visible: check-in/out ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '12px 0 8px' }}>
              <div className="tm-booking-checkin" style={{ background: '#EAF8E6', borderRadius: 12, padding: '8px 10px' }}>
                <p style={{ fontSize: 10, color: '#4A7A35', fontWeight: 700, margin: 0 }}>📥 Check-in</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '3px 0 0' }}>{h.checkIn}</p>
              </div>
              <div className="tm-booking-checkout" style={{ background: '#FFF2E6', borderRadius: 12, padding: '8px 10px' }}>
                <p style={{ fontSize: 10, color: '#9A5A00', fontWeight: 700, margin: 0 }}>📤 Check-out</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '3px 0 0' }}>{h.checkOut}</p>
              </div>
            </div>
            {/* ── Expand toggle ── */}
            <button onClick={() => toggleHotelExpanded(hotelKey)}
              style={{ width: '100%', padding: '7px 12px', borderRadius: 10, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {isExpanded ? '▲ 收起詳細' : '▼ 查看詳細'}
            </button>
            {/* ── Expanded details ── */}
            {isExpanded && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {isVisitor ? (
                  <div className="tm-booking-lock" style={{ background: '#F5F5F5', borderRadius: 12, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: C.barkLight }}><FontAwesomeIcon icon={faLock} /></span>
                    <span style={{ fontSize: 11, color: C.barkLight, fontWeight: 600 }}>訂單詳細資訊僅旅伴可查看</span>
                  </div>
                ) : (
                  <>
                    {(h.confirmCode || h.pin) && (
                      <div style={{ display: 'grid', gridTemplateColumns: h.confirmCode && h.pin ? '1fr 1fr' : '1fr', gap: 6 }}>
                        {h.confirmCode && (
                          <div className="tm-booking-order" style={{ background: '#FFF8E1', borderRadius: 12, padding: '7px 10px' }}>
                            <p style={{ fontSize: 9, color: C.barkLight, margin: 0 }}>訂單編號</p>
                            <p style={{ fontSize: 10, fontWeight: 700, color: C.bark, margin: '2px 0 0', wordBreak: 'break-all' }}>{h.confirmCode}</p>
                          </div>
                        )}
                        {h.pin && (
                          <div className="tm-booking-pin" style={{ background: '#FFEBEB', borderRadius: 12, padding: '7px 10px' }}>
                            <p style={{ fontSize: 9, color: C.barkLight, margin: 0 }}>PIN 碼</p>
                            <p style={{ fontSize: 16, fontWeight: 900, color: '#C0392B', margin: '2px 0 0', letterSpacing: 2 }}>{h.pin}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {h.roomType && (
                      <div style={{ background: C.cream, borderRadius: 12, padding: '7px 10px' }}>
                        <p style={{ fontSize: 9, color: C.barkLight, margin: 0 }}>房型</p>
                        <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '2px 0 0' }}>{h.roomType}</p>
                      </div>
                    )}
                    {(h.totalCost || h.costPerPerson) && (
                      <div className="tm-booking-cost" style={{ background: '#FFF8E1', borderRadius: 12, padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: C.barkLight }}>費用</span>
                        <div style={{ textAlign: 'right' }}>
                          {h.totalCost && <p style={{ fontSize: 16, fontWeight: 700, color: C.earth, margin: 0 }}>{h.currency === 'TWD' ? 'NT$' : h.currency === 'IDR' ? 'Rp' : '¥'} {Number(h.totalCost).toLocaleString()}</p>}
                          {h.costPerPerson && <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>每人 {h.currency === 'TWD' ? 'NT$' : h.currency === 'IDR' ? 'Rp' : '¥'} {Number(h.costPerPerson).toLocaleString()}</p>}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {h.notes && <ExpandableNotes notes={h.notes} color={C.barkLight} margin="0" />}
                {h.mapUrl && (
                  <a href={h.mapUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: C.sky, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
                    <FontAwesomeIcon icon={faMap} style={{ marginRight: 4 }} />查看地圖
                  </a>
                )}
                <ParticipantAvatars ids={h.participants} />
              </div>
            )}
          </div>
          );
        })}

        {/* ── 租車 ── */}
        <SectionTitle><FontAwesomeIcon icon={faBus} style={{ marginRight: 6 }} />租車/包車資訊</SectionTitle>
        {!staticLoaded ? null : car === null ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '24px 16px' }}>
            <p style={{ fontSize: 28, margin: '0 0 8px', color: C.sageLight }}><FontAwesomeIcon icon={faBus} /></p>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: '0 0 4px' }}>此行程未安排租車/包車</p>
            <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>如有租車/包車需求，擁有者可點擊下方按鈕新增</p>
            {!isReadOnly && (
              <button onClick={() => { setEditType('car'); setEditForm({ carMode: 'rental', company: '', carType: '', seats: '', contactInfo: '', pickupLocation: '', pickupTime: '', returnLocation: '', returnTime: '', totalCost: '', currency: projCurrency, confirmCode: '', notes: '' }); }}
                style={{ marginTop: 12, padding: '8px 20px', borderRadius: 12, border: 'none', background: '#FFC107', color: '#333', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                ＋ 新增租車/包車
              </button>
            )}
          </div>
        ) : (
        <div style={cardStyle}>
          {/* ── Header ── */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: '#FFF2CC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#7A5A00' }}>
              <FontAwesomeIcon icon={faBus} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>
                  {car.company}{car.carMode === 'rental' && car.carType ? `　${car.carType}` : ''}{car.carMode === 'charter' && car.seats ? `　${car.seats}` : ''}
                </p>
                <span style={{ fontSize: 10, fontWeight: 700, background: car.carMode === 'charter' ? '#D8EDF8' : '#FFF2CC', color: car.carMode === 'charter' ? '#2A6A9A' : '#7A5A00', borderRadius: 6, padding: '2px 7px' }}>
                  {car.carMode === 'charter' ? '包車' : '租車'}
                </span>
              </div>
              {!isVisitor && car.confirmCode && <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>預約編號：{car.confirmCode}</p>}
              {!isVisitor && car.carMode === 'charter' && car.contactInfo && <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>📞 {car.contactInfo}</p>}
            </div>
            {!isReadOnly && <EditBtn onClick={() => openEdit('car')} />}
          </div>
          {/* ── Pickup / Return ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div className="tm-booking-pickup" style={{ background: '#EAF8E6', borderRadius: 12, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: '#4A7A35', fontWeight: 700, margin: '0 0 4px' }}><FontAwesomeIcon icon={faCircleDot} style={{ marginRight: 4 }} />{car.carMode === 'charter' ? '出發' : '取車'}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: 0 }}>{car.pickupLocation}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.earth, margin: '4px 0 0' }}>{car.pickupTime}</p>
            </div>
            <div className="tm-booking-return" style={{ background: '#FFEBEB', borderRadius: 12, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: '#9A3A3A', fontWeight: 700, margin: '0 0 4px' }}><FontAwesomeIcon icon={faCircleDot} style={{ marginRight: 4 }} />{car.carMode === 'charter' ? '結束' : '還車'}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: 0 }}>{car.returnLocation || '—'}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.earth, margin: '4px 0 0' }}>{car.returnTime || '—'}</p>
            </div>
          </div>
          {/* ── Cost / Lock ── */}
          {isVisitor ? (
            <div className="tm-booking-lock" style={{ background: '#F5F5F5', borderRadius: 12, padding: '9px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}><FontAwesomeIcon icon={faLock} /></span>
              <span style={{ fontSize: 11, color: C.barkLight, fontWeight: 600 }}>費用與訂單詳情僅旅伴可查看</span>
            </div>
          ) : car.totalCost ? (
            <div className="tm-booking-cost" style={{ background: '#FFF8E1', borderRadius: 12, padding: '8px 14px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.barkLight }}>費用</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.earth }}>
                {car.currency === 'TWD' ? 'NT$' : car.currency === 'IDR' ? 'Rp' : '¥'} {Number(car.totalCost).toLocaleString()}
              </span>
            </div>
          ) : null}
          {/* ── Notes ── */}
          {car.notes && <p style={{ fontSize: 11, color: '#9A3A3A', fontWeight: 600, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 4 }}><FontAwesomeIcon icon={faCircleExclamation} style={{ fontSize: 10 }} /> {car.notes}</p>}
          {/* ── Participants ── */}
          <ParticipantAvatars ids={car.participants} />
          {/* ── QR Code ── */}
          {!isVisitor && car.qrUrl && (
            <>
              <button onClick={() => setShowCarQR(v => !v)}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1.5px solid ${showCarQR ? C.sageDark : C.creamDark}`, background: showCarQR ? C.sage : 'var(--tm-card-bg)', color: showCarQR ? 'white' : C.bark, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: car.participants?.length ? 8 : 0 }}>
                <span>{showCarQR ? '▲' : '▼'}</span>
                {showCarQR ? '收起 QR Code' : `📱 展開${car.carMode === 'charter' ? '包車' : '取車'} QR Code`}
              </button>
              {showCarQR && (
                <div style={{ marginTop: 12, padding: 16, background: 'var(--tm-card-bg)', borderRadius: 14, border: `1.5px solid ${C.creamDark}`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 12px', fontWeight: 600 }}>{car.carMode === 'charter' ? '包車' : '取車報到'} QR Code</p>
                  <img src={car.qrUrl} alt="QR Code" style={{ width: 200, height: 200, imageRendering: 'pixelated', display: 'block', borderRadius: 8 }} />
                  {car.confirmCode && <p style={{ fontSize: 10, color: C.barkLight, margin: '10px 0 0' }}>{car.confirmCode}　{car.pickupLocation}</p>}
                </div>
              )}
            </>
          )}
        </div>
        )}

        {/* ── 其他預訂（動態）── */}
        <SectionTitle action={
          !isReadOnly && (
            <button onClick={() => { setCustomForm({ ...EMPTY_CUSTOM_FORM, currency: projCurrency }); setShowAdd(true); }}
              style={{ fontSize: 12, fontWeight: 700, color: 'white', background: C.earth, border: 'none', borderRadius: 10, padding: '5px 12px', cursor: 'pointer', fontFamily: FONT }}>
              ＋ 新增
            </button>
          )
        }>
          <FontAwesomeIcon icon={faClipboardList} style={{ fontSize: 12, marginRight: 5 }} />其他預訂
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
                <div style={{ width: 46, height: 46, borderRadius: 14, background: b.used ? '#E0E0E0' : typeInfo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, position: 'relative', color: b.used ? '#9A9A9A' : typeInfo.color }}>
                  <FontAwesomeIcon icon={BOOKING_TYPE_ICONS[b.type] || faEllipsis} />
                  {b.used && <span style={{ position: 'absolute', bottom: 0, right: 0, fontSize: 10, background: '#4A7A35', color: 'white', borderRadius: 6, padding: '1px 4px', fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0, textDecoration: b.used ? 'line-through' : 'none', wordBreak: 'break-word' }}>{b.title}</p>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: typeInfo.color, background: typeInfo.bg, borderRadius: 6, padding: '1px 6px' }}>{typeInfo.label}</span>
                    {b.used && <span style={{ fontSize: 10, fontWeight: 700, color: '#4A7A35', background: '#E0F0D8', borderRadius: 6, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 3 }}><FontAwesomeIcon icon={faSquareCheck} style={{ fontSize: 9 }} /> 已使用</span>}
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
                        style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.barkLight }}><FontAwesomeIcon icon={faPen} /></button>
                      <button onClick={() => handleDelete(b.id)} disabled={deleting === b.id}
                        style={{ width: 26, height: 26, borderRadius: 6, background: '#FAE0E0', border: 'none', color: '#9A3A3A', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: deleting === b.id ? 0.5 : 1 }}><FontAwesomeIcon icon={faTrashCan} /></button>
                    </div>
                  </div>
                )}
              </div>
              {/* Mark used button */}
              {!isReadOnly && (
                <button onClick={() => handleToggleUsed(b)} disabled={toggling === b.id}
                  style={{ marginBottom: 8, padding: '5px 12px', borderRadius: 10, border: `1.5px solid ${b.used ? '#4A7A35' : C.creamDark}`, background: b.used ? '#E0F0D8' : 'var(--tm-card-bg)', color: b.used ? '#4A7A35' : C.barkLight, fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: FONT }}>
                  {b.used ? '↩ 標記為未使用' : <><FontAwesomeIcon icon={faSquareCheck} style={{ fontSize: 10, marginRight: 4 }} />標記為已使用</>}
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
              {b.notes && <ExpandableNotes notes={b.notes} color={C.barkLight} margin="0 0 8px" />}
              <ParticipantAvatars ids={b.participants} />
              {!isVisitor && b.qrUrl && (
                <>
                  <button onClick={() => setShowQrFor(isQrOpen ? null : b.id)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${isQrOpen ? C.sageDark : C.creamDark}`, background: isQrOpen ? C.sage : 'var(--tm-card-bg)', color: isQrOpen ? 'white' : C.bark, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 }}>
                    <span>{isQrOpen ? '▲' : '▼'}</span>
                    {isQrOpen ? '收起 QR Code' : '📱 展開 QR Code'}
                  </button>
                  {isQrOpen && (
                    <div style={{ marginTop: 10, padding: 16, background: 'var(--tm-card-bg)', borderRadius: 14, border: `1.5px solid ${C.creamDark}`, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <img src={b.qrUrl} alt="QR Code" style={{ width: 200, height: 'auto', imageRendering: 'pixelated', borderRadius: 8, display: 'block', margin: '0 auto' }} />
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
                {editType === 'flight' ? '編輯航班' : editType === 'hotel' ? '編輯住宿' : '編輯租車/包車'}
              </p>
              <button onClick={() => setEditType(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* ── Flight form ── */}
              {editType === 'flight' && (<>
                {allFlightsForm.map((f, idx) => (
                  <div key={idx} style={{ border: `1.5px solid ${C.creamDark}`, borderRadius: 16, padding: '14px 12px', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(['去程', '回程'] as const).map(dir => (
                          <button key={dir} onClick={() => setFF(idx, 'direction', dir)}
                            style={{ padding: '5px 14px', borderRadius: 10, border: `1.5px solid ${f.direction === dir ? C.sageDark : C.creamDark}`, background: f.direction === dir ? C.sage : 'var(--tm-card-bg)', color: f.direction === dir ? 'white' : C.bark, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
                            {dir === '去程' ? <><FontAwesomeIcon icon={faPlane} style={{ marginRight: 4 }} />去程</> : '↩️ 回程'}
                          </button>
                        ))}
                      </div>
                      {allFlightsForm.length > 1 && (
                        <button onClick={() => setAllFlightsForm(prev => prev.filter((_, i) => i !== idx))}
                          style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: '#FAE0E0', color: '#9A3A3A', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>−</button>
                      )}
                    </div>
                    <Row>
                      <Field label="日期"><input style={inSt} type="date" value={f.date || ''} onChange={e => setFF(idx, 'date', e.target.value)} /></Field>
                      <Field label="航空公司"><input style={inSt} value={f.airline || ''} onChange={e => setFF(idx, 'airline', e.target.value)} /></Field>
                      <Field label="航班號"><input style={inSt} value={f.flightNo || ''} onChange={e => setFF(idx, 'flightNo', e.target.value)} /></Field>
                    </Row>
                    <p style={{ fontSize: 11, fontWeight: 700, color: C.barkLight, margin: '6px 0 4px' }}>出發</p>
                    <Row>
                      <Field label="機場代碼"><input style={inSt} value={f.dep?.airport || ''} onChange={e => setFDep(idx, 'airport', e.target.value)} /></Field>
                      <Field label="機場名稱"><input style={inSt} value={f.dep?.name || ''} onChange={e => setFDep(idx, 'name', e.target.value)} /></Field>
                      <Field label="時間"><input style={inSt} type="time" value={f.dep?.time || ''} onChange={e => setFDep(idx, 'time', e.target.value)} /></Field>
                    </Row>
                    <p style={{ fontSize: 11, fontWeight: 700, color: C.barkLight, margin: '6px 0 4px' }}>抵達</p>
                    <Row>
                      <Field label="機場代碼"><input style={inSt} value={f.arr?.airport || ''} onChange={e => setFArr(idx, 'airport', e.target.value)} /></Field>
                      <Field label="機場名稱"><input style={inSt} value={f.arr?.name || ''} onChange={e => setFArr(idx, 'name', e.target.value)} /></Field>
                      <Field label="時間"><input style={inSt} type="time" value={f.arr?.time || ''} onChange={e => setFArr(idx, 'time', e.target.value)} /></Field>
                    </Row>
                    <Field label="每人票價（NT$，選填）"><input style={inSt} type="number" value={f.costPerPerson || ''} onChange={e => setFF(idx, 'costPerPerson', e.target.value)} /></Field>
                    <Field label="備註"><textarea style={{ ...inSt, minHeight: 56, resize: 'vertical' as const, lineHeight: 1.6 }} value={f.notes || ''} onChange={e => setFF(idx, 'notes', e.target.value)} /></Field>
                  </div>
                ))}
                <button onClick={() => setAllFlightsForm(prev => [...prev, BLANK_FLIGHT('回程', prev.length)])}
                  style={{ width: '100%', padding: '10px', borderRadius: 12, border: `1.5px dashed ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                  ＋ 新增航班
                </button>
              </>)}

              {/* ── Hotel form ── */}
              {editType === 'hotel' && (<>
                <Field label="飯店名稱 *"><input style={inSt} value={editForm.name || ''} onChange={e => setF('name', e.target.value)} /></Field>
                <Field label="原文名稱（選填）"><input style={inSt} value={editForm.nameLocal || ''} onChange={e => setF('nameLocal', e.target.value)} /></Field>
                <Row>
                  <Field label="Check-in 日期"><input style={inSt} type="date" value={splitDT(editForm.checkIn).date} onChange={e => setF('checkIn', joinDT(e.target.value, splitDT(editForm.checkIn).time || '14:00'))} /></Field>
                  <Field label="時間">
                    <select style={selSt} value={splitDT(editForm.checkIn).time || '14:00'} onChange={e => setF('checkIn', joinDT(splitDT(editForm.checkIn).date, e.target.value))}>
                      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                </Row>
                <Row>
                  <Field label="Check-out 日期"><input style={inSt} type="date" value={splitDT(editForm.checkOut).date} onChange={e => setF('checkOut', joinDT(e.target.value, splitDT(editForm.checkOut).time || '11:00'))} /></Field>
                  <Field label="時間">
                    <select style={selSt} value={splitDT(editForm.checkOut).time || '11:00'} onChange={e => setF('checkOut', joinDT(splitDT(editForm.checkOut).date, e.target.value))}>
                      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                </Row>
                <Field label="訂單編號 *"><input style={inSt} value={editForm.confirmCode || ''} onChange={e => setF('confirmCode', e.target.value)} /></Field>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>幣別</label>
                  <CurrencyPicker
                    value={editForm.currency || projCurrency}
                    onChange={v => setF('currency', v)}
                    projCurrency={projCurrency}
                  />
                </div>
                <Row>
                  <Field label="總費用（選填）"><AmountInput value={editForm.totalCost || ''} onChange={v => setF('totalCost', v)} /></Field>
                  <Field label="每人分攤（選填）"><AmountInput value={editForm.costPerPerson || ''} onChange={v => setF('costPerPerson', v)} /></Field>
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
                {/* Mode toggle */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 8 }}>類型</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {([{ v: 'rental', e: '🚗', l: '租車' }, { v: 'charter', e: '🚐', l: '包車/司機' }] as const).map(({ v, e, l }) => (
                      <button key={v} onClick={() => setF('carMode', v)}
                        style={{ flex: 1, padding: '10px 4px', borderRadius: 12, border: `1.5px solid ${(editForm.carMode || 'rental') === v ? C.earth : C.creamDark}`, background: (editForm.carMode || 'rental') === v ? C.earth : 'var(--tm-card-bg)', color: (editForm.carMode || 'rental') === v ? 'white' : C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                        {e} {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Company / driver name */}
                <Field label={(editForm.carMode || 'rental') === 'charter' ? '司機/包車公司名稱' : '租車公司'}>
                  <input style={inSt} value={editForm.company || ''} onChange={e => setF('company', e.target.value)} />
                </Field>

                {/* Rental-only: car type */}
                {(editForm.carMode || 'rental') === 'rental' && (
                  <Field label="車型"><input style={inSt} placeholder="S級別 1台" value={editForm.carType || ''} onChange={e => setF('carType', e.target.value)} /></Field>
                )}

                {/* Charter-only: seats + contact */}
                {(editForm.carMode || 'rental') === 'charter' && (
                  <Row>
                    <Field label="座位數（選填）"><input style={inSt} placeholder="8人座" value={editForm.seats || ''} onChange={e => setF('seats', e.target.value)} /></Field>
                    <Field label="司機電話/LINE（選填）"><input style={inSt} placeholder="+62 812..." value={editForm.contactInfo || ''} onChange={e => setF('contactInfo', e.target.value)} /></Field>
                  </Row>
                )}

                {/* Pickup */}
                <Field label={(editForm.carMode || 'rental') === 'charter' ? '出發地點' : '取車地點'}>
                  <input style={inSt} value={editForm.pickupLocation || ''} onChange={e => setF('pickupLocation', e.target.value)} />
                </Field>
                <Row>
                  <Field label={(editForm.carMode || 'rental') === 'charter' ? '出發日期' : '取車日期'}>
                    <input style={inSt} type="date" value={splitDT(editForm.pickupTime).date} onChange={e => setF('pickupTime', joinDT(e.target.value, splitDT(editForm.pickupTime).time || '09:00'))} />
                  </Field>
                  <Field label="時間">
                    <select style={selSt} value={splitDT(editForm.pickupTime).time || '09:00'} onChange={e => setF('pickupTime', joinDT(splitDT(editForm.pickupTime).date, e.target.value))}>
                      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                </Row>

                {/* Return */}
                <Field label={(editForm.carMode || 'rental') === 'charter' ? '結束地點（選填）' : '還車地點'}>
                  <input style={inSt} value={editForm.returnLocation || ''} onChange={e => setF('returnLocation', e.target.value)} />
                </Field>
                <Row>
                  <Field label={(editForm.carMode || 'rental') === 'charter' ? '結束日期（選填）' : '還車日期'}>
                    <input style={inSt} type="date" value={splitDT(editForm.returnTime).date} onChange={e => setF('returnTime', joinDT(e.target.value, splitDT(editForm.returnTime).time || '18:00'))} />
                  </Field>
                  <Field label="時間">
                    <select style={selSt} value={splitDT(editForm.returnTime).time || '18:00'} onChange={e => setF('returnTime', joinDT(splitDT(editForm.returnTime).date, e.target.value))}>
                      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                </Row>

                {/* Currency + cost */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>幣別</label>
                  <CurrencyPicker value={editForm.currency || projCurrency} onChange={v => setF('currency', v)} projCurrency={projCurrency} />
                </div>
                <Field label="總費用（選填）"><AmountInput value={editForm.totalCost || ''} onChange={v => setF('totalCost', v)} /></Field>
                <Field label="預約編號（選填）"><input style={inSt} value={editForm.confirmCode || ''} onChange={e => setF('confirmCode', e.target.value)} /></Field>
                <Field label="備註"><textarea style={{ ...inSt, minHeight: 60, resize: 'vertical' as const, lineHeight: 1.6 }} value={editForm.notes || ''} onChange={e => setF('notes', e.target.value)} /></Field>

                {/* QR Code */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>QR Code（選填）</label>
                  <input ref={carQrFileRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={async e => { const f = e.target.files?.[0]; if (f) await handleUploadCarQR(f); e.target.value = ''; }} />
                  {editForm.qrUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)' }}>
                      <img src={editForm.qrUrl} alt="QR" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'contain' }} />
                      <div>
                        <p style={{ fontSize: 11, color: '#4A7A35', fontWeight: 700, margin: 0 }}>✓ 已上傳</p>
                        <button onClick={() => setF('qrUrl', '')} style={{ fontSize: 11, color: '#9A3A3A', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT, fontWeight: 600 }}>✕ 移除</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => carQrFileRef.current?.click()} disabled={uploadingCarQr}
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `2px dashed ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 600, fontSize: 13, cursor: uploadingCarQr ? 'default' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxSizing: 'border-box' }}>
                      {uploadingCarQr ? '⏳ 上傳中...' : '📱 上傳 QR Code 圖片'}
                    </button>
                  )}
                </div>
              </>)}

              <ParticipantSelector value={editParticipants} onChange={setEditParticipants} />

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

      {/* ── 單航班編輯 modal ── */}
      {editFlightIdx !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}
          onClick={e => { if (e.target === e.currentTarget) setEditFlightIdx(null); }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><FontAwesomeIcon icon={faPlane} style={{ fontSize: 14 }} />編輯航班</p>
              <button onClick={() => setEditFlightIdx(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Direction */}
              <div style={{ display: 'flex', gap: 6 }}>
                {(['去程', '回程'] as const).map(dir => (
                  <button key={dir} onClick={() => setSF('direction', dir)}
                    style={{ padding: '5px 18px', borderRadius: 10, border: `1.5px solid ${singleFlightForm.direction === dir ? C.sageDark : C.creamDark}`, background: singleFlightForm.direction === dir ? C.sage : 'var(--tm-card-bg)', color: singleFlightForm.direction === dir ? 'white' : C.bark, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
                    {dir === '去程' ? <><FontAwesomeIcon icon={faPlane} style={{ marginRight: 4 }} />去程</> : '↩️ 回程'}
                  </button>
                ))}
              </div>
              <Row>
                <Field label="日期"><input style={inSt} type="date" value={singleFlightForm.date || ''} onChange={e => setSF('date', e.target.value)} /></Field>
                <Field label="航空公司"><input style={inSt} value={singleFlightForm.airline || ''} onChange={e => setSF('airline', e.target.value)} /></Field>
                <Field label="航班號"><input style={inSt} value={singleFlightForm.flightNo || ''} onChange={e => setSF('flightNo', e.target.value)} /></Field>
              </Row>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.barkLight, margin: '2px 0 0' }}>出發</p>
              <Row>
                <Field label="機場代碼"><input style={inSt} value={singleFlightForm.dep?.airport || ''} onChange={e => setSFDep('airport', e.target.value)} /></Field>
                <Field label="機場名稱"><input style={inSt} value={singleFlightForm.dep?.name || ''} onChange={e => setSFDep('name', e.target.value)} /></Field>
                <Field label="時間"><input style={inSt} type="time" value={singleFlightForm.dep?.time || ''} onChange={e => setSFDep('time', e.target.value)} /></Field>
              </Row>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.barkLight, margin: '2px 0 0' }}>抵達</p>
              <Row>
                <Field label="機場代碼"><input style={inSt} value={singleFlightForm.arr?.airport || ''} onChange={e => setSFArr('airport', e.target.value)} /></Field>
                <Field label="機場名稱"><input style={inSt} value={singleFlightForm.arr?.name || ''} onChange={e => setSFArr('name', e.target.value)} /></Field>
                <Field label="時間"><input style={inSt} type="time" value={singleFlightForm.arr?.time || ''} onChange={e => setSFArr('time', e.target.value)} /></Field>
              </Row>
              <Field label="每人票價（選填）"><input style={inSt} type="number" value={singleFlightForm.costPerPerson || ''} onChange={e => setSF('costPerPerson', e.target.value)} /></Field>
              <Field label="備註（選填）"><textarea style={{ ...inSt, minHeight: 56, resize: 'vertical' as const, lineHeight: 1.6 }} value={singleFlightForm.notes || ''} onChange={e => setSF('notes', e.target.value)} /></Field>
              <ParticipantSelector value={singleFlightParticipants} onChange={setSingleFlightParticipants} />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button onClick={() => setEditFlightIdx(null)}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>取消</button>
                <button onClick={handleSingleFlightSave} disabled={staticSaving}
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
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><FontAwesomeIcon icon={editBookingId ? faPen : faClipboardList} style={{ fontSize: 14 }} />{editBookingId ? '修改預訂' : '新增預訂'}</p>
              <button onClick={closeCustomForm} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lblSt}>類型</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {Object.entries(BOOKING_TYPES).map(([key, info]) => (
                    <button key={key} onClick={() => setC('type', key)}
                      style={{ padding: '9px 10px', borderRadius: 12, border: `2px solid ${customForm.type === key ? info.color : '#E0D9C8'}`, background: customForm.type === key ? info.bg : 'var(--tm-card-bg)', color: info.color, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <FontAwesomeIcon icon={BOOKING_TYPE_ICONS[key] || faEllipsis} style={{ fontSize: 12 }} /> {info.label}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="預訂名稱 *"><input style={inSt} placeholder="台北101門票" value={customForm.title} onChange={e => setC('title', e.target.value)} /></Field>
              <Field label="日期（選填）"><input style={{ ...inSt, padding: '10px 8px' }} type="date" value={customForm.date} onChange={e => setC('date', e.target.value)} /></Field>
              <Field label="訂單編號（選填）"><input style={inSt} placeholder="預訂確認碼" value={customForm.confirmCode} onChange={e => setC('confirmCode', e.target.value)} /></Field>
              <div>
                <label style={lblSt}>幣別</label>
                <CurrencyPicker
                  value={customForm.currency}
                  onChange={v => setC('currency', v)}
                  projCurrency={projCurrency}
                />
              </div>
              <Field label="費用（選填）"><input style={inSt} type="number" placeholder="0" value={customForm.cost} onChange={e => setC('cost', e.target.value)} /></Field>
              <Field label="備註（選填）"><textarea style={{ ...inSt, minHeight: 60, resize: 'vertical' as const, lineHeight: 1.6 }} placeholder="注意事項..." value={customForm.notes} onChange={e => setC('notes', e.target.value)} /></Field>
              <ParticipantSelector value={customParticipants} onChange={setCustomParticipants} />
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

      {/* ── 費用匯入確認 modal ── */}
      {expensePrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: '0 20px' }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: 24, padding: '28px 24px', width: '100%', maxWidth: 360, fontFamily: FONT, boxSizing: 'border-box' }}>
            <p style={{ fontSize: 20, textAlign: 'center', margin: '0 0 8px', color: C.earth }}>💰</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#5C4A38', margin: '0 0 8px', textAlign: 'center' }}>是否新增至記帳？</p>
            <p style={{ fontSize: 13, color: '#8C7B6E', margin: '0 0 10px', textAlign: 'center', lineHeight: 1.6 }}>
              偵測到費用 <strong>{expensePrompt.currency === 'TWD' ? 'NT$' : expensePrompt.currency === 'IDR' ? 'Rp' : '¥'} {expensePrompt.amount.toLocaleString()}</strong>，是否同步新增至記帳？
            </p>
            {expensePrompt.participantNames && expensePrompt.participantNames.length > 0 ? (
              <div style={{ background: '#EAF3DE', borderRadius: 10, padding: '8px 12px', marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: '#4A7A35', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 4 }}><FontAwesomeIcon icon={faSquareCheck} style={{ fontSize: 10 }} /> 將自動分帳給：<strong>{expensePrompt.participantNames.join('、')}</strong></p>
                <p style={{ fontSize: 11, color: '#9A6800', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}><FontAwesomeIcon icon={faLightbulb} style={{ fontSize: 10 }} /> 請記得至記帳填寫付款人</p>
              </div>
            ) : (
              <div style={{ background: '#FFF2CC', borderRadius: 10, padding: '8px 12px', marginBottom: 16, textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#9A6800', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}><FontAwesomeIcon icon={faCircleExclamation} style={{ fontSize: 10 }} /> 尚未設定參與人，新增後請至記帳確認分帳對象</p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setExpensePrompt(null)}
                style={{ flex: 1, padding: '12px', borderRadius: 14, border: '1.5px solid var(--tm-cream-dark)', background: 'var(--tm-card-bg)', color: '#8C7B6E', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: FONT }}>
                略過
              </button>
              <button onClick={handleExpenseImport} disabled={expenseSaving}
                style={{ flex: 2, padding: '12px', borderRadius: 14, border: 'none', background: '#6A9A5A', color: 'white', fontWeight: 700, fontSize: 14, cursor: expenseSaving ? 'default' : 'pointer', fontFamily: FONT, opacity: expenseSaving ? 0.6 : 1 }}>
                {expenseSaving ? '新增中...' : '✓ 新增至記帳'}
              </button>
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

function AmountInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [focused, setFocused] = useState(false);
  const raw = String(value || '');
  const display = focused || !raw ? raw : Number(raw).toLocaleString();
  return (
    <input style={inSt} inputMode="numeric" value={display} placeholder={placeholder || '0'}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
    />
  );
}
