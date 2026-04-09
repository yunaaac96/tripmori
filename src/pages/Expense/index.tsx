import { useState, useEffect, useRef } from 'react';
import { C, FONT, EXPENSE_CATEGORY_MAP, JPY_TO_TWD, cardStyle, inputStyle, btnPrimary } from '../../App';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import PageHeader from '../../components/layout/PageHeader';

type SplitMode = 'equal' | 'weighted' | 'amount';
type SortMode = 'newest' | 'oldest' | 'largest';
type Currency = 'JPY' | 'TWD' | 'KRW' | 'IDR' | 'EUR' | 'USD';

const EMPTY_FORM = {
  description: '', amount: '', currency: 'JPY' as Currency,
  category: 'food', payer: '',
  paymentMethod: 'cash' as 'cash' | 'card',
  splitMode: 'equal' as SplitMode,
  splitWith: [] as string[],
  percentages: {} as Record<string, number>,
  customAmounts: {} as Record<string, string>,
  subItems: [] as { name: string; amount: string }[],
  date: '', notes: '', receiptUrl: '',
};

// Currency display helpers
const CURRENCY_DISPLAY: Record<Currency, { symbol: string; label: string }> = {
  JPY: { symbol: '¥',   label: 'JPY 日圓'    },
  TWD: { symbol: 'NT$', label: 'TWD 台幣'    },
  KRW: { symbol: '₩',   label: 'KRW 韓圓'   },
  IDR: { symbol: 'Rp',  label: 'IDR 印尼盾' },
  EUR: { symbol: '€',   label: 'EUR 歐元'    },
  USD: { symbol: '$',   label: 'USD 美元'    },
};

// ── SVG Pie Chart ──────────────────────────────────────────────────────────
const PIE_COLORS: Record<string, string> = {
  transport: '#A8CADF',
  food: '#F7D87C',
  attraction: '#A8D89C',
  shopping: '#F0A8A8',
  hotel: '#C8B0E0',
  other: '#C8C8C8',
};

