import { useState, useEffect, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { C, FONT, EXPENSE_CATEGORY_MAP, JPY_TO_TWD, cardStyle, inputStyle, btnPrimary } from '../../App';
import PageHeader from '../../components/layout/PageHeader';

type SplitMode = 'equal' | 'weighted' | 'amount';

const EMPTY_FORM = {
  description: '', amount: '', currency: 'JPY' as 'JPY' | 'TWD',
  category: 'food', payer: '',
  paymentMethod: 'cash' as 'cash' | 'card',
  splitMode: 'equal' as SplitMode,
  splitWith: [] as string[],
  weights: {} as Record<string, number>,
  customAmounts: {} as Record<string, string>,
  subItems: [] as { name: string; amount: string }[],
  date: '', notes: '',
};

export default function ExpensePage({ expenses, members, firestore }: any) {
  const { db, TRIP_ID, Timestamp, addDoc, deleteDoc, doc, collection } = firestore;

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showSubItems, setShowSubItems] = useState(false);
  const [expandedExpense, setExpandedExpense] = useState<string | null>(null);

  const descRef  = useRef<HTMLInputElement>(null);
  const ocrRef   = useRef<HTMLInputElement>(null);
  const [ocrState, setOcrState] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);

  // Delayed focus to prevent iOS zoom
  useEffect(() => {
    if (showForm) {
      const t = setTimeout(() => {
        descRef.current?.focus();
      }, 350);
      return () => clearTimeout(t);
    }
  }, [showForm]);

  // Parse OCR text — extract the largest number as amount, first text line as description
  const parseReceiptText = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    // Find all numbers ≥ 100 → likely prices (JPY amounts)
    const nums = text.match(/[\d,]+/g)
      ?.map(n => parseInt(n.replace(/,/g, ''), 10))
      .filter(n => n >= 100) ?? [];
    const amount = nums.length > 0 ? String(Math.max(...nums)) : '';
    // First meaningful line as description
    const desc = lines.find(l => /[\u3040-\u9FFF\w]{2,}/.test(l) && !/^\d/.test(l)) || '';
    return { amount, description: desc };
  };

  const handleOCR = async (file: File) => {
    setOcrState('scanning');
    setOcrPreview(URL.createObjectURL(file));
    try {
      const worker = await createWorker(['jpn', 'eng']);
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();
      const parsed = parseReceiptText(text);
      if (parsed.amount)      set('amount', parsed.amount);
      if (parsed.description) set('description', parsed.description);
      setOcrState('done');
    } catch (e) {
      console.error('OCR 失敗:', e);
      setOcrState('idle');
    }
  };

  const memberNames: string[] = members.length > 0 ? members.map((m: any) => m.name) : ['uu', 'brian'];

  const toTWD = (amount: number, currency: string) =>
    Math.round(amount * (currency === 'JPY' ? JPY_TO_TWD : 1));

  const totalTWD = expenses.reduce(
    (s: number, e: any) => s + (e.amountTWD || toTWD(e.amount || 0, e.currency || 'JPY')),
    0
  );

  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));

  const toggleSplitMember = (name: string) => {
    setForm(p => ({
      ...p,
      splitWith: p.splitWith.includes(name)
        ? p.splitWith.filter(n => n !== name)
        : [...p.splitWith, name],
    }));
  };

  const setWeight = (name: string, delta: number) => {
    setForm(p => {
      const cur = p.weights[name] ?? 1;
      const next = Math.min(5, Math.max(1, cur + delta));
      return { ...p, weights: { ...p.weights, [name]: next } };
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

  // Computed values for split display
  const activeSplitMembers = form.splitMode === 'equal' && form.splitWith.length > 0
    ? form.splitWith
    : memberNames;

  const totalWeight = activeSplitMembers.reduce((s, name) => s + (form.weights[name] ?? 1), 0);
  const mainAmt = Number(form.amount) || 0;
  const mainAmtTWD = toTWD(mainAmt, form.currency);

  const customTotal = Object.values(form.customAmounts).reduce((s, v) => s + (Number(v) || 0), 0);
  const customRemaining = mainAmt - customTotal;

  const subItemTotal = form.subItems.reduce((s, si) => s + (Number(si.amount) || 0), 0);

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.payer) return;
    setSaving(true);
    const amt = Number(form.amount);
    const amtTWD = toTWD(amt, form.currency);

    let splitWith = memberNames;
    if (form.splitMode === 'equal' && form.splitWith.length > 0) splitWith = form.splitWith;

    const payload = {
      description: form.description,
      amount: amt, currency: form.currency, amountTWD: amtTWD,
      category: form.category, payer: form.payer,
      paymentMethod: form.paymentMethod,
      splitMode: form.splitMode,
      splitWith,
      weights: form.splitMode === 'weighted' ? form.weights : {},
      customAmounts: form.splitMode === 'amount' ? form.customAmounts : {},
      subItems: form.subItems.filter(si => si.name.trim()),
      date: form.date || new Date().toISOString().slice(0, 10),
      notes: form.notes,
      createdAt: Timestamp.now(),
    };

    try {
      await addDoc(collection(db, 'trips', TRIP_ID, 'expenses'), payload);
    } catch (e) { console.error(e); }
    setSaving(false);
    setShowForm(false);
    setShowSubItems(false);
    setForm({ ...EMPTY_FORM });
    setOcrState('idle');
    setOcrPreview(null);
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'trips', TRIP_ID, 'expenses', id));
  };

  // Member stats
  const memberStats = memberNames.map(name => {
    const paid = expenses
      .filter((e: any) => e.payer === name)
      .reduce((s: number, e: any) => s + (e.amountTWD || toTWD(e.amount || 0, e.currency || 'JPY')), 0);

    const owed = expenses.reduce((s: number, e: any) => {
      const sw: string[] = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
      if (!sw.includes(name)) return s;
      const eAmt = e.amountTWD || toTWD(e.amount || 0, e.currency || 'JPY');
      if (e.splitMode === 'weighted' && e.weights) {
        const tw = sw.reduce((ws: number, n: string) => ws + (e.weights[n] ?? 1), 0);
        return s + Math.round(eAmt * (e.weights[name] ?? 1) / tw);
      }
      if (e.splitMode === 'amount' && e.customAmounts && e.customAmounts[name] != null) {
        return s + toTWD(Number(e.customAmounts[name]) || 0, e.currency || 'JPY');
      }
      return s + Math.round(eAmt / sw.length);
    }, 0);

    return { name, paid, owed };
  });

  const splitModeLabel = (e: any) => {
    const sw: string[] = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
    if (e.splitMode === 'weighted') return '權重分帳';
    if (e.splitMode === 'amount') return '自訂金額';
    return `均分 ${sw.length}人`;
  };

  const iStyle: React.CSSProperties = { ...inputStyle, fontSize: 16 };

  return (
    <div style={{ fontFamily: FONT }}>

      {/* ── Inline Form Modal ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '93vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>💰 新增支出</p>
              <button onClick={() => { setShowForm(false); setShowSubItems(false); setForm({ ...EMPTY_FORM }); setOcrState('idle'); setOcrPreview(null); }}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* OCR 拍照識別發票 */}
              <div>
                <input ref={ocrRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) handleOCR(e.target.files[0]); }} />
                <button
                  onClick={() => ocrRef.current?.click()}
                  disabled={ocrState === 'scanning'}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 14, border: `2px dashed ${ocrState === 'done' ? C.sageDark : C.creamDark}`, background: ocrState === 'done' ? '#EAF3DE' : C.cream, color: ocrState === 'done' ? C.sageDark : C.barkLight, fontWeight: 700, fontSize: 13, cursor: ocrState === 'scanning' ? 'default' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: ocrState === 'scanning' ? 0.7 : 1 }}>
                  {ocrState === 'scanning' ? (
                    <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>🔄</span> 識別中，請稍候...</>
                  ) : ocrState === 'done' ? (
                    <>✅ 識別完成，已自動填入</>
                  ) : (
                    <>📷 拍照識別發票（自動填入）</>
                  )}
                </button>
                {ocrPreview && ocrState !== 'scanning' && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={ocrPreview} alt="發票預覽" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10, border: `1.5px solid ${C.creamDark}` }} />
                    <button onClick={() => { setOcrPreview(null); setOcrState('idle'); }}
                      style={{ fontSize: 11, color: C.barkLight, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, padding: 0 }}>✕ 清除</button>
                  </div>
                )}
              </div>

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
                  <select style={{ ...iStyle, width: 80 }} value={form.currency} onChange={e => set('currency', e.target.value as 'JPY' | 'TWD')}>
                    <option value="JPY">JPY</option>
                    <option value="TWD">TWD</option>
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
                      style={{ flex: 1, padding: '9px 8px', borderRadius: 12, border: `1.5px solid ${form.paymentMethod === m ? C.sageDark : C.creamDark}`, background: form.paymentMethod === m ? C.sageLight : 'white', color: C.bark, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
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
                      style={{ padding: '6px 12px', borderRadius: 10, border: `1.5px solid ${form.category === key ? C.sageDark : C.creamDark}`, background: form.category === key ? info.bg : 'white', color: C.bark, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
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
                      style={{ flex: 1, minWidth: 60, padding: '10px 8px', borderRadius: 12, border: `1.5px solid ${form.payer === name ? C.sageDark : C.creamDark}`, background: form.payer === name ? C.sage : 'white', color: form.payer === name ? 'white' : C.bark, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 13 }}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Split Mode */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>分帳方式</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                  {([['equal', '⚖️', '均分'], ['weighted', '⚖', '權重'], ['amount', '✍️', '自訂金額']] as [SplitMode, string, string][]).map(([mode, icon, label]) => (
                    <button key={mode} onClick={() => set('splitMode', mode)}
                      style={{ padding: '9px 4px', borderRadius: 12, border: `1.5px solid ${form.splitMode === mode ? C.sageDark : C.creamDark}`, background: form.splitMode === mode ? C.sageLight : 'white', color: C.bark, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
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
                          style={{ flex: 1, minWidth: 60, padding: '9px 8px', borderRadius: 12, border: `1.5px solid ${form.splitWith.includes(name) ? C.sageDark : C.creamDark}`, background: form.splitWith.includes(name) ? C.sage : 'white', color: form.splitWith.includes(name) ? 'white' : C.bark, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, fontSize: 13 }}>
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

                {/* Weighted split */}
                {form.splitMode === 'weighted' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {memberNames.map((name: string) => {
                      const w = form.weights[name] ?? 1;
                      const share = totalWeight > 0 ? Math.round(mainAmtTWD * w / totalWeight) : 0;
                      return (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.cream, borderRadius: 12, padding: '8px 12px' }}>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.bark }}>{name}</span>
                          <button onClick={() => setWeight(name, -1)}
                            style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.bark, fontWeight: 700, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                          <span style={{ minWidth: 20, textAlign: 'center', fontSize: 14, fontWeight: 700, color: C.bark }}>{w}</span>
                          <button onClick={() => setWeight(name, 1)}
                            style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.bark, fontWeight: 700, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>＋</button>
                          <span style={{ minWidth: 70, textAlign: 'right', fontSize: 12, color: C.earth, fontWeight: 600 }}>NT$ {share.toLocaleString()}</span>
                        </div>
                      );
                    })}
                    <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>總權重：{totalWeight}</p>
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
              <div>
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
                      style={{ padding: '7px 0', borderRadius: 10, border: `1.5px dashed ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
                      ＋ 新增一筆
                    </button>
                    {form.subItems.length > 0 && (
                      <p style={{ fontSize: 12, color: C.barkLight, margin: 0 }}>
                        細項合計：{subItemTotal.toLocaleString()} / 總額：{mainAmt.toLocaleString()} {form.currency}
                      </p>
                    )}
                  </div>
                )}
              </div>

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

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => { setShowForm(false); setShowSubItems(false); setForm({ ...EMPTY_FORM }); setOcrState('idle'); setOcrPreview(null); }}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 14 }}>
                  取消
                </button>
                <button onClick={handleSave} disabled={saving || !form.description || !form.amount || !form.payer}
                  style={{ ...btnPrimary(), flex: 2, opacity: saving || !form.description || !form.amount || !form.payer ? 0.6 : 1 }}>
                  {saving ? '儲存中...' : '✓ 新增'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <PageHeader title="旅行記帳" subtitle="支出記錄 · 分帳結算" emoji="💰" color={C.sage}>
        <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.2)', borderRadius: 14, padding: '12px 14px' }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', margin: '0 0 2px' }}>總支出（換算台幣）</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: 'white', margin: 0 }}>NT$ {totalTWD.toLocaleString()}</p>
        </div>
      </PageHeader>

      <div style={{ padding: '12px 16px 80px' }}>

        {/* Member stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {memberStats.map(ms => {
            const balance = ms.paid - ms.owed;
            return (
              <div key={ms.name} style={{ background: 'white', borderRadius: 16, padding: '12px 14px', boxShadow: C.shadowSm }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: '0 0 6px' }}>{ms.name}</p>
                <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 2px' }}>已付出</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.earth, margin: '0 0 6px' }}>NT$ {ms.paid.toLocaleString()}</p>
                <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 2px' }}>應付金額</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.bark, margin: '0 0 6px' }}>NT$ {ms.owed.toLocaleString()}</p>
                <div style={{ background: balance >= 0 ? '#EAF3DE' : '#FAE0E0', borderRadius: 8, padding: '4px 8px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: balance >= 0 ? '#4A7A35' : '#9A3A3A', margin: 0 }}>
                    {balance >= 0 ? `應收 NT$ ${balance.toLocaleString()}` : `應補 NT$ ${Math.abs(balance).toLocaleString()}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add button */}
        <button onClick={() => setShowForm(true)} style={{ ...btnPrimary(C.earth), width: '100%', marginBottom: 16 }}>
          ＋ 新增支出
        </button>

        {/* Expense list */}
        {expenses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: C.barkLight }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
            <p style={{ fontSize: 13 }}>還沒有支出記錄</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...expenses].reverse().map((e: any) => {
              const cat = EXPENSE_CATEGORY_MAP[e.category] || EXPENSE_CATEGORY_MAP.other;
              const amtTWD = e.amountTWD || toTWD(e.amount || 0, e.currency || 'JPY');
              const hasSubItems = e.subItems && e.subItems.length > 0;
              const isExpanded = expandedExpense === e.id;
              return (
                <div key={e.id} style={{ ...cardStyle, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {/* Category icon */}
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      {cat.emoji}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{e.description}</p>
                        {/* Payment method badge */}
                        <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: e.paymentMethod === 'card' ? '#D8EDF8' : '#EAF3DE', color: e.paymentMethod === 'card' ? '#2A6A9A' : '#4A7A35' }}>
                          {e.paymentMethod === 'card' ? '刷卡' : '現金'}
                        </span>
                      </div>
                      <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 2px' }}>
                        {e.payer} 付款 · {e.date || ''}
                      </p>
                      <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>
                        {splitModeLabel(e)}
                        {e.notes ? ` · ${e.notes}` : ''}
                      </p>
                    </div>
                    {/* Amount + delete */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: C.earth, margin: 0 }}>NT$ {amtTWD.toLocaleString()}</p>
                      {e.currency !== 'TWD' && <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>{e.currency} {e.amount?.toLocaleString()}</p>}
                      <button onClick={() => handleDelete(e.id)}
                        style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#FAE0E0', color: '#9A3A3A', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        🗑
                      </button>
                    </div>
                  </div>

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
        )}
      </div>
    </div>
  );
}
