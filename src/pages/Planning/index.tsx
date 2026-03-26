import { useState } from 'react';
import { C, FONT } from '../../App';
import PageHeader from '../../components/layout/PageHeader';

const MEMBER_COLORS: Record<string, string> = {
  uu: '#ebcef5', brian: '#aaa9ab', all: '#E0F0D8',
};
const EMPTY_FORM = { text: '', listType: 'todo', assignedTo: 'all', dueDate: '' };

export default function PlanningPage({ lists, members, firestore }: any) {
  const { db, TRIP_ID, addDoc, updateDoc, deleteDoc, collection, doc } = firestore;

  const [filterBy, setFilterBy]       = useState<string>('all');
  const [activeSection, setActiveSection] = useState<string>('todo');
  const [showSheet, setShowSheet]     = useState(false);
  const [editTarget, setEditTarget]   = useState<any | null>(null);
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  const [saving, setSaving]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const memberNames: string[] = members.length > 0
    ? members.map((m: any) => m.name)
    : ['uu', 'brian'];

  const packing = lists.filter((l: any) => l.listType === 'packing');
  const todos   = lists.filter((l: any) => l.listType === 'todo');
  const allDone  = lists.filter((l: any) => l.checked).length;
  const allTotal = lists.length;

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  /* ── 勾選切換 ── */
  const toggleItem = async (itemId: string, current: boolean) => {
    try {
      await updateDoc(doc(db, 'trips', TRIP_ID, 'lists', itemId), { checked: !current });
    } catch (e) { console.error(e); }
  };

  /* ── 新增 ── */
  const handleAdd = async () => {
    if (!form.text.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'trips', TRIP_ID, 'lists'), {
        text:       form.text.trim(),
        listType:   form.listType,
        assignedTo: form.assignedTo,
        dueDate:    form.dueDate || '',
        checked:    false,
        createdAt:  new Date().toISOString(),
      });
      setForm({ ...EMPTY_FORM, listType: form.listType }); // keep listType
      setShowSheet(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  /* ── 儲存編輯 ── */
  const handleEditSave = async () => {
    if (!editTarget || !form.text.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'trips', TRIP_ID, 'lists', editTarget.id), {
        text:       form.text.trim(),
        listType:   form.listType,
        assignedTo: form.assignedTo,
        dueDate:    form.dueDate || '',
      });
      setEditTarget(null); setShowSheet(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  /* ── 刪除 ── */
  const handleDelete = async (itemId: string) => {
    try {
      await deleteDoc(doc(db, 'trips', TRIP_ID, 'lists', itemId));
    } catch (e) { console.error(e); }
    setConfirmDelete(null);
  };

  const openAdd = (type: string) => {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, listType: type });
    setShowSheet(true);
  };

  const openEdit = (item: any) => {
    setEditTarget(item);
    setForm({ text: item.text, listType: item.listType, assignedTo: item.assignedTo || 'all', dueDate: item.dueDate || '' });
    setShowSheet(true);
  };

  const applyFilter = (items: any[]) => {
    if (filterBy === 'all') return items;
    return items.filter((i: any) => i.assignedTo === filterBy || i.assignedTo === 'all');
  };

  const isEdit = !!editTarget;

  /* ── 底部面板 ── */
  const ItemSheet = () => (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}
      onClick={e => { if (e.target === e.currentTarget) { setShowSheet(false); setEditTarget(null); } }}
    >
      <div style={{ background: 'white', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>
            {isEdit ? '✏️ 編輯項目' : '➕ 新增項目'}
          </p>
          <button onClick={() => { setShowSheet(false); setEditTarget(null); }}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 內容 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>內容 *</label>
            <input
              autoFocus
              value={form.text}
              onChange={e => set('text', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && form.text.trim()) isEdit ? handleEditSave() : handleAdd(); }}
              placeholder="輸入項目內容..."
              style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${C.creamDark}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: FONT, outline: 'none', color: C.bark }}
            />
          </div>

          {/* 清單類型 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>清單類型</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ v: 'todo', l: '✅ 待辦' }, { v: 'packing', l: '🧳 行李' }].map(({ v, l }) => (
                <button key={v} onClick={() => set('listType', v)}
                  style={{ flex: 1, padding: '9px 4px', borderRadius: 12, border: `1.5px solid ${form.listType === v ? C.earth : C.creamDark}`, background: form.listType === v ? C.earth : 'white', color: form.listType === v ? 'white' : C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* 負責人 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>負責人</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[{ id: 'all', label: '🌿 全體' }, ...memberNames.map((n: string) => ({ id: n, label: `👤 ${n}` }))].map(opt => (
                <button key={opt.id} onClick={() => set('assignedTo', opt.id)}
                  style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${form.assignedTo === opt.id ? C.sageDark : C.creamDark}`, background: form.assignedTo === opt.id ? C.sage : 'white', color: form.assignedTo === opt.id ? 'white' : C.bark, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 截止日期 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>截止日期（選填）</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => set('dueDate', e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${C.creamDark}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: FONT, outline: 'none', color: C.bark }}
            />
          </div>

          {/* 操作按鈕 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {isEdit && (
              <button
                onClick={() => { setConfirmDelete(editTarget.id); setShowSheet(false); }}
                style={{ padding: '12px 16px', borderRadius: 12, border: `1.5px solid #FAE0E0`, background: '#FAE0E0', color: '#9A3A3A', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                🗑
              </button>
            )}
            <button onClick={() => { setShowSheet(false); setEditTarget(null); }}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
              取消
            </button>
            <button
              onClick={isEdit ? handleEditSave : handleAdd}
              disabled={saving || !form.text.trim()}
              style={{ flex: 2, padding: 12, borderRadius: 12, border: 'none', background: form.text.trim() ? C.earth : C.creamDark, color: 'white', fontWeight: 700, fontSize: 14, cursor: form.text.trim() ? 'pointer' : 'default', fontFamily: FONT, opacity: saving ? 0.7 : 1 }}>
              {saving ? '儲存中...' : isEdit ? '✓ 儲存' : '➕ 新增'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── 刪除確認 ── */
  const DeleteConfirm = () => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: '24px 20px', width: '100%', maxWidth: 320, fontFamily: FONT, textAlign: 'center' }}>
        <p style={{ fontSize: 28, margin: '0 0 10px' }}>🗑️</p>
        <p style={{ fontSize: 15, fontWeight: 700, color: C.bark, margin: '0 0 6px' }}>確定刪除？</p>
        <p style={{ fontSize: 12, color: C.barkLight, margin: '0 0 20px' }}>此操作無法復原</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setConfirmDelete(null)}
            style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
            取消
          </button>
          <button onClick={() => handleDelete(confirmDelete!)}
            style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#C0392B', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
            刪除
          </button>
        </div>
      </div>
    </div>
  );

  /* ── 項目列表 ── */
  const renderList = (items: any[], sectionId: string) => {
    const filtered = applyFilter(items);
    return (
      <>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: C.barkLight }}>
            <p style={{ fontSize: 28, margin: '0 0 8px' }}>{sectionId === 'packing' ? '🧳' : '✅'}</p>
            <p style={{ fontSize: 13, margin: 0 }}>尚無項目，點下方 ＋ 新增</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((item: any) => {
              const color = MEMBER_COLORS[item.assignedTo] || C.creamDark;
              return (
                <div key={item.id}
                  style={{ background: 'white', borderRadius: 16, padding: '12px 14px', boxShadow: C.shadowSm, display: 'flex', alignItems: 'center', gap: 10, opacity: item.checked ? 0.55 : 1, transition: 'opacity 0.2s' }}>
                  {/* 勾選框 */}
                  <div
                    onClick={() => toggleItem(item.id, item.checked)}
                    style={{ width: 24, height: 24, borderRadius: 8, border: `2px solid ${item.checked ? C.sageDark : C.creamDark}`, background: item.checked ? C.sage : 'white', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
                    {item.checked && <span style={{ color: 'white', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                  </div>
                  {/* 文字 */}
                  <div onClick={() => toggleItem(item.id, item.checked)} role="button" style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.bark, margin: 0, textDecoration: item.checked ? 'line-through' : 'none' }}>{item.text}</p>
                    {item.dueDate && <p style={{ fontSize: 10, color: C.barkLight, margin: '2px 0 0' }}>截止：{item.dueDate}</p>}
                  </div>
                  {/* 負責人標籤 */}
                  <div style={{ background: color, borderRadius: 8, padding: '3px 8px', fontSize: 10, fontWeight: 700, color: C.bark, flexShrink: 0, minWidth: 28, textAlign: 'center' }}>
                    {item.assignedTo === 'all' ? '全體' : (item.assignedTo || '—')}
                  </div>
                  {/* 編輯按鈕 */}
                  <button
                    onClick={e => { e.stopPropagation(); openEdit(item); }}
                    style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.creamDark}`, background: 'white', fontSize: 12, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    ✏️
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {/* 新增按鈕 */}
        <button
          onClick={() => openAdd(sectionId)}
          style={{ marginTop: 12, width: '100%', padding: '11px 14px', borderRadius: 14, border: `2px dashed ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>＋</span>
          新增{sectionId === 'packing' ? '行李' : '待辦'}項目
        </button>
      </>
    );
  };

  const SECTIONS = [
    { id: 'todo',    label: '✅ 待辦', items: todos   },
    { id: 'packing', label: '🧳 行李', items: packing },
  ];

  return (
    <div style={{ fontFamily: FONT }}>
      {showSheet && <ItemSheet />}
      {confirmDelete && <DeleteConfirm />}

      <PageHeader title="旅行準備" subtitle="待辦清單 · 行李清單" emoji="📋" color={C.earth}>
        {allTotal > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{allDone} / {allTotal} 完成</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{Math.round((allDone / allTotal) * 100)}%</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(allDone / allTotal) * 100}%`, background: 'white', borderRadius: 3, transition: 'width 0.4s' }} />
            </div>
          </div>
        )}
      </PageHeader>

      <div style={{ padding: '12px 16px 80px' }}>
        {/* 篩選 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
          {[{ id: 'all', label: '🌿 全部' }, ...memberNames.map((n: string) => ({ id: n, label: `👤 ${n}` }))].map(opt => (
            <button key={opt.id} onClick={() => setFilterBy(opt.id)}
              style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${filterBy === opt.id ? C.sageDark : C.creamDark}`, background: filterBy === opt.id ? C.sage : 'white', color: filterBy === opt.id ? 'white' : C.bark, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT, transition: 'all 0.2s' }}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* 分區 Tab */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              style={{ flex: 1, padding: '9px 4px', borderRadius: 12, border: `1.5px solid ${activeSection === s.id ? C.earth : C.creamDark}`, background: activeSection === s.id ? C.earth : 'white', color: activeSection === s.id ? 'white' : C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, transition: 'all 0.2s' }}>
              {s.label}
              <span style={{ marginLeft: 5, fontSize: 11, opacity: 0.75 }}>
                ({(s.id === 'todo' ? todos : packing).filter((i: any) => !i.checked).length})
              </span>
            </button>
          ))}
        </div>

        {SECTIONS.map(s => s.id === activeSection && (
          <div key={s.id}>
            {renderList(s.items, s.id)}
          </div>
        ))}
      </div>
    </div>
  );
}
