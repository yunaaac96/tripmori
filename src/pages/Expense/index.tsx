import { useState } from 'react';
import { C, FONT, EXPENSE_CATEGORY_MAP, JPY_TO_TWD, cardStyle, inputStyle, btnPrimary } from '../../App';
import PageHeader from '../../components/layout/PageHeader';
import { SectionTitle } from '../../components/ui/index';
import { collection, doc, addDoc, Timestamp } from 'firebase/firestore';

export default function ExpensePage({ expenses, members, db, TRIP_ID }: any) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ item: '', amountJPY: '', payer: 'uu', category: 'food' });
  const [saving, setSaving] = useState(false);

  const totalTWD = expenses.reduce((s: number, e: any) => s + (e.amountTWD || 0), 0);
  const totalJPY = expenses.reduce((s: number, e: any) => s + (e.amountJPY || 0), 0);

  const catTotals = expenses.reduce((acc: Record<string, number>, e: any) => {
    acc[e.category] = (acc[e.category] || 0) + (e.amountTWD || 0);
    return acc;
  }, {});

  const handleAdd = async () => {
    if (!form.item || !form.amountJPY) return;
    setSaving(true);
    const jpy = Number(form.amountJPY);
    await addDoc(collection(doc(db, 'trips', TRIP_ID), 'expenses'), {
      item: form.item,
      amountJPY: jpy,
      amountTWD: Math.round(jpy * JPY_TO_TWD),
      payer: form.payer,
      category: form.category,
      createdAt: Timestamp.now(),
    });
    setForm({ item: '', amountJPY: '', payer: 'uu', category: 'food' });
    setShowForm(false);
    setSaving(false);
  };

  const memberNames = members.length > 0 ? members.map((m: any) => m.name) : ['uu', 'brian'];

  return (
    <div style={{ fontFamily: FONT }}>
      <PageHeader title="旅行記帳" subtitle="沖繩 2026" emoji="💰" color={C.sage}>
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', margin: 0 }}>總支出 · 換算台幣</p>
          <p style={{ fontSize: 36, fontWeight: 900, color: 'white', margin: '2px 0 0', lineHeight: 1 }}>
            NT$ {totalTWD.toLocaleString()}
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '4px 0 0' }}>¥ {totalJPY.toLocaleString()} JPY</p>
          {/* 類別佔比 */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {Object.entries(catTotals).map(([cat, amt]) => {
              const info = EXPENSE_CATEGORY_MAP[cat] || EXPENSE_CATEGORY_MAP.other;
              return (
                <div key={cat} style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '6px 10px', textAlign: 'center', minWidth: 52 }}>
                  <div style={{ fontSize: 14 }}>{info.emoji}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'white' }}>
                    {totalTWD > 0 ? Math.round((Number(amt) / totalTWD) * 100) : 0}%
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)' }}>{info.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </PageHeader>

      <div style={{ padding: 16 }}>
        {/* 新增按鈕 */}
        <button onClick={() => setShowForm(!showForm)}
          style={{ ...btnPrimary(), width: '100%', marginBottom: 12 }}>
          <span style={{ fontSize: 18 }}>＋</span> 新增支出
        </button>

        {/* 新增表單 */}
        {showForm && (
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: '0 0 12px' }}>📝 新增支出</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input style={inputStyle} placeholder="支出項目名稱" value={form.item}
                onChange={e => setForm(p => ({ ...p, item: e.target.value }))} />
              <input style={inputStyle} placeholder="日幣金額 ¥" type="number" inputMode="numeric"
                value={form.amountJPY}
                onChange={e => setForm(p => ({ ...p, amountJPY: e.target.value }))} />
              {form.amountJPY && (
                <p style={{ fontSize: 12, color: C.earth, margin: '-4px 0 0', paddingLeft: 4, fontWeight: 600 }}>
                  ≈ NT$ {Math.round(Number(form.amountJPY) * JPY_TO_TWD).toLocaleString()}
                </p>
              )}
              <select style={inputStyle} value={form.payer}
                onChange={e => setForm(p => ({ ...p, payer: e.target.value }))}>
                {memberNames.map((name: string) => (
                  <option key={name} value={name}>{name} 付款</option>
                ))}
              </select>
              <select style={inputStyle} value={form.category}
                onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {Object.entries(EXPENSE_CATEGORY_MAP).map(([key, info]) => (
                  <option key={key} value={key}>{info.emoji} {info.label}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowForm(false)}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                  取消
                </button>
                <button onClick={handleAdd} disabled={saving}
                  style={{ ...btnPrimary(), flex: 2, opacity: saving ? 0.7 : 1 }}>
                  {saving ? '儲存中...' : '確認新增'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 成員帳務摘要 */}
        {members.length > 0 && (
          <>
            <SectionTitle>👥 成員帳務</SectionTitle>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {members.map((m: any) => {
                const paid = expenses.filter((e: any) => e.payer === m.name).reduce((s: number, e: any) => s + (e.amountTWD || 0), 0);
                return (
                  <div key={m.id} style={{ flex: 1, background: 'white', borderRadius: 16, padding: '12px 10px', textAlign: 'center', boxShadow: C.shadowSm }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: m.color || C.sageLight, margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: C.bark, fontSize: 14 }}>
                      {m.name?.[0]?.toUpperCase()}
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: 0 }}>{m.name}</p>
                    <p style={{ fontSize: 10, color: C.barkLight, margin: '2px 0 4px' }}>已付出</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.earth, margin: 0 }}>NT$ {paid.toLocaleString()}</p>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* 支出清單 */}
        <SectionTitle>💳 支出明細</SectionTitle>
        {expenses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: C.barkLight }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
            <p style={{ fontSize: 13 }}>還沒有支出記錄，旅途中隨時新增！</p>
          </div>
        )}
        {[...expenses]
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          .map((exp: any) => {
            const info = EXPENSE_CATEGORY_MAP[exp.category] || EXPENSE_CATEGORY_MAP.other;
            return (
              <div key={exp.id} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 13, background: info.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                    {info.emoji}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{exp.item}</p>
                    <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>
                      {exp.payer} 付款 · {info.label}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: C.earth, margin: 0 }}>¥{(exp.amountJPY || 0).toLocaleString()}</p>
                    <p style={{ fontSize: 10, color: C.barkLight, margin: '2px 0 0' }}>≈ NT${(exp.amountTWD || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
