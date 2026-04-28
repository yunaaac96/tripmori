import { useState, useEffect, useRef } from 'react';
import { deleteField } from 'firebase/firestore';
import { C, FONT, EXPENSE_CATEGORY_MAP, JPY_TO_TWD, cardStyle, inputStyle, btnPrimary, ExpandableNotes, SmartText } from '../../App';
import { avatarTextColor } from '../../utils/helpers';
import { CURRENCY_TO_TWD, toTWDCalc, getEqualPcts, normalizePcts, getPersonalShare, computeMemberStats, computeSettlements, effectiveTWD, computeAmountTWD, buildPersonalStatement } from '../../utils/expenseCalc';
import type { StatementLineItem } from '../../utils/expenseCalc';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useGoogleUid } from '../../hooks/useAuth';
import PageHeader from '../../components/layout/PageHeader';
import CurrencyPicker from '../../components/CurrencyPicker';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBus, faUtensils, faTicket, faBagShopping, faBed, faEllipsis, faArrowRightArrowLeft, faPen, faTrashCan, faCamera, faLock, faUsers, faMoneyBill1, faChartPie, faCreditCard, faUser, faPaperclip, faScaleBalanced, faPercent, faCheck, faReceipt, faArrowDown, faCoins } from '@fortawesome/free-solid-svg-icons';

const CATEGORY_ICONS: Record<string, any> = {
  transport: faBus,
  food: faUtensils,
  attraction: faTicket,
  shopping: faBagShopping,
  hotel: faBed,
  other: faEllipsis,
  settlement: faArrowRightArrowLeft,
  income: faCoins,
};

type SplitMode = 'equal' | 'weighted' | 'amount';
type SortMode = 'newest' | 'oldest' | 'largest' | 'date-asc' | 'date-desc';
type Currency = string;