function PieChart({ data }: { data: { key: string; value: number; label: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  let cumAngle = -Math.PI / 2;
  const cx = 80, cy = 80, r = 68;

  const slices = data.map(d => {
    const angle = (d.value / total) * 2 * Math.PI;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { ...d, path, angle };
  });

  return (
    <svg viewBox="0 0 160 160" style={{ width: 130, height: 130, flexShrink: 0 }}>
      {slices.map(s => (
        <path key={s.key} d={s.path} fill={PIE_COLORS[s.key] || '#C8C8C8'} stroke="white" strokeWidth={1.5} />
      ))}
    </svg>
  );
}

// ── Settlement Form ────────────────────────────────────────────────────────
function SettlementForm({ memberNames, onAdd, onClose, firestore }: {
  memberNames: string[];
  onAdd: (from: string, to: string, amount: string, currency: string) => Promise<void>;
  onClose: () => void;
  firestore: any;
}) {
  const [from, setFrom] = useState(memberNames[0] || '');
  const [to, setTo] = useState(memberNames[1] || memberNames[0] || '');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'TWD' | 'JPY'>('TWD');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!from || !to || !amount || from === to) return;
    setSaving(true);
    await onAdd(from, to, amount, currency);
    setSaving(false);
    onClose();
  };

  const iStyle: React.CSSProperties = { ...inputStyle, fontSize: 16 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 400 }}>
      <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>💸 記錄結清</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>付款人（誰還錢）</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {memberNames.map(n => (
                <button key={n} onClick={() => setFrom(n)}
                  style={{ flex: 1, minWidth: 60, padding: '10px 8px', borderRadius: 12, border: `1.5px solid ${from === n ? C.sageDark : C.creamDark}`, background: from === n ? C.sage : 'var(--tm-card-bg)', color: from === n ? 'white' : C.bark, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 13 }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>收款人（收誰的）</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {memberNames.map(n => (
                <button key={n} onClick={() => setTo(n)}
                  style={{ flex: 1, minWidth: 60, padding: '10px 8px', borderRadius: 12, border: `1.5px solid ${to === n ? C.sageDark : C.creamDark}`, background: to === n ? C.earth : 'var(--tm-card-bg)', color: to === n ? 'white' : C.bark, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 13 }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>金額 *</label>
              <input style={iStyle} type="number" inputMode="decimal" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>幣別</label>
              <select style={{ ...iStyle, width: 80 }} value={currency} onChange={e => setCurrency(e.target.value as 'TWD' | 'JPY')}>
                <option value="TWD">TWD</option>
                <option value="JPY">JPY</option>
              </select>
            </div>
          </div>
          {from === to && from && <p style={{ fontSize: 12, color: '#9A3A3A', margin: 0 }}>付款人與收款人不能相同</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 14 }}>
              取消
            </button>
            <button onClick={handleSubmit} disabled={saving || !from || !to || !amount || from === to}
              style={{ ...btnPrimary(C.sageDark), flex: 2, opacity: saving || !from || !to || !amount || from === to ? 0.6 : 1 }}>
              {saving ? '儲存中...' : '✓ 記錄結清'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function ExpensePage({ expenses, members, firestore, project }: any) {
  const { db, TRIP_ID, Timestamp, addDoc, deleteDoc, doc, collection, isReadOnly, updateDoc, role } = firestore;
  const isVisitor = isReadOnly;
  const isOwner = role === 'owner';
  const currentUserName = localStorage.getItem('tripmori_current_user') || '';

  const projCurrency = (project?.currency || 'JPY') as Currency;
  const defaultForm = { ...EMPTY_FORM, currency: projCurrency };

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...defaultForm });
  const [showSubItems, setShowSubItems] = useState(false);
  const [expandedExpense, setExpandedExpense] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filter / Sort
  const [filterCat, setFilterCat] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  // Pie chart — auto-expand for visitors
  const [showPie, setShowPie] = useState(false);
  useEffect(() => { if (isVisitor) setShowPie(true); }, [isVisitor]);

  // Settlement
  const [showSettleForm, setShowSettleForm] = useState(false);

  // Receipt photo attachment
  const descRef = useRef<HTMLInputElement>(null);
  const receiptRef = useRef<HTMLInputElement>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);

  useEffect(() => {
    if (showForm) {
      const t = setTimeout(() => { descRef.current?.focus(); }, 350);
      return () => clearTimeout(t);
    }
  }, [showForm]);

  const memberNames: string[] = members.length > 0 ? members.map((m: any) => m.name) : ['uu', 'brian'];

  // Approximate exchange rates to TWD (for display convenience)
  const CURRENCY_TO_TWD: Record<string, number> = {
    JPY: JPY_TO_TWD, TWD: 1, KRW: 0.024, IDR: 0.0021, EUR: 34, USD: 32,
  };
  const toTWD = (amount: number, currency: string) =>
    Math.round(amount * (CURRENCY_TO_TWD[currency] ?? 1));

  // ── Percentage split helpers ─────────────────────────────────────────────
  const getEqualPcts = (names: string[]) => {
    if (names.length === 0) return {} as Record<string, number>;
    const base = Math.floor(100 / names.length / 5) * 5;
    const remainder = 100 - base * names.length;
    const pcts: Record<string, number> = {};
    names.forEach((n, i) => { pcts[n] = base + (i === 0 ? remainder : 0); });
    return pcts;
  };

  const normalizePcts = (pcts: Record<string, number>, changedName: string, newVal: number) => {
    const names = Object.keys(pcts);
    const others = names.filter(n => n !== changedName);
    const remaining = 100 - newVal;
    const otherTotal = others.reduce((s, n) => s + pcts[n], 0);
    const result: Record<string, number> = { ...pcts, [changedName]: newVal };
    if (otherTotal === 0) {
      const perOther = Math.floor(remaining / others.length / 5) * 5;
      const leftover = remaining - perOther * others.length;
      others.forEach((n, i) => { result[n] = perOther + (i === 0 ? leftover : 0); });
    } else {
      let distributed = 0;
      others.forEach((n, i) => {
        if (i === others.length - 1) {
          result[n] = remaining - distributed;
        } else {
          const share = Math.round((pcts[n] / otherTotal) * remaining / 5) * 5;
          result[n] = Math.max(5, share);
          distributed += result[n];
        }
      });
      // Fix if total != 100
      const total = Object.values(result).reduce((s, v) => s + v, 0);
      if (total !== 100) {
        const diff = 100 - total;
        const adjustTarget = others[0];
        result[adjustTarget] = Math.max(5, result[adjustTarget] + diff);
      }
    }
    return result;
  };

  const setPercentage = (name: string, delta: number) => {
    setForm(p => {
      const activeMems = p.splitWith.length > 0 ? p.splitWith : memberNames;
      let pcts = { ...p.percentages };
      if (Object.keys(pcts).length === 0) pcts = getEqualPcts(activeMems);
      const cur = pcts[name] ?? Math.floor(100 / activeMems.length / 5) * 5;
      const newVal = Math.min(100 - (activeMems.length - 1) * 5, Math.max(5, cur + delta));
      const updated = normalizePcts(pcts, name, newVal);
      return { ...p, percentages: updated };
    });
  };

  const getActivePcts = () => {
    const activeMems = form.splitWith.length > 0 ? form.splitWith : memberNames;
    const pcts = form.percentages;
    if (Object.keys(pcts).length === 0) return getEqualPcts(activeMems);
    // ensure all active members are present
    const result = { ...pcts };
    activeMems.forEach(n => { if (result[n] == null) result[n] = 5; });
    return result;
  };

  // ── Receipt photo upload ────────────────────────────────────────────────
  const handleReceiptUpload = async (file: File) => {
    if (!TRIP_ID) return;
    setReceiptUploading(true);
    try {
      const storage = getStorage();
      const sRef = storageRef(storage, `receipts/${TRIP_ID}/${Date.now()}_${file.name}`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      set('receiptUrl', url);
    } catch (e) { console.error('附件上傳失敗:', e); alert('上傳失敗，請重試'); }
    setReceiptUploading(false);
  };

  // ── Form helpers ─────────────────────────────────────────────────────────
  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));

  const toggleSplitMember = (name: string) => {
    setForm(p => ({
      ...p,
      splitWith: p.splitWith.includes(name)
        ? p.splitWith.filter(n => n !== name)
        : [...p.splitWith, name],
      percentages: {},
    }));
  };

  const setCustomAmount = (name: string, val: string) => {
    setForm(p => ({ ...p, customAmounts: { ...p.customAmounts, [name]: val } }));
  };

  const addSubItem = () => {
    setForm(p => ({ ...p, subItems: [...p.subItems, { name: '', amount: '' }] }));
  };

  const updateSubItem = (idx: number, field: 'name' | 'amount', val: string) => {
    setForm(p => {
      const items = [...p.subItems];
      items[idx] = { ...items[idx], [field]: val };
      return { ...p, subItems: items };
    });
  };

  const removeSubItem = (idx: number) => {
    setForm(p => ({ ...p, subItems: p.subItems.filter((_, i) => i !== idx) }));
  };

  const closeForm = () => {
    setShowForm(false);
    setShowSubItems(false);
    setForm({ ...defaultForm });
    setEditingId(null);
  };

  const openEdit = (e: any) => {
    setForm({
      description: e.description || '',
      amount: String(e.amount || ''),
      currency: e.currency || 'JPY',
      category: e.category || 'food',
      payer: e.payer || '',
      paymentMethod: e.paymentMethod || 'cash',
      splitMode: e.splitMode || 'equal',
      splitWith: e.splitWith || [],
      percentages: e.percentages || {},
      customAmounts: e.customAmounts || {},
      subItems: e.subItems || [],
      date: e.date || '',
      notes: e.notes || '',
      receiptUrl: e.receiptUrl || '',
    });
    setEditingId(e.id);
    setShowForm(true);
  };

  // ── Computed values ──────────────────────────────────────────────────────
  const activeSplitMembers = form.splitMode === 'equal' && form.splitWith.length > 0
    ? form.splitWith
    : memberNames;

  const mainAmt = Number(form.amount) || 0;
  const mainAmtTWD = toTWD(mainAmt, form.currency);

  const customTotal = Object.values(form.customAmounts).reduce((s, v) => s + (Number(v) || 0), 0);
  const customRemaining = mainAmt - customTotal;

  const subItemTotal = form.subItems.reduce((s, si) => s + (Number(si.amount) || 0), 0);

  // ── Save / Update ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (isReadOnly) return;
    if (!form.description || !form.amount || !form.payer) return;
    setSaving(true);
    const amt = Number(form.amount);
    const amtTWD = toTWD(amt, form.currency);

    let splitWith = memberNames;
    if (form.splitMode === 'equal' && form.splitWith.length > 0) splitWith = form.splitWith;

    const pcts = form.splitMode === 'weighted' ? getActivePcts() : {};

    const payload: any = {
      description: form.description,
      amount: amt, currency: form.currency, amountTWD: amtTWD,
      category: form.category, payer: form.payer,
      paymentMethod: form.paymentMethod,
      splitMode: form.splitMode,
      splitWith,
      percentages: form.splitMode === 'weighted' ? pcts : {},
      customAmounts: form.splitMode === 'amount' ? form.customAmounts : {},
      subItems: form.subItems.filter(si => si.name.trim()),
      date: form.date || new Date().toISOString().slice(0, 10),
      notes: form.notes,
      receiptUrl: form.receiptUrl || '',
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'trips', TRIP_ID, 'expenses', editingId), payload);
      } else {
        payload.createdAt = Timestamp.now();
        payload.createdBy = currentUserName; // track creator for delete permissions
        await addDoc(collection(db, 'trips', TRIP_ID, 'expenses'), payload);
      }
    } catch (e) { console.error(e); }
    setSaving(false);
    closeForm();
  };

  const canDeleteExpense = (e: any) =>
    !isReadOnly && (isOwner || (currentUserName && e.createdBy === currentUserName));

  const handleDelete = async (id: string, expense: any) => {
    if (!canDeleteExpense(expense)) return;
    await deleteDoc(doc(db, 'trips', TRIP_ID, 'expenses', id));
  };

  // ── Settlement add ───────────────────────────────────────────────────────
  const handleAddSettlement = async (from: string, to: string, amount: string, currency: string) => {
    const amt = Number(amount);
    const amtTWD = toTWD(amt, currency);
    const payload = {
      description: '結清款項',
      amount: amt, currency, amountTWD: amtTWD,
      category: 'settlement',
      payer: from,
      paymentMethod: 'cash',
      splitMode: 'equal',
      splitWith: [to],
      percentages: {},
      customAmounts: {},
      subItems: [],
      date: new Date().toISOString().slice(0, 10),
      notes: `${from} → ${to}`,
      createdAt: Timestamp.now(),
    };
    await addDoc(collection(db, 'trips', TRIP_ID, 'expenses'), payload);
  };

  // ── Stats ────────────────────────────────────────────────────────────────
  const toTWDCalc = (amount: number, currency: string) =>
    Math.round(amount * (CURRENCY_TO_TWD[currency] ?? 1));

  const memberStats = memberNames.map(name => {
    const paid = expenses
      .filter((e: any) => e.payer === name)
      .reduce((s: number, e: any) => s + (e.amountTWD || toTWDCalc(e.amount || 0, e.currency || 'JPY')), 0);

    const owed = expenses.reduce((s: number, e: any) => {
      const sw: string[] = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
      if (!sw.includes(name)) return s;
      const eAmt = e.amountTWD || toTWDCalc(e.amount || 0, e.currency || 'JPY');
      if (e.splitMode === 'weighted' && e.percentages && Object.keys(e.percentages).length > 0) {
        const pct = e.percentages[name] ?? Math.floor(100 / sw.length);
        return s + Math.ceil(eAmt * pct / 100);
      }
      if (e.splitMode === 'amount' && e.customAmounts && e.customAmounts[name] != null) {
        return s + toTWDCalc(Number(e.customAmounts[name]) || 0, e.currency || 'JPY');
      }
      return s + Math.ceil(eAmt / sw.length);
    }, 0);

    const net = paid - owed; // positive = should receive, negative = should pay
    return { name, paid, owed, net };
  });

  // Settlement algorithm: creditors receive from debtors
  const settlements: { from: string; to: string; amount: number }[] = [];
  const netCopy = memberStats.map(ms => ({ name: ms.name, net: ms.net }));
  const creditors = netCopy.filter(m => m.net > 0).sort((a, b) => b.net - a.net);
  const debtors = netCopy.filter(m => m.net < 0).sort((a, b) => a.net - b.net);
  let ci = 0, di = 0;
  const cAmts = creditors.map(c => c.net);
  const dAmts = debtors.map(d => Math.abs(d.net));
  while (ci < creditors.length && di < debtors.length) {
    const transfer = Math.min(cAmts[ci], dAmts[di]);
    if (transfer > 0) {
      settlements.push({ from: debtors[di].name, to: creditors[ci].name, amount: Math.ceil(transfer) });
    }
    cAmts[ci] -= transfer;
    dAmts[di] -= transfer;
    if (cAmts[ci] < 1) ci++;
    if (dAmts[di] < 1) di++;
  }

  // Build per-member settlement totals for card display (consistent with suggestion row)
  const settlementReceive: Record<string, number> = {};
  const settlementPay: Record<string, number> = {};
  settlements.forEach(s => {
    settlementReceive[s.to]   = (settlementReceive[s.to]   || 0) + s.amount;
    settlementPay[s.from]     = (settlementPay[s.from]     || 0) + s.amount;
  });

  // ── Category breakdown ───────────────────────────────────────────────────
  const nonSettlementExpenses = expenses.filter((e: any) => e.category !== 'settlement');
  const totalTWD = expenses.reduce(
    (s: number, e: any) => s + (e.amountTWD || toTWDCalc(e.amount || 0, e.currency || 'JPY')),
    0
  );
  const categoryBreakdown = Object.entries(EXPENSE_CATEGORY_MAP).map(([key, info]) => {
    const total = nonSettlementExpenses
      .filter((e: any) => e.category === key)
      .reduce((s: number, e: any) => s + (e.amountTWD || toTWDCalc(e.amount || 0, e.currency || 'JPY')), 0);
    return { key, label: info.label, emoji: info.emoji, value: total };
  }).filter(d => d.value > 0);
  const catTotal = categoryBreakdown.reduce((s, d) => s + d.value, 0);

  // ── Filter / Sort logic ──────────────────────────────────────────────────
  const FILTER_CATS = [
    { key: 'all', label: '全部' },
    { key: 'transport', label: '交通' },
    { key: 'food', label: '美食' },
    { key: 'attraction', label: '景點' },
    { key: 'shopping', label: '購物' },
    { key: 'hotel', label: '住宿' },
    { key: 'other', label: '其他' },
    { key: 'settlement', label: '結清' },
  ];

  const filteredExpenses = expenses
    .filter((e: any) => filterCat === 'all' || e.category === filterCat)
    .sort((a: any, b: any) => {
      if (sortMode === 'newest') return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      if (sortMode === 'oldest') return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
      // largest
      const aAmt = a.amountTWD || toTWDCalc(a.amount || 0, a.currency || 'JPY');
      const bAmt = b.amountTWD || toTWDCalc(b.amount || 0, b.currency || 'JPY');
      return bAmt - aAmt;
    });

  const splitModeLabel = (e: any) => {
    const sw: string[] = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
    if (e.splitMode === 'weighted') return '比例分帳';
    if (e.splitMode === 'amount') return '自訂金額';
    return `均分 ${sw.length}人`;
  };

  const iStyle: React.CSSProperties = { ...inputStyle, fontSize: 16 };

  const sortLabels: Record<SortMode, string> = {
    newest: '最新 ↓',
    oldest: '最舊 ↓',
    largest: '最大 ↓',
  };
  const nextSort: Record<SortMode, SortMode> = { newest: 'oldest', oldest: 'largest', largest: 'newest' };

  const activePcts = getActivePcts();

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT }}>

      {/* ── Settlement Form Modal ── */}
      {showSettleForm && (
        <SettlementForm
          memberNames={memberNames}
          onAdd={handleAddSettlement}
          onClose={() => setShowSettleForm(false)}
          firestore={firestore}
        />
      )}

      {/* ── Expense Form Modal ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '93vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>
                {editingId ? '✏️ 修改支出' : '💰 新增支出'}
              </p>
              <button onClick={closeForm}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Description */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>名稱 *</label>
                <input ref={descRef} style={iStyle} placeholder="例：藥妝店購物" value={form.description} onChange={e => set('description', e.target.value)} />
              </div>

              {/* Amount + Currency */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>金額 *</label>
                  <input style={iStyle} type="number" inputMode="decimal" placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>幣別</label>
                  <select style={{ ...iStyle, width: 90 }} value={form.currency} onChange={e => set('currency', e.target.value as Currency)}>
                    {(Object.keys(CURRENCY_DISPLAY) as Currency[]).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              {form.amount && (
                <p style={{ fontSize: 12, color: C.barkLight, margin: '-6px 0 0', textAlign: 'right' }}>
                  ≈ NT$ {toTWD(Number(form.amount), form.currency).toLocaleString()}
                </p>
              )}

              {/* Payment Method */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>付款方式</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['cash', 'card'] as const).map(m => (
                    <button key={m} onClick={() => set('paymentMethod', m)}
                      style={{ flex: 1, padding: '9px 8px', borderRadius: 12, border: `1.5px solid ${form.paymentMethod === m ? C.sageDark : C.creamDark}`, background: form.paymentMethod === m ? C.sageLight : 'var(--tm-card-bg)', color: C.bark, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                      {m === 'cash' ? '💵 現金' : '💳 刷卡'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>類別</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(EXPENSE_CATEGORY_MAP).map(([key, info]) => (
                    <button key={key} onClick={() => set('category', key)}
                      style={{ padding: '6px 12px', borderRadius: 10, border: `1.5px solid ${form.category === key ? C.sageDark : C.creamDark}`, background: form.category === key ? info.bg : 'var(--tm-card-bg)', color: C.bark, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
                      {info.emoji} {info.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payer */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>誰付款 *</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {memberNames.map((name: string) => (
                    <button key={name} onClick={() => set('payer', name)}
                      style={{ flex: 1, minWidth: 60, padding: '10px 8px', borderRadius: 12, border: `1.5px solid ${form.payer === name ? C.sageDark : C.creamDark}`, background: form.payer === name ? C.sage : 'var(--tm-card-bg)', color: form.payer === name ? 'white' : C.bark, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 13 }}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Split Mode */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>分帳方式</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                  {([['equal', '⚖️', '均分'], ['weighted', '%', '比例'], ['amount', '✍️', '自訂金額']] as [SplitMode, string, string][]).map(([mode, icon, label]) => (
                    <button key={mode} onClick={() => set('splitMode', mode)}
                      style={{ padding: '9px 4px', borderRadius: 12, border: `1.5px solid ${form.splitMode === mode ? C.sageDark : C.creamDark}`, background: form.splitMode === mode ? C.sageLight : 'var(--tm-card-bg)', color: C.bark, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
                      {icon} {label}
                    </button>
                  ))}
                </div>

                {/* Equal split: member selector */}
                {form.splitMode === 'equal' && (
                  <div>
                    <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 6px' }}>選擇分攤成員（不選則全員）</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {memberNames.map((name: string) => (
                        <button key={name} onClick={() => toggleSplitMember(name)}
                          style={{ flex: 1, minWidth: 60, padding: '9px 8px', borderRadius: 12, border: `1.5px solid ${form.splitWith.includes(name) ? C.sageDark : C.creamDark}`, background: form.splitWith.includes(name) ? C.sage : 'var(--tm-card-bg)', color: form.splitWith.includes(name) ? 'white' : C.bark, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, fontSize: 13 }}>
                          {name}
                        </button>
                      ))}
                    </div>
                    {mainAmt > 0 && activeSplitMembers.length > 0 && (
                      <p style={{ fontSize: 12, color: C.barkLight, marginTop: 6 }}>
                        每人 NT$ {Math.round(mainAmtTWD / activeSplitMembers.length).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                {/* Percentage split */}
                {form.splitMode === 'weighted' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>以百分比分帳（總和須為 100%）</p>
                    {memberNames.map((name: string) => {
                      const pct = activePcts[name] ?? Math.floor(100 / memberNames.length / 5) * 5;
                      const share = Math.round(mainAmtTWD * pct / 100);
                      return (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.cream, borderRadius: 12, padding: '8px 12px' }}>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.bark }}>{name}</span>
                          <button onClick={() => setPercentage(name, -5)}
                            style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.bark, fontWeight: 700, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                          <span style={{ minWidth: 38, textAlign: 'center', fontSize: 14, fontWeight: 700, color: C.bark }}>{pct}%</span>
                          <button onClick={() => setPercentage(name, 5)}
                            style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.bark, fontWeight: 700, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>＋</button>
                          <span style={{ minWidth: 70, textAlign: 'right', fontSize: 12, color: C.earth, fontWeight: 600 }}>NT$ {share.toLocaleString()}</span>
                        </div>
                      );
                    })}
                    <p style={{ fontSize: 11, color: Object.values(activePcts).reduce((s, v) => s + v, 0) === 100 ? C.sageDark : '#9A3A3A', margin: 0, fontWeight: 600 }}>
                      總計：{Object.values(activePcts).reduce((s, v) => s + v, 0)}%
                    </p>
                  </div>
                )}

                {/* Custom amount split */}
                {form.splitMode === 'amount' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {memberNames.map((name: string) => (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 60, fontSize: 13, fontWeight: 600, color: C.bark, flexShrink: 0 }}>{name}</span>
                        <input
                          style={{ ...iStyle, flex: 1 }}
                          type="number" inputMode="decimal" placeholder="0"
                          value={form.customAmounts[name] ?? ''}
                          onChange={e => setCustomAmount(name, e.target.value)}
                        />
                        <span style={{ fontSize: 11, color: C.barkLight, flexShrink: 0 }}>{form.currency}</span>
                      </div>
                    ))}
                    <div style={{ background: Math.abs(customRemaining) < 1 ? '#EAF3DE' : '#FFF2CC', borderRadius: 10, padding: '8px 12px' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: C.bark, margin: 0 }}>
                        總計：{customTotal.toLocaleString()} / 剩餘：{customRemaining.toLocaleString()} {form.currency}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sub-items */}
              {!isReadOnly && <div>
                <button onClick={() => setShowSubItems(v => !v)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.sageDark, fontWeight: 600, fontFamily: FONT, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {showSubItems ? '▾' : '▸'} ＋ 新增細項
                </button>
                {showSubItems && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {form.subItems.map((si, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          style={{ ...iStyle, flex: 2 }}
                          placeholder="細項名稱"
                          value={si.name}
                          onChange={e => updateSubItem(idx, 'name', e.target.value)}
                        />
                        <input
                          style={{ ...iStyle, flex: 1 }}
                          type="number" inputMode="decimal" placeholder="金額"
                          value={si.amount}
                          onChange={e => updateSubItem(idx, 'amount', e.target.value)}
                        />
                        <button onClick={() => removeSubItem(idx)}
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#FAE0E0', color: '#9A3A3A', cursor: 'pointer', fontSize: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                      </div>
                    ))}
                    <button onClick={addSubItem}
                      style={{ padding: '7px 0', borderRadius: 10, border: `1.5px dashed ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
                      ＋ 新增一筆
                    </button>
                    {form.subItems.length > 0 && (
                      <p style={{ fontSize: 12, color: C.barkLight, margin: 0 }}>
                        細項合計：{subItemTotal.toLocaleString()} / 總額：{mainAmt.toLocaleString()} {form.currency}
                      </p>
                    )}
                  </div>
                )}
              </div>}

              {/* Notes */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>備註</label>
                <input style={iStyle} placeholder="備忘..." value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>

              {/* Date */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>日期</label>
                <input style={iStyle} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
              </div>

              {/* Receipt photo attachment */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>📎 附件（發票／收據）</label>
                <input ref={receiptRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) handleReceiptUpload(e.target.files[0]); e.target.value = ''; }} />
                {form.receiptUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src={form.receiptUrl} alt="附件預覽" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: `1.5px solid ${C.creamDark}`, cursor: 'pointer' }}
                      onClick={() => window.open(form.receiptUrl, '_blank')} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 11, color: C.sageDark, fontWeight: 600, margin: '0 0 4px' }}>✅ 附件已上傳</p>
                      <button onClick={() => set('receiptUrl', '')}
                        style={{ fontSize: 11, color: '#9A3A3A', background: '#FAE0E0', border: 'none', borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT, fontWeight: 600 }}>
                        ✕ 移除
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => receiptRef.current?.click()} disabled={receiptUploading}
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 14, border: `2px dashed ${C.creamDark}`, background: 'var(--tm-input-bg)', color: receiptUploading ? C.sageDark : C.barkLight, fontWeight: 700, fontSize: 13, cursor: receiptUploading ? 'default' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {receiptUploading ? '⏳ 上傳中...' : '📷 拍照 / 上傳附件'}
                  </button>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={closeForm}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 14 }}>
                  取消
                </button>
                <button onClick={handleSave} disabled={saving || !form.description || !form.amount || !form.payer}
                  style={{ ...btnPrimary(), flex: 2, opacity: saving || !form.description || !form.amount || !form.payer ? 0.6 : 1 }}>
                  {saving ? '儲存中...' : editingId ? '✓ 儲存修改' : '✓ 新增'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <PageHeader title="旅行記帳" subtitle="支出記錄・分帳結算" emoji="💰" color={C.sage}>
        {!isVisitor && (
          <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.2)', borderRadius: 14, padding: '12px 14px' }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', margin: '0 0 2px' }}>總支出（換算台幣）</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: 'white', margin: 0 }}>NT$ {totalTWD.toLocaleString()}</p>
          </div>
        )}
      </PageHeader>

      <div style={{ padding: '12px 16px 80px' }}>

        {/* ── Member stats (hidden for visitors) ── */}
        {!isVisitor && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {memberStats.map(ms => {
            const toReceive = settlementReceive[ms.name] || 0;
            const toPay     = settlementPay[ms.name]     || 0;
            const isCreditor = ms.net >= 0;
            // Use settlement amounts so the card matches the "建議結算" row exactly
            const displayAmt = isCreditor ? toReceive : toPay;
            return (
              <div key={ms.name} style={{ background: 'var(--tm-card-bg)', borderRadius: 16, padding: '12px 14px', boxShadow: C.shadowSm }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: '0 0 6px' }}>{ms.name}</p>
                <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 2px' }}>已付出</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.earth, margin: '0 0 6px' }}>NT$ {ms.paid.toLocaleString()}</p>
                <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 2px' }}>應付金額</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.bark, margin: '0 0 6px' }}>NT$ {ms.owed.toLocaleString()}</p>
                <div style={{ background: isCreditor ? '#EAF3DE' : '#FAE0E0', borderRadius: 8, padding: '4px 8px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: isCreditor ? '#4A7A35' : '#9A3A3A', margin: 0 }}>
                    {displayAmt > 0
                      ? (isCreditor
                          ? `應收 NT$ ${displayAmt.toLocaleString()}`
                          : `應補 NT$ ${displayAmt.toLocaleString()}`)
                      : '已結清 ✓'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>}

        {/* ── Settlement suggestions (hidden for visitors) ── */}
        {!isVisitor && settlements.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: 12, background: '#EAF3DE', border: '1px solid #B5CFA7' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#4A7A35', margin: '0 0 6px' }}>💡 建議結算方式</p>
            {settlements.map((s, i) => (
              <p key={i} style={{ fontSize: 12, color: '#4A7A35', margin: '2px 0' }}>
                {s.from} 付給 {s.to}：NT$ {s.amount.toLocaleString()}
              </p>
            ))}
          </div>
        )}

        {/* ── Category breakdown pie ── */}
        {categoryBreakdown.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showPie ? 10 : 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: 0 }}>分類佔比</p>
              <button onClick={() => setShowPie(v => !v)}
                style={{ background: 'none', border: 'none', fontSize: 12, color: C.sageDark, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, padding: '2px 6px' }}>
                {showPie ? '收起 ▲' : '展開 ▼'}
              </button>
            </div>
            {showPie && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <PieChart data={categoryBreakdown} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                  {categoryBreakdown.map(d => (
                    <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: PIE_COLORS[d.key] || '#C8C8C8', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: C.bark, flex: 1 }}>{d.emoji} {d.label}</span>
                      <span style={{ fontSize: 11, color: C.earth, fontWeight: 600 }}>{catTotal > 0 ? Math.round(d.value / catTotal * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!showPie && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {categoryBreakdown.map(d => (
                  <span key={d.key} className={`tm-expense-chip tm-expense-chip-${d.key}`}
                    style={{ fontSize: 11, background: EXPENSE_CATEGORY_MAP[d.key]?.bg || '#F0F0F0', borderRadius: 8, padding: '5px 10px', color: C.bark, fontWeight: 600 }}>
                    {d.emoji} {d.label} {catTotal > 0 ? Math.round(d.value / catTotal * 100) : 0}%
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Action buttons ── */}
        {!isReadOnly && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => setShowForm(true)} style={{ ...btnPrimary(C.earth), flex: 2 }}>
              ＋ 新增支出
            </button>
            <button onClick={() => setShowSettleForm(true)} style={{ ...btnPrimary(C.sageDark), flex: 1 }}>
              💸 結清
            </button>
          </div>
        )}

        {/* ── Visitor note: only category breakdown visible ── */}
        {isVisitor && (
          <div style={{ background: '#F5F5F5', borderRadius: 12, padding: '9px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>🔒</span>
            <span style={{ fontSize: 11, color: C.barkLight, fontWeight: 600 }}>訪客模式：僅顯示分類佔比，明細資料僅旅伴可查看</span>
          </div>
        )}

        {/* ── Filter / Sort bar (hidden for visitors) ── */}
        {!isVisitor && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {FILTER_CATS.map(fc => (
              <button key={fc.key} onClick={() => setFilterCat(fc.key)}
                style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${filterCat === fc.key ? C.sageDark : C.creamDark}`, background: filterCat === fc.key ? C.sage : 'var(--tm-card-bg)', color: filterCat === fc.key ? 'white' : C.bark, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                {fc.label}
              </button>
            ))}
            <button onClick={() => setSortMode(nextSort[sortMode])}
              style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${C.earth}`, background: '#FFF2CC', color: C.earth, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
              {sortLabels[sortMode]}
            </button>
          </div>
        )}

        {/* ── Expense list (hidden for visitors) ── */}
        {!isVisitor && (filteredExpenses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: C.barkLight }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
            <p style={{ fontSize: 13 }}>沒有符合的支出記錄</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredExpenses.map((e: any) => {
              const isSettlement = e.category === 'settlement';
              const cat = isSettlement ? null : (EXPENSE_CATEGORY_MAP[e.category] || EXPENSE_CATEGORY_MAP.other);
              const amtTWD = e.amountTWD || toTWD(e.amount || 0, e.currency || 'JPY');
              const hasSubItems = e.subItems && e.subItems.length > 0;
              const isExpanded = expandedExpense === e.id;
              return (
                <div key={e.id} style={{ ...cardStyle, padding: '12px 14px', borderLeft: isSettlement ? `3px solid ${C.sageDark}` : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {/* Category icon */}
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: isSettlement ? '#EAF3DE' : cat?.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      {isSettlement ? '💸' : cat?.emoji}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{e.description}</p>
                        {isSettlement ? (
                          <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: '#EAF3DE', color: '#4A7A35' }}>結清</span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: e.paymentMethod === 'card' ? '#D8EDF8' : '#EAF3DE', color: e.paymentMethod === 'card' ? '#2A6A9A' : '#4A7A35' }}>
                            {e.paymentMethod === 'card' ? '刷卡' : '現金'}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 2px' }}>
                        {e.payer} 付款 · {e.date || ''}
                      </p>
                      {!isSettlement && (
                        <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>
                          {splitModeLabel(e)}
                          {e.notes ? ` · ${e.notes}` : ''}
                        </p>
                      )}
                      {isSettlement && e.notes && (
                        <p style={{ fontSize: 11, color: C.sageDark, margin: 0 }}>{e.notes}</p>
                      )}
                    </div>
                    {/* Amount + actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: isSettlement ? C.sageDark : C.earth, margin: 0 }}>NT$ {amtTWD.toLocaleString()}</p>
                      {e.currency !== 'TWD' && <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>{e.currency} {e.amount?.toLocaleString()}</p>}
                      {!isReadOnly && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          {!isSettlement && (
                            <button onClick={() => openEdit(e)}
                              style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#FFF2CC', color: '#9A7200', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              ✏️
                            </button>
                          )}
                          {canDeleteExpense(e) && (
                            <button onClick={() => handleDelete(e.id, e)}
                              style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#FAE0E0', color: '#9A3A3A', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              🗑
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Receipt thumbnail */}
                  {e.receiptUrl && !isVisitor && (
                    <div style={{ marginTop: 6 }}>
                      <img src={e.receiptUrl} alt="附件" onClick={() => window.open(e.receiptUrl, '_blank')}
                        style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: `1.5px solid ${C.creamDark}`, cursor: 'pointer' }} />
                    </div>
                  )}

                  {/* Sub-items toggle */}
                  {hasSubItems && (
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => setExpandedExpense(isExpanded ? null : e.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: C.sageDark, fontWeight: 600, fontFamily: FONT, padding: 0 }}>
                        {isExpanded ? '▾' : '▸'} 細項明細（{e.subItems.length}筆）
                      </button>
                      {isExpanded && (
                        <div style={{ marginTop: 6, background: C.cream, borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {e.subItems.map((si: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: C.bark }}>{si.name}</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: C.earth }}>{si.amount} {e.currency}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
