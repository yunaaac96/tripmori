import { useState, useEffect, useRef } from 'react';
import { deleteField } from 'firebase/firestore';
import { C, FONT, EXPENSE_CATEGORY_MAP, JPY_TO_TWD, cardStyle, inputStyle, btnPrimary, ExpandableNotes, SmartText } from '../../App';
import { avatarTextColor } from '../../utils/helpers';
import { CURRENCY_TO_TWD, toTWDCalc, getEqualPcts, normalizePcts, getPersonalShare, computeMemberStats, computeSettlements, effectiveTWD, computeAmountTWD, buildPersonalStatement, getConfirmedSettlementPairMap, getConfirmedSettlementAmountsMap, getPerExpenseConfirmedSet, getSettlementBadge } from '../../utils/expenseCalc';
import type { StatementLineItem } from '../../utils/expenseCalc';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useGoogleUid } from '../../hooks/useAuth';
import PageHeader from '../../components/layout/PageHeader';
import CurrencyPicker from '../../components/CurrencyPicker';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBus, faUtensils, faTicket, faBagShopping, faBed, faEllipsis, faArrowRightArrowLeft, faPen, faTrashCan, faCamera, faLock, faUsers, faMoneyBill1, faChartPie, faCreditCard, faUser, faPaperclip, faScaleBalanced, faPercent, faCheck, faReceipt, faArrowDown, faCoins, faChevronUp, faChevronDown, faCalendarDays, faUserShield, faHourglass, faReply } from '@fortawesome/free-solid-svg-icons';

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
  linkedExpenseId: '',       // refund record: points back to the original settled expense
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
export default function ExpensePage({ expenses, members, proxyGrants = [], firestore, project }: any) {
  const { db, TRIP_ID, Timestamp, addDoc, deleteDoc, doc, collection, isReadOnly, updateDoc, role, adminMode } = firestore;
  const isVisitor = isReadOnly;
  const isOwner = role === 'owner';

  const projCurrency = (project?.currency || 'TWD') as Currency;
  const defaultForm = { ...EMPTY_FORM, currency: projCurrency, date: new Date().toISOString().slice(0, 10) };

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
  const [descOnlyEdit, setDescOnlyEdit] = useState(false); // editing description/notes only on a settled expense

  // Filter / Sort / View
  const [filterCat, setFilterCat] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [expenseView, setExpenseView] = useState<'all' | 'mine'>('all');
  const [hideSettled, setHideSettled] = useState(false);
  const [privateSuggestion, setPrivateSuggestion] = useState(false);
  // Proxy recording: member name this entry is being recorded on behalf of
  const [proxyTarget, setProxyTarget] = useState<{ name: string; uid: string } | null>(null);

  // Derive which members have granted proxy rights to the current user
  const proxyPrincipals: { name: string; uid: string; color: string; avatarUrl?: string }[] = (() => {
    if (!googleUid) return [];
    return (proxyGrants as any[])
      .filter((g: any) => (g.proxyUids || []).includes(googleUid))
      .map((g: any) => {
        const m = (members as any[]).find((mb: any) => mb.googleUid === g.id);
        return m ? { name: m.name, uid: g.id, color: m.color, avatarUrl: m.avatarUrl } : null;
      })
      .filter(Boolean) as any[];
  })();

  // Pie chart — auto-expand for visitors
  const [showPie, setShowPie] = useState(false);
  useEffect(() => { if (isVisitor) setShowPie(true); }, [isVisitor]);

  // Settlement
  const [showSettleForm, setShowSettleForm] = useState(false);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  // Debtor pay modal — partial or full repayment, optionally linked to a single expense
  const [payModal, setPayModal] = useState<{ from: string; to: string; amountTWD: number } | null>(null);
  const [payModalAmt, setPayModalAmt] = useState('');
  const [payModalExpenseRef, setPayModalExpenseRef] = useState<string | undefined>(undefined);
  const [payModalSaving, setPayModalSaving] = useState(false);
  // Creditor-side per-expense settle confirm modal — prevents the "click → instantly mark all debtors paid" surprise
  const [creditorSettleTarget, setCreditorSettleTarget] = useState<any | null>(null);
  const [creditorSettleSaving, setCreditorSettleSaving] = useState(false);
  const openPayModal = (from: string, to: string, amountTWD: number, expenseRef?: string) => {
    setPayModal({ from, to, amountTWD });
    setPayModalAmt(String(amountTWD));
    setPayModalExpenseRef(expenseRef);
  };
  // Settlement deletion confirm modal
  const [settlementDeleteTarget, setSettlementDeleteTarget] = useState<any | null>(null);
  // Regular (non-settlement) expense deletion confirm modal
  const [regularDeleteTarget, setRegularDeleteTarget] = useState<any | null>(null);
  const [settlementDeleteInput, setSettlementDeleteInput] = useState('');
  const [settlementExpanded, setSettlementExpanded] = useState(false);
  // Sub-fold for "settlement suggestions that don't involve me" — keeps the list tight
  // when the trip has many cross-pair settlements between other members.
  const [othersExpanded, setOthersExpanded] = useState(false);
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

  // Compute the effective exchange rate for display on expense cards.
  // Priority:
  //   1. actualTWD / amount  — card statement settled amount (most authoritative)
  //   2. exchangeRate         — user manually entered at record time
  //   3. amountTWD / amount  — system-computed from default table at save time
  //   4. CURRENCY_TO_TWD[cur] — system default table (legacy data without amountTWD)
  // Returns null for TWD or unknown currency — never assumes a different currency.
  const getDisplayRate = (e: any): number | null => {
    const cur = e.currency;
    if (!cur || cur === 'TWD') return null;
    const amt = e.amount || 0;
    if (amt <= 0) return null;
    if (e.actualTWD != null && e.actualTWD > 0) return e.actualTWD / amt;
    if (e.exchangeRate != null && e.exchangeRate > 0) return e.exchangeRate;
    if (e.amountTWD != null && e.amountTWD > 0) return e.amountTWD / amt;
    return CURRENCY_TO_TWD[cur] ?? null; // system default table — for legacy data
  };
  const fmtRate = (r: number): string => {
    if (r >= 100) return r.toFixed(0);
    if (r >= 10)  return r.toFixed(1);
    if (r >= 1)   return r.toFixed(2);
    if (r >= 0.1) return r.toFixed(3);
    return r.toFixed(4);
  };

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
    setDescOnlyEdit(false);
    setPrivateSuggestion(false);
    setProxyTarget(null);
  };

  const openEdit = (e: any, descOnly = false) => {
    setForm({
      description: e.description || '',
      amount: String(e.amount || ''),
      currency: e.currency || projCurrency,
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
    setDescOnlyEdit(descOnly);
    setShowForm(true);
    // Restore proxy context when editing a proxy-recorded expense
    if (googleUid && e.loggedByUid === googleUid && e.privateOwnerUid && e.privateOwnerUid !== googleUid) {
      const principalMember = (members as any[]).find((m: any) => m.googleUid === e.privateOwnerUid);
      if (principalMember) setProxyTarget({ name: principalMember.name, uid: e.privateOwnerUid });
    } else {
      setProxyTarget(null);
    }
  };

  /**
   * Open the add-expense form pre-filled as a refund record for a settled expense.
   * Sets linkedExpenseId so the new 收入 entry is visually linked back to the original.
   */
  const openRefundForm = (e: any) => {
    const sw = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
    setForm({
      ...defaultForm,
      isIncome: true,
      category: 'income',
      payer: e.payer || currentUserName || '',
      splitMode: 'equal',
      splitWith: sw,
      incomeScope: sw.length === 1 ? 'personal' : 'group',
      incomeBeneficiary: sw.length === 1 ? sw[0] : '',
      notes: `「${e.description}」退款`,
      date: new Date().toISOString().slice(0, 10),
      linkedExpenseId: e.id || '',
    });
    setEditingId(null);
    setDescOnlyEdit(false);
    setProxyTarget(null);
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
  const handleSave = async (forcePublic = false) => {
    if (isReadOnly) return;
    if (!form.description) return;
    // Skip financial validation in description-only edit mode
    if (!descOnlyEdit) {
      if (!form.amount) return;
      // Private expense doesn't require payer
      if (!form.isPrivate && !form.isIncome && !form.payer) return;
    }

    // Smart detection: if only the payer is in the split, suggest switching to private
    if (!descOnlyEdit && !forcePublic && !form.isPrivate && !form.isIncome && form.payer) {
      const effectiveSplit = form.splitMode === 'equal' && form.splitWith.length > 0
        ? form.splitWith : memberNames;
      if (effectiveSplit.length === 1 && effectiveSplit[0] === form.payer) {
        setPrivateSuggestion(true);
        return;
      }
    }
    setPrivateSuggestion(false);
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
      privateOwnerUid: form.isPrivate
        ? (proxyTarget ? proxyTarget.uid : (() => {
            const payerMember = (members as any[]).find((m: any) => m.name === form.payer);
            return payerMember?.googleUid || googleUid || null;
          })())
        : null,
      isIncome: form.isIncome || false,
      // Cross-currency bookkeeping
      exchangeRate: formExRate && formExRate > 0 ? formExRate : null,
      cardFeePercent: isForeignCard ? cardFee : null,
      awaitCardStatement: isForeignCard && form.awaitCardStatement ? true : false,
      // Refund linkage: points back to the original settled expense this refund belongs to.
      // Only set on new records (editing preserves the original linkedExpenseId untouched).
      linkedExpenseId: form.linkedExpenseId || null,
      // Proxy recording traceability
      loggedByUid: proxyTarget ? (googleUid || null) : null,
      loggedByName: proxyTarget ? (currentUserName || null) : null,
    };

    try {
      if (editingId && descOnlyEdit) {
        // Description-only edit: only update non-financial fields
        await updateDoc(doc(db, 'trips', TRIP_ID, 'expenses', editingId), {
          description: form.description,
          notes: form.notes,
          date: form.date,
        });
      } else if (editingId) {
        await updateDoc(doc(db, 'trips', TRIP_ID, 'expenses', editingId), payload);
      } else {
        payload.createdAt = Timestamp.now();
        payload.createdBy = currentUserName; // track creator for delete permissions
        await addDoc(collection(db, 'trips', TRIP_ID, 'expenses'), payload);
      }
    } catch (e: any) {
      console.error(e);
      setSaving(false);
      alert(`儲存失敗：${e?.code || e?.message || '請檢查網路連線後再試'}`);
      return;
    }
    setSaving(false);
    closeForm();
  };

  // canEditExpense / canEditDescOnly / canDeleteExpense / handleDelete are
  // defined AFTER the settlement maps below — they all reference
  // confirmedAmountsMap / pairDebtsMap / perExpenseConfirmedSet.

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
      status: 'pending',
      paidAt: new Date().toISOString().slice(0, 10),
      createdAt: Timestamp.now(),
    };
    await addDoc(collection(db, 'trips', TRIP_ID, 'expenses'), payload);
  };

  // Phase 1: debtor initiates — creates a pending settlement record.
  // Individual expenses are NOT stamped; Method B derives status from the record.
  const handleDebtorPay = async (from: string, to: string, amount: number, extraNotes?: string, expenseRef?: string) => {
    if (isReadOnly) return;
    const key = `${from}-${to}`;
    setSettlingId(key);
    // Idempotency guard: skip if a pending settlement for the same pair (+ same
    // expenseRef) was created in the last 60 seconds — prevents double-write
    // on reconnect. For optimistic in-flight writes whose serverTimestamp() is
    // still resolving (createdAt is null in the local cache), also catch any
    // pending record from today as a duplicate.
    const today = new Date().toISOString().slice(0, 10);
    const recentDuplicate = (expenses as any[]).find((ex: any) => {
      if (ex.category !== 'settlement') return false;
      if (ex.status !== 'pending') return false;
      if (ex.payer !== from) return false;
      if (ex.splitWith?.[0] !== to) return false;
      if (expenseRef ? ex.expenseRef !== expenseRef : !!ex.expenseRef) return false;
      // Confirmed write within the last 60s
      if (ex.createdAt?.toMillis && (Date.now() - ex.createdAt.toMillis()) < 60_000) return true;
      // Optimistic in-flight: serverTimestamp not yet resolved, but paidAt = today
      if (!ex.createdAt && ex.paidAt === today) return true;
      return false;
    });
    if (recentDuplicate) { setSettlingId(null); return; }
    const record: Record<string, unknown> = {
      description: expenseRef ? '單筆結清' : '結清款項',
      amount, currency: 'TWD', amountTWD: amount,
      category: 'settlement',
      payer: from,
      paymentMethod: 'cash',
      splitMode: 'equal',
      splitWith: [to],
      percentages: {}, customAmounts: {}, subItems: [],
      date: today,
      notes: extraNotes || `${from} → ${to}`,
      status: 'pending',
      paidAt: today,
      createdAt: Timestamp.now(),
    };
    if (expenseRef) record.expenseRef = expenseRef;
    await addDoc(collection(db, 'trips', TRIP_ID, 'expenses'), record);
    setSettlingId(null);
  };

  // Phase 2: creditor confirms — updates pending → confirmed, or creates confirmed directly.
  // No individual expense stamping; badge state is derived from the confirmed record.
  const handleCreditorConfirm = async (
    pendingId: string | null,
    from: string,
    to: string,
    amount: number,
  ) => {
    if (isReadOnly) return;
    const key = `${from}-${to}`;
    setSettlingId(key);
    const today = new Date().toISOString().slice(0, 10);
    if (pendingId) {
      await updateDoc(doc(db, 'trips', TRIP_ID, 'expenses', pendingId), {
        status: 'confirmed',
        confirmedAt: today,
      });
    } else {
      await addDoc(collection(db, 'trips', TRIP_ID, 'expenses'), {
        description: '結清款項',
        amount, currency: 'TWD', amountTWD: amount,
        category: 'settlement',
        payer: from,
        paymentMethod: 'cash',
        splitMode: 'equal',
        splitWith: [to],
        percentages: {}, customAmounts: {}, subItems: [],
        date: today,
        notes: `${from} → ${to}`,
        status: 'confirmed',
        confirmedAt: today,
        createdAt: Timestamp.now(),
      });
    }
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
  const [adjustCurrency, setAdjustCurrency] = useState<string>(() => projCurrency);
  const [adjustSaving, setAdjustSaving] = useState(false);
  const openAdjustForm = (original: any) => {
    setAdjustTarget(original);
    setAdjustAmount('');
    setAdjustNote('');
    setAdjustDir('expense');
    setAdjustCurrency(original.currency || projCurrency);
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
      const currency = adjustCurrency || original.currency || projCurrency;
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

  // Method B: per-pair settlement state derived from settlement records (not individual stamps)
  const confirmedPairMap = getConfirmedSettlementPairMap(expenses as any[]);
  // Amount-based maps for badge logic: confirmed total paid + remaining debt per pair
  const confirmedAmountsMap = getConfirmedSettlementAmountsMap(expenses as any[]);
  const pairDebtsMap = new Map(settlements.map(s => [`${s.from}→${s.to}`, s.amount]));
  // Per-expense settlement set for "結清這筆" flow
  const perExpenseConfirmedSet = getPerExpenseConfirmedSet(expenses as any[]);
  // Whole-trip-settled flag: no outstanding pair debts AND at least one
  // confirmed settlement record. Passed into getSettlementBadge so that
  // minimum-transfer-routed pairs (which have no direct confirmedAmt) still
  // surface as 'settled'/'received' instead of 'none'. Without this the
  // 「補記差額」 button would erroneously show on closed-trip expenses.
  const wholeTripSettled = settlements.length === 0 && confirmedAmountsMap.size > 0;

  // Set of expense IDs that have at least one refund (收入) record linked to them.
  // Used to show "已退款" indicator on the original expense and highlight the refund button.
  const refundedExpenseIds = new Set<string>(
    (expenses as any[]).filter((e: any) => e.linkedExpenseId).map((e: any) => e.linkedExpenseId as string)
  );

  // ── canEditExpense / canEditDescOnly / canDeleteExpense / handleDelete ──
  // Placed here so they can reference settlement maps above.
  const canEditExpense = (e: any) => {
    if (isReadOnly || e.category === 'settlement') return false;
    // 收入 expenses: owner / editor by default, plus the income payer
    // (= the member who received the cash on behalf of the group).
    if (e.isIncome) {
      if (isOwner || role === 'editor') return true;
      if (currentUserName && e.payer === currentUserName) return true;
      return false;
    }
    if (e.settledAt || e.receivedAt) return false;
    // awaitCardStatement expenses are always editable by the payer — the actual
    // amount is unknown until the statement arrives, so we must never lock them.
    if (!e.awaitCardStatement && currentUserName) {
      const badge = getSettlementBadge(e, currentUserName, memberNames, confirmedAmountsMap, pairDebtsMap, perExpenseConfirmedSet, wholeTripSettled);
      if (badge !== 'none') return false;
    }
    if (e.isPrivate) {
      // Private: only the principal or proxy who recorded it can edit.
      if (googleUid && e.privateOwnerUid === googleUid) return true;
      if (googleUid && e.loggedByUid === googleUid) return true;
      return false;
    }
    // Non-private proxy: the recorder can edit even if not a party to the expense
    if (googleUid && e.loggedByUid === googleUid) return true;
    // Non-private: must be a party to the expense (payer or in effective splitWith)
    if (currentUserName) {
      const sw = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
      if (e.payer !== currentUserName && !sw.includes(currentUserName)) return false;
    }
    return true;
  };

  // Description-only edit: settled expenses can still have description/notes/date updated.
  // Financial fields (amount, payer, split) are locked to preserve accounting integrity.
  const canEditDescOnly = (e: any): boolean => {
    if (isReadOnly || e.category === 'settlement') return false;
    if (e.isIncome) return false; // 收入 already covered by canEditExpense
    if (canEditExpense(e)) return false; // already fully editable
    if (e.isPrivate) {
      return !!(googleUid && (e.privateOwnerUid === googleUid || e.loggedByUid === googleUid));
    }
    if (googleUid && e.loggedByUid === googleUid) return true;
    if (!currentUserName) return false;
    const sw = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
    return e.payer === currentUserName || sw.includes(currentUserName);
  };

  const canDeleteExpense = (e: any) => {
    if (isReadOnly) return false;

    // ── 收入 expenses: owner / editor + income payer themselves ─────────────
    if (e.isIncome) {
      if (isOwner || role === 'editor') return true;
      if (currentUserName && e.payer === currentUserName) return true;
      return false;
    }

    // ── Settlement records ───────────────────────────────────────────────────
    if (e.category === 'settlement') {
      const parties = [e.payer, ...(e.splitWith || [])];
      return isOwner || (currentUserName ? parties.includes(currentUserName) : false);
    }

    // ── Non-settlement: "already settled" guard (blocks everyone incl. Owner) ──
    // Legacy method: settledAt / receivedAt fields
    if (e.settledAt || e.receivedAt) return false;

    // Method B: check from current user's perspective (party's own badge).
    // awaitCardStatement bypasses the badge check — the actual amount is unknown,
    // so the expense must remain deletable until the statement is filled in.
    if (!e.awaitCardStatement && currentUserName) {
      const badge = getSettlementBadge(e, currentUserName, memberNames, confirmedAmountsMap, pairDebtsMap, perExpenseConfirmedSet, wholeTripSettled);
      if (badge !== 'none') return false;
    }
    // Method B: when current user is NOT the payer (e.g. Owner viewing others'
    // expense), also check from payer's perspective — payer's 'received' badge
    // means every debtor has settled, so the expense is fully closed.
    if (!e.awaitCardStatement && e.payer && e.payer !== currentUserName) {
      const payerBadge = getSettlementBadge(e, e.payer, memberNames, confirmedAmountsMap, pairDebtsMap, perExpenseConfirmedSet, wholeTripSettled);
      if (payerBadge !== 'none') return false;
    }

    // ── Private expenses ─────────────────────────────────────────────────────
    // Owner cannot see others' private expenses (visibleExpenses already filters
    // them out), so isOwner is NOT an exemption here — only the principal or
    // the proxy who recorded it can delete.
    if (e.isPrivate) {
      return !!(googleUid && (e.privateOwnerUid === googleUid || e.loggedByUid === googleUid));
    }

    // ── Non-private proxy: recorder can delete even if not a party ───────────
    if (googleUid && e.loggedByUid === googleUid) return true;

    // ── Non-private: Owner can delete any unsettled expense;
    //    others must be a party (payer or in effective splitWith) ─────────────
    const swD = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
    return isOwner || !!(currentUserName && (e.payer === currentUserName || swD.includes(currentUserName)));
  };

  const handleDelete = async (id: string, expense: any) => {
    if (!canDeleteExpense(expense)) return;
    // If deleting a settlement, clear settledAt/settledByRef AND receivedAt on all linked expenses
    if (expense.category === 'settlement') {
      const linked = (expenses as any[]).filter((e: any) => e.settledByRef === id);
      if (linked.length > 0) {
        await Promise.all(linked.map((e: any) =>
          updateDoc(doc(db, 'trips', TRIP_ID, 'expenses', e.id), {
            settledAt: deleteField(),
            settledByRef: deleteField(),
            receivedAt: deleteField(),
          })
        ));
      }
    }
    await deleteDoc(doc(db, 'trips', TRIP_ID, 'expenses', id));
  };

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
    !e.isPrivate ||
    (e.privateOwnerUid && e.privateOwnerUid === googleUid) ||  // I'm the principal
    (e.loggedByUid && e.loggedByUid === googleUid)             // I'm the proxy who recorded it
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

  // ── Per-currency breakdown for settlement rows ───────────────────────────
  // For a (from→to) pair, aggregate each currency's original amount AND its
  // TWD equivalent separately. Only shown when at least one non-TWD currency
  // exists, so that: TWD expenses → "台幣 NT$ X", JPY expenses → "JPY Y ≈ NT$ Z".
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
    .filter((e: any) => {
      // "收還款記錄已隱藏" toggle: hides category=settlement entries (the repayment records),
      // NOT settled regular expenses. Regular expenses always show regardless of badge.
      if (!hideSettled) return true;
      return e.category !== 'settlement';
    })
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

      {/* ── Debtor pay modal (partial or full repayment) ── */}
      {payModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 550 }}
          onClick={ev => { if (ev.target === ev.currentTarget) { setPayModal(null); setPayModalExpenseRef(undefined); } }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                <FontAwesomeIcon icon={faArrowRightArrowLeft} style={{ fontSize: 14 }} /> {payModalExpenseRef ? '結清這筆' : '記錄還款'}
              </p>
              <button onClick={() => { setPayModal(null); setPayModalExpenseRef(undefined); }} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>
            {/* Outstanding amount reference */}
            <div style={{ padding: '10px 14px', background: 'var(--tm-section-bg)', borderRadius: 12, border: `1px dashed ${C.creamDark}`, marginBottom: 16 }}>
              <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 2px', fontWeight: 600 }}>目前待還金額</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: C.earth, margin: 0 }}>NT$ {payModal.amountTWD.toLocaleString()}</p>
              <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>{payModal.from} → {payModal.to}</p>
            </div>
            {/* Editable repayment amount */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.bark }}>還款金額（NT$）</label>
                <span style={{ fontSize: 11, color: C.barkLight }}>可部分還款</span>
              </div>
              <input
                type="number" inputMode="decimal"
                value={payModalAmt}
                onChange={ev => setPayModalAmt(ev.target.value)}
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', fontSize: 18, fontWeight: 700 }}
              />
              {payModalAmt && Number(payModalAmt) > 0 && Number(payModalAmt) < payModal.amountTWD && (
                <p style={{ fontSize: 11, color: C.barkLight, margin: '5px 0 0' }}>
                  還款後剩餘：NT$ {(payModal.amountTWD - Math.round(Number(payModalAmt))).toLocaleString()}
                </p>
              )}
            </div>
            <button
              disabled={!payModalAmt || Number(payModalAmt) <= 0 || payModalSaving}
              onClick={async () => {
                if (!payModal) return;
                const amt = Math.round(Number(payModalAmt));
                const ref = payModalExpenseRef;
                const target = payModal;
                setPayModalSaving(true);
                try {
                  await handleDebtorPay(target.from, target.to, amt, undefined, ref);
                  setPayModal(null);
                  setPayModalExpenseRef(undefined);
                } catch (err) {
                  console.error('[handleDebtorPay] failed:', err);
                  alert('還款記錄失敗，請檢查網路後重試');
                } finally {
                  setPayModalSaving(false);
                }
              }}
              style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', background: '#5A8ACF', color: 'white', fontSize: 15, fontWeight: 700, cursor: payModalSaving ? 'default' : 'pointer', fontFamily: FONT, opacity: (!payModalAmt || Number(payModalAmt) <= 0 || payModalSaving) ? 0.5 : 1 }}>
              {payModalSaving ? '處理中…' : <><FontAwesomeIcon icon={faCheck} style={{ marginRight: 8 }} />確認還款</>}
            </button>
          </div>
        </div>
      )}

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
              請填入刷卡單上的實際扣款總金額（含國際手續費）。填入後這筆記帳會自動以實際金額計算，若有「等卡單」狀態會一併解除。
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
                  {showPayer && item.payer && ` · ${item.payer} 付`}
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
          label, count, total, isOpen, onToggle, accent, note,
        }: {
          label: string; count: number; total: number;
          isOpen: boolean; onToggle: () => void; accent: string; note?: string;
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
              <span style={{ fontSize: 11, fontWeight: 400, color: C.barkLight }}>（{count} 筆{note ? `，${note}` : ''}）</span>
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

              {/* ── ① 結算行動（合併原「結算建議」+「待辦結算」，加入操作按鈕）── */}
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.barkLight, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>結算行動</p>
                {mySettlements.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <p style={{ fontSize: 13, color: '#4A7A35', fontWeight: 700, margin: 0 }}>✓ 帳目已結清，無待辦項目</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {mySettlements.map((s, i) => {
                      const isPayer    = s.from === name;
                      const other      = isPayer ? s.to : s.from;
                      const otherColor = getMemberColor(other);
                      const sKey       = `${s.from}-${s.to}`;
                      const isProcessing = settlingId === sKey;
                      const pendingEntry = (expenses as any[]).find((e: any) =>
                        e.category === 'settlement' && e.status === 'pending' &&
                        e.payer === s.from && e.splitWith?.[0] === s.to
                      );
                      const isPrimaryDebtor   = isPayer  && name === currentUserName;
                      const isPrimaryCreditor = !isPayer && name === currentUserName;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: isPayer ? '#FAE0E0' : '#EAF3DE', borderRadius: 12, padding: '10px 14px', border: `1.5px solid ${isPayer ? '#F0C0C0' : '#B5CFA7'}` }}>
                          {/* Avatar */}
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: otherColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                            {getMemberAvatar(other)
                              ? <img src={getMemberAvatar(other)!} alt={other} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <span style={{ fontSize: 12, fontWeight: 700, color: avatarTextColor(otherColor) }}>{other[0]?.toUpperCase()}</span>}
                          </div>
                          {/* Labels + amount */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: isPayer ? '#9A3A3A' : '#4A7A35', margin: 0 }}>
                              {isPayer ? `付給 ${other}` : `收自 ${other}`}
                            </p>
                            <p style={{ fontSize: 11, fontWeight: 700, color: isPayer ? '#9A3A3A' : '#4A7A35', margin: '2px 0 0' }}>
                              NT$ {s.amount.toLocaleString()}
                            </p>
                          </div>
                          {/* Action buttons */}
                          {isProcessing
                            ? <span style={{ flexShrink: 0, fontSize: 11, color: C.barkLight, fontWeight: 600 }}>處理中...</span>
                            : !isReadOnly && (() => {
                                // Debtor view: this member owes someone
                                if (isPrimaryDebtor) {
                                  if (pendingEntry) return (
                                    <span style={{ flexShrink: 0, fontSize: 11, color: '#9A6800', fontWeight: 600, padding: '5px 8px', background: '#FFF3CC', borderRadius: 8 }}>等待確認</span>
                                  );
                                  return (
                                    <button onClick={() => openPayModal(s.from, s.to, s.amount)}
                                      style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 8, border: 'none', background: '#9A3A3A', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                                      記錄還款
                                    </button>
                                  );
                                }
                                // Creditor view: this member is owed by someone
                                if (isPrimaryCreditor) return (
                                  <button onClick={() => handleCreditorConfirm(pendingEntry?.id ?? null, s.from, s.to, s.amount)}
                                    style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 8, border: 'none', background: '#4A7A35', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                                    {pendingEntry ? '✓ 確認收款' : '確認收款'}
                                  </button>
                                );
                                // Admin viewing another member's modal
                                if (adminMode) return (
                                  <button onClick={() => isPayer
                                    ? openPayModal(s.from, s.to, s.amount)
                                    : handleCreditorConfirm(pendingEntry?.id ?? null, s.from, s.to, s.amount)}
                                    style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 8, border: 'none', background: isPayer ? '#5A8ACF' : '#4A7A35', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                                    {isPayer ? '代為記錄' : pendingEntry ? '✓ 確認收款' : '確認收款'}
                                  </button>
                                );
                                return null;
                              })()
                          }
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── ② 帳目摘要（垂直計算鏈：毛差額 → 已結清 → 目前餘額）── */}
              {(() => {
                const grossAbs   = Math.abs(stmt.net);   // raw balance excl. settlements
                const currentAbs = mySettlements.reduce((sum, s) => sum + s.amount, 0); // use settlement total to match member card & suggestion
                const settledAbs = grossAbs - currentAbs; // already-settled portion
                const hasSettled = settledAbs > 1;
                const accent = isCreditor ? '#4A7A35' : '#9A3A3A';
                const bg     = isCreditor ? '#EAF3DE' : '#FAE0E0';
                const border = isCreditor ? '#B5CFA7' : '#F0C0C0';
                const faint  = isCreditor ? '#C5DFB8' : '#F5C8C8';
                return (
                  <div style={{ background: bg, borderRadius: 14, padding: '14px 16px', marginBottom: 14, border: `1px solid ${border}` }}>
                    {/* 我付出的金額 vs 我應分攤的金額 */}
                    <div style={{ display: 'flex', marginBottom: 10 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 10, color: accent, margin: '0 0 1px', fontWeight: 600 }}>我實際付出</p>
                        <p style={{ fontSize: 9, color: accent, opacity: 0.7, margin: '0 0 4px', fontWeight: 400 }}>我自己掏的錢</p>
                        <p style={{ fontSize: 15, fontWeight: 700, color: accent, margin: 0 }}>NT$ {stmt.myPaymentsTotal.toLocaleString()}</p>
                      </div>
                      <div style={{ width: 1, background: faint, margin: '2px 14px', alignSelf: 'stretch' }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 10, color: accent, margin: '0 0 1px', fontWeight: 600 }}>我應分攤</p>
                        <p style={{ fontSize: 9, color: accent, opacity: 0.7, margin: '0 0 4px', fontWeight: 400 }}>我該付的份額</p>
                        <p style={{ fontSize: 15, fontWeight: 700, color: accent, margin: 0 }}>NT$ {stmt.mySharesTotal.toLocaleString()}</p>
                      </div>
                    </div>
                    {/* Calculation chain */}
                    <div style={{ borderTop: `1px dashed ${faint}`, paddingTop: 9 }}>
                      {/* Gross balance */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: hasSettled ? 5 : 0 }}>
                        <div>
                          <span style={{ fontSize: 10, fontWeight: 600, color: accent }}>{isCreditor ? '多付了' : '少付了'}</span>
                          <span style={{ fontSize: 9, color: accent, opacity: 0.7, marginLeft: 4 }}>（付出 − 應分攤）</span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>
                          {isCreditor ? '+' : '−'} NT$ {grossAbs.toLocaleString()}
                        </span>
                      </div>
                      {/* Already-settled adjustment (only shown if non-trivial) */}
                      {hasSettled && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                          <div>
                            <span style={{ fontSize: 10, fontWeight: 600, color: accent }}>{isCreditor ? '已收回還款' : '已還款項'}</span>
                            <span style={{ fontSize: 9, color: accent, opacity: 0.7, marginLeft: 4 }}>（已記錄結算）</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: accent }}>
                            {isCreditor ? '−' : '+'} NT$ {settledAbs.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {/* Current balance — most prominent */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1.5px solid ${border}`, paddingTop: 9, marginTop: hasSettled ? 5 : 9 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>{isCreditor ? '還可收回' : '還需還款'}</span>
                        <span style={{ fontSize: 22, fontWeight: 900, color: accent }}>NT$ {currentAbs.toLocaleString()}</span>
                      </div>
                    </div>
                    {/* Advanced-for-others sub-note */}
                    {stmt.myAdvancedTotal > 0 && (
                      <p style={{ fontSize: 10, color: accent, margin: '8px 0 0', borderTop: `1px solid ${faint}`, paddingTop: 6 }}>
                        含代墊其他人 NT$ {stmt.myAdvancedTotal.toLocaleString()}（已計入上方付出金額）
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* ── Awaiting card-statement warning ── */}
              {stmt.hasAwaitingItems && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '8px 12px', borderRadius: 10, background: '#FFE8CC', border: '1px solid #E8B96A', marginBottom: 12 }}>
                  <FontAwesomeIcon icon={faCreditCard} style={{ fontSize: 11, color: '#9A6800', marginTop: 1, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#9A6800', lineHeight: 1.5 }}>部分費用等待卡單確認中（⏳），尚未納入上方計算</span>
                </div>
              )}


              {/* ── ④ 應分攤費用明細（別人付的、我有份額的）── */}
              {(() => {
                // Show only: paid by someone else + not covered by a confirmed settlement.
                // Method A: respects the legacy per-expense `settledAt` stamp.
                // Method B (amount-based): hide all shares for a pair only when the entire
                //   net debt has been fully confirmed (confirmedAmt > 0 AND remainingDebt = 0).
                //   Partial payments do NOT hide any shares.
                const unpaidShares = stmt.myShares.filter(item => {
                  if (item.payer === name) return false;
                  if (item.settledAt) return false; // legacy Method A stamp
                  const pairKey = `${name}→${item.payer}`;
                  const confirmedAmt = confirmedAmountsMap.get(pairKey) ?? 0;
                  const remainingDebt = pairDebtsMap.get(pairKey) ?? 0;
                  // Hidden when pair is fully settled OR per-expense settlement exists
                  const pairSettled = confirmedAmt > 0 && remainingDebt === 0;
                  const perExpenseSettled = perExpenseConfirmedSet.has(`${item.id}|${name}`);
                  return !(pairSettled || perExpenseSettled);
                });
                const unpaidTotal = unpaidShares.reduce((sum, item) => sum + (item.myShare || 0), 0);
                if (unpaidShares.length === 0) return null;
                return (
                  <div style={{ marginBottom: 4, marginTop: 14 }}>
                    <button
                      onClick={() => setStmtSharesOpen(v => !v)}
                      style={{ width: '100%', background: 'var(--tm-card-bg)', border: `1px solid ${C.creamDark}`, borderRadius: 12, padding: '11px 14px', cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.earth, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.bark }}>應分攤費用明細</span>
                        <span style={{ fontSize: 11, color: C.barkLight }}>（{unpaidShares.length} 筆）</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.earth }}>NT$ {unpaidTotal.toLocaleString()}</span>
                        <FontAwesomeIcon icon={stmtSharesOpen ? faChevronUp : faChevronDown} style={{ fontSize: 11, color: C.barkLight }} />
                      </div>
                    </button>
                    {stmtSharesOpen && (
                      <div style={{ paddingLeft: 2, paddingRight: 2, marginTop: 2 }}>
                        {unpaidShares.map(item => <StmtRow key={item.id} item={item} showPayer={true} />)}
                      </div>
                    )}
                  </div>
                );
              })()}

              <p style={{ fontSize: 10, color: C.barkLight, textAlign: 'center', margin: '14px 0 0' }}>
                建議結算方案，實際以雙方確認為準
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

              {/* Header stats */}
              {ms && (
                <>
                  {/* 總支出 */}
                  <div style={{ background: 'var(--tm-section-bg)', borderRadius: 14, padding: '12px 14px', border: `1px solid ${C.creamDark}`, marginBottom: 8 }}>
                    <p style={{ fontSize: 10, color: C.barkLight, margin: '0 0 2px' }}>總支出（分攤 ＋ 私人）</p>
                    <p style={{ fontSize: 20, fontWeight: 800, color: C.bark, margin: 0 }}>NT$ {(sharedBurdenTWD + privateTotalTWD).toLocaleString()}</p>
                  </div>
                  {/* 分攤花費 + 私人花費 */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <div className="tm-stat-paid-box" style={{ flex: 1, background: '#FFF8E8', borderRadius: 12, padding: '10px 12px', border: `1px solid ${C.creamDark}` }}>
                      <p style={{ fontSize: 10, color: C.barkLight, margin: '0 0 2px' }}>分攤花費</p>
                      <p style={{ fontSize: 15, fontWeight: 700, color: C.bark, margin: 0 }}>NT$ {sharedBurdenTWD.toLocaleString()}</p>
                    </div>
                    <div style={{ flex: 1, background: 'var(--tm-note-5)', borderRadius: 12, padding: '10px 12px', border: `1px solid ${C.creamDark}` }}>
                      <p style={{ fontSize: 10, color: C.barkLight, margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <FontAwesomeIcon icon={faLock} style={{ fontSize: 8 }} />私人花費
                      </p>
                      <p className="tm-expense-private-title" style={{ fontSize: 15, fontWeight: 700, color: '#6A2A9A', margin: 0 }}>NT$ {privateTotalTWD.toLocaleString()}</p>
                    </div>
                  </div>
                </>
              )}
              {ms && (() => {
                const detailSettlements = settlements.filter(s => s.from === detailName || s.to === detailName);
                const detailDisplayAmt = detailSettlements.reduce((sum, s) => sum + s.amount, 0);
                return (
                  <div className={ms.net >= 0 ? 'tm-member-stat-creditor' : 'tm-member-stat-debtor'} style={{ marginBottom: 14, background: ms.net >= 0 ? '#EAF3DE' : '#FAE0E0', borderRadius: 12, padding: '10px 12px', border: `1px solid ${ms.net >= 0 ? '#B5CFA7' : '#F0C0C0'}` }}>
                    <p style={{ fontSize: 10, color: C.barkLight, margin: '0 0 2px' }}>{ms.net >= 0 ? '代墊金額' : '需還款金額'}</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: ms.net >= 0 ? '#4A7A35' : '#9A3A3A', margin: 0 }}>
                      {detailDisplayAmt > 0 ? `NT$ ${detailDisplayAmt.toLocaleString()}` : '已結清 ✓'}
                    </p>
                  </div>
                );
              })()}

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

      {/* ── Regular Expense Delete Confirm Modal ── */}
      {regularDeleteTarget && (() => {
        const e = regularDeleteTarget;
        const amtTWD2 = effectiveTWD(e);
        const cat = EXPENSE_CATEGORY_MAP[e.category] || EXPENSE_CATEGORY_MAP.other;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 }}
            onClick={ev => { if (ev.target === ev.currentTarget) setRegularDeleteTarget(null); }}>
            <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: '#9A3A3A', margin: '0 0 6px' }}>
                <FontAwesomeIcon icon={faTrashCan} style={{ marginRight: 8 }} />刪除費用
              </p>
              <p style={{ fontSize: 12, color: C.barkLight, margin: '0 0 16px', lineHeight: 1.6 }}>
                確定要刪除此筆費用？刪除後無法復原。
              </p>
              <div style={{ background: 'var(--tm-section-bg)', borderRadius: 12, padding: '12px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: cat?.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FontAwesomeIcon icon={CATEGORY_ICONS[e.category] || CATEGORY_ICONS.other} style={{ fontSize: 14, color: avatarTextColor(cat?.bg) }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</p>
                  <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>{e.payer} · {e.date || ''}</p>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#9A3A3A', flexShrink: 0 }}>NT$ {amtTWD2.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setRegularDeleteTarget(null)}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 14 }}>
                  取消
                </button>
                <button
                  onClick={async () => {
                    await handleDelete(e.id, e);
                    setRegularDeleteTarget(null);
                  }}
                  style={{ flex: 2, padding: 12, borderRadius: 12, border: 'none', background: '#9A3A3A', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 14 }}>
                  <FontAwesomeIcon icon={faTrashCan} style={{ marginRight: 8 }} />確認刪除
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Settlement Delete Confirm Modal ── */}
      {settlementDeleteTarget && (() => {
        const t = settlementDeleteTarget;
        const payer: string = t.payer || '';
        const receiver: string = (t.splitWith && t.splitWith[0]) || '';
        const linkedCount = (expenses as any[]).filter((e: any) => e.settledByRef === t.id).length;
        const isPending = t.status === 'pending';
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 }}>
            <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: '#9A3A3A', margin: '0 0 6px' }}>
                <FontAwesomeIcon icon={faTrashCan} style={{ marginRight: 8 }} />{isPending ? '取消待確認款項' : '撤銷結清'}
              </p>
              <p style={{ fontSize: 12, color: C.barkLight, margin: '0 0 16px', lineHeight: 1.6 }}>
                {isPending
                  ? '刪除後將取消此筆待確認款項。'
                  : linkedCount > 0
                    ? `刪除後將撤銷此次結算，並清除 ${linkedCount} 筆費用的結清標記。`
                    : '刪除後將撤銷此次結算。'
                }
              </p>
              <div style={{ background: 'var(--tm-section-bg)', borderRadius: 12, padding: '12px 14px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: C.bark, fontWeight: 600 }}>{payer} → {receiver}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#9A3A3A' }}>NT$ {(t.amountTWD || t.amount || 0).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setSettlementDeleteTarget(null)}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 14 }}>
                  取消
                </button>
                <button
                  onClick={async () => {
                    await handleDelete(t.id, t);
                    setSettlementDeleteTarget(null);
                    setSettlementDeleteInput('');
                  }}
                  style={{ flex: 2, padding: 12, borderRadius: 12, border: 'none', background: '#9A3A3A', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 14 }}>
                  {isPending ? '確認取消' : '確認撤銷結清'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Creditor Per-Expense Settle Confirm Modal ── */}
      {creditorSettleTarget && (() => {
        const e = creditorSettleTarget;
        const sw = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
        const debtors: string[] = sw.filter((n: string) => n !== currentUserName);
        // Group debtors by what action will be taken on each.
        const rows = debtors.map(d => {
          const alreadySettled = !!e.id && perExpenseConfirmedSet.has(`${e.id}|${d}`);
          const pendingEntry = (expenses as any[]).find((ex: any) =>
            ex.category === 'settlement' && ex.status === 'pending' &&
            ex.payer === d && ex.splitWith?.[0] === currentUserName &&
            ex.expenseRef === e.id
          );
          const share = getPersonalShare(e, d, memberNames);
          let kind: 'skip' | 'confirm-pending' | 'create' = 'create';
          if (alreadySettled) kind = 'skip';
          else if (pendingEntry) kind = 'confirm-pending';
          return { name: d, share, kind, pendingId: pendingEntry?.id ?? null };
        });
        const actionable = rows.filter(r => r.kind !== 'skip' && r.share > 0);
        const totalAmount = actionable.reduce((s, r) => s + r.share, 0);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 }}
            onClick={ev => { if (ev.target === ev.currentTarget && !creditorSettleSaving) setCreditorSettleTarget(null); }}>
            <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '88vh', overflowY: 'auto', boxSizing: 'border-box' }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: '#4A7A35', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 7 }}>
                <FontAwesomeIcon icon={faCheck} style={{ fontSize: 14 }} />標記為已收款
              </p>
              <p style={{ fontSize: 12, color: C.barkLight, margin: '0 0 14px', lineHeight: 1.6 }}>
                確認後系統會把以下成員的份額一次標記為「已結清」，**不會**通知對方再次確認。
              </p>
              <div style={{ background: 'var(--tm-section-bg)', borderRadius: 12, padding: '10px 14px', marginBottom: 14, border: `1px solid ${C.creamDark}` }}>
                <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 4px', fontWeight: 600 }}>原費用</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: '0 0 2px' }}>{e.description}</p>
                <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>
                  {e.payer} 付款 · {e.currency} {e.amount?.toLocaleString()} ≈ NT$ {effectiveTWD(e).toLocaleString()}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {rows.map(r => (
                  <div key={r.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--tm-card-bg)', borderRadius: 10, border: `1px solid ${C.creamDark}`, opacity: r.kind === 'skip' ? 0.5 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: getMemberColor(r.name), flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {getMemberAvatar(r.name)
                          ? <img src={getMemberAvatar(r.name)!} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 11, fontWeight: 700, color: avatarTextColor(getMemberColor(r.name)) }}>{r.name[0]?.toUpperCase()}</span>}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.bark }}>{r.name}</span>
                      {r.kind === 'skip' && <span style={{ fontSize: 10, color: C.barkLight, fontWeight: 600 }}>已結清</span>}
                      {r.kind === 'confirm-pending' && <span style={{ fontSize: 10, color: '#9A6800', fontWeight: 600, background: '#FFF3CC', borderRadius: 4, padding: '1px 5px' }}>確認對方還款</span>}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: r.kind === 'skip' ? C.barkLight : '#4A7A35' }}>NT$ {r.share.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {actionable.length === 0 ? (
                <p style={{ fontSize: 12, color: C.barkLight, textAlign: 'center', margin: '0 0 14px' }}>沒有需要處理的份額</p>
              ) : (
                <div style={{ background: '#EAF3DE', borderRadius: 10, padding: '8px 12px', marginBottom: 14, border: '1px solid #B5CFA7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#4A7A35' }}>合計將標記</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#4A7A35' }}>NT$ {totalAmount.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={creditorSettleSaving}
                  onClick={() => setCreditorSettleTarget(null)}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: creditorSettleSaving ? 'default' : 'pointer', fontFamily: FONT, fontSize: 14, opacity: creditorSettleSaving ? 0.5 : 1 }}>
                  取消
                </button>
                <button disabled={creditorSettleSaving || actionable.length === 0}
                  onClick={async () => {
                    if (!currentUserName) return;
                    setCreditorSettleSaving(true);
                    const today = new Date().toISOString().slice(0, 10);
                    let failed = 0;
                    try {
                      for (const r of actionable) {
                        try {
                          if (r.kind === 'confirm-pending' && r.pendingId) {
                            await updateDoc(doc(db, 'trips', TRIP_ID, 'expenses', r.pendingId), {
                              status: 'confirmed', confirmedAt: today,
                            });
                          } else {
                            await addDoc(collection(db, 'trips', TRIP_ID, 'expenses'), {
                              description: '單筆結清',
                              amount: r.share, currency: 'TWD', amountTWD: r.share,
                              category: 'settlement', payer: r.name,
                              paymentMethod: 'cash', splitMode: 'equal',
                              splitWith: [currentUserName],
                              percentages: {}, customAmounts: {}, subItems: [],
                              date: today, notes: `${r.name} → ${currentUserName}`,
                              status: 'confirmed', confirmedAt: today,
                              paidAt: today, expenseRef: e.id,
                              createdAt: Timestamp.now(),
                            });
                          }
                        } catch (innerErr) {
                          console.error('[creditor settle expense] failed for', r.name, innerErr);
                          failed++;
                        }
                      }
                      if (failed > 0) {
                        alert(`共 ${actionable.length} 筆，${failed} 筆標記失敗，請重試`);
                      }
                      setCreditorSettleTarget(null);
                    } finally {
                      setCreditorSettleSaving(false);
                    }
                  }}
                  style={{ flex: 2, padding: 12, borderRadius: 12, border: 'none', background: '#4A7A35', color: 'white', fontWeight: 700, cursor: (creditorSettleSaving || actionable.length === 0) ? 'default' : 'pointer', fontFamily: FONT, fontSize: 14, opacity: (creditorSettleSaving || actionable.length === 0) ? 0.5 : 1 }}>
                  {creditorSettleSaving ? '處理中…' : <><FontAwesomeIcon icon={faCheck} style={{ marginRight: 6 }} />確認標記</>}
                </button>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: proxyTarget ? 10 : 16 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>
                {editingId
                  ? <><FontAwesomeIcon icon={faPen} style={{ fontSize: 12, marginRight: 6 }} />修改{form.isIncome ? '收入' : '支出'}</>
                  : form.isIncome
                    ? <><FontAwesomeIcon icon={faCoins} style={{ fontSize: 13, marginRight: 6, color: '#4A8A4A' }} />新增收入</>
                    : <><FontAwesomeIcon icon={faMoneyBill1} style={{ fontSize: 12, marginRight: 6 }} />新增支出</>}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* "替夥伴記帳" trigger — shown only when not in edit mode and has proxy grants */}
                {!editingId && proxyPrincipals.length > 0 && !proxyTarget && (
                  <button
                    onClick={() => {
                      const p = proxyPrincipals[0];
                      setProxyTarget(p);
                      setForm(prev => ({ ...prev, isPrivate: true, payer: p.name, splitWith: [p.name] }));
                    }}
                    style={{ fontSize: 11, fontWeight: 700, color: '#5A4A9A', background: '#EDE8FF', border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                    <FontAwesomeIcon icon={faUserShield} style={{ fontSize: 10 }} />替夥伴記帳
                  </button>
                )}
                <button onClick={closeForm}
                  style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
              </div>
            </div>

            {/* ── Desc-only mode banner — shown when editing a settled expense ── */}
            {descOnlyEdit && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#FFF8E0', borderRadius: 12, padding: '10px 14px', marginBottom: 14, border: '1.5px solid #E8C96A' }}>
                <FontAwesomeIcon icon={faLock} style={{ fontSize: 13, color: '#9A7200', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: '#7A5A00', margin: 0, lineHeight: 1.6 }}>
                  此費用已結清，<strong>金額與分帳設定</strong>已鎖定。<br />僅可修改名稱、日期與備註。
                </p>
              </div>
            )}

            {/* ── Proxy mode banner — always visible when proxyTarget is set ── */}
            {proxyTarget && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#EDE8FF', borderRadius: 12, padding: '10px 14px', marginBottom: 14, border: '1.5px solid #B8A8F0' }}>
                <FontAwesomeIcon icon={faUserShield} style={{ fontSize: 14, color: '#5A4A9A', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#5A4A9A', margin: 0 }}>
                    現在記給：<strong>{proxyTarget.name}</strong>
                  </p>
                  <p style={{ fontSize: 11, color: '#8A7ABE', margin: '1px 0 0' }}>此筆帳目將歸屬於 {proxyTarget.name} 的私人支出</p>
                </div>
                {proxyPrincipals.length > 1 && (
                  <select
                    value={proxyTarget.uid}
                    onChange={e => {
                      const p = proxyPrincipals.find(x => x.uid === e.target.value);
                      if (p) {
                        setProxyTarget(p);
                        setForm(prev => ({ ...prev, payer: p.name, splitWith: [p.name] }));
                      }
                    }}
                    style={{ fontSize: 12, border: `1px solid #B8A8F0`, borderRadius: 8, padding: '4px 8px', background: 'white', color: '#5A4A9A', fontFamily: FONT, cursor: 'pointer' }}>
                    {proxyPrincipals.map(p => <option key={p.uid} value={p.uid}>{p.name}</option>)}
                  </select>
                )}
                <button
                  onClick={() => { setProxyTarget(null); setForm(prev => ({ ...prev, isPrivate: false, payer: currentUserName || '', splitWith: [] })); }}
                  style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#8A7ABE', flexShrink: 0, padding: 2 }}>✕</button>
              </div>
            )}

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

              {/* ── Block 1：基本資訊 ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px', background: 'var(--tm-section-bg)', borderRadius: 14 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: C.barkLight, margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>基本資訊</p>

                {/* Description */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>名稱 *</label>
                  <input ref={descRef} style={iStyle} placeholder={form.isIncome ? '例：退稅、退款、換回台幣' : '例：藥妝店購物'} value={form.description} onChange={e => set('description', e.target.value)} />
                </div>

                {/* Date — 緊接名稱後，避免被忽略 */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                    <FontAwesomeIcon icon={faCalendarDays} style={{ fontSize: 10 }} />日期
                  </label>
                  <input style={iStyle} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
                </div>

                {/* Category — hidden for income, locked in descOnly mode */}
                {!form.isIncome && (
                  <div style={descOnlyEdit ? { pointerEvents: 'none', opacity: 0.4 } : {}}>
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
              </div>

              {/* ── Block 2：費用明細 — locked in descOnly mode ── */}
              <div style={descOnlyEdit ? { pointerEvents: 'none', opacity: 0.4, userSelect: 'none' } : {}}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px', background: 'var(--tm-section-bg)', borderRadius: 14 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: C.barkLight, margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>費用明細</p>

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

                {/* FX rate + card fee (only non-TWD and non-income) */}
                {!form.isIncome && form.currency !== 'TWD' && (
                  <div style={{ padding: '10px 12px', background: 'var(--tm-card-bg)', borderRadius: 12, border: `1px solid ${C.creamDark}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
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

                {/* Income benefit scope */}
                {form.isIncome && !form.isPrivate && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>收益方式</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: form.incomeScope === 'personal' ? 10 : 0 }}>
                      {([
                        ['group',    faUsers, '全體均分'] as const,
                        ['personal', faUser,  '指定個人'] as const,
                      ]).map(([scope, icon, label]) => (
                        <button key={scope}
                          onClick={() => setForm(p => ({
                            ...p,
                            incomeScope: scope,
                            incomeBeneficiary: scope === 'personal' && !p.incomeBeneficiary ? (p.payer || '') : p.incomeBeneficiary,
                          }))}
                          style={{ flex: 1, padding: '9px 8px', borderRadius: 12,
                            border: `1.5px solid ${form.incomeScope === scope ? '#4A8A4A' : C.creamDark}`,
                            background: form.incomeScope === scope ? '#E0F4D8' : 'var(--tm-card-bg)',
                            color: form.incomeScope === scope ? '#2A6A2A' : C.bark,
                            fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          }}>
                          <FontAwesomeIcon icon={icon} style={{ fontSize: 12 }} />
                          {label}
                        </button>
                      ))}
                    </div>
                    {form.incomeScope === 'personal' && (
                      <div>
                        <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 6px' }}>受益人（此筆收入僅影響該成員帳務）</p>
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

                {/* Split Mode */}
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

                {/* Private expense toggle */}
                {googleUid && !form.isIncome && (
                  <div>
                    <button
                      type="button"
                      onClick={() => set('isPrivate', !form.isPrivate)}
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1.5px solid ${form.isPrivate ? '#9A5AC8' : C.creamDark}`, background: form.isPrivate ? '#F0E8FF' : 'var(--tm-card-bg)', color: form.isPrivate ? '#6A2A9A' : C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FontAwesomeIcon icon={faLock} style={{ fontSize: 11 }} />
                        {form.payer && form.payer !== currentUserName
                          ? `私人支出（僅 ${form.payer} 可見）`
                          : '私人支出（僅自己可見）'}
                      </span>
                      <span style={{ width: 36, height: 20, borderRadius: 10, background: form.isPrivate ? '#9A5AC8' : C.creamDark, position: 'relative', display: 'inline-block', flexShrink: 0, transition: 'background 0.2s' }}>
                        <span style={{ position: 'absolute', top: 2, left: form.isPrivate ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                      </span>
                    </button>
                    {form.isPrivate && (
                      <p style={{ fontSize: 11, color: '#6A2A9A', margin: '4px 0 0', paddingLeft: 2 }}>
                        {form.payer && form.payer !== currentUserName
                          ? `此筆支出不計入分帳結算，僅 ${form.payer} 本人可見`
                          : '此筆支出不計入分帳結算，僅記錄個人花費'}
                      </p>
                    )}
                  </div>
                )}
              </div>
              </div>{/* end Block 2 lock wrapper */}

              {/* ── Block 3：補充資訊 ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px', background: 'var(--tm-section-bg)', borderRadius: 14 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: C.barkLight, margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>補充資訊</p>

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
                          <input style={{ ...iStyle, flex: 2 }} placeholder="細項名稱" value={si.name} onChange={e => updateSubItem(idx, 'name', e.target.value)} />
                          <input style={{ ...iStyle, flex: 1 }} type="number" inputMode="decimal" placeholder="金額" value={si.amount} onChange={e => updateSubItem(idx, 'amount', e.target.value)} />
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
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>備註（支援網址自動連結）</label>
                  <input style={iStyle} placeholder="備忘、訂單連結..." value={form.notes} onChange={e => set('notes', e.target.value)} />
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
              </div>

              {/* Smart detection: only-payer suggestion */}
              {privateSuggestion && (
                <div style={{ background: '#FFF8E8', border: `1.5px solid #C8A820`, borderRadius: 14, padding: '14px 16px' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FontAwesomeIcon icon={faLock} style={{ fontSize: 11, color: '#9A5AC8' }} />這筆費用只有你一人分攤
                  </p>
                  <p style={{ fontSize: 12, color: C.barkLight, margin: '0 0 12px' }}>是否改為私人帳？私人帳不計入分帳結算。</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { set('isPrivate', true); setPrivateSuggestion(false); }}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#9A5AC8', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                      <FontAwesomeIcon icon={faLock} style={{ marginRight: 5 }} />改為私人帳
                    </button>
                    <button onClick={() => handleSave(true)}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                      保持分帳記錄
                    </button>
                  </div>
                </div>
              )}

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
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', margin: '3px 0 0' }}>
              {expenseView === 'mine' && currentUserName
                ? `含個人分攤＋私人消費 · 團隊共 NT$ ${teamTotalTWD.toLocaleString()}`
                : '僅計入分帳費用，私人帳不含在內'}
            </p>
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
                // Use settlement totals so debtor and creditor always show identical amounts
                // (avoids 1-NT$ mismatch caused by equal-split remainder rounding)
                const memberSettlements = settlements.filter(s => s.from === name || s.to === name);
                const displayAmt = memberSettlements.reduce((sum, s) => sum + s.amount, 0);
                const isMe = name === currentUserName;
                return (
                  <div key={ms.name}
                    onClick={() => { if (isMe) { setDetailTab('all'); setMemberDetailName(ms.name); } }}
                    style={{ background: 'var(--tm-card-bg)', borderRadius: 16, padding: '12px 14px', boxShadow: C.shadowSm, flexShrink: 0, width: 160, scrollSnapAlign: 'start', border: isMe ? `2px solid ${C.sageDark}` : undefined, cursor: isMe ? 'pointer' : 'default', userSelect: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: 0, textDecoration: isMe ? 'underline dotted' : 'none', textUnderlineOffset: 3 }}>{ms.name}{isMe ? <FontAwesomeIcon icon={faUser} style={{ marginLeft: 4, fontSize: 10 }} /> : ''}</p>
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
            <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 12, background: '#FFE8CC', border: '1px solid #E8B96A', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <FontAwesomeIcon icon={faCreditCard} style={{ fontSize: 12, color: '#9A6800', marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#9A6800', fontWeight: 600, lineHeight: 1.55 }}>
                共 {awaitCount} 筆刷卡記帳等卡單中，暫未納入結算。卡單到後請至該筆記帳點「補實際金額」按鈕填入。
              </span>
            </div>
          );
        })()}

        {!isVisitor && settlements.length > 0 && (() => {
          // Split creditor groups into "involves me" vs "between other members".
          // A group is "mine" when I'm the creditor (receiving) OR I'm a debtor in
          // any of its rows — keeping cross-pair settlements I appear in visible.
          const myCreditors = creditorOrder.filter(c =>
            c === currentUserName ||
            (settlementByCreditor[c] || []).some(d => d.from === currentUserName)
          );
          const otherCreditors = creditorOrder.filter(c => !myCreditors.includes(c));
          const myDebtCount = myCreditors.reduce((n, c) => n + settlementByCreditor[c].length, 0);
          const otherDebtCount = otherCreditors.reduce((n, c) => n + settlementByCreditor[c].length, 0);

          const renderCreditorCard = (creditor: string) => {
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
                {/* Batch confirm button: shown when this creditor has ≥2 pending debts to confirm */}
                {!isReadOnly && (creditor === currentUserName || adminMode) && (() => {
                  const pendingDebts = debts.filter(d => (expenses as any[]).find((ex: any) =>
                    ex.category === 'settlement' && ex.status === 'pending' &&
                    ex.payer === d.from && ex.splitWith?.[0] === d.to
                  ));
                  if (pendingDebts.length < 2) return null;
                  return (
                    <button
                      onClick={async () => {
                        // Serial loop keeps settlingId UI feedback consistent;
                        // try/catch prevents one failure from aborting the rest.
                        let failed = 0;
                        for (const d of pendingDebts) {
                          const pEntry = (expenses as any[]).find((ex: any) =>
                            ex.category === 'settlement' && ex.status === 'pending' &&
                            ex.payer === d.from && ex.splitWith?.[0] === d.to
                          );
                          try {
                            await handleCreditorConfirm(pEntry?.id ?? null, d.from, d.to, d.amount);
                          } catch (err) {
                            console.error('[batch confirm] failed:', err);
                            failed++;
                          }
                        }
                        if (failed > 0) {
                          alert(`共 ${pendingDebts.length} 筆，${failed} 筆確認失敗，請重試`);
                        }
                      }}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: 'none', background: '#4A7A35', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <FontAwesomeIcon icon={faCheck} style={{ fontSize: 10 }} />一鍵確認全部收款（{pendingDebts.length} 筆）
                    </button>
                  );
                })()}
                {/* Debtors */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {debts.map((debt, i) => {
                    const sKey = `${debt.from}-${debt.to}`;
                    const isMe = debt.from === currentUserName;
                    const isCreditorViewer = debt.to === currentUserName;
                    const isOwnerAction = adminMode && !isMe && !isCreditorViewer;
                    const isProcessing = settlingId === sKey;
                    // Find pending settlement for this pair
                    const pendingEntry = (expenses as any[]).find((e: any) =>
                      e.category === 'settlement' && e.status === 'pending' &&
                      e.payer === debt.from && e.splitWith?.[0] === debt.to
                    );
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
                        {/* Role-based buttons — show even if pair was previously confirmed (new balance may exist) */}
                        {!isReadOnly && (() => {
                          if (isProcessing) {
                            return <span style={{ flexShrink: 0, fontSize: 11, color: C.barkLight, fontWeight: 600, padding: '5px 8px' }}>處理中...</span>;
                          }
                          // Debtor: I owe this creditor
                          if (isMe) {
                            if (pendingEntry) {
                              return (
                                <span style={{ flexShrink: 0, fontSize: 11, color: '#9A6800', fontWeight: 600, padding: '5px 8px', background: '#FFF3CC', borderRadius: 8 }}>
                                  等待收款確認
                                </span>
                              );
                            }
                            return (
                              <button
                                onClick={() => openPayModal(debt.from, debt.to, debt.amount)}
                                className="tm-settle-confirm-btn"
                                style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 8, border: 'none', background: '#5A8ACF', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                                記錄還款
                              </button>
                            );
                          }
                          // Creditor or owner: can confirm receipt
                          if (isCreditorViewer || isOwnerAction) {
                            return (
                              <button
                                onClick={() => handleCreditorConfirm(pendingEntry?.id ?? null, debt.from, debt.to, debt.amount)}
                                className="tm-settle-confirm-btn"
                                style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 8, border: 'none', background: '#4A7A35', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                                {pendingEntry ? '✓ 確認收款' : '確認收款'}
                              </button>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          };

          // Subtitle on the toggle so users see the relevance distribution at a glance.
          // Only shown when both groups have content (otherwise "建議結算方式（N 筆）" is enough).
          const showSplitCount = currentUserName && myDebtCount > 0 && otherDebtCount > 0;

          return (
            <div style={{ marginBottom: 12 }}>
              <button onClick={() => setSettlementExpanded(v => !v)}
                className="tm-settlement-toggle"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#EAF3DE', borderRadius: 14, padding: '10px 14px', border: '1px solid #B5CFA7', cursor: 'pointer', fontFamily: FONT, marginBottom: settlementExpanded ? 8 : 0 }}>
                <span className="tm-settlement-toggle-text" style={{ fontSize: 12, fontWeight: 700, color: '#4A7A35', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <FontAwesomeIcon icon={faArrowRightArrowLeft} style={{ fontSize: 11 }} />
                  建議結算方式（{settlements.length} 筆）
                  {showSplitCount && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#4A7A35', opacity: 0.75 }}>
                      · 與我相關 {myDebtCount} / 其他 {otherDebtCount}
                    </span>
                  )}
                </span>
                <span className="tm-settlement-toggle-text" style={{ fontSize: 11, color: '#4A7A35', fontWeight: 600, flexShrink: 0 }}>{settlementExpanded ? '收起 ▲' : '展開 ▼'}</span>
              </button>
              {settlementExpanded && (
                <>
                  {/* Always-visible: groups that involve me */}
                  {myCreditors.map(renderCreditorCard)}
                  {/* No "mine" rows but trip still has cross-pair suggestions: render others
                      directly (otherwise the entire panel would be empty when expanded). */}
                  {myCreditors.length === 0 && otherCreditors.map(renderCreditorCard)}
                  {/* Sub-collapse: groups that don't involve me, only when there's also "mine" content */}
                  {myCreditors.length > 0 && otherCreditors.length > 0 && (
                    <>
                      <button onClick={() => setOthersExpanded(v => !v)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--tm-card-bg)', borderRadius: 12, padding: '8px 12px', border: `1px dashed ${C.creamDark}`, cursor: 'pointer', fontFamily: FONT, marginBottom: othersExpanded ? 8 : 0, marginTop: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.barkLight, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FontAwesomeIcon icon={faUsers} style={{ fontSize: 10 }} />
                          其他成員之間的建議（{otherDebtCount} 筆）
                        </span>
                        <span style={{ fontSize: 11, color: C.barkLight, fontWeight: 600 }}>{othersExpanded ? '收起 ▲' : '展開 ▼'}</span>
                      </button>
                      {othersExpanded && otherCreditors.map(renderCreditorCard)}
                    </>
                  )}
                </>
              )}
            </div>
          );
        })()}

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

        {/* ── Visitor skeleton + blur: list not accessible, show dummy cards ── */}
        {isVisitor && (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            {/* Skeleton expense cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, filter: 'blur(3px)', userSelect: 'none', pointerEvents: 'none' }}>
              {[{ w1: '55%', w2: '30%' }, { w1: '45%', w2: '25%' }, { w1: '60%', w2: '35%' }].map((sk, i) => (
                <div key={i} style={{ background: 'var(--tm-card-bg)', borderRadius: 14, padding: '10px 12px', border: `1px solid ${C.creamDark}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EBEBEB', flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ height: 12, borderRadius: 6, background: '#EBEBEB', width: sk.w1 }} />
                    <div style={{ height: 10, borderRadius: 5, background: '#EBEBEB', width: sk.w2 }} />
                  </div>
                  <div style={{ width: 48, height: 16, borderRadius: 8, background: '#EBEBEB', flexShrink: 0 }} />
                </div>
              ))}
            </div>
            {/* Overlay badge */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ background: 'rgba(255,255,255,0.92)', border: `1px solid ${C.creamDark}`, borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: C.barkLight, display: 'flex', alignItems: 'center', gap: 6, boxShadow: C.shadowSm }}>
                <FontAwesomeIcon icon={faLock} style={{ fontSize: 12 }} />費用記錄僅旅伴可查看
              </span>
            </div>
          </div>
        )}

        {/* ── Filter / Sort bar (hidden for visitors) ── */}
        {!isVisitor && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6, overflowX: 'auto', paddingBottom: 4 }}>
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
            {/* 剔除已結清 toggle — only shown if any expense is settled from viewer's perspective */}
            {currentUserName && (expenses as any[]).some((e: any) =>
              e.category !== 'settlement' && getSettlementBadge(e, currentUserName, memberNames, confirmedAmountsMap, pairDebtsMap, perExpenseConfirmedSet, wholeTripSettled) !== 'none'
            ) && (
              <button
                onClick={() => setHideSettled(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${hideSettled ? C.sageDark : C.creamDark}`, background: hideSettled ? '#EAF3DE' : 'var(--tm-card-bg)', color: hideSettled ? C.sageDark : C.barkLight, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                <FontAwesomeIcon icon={hideSettled ? faCheck : faLock} style={{ fontSize: 10 }} />
                {hideSettled ? '收還款記錄已隱藏' : '顯示全部（含收還款記錄）'}
              </button>
            )}
          </>
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
              const isForeignCard = e.paymentMethod === 'card' && (e.currency || projCurrency) !== 'TWD';
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
                      {/* ── Title row: title + receipt paperclip ── */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <p className={isPrivateExpense ? 'tm-expense-private-title' : ''} style={{ fontSize: 14, fontWeight: 700, color: isPrivateExpense ? '#6A2A9A' : C.bark, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                          {e._pending && <span title="同步中..." style={{ fontSize: 12, color: C.barkLight, animation: 'spin 1.2s linear infinite', display: 'inline-block', marginRight: 3 }}>↻</span>}
                          {e.description}
                        </p>
                        {e.receiptUrl && !isVisitor && (
                          <button
                            onClick={() => setLightboxUrl(e.receiptUrl)}
                            title="查看收據附件"
                            style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: `1px solid ${C.creamDark}`, background: 'var(--tm-input-bg)', color: C.sageDark, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                            <FontAwesomeIcon icon={faPaperclip} style={{ fontSize: 10 }} />
                          </button>
                        )}
                      </div>
                      {/* ── Badges (own row, wrappable) ── */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 3 }}>
                        {isPrivateExpense && (
                          <span className="tm-badge-private" style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: '#F0E8FF', color: '#6A2A9A', display: 'inline-flex', alignItems: 'center', gap: 3, lineHeight: 1.2 }}><FontAwesomeIcon icon={faLock} style={{ fontSize: 8 }} />私人</span>
                        )}
                        {isSettlement ? (
                          e.status === 'pending'
                            ? <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: '#FFF3CC', color: '#9A6800', display: 'inline-flex', alignItems: 'center', lineHeight: 1.2 }}>待確認</span>
                            : <span className="tm-badge-settle" style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: '#EAF3DE', color: '#4A7A35', display: 'inline-flex', alignItems: 'center', lineHeight: 1.2 }}>還款</span>
                        ) : isIncome ? (
                          <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: '#E0F0D8', color: '#4A7A35', display: 'inline-flex', alignItems: 'center', gap: 3, lineHeight: 1.2 }}><FontAwesomeIcon icon={faCoins} style={{ fontSize: 8 }} />收入</span>
                        ) : !isPrivateExpense && (
                          <span className={e.paymentMethod === 'card' ? 'tm-badge-sky-sm' : 'tm-badge-sage-sm'} style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: e.paymentMethod === 'card' ? '#D8EDF8' : '#EAF3DE', color: e.paymentMethod === 'card' ? '#2A6A9A' : '#4A7A35', display: 'inline-flex', alignItems: 'center', lineHeight: 1.2 }}>
                            {e.paymentMethod === 'card' ? '刷卡' : '現金'}
                          </span>
                        )}
                        {isAdjustment && (
                          <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: '#FFF2CC', color: '#9A6800', display: 'inline-flex', alignItems: 'center', gap: 3, lineHeight: 1.2 }}>
                            <FontAwesomeIcon icon={faPen} style={{ fontSize: 8 }} />補記
                          </span>
                        )}
                        {/* FX status chip: actual / estimated / awaiting */}
                        {!isSettlement && !isPrivateExpense && (e.currency || projCurrency) !== 'TWD' && (
                          isAwaiting ? (
                            <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: '#FFE8CC', color: '#9A6800', display: 'inline-flex', alignItems: 'center', gap: 3, lineHeight: 1.2 }}>
                              <FontAwesomeIcon icon={faCreditCard} style={{ fontSize: 8 }} />等卡單
                            </span>
                          ) : hasActual ? (
                            <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: '#E0F0D8', color: '#4A7A35', display: 'inline-flex', alignItems: 'center', gap: 3, lineHeight: 1.2 }}>
                              <FontAwesomeIcon icon={faCheck} style={{ fontSize: 8 }} />實際
                            </span>
                          ) : isForeignCard ? (
                            <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: 'var(--tm-section-bg)', color: C.barkLight, display: 'inline-flex', alignItems: 'center', gap: 3, border: `1px dashed ${C.creamDark}`, lineHeight: 1.2 }}>
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
                        {e.loggedByName && e.loggedByName !== e.payer && (
                          <span style={{ marginLeft: 4, color: '#8A7ABE', fontWeight: 600 }}>
                            · 由 {e.loggedByName} 代錄
                          </span>
                        )}
                      </p>
                      {!isSettlement && !isPrivateExpense && (
                        <p style={{ fontSize: 11, color: C.barkLight, margin: e.notes ? '0 0 2px' : 0 }}>
                          {splitModeLabel(e)}
                          {(() => {
                            const sw3 = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
                            if (sw3.length <= 1) return null;
                            const avg = Math.round(amtTWD / sw3.length);
                            return <span style={{ color: C.barkLight }}> · 人均 NT$ {avg.toLocaleString()}</span>;
                          })()}
                          {(() => {
                            const badge = currentUserName
                              ? getSettlementBadge(e, currentUserName, memberNames, confirmedAmountsMap, pairDebtsMap, perExpenseConfirmedSet, wholeTripSettled)
                              : 'none';
                            // awaitCardStatement expenses: never show settled/received badge.
                            // 收入 (income) expenses: no settlement badge — they are managed
                            // by owners/editors only and don't participate in the standard
                            // debtor/creditor settlement flow.
                            if (badge === 'settled' && !e.awaitCardStatement && !isIncome) return (
                              <span style={{ marginLeft: 4, color: C.sageDark, fontSize: 10, fontWeight: 700 }}>
                                <FontAwesomeIcon icon={faLock} style={{ marginRight: 2 }} />已結清
                              </span>
                            );
                            if (badge === 'received' && !e.awaitCardStatement && !isIncome) return (
                              <span style={{ marginLeft: 4, color: C.sageDark, fontSize: 10, fontWeight: 700 }}>
                                <FontAwesomeIcon icon={faLock} style={{ marginRight: 2 }} />已收回
                              </span>
                            );
                            // Payer side: show pending per-expense confirmations waiting
                            if (badge === 'none' && e.payer === currentUserName && !isSettlement && !isPrivateExpense) {
                              const pendingCount = (expenses as any[]).filter((se: any) =>
                                se.category === 'settlement' && se.status === 'pending' &&
                                se.expenseRef === e.id
                              ).length;
                              if (pendingCount > 0) {
                                return (
                                  <span style={{ marginLeft: 4, color: '#9A6800', fontSize: 10, fontWeight: 700 }}>
                                    <FontAwesomeIcon icon={faHourglass} style={{ marginRight: 2 }} />{pendingCount} 人待確認
                                  </span>
                                );
                              }
                            }
                            return null;
                          })()}
                        </p>
                      )}
                      {/* Notes: separate line (non-settlement, non-private only) */}
                      {!isSettlement && !isPrivateExpense && e.notes && (
                        <p style={{ fontSize: 11, color: C.barkLight, margin: 0, wordBreak: 'break-word', overflowWrap: 'anywhere' }}><SmartText text={e.notes} /></p>
                      )}
                      {isSettlement && e.notes && (
                        <p style={{ fontSize: 11, color: C.sageDark, margin: 0, wordBreak: 'break-word', overflowWrap: 'anywhere' }}><SmartText text={e.notes} /></p>
                      )}
                      {/* Already-refunded indicator on the original expense.
                          When a refund flips the original payer into a debtor in the
                          current settlement plan, surface a "需重新結算" hint so users
                          don't assume the locked 已結清 badge means everything is over. */}
                      {!isSettlement && !isPrivateExpense && refundedExpenseIds.has(e.id) && (() => {
                        const payerOwesNow = !!e.payer && settlements.some(s => s.from === e.payer);
                        return (
                          <p style={{ fontSize: 10, color: payerOwesNow ? '#9A6800' : C.sageDark, margin: 0, fontWeight: 600 }}>
                            <FontAwesomeIcon icon={faReply} style={{ marginRight: 3, fontSize: 9 }} />
                            已有退款記錄{payerOwesNow ? ' · 可能需重新結算' : ''}
                          </p>
                        );
                      })()}
                      {/* Refund linkage: show which original expense this 收入 is refunding.
                          Plain-text only (no icon) so it can't be mistaken for the
                          refund-action button on the right side of the card. */}
                      {!isSettlement && !isPrivateExpense && e.linkedExpenseId && (() => {
                        const source = (expenses as any[]).find((x: any) => x.id === e.linkedExpenseId);
                        return source ? (
                          <p style={{ fontSize: 10, color: C.barkLight, margin: 0, fontStyle: 'italic' }}>
                            退款來源：{source.description}
                          </p>
                        ) : null;
                      })()}
                    </div>
                    {/* Amount + actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      {expenseView === 'mine' && !isSettlement && !isPrivateExpense && currentUserName ? (() => {
                        const myShare = getPersonalShare(e, currentUserName, memberNames);
                        const isPayer = e.payer === currentUserName;
                        return (
                          <>
                            <p style={{ fontSize: 15, fontWeight: 700, color: C.earth, margin: 0 }}>NT$ {myShare.toLocaleString()}</p>
                            <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>共 NT$ {amtTWD.toLocaleString()}{e.currency !== 'TWD' ? ` · ${e.currency} ${e.amount?.toLocaleString()}` : ''}</p>
                            {(() => { const r = getDisplayRate(e); return r != null ? <p style={{ fontSize: 9, color: C.barkLight, margin: 0 }}>1 {e.currency} ≈ {fmtRate(r)} TWD</p> : null; })()}
                            <span className={isPayer ? 'tm-badge-sage-sm' : 'tm-badge-amber-sm'} style={{ fontSize: 9, fontWeight: 700, borderRadius: 5, padding: '2px 6px', background: isPayer ? '#E0F0D8' : '#FFF2CC', color: isPayer ? '#4A7A35' : '#9A6800' }}>
                              {isPayer ? '我付款' : '需分攤'}
                            </span>
                          </>
                        );
                      })() : (
                        <>
                          <p style={{ fontSize: 15, fontWeight: 700, color: isIncome ? '#4A8A4A' : isSettlement ? C.sageDark : C.earth, margin: 0 }}>{isIncome ? '＋' : ''}NT$ {amtTWD.toLocaleString()}</p>
                          {e.currency !== 'TWD' && !isSettlement && <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>{isIncome ? '＋' : ''}{e.currency} {e.amount?.toLocaleString()}</p>}
                          {!isSettlement && (() => { const r = getDisplayRate(e); return r != null ? <p style={{ fontSize: 9, color: C.barkLight, margin: 0 }}>1 {e.currency} ≈ {fmtRate(r)} TWD</p> : null; })()}
                        </>
                      )}
                      {/* Settlement delete: inline in right column (keeps card compact) */}
                      {isSettlement && !isReadOnly && canDeleteExpense(e) && (
                        <button
                          onClick={() => { setSettlementDeleteTarget(e); setSettlementDeleteInput(''); }}
                          className="tm-btn-delete-soft"
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#FAE0E0', color: '#9A3A3A', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
                          <FontAwesomeIcon icon={faTrashCan} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Button row: non-settlement only (keeps settlement cards compact) ── */}
                  {!isReadOnly && !isSettlement && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 8 }}>
                      {canEditExpense(e) && (
                        <button onClick={() => openEdit(e)}
                          style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FontAwesomeIcon icon={faPen} />
                        </button>
                      )}
                      {/* Settled expenses: desc-only edit (name / date / notes only) */}
                      {!canEditExpense(e) && canEditDescOnly(e) && (
                        <button onClick={() => openEdit(e, true)} title="修改備註說明"
                          style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
                          <FontAwesomeIcon icon={faPen} />
                        </button>
                      )}
                      {/* 補實際金額: payer only (they have the card statement).
                          awaitCardStatement expenses bypass the settled guard —
                          the actual TWD must always be updatable by the payer,
                          even after other members have confirmed settlement. */}
                      {isForeignCard && e.payer === currentUserName && (
                        e.awaitCardStatement ||
                        !(currentUserName && getSettlementBadge(e, currentUserName, memberNames, confirmedAmountsMap, pairDebtsMap, perExpenseConfirmedSet, wholeTripSettled) !== 'none')
                      ) && (
                        <button onClick={() => openActualForm(e)} title={hasActual ? '更新實際金額' : '補實際金額'}
                          style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${hasActual ? C.sageDark : C.earth}`, background: 'var(--tm-card-bg)', color: hasActual ? C.sageDark : C.earth, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FontAwesomeIcon icon={faReceipt} />
                        </button>
                      )}
                      {/* 建立退款: show on settled/received expenses (badge !== 'none').
                          Payer side shows for 'received'; debtor side for 'settled'.
                          Pre-fills a 收入 form linked back to this expense.
                          Hidden for income rows — you don't refund a refund. */}
                      {!isPrivateExpense && !isSettlement && !isAdjustment && !isIncome && currentUserName && (() => {
                        const badge = getSettlementBadge(e, currentUserName, memberNames, confirmedAmountsMap, pairDebtsMap, perExpenseConfirmedSet, wholeTripSettled);
                        if (badge === 'none') return null;
                        const alreadyRefunded = refundedExpenseIds.has(e.id);
                        return (
                          <button onClick={() => openRefundForm(e)} title={alreadyRefunded ? '再次建立退款記錄' : '建立退款記錄'}
                            style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${alreadyRefunded ? C.sageDark : C.barkLight}`, background: 'var(--tm-card-bg)', color: alreadyRefunded ? C.sageDark : C.barkLight, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: alreadyRefunded ? 1 : 0.7 }}>
                            <FontAwesomeIcon icon={faReply} />
                          </button>
                        );
                      })()}
                      {/* 補記差額: parties only; not meaningful for income rows */}
                      {!isPrivateExpense && !isAdjustment && !isIncome && !(currentUserName && getSettlementBadge(e, currentUserName, memberNames, confirmedAmountsMap, pairDebtsMap, perExpenseConfirmedSet, wholeTripSettled) !== 'none') && currentUserName && (() => { const sw = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames; return e.payer === currentUserName || sw.includes(currentUserName); })() && (
                        <button onClick={() => openAdjustForm(e)} title="補記差額"
                          style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.earth}`, background: 'var(--tm-card-bg)', color: C.earth, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FontAwesomeIcon icon={faArrowRightArrowLeft} />
                        </button>
                      )}
                      {/* 結清這筆: income rows don't represent a debt to settle */}
                      {!isSettlement && !isPrivateExpense && !isAdjustment && !isIncome && currentUserName && (() => {
                        const sw2 = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
                        const badge2 = getSettlementBadge(e, currentUserName, memberNames, confirmedAmountsMap, pairDebtsMap, perExpenseConfirmedSet, wholeTripSettled);
                        // Badge now handles whole-trip-settled internally — both creditor and
                        // debtor views naturally hide the button when the trip is fully closed.
                        if (badge2 !== 'none') return null;

                        // ── Debtor view ──
                        if (e.payer !== currentUserName && sw2.includes(currentUserName)) {
                          const hasPendingPerExpense = (expenses as any[]).some((se: any) =>
                            se.category === 'settlement' && se.status === 'pending' &&
                            se.expenseRef === e.id && se.payer === currentUserName
                          );
                          if (hasPendingPerExpense) {
                            return (
                              <span title="已記錄還款，等待對方確認" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 28, borderRadius: 8, background: '#FFF8E0', border: `1px solid #D4A800`, color: '#9A6800', fontSize: 9, fontWeight: 700, padding: '0 6px', whiteSpace: 'nowrap' }}>
                                待確認
                              </span>
                            );
                          }
                          const myShare = getPersonalShare(e, currentUserName, memberNames);
                          // Don't offer to settle when viewer's actual share is 0
                          // (e.g. listed in splitWith via memberNames but has 0 custom amount).
                          if (myShare <= 0) return null;
                          return (
                            <button onClick={() => openPayModal(currentUserName, e.payer, myShare, e.id)} title={`結清這筆 NT$${myShare.toLocaleString()}`}
                              style={{ height: 28, borderRadius: 8, border: `1px solid ${C.sageDark}`, background: 'var(--tm-card-bg)', color: C.sageDark, fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', whiteSpace: 'nowrap' }}>
                              結清這筆
                            </button>
                          );
                        }
                        // ── Creditor view (payer) ──
                        // Opens a confirmation modal listing each debtor + share so the creditor
                        // sees exactly what will be marked paid before committing.
                        if (e.payer === currentUserName) {
                          const debtors = sw2.filter(n => n !== currentUserName);
                          if (debtors.length === 0) return null;
                          return (
                            <button onClick={() => setCreditorSettleTarget(e)} title="標記此筆費用已收款"
                              style={{ height: 28, borderRadius: 8, border: `1px solid #4A7A35`, background: 'var(--tm-card-bg)', color: '#4A7A35', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', whiteSpace: 'nowrap' }}>
                              結清這筆
                            </button>
                          );
                        }
                        return null;
                      })()}
                      {canDeleteExpense(e) && (
                        <button
                          onClick={() => setRegularDeleteTarget(e)}
                          className="tm-btn-delete-soft"
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#FAE0E0', color: '#9A3A3A', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FontAwesomeIcon icon={faTrashCan} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Receipt thumbnail: moved to paperclip icon on title row */}

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