const EMPTY_FORM = {
  description: '', amount: '', currency: 'JPY' as Currency,
  isIncome: false,
  category: 'food', payer: '',
  paymentMethod: 'cash' as 'cash' | 'card',
  splitMode: 'equal' as SplitMode,
  splitWith: [] as string[],
  percentages: {} as Record<string, number>,
  customAmounts: {} as Record<string, string>,
  subItems: [] as { name: string; amount: string }[],
  date: '', notes: '', receiptUrl: '',
  isPrivate: false,
  // FX + card-fee controls
  exchangeRate: '',          // per-expense override (blank → use trip rate → fallback table)
  cardFeePercent: '1.5',     // only used when paymentMethod === 'card' and currency !== 'TWD'
  awaitCardStatement: false, // credit-card row where user wants to wait for statement
  // Income-specific: who benefits from this income entry
  incomeScope: 'group' as 'group' | 'personal',  // 'group' = all members; 'personal' = one person
  incomeBeneficiary: '',                          // used when incomeScope === 'personal'
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
const PIE_COLORS_LIGHT: Record<string, string> = {
  transport: '#A8CADF',
  food: '#F7D87C',
  attraction: '#A8D89C',
  shopping: '#F0A8A8',
  hotel: '#C8B0E0',
  other: '#C8C8C8',
};
const PIE_COLORS_DARK: Record<string, string> = {
  transport: '#5AAAD0',
  food: '#C8A820',
  attraction: '#60B050',
  shopping: '#C06060',
  hotel: '#9060C0',
  other: '#787878',
};

function useDarkMode(): boolean {
  const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [dark, setDark] = useState(() => mq?.matches ?? false);
  useEffect(() => {
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return dark;
}

function PieChart({ data }: { data: { key: string; value: number; label: string }[] }) {
  const dark = useDarkMode();
  const PIE_COLORS = dark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT;
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

  const strokeColor = dark ? '#1C1A17' : 'white';
  // Single-slice edge case: SVG arc with coincident start/end points collapses
  // to an invisible sliver. Render a plain filled circle instead.
  const onlyOne = slices.length === 1;
  return (
    <svg viewBox="0 0 160 160" style={{ width: 130, height: 130, flexShrink: 0 }}>
      {onlyOne ? (
        <circle cx={cx} cy={cy} r={r} fill={PIE_COLORS[slices[0].key] || (dark ? '#505050' : '#C8C8C8')} stroke={strokeColor} strokeWidth={1.5} />
      ) : slices.map(s => (
        <path key={s.key} d={s.path} fill={PIE_COLORS[s.key] || (dark ? '#505050' : '#C8C8C8')} stroke={strokeColor} strokeWidth={1.5} />
      ))}
    </svg>
  );
}

// ── Settlement Form ────────────────────────────────────────────────────────
function SettlementForm({ memberNames, onAdd, onClose, firestore, projCurrency }: {
  memberNames: string[];
  onAdd: (from: string, to: string, amount: string, currency: string) => Promise<void>;
  onClose: () => void;
  firestore: any;
  projCurrency: string;
}) {
  const [from, setFrom] = useState(memberNames[0] || '');
  const [to, setTo] = useState(memberNames[1] || memberNames[0] || '');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<string>(projCurrency || 'TWD');
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
      <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '80vh', overflowY: 'auto', boxSizing: 'border-box' }}>
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
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>金額 *</label>
            <input style={iStyle} type="number" inputMode="decimal" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>幣別</label>
            <CurrencyPicker value={currency} onChange={setCurrency} projCurrency={projCurrency} />
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

  const projCurrency = (project?.currency || 'JPY') as Currency;
  const defaultForm = { ...EMPTY_FORM, currency: projCurrency };

  const darkMode = useDarkMode();
  const PIE_COLORS = darkMode ? PIE_COLORS_DARK : PIE_COLORS_LIGHT;

  // Google UID for private expense ownership (shared singleton listener)
  const googleUid = useGoogleUid();

  // Derive current user's member name from their Google UID (trip-aware, not localStorage-based)
  // Falls back to localStorage for backwards compatibility when UID isn't bound yet
  const currentUserName = (googleUid
    ? (members as any[]).find(m => m.googleUid === googleUid)?.name
    : null) || localStorage.getItem('tripmori_current_user') || '';

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...defaultForm });
  const [showSubItems, setShowSubItems] = useState(false);
  const [expandedExpense, setExpandedExpense] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filter / Sort / View
  const [filterCat, setFilterCat] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [expenseView, setExpenseView] = useState<'all' | 'mine'>('all');

  // Pie chart — auto-expand for visitors
  const [showPie, setShowPie] = useState(false);
  useEffect(() => { if (isVisitor) setShowPie(true); }, [isVisitor]);

  // Settlement
  const [showSettleForm, setShowSettleForm] = useState(false);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [settlementExpanded, setSettlementExpanded] = useState(false);
  const [memberDetailName, setMemberDetailName] = useState<string | null>(null);
  // Self-detail privacy tabs (only ever rendered for own card)
  const [detailTab, setDetailTab] = useState<'all' | 'shared' | 'private'>('all');
  // Personal Statement modal (click 代墊/需還款 chip, or member name in settlement list)
  const [settlementDetailName, setSettlementDetailName] = useState<string | null>(null);
  // Collapsible sections inside the Personal Statement modal
  const [stmtPaymentsOpen, setStmtPaymentsOpen] = useState(false);
  const [stmtSharesOpen, setStmtSharesOpen] = useState(false);
  // Reset section state whenever a different person's statement is opened
  useEffect(() => {
    if (settlementDetailName) { setStmtPaymentsOpen(false); setStmtSharesOpen(false); }
  }, [settlementDetailName]);

  // Member card scroll ref (for arrow nav)
  const memberScrollRef = useRef<HTMLDivElement>(null);

  // Receipt photo attachment
  const descRef = useRef<HTMLInputElement>(null);
  const amtRef  = useRef<HTMLInputElement>(null);
  const receiptRef = useRef<HTMLInputElement>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);

  // Lightbox for receipt preview
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Live IDR exchange rate
  const [liveIdrRate, setLiveIdrRate] = useState<number | null>(null);

  // Auto-focus amount when form opens
  useEffect(() => {
    if (showForm) {
      const t = setTimeout(() => { amtRef.current?.focus(); }, 350);
      return () => clearTimeout(t);
    }
  }, [showForm]);

  // Fetch live IDR → TWD rate when IDR is selected
  useEffect(() => {
    if (!showForm || form.currency !== 'IDR') return;
    fetch('https://open.er-api.com/v6/latest/IDR')
      .then(r => r.json())
      .then(data => { if (data.rates?.TWD) setLiveIdrRate(data.rates.TWD); })
      .catch(() => {});
  }, [showForm, form.currency]);

  const memberNames: string[] = members.map((m: any) => m.name);

  // toTWD: alias for display (rounds to integer)
  const toTWD = toTWDCalc;

  // getEqualPcts and normalizePcts are imported from utils/expenseCalc

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
    if (!file.type.startsWith('image/')) {
      alert('請上傳圖片格式的附件（JPG、PNG、HEIC 等）');
      return;
    }
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

  // splitWith=[] means all members; clicking deselects (excludes) a member
  const isMemberSelected = (name: string) =>
    form.splitWith.length === 0 || form.splitWith.includes(name);

  const toggleSplitMember = (name: string) => {
    setForm(p => {
      const current = p.splitWith.length === 0 ? [...memberNames] : [...p.splitWith];
      const next = current.includes(name) ? current.filter(n => n !== name) : [...current, name];
      // If all selected again, collapse to empty (semantically identical)
      return { ...p, splitWith: next.length === memberNames.length ? [] : next, percentages: {} };
    });
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
      isPrivate: e.isPrivate || false,
      isIncome: e.isIncome || false,
      exchangeRate: e.exchangeRate != null ? String(e.exchangeRate) : '',
      cardFeePercent: e.cardFeePercent != null ? String(e.cardFeePercent) : '1.5',
      awaitCardStatement: !!e.awaitCardStatement,
      // Restore income scope: 'personal' when exactly one beneficiary stored
      incomeScope: (e.isIncome && e.splitWith && e.splitWith.length === 1) ? 'personal' : 'group',
      incomeBeneficiary: (e.isIncome && e.splitWith && e.splitWith.length === 1) ? e.splitWith[0] : '',
    });
    setEditingId(e.id);
    setShowForm(true);
  };

  // ── Computed values ──────────────────────────────────────────────────────
  const activeSplitMembers = form.splitMode === 'equal' && form.splitWith.length > 0
    ? form.splitWith
    : memberNames;

  const mainAmt = Number(form.amount) || 0;
  // Trip-level FX rate (only applies when expense currency matches the trip's primary currency).
  const tripCurrency: string | null = project?.currency || null;
  const tripRate: number | null = project?.exchangeRate != null ? Number(project.exchangeRate) : null;
  // Per-expense FX override + card fee %
  const formExchangeRate = form.exchangeRate.trim() ? Number(form.exchangeRate) : null;
  const formCardFee = form.cardFeePercent.trim() ? Number(form.cardFeePercent) : 1.5;
  // Show which rate is actually in effect (for the preview hint)
  const resolvedRate = (() => {
    if (formExchangeRate && formExchangeRate > 0) return { rate: formExchangeRate, source: '本筆指定' };
    if (tripRate && tripRate > 0 && tripCurrency === form.currency) return { rate: tripRate, source: '旅行預設' };
    const fallback = CURRENCY_TO_TWD[form.currency] ?? 1;
    return { rate: fallback, source: '系統預設' };
  })();
  const mainAmtTWD = computeAmountTWD(mainAmt, form.currency, {
    exchangeRate: formExchangeRate,
    tripCurrency, tripRate,
    paymentMethod: form.paymentMethod,
    cardFeePercent: formCardFee,
  });

  const customTotal = Object.values(form.customAmounts).reduce((s, v) => s + (Number(v) || 0), 0);
  const customRemaining = mainAmt - customTotal;

  const subItemTotal = form.subItems.reduce((s, si) => s + (Number(si.amount) || 0), 0);

  // ── Save / Update ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (isReadOnly) return;
    if (!form.description || !form.amount) return;
    // Private expense doesn't require payer
    if (!form.isPrivate && !form.payer) return;
    setSaving(true);
    const amt = Number(form.amount);
    const formExRate = form.exchangeRate.trim() ? Number(form.exchangeRate) : null;
    const cardFee = form.cardFeePercent.trim() ? Number(form.cardFeePercent) : 1.5;
    const amtTWD = computeAmountTWD(amt, form.currency, {
      exchangeRate: formExRate,
      tripCurrency, tripRate,
      paymentMethod: form.paymentMethod,
      cardFeePercent: cardFee,
    });

    let splitWith = form.isPrivate ? [] : memberNames;
    if (!form.isPrivate && form.splitMode === 'equal' && form.splitWith.length > 0) splitWith = form.splitWith;
    // Income override: respect the chosen scope regardless of splitMode
    if (form.isIncome && !form.isPrivate) {
      splitWith = (form.incomeScope === 'personal' && form.incomeBeneficiary)
        ? [form.incomeBeneficiary]
        : []; // empty = all members (same as existing behaviour)
    }

    const pcts = form.splitMode === 'weighted' ? getActivePcts() : {};

    const isForeignCard = form.paymentMethod === 'card' && form.currency !== 'TWD';

    const payload: any = {
      description: form.description,
      amount: amt, currency: form.currency, amountTWD: amtTWD,
      category: form.category,
      payer: form.isPrivate ? (form.payer || currentUserName) : form.payer,
      paymentMethod: form.paymentMethod,
      splitMode: form.isPrivate ? 'equal' : form.splitMode,
      splitWith,
      percentages: form.splitMode === 'weighted' && !form.isPrivate ? pcts : {},
      customAmounts: form.splitMode === 'amount' && !form.isPrivate ? form.customAmounts : {},
      subItems: form.subItems.filter(si => si.name.trim()),
      date: form.date || new Date().toISOString().slice(0, 10),
      notes: form.notes,
      receiptUrl: form.receiptUrl || '',
      isPrivate: form.isPrivate || false,
      privateOwnerUid: form.isPrivate ? (googleUid || null) : null,
      isIncome: form.isIncome || false,
      // Cross-currency bookkeeping
      exchangeRate: formExRate && formExRate > 0 ? formExRate : null,
      cardFeePercent: isForeignCard ? cardFee : null,
      awaitCardStatement: isForeignCard && form.awaitCardStatement ? true : false,
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'trips', TRIP_ID, 'expenses', editingId), payload);
      } else {
        payload.createdAt = Timestamp.now();
        payload.createdBy = currentUserName; // track creator for delete permissions
        await addDoc(collection(db, 'trips', TRIP_ID, 'expenses'), payload);
      }
    } catch (e) {
      console.error(e);
      setSaving(false);
      alert('儲存失敗，請檢查網路連線後再試');
      return;
    }
    setSaving(false);
    closeForm();
  };

  const canDeleteExpense = (e: any) =>
    !isReadOnly && (isOwner || (currentUserName && e.createdBy === currentUserName));

  const handleDelete = async (id: string, expense: any) => {
    if (!canDeleteExpense(expense)) return;
    await deleteDoc(doc(db, 'trips', TRIP_ID, 'expenses', id));
  };

  // ── "與我有關" filter ─────────────────────────────────────────────────────
  const isMyExpense = (e: any): boolean => {
    if (e.isPrivate) return !!(e.privateOwnerUid && e.privateOwnerUid === googleUid);
    if (!currentUserName) return false;
    if (e.payer === currentUserName) return true;
    const sw: string[] = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
    return sw.includes(currentUserName);
  };

  // ── Settlement add ───────────────────────────────────────────────────────
  const handleAddSettlement = async (from: string, to: string, amount: string, currency: string) => {
    // Defence-in-depth: every entry point to this function is already behind
    // a `!isReadOnly` UI guard, but we re-check here so the write path itself
    // can never be exercised by a visitor (firestore.rules would reject too).
    if (isReadOnly) return;
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

  const handleQuickSettle = async (from: string, to: string, amount: number) => {
    const key = `${from}-${to}`;
    setSettlingId(key);
    await handleAddSettlement(from, to, String(amount), 'TWD');
    setSettlingId(null);
  };

  // ── Auto-migrate: clear residual settlementBatch fields from the
  //   short-lived batch-settlement feature. Batches turned out not to fit
  //   the mental model so we reverted them, but any expense that was
  //   already "closed into a batch" (e.g. 峇里島) stayed hidden from the
  //   live list. On first load as owner we strip settlementBatch so every
  //   expense returns to the normal view. (We keep adjustmentOf — still a
  //   useful trace for the 補記差額 feature which we kept.)
  const batchMigratedRef = useRef(false);
  useEffect(() => {
    if (batchMigratedRef.current) return;
    if (!TRIP_ID || isReadOnly) return;
    if (!expenses || expenses.length === 0) return;
    const stale = (expenses as any[]).filter((e: any) => e.settlementBatch != null);
    if (stale.length === 0) { batchMigratedRef.current = true; return; }
    batchMigratedRef.current = true;
    Promise.all(stale.map(e =>
      updateDoc(doc(db, 'trips', TRIP_ID, 'expenses', e.id), {
        settlementBatch: deleteField(),
      })
    )).catch(err => console.warn('[migrate] restore batches failed', err));
  }, [TRIP_ID, isReadOnly, expenses, doc, updateDoc, db]);

  // ── Fill actual TWD for a credit-card foreign expense after the card
  //   statement arrives. Stores actualTWD + auto-clears awaitCardStatement
  //   so the expense flows into settlement suggestions automatically.
  const [actualTarget, setActualTarget] = useState<any | null>(null);
  const [actualValue, setActualValue]   = useState('');
  const [actualSaving, setActualSaving] = useState(false);
  const openActualForm = (original: any) => {
    setActualTarget(original);
    setActualValue(original.actualTWD != null ? String(original.actualTWD) : '');
  };
  const closeActualForm = () => {
    setActualTarget(null);
    setActualValue('');
  };
  const handleActualSave = async () => {
    if (!actualTarget || !actualValue || actualSaving) return;
    const v = Number(actualValue);
    if (!v || Number.isNaN(v) || v <= 0) return;
    setActualSaving(true);
    try {
      await updateDoc(doc(db, 'trips', TRIP_ID, 'expenses', actualTarget.id), {
        actualTWD: Math.round(v),
        awaitCardStatement: false,
      });
      closeActualForm();
    } catch (e) {
      console.error(e);
      alert('儲存失敗，請重試');
    } finally {
      setActualSaving(false);
    }
  };

  // ── Adjustment (補記差額) — copy original payer / split / category,
  //   amount = signed delta (positive = 少收補收, negative = 多收退款).
  //   New expense is a regular row in the live list.
  const [adjustTarget, setAdjustTarget] = useState<any | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote]     = useState('');
  const [adjustDir, setAdjustDir]       = useState<'expense' | 'refund'>('expense');
  const [adjustCurrency, setAdjustCurrency] = useState<string>('JPY');
  const [adjustSaving, setAdjustSaving] = useState(false);
  const openAdjustForm = (original: any) => {
    setAdjustTarget(original);
    setAdjustAmount('');
    setAdjustNote('');
    setAdjustDir('expense');
    setAdjustCurrency(original.currency || 'JPY');
  };
  const closeAdjustForm = () => {
    setAdjustTarget(null);
    setAdjustAmount('');
    setAdjustNote('');
    setAdjustDir('expense');
  };
  const handleAdjustSave = async () => {
    if (!adjustTarget || !adjustAmount || adjustSaving) return;
    const absAmt = Number(adjustAmount);
    if (!absAmt || Number.isNaN(absAmt) || absAmt <= 0) return;
    setAdjustSaving(true);
    try {
      const original = adjustTarget;
      const currency = adjustCurrency || original.currency || 'JPY';
      // Direction: 'refund' means the group gets money back → negative amount
      const signedAmt = adjustDir === 'refund' ? -absAmt : absAmt;
      const amtTWD = toTWD(absAmt, currency) * (adjustDir === 'refund' ? -1 : 1);
      const payload: any = {
        description: `${original.description}（補記）`,
        amount: signedAmt, currency, amountTWD: amtTWD,
        category: original.category || 'other',
        payer: original.payer || '',
        paymentMethod: original.paymentMethod || 'cash',
        splitMode: original.splitMode || 'equal',
        splitWith: original.splitWith || [],
        percentages: original.percentages || {},
        customAmounts: original.customAmounts || {},
        subItems: [],
        date: new Date().toISOString().slice(0, 10),
        notes: adjustNote || `補記原筆：${original.description}`,
        receiptUrl: '',
        isPrivate: original.isPrivate || false,
        privateOwnerUid: original.privateOwnerUid || null,
        adjustmentOf: original.id,
        createdAt: Timestamp.now(),
        createdBy: currentUserName,
      };
      await addDoc(collection(db, 'trips', TRIP_ID, 'expenses'), payload);
      closeAdjustForm();
    } catch (e) {
      console.error(e);
      alert('補記失敗，請重試');
    } finally {
      setAdjustSaving(false);
    }
  };

  // getPersonalShare and memberStats/settlements are imported from utils/expenseCalc
  const memberStats = computeMemberStats(expenses, memberNames);
  const settlements = computeSettlements(memberStats);

  // ── Member card order ────────────────────────────────────────────────────
  // Owner can reorder; editors see own card first then rest
  const memberOrder: string[] = project?.memberOrder || memberNames;
  // Build display order: start from memberOrder, fill in any missing names
  const orderedMemberNames = [
    ...memberOrder.filter((n: string) => memberNames.includes(n)),
    ...memberNames.filter((n: string) => !memberOrder.includes(n)),
  ];
  // Always put current user's card first (own card top rule)
  const displayMemberNames = [
    ...orderedMemberNames.filter(n => n === currentUserName),
    ...orderedMemberNames.filter(n => n !== currentUserName),
  ];

  // Build per-member settlement totals for card display (consistent with suggestion row)
  const settlementReceive: Record<string, number> = {};
  const settlementPay: Record<string, number> = {};
  settlements.forEach(s => {
    settlementReceive[s.to]   = (settlementReceive[s.to]   || 0) + s.amount;
    settlementPay[s.from]     = (settlementPay[s.from]     || 0) + s.amount;
  });

  // ── Category breakdown ───────────────────────────────────────────────────
  // Visible expenses: filter out private that belong to others
  const visibleExpenses = expenses.filter((e: any) =>
    !e.isPrivate || (e.privateOwnerUid && e.privateOwnerUid === googleUid)
  );
  // Base: further filter by "與我有關" if selected
  const baseExpenses = expenseView === 'mine'
    ? visibleExpenses.filter(isMyExpense)
    : visibleExpenses;

  const nonSettlementExpenses = baseExpenses.filter((e: any) => e.category !== 'settlement');

  // 團隊總支出: non-private, non-settlement, excluding anything still awaiting
  // a card statement (real TWD unknown). Income entries subtract from the total.
  const teamTotalTWD = visibleExpenses
    .filter((e: any) => !e.isPrivate && e.category !== 'settlement' && !e.awaitCardStatement)
    .reduce((s: number, e: any) => e.isIncome ? s - effectiveTWD(e) : s + effectiveTWD(e), 0);

  // 個人負擔總額 (與我有關 mode): my share of shared expenses + my own private expenses
  const myBurdenTWD = currentUserName
    ? visibleExpenses
        .filter((e: any) => e.category !== 'settlement' && !e.awaitCardStatement && isMyExpense(e))
        .reduce((s: number, e: any) => {
          if (e.isPrivate) return s + effectiveTWD(e);
          return s + getPersonalShare(e, currentUserName, memberNames);
        }, 0)
    : 0;

  // Header amount: team total in all mode, personal burden in mine mode
  const headerTWD = expenseView === 'mine' && currentUserName ? myBurdenTWD : teamTotalTWD;

  const categoryBreakdown = Object.entries(EXPENSE_CATEGORY_MAP).map(([key, info]) => {
    const cats = nonSettlementExpenses.filter((e: any) => e.category === key && !e.awaitCardStatement);
    const total = cats.reduce((s: number, e: any) => {
      const rawAmt = effectiveTWD(e);
      if (expenseView === 'mine' && currentUserName) {
        // personal burden: full amount for my private, my share for shared
        if (e.isPrivate) return s + rawAmt;
        return s + getPersonalShare(e, currentUserName, memberNames);
      }
      // 全團 mode: exclude private expenses from pie
      if (e.isPrivate) return s;
      return s + rawAmt;
    }, 0);
    return { key, label: info.label, emoji: info.emoji, value: total };
  }).filter(d => d.value > 0);
  const catTotal = categoryBreakdown.reduce((s, d) => s + d.value, 0);

  // ── Settlement grouping (by creditor) ────────────────────────────────────
  const settlementByCreditor = settlements.reduce((groups, s) => {
    if (!groups[s.to]) groups[s.to] = [];
    groups[s.to].push(s);
    return groups;
  }, {} as Record<string, { from: string; to: string; amount: number }[]>);
  const creditorOrder = Object.keys(settlementByCreditor).sort((a, b) => {
    if (a === currentUserName) return -1;
    if (b === currentUserName) return 1;
    return 0;
  });
  const getMemberColor = (name: string) => members.find((m: any) => m.name === name)?.color || C.sageLight;
  const getMemberAvatar = (name: string) => members.find((m: any) => m.name === name)?.avatarUrl || null;

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

  // Sort stability: always break ties by document id so rapid inserts within
  // the same second / identical amount don't flip positions on re-render.
  const filteredExpenses = baseExpenses
    .filter((e: any) => filterCat === 'all' || e.category === filterCat)
    .sort((a: any, b: any) => {
      const tieBreak = String(a.id || '').localeCompare(String(b.id || ''));
      if (sortMode === 'newest') {
        const diff = (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        return diff !== 0 ? diff : tieBreak;
      }
      if (sortMode === 'oldest') {
        const diff = (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
        return diff !== 0 ? diff : tieBreak;
      }
      if (sortMode === 'date-asc') {
        const diff = String(a.date || '').localeCompare(String(b.date || ''));
        return diff !== 0 ? diff : tieBreak;
      }
      if (sortMode === 'date-desc') {
        const diff = String(b.date || '').localeCompare(String(a.date || ''));
        return diff !== 0 ? diff : tieBreak;
      }
      // largest
      const aAmt = effectiveTWD(a);
      const bAmt = effectiveTWD(b);
      return bAmt !== aAmt ? bAmt - aAmt : tieBreak;
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
    'date-asc': '日期最早 ↑',
    'date-desc': '日期最晚 ↓',
  };
  const nextSort: Record<SortMode, SortMode> = { newest: 'oldest', oldest: 'largest', largest: 'date-asc', 'date-asc': 'date-desc', 'date-desc': 'newest' };

  const activePcts = getActivePcts();

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT }}>

      {/* ── Lightbox Modal ── */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: 16 }}>
          <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }}>
            <img src={lightboxUrl} alt="附件" style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 12 }} />
            <button
              onClick={() => setLightboxUrl(null)}
              style={{ position: 'absolute', top: -12, right: -12, width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'white', color: '#333', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── 補實際金額 Modal ── */}
      {actualTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 550 }}
          onClick={ev => { if (ev.target === ev.currentTarget) closeActualForm(); }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '80vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}><FontAwesomeIcon icon={faReceipt} style={{ fontSize: 14 }} /> 補實際金額</p>
              <button onClick={closeActualForm} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>
            <div style={{ padding: '10px 12px', background: 'var(--tm-section-bg)', borderRadius: 12, border: `1px dashed ${C.creamDark}`, marginBottom: 14 }}>
              <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 4px', fontWeight: 600 }}>原筆記帳</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: '0 0 2px' }}>{actualTarget.description}</p>
              <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>
                {actualTarget.currency} {actualTarget.amount?.toLocaleString()} · 預估 NT$ {(actualTarget.amountTWD || 0).toLocaleString()}
              </p>
            </div>
            <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 14px', lineHeight: 1.6 }}>
              請填入刷卡單上實際扣款的台幣金額。填入後這筆記帳會自動以實際金額計算，若有「等卡單」狀態會一併解除。
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.barkLight, fontWeight: 600, display: 'block', marginBottom: 6 }}>實際 TWD 金額</label>
              <input type="number" inputMode="decimal" value={actualValue} onChange={ev => setActualValue(ev.target.value)}
                placeholder="例：1085"
                style={iStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={closeActualForm}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 14 }}>取消</button>
              <button onClick={handleActualSave} disabled={actualSaving || !actualValue || !Number(actualValue) || Number(actualValue) <= 0}
                style={{ ...btnPrimary(), flex: 2, opacity: (actualSaving || !actualValue || !Number(actualValue) || Number(actualValue) <= 0) ? 0.6 : 1 }}>
                {actualSaving ? '儲存中…' : <><FontAwesomeIcon icon={faCheck} style={{ marginRight: 6 }} />確認</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Adjustment (補記差額) Modal ── */}
      {adjustTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 550 }}
          onClick={ev => { if (ev.target === ev.currentTarget) closeAdjustForm(); }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '88vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}><FontAwesomeIcon icon={faPen} style={{ fontSize: 14 }} /> 補記差額</p>
              <button onClick={closeAdjustForm} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>
            <div style={{ padding: '10px 12px', background: 'var(--tm-section-bg)', borderRadius: 12, border: `1px dashed ${C.creamDark}`, marginBottom: 14 }}>
              <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 4px', fontWeight: 600 }}>原筆記帳</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: '0 0 2px' }}>{adjustTarget.description}</p>
              <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>
                {adjustTarget.payer} 付款 · {adjustTarget.currency} {adjustTarget.amount?.toLocaleString()}
              </p>
            </div>
            <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 14px', lineHeight: 1.6 }}>
              為避免動到已結清的金額，輸入差額後會新增一筆 <b>補記</b>，付款人／分攤對象／分類與原筆相同。
            </p>
            {/* Direction toggle */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: C.barkLight, fontWeight: 600, display: 'block', marginBottom: 6 }}>類型</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setAdjustDir('expense')}
                  style={{ flex: 1, padding: '9px 8px', borderRadius: 12, border: `1.5px solid ${adjustDir === 'expense' ? C.earth : C.creamDark}`, background: adjustDir === 'expense' ? '#FFF2CC' : 'var(--tm-card-bg)', color: adjustDir === 'expense' ? C.earth : C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                  ＋ 額外支出
                </button>
                <button onClick={() => setAdjustDir('refund')}
                  style={{ flex: 1, padding: '9px 8px', borderRadius: 12, border: `1.5px solid ${adjustDir === 'refund' ? '#4A8A4A' : C.creamDark}`, background: adjustDir === 'refund' ? '#E8F5E0' : 'var(--tm-card-bg)', color: adjustDir === 'refund' ? '#4A8A4A' : C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                  － 退款折扣
                </button>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: C.barkLight, fontWeight: 600, display: 'block', marginBottom: 6 }}>幣別</label>
              <CurrencyPicker value={adjustCurrency} onChange={setAdjustCurrency} projCurrency={projCurrency} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: C.barkLight, fontWeight: 600, display: 'block', marginBottom: 6 }}>差額金額</label>
              <input type="number" inputMode="decimal" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)}
                placeholder="請輸入正數金額"
                min="0"
                style={iStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.barkLight, fontWeight: 600, display: 'block', marginBottom: 6 }}>備註（選填）</label>
              <input type="text" value={adjustNote} onChange={e => setAdjustNote(e.target.value)}
                placeholder="例：稅費算錯、少算一人..."
                style={iStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={closeAdjustForm}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 14 }}>
                取消
              </button>
              <button onClick={handleAdjustSave} disabled={adjustSaving || !adjustAmount || Number(adjustAmount) <= 0}
                style={{ ...btnPrimary(adjustDir === 'refund' ? '#4A8A4A' : undefined), flex: 2, opacity: (adjustSaving || !adjustAmount || Number(adjustAmount) <= 0) ? 0.6 : 1 }}>
                {adjustSaving ? '建立中…' : <><FontAwesomeIcon icon={faPen} style={{ marginRight: 6 }} />建立補記</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Personal Statement Modal ── */}
      {settlementDetailName && (() => {
        const name = settlementDetailName;
        const ms = memberStats.find(m => m.name === name);
        if (!ms) return null;
        const isCreditor = ms.net >= 0;
        const stmt = buildPersonalStatement(expenses, name, memberNames);
        const mySettlements = settlements.filter(s => s.from === name || s.to === name);
        const memberColor = getMemberColor(name);

        // ── Shared helper: one expense row (used in both sections) ──────
        const StmtRow = ({ item, showPayer }: { item: StatementLineItem; showPayer?: boolean }) => {
          const cat = EXPENSE_CATEGORY_MAP[item.category] || EXPENSE_CATEGORY_MAP.other;
          const isAwaiting = item.awaitCardStatement;
          const sw = item.splitWith;
          return (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: `1px solid var(--tm-cream-dark, #EDE8DF)`, opacity: isAwaiting ? 0.55 : 1 }}>
              {/* Category icon */}
              <div style={{ width: 34, height: 34, borderRadius: 10, background: cat?.bg || '#EEE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FontAwesomeIcon icon={CATEGORY_ICONS[item.category] || CATEGORY_ICONS.other} style={{ fontSize: 13, color: avatarTextColor(cat?.bg || '#EEE'), opacity: 0.85 }} />
              </div>
              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: item.isIncome ? '#4A8A4A' : C.bark, margin: '0 0 3px', wordBreak: 'break-word', lineHeight: 1.35 }}>
                  {isAwaiting && <span style={{ fontSize: 9, fontWeight: 700, background: '#FFE8CC', color: '#9A6800', borderRadius: 4, padding: '1px 4px', marginRight: 4, verticalAlign: 'middle' }}>⏳</span>}
                  {item.isIncome && <span style={{ fontSize: 9, fontWeight: 700, background: '#E0F4D8', color: '#4A7A35', borderRadius: 4, padding: '1px 4px', marginRight: 4, verticalAlign: 'middle' }}>收入</span>}
                  {item.description || '（無說明）'}
                </p>
                <p style={{ fontSize: 10, color: C.barkLight, margin: 0, lineHeight: 1.4 }}>
                  {item.date}
                  {showPayer && item.splitWith.length > 0 && ` · ${item.splitWith[0] !== name ? item.splitWith[0] : (item.splitWith[1] || '')} 付`}
                  {` · 共 ${sw.length} 人`}
                  {item.origCurrency !== 'TWD' && ` · ${item.origCurrency} ${item.origAmount.toLocaleString()}`}
                </p>
              </div>
              {/* Amounts */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {showPayer ? (
                  // Section 2: show my share prominently
                  <>
                    <p style={{ fontSize: 14, fontWeight: 700, color: item.isIncome ? '#4A8A4A' : C.earth, margin: '0 0 1px' }}>
                      {item.isIncome ? '−' : ''}NT$ {item.myShare.toLocaleString()}
                    </p>
                    <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>共 NT$ {item.effectiveTWD.toLocaleString()}</p>
                  </>
                ) : (
                  // Section 1: show total paid, then my share below
                  <>
                    <p style={{ fontSize: 14, fontWeight: 700, color: item.isIncome ? '#4A8A4A' : C.earth, margin: '0 0 1px' }}>
                      {item.isIncome ? '＋' : ''}NT$ {item.effectiveTWD.toLocaleString()}
                    </p>
                    <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>我分 NT$ {item.myShare.toLocaleString()}</p>
                  </>
                )}
              </div>
            </div>
          );
        };

        // ── Section toggle button ────────────────────────────────────────
        const SectionToggle = ({
          label, count, total, isOpen, onToggle, accent,
        }: {
          label: string; count: number; total: number;
          isOpen: boolean; onToggle: () => void; accent: string;
        }) => (
          <button onClick={onToggle} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
            background: isOpen ? `${accent}22` : 'var(--tm-card-bg)',
            border: `1.5px solid ${isOpen ? accent : C.creamDark}`,
            cursor: 'pointer', fontFamily: FONT, marginBottom: isOpen ? 2 : 0,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.bark, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, display: 'inline-block' }} />
              {label}
              <span style={{ fontSize: 11, fontWeight: 400, color: C.barkLight }}>（{count} 筆）</span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: isOpen ? accent : C.earth, display: 'flex', alignItems: 'center', gap: 6 }}>
              NT$ {total < 0 ? `−${Math.abs(total).toLocaleString()}` : total.toLocaleString()}
              <span style={{ fontSize: 11 }}>{isOpen ? '▲' : '▼'}</span>
            </span>
          </button>
        );

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 560 }}
            onClick={() => setSettlementDetailName(null)}>
            <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '88vh', overflowY: 'auto', boxSizing: 'border-box' }}
              onClick={e => e.stopPropagation()}>

              {/* ── Header ── */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: memberColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {getMemberAvatar(name)
                      ? <img src={getMemberAvatar(name)!} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 13, fontWeight: 700, color: avatarTextColor(memberColor) }}>{name[0]?.toUpperCase()}</span>}
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: C.bark, margin: 0 }}>
                    {name} 的個人對帳單
                  </p>
                </div>
                <button onClick={() => setSettlementDetailName(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight, lineHeight: 1 }}>✕</button>
              </div>

              {/* ── Section 3 (shown first): Net Summary ── */}
              <div style={{ background: isCreditor ? '#EAF3DE' : '#FAE0E0', borderRadius: 14, padding: '14px 16px', marginBottom: 14, border: `1px solid ${isCreditor ? '#B5CFA7' : '#F0C0C0'}` }}>
                {/* Equation row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <p style={{ fontSize: 10, color: isCreditor ? '#4A7A35' : '#9A3A3A', margin: '0 0 2px', fontWeight: 600 }}>支出總額</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: isCreditor ? '#4A7A35' : '#9A3A3A', margin: 0 }}>NT$ {stmt.myPaymentsTotal.toLocaleString()}</p>
                  </div>
                  <span style={{ fontSize: 14, color: isCreditor ? '#4A7A35' : '#9A3A3A', fontWeight: 700 }}>−</span>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <p style={{ fontSize: 10, color: isCreditor ? '#4A7A35' : '#9A3A3A', margin: '0 0 2px', fontWeight: 600 }}>應付份額</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: isCreditor ? '#4A7A35' : '#9A3A3A', margin: 0 }}>NT$ {stmt.mySharesTotal.toLocaleString()}</p>
                  </div>
                  <span style={{ fontSize: 14, color: isCreditor ? '#4A7A35' : '#9A3A3A', fontWeight: 700 }}>=</span>
                  <div style={{ flex: 1.2, textAlign: 'center' }}>
                    <p style={{ fontSize: 10, color: isCreditor ? '#4A7A35' : '#9A3A3A', margin: '0 0 2px', fontWeight: 600 }}>
                      {isCreditor ? '可收回' : '需支付'}
                    </p>
                    <p style={{ fontSize: 16, fontWeight: 900, color: isCreditor ? '#4A7A35' : '#9A3A3A', margin: 0 }}>
                      NT$ {Math.abs(stmt.net).toLocaleString()}
                    </p>
                  </div>
                </div>
                {/* Advanced-for-others sub-note */}
                {stmt.myAdvancedTotal > 0 && (
                  <p style={{ fontSize: 10, color: isCreditor ? '#4A7A35' : '#9A3A3A', margin: 0, borderTop: `1px solid ${isCreditor ? '#B5CFA7' : '#F0C0C0'}`, paddingTop: 8 }}>
                    ↑ 其中代墊他人份額 NT$ {stmt.myAdvancedTotal.toLocaleString()}
                  </p>
                )}
              </div>

              {/* ── Awaiting card-statement warning ── */}
              {stmt.hasAwaitingItems && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '8px 12px', borderRadius: 10, background: '#FFE8CC', border: '1px solid #E8B96A', marginBottom: 12 }}>
                  <FontAwesomeIcon icon={faCreditCard} style={{ fontSize: 11, color: '#9A6800', marginTop: 1, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#9A6800', lineHeight: 1.5 }}>部分費用等待卡單確認中（⏳），尚未納入上方計算</span>
                </div>
              )}

              {/* ── Related settlement suggestions ── */}
              {mySettlements.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: C.barkLight, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>結算建議</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {mySettlements.map((s, i) => {
                      const isPayer = s.from === name;
                      const other = isPayer ? s.to : s.from;
                      const otherColor = getMemberColor(other);
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--tm-card-bg)', borderRadius: 12, padding: '10px 14px', border: `1.5px solid ${C.creamDark}` }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: otherColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                            {getMemberAvatar(other)
                              ? <img src={getMemberAvatar(other)!} alt={other} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <span style={{ fontSize: 11, fontWeight: 700, color: avatarTextColor(otherColor) }}>{other[0]?.toUpperCase()}</span>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: 0 }}>
                              {isPayer ? `付給 ${other}` : `收自 ${other}`}
                            </p>
                            <p style={{ fontSize: 10, color: C.barkLight, margin: '1px 0 0' }}>
                              {isPayer ? `${name} → ${other}` : `${other} → ${name}`}
                            </p>
                          </div>
                          <p style={{ fontSize: 15, fontWeight: 700, color: isPayer ? '#9A3A3A' : '#4A7A35', margin: 0, flexShrink: 0 }}>
                            {isPayer ? '−' : '＋'}NT$ {s.amount.toLocaleString()}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {ms.net === 0 && mySettlements.length === 0 && (
                <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
                  <p style={{ fontSize: 13, color: '#4A7A35', fontWeight: 700, margin: 0 }}>✓ 已結清，帳目平衡</p>
                </div>
              )}

              {/* ── Section 1: My Payments ── */}
              <div style={{ marginBottom: 10 }}>
                <SectionToggle
                  label="我的支出"
                  count={stmt.myPayments.length}
                  total={stmt.myPaymentsTotal}
                  isOpen={stmtPaymentsOpen}
                  onToggle={() => setStmtPaymentsOpen(v => !v)}
                  accent={C.earth}
                />
                {stmtPaymentsOpen && (
                  <div style={{ paddingLeft: 2, paddingRight: 2 }}>
                    {stmt.myPayments.length === 0
                      ? <p style={{ fontSize: 12, color: C.barkLight, padding: '12px 0', textAlign: 'center' }}>無付款記錄</p>
                      : stmt.myPayments.map(item => <StmtRow key={item.id} item={item} showPayer={false} />)
                    }
                  </div>
                )}
              </div>

              {/* ── Section 2: My Shares ── */}
              <div style={{ marginBottom: 14 }}>
                <SectionToggle
                  label="我的應付"
                  count={stmt.myShares.length}
                  total={stmt.mySharesTotal}
                  isOpen={stmtSharesOpen}
                  onToggle={() => setStmtSharesOpen(v => !v)}
                  accent={C.sage}
                />
                {stmtSharesOpen && (
                  <div style={{ paddingLeft: 2, paddingRight: 2 }}>
                    {stmt.myShares.length === 0
                      ? <p style={{ fontSize: 12, color: C.barkLight, padding: '12px 0', textAlign: 'center' }}>無應付記錄</p>
                      : stmt.myShares.map(item => <StmtRow key={item.id} item={item} showPayer={true} />)
                    }
                  </div>
                )}
              </div>

              <p style={{ fontSize: 10, color: C.barkLight, textAlign: 'center', margin: 0 }}>
                以上為建議結算方案，實際以雙方確認為準
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── Member Detail Modal — self only; private visible only to owner ── */}
      {memberDetailName && memberDetailName === currentUserName && (() => {
        const detailName = memberDetailName;
        // Shared expenses this member is part of (payer or in splitWith); exclude settlements.
        const sharedExpenses = visibleExpenses.filter((e: any) => {
          if (e.category === 'settlement') return false;
          if (e.isPrivate) return false;
          const sw: string[] = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
          return e.payer === detailName || sw.includes(detailName);
        });
        // Own private expenses (only accessible here because modal is self-only).
        const privateExpenses = visibleExpenses.filter((e: any) =>
          e.isPrivate && e.privateOwnerUid && e.privateOwnerUid === googleUid
        );

        // Tab selection → which list to show + pie input
        const tab = detailTab;
        const tabExpenses =
          tab === 'shared' ? sharedExpenses :
          tab === 'private' ? privateExpenses :
          [...sharedExpenses, ...privateExpenses];

        // Personal share for tab rows
        const shareFor = (e: any): number => {
          if (e.isPrivate) return effectiveTWD(e);
          return getPersonalShare(e, detailName, memberNames);
        };

        // Header stat totals.
        //   sharedBurdenTWD = MY share of every shared expense I'm part of
        //     — NOT what I personally paid out. Using payer-sum was the bug
        //     behind "目前花費 NT$ 0" when brian paid everything: the user
        //     still consumed their share, so share is what they expect to
        //     see here.
        const sharedBurdenTWD = sharedExpenses
          .reduce((s: number, e: any) => s + getPersonalShare(e, detailName, memberNames), 0);
        const privateTotalTWD = privateExpenses
          .reduce((s: number, e: any) => s + (effectiveTWD(e)), 0);

        // Category breakdown for the currently selected tab
        const tabBreakdown = Object.entries(EXPENSE_CATEGORY_MAP).map(([key, info]) => {
          const total = tabExpenses
            .filter((e: any) => e.category === key)
            .reduce((s: number, e: any) => s + shareFor(e), 0);
          return { key, label: info.label, emoji: info.emoji, value: total };
        }).filter(d => d.value > 0);
        const tabTotal = tabBreakdown.reduce((s, d) => s + d.value, 0);

        const ms = memberStats.find(m => m.name === detailName);

        const tabBtn = (key: 'all' | 'shared' | 'private', label: React.ReactNode, count: number, tint: string) => (
          <button key={key} onClick={() => setDetailTab(key)}
            style={{ flex: 1, padding: '8px 6px', borderRadius: 10, border: `1.5px solid ${tab === key ? tint : C.creamDark}`, background: tab === key ? tint : 'var(--tm-card-bg)', color: tab === key ? 'white' : C.barkLight, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            {label} ({count})
          </button>
        );

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 }}
            onClick={ev => { if (ev.target === ev.currentTarget) setMemberDetailName(null); }}>
            <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '88vh', overflowY: 'auto', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}><FontAwesomeIcon icon={faChartPie} style={{ fontSize: 14 }} /> 我的記帳明細</p>
                <button onClick={() => setMemberDetailName(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
              </div>

              {/* Privacy reassurance */}
              <p style={{ fontSize: 10, color: C.barkLight, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 5 }}>
                <FontAwesomeIcon icon={faLock} style={{ fontSize: 9 }} /> 私人花費僅你本人可見
              </p>

              {/* Header stats — split shared vs private */}
              {ms && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div className="tm-stat-paid-box" style={{ flex: 1, background: '#FFF8E8', borderRadius: 12, padding: '10px 12px', border: `1px solid ${C.creamDark}` }}>
                    <p style={{ fontSize: 10, color: C.barkLight, margin: '0 0 2px' }}>目前花費（不含私人）</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: C.bark, margin: 0 }}>NT$ {sharedBurdenTWD.toLocaleString()}</p>
                  </div>
                  <div style={{ flex: 1, background: 'var(--tm-note-5)', borderRadius: 12, padding: '10px 12px', border: `1px solid ${C.creamDark}` }}>
                    <p style={{ fontSize: 10, color: C.barkLight, margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FontAwesomeIcon icon={faLock} style={{ fontSize: 8 }} />私人花費
                    </p>
                    <p className="tm-expense-private-title" style={{ fontSize: 15, fontWeight: 700, color: '#6A2A9A', margin: 0 }}>NT$ {privateTotalTWD.toLocaleString()}</p>
                  </div>
                </div>
              )}
              {ms && (
                <div className={ms.net >= 0 ? 'tm-member-stat-creditor' : 'tm-member-stat-debtor'} style={{ marginBottom: 14, background: ms.net >= 0 ? '#EAF3DE' : '#FAE0E0', borderRadius: 12, padding: '10px 12px', border: `1px solid ${ms.net >= 0 ? '#B5CFA7' : '#F0C0C0'}` }}>
                  <p style={{ fontSize: 10, color: C.barkLight, margin: '0 0 2px' }}>{ms.net >= 0 ? '代墊金額' : '需還款金額'}</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: ms.net >= 0 ? '#4A7A35' : '#9A3A3A', margin: 0 }}>
                    {Math.abs(ms.net) > 0 ? `NT$ ${Math.abs(ms.net).toLocaleString()}` : '已結清 ✓'}
                  </p>
                </div>
              )}

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {tabBtn('all',     '全部', sharedExpenses.length + privateExpenses.length, C.earth)}
                {tabBtn('shared',  '團體', sharedExpenses.length,                          C.sage)}
                {tabBtn('private', <><FontAwesomeIcon icon={faLock} style={{ fontSize: 10 }} />私人</>, privateExpenses.length, '#6A2A9A')}
              </div>

              {/* Pie + category breakdown for selected tab */}
              {tabTotal > 0 && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, padding: '10px', borderRadius: 12, border: `1px solid ${C.creamDark}`, background: 'var(--tm-card-bg)' }}>
                  <div style={{ flexShrink: 0 }}>
                    <PieChart data={tabBreakdown} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {tabBreakdown.map(d => {
                      const pct = Math.round(d.value / tabTotal * 100);
                      return (
                        <div key={d.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.bark }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: PIE_COLORS[d.key] || '#999' }} />
                            {d.label}
                          </span>
                          <span style={{ color: C.barkLight, fontWeight: 600 }}>NT$ {d.value.toLocaleString()} · {pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 10px', fontWeight: 600 }}>共 {tabExpenses.length} 筆</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tabExpenses.map((e: any) => {
                  const share = shareFor(e);
                  const amtTWD = effectiveTWD(e);
                  const isPayer = e.payer === detailName;
                  const cat = EXPENSE_CATEGORY_MAP[e.category] || EXPENSE_CATEGORY_MAP.other;
                  const isPrivateRow = !!e.isPrivate;
                  return (
                    <div key={e.id} style={{ background: isPrivateRow ? 'var(--tm-note-5)' : 'var(--tm-card-bg)', borderRadius: 14, padding: '10px 12px', border: `1px solid ${isPrivateRow ? '#D4B0F0' : C.creamDark}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: cat?.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <FontAwesomeIcon icon={CATEGORY_ICONS[e.category] || CATEGORY_ICONS.other} style={{ fontSize: 14, color: avatarTextColor(cat?.bg), opacity: 0.85 }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: isPrivateRow ? '#6A2A9A' : C.bark, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                          {isPrivateRow && <FontAwesomeIcon icon={faLock} style={{ fontSize: 10 }} />}
                          {e.description}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>{e.date || ''}</p>
                          {!isPrivateRow && isPayer && <span className="tm-payer-badge" style={{ fontSize: 9, fontWeight: 700, background: '#E0F0D8', color: '#4A7A35', borderRadius: 5, padding: '1px 5px' }}>付款者</span>}
                          {isPrivateRow && <span className="tm-badge-private" style={{ fontSize: 9, fontWeight: 700, background: '#F0E8FF', color: '#6A2A9A', borderRadius: 5, padding: '1px 5px' }}>私人</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: isPrivateRow ? '#6A2A9A' : C.earth, margin: '0 0 1px' }}>NT$ {share.toLocaleString()}</p>
                        {!isPrivateRow && <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>共 NT$ {amtTWD.toLocaleString()}</p>}
                      </div>
                    </div>
                  );
                })}
                {tabExpenses.length === 0 && (
                  <p style={{ textAlign: 'center', fontSize: 13, color: C.barkLight, padding: '24px 0' }}>此分類目前沒有記帳</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Settlement Form Modal ── */}
      {showSettleForm && (
        <SettlementForm
          memberNames={displayMemberNames}
          onAdd={handleAddSettlement}
          onClose={() => setShowSettleForm(false)}
          firestore={firestore}
          projCurrency={projCurrency}
        />
      )}

      {/* ── Expense Form Modal ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '93vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>
                {editingId
                  ? <><FontAwesomeIcon icon={faPen} style={{ fontSize: 12, marginRight: 6 }} />修改{form.isIncome ? '收入' : '支出'}</>
                  : form.isIncome
                    ? <><FontAwesomeIcon icon={faCoins} style={{ fontSize: 13, marginRight: 6, color: '#4A8A4A' }} />新增收入</>
                    : <><FontAwesomeIcon icon={faMoneyBill1} style={{ fontSize: 12, marginRight: 6 }} />新增支出</>}
              </p>
              <button onClick={closeForm}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>

            {/* 支出 / 收入 toggle */}
            {!editingId && (
              <div style={{ display: 'flex', background: 'var(--tm-input-bg)', borderRadius: 12, padding: 3, gap: 3, marginBottom: 16 }}>
                {([
                  { v: false, label: '支出', icon: faMoneyBill1, activeColor: C.earth },
                  { v: true,  label: '收入', icon: faCoins,      activeColor: '#4A8A4A' },
                ] as { v: boolean; label: string; icon: any; activeColor: string }[]).map(({ v, label, icon, activeColor }) => (
                  <button key={String(v)} onClick={() => setForm(p => ({ ...p, isIncome: v, category: v ? 'income' : (p.category === 'income' ? 'food' : p.category), incomeScope: 'group', incomeBeneficiary: '' }))}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
                      background: form.isIncome === v ? activeColor : 'transparent',
                      color: form.isIncome === v ? 'white' : C.barkLight,
                      fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'all 0.15s',
                    }}>
                    <FontAwesomeIcon icon={icon} style={{ fontSize: 11 }} />{label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Description */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>名稱 *</label>
                <input ref={descRef} style={iStyle} placeholder={form.isIncome ? '例：退稅、退款、換回台幣' : '例：藥妝店購物'} value={form.description} onChange={e => set('description', e.target.value)} />
              </div>

              {/* Amount */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>金額 *</label>
                <input ref={amtRef} style={{ ...iStyle, textAlign: 'right' }} type="number" inputMode="decimal" placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} />
                {form.amount && (
                  <p style={{ fontSize: 12, color: C.barkLight, margin: '4px 0 0', textAlign: 'right' }}>
                    ≈ NT$ {form.currency === 'IDR' && liveIdrRate
                      ? Math.round(Number(form.amount) * liveIdrRate).toLocaleString()
                      : toTWD(Number(form.amount), form.currency).toLocaleString()}
                    {form.currency === 'IDR' && (
                      <span style={{ fontSize: 10, marginLeft: 4, color: liveIdrRate ? C.sageDark : C.barkLight }}>
                        {liveIdrRate ? '(即時匯率)' : '(參考匯率)'}
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Currency */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>幣別</label>
                <CurrencyPicker value={form.currency} onChange={v => set('currency', v)} projCurrency={projCurrency} />
              </div>

              {/* Payment Method — hidden for income entries */}
              {!form.isIncome && <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>付款方式</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['cash', 'card'] as const).map(m => (
                    <button key={m} onClick={() => set('paymentMethod', m)}
                      style={{ flex: 1, padding: '9px 8px', borderRadius: 12, border: `1.5px solid ${form.paymentMethod === m ? C.sageDark : C.creamDark}`, background: form.paymentMethod === m ? C.sageLight : 'var(--tm-card-bg)', color: C.bark, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                      {m === 'cash' ? <><FontAwesomeIcon icon={faMoneyBill1} style={{ marginRight: 5 }} />現金</> : <><FontAwesomeIcon icon={faCreditCard} style={{ marginRight: 5 }} />刷卡</>}
                    </button>
                  ))}
                </div>
              </div>}

              {/* FX rate + card fee (only non-TWD and non-income) */}
              {!form.isIncome && form.currency !== 'TWD' && (
                <div style={{ padding: '10px 12px', background: 'var(--tm-section-bg)', borderRadius: 12, border: `1px solid ${C.creamDark}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>
                      匯率（1 {form.currency} = __ TWD）
                    </label>
                    <input style={{ ...inputStyle, fontSize: 14 }} type="number" step="0.0001" inputMode="decimal"
                      placeholder={`預設 ${resolvedRate.rate}（${resolvedRate.source}）`}
                      value={form.exchangeRate}
                      onChange={ev => set('exchangeRate', ev.target.value)} />
                  </div>
                  {form.paymentMethod === 'card' && (
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>
                        海外刷卡手續費（%）
                      </label>
                      <input style={{ ...inputStyle, fontSize: 14 }} type="number" step="0.1" inputMode="decimal"
                        placeholder="預設 1.5"
                        value={form.cardFeePercent}
                        onChange={ev => set('cardFeePercent', ev.target.value)} />
                    </div>
                  )}
                  {mainAmt > 0 && (
                    <p style={{ fontSize: 11, color: C.sageDark, margin: 0, fontWeight: 600 }}>
                      <FontAwesomeIcon icon={faMoneyBill1} style={{ fontSize: 10, marginRight: 4 }} />
                      {form.paymentMethod === 'card' ? '預估 TWD' : '換算 TWD'}：NT$ {mainAmtTWD.toLocaleString()}
                      <span style={{ color: C.barkLight, fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
                        = {form.currency} {mainAmt.toLocaleString()} × {formExchangeRate || resolvedRate.rate}
                        {form.paymentMethod === 'card' && ` × (1 + ${formCardFee}%)`}
                      </span>
                    </p>
                  )}
                  {form.paymentMethod === 'card' && (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.awaitCardStatement}
                        onChange={ev => set('awaitCardStatement', ev.target.checked)}
                        style={{ marginTop: 2 }} />
                      <div>
                        <p style={{ fontSize: 12, color: C.bark, fontWeight: 600, margin: 0 }}>等卡單下來再結算</p>
                        <p style={{ fontSize: 10, color: C.barkLight, margin: '2px 0 0', lineHeight: 1.5 }}>
                          勾選後此筆暫不納入結算建議，等刷卡單下來用「補實際金額」填入實際 TWD 即自動納入
                        </p>
                      </div>
                    </label>
                  )}
                </div>
              )}

              {/* Category — hidden for income (auto-set to 'income') */}
              {!form.isIncome && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>類別</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(EXPENSE_CATEGORY_MAP).filter(([key]) => key !== 'income').map(([key, info]) => (
                    <button key={key} onClick={() => set('category', key)}
                      className={form.category === key ? `tm-cat-active-${key}` : ''}
                      style={{ padding: '6px 12px', borderRadius: 10, border: `1.5px solid ${form.category === key ? C.sageDark : C.creamDark}`, background: form.category === key ? info.bg : 'var(--tm-card-bg)', color: form.category === key ? '#333' : C.bark, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <FontAwesomeIcon icon={CATEGORY_ICONS[key] || CATEGORY_ICONS.other} style={{ fontSize: 11 }} />
                      {info.label}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {/* Payer / 收款人 */}
              {!form.isPrivate && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>
                  {form.isIncome ? '收款人（代收者）*' : '誰付款 *'}
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {displayMemberNames.map((name: string) => (
                    <button key={name} onClick={() => set('payer', name)}
                      style={{ flex: 1, minWidth: 60, padding: '10px 8px', borderRadius: 12, border: `1.5px solid ${form.payer === name ? C.sageDark : C.creamDark}`, background: form.payer === name ? C.sage : 'var(--tm-card-bg)', color: form.payer === name ? 'white' : C.bark, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 13 }}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {/* Income benefit scope — who gets the benefit of this income */}
              {form.isIncome && !form.isPrivate && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>收益方式</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: form.incomeScope === 'personal' ? 10 : 0 }}>
                    {([
                      ['group',    '👥 全體均分'] as const,
                      ['personal', '👤 指定個人'] as const,
                    ]).map(([scope, label]) => (
                      <button key={scope}
                        onClick={() => setForm(p => ({
                          ...p,
                          incomeScope: scope,
                          // Auto-select payer as default beneficiary when first switching to personal
                          incomeBeneficiary: scope === 'personal' && !p.incomeBeneficiary ? (p.payer || '') : p.incomeBeneficiary,
                        }))}
                        style={{ flex: 1, padding: '9px 8px', borderRadius: 12,
                          border: `1.5px solid ${form.incomeScope === scope ? '#4A8A4A' : C.creamDark}`,
                          background: form.incomeScope === scope ? '#E0F4D8' : 'var(--tm-card-bg)',
                          color: form.incomeScope === scope ? '#2A6A2A' : C.bark,
                          fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT,
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {form.incomeScope === 'personal' && (
                    <div>
                      <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 6px' }}>
                        受益人（此筆收入僅影響該成員帳務，其他人不受影響）
                      </p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {displayMemberNames.map((name: string) => (
                          <button key={name}
                            onClick={() => setForm(p => ({ ...p, incomeBeneficiary: name }))}
                            style={{ flex: 1, minWidth: 60, padding: '9px 8px', borderRadius: 12,
                              border: `1.5px solid ${form.incomeBeneficiary === name ? '#4A8A4A' : C.creamDark}`,
                              background: form.incomeBeneficiary === name ? '#E0F4D8' : 'var(--tm-card-bg)',
                              color: form.incomeBeneficiary === name ? '#2A6A2A' : C.bark,
                              fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 13,
                            }}>
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Split Mode — hidden for income (always split equally) */}
              {!form.isPrivate && !form.isIncome && <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>分帳方式</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                  {([
                    ['equal',    <FontAwesomeIcon icon={faScaleBalanced} />, '均分'],
                    ['weighted', <FontAwesomeIcon icon={faPercent} />,       '比例'],
                    ['amount',   <FontAwesomeIcon icon={faPen} />,           '自訂金額'],
                  ] as [SplitMode, React.ReactNode, string][]).map(([mode, icon, label]) => (
                    <button key={mode} onClick={() => set('splitMode', mode)}
                      style={{ padding: '9px 4px', borderRadius: 12, border: `1.5px solid ${form.splitMode === mode ? C.sageDark : C.creamDark}`, background: form.splitMode === mode ? C.sageLight : 'var(--tm-card-bg)', color: C.bark, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      {icon} {label}
                    </button>
                  ))}
                </div>

                {/* Equal split: member selector — default all-selected, click to deselect */}
                {form.splitMode === 'equal' && (
                  <div>
                    <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 6px' }}>點擊成員以剔除（預設全員分攤）</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {displayMemberNames.map((name: string) => {
                        const selected = isMemberSelected(name);
                        return (
                          <button key={name} onClick={() => toggleSplitMember(name)}
                            style={{ flex: 1, minWidth: 60, padding: '9px 8px', borderRadius: 12, border: `1.5px solid ${selected ? C.sageDark : C.creamDark}`, background: selected ? C.sage : 'var(--tm-card-bg)', color: selected ? 'white' : C.barkLight, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, fontSize: 13, opacity: selected ? 1 : 0.55, textDecoration: selected ? 'none' : 'line-through' }}>
                            {name}
                          </button>
                        );
                      })}
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
                    {displayMemberNames.map((name: string) => {
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
                    {displayMemberNames.map((name: string) => (
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
                    <div style={{ background: Math.abs(customRemaining) < 1 ? 'var(--tm-status-ok-bg)' : 'var(--tm-status-warn-bg)', borderRadius: 10, padding: '8px 12px' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: Math.abs(customRemaining) < 1 ? 'var(--tm-status-ok-text)' : 'var(--tm-status-warn-text)', margin: 0 }}>
                        總計：{customTotal.toLocaleString()} / 剩餘：{customRemaining.toLocaleString()} {form.currency}
                      </p>
                    </div>
                  </div>
                )}
              </div>}

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

              {/* Private expense toggle */}
              {googleUid && !form.isIncome && (
                <div>
                  <button
                    type="button"
                    onClick={() => set('isPrivate', !form.isPrivate)}
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1.5px solid ${form.isPrivate ? '#9A5AC8' : C.creamDark}`, background: form.isPrivate ? '#F0E8FF' : 'var(--tm-card-bg)', color: form.isPrivate ? '#6A2A9A' : C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FontAwesomeIcon icon={faLock} style={{ fontSize: 11 }} /> 私人支出（僅自己可見）</span>
                    <span style={{ width: 36, height: 20, borderRadius: 10, background: form.isPrivate ? '#9A5AC8' : C.creamDark, position: 'relative', display: 'inline-block', flexShrink: 0, transition: 'background 0.2s' }}>
                      <span style={{ position: 'absolute', top: 2, left: form.isPrivate ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </span>
                  </button>
                  {form.isPrivate && (
                    <p style={{ fontSize: 11, color: '#6A2A9A', margin: '4px 0 0', paddingLeft: 2 }}>此筆支出不計入分帳結算，僅記錄個人花費</p>
                  )}
                </div>
              )}

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
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}><FontAwesomeIcon icon={faPaperclip} style={{ marginRight: 4 }} />附件（發票／收據）</label>
                <input ref={receiptRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) handleReceiptUpload(e.target.files[0]); e.target.value = ''; }} />
                {form.receiptUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src={form.receiptUrl} alt="附件預覽" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: `1.5px solid ${C.creamDark}`, cursor: 'pointer' }}
                      onClick={() => setLightboxUrl(form.receiptUrl)} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 11, color: C.sageDark, fontWeight: 600, margin: '0 0 4px' }}>✓ 附件已上傳</p>
                      <button onClick={() => set('receiptUrl', '')}
                        style={{ fontSize: 11, color: '#9A3A3A', background: '#FAE0E0', border: 'none', borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT, fontWeight: 600 }}>
                        ✕ 移除
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => receiptRef.current?.click()} disabled={receiptUploading}
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 14, border: `2px dashed ${C.creamDark}`, background: 'var(--tm-input-bg)', color: receiptUploading ? C.sageDark : C.barkLight, fontWeight: 700, fontSize: 13, cursor: receiptUploading ? 'default' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {receiptUploading ? '上傳中...' : <><FontAwesomeIcon icon={faCamera} style={{ fontSize: 11, marginRight: 5 }} />拍照 / 上傳附件</>}
                  </button>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={closeForm}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 14 }}>
                  取消
                </button>
                <button onClick={handleSave} disabled={saving || !form.description || !form.amount || (!form.isPrivate && !form.isIncome && !form.payer) || (form.isIncome && form.incomeScope === 'personal' && !form.incomeBeneficiary)}
                  style={{ ...btnPrimary(form.isIncome ? '#4A8A4A' : form.isPrivate ? '#7A4AAA' : undefined), flex: 2, opacity: saving || !form.description || !form.amount || (!form.isPrivate && !form.isIncome && !form.payer) || (form.isIncome && form.incomeScope === 'personal' && !form.incomeBeneficiary) ? 0.6 : 1 }}>
                  {saving ? '儲存中...' : editingId ? <><FontAwesomeIcon icon={faPen} style={{ marginRight: 6 }} />儲存修改</> : form.isIncome ? <><FontAwesomeIcon icon={faCoins} style={{ marginRight: 6 }} />新增收入</> : form.isPrivate ? <><FontAwesomeIcon icon={faLock} style={{ marginRight: 6 }} />新增私人支出</> : <><FontAwesomeIcon icon={faMoneyBill1} style={{ marginRight: 6 }} />新增支出</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <PageHeader title="旅行記帳" subtitle="支出記錄・分帳結算" emoji={<FontAwesomeIcon icon={faMoneyBill1} />} color={C.sage} className="tm-hero-page-sage">
        {!isVisitor && (
          <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.2)', borderRadius: 14, padding: '12px 14px' }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', margin: '0 0 2px' }}>
              {expenseView === 'mine' && currentUserName ? '個人負擔總額（換算台幣）' : '團隊總支出（換算台幣）'}
            </p>
            <p style={{ fontSize: 28, fontWeight: 900, color: 'white', margin: 0 }}>NT$ {headerTWD.toLocaleString()}</p>
            {expenseView === 'mine' && currentUserName && (
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', margin: '3px 0 0' }}>
                含個人分攤＋私人消費 · 團隊共 NT$ {teamTotalTWD.toLocaleString()}
              </p>
            )}
          </div>
        )}
      </PageHeader>

      <div style={{ padding: '12px 16px 80px' }}>

        {/* ── Member stats (hidden for visitors) ── */}
        {!isVisitor && (
          <div style={{ marginBottom: 12, position: 'relative' }}>
            {/* Desktop arrow navigation */}
            <button
              onClick={() => memberScrollRef.current?.scrollBy({ left: -180, behavior: 'smooth' })}
              style={{ display: 'none', position: 'absolute', left: -14, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', cursor: 'pointer', zIndex: 2, alignItems: 'center', justifyContent: 'center', fontSize: 14, color: C.bark, boxShadow: C.shadowSm }}
              className="tm-member-arrow tm-member-arrow-left"
            >‹</button>
            <div
              ref={memberScrollRef}
              style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
              className="tm-member-scroll"
            >
              {displayMemberNames.map(name => {
                const ms = memberStats.find(m => m.name === name);
                if (!ms) return null;
                const isCreditor = ms.net >= 0;
                // Use raw net (paid - owed) so card is consistent with detail modal formula:
                // 目前花費 = (個人份額 + 代付金額) = ms.paid
                // 代墊金額 = ms.net when positive; 需還款金額 = |ms.net| when negative
                const displayAmt = Math.abs(ms.net);
                const isMe = name === currentUserName;
                return (
                  <div key={ms.name}
                    onClick={() => { if (isMe) { setDetailTab('all'); setMemberDetailName(ms.name); } }}
                    style={{ background: 'var(--tm-card-bg)', borderRadius: 16, padding: '12px 14px', boxShadow: C.shadowSm, flexShrink: 0, width: 160, scrollSnapAlign: 'start', border: isMe ? `2px solid ${C.sageDark}` : undefined, cursor: isMe ? 'pointer' : 'default', userSelect: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: 0 }}>{ms.name}{isMe ? <FontAwesomeIcon icon={faUser} style={{ marginLeft: 4, fontSize: 10 }} /> : ''}</p>
                    </div>
                    <p style={{ fontSize: 9, color: C.barkLight, margin: '0 0 6px' }}>{isMe ? '點擊查看明細 ›' : '僅本人可查看明細'}</p>
                    <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 2px' }}>目前花費</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: C.earth, margin: '0 0 8px' }}>NT$ {ms.paid.toLocaleString()}</p>
                    <div className={isCreditor ? 'tm-member-stat-creditor' : 'tm-member-stat-debtor'}
                      onClick={e => { e.stopPropagation(); if (displayAmt > 0) setSettlementDetailName(ms.name); }}
                      style={{ background: isCreditor ? '#EAF3DE' : '#FAE0E0', borderRadius: 8, padding: '5px 8px', cursor: displayAmt > 0 ? 'pointer' : 'default' }}>
                      <p style={{ fontSize: 10, color: isCreditor ? '#4A7A35' : '#9A3A3A', margin: '0 0 1px', fontWeight: 600 }}>
                        {isCreditor ? '代墊金額' : '需還款金額'}{displayAmt > 0 ? ' ›' : ''}
                      </p>
                      <p style={{ fontSize: 12, fontWeight: 700, color: isCreditor ? '#4A7A35' : '#9A3A3A', margin: 0 }}>
                        {displayAmt > 0 ? `NT$ ${displayAmt.toLocaleString()}` : '已結清 ✓'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => memberScrollRef.current?.scrollBy({ left: 180, behavior: 'smooth' })}
              style={{ display: 'none', position: 'absolute', right: -14, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', cursor: 'pointer', zIndex: 2, alignItems: 'center', justifyContent: 'center', fontSize: 14, color: C.bark, boxShadow: C.shadowSm }}
              className="tm-member-arrow tm-member-arrow-right"
            >›</button>
          </div>
        )}

        {/* ── Settlement suggestions (hidden for visitors) ── */}
        {/* Awaiting-statement reminder — these expenses are excluded from stats */}
        {!isVisitor && (() => {
          const awaitCount = visibleExpenses.filter((e: any) => e.awaitCardStatement).length;
          if (awaitCount === 0) return null;
          return (
            <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 12, background: '#FFE8CC', border: '1px solid #E8B96A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FontAwesomeIcon icon={faCreditCard} style={{ fontSize: 12, color: '#9A6800' }} />
              <span style={{ fontSize: 11, color: '#9A6800', fontWeight: 600, lineHeight: 1.5 }}>
                共 {awaitCount} 筆刷卡記帳等卡單中，暫未納入結算。卡單到後請點卡片上
                <FontAwesomeIcon icon={faReceipt} style={{ fontSize: 10, margin: '0 3px' }} />補實際金額。
              </span>
            </div>
          );
        })()}

        {!isVisitor && settlements.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <button onClick={() => setSettlementExpanded(v => !v)}
              className="tm-settlement-toggle"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#EAF3DE', borderRadius: 14, padding: '10px 14px', border: '1px solid #B5CFA7', cursor: 'pointer', fontFamily: FONT, marginBottom: settlementExpanded ? 8 : 0 }}>
              <span className="tm-settlement-toggle-text" style={{ fontSize: 12, fontWeight: 700, color: '#4A7A35', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FontAwesomeIcon icon={faArrowRightArrowLeft} style={{ fontSize: 11 }} />
                建議結算方式（{settlements.length} 筆）
              </span>
              <span className="tm-settlement-toggle-text" style={{ fontSize: 11, color: '#4A7A35', fontWeight: 600 }}>{settlementExpanded ? '收起 ▲' : '展開 ▼'}</span>
            </button>
            {settlementExpanded && creditorOrder.map(creditor => {
              const debts = settlementByCreditor[creditor];
              const isMyGroup = creditor === currentUserName;
              return (
                <div key={creditor} className={isMyGroup ? 'tm-settlement-card-mine' : 'tm-settlement-card-other'} style={{ ...cardStyle, marginBottom: 8, background: isMyGroup ? '#E0F4FF' : '#EAF3DE', border: `1px solid ${isMyGroup ? '#9AC8E8' : '#B5CFA7'}`, padding: '12px 14px' }}>
                  {/* Creditor header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: getMemberColor(creditor), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: C.bark, overflow: 'hidden', flexShrink: 0 }}>
                      {getMemberAvatar(creditor)
                        ? <img src={getMemberAvatar(creditor)!} alt={creditor} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : creditor[0]?.toUpperCase()}
                    </div>
                    <p className={isMyGroup ? 'tm-settlement-creditor-mine' : 'tm-settlement-creditor-other'}
                      onClick={() => setSettlementDetailName(creditor)}
                      style={{ fontSize: 13, fontWeight: 700, color: isMyGroup ? '#1A6A9A' : '#4A7A35', margin: 0, flex: 1, cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>
                      {creditor}{isMyGroup ? <FontAwesomeIcon icon={faUser} style={{ marginLeft: 4, fontSize: 10 }} /> : ''}
                    </p>
                    <span className={isMyGroup ? 'tm-settlement-creditor-mine' : 'tm-settlement-creditor-other'} style={{ fontSize: 10, fontWeight: 700, color: isMyGroup ? '#1A6A9A' : '#4A7A35', background: isMyGroup ? 'rgba(26,106,154,0.12)' : 'rgba(74,122,53,0.12)', borderRadius: 6, padding: '2px 7px' }}>收款方</span>
                  </div>
                  {/* Debtors */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {debts.map((debt, i) => {
                      const sKey = `${debt.from}-${debt.to}`;
                      const isMe = debt.from === currentUserName;
                      return (
                        <div key={i} className="tm-settlement-debt-row" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.65)', borderRadius: 10, padding: '8px 10px' }}>
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: getMemberColor(debt.from), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.bark, overflow: 'hidden', flexShrink: 0 }}>
                            {getMemberAvatar(debt.from)
                              ? <img src={getMemberAvatar(debt.from)!} alt={debt.from} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : debt.from[0]?.toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p onClick={() => setSettlementDetailName(debt.from)}
                              style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: 0, cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3, display: 'inline-block' }}>
                              {debt.from}{isMe ? <FontAwesomeIcon icon={faUser} style={{ marginLeft: 4, fontSize: 10 }} /> : ''}
                            </p>
                            <p style={{ fontSize: 11, color: C.earth, fontWeight: 600, margin: 0 }}>NT$ {debt.amount.toLocaleString()}</p>
                          </div>
                          {!isReadOnly && (
                            <button
                              onClick={() => handleQuickSettle(debt.from, debt.to, debt.amount)}
                              disabled={settlingId === sKey}
                              className="tm-settle-confirm-btn"
                              style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 8, border: 'none', background: settlingId === sKey ? C.creamDark : '#4A7A35', color: settlingId === sKey ? C.barkLight : 'white', fontSize: 11, fontWeight: 700, cursor: settlingId === sKey ? 'default' : 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                              {settlingId === sKey ? '處理中...' : '✓ 確認還款'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
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
                      <FontAwesomeIcon icon={CATEGORY_ICONS[d.key] || CATEGORY_ICONS.other} style={{ fontSize: 11, color: C.barkLight, width: 12 }} />
                      <span style={{ fontSize: 11, color: C.bark, flex: 1 }}>{d.label}</span>
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
                    style={{ fontSize: 11, background: EXPENSE_CATEGORY_MAP[d.key]?.bg || '#F0F0F0', borderRadius: 8, padding: '5px 10px', color: C.bark, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <FontAwesomeIcon icon={CATEGORY_ICONS[d.key] || CATEGORY_ICONS.other} style={{ fontSize: 10 }} />
                    {d.label} {catTotal > 0 ? Math.round(d.value / catTotal * 100) : 0}%
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Segmented control: 全團 / 與我有關 ── */}
        {!isVisitor && currentUserName && (
          <div style={{ display: 'flex', background: 'var(--tm-cream)', borderRadius: 14, padding: 3, marginBottom: 12 }}>
            <button onClick={() => setExpenseView('all')} style={{ flex: 1, padding: '9px 8px', borderRadius: 11, border: 'none', background: expenseView === 'all' ? 'var(--tm-card-bg)' : 'transparent', color: expenseView === 'all' ? C.bark : C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, boxShadow: expenseView === 'all' ? C.shadowSm : 'none', transition: 'all 0.18s' }}>
              <FontAwesomeIcon icon={faUsers} style={{ fontSize: 11, marginRight: 5 }} />全團支出
            </button>
            <button onClick={() => setExpenseView('mine')} style={{ flex: 1, padding: '9px 8px', borderRadius: 11, border: 'none', background: expenseView === 'mine' ? 'var(--tm-card-bg)' : 'transparent', color: expenseView === 'mine' ? C.bark : C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, boxShadow: expenseView === 'mine' ? C.shadowSm : 'none', transition: 'all 0.18s' }}>
              <FontAwesomeIcon icon={faUser} style={{ fontSize: 11, marginRight: 5 }} />與我有關
            </button>
          </div>
        )}

        {/* ── Action buttons ── */}
        {!isReadOnly && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => setShowForm(true)} className="tm-btn-solid-earth" style={{ ...btnPrimary(C.earth), flex: 1 }}>
              ＋ 新增
            </button>
          </div>
        )}

        {/* ── Visitor note: only category breakdown visible ── */}
        {isVisitor && (
          <div className="tm-visitor-note" style={{ background: '#F5F5F5', borderRadius: 12, padding: '9px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: C.barkLight }}><FontAwesomeIcon icon={faLock} /></span>
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
              className="tm-sort-btn"
              style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${C.earth}`, background: '#FFF2CC', color: C.earth, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
              {sortLabels[sortMode]}
            </button>
          </div>
        )}

        {/* ── Expense list (hidden for visitors) ── */}
        {!isVisitor && (filteredExpenses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: C.barkLight }}>
            <div style={{ fontSize: 32, marginBottom: 8, color: C.barkLight }}><FontAwesomeIcon icon={faMoneyBill1} /></div>
            <p style={{ fontSize: 13 }}>沒有符合的支出記錄</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredExpenses.map((e: any) => {
              const isSettlement = e.category === 'settlement';
              const isIncome = !!e.isIncome;
              const cat = isSettlement ? null : (EXPENSE_CATEGORY_MAP[e.category] || EXPENSE_CATEGORY_MAP.other);
              const amtTWD = effectiveTWD(e);
              const hasSubItems = e.subItems && e.subItems.length > 0;
              const isExpanded = expandedExpense === e.id;
              const isPrivateExpense = !!e.isPrivate;
              const isAdjustment = !!e.adjustmentOf;
              const isAwaiting = !!e.awaitCardStatement;
              const hasActual  = e.actualTWD != null;
              const isForeignCard = e.paymentMethod === 'card' && (e.currency || 'JPY') !== 'TWD';
              return (
                <div key={e.id} style={{ ...cardStyle, padding: '12px 14px', borderLeft: isPrivateExpense ? `3px solid #9A5AC8` : isSettlement ? `3px solid ${C.sageDark}` : isIncome ? `3px solid #4A8A4A` : undefined, opacity: isAwaiting ? 0.8 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {/* Category icon */}
                    {(() => {
                      const tileBg = isSettlement ? '#EAF3DE' : cat?.bg;
                      return (
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: tileBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <FontAwesomeIcon icon={CATEGORY_ICONS[isSettlement ? 'settlement' : (e.category || 'other')] || CATEGORY_ICONS.other} style={{ fontSize: 16, color: avatarTextColor(tileBg), opacity: 0.85 }} />
                        </div>
                      );
                    })()}
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                        <p className={isPrivateExpense ? 'tm-expense-private-title' : ''} style={{ fontSize: 14, fontWeight: 700, color: isPrivateExpense ? '#6A2A9A' : C.bark, margin: 0, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{e.description}</p>
                        {e._pending && (
                          <span title="同步中..." style={{ fontSize: 12, color: C.barkLight, animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>↻</span>
                        )}
                        {isPrivateExpense && (
                          <span className="tm-badge-private" style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: '#F0E8FF', color: '#6A2A9A', display: 'inline-flex', alignItems: 'center', gap: 3 }}><FontAwesomeIcon icon={faLock} style={{ fontSize: 8 }} /> 私人</span>
                        )}
                        {isSettlement ? (
                          <span className="tm-badge-settle" style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: '#EAF3DE', color: '#4A7A35' }}>結清</span>
                        ) : isIncome ? (
                          <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: '#E0F0D8', color: '#4A7A35', display: 'inline-flex', alignItems: 'center', gap: 3 }}><FontAwesomeIcon icon={faCoins} style={{ fontSize: 8 }} />收入</span>
                        ) : !isPrivateExpense && (
                          <span className={e.paymentMethod === 'card' ? 'tm-badge-sky-sm' : 'tm-badge-sage-sm'} style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: e.paymentMethod === 'card' ? '#D8EDF8' : '#EAF3DE', color: e.paymentMethod === 'card' ? '#2A6A9A' : '#4A7A35' }}>
                            {e.paymentMethod === 'card' ? '刷卡' : '現金'}
                          </span>
                        )}
                        {isAdjustment && (
                          <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: '#FFF2CC', color: '#9A6800', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <FontAwesomeIcon icon={faPen} style={{ fontSize: 8 }} />補記
                          </span>
                        )}
                        {/* FX status chip: actual / estimated / awaiting */}
                        {!isSettlement && !isPrivateExpense && (e.currency || 'JPY') !== 'TWD' && (
                          isAwaiting ? (
                            <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: '#FFE8CC', color: '#9A6800', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <FontAwesomeIcon icon={faCreditCard} style={{ fontSize: 8 }} />等卡單
                            </span>
                          ) : hasActual ? (
                            <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: '#E0F0D8', color: '#4A7A35', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <FontAwesomeIcon icon={faCheck} style={{ fontSize: 8 }} />實際
                            </span>
                          ) : isForeignCard ? (
                            <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: 'var(--tm-section-bg)', color: C.barkLight, display: 'inline-flex', alignItems: 'center', gap: 3, border: `1px dashed ${C.creamDark}` }}>
                              預估
                            </span>
                          ) : null
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 2px' }}>
                        {isIncome
                          ? `${e.payer} 代收 · ${e.splitWith && e.splitWith.length === 1 ? `${e.splitWith[0]} 受益` : '全體均分'}`
                          : `${e.payer} 付款`
                        } · {e.date || ''}
                      </p>
                      {!isSettlement && !isPrivateExpense && (
                        <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>
                          {splitModeLabel(e)}
                          {e.notes ? ` · ${e.notes}` : ''}
                        </p>
                      )}
                      {isSettlement && e.notes && (
                        <p style={{ fontSize: 11, color: C.sageDark, margin: 0, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{e.notes}</p>
                      )}
                    </div>
                    {/* Amount + actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      {expenseView === 'mine' && !isSettlement && !isPrivateExpense && currentUserName ? (() => {
                        const myShare = getPersonalShare(e, currentUserName, memberNames);
                        const isPayer = e.payer === currentUserName;
                        return (
                          <>
                            <p style={{ fontSize: 15, fontWeight: 700, color: C.earth, margin: 0 }}>NT$ {myShare.toLocaleString()}</p>
                            <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>共 NT$ {amtTWD.toLocaleString()}</p>
                            <span className={isPayer ? 'tm-badge-sage-sm' : 'tm-badge-amber-sm'} style={{ fontSize: 9, fontWeight: 700, borderRadius: 5, padding: '2px 6px', background: isPayer ? '#E0F0D8' : '#FFF2CC', color: isPayer ? '#4A7A35' : '#9A6800' }}>
                              {isPayer ? '我付款' : '需分攤'}
                            </span>
                          </>
                        );
                      })() : (
                        <>
                          <p style={{ fontSize: 15, fontWeight: 700, color: isIncome ? '#4A8A4A' : isSettlement ? C.sageDark : C.earth, margin: 0 }}>{isIncome ? '＋' : ''}NT$ {amtTWD.toLocaleString()}</p>
                          {e.currency !== 'TWD' && <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>{isIncome ? '＋' : ''}{e.currency} {e.amount?.toLocaleString()}</p>}
                        </>
                      )}
                      {!isReadOnly && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          {!isSettlement && (
                            <button onClick={() => openEdit(e)}
                              style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FontAwesomeIcon icon={faPen} />
                            </button>
                          )}
                          {/* 補實際金額 — foreign-card expense, whether awaiting or already estimated */}
                          {!isSettlement && isForeignCard && (
                            <button onClick={() => openActualForm(e)} title={hasActual ? '更新實際金額' : '補實際金額'}
                              style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${hasActual ? C.sageDark : C.earth}`, background: 'var(--tm-card-bg)', color: hasActual ? C.sageDark : C.earth, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FontAwesomeIcon icon={faReceipt} />
                            </button>
                          )}
                          {/* 補記差額 — only for shared (non-settlement, non-private) rows */}
                          {!isSettlement && !isPrivateExpense && !isAdjustment && (
                            <button onClick={() => openAdjustForm(e)} title="補記差額"
                              style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.earth}`, background: 'var(--tm-card-bg)', color: C.earth, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FontAwesomeIcon icon={faArrowRightArrowLeft} />
                            </button>
                          )}
                          {canDeleteExpense(e) && (
                            <button onClick={() => handleDelete(e.id, e)} className="tm-btn-delete-soft"
                              style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#FAE0E0', color: '#9A3A3A', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FontAwesomeIcon icon={faTrashCan} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Receipt thumbnail */}
                  {e.receiptUrl && !isVisitor && (
                    <div onClick={() => setLightboxUrl(e.receiptUrl)} style={{ marginTop: 8, borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${C.creamDark}`, cursor: 'pointer', display: 'flex', alignItems: 'center', background: 'var(--tm-input-bg)' }}>
                      <img src={e.receiptUrl} alt="附件" style={{ width: 56, height: 56, objectFit: 'cover', flexShrink: 0 }} />
                      <div style={{ padding: '0 12px', flex: 1 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: C.sageDark, margin: '0 0 2px' }}><FontAwesomeIcon icon={faPaperclip} style={{ marginRight: 4 }} />收據附件</p>
                        <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>點擊查看完整圖片</p>
                      </div>
                      <span style={{ fontSize: 18, marginRight: 12, color: C.barkLight }}>›</span>
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
