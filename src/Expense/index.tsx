import { useState } from 'react';
import { C, FONT, EXPENSE_CATEGORY_MAP, JPY_TO_TWD, cardStyle, inputStyle, btnPrimary } from '../../App';
import PageHeader from '../../components/layout/PageHeader';

export default function ExpensePage({ expenses, members, firestore }: any) {
  const { db, TRIP_ID, Timestamp, addDoc, deleteDoc, doc } = firestore;
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]    = useState(false);
  const [form, setForm]        = useState({
    description: '', amount: '', currency: 'JPY',
    category: 'food', payer: '', splitWith: [] as string[], evenSplit: true, date: '',
  });

  const memberNames: string[] = members.length > 0 ? members.map((m: any) => m.name) : ['uu', 'brian'];

  const toTWD = (amount: number, currency: string) =>
    Math.round(amount * (currency === 'JPY' ? JPY_TO_TWD : 1));

  const totalTWD = expenses.reduce((s: number, e: any) => s + (e.amountTWD || toTWD(e.amount || 0, e.currency || 'JPY')), 0);

  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));
  const toggleSplit = (name: string) => {
    setForm(p => ({
      ...p,
      splitWith: p.splitWith.includes(name)
        ? p.splitWith.filter(n => n !== name)
        : [...p.splitWith, name],
    }));
  };

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.payer) return;
    setSaving(true);
    const amt    = Number(form.amount);
    const amtTWD = toTWD(amt, form.currency);
    const split  = form.evenSplit ? memberNames : form.splitWith;
    const payload = {
      description: form.description, amount: amt, currency: form.currency,
      category: form.category, payer: form.payer,
      splitWith: split, evenSplit: form.evenSplit,
      amountTWD: amtTWD,
      date: form.date || new Date().toISOString().slice(0,10),
      createdAt: Timestamp.now(),
    };
    try {
      await addDoc(({ collection: (ref: any, col: string) => ({ ref, col }) } as any), payload);
      // direct call
      const { collection } = firestore;
      await addDoc(collection(doc(db,'trips',TRIP_ID),'expenses'), payload);
    } catch(e) { console.error(e); }
    setSaving(false);
    setShowForm(false);
    setForm({ description: '', amount: '', currency: 'JPY', category: 'food', payer: '', splitWith: [], evenSplit: true, date: '' });
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db,'trips',TRIP_ID,'expenses',id));
  };

  // 各人支出統計
  const memberStats = memberNames.map(name => {
    const paid = expenses.filter((e: any) => e.payer === name).reduce((s: number, e: any) => s + (e.amountTWD || toTWD(e.amount || 0, e.currency || 'JPY')), 0);
    return { name, paid };
  });
  const perPerson = memberNames.length ? Math.round(totalTWD / memberNames.length) : 0;

  const ExpenseForm = () => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ background: 'white', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>💰 新增支出</p>
          <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 描述 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>名稱 *</label>
            <input style={inputStyle} placeholder="例：藥妝店購物" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          {/* 金額 + 幣別 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>金額 *</label>
              <input style={inputStyle} type="number" placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>幣別</label>
              <select style={{ ...inputStyle, width: 80 }} value={form.currency} onChange={e => set('currency', e.target.value)}>
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
          {/* 類別 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>類別</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(EXPENSE_CATEGORY_MAP).map(([key, info]) => (
                <button key={key} onClick={() => set('category', key)}
                  style={{ padding: '6px 12px', borderRadius: 10, border: `1.5px solid ${form.category===key?C.sageDark:C.creamDark}`, background: form.category===key?info.bg:'white', color: C.bark, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
                  {info.emoji} {info.label}
                </button>
              ))}
            </div>
          </div>
          {/* 誰付款 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>誰付款 *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {memberNames.map(name => (
                <button key={name} onClick={() => set('payer', name)}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: 12, border: `1.5px solid ${form.payer===name?C.sageDark:C.creamDark}`, background: form.payer===name?C.sage:'white', color: form.payer===name?'white':C.bark, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          {/* 分攤方式 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>分攤方式</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => set('evenSplit', true)}
                style={{ flex: 1, padding: '9px 8px', borderRadius: 12, border: `1.5px solid ${form.evenSplit?C.sageDark:C.creamDark}`, background: form.evenSplit?C.sageLight:'white', color: C.bark, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, fontSize: 12 }}>
                ⚖️ 均分
              </button>
              <button onClick={() => set('evenSplit', false)}
                style={{ flex: 1, padding: '9px 8px', borderRadius: 12, border: `1.5px solid ${!form.evenSplit?C.sageDark:C.creamDark}`, background: !form.evenSplit?C.sageLight:'white', color: C.bark, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, fontSize: 12 }}>
                👤 指定成員
              </button>
            </div>
            {!form.evenSplit && (
              <div style={{ display: 'flex', gap: 8 }}>
                {memberNames.map(name => (
                  <button key={name} onClick={() => toggleSplit(name)}
                    style={{ flex: 1, padding: '9px 8px', borderRadius: 12, border: `1.5px solid ${form.splitWith.includes(name)?C.sageDark:C.creamDark}`, background: form.splitWith.includes(name)?C.sage:'white', color: form.splitWith.includes(name)?'white':C.bark, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* 日期 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>日期</label>
            <input style={inputStyle} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          {/* 按鈕 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>取消</button>
            <button onClick={handleSave} disabled={saving||!form.description||!form.amount||!form.payer}
              style={{ ...btnPrimary(), flex: 2, opacity: saving||!form.description||!form.amount||!form.payer?0.6:1 }}>
              {saving ? '儲存中...' : '✓ 新增'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: FONT }}>
      {showForm && <ExpenseForm />}

      <PageHeader title="旅行記帳" subtitle="支出記錄 · 分帳結算" emoji="💰" color={C.sage}>
        <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.2)', borderRadius: 14, padding: '12px 14px' }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', margin: '0 0 2px' }}>總支出（換算台幣）</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: 'white', margin: 0 }}>NT$ {totalTWD.toLocaleString()}</p>
          {memberNames.length > 0 && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', margin: '4px 0 0' }}>每人均攤 NT$ {perPerson.toLocaleString()}</p>}
        </div>
      </PageHeader>

      <div style={{ padding: '12px 16px 80px' }}>
        {/* 各人統計 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {memberStats.map(ms => {
            const balance = ms.paid - perPerson;
            return (
              <div key={ms.name} style={{ background: 'white', borderRadius: 16, padding: '12px 14px', boxShadow: C.shadowSm }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: '0 0 6px' }}>{ms.name}</p>
                <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 2px' }}>已付出</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.earth, margin: '0 0 6px' }}>NT$ {ms.paid.toLocaleString()}</p>
                <div style={{ background: balance >= 0 ? '#EAF3DE' : '#FAE0E0', borderRadius: 8, padding: '4px 8px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: balance >= 0 ? '#4A7A35' : '#9A3A3A', margin: 0 }}>
                    {balance >= 0 ? `應收 NT$ ${balance.toLocaleString()}` : `應補 NT$ ${Math.abs(balance).toLocaleString()}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* 新增按鈕 */}
        <button onClick={() => setShowForm(true)} style={{ ...btnPrimary(C.earth), width: '100%', marginBottom: 16 }}>
          ＋ 新增支出
        </button>

        {/* 支出列表 */}
        {expenses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: C.barkLight }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
            <p style={{ fontSize: 13 }}>還沒有支出記錄</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...expenses].reverse().map((e: any) => {
              const cat  = EXPENSE_CATEGORY_MAP[e.category] || EXPENSE_CATEGORY_MAP.other;
              const amtTWD = e.amountTWD || toTWD(e.amount || 0, e.currency || 'JPY');
              return (
                <div key={e.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{cat.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{e.description}</p>
                    <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>
                      {e.payer} 付款 · {e.date || ''}
                      {e.evenSplit ? ' · 均分' : e.splitWith?.length ? ` · ${e.splitWith.join('、')}` : ''}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.earth, margin: 0 }}>NT$ {amtTWD.toLocaleString()}</p>
                    {e.currency !== 'TWD' && <p style={{ fontSize: 10, color: C.barkLight, margin: '2px 0 0' }}>{e.currency} {e.amount?.toLocaleString()}</p>}
                  </div>
                  <button onClick={() => handleDelete(e.id)}
                    style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#FAE0E0', color: '#9A3A3A', fontSize: 12, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    🗑
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
