import { useState, useRef, useEffect } from 'react';
import { C, FONT } from '../../App';
import PageHeader from '../../components/layout/PageHeader';
import { auth } from '../../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrashCan, faPen, faPlus, faCircleExclamation, faLightbulb, faSquareCheck, faSuitcase, faLeaf } from '@fortawesome/free-solid-svg-icons';

const EMPTY_FORM = { text: '', listType: 'todo', assignedTo: 'all', dueDate: '' };

const getDueStatus = (dueDate: string, checked: boolean): 'normal' | 'soon' | 'overdue' => {
  if (!dueDate || checked) return 'normal';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff <= 3) return 'soon';
  return 'normal';
};

export default function PlanningPage({ lists, members, firestore }: any) {
  const { db, TRIP_ID, addDoc, updateDoc, deleteDoc, collection, doc, isReadOnly, role } = firestore;
  const isOwner = role === 'owner';

  // Current Google user identity
  const [googleUid, setGoogleUid] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setGoogleUid(user && !user.isAnonymous ? user.uid : null);
    });
    return unsub;
  }, []);

  const [filterBy, setFilterBy]           = useState<string>('all');
  const [packingTab, setPackingTab]        = useState<string>('');
  const [activeSection, setActiveSection] = useState<string>('todo');
  const [showSheet, setShowSheet]         = useState(false);
  const [editTarget, setEditTarget]       = useState<any | null>(null);
  const [form, setForm]                   = useState({ ...EMPTY_FORM });
  const [saving, setSaving]               = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const textInputRef                      = useRef<HTMLInputElement>(null);

  // Delayed focus after sheet animation (prevents iOS zoom)
  useEffect(() => {
    if (!showSheet) return;
    const t = setTimeout(() => textInputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [showSheet]);

  // Initialize packingTab to current user's member or first member
  useEffect(() => {
    if (!members.length || packingTab) return;
    const myMember = members.find((m: any) => m.googleUid === googleUid);
    setPackingTab(myMember?.name || members[0]?.name || '');
  }, [members, googleUid]);

  const memberNames: string[] = members.length > 0
    ? members.map((m: any) => m.name)
    : ['uu', 'brian'];

  // Tab member info (for packing tab)
  const tabMember    = members.find((m: any) => m.name === packingTab);
  const tabMemberUid = tabMember?.googleUid as string | undefined;

  // Per-member packing view: global items + items assigned/private to this member
  const packingForTab = !packingTab ? [] : [...lists.filter((l: any) => {
    if (l.listType !== 'packing') return false;
    if (l.assignedTo === 'all' && !l.privateOwnerUid) return true; // global preset
    if (tabMemberUid && l.privateOwnerUid === tabMemberUid) return true; // assigned/private to this member
    return false;
  })].sort((a: any, b: any) => {
    const aChecked = isPackingCheckedFor(a, tabMemberUid);
    const bChecked = isPackingCheckedFor(b, tabMemberUid);
    if (aChecked !== bChecked) return aChecked ? 1 : -1;
    // Priority: assigned by others (0) > global preset (1) > own private (2)
    const pri = (i: any) => i.privateOwnerUid && i.createdBy !== tabMemberUid ? 0 : !i.privateOwnerUid ? 1 : 2;
    if (pri(a) !== pri(b)) return pri(a) - pri(b);
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });

  const packing  = packingForTab; // alias
  const todos    = lists.filter((l: any) => l.listType === 'todo');
  const allDone  = lists.filter((l: any) => isPackingCheckedFor(l, googleUid || '') || (l.listType === 'todo' && isTodoChecked(l))).length;
  const allTotal = lists.length;

  function isPackingCheckedFor(item: any, uid: string | undefined): boolean {
    if (item.listType !== 'packing' || !uid) return false;
    if (item.checkedBy && uid in item.checkedBy) return item.checkedBy[uid];
    return item.checked ?? false;
  }

  function isPackingChecked(item: any): boolean {
    return isPackingCheckedFor(item, googleUid || undefined);
  }

  // Can the current user toggle this packing item's checkbox?
  // Packing checks are per-person (checkedBy[uid]), only the tab member can check their own tab
  function canCheckPacking(item: any): boolean {
    if (!googleUid) return false;
    return googleUid === tabMemberUid; // can only check in your own tab
  }

  // Can the current user delete this item?
  function canDeleteItem(item: any): boolean {
    if (isOwner) return true;
    if (item.listType === 'packing' && !item.privateOwnerUid && item.assignedTo === 'all') return false; // global preset: only owner deletes
    if (googleUid && item.createdBy === googleUid) return true;
    if (item.listType === 'packing' && item.privateOwnerUid && item.privateOwnerUid === googleUid) return true;
    return false;
  }

  // For todo "全體" items: per-person independent check (checkedBy[uid])
  // For todo "個人" items: shared checked state
  function isTodoChecked(item: any): boolean {
    if (item.listType !== 'todo') return false;
    if (item.assignedTo === 'all' || !item.assignedTo) {
      if (item.checkedBy && googleUid && googleUid in item.checkedBy) return item.checkedBy[googleUid];
      return false;
    }
    return item.checked ?? false;
  }

  function canCheckTodo(item: any): boolean {
    if (isReadOnly) return false;
    if (item.assignedTo === 'all' || !item.assignedTo) return !!googleUid; // must be logged in
    // Assigned to specific person
    const assignedMember = members.find((m: any) => m.name === item.assignedTo);
    return isOwner || assignedMember?.googleUid === googleUid;
  }

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  const toggleItem = async (item: any) => {
    if (isReadOnly) return;
    if (item.listType === 'packing') {
      if (!canCheckPacking(item)) return;
      const currentChecked = isPackingCheckedFor(item, googleUid || undefined);
      try {
        await updateDoc(doc(db, 'trips', TRIP_ID, 'lists', item.id), {
          [`checkedBy.${googleUid}`]: !currentChecked,
        });
      } catch (e) { console.error(e); }
    } else {
      // todo: 全體 → per-person checkedBy; 個人 → shared checked
      if (!canCheckTodo(item)) return;
      if (item.assignedTo === 'all' || !item.assignedTo) {
        if (!googleUid) return;
        const currentChecked = isTodoChecked(item);
        try {
          await updateDoc(doc(db, 'trips', TRIP_ID, 'lists', item.id), {
            [`checkedBy.${googleUid}`]: !currentChecked,
          });
        } catch (e) { console.error(e); }
      } else {
        try { await updateDoc(doc(db, 'trips', TRIP_ID, 'lists', item.id), { checked: !item.checked }); }
        catch (e) { console.error(e); }
      }
    }
  };

  const handleAdd = async () => {
    if (isReadOnly) return;
    if (!form.text.trim()) return;
    setSaving(true);
    try {
      const isPacking = form.listType === 'packing';
      // Compute privateOwnerUid: who this packing item belongs to (only they + owner can see)
      let privateUid: string | null = null;
      if (isPacking && form.assignedTo !== 'all') {
        if (isOwner) {
          // Owner assigning to a named member → set that member's uid as private owner
          const assignedMember = members.find((m: any) => m.name === form.assignedTo);
          privateUid = assignedMember?.googleUid || null;
        } else if (googleUid) {
          // Non-owner assigning to themselves → self-private
          privateUid = googleUid;
        }
      }
      await addDoc(collection(db, 'trips', TRIP_ID, 'lists'), {
        text: form.text.trim(), listType: form.listType,
        assignedTo: form.assignedTo,
        privateOwnerUid: privateUid,
        createdBy: googleUid || null,
        dueDate: form.dueDate || '',
        checked: false, createdAt: new Date().toISOString(),
      });
      setForm({ ...EMPTY_FORM, listType: form.listType });
      setShowSheet(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleEditSave = async () => {
    if (!editTarget || !form.text.trim()) return;
    setSaving(true);
    try {
      if (isGlobalPackingItem(editTarget) && !isOwner && googleUid) {
        // Non-owner editing global packing item → save as personal text override only
        await updateDoc(doc(db, 'trips', TRIP_ID, 'lists', editTarget.id), {
          [`textOverrides.${googleUid}`]: form.text.trim(),
        });
      } else {
        const isPacking = form.listType === 'packing';
        const isPrivate = isPacking && !!editTarget.privateOwnerUid;
        const payload: any = {
          text: form.text.trim(), listType: form.listType,
          assignedTo: isPrivate ? editTarget.privateOwnerUid : form.assignedTo,
          dueDate: form.dueDate || '',
        };
        if (!editTarget.createdBy && googleUid) payload.createdBy = googleUid;
        await updateDoc(doc(db, 'trips', TRIP_ID, 'lists', editTarget.id), payload);
      }
      setEditTarget(null); setShowSheet(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (itemId: string) => {
    try { await deleteDoc(doc(db, 'trips', TRIP_ID, 'lists', itemId)); }
    catch (e) { console.error(e); }
    setConfirmDelete(null);
  };

  const openAdd = (type: string) => {
    if (isReadOnly) return;
    if (type === 'packing' && !isOwner && !googleUid) return; // non-google users can't add packing
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, listType: type });
    setShowSheet(true);
  };

  const openEdit = (item: any) => {
    if (isReadOnly) return;
    if (!canDeleteItem(item) && !isGlobalPackingItem(item)) return; // members can edit global packing text (override)
    setEditTarget(item);
    // For global packing items, show personal override text
    const displayText = isGlobalPackingItem(item) && googleUid
      ? (item.textOverrides?.[googleUid] || item.text)
      : item.text;
    setForm({ text: displayText, listType: item.listType, assignedTo: item.assignedTo || 'all', dueDate: item.dueDate || '' });
    setShowSheet(true);
  };

  function isGlobalPackingItem(item: any): boolean {
    return item.listType === 'packing' && item.assignedTo === 'all' && !item.privateOwnerUid;
  }

  const applyFilter = (items: any[]) => {
    const filtered = filterBy === 'all' ? items : items.filter((i: any) => {
      if (i.privateOwnerUid) {
        if (isOwner) {
          // Owner filtering by name: show items whose privateOwnerUid matches that member
          const filterMember = members.find((m: any) => m.name === filterBy);
          return filterMember?.googleUid === i.privateOwnerUid;
        }
        // Non-owner: show only their own private items
        const myMemberName = members.find((m: any) => m.googleUid === googleUid)?.name;
        return myMemberName === filterBy;
      }
      return i.assignedTo === filterBy || i.assignedTo === 'all';
    });
    // 未勾選 → 上方，已勾選 → 下方；同層：全體優先，再依人名排序，最後依建立時間
    return [...filtered].sort((a, b) => {
      const aChecked = a.listType === 'packing' ? isPackingChecked(a) : (a.checked ?? false);
      const bChecked = b.listType === 'packing' ? isPackingChecked(b) : (b.checked ?? false);
      if (aChecked !== bChecked) return aChecked ? 1 : -1;
      const aAssign = a.assignedTo || 'all';
      const bAssign = b.assignedTo || 'all';
      if (aAssign !== bAssign) {
        if (aAssign === 'all') return -1;
        if (bAssign === 'all') return 1;
        return aAssign.localeCompare(bAssign, 'zh');
      }
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  };

  const isEdit = !!editTarget;
  const isEditingPrivatePacking = isEdit && !!editTarget?.privateOwnerUid;

  const SECTIONS = [
    { id: 'todo',    label: <><FontAwesomeIcon icon={faSquareCheck} style={{ fontSize: 12, marginRight: 4 }} />待辦</>, items: todos   },
    { id: 'packing', label: <><FontAwesomeIcon icon={faSuitcase} style={{ fontSize: 12, marginRight: 4 }} />行李</>, items: packing },
  ];

  return (
    <div style={{ fontFamily: FONT }}>

      {/* ── 刪除確認 ── */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: 20, padding: '24px 20px', width: '100%', maxWidth: 320, fontFamily: FONT, textAlign: 'center' }}>
            <p style={{ fontSize: 28, margin: '0 0 10px', color: '#9A3A3A' }}><FontAwesomeIcon icon={faTrashCan} /></p>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.bark, margin: '0 0 6px' }}>確定刪除？</p>
            <p style={{ fontSize: 12, color: C.barkLight, margin: '0 0 20px' }}>此操作無法復原</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                取消
              </button>
              <button onClick={() => handleDelete(confirmDelete!)}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#C0392B', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 底部新增/編輯面板 ── */}
      {!isReadOnly && showSheet && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowSheet(false); setEditTarget(null); } }}
        >
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                {isEdit ? <><FontAwesomeIcon icon={faPen} style={{ fontSize: 13 }} /> 編輯項目</> : <><FontAwesomeIcon icon={faPlus} style={{ fontSize: 13 }} /> 新增項目</>}
              </p>
              <button onClick={() => { setShowSheet(false); setEditTarget(null); }}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 內容 */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>內容 *</label>
                <input
                  ref={textInputRef}
                  value={form.text}
                  onChange={e => set('text', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && form.text.trim()) isEdit ? handleEditSave() : handleAdd(); }}
                  placeholder="輸入項目內容..."
                  style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${C.creamDark}`, borderRadius: 10, padding: '10px 12px', fontSize: 16, fontFamily: FONT, outline: 'none', color: C.bark, background: 'var(--tm-input-bg)' }}
                />
              </div>

              {/* 清單類型 */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>清單類型</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ v: 'todo', icon: faSquareCheck, l: '待辦' }, { v: 'packing', icon: faSuitcase, l: '行李' }].map(({ v, icon, l }) => (
                    <button key={v} onClick={() => set('listType', v)}
                      style={{ flex: 1, padding: '10px 4px', borderRadius: 12, border: `1.5px solid ${form.listType === v ? C.earth : C.creamDark}`, background: form.listType === v ? C.earth : 'var(--tm-card-bg)', color: form.listType === v ? 'white' : C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <FontAwesomeIcon icon={icon} style={{ fontSize: 12 }} />{l}
                    </button>
                  ))}
                </div>
              </div>

              {/* 負責人 */}
              {!isEditingPrivatePacking && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>
                    {form.listType === 'packing' ? '可見範圍' : '負責人'}
                  </label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[{ id: 'all', label: <><FontAwesomeIcon icon={faLeaf} style={{ fontSize: 11, marginRight: 4 }} />全體</> }, ...memberNames.map((n: string) => ({ id: n, label: n }))].map(opt => (
                      <button key={opt.id} onClick={() => set('assignedTo', opt.id)}
                        style={{ padding: '7px 14px', borderRadius: 20, border: `1.5px solid ${form.assignedTo === opt.id ? C.sageDark : C.creamDark}`, background: form.assignedTo === opt.id ? C.sage : 'var(--tm-card-bg)', color: form.assignedTo === opt.id ? 'white' : C.bark, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {form.listType === 'packing' && !isOwner && form.assignedTo !== 'all' && (
                    <p style={{ fontSize: 11, color: C.barkLight, margin: '6px 0 0', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 4 }}><FontAwesomeIcon icon={faLightbulb} style={{ fontSize: 10 }} /> 指定個人的行李項目僅自己可見</p>
                  )}
                </div>
              )}

              {/* 截止日期 */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>截止日期（選填）</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={e => set('dueDate', e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${C.creamDark}`, borderRadius: 10, padding: '10px 12px', fontSize: 16, fontFamily: FONT, outline: 'none', color: C.bark, background: 'var(--tm-input-bg)' }}
                />
              </div>

              {/* 按鈕 */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {isEdit && canDeleteItem(editTarget) && (
                  <button
                    onClick={() => { setConfirmDelete(editTarget.id); setShowSheet(false); }}
                    style={{ padding: '12px 16px', borderRadius: 12, border: `1.5px solid #FAE0E0`, background: '#FAE0E0', color: '#9A3A3A', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                    <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 12 }} />
                  </button>
                )}
                <button onClick={() => { setShowSheet(false); setEditTarget(null); }}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
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
      )}

      <PageHeader title="旅行準備" subtitle="待辦清單・行李清單" emoji="📋" color={C.earth}>
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
        {/* 篩選 — 代辦專用 */}
        {activeSection === 'todo' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
            {[{ id: 'all', label: <><FontAwesomeIcon icon={faLeaf} style={{ fontSize: 11, marginRight: 3 }} />全部</> }, ...memberNames.map((n: string) => ({ id: n, label: n }))].map(opt => (
              <button key={opt.id} onClick={() => setFilterBy(opt.id)}
                style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${filterBy === opt.id ? C.sageDark : C.creamDark}`, background: filterBy === opt.id ? C.sage : 'var(--tm-card-bg)', color: filterBy === opt.id ? 'white' : C.bark, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT, transition: 'all 0.2s' }}>
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {/* 行李 成員 Tab */}
        {activeSection === 'packing' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
            {(isOwner ? members : members.filter((m: any) => m.googleUid === googleUid)).map((m: any) => (
              <button key={m.name} onClick={() => isOwner && setPackingTab(m.name)}
                style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${packingTab === m.name ? (m.color || C.sageDark) : C.creamDark}`, background: packingTab === m.name ? (m.color || C.sage) : 'var(--tm-card-bg)', color: packingTab === m.name ? '#3A2E24' : C.bark, fontWeight: 700, fontSize: 12, cursor: isOwner ? 'pointer' : 'default', fontFamily: FONT, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 5 }}>
                {m.avatarUrl
                  ? <img src={m.avatarUrl} alt={m.name} style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
                  : <div style={{ width: 18, height: 18, borderRadius: '50%', background: m.color || C.sage, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 9, fontWeight: 700, color: 'white' }}>{(m.name||'?')[0]}</span></div>
                }
                {m.name}
              </button>
            ))}
          </div>
        )}

        {/* 分區 Tab */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              style={{ flex: 1, padding: '9px 4px', borderRadius: 12, border: `1.5px solid ${activeSection === s.id ? C.earth : C.creamDark}`, background: activeSection === s.id ? C.earth : 'var(--tm-card-bg)', color: activeSection === s.id ? 'white' : C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, transition: 'all 0.2s' }}>
              {s.label}
              <span style={{ marginLeft: 5, fontSize: 11, opacity: 0.75 }}>
                ({(s.id === 'todo' ? todos : packing).filter((i: any) => s.id === 'packing' ? !isPackingCheckedFor(i, tabMemberUid) : !isTodoChecked(i)).length})
            </span>
            </button>
          ))}
        </div>

        {SECTIONS.map(s => s.id === activeSection && (
          <div key={s.id}>
            {(() => {
              const filtered = applyFilter(s.items);
              return (
                <>
                  {filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: C.barkLight }}>
                      <p style={{ fontSize: 28, margin: '0 0 8px', color: C.barkLight }}><FontAwesomeIcon icon={s.id === 'packing' ? faSuitcase : faSquareCheck} /></p>
                      <p style={{ fontSize: 13, margin: 0 }}>尚無項目，點下方 ＋ 新增</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {filtered.map((item: any) => {
                        const isPacking = item.listType === 'packing';
                        const isPrivateItem = isPacking && !!item.privateOwnerUid;
                        // For packing, show completion status from tab member's perspective
                        const checked = isPacking ? isPackingCheckedFor(item, tabMemberUid) : isTodoChecked(item);
                        const canCheck = isPacking ? canCheckPacking(item) : canCheckTodo(item);
                        // Packing badge logic (tab-aware)
                        let badgeBg = '#D0C8BE';
                        let badgeLabel = item.assignedTo || '—';
                        if (isPacking) {
                          const isAssignedByOther = isPrivateItem && item.createdBy !== tabMemberUid;
                          const isGlobal = !isPrivateItem && item.assignedTo === 'all';
                          const isSelfPrivate = isPrivateItem && item.createdBy === tabMemberUid;
                          if (isAssignedByOther) {
                            badgeBg = '#FFE0C8'; badgeLabel = '🎯 指派';
                          } else if (isGlobal) {
                            // Show tab member's name (not "全體"); "預設" only for owner's own management view
                            badgeBg = tabMember?.color || '#C8E6C0';
                            badgeLabel = packingTab || '預設';
                          } else if (isSelfPrivate) {
                            badgeBg = '#D8C0F0'; badgeLabel = '🔒 私人';
                          } else {
                            badgeBg = tabMember?.color || '#D0C8BE'; badgeLabel = packingTab || item.assignedTo;
                          }
                        } else {
                          // Todo badge
                          const assignedMember = members.find((m: any) => m.name === item.assignedTo);
                          badgeBg = isPrivateItem ? '#D8C0F0' : item.assignedTo === 'all' ? '#C8E6C0' : (assignedMember?.color || '#D0C8BE');
                          badgeLabel = isPrivateItem
                            ? (item.privateOwnerUid === googleUid ? '🔒 僅本人可見' : (() => { const pm = members.find((m: any) => m.googleUid === item.privateOwnerUid); return `🔒 僅${pm?.name || '指定人'}可見`; })())
                            : item.assignedTo === 'all' ? '全體' : (item.assignedTo || '—');
                        }
                        // For global packing items, show personal text override
                        const displayText = (isPacking && isGlobalPackingItem(item) && googleUid)
                          ? (item.textOverrides?.[googleUid] || item.text)
                          : item.text;
                        const status = getDueStatus(item.dueDate, checked);
                        const cardBg = status === 'overdue' ? '#FFE4E1' : status === 'soon' ? '#FFF2E0' : 'var(--tm-card-bg)';
                        const cardBorder = status === 'overdue' ? '1.5px solid #E57373' : status === 'soon' ? '1.5px solid #FFA726' : '1.5px solid transparent';
                        // showEdit: can delete item OR can override text (global packing items editable by all)
                        const showEdit = canDeleteItem(item) || isGlobalPackingItem(item);
                        return (
                          <div key={item.id}
                            style={{ background: cardBg, border: cardBorder, borderRadius: 16, padding: '12px 14px', boxShadow: C.shadowSm, display: 'flex', alignItems: 'center', gap: 10, opacity: checked ? 0.55 : 1, transition: 'opacity 0.2s' }}>
                            <div
                              onClick={() => canCheck && toggleItem(item)}
                              style={{ width: 24, height: 24, borderRadius: 8, border: `2px solid ${checked ? C.sageDark : C.creamDark}`, background: checked ? C.sage : 'var(--tm-card-bg)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canCheck ? 'pointer' : 'default', transition: 'all 0.2s', opacity: canCheck ? 1 : 0.4 }}>
                              {checked && <span style={{ color: 'white', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                            </div>
                            <div onClick={() => canCheck && toggleItem(item)} style={{ flex: 1, minWidth: 0, cursor: canCheck ? 'pointer' : 'default' }}>
                              <p style={{ fontSize: 13, fontWeight: 600, color: C.bark, margin: 0, textDecoration: checked ? 'line-through' : 'none' }}>{displayText}</p>
                              {item.dueDate && <p style={{ fontSize: 10, color: status === 'overdue' ? '#C0392B' : status === 'soon' ? '#E65100' : C.barkLight, fontWeight: status !== 'normal' ? 700 : 500, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 3 }}>{status === 'overdue' ? <><FontAwesomeIcon icon={faCircleExclamation} style={{ fontSize: 9 }} /> 已逾期：</> : status === 'soon' ? '⏰ 即將到期：' : '截止：'}{item.dueDate}</p>}
                            </div>
                            <div style={{ background: badgeBg, borderRadius: 8, padding: '3px 8px', fontSize: 10, fontWeight: 700, color: '#3A2E24', flexShrink: 0, minWidth: 28, textAlign: 'center' }}>
                              {badgeLabel}
                            </div>
                            {showEdit && (
                              <button
                                onClick={e => { e.stopPropagation(); openEdit(item); }}
                                style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', fontSize: 11, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.barkLight }}>
                                <FontAwesomeIcon icon={faPen} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* 新增按鈕：待辦 → 不限；行李 → 擁有者 或 已綁定Google的成員 */}
                  {!isReadOnly && (s.id === 'todo' || isOwner || (s.id === 'packing' && googleUid === tabMemberUid)) && (
                    <button
                      onClick={() => {
                        if (s.id === 'packing' && packingTab) {
                          // Pre-fill assignedTo with current tab member
                          setEditTarget(null);
                          setForm({ ...EMPTY_FORM, listType: 'packing', assignedTo: packingTab });
                          setShowSheet(true);
                        } else {
                          openAdd(s.id);
                        }
                      }}
                      style={{ marginTop: 12, width: '100%', padding: '11px 14px', borderRadius: 14, border: `2px dashed ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box' }}>
                      <span style={{ fontSize: 16 }}>＋</span>
                      新增{s.id === 'packing' ? '行李' : '待辦'}項目
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
