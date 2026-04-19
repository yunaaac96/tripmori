import { useState, useRef, useEffect, useCallback } from 'react';
import { C, FONT } from '../../App';
import { avatarTextColor } from '../../utils/helpers';
import PageHeader from '../../components/layout/PageHeader';
import { auth } from '../../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrashCan, faPen, faPlus, faCircleExclamation, faLightbulb, faSquareCheck, faSuitcase, faLeaf, faChevronLeft, faChevronRight, faUser, faClock, faClipboardList, faLock, faUsers, faStar, faUserTag } from '@fortawesome/free-solid-svg-icons';

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

export default function PlanningPage({ lists, members, firestore, project }: any) {
  const { db, TRIP_ID, addDoc, updateDoc, deleteDoc, collection, doc, isReadOnly, role } = firestore;
  const isOwner = role === 'owner';

  // Current Google user identity
  const [googleUid, setGoogleUid]       = useState<string | null>(null);
  const [authReady, setAuthReady]       = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setGoogleUid(user && !user.isAnonymous ? user.uid : null);
      setAuthReady(true);
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
  const filterScrollRef                   = useRef<HTMLDivElement>(null);

  const scrollFilter = useCallback((dir: 'left' | 'right') => {
    filterScrollRef.current?.scrollBy({ left: dir === 'right' ? 140 : -140, behavior: 'smooth' });
  }, []);

  // Delayed focus after sheet animation (prevents iOS zoom)
  useEffect(() => {
    if (!showSheet) return;
    const t = setTimeout(() => textInputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [showSheet]);

  // Initialize packingTab to current user's member or first member.
  // Run whenever googleUid or members change (incl. when a member binds their account).
  useEffect(() => {
    if (!members.length) return;
    const myMember = members.find((m: any) => m.googleUid === googleUid);
    if (myMember) {
      setPackingTab(myMember.name);
    } else if (!packingTab) {
      // Fall back to the first member in owner-defined order
      const orderList: string[] = project?.memberOrder || [];
      const firstOrdered = orderList.length
        ? [...members].sort((a: any, b: any) => {
            const ai = orderList.indexOf(a.name);
            const bi = orderList.indexOf(b.name);
            return (ai === -1 ? orderList.length : ai) - (bi === -1 ? orderList.length : bi);
          })[0]
        : members[0];
      setPackingTab(firstOrdered?.name || '');
    }
  }, [members, googleUid, project?.memberOrder]);

  const memberNames: string[] = members.length > 0
    ? members.map((m: any) => m.name)
    : ['uu', 'brian'];

  const myMemberName = googleUid ? (members.find((m: any) => m.googleUid === googleUid)?.name || '') : '';

  // Sort members by owner-defined memberOrder (project?.memberOrder)
  const memberOrderList: string[] = project?.memberOrder || [];
  const sortedMemberObjects: any[] = memberOrderList.length
    ? [...members].sort((a: any, b: any) => {
        const ai = memberOrderList.indexOf(a.name);
        const bi = memberOrderList.indexOf(b.name);
        return (ai === -1 ? memberOrderList.length : ai) - (bi === -1 ? memberOrderList.length : bi);
      })
    : [...members];
  const orderedMemberNames: string[] = sortedMemberObjects.map((m: any) => m.name);

  // Todo filter / assignee picker: pin current user's member to top
  const todoMemberOrder: any[] = [
    ...sortedMemberObjects.filter((m: any) => m.googleUid === googleUid),
    ...sortedMemberObjects.filter((m: any) => m.googleUid !== googleUid),
  ];

  // Tab member info (for packing tab)
  const tabMember    = members.find((m: any) => m.name === packingTab);
  const tabMemberUid = tabMember?.googleUid as string | undefined;

  // Per-member packing view: global items + items assigned/private to this member
  const packingForTab = !packingTab ? [] : [...lists.filter((l: any) => {
    if (l.listType !== 'packing') return false;
    if (l.assignedTo === 'all' && !l.privateOwnerUid) return true; // global preset
    if (tabMemberUid && l.privateOwnerUid === tabMemberUid) return true; // UID-based private item
    // Legacy: name-based assignment (assignedTo = member name, no privateOwnerUid)
    if (!l.privateOwnerUid && l.assignedTo === packingTab) return true;
    return false;
  })].sort((a: any, b: any) => {
    const aChecked = isPackingCheckedFor(a, tabMemberUid);
    const bChecked = isPackingCheckedFor(b, tabMemberUid);
    if (aChecked !== bChecked) return aChecked ? 1 : -1;
    // Priority: own private (0) > assigned by others (1) > global preset (2)
    const pri = (i: any) => !i.privateOwnerUid ? 2 : i.createdBy !== tabMemberUid ? 1 : 0;
    if (pri(a) !== pri(b)) return pri(a) - pri(b);
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });

  const packing  = packingForTab; // alias

  // Three packing sub-sections
  const packingGlobal   = packingForTab.filter((l: any) => l.assignedTo === 'all' && !l.privateOwnerUid);
  const packingAssigned = packingForTab.filter((l: any) =>
    l.privateOwnerUid === tabMemberUid && l.createdBy && l.createdBy !== tabMemberUid
  );
  const packingPersonal = packingForTab.filter((l: any) =>
    !packingGlobal.includes(l) && !packingAssigned.includes(l)
  );

  // Is this editor unbound (has key but no member card linked)?
  const isEditorUnbound = role === 'editor' && (!googleUid || !members.some((m: any) => m.googleUid === googleUid));

  // Todos sort priority (lower = first):
  //  0  overdue + self      1  overdue + all      2  overdue + others
  //  3  soon(≤3d) + self    4  soon(≤3d) + all    5  soon(≤3d) + others
  //  6  far(>3d) + self     7  far(>3d) + all     8  far(>3d) + others
  //  9  no-date + self     10  no-date + all      11  no-date + others
  // 99  completed
  const todoSortPri = (item: any): number => {
    if (isTodoChecked(item)) return 99;

    // Identity bucket: 0=self, 1=all, 2=others
    let idBucket: number;
    if (!item.assignedTo || item.assignedTo === 'all') {
      idBucket = 1;
    } else {
      const m = members.find((mm: any) => mm.name === item.assignedTo);
      idBucket = m?.googleUid === googleUid ? 0 : 2;
    }

    if (!item.dueDate) return 9 + idBucket;   // no-date: 9/10/11

    const s = getDueStatus(item.dueDate, false);
    if (s === 'overdue') return 0 + idBucket;  // overdue: 0/1/2
    if (s === 'soon')    return 3 + idBucket;  // ≤3 days: 3/4/5
    return 6 + idBucket;                        // >3 days: 6/7/8
  };
  // Defer identity-based sort until auth state is resolved to prevent flicker
  const todos = [...lists.filter((l: any) => l.listType === 'todo')].sort((a: any, b: any) => {
    if (!authReady) {
      // Stable sort by createdAt only (no identity bucket yet)
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    }
    const pa = todoSortPri(a);
    const pb = todoSortPri(b);
    if (pa !== pb) return pa - pb;
    // Within the same priority bucket: dated items sort by due-date ascending;
    // no-date items fall back to createdAt.
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
  // Visitor-visible packing: global preset items only (no member-private items)
  const visitorPackingItems = lists.filter((l: any) =>
    l.listType === 'packing' && l.assignedTo === 'all' && !l.privateOwnerUid
  ).sort((a: any, b: any) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
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
      } catch (e) { console.error(e); alert('更新失敗，請重試'); }
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
        } catch (e) { console.error(e); alert('更新失敗，請重試'); }
      } else {
        try { await updateDoc(doc(db, 'trips', TRIP_ID, 'lists', item.id), { checked: !item.checked }); }
        catch (e) { console.error(e); alert('更新失敗，請重試'); }
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
    } catch (e) {
      console.error(e);
      alert('新增失敗，請檢查網路連線後再試');
    }
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
    } catch (e) {
      console.error(e);
      alert('儲存失敗，請檢查網路連線後再試');
    }
    setSaving(false);
  };

  const handleDelete = async (itemId: string) => {
    try { await deleteDoc(doc(db, 'trips', TRIP_ID, 'lists', itemId)); }
    catch (e) { console.error(e); alert('刪除失敗，請重試'); }
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
          const filterMember = members.find((m: any) => m.name === filterBy);
          return filterMember?.googleUid === i.privateOwnerUid;
        }
        const myMemberName = members.find((m: any) => m.googleUid === googleUid)?.name;
        return myMemberName === filterBy;
      }
      return i.assignedTo === filterBy || i.assignedTo === 'all';
    });
    // For todos: already sorted by the `todos` computed array; just preserve that order
    if (items.length > 0 && items[0]?.listType === 'todo') {
      return filtered; // order from `todos` sort is authoritative
    }
    // Packing fallback sort
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
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: 20, padding: '24px 20px', width: '100%', maxWidth: 320, fontFamily: FONT, textAlign: 'center', boxSizing: 'border-box' }}>
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

              {/* 負責人 / 可見範圍 */}
              {!isEditingPrivatePacking && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>
                    {form.listType === 'packing' ? '帶去的人' : '負責人'}
                  </label>

                  {form.listType === 'packing' ? (
                    /* ── Packing: Segmented control 全員 / 自己 / 指定 ── */
                    <div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        {[
                          { val: '__all__',  icon: faUsers,   label: '全員',  title: '加入所有人清單' },
                          { val: '__self__', icon: faStar,    label: '自己',  title: '加入我的清單' },
                          ...(isOwner ? [{ val: '__pick__', icon: faUserTag, label: '指定', title: '指定給特定旅伴' }] : []),
                        ].map(opt => {
                          const isPickMode = form.assignedTo !== 'all' && !!members.find((m: any) => m.name === form.assignedTo && m.googleUid !== googleUid);
                          const isActive =
                            opt.val === '__all__'  ? form.assignedTo === 'all' :
                            opt.val === '__self__' ? (form.assignedTo !== 'all' && !isPickMode) :
                            /* __pick__ */          isPickMode;
                          return (
                            <button key={opt.val}
                              title={opt.title}
                              onClick={() => {
                                if (opt.val === '__all__') set('assignedTo', 'all');
                                else if (opt.val === '__self__') set('assignedTo', myMemberName || 'all');
                                else if (opt.val === '__pick__') {
                                  const firstOther = sortedMemberObjects.find((m: any) => m.googleUid !== googleUid);
                                  if (firstOther) set('assignedTo', firstOther.name);
                                }
                              }}
                              style={{ flex: 1, padding: '9px 4px', borderRadius: 12, border: `1.5px solid ${isActive ? C.sageDark : C.creamDark}`, background: isActive ? C.sage : 'var(--tm-card-bg)', color: isActive ? 'white' : C.bark, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                              <FontAwesomeIcon icon={opt.icon} style={{ fontSize: 12 }} />{opt.label}
                            </button>
                          );
                        })}
                      </div>
                      {/* Member picker for 指定 (owner only) - sorted by owner's memberOrder */}
                      {isOwner && form.assignedTo !== 'all' && !!members.find((m: any) => m.name === form.assignedTo && m.googleUid !== googleUid) && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                          {sortedMemberObjects.filter((m: any) => m.googleUid !== googleUid).map((m: any) => (
                            <button key={m.name} onClick={() => set('assignedTo', m.name)}
                              style={{ padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${form.assignedTo === m.name ? (m.color || C.sageDark) : C.creamDark}`, background: form.assignedTo === m.name ? (m.color || C.sage) : 'var(--tm-card-bg)', color: form.assignedTo === m.name ? 'white' : C.bark, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
                              {m.name}
                            </button>
                          ))}
                        </div>
                      )}
                      {isOwner && form.assignedTo !== 'all' && (
                        <p style={{ fontSize: 11, color: C.barkLight, margin: '6px 0 0', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <FontAwesomeIcon icon={faLightbulb} style={{ fontSize: 10 }} />
                          {form.assignedTo === myMemberName ? '僅加入你自己的行李清單' : `將此項目指派給 ${form.assignedTo}`}
                        </p>
                      )}
                      {!isOwner && form.assignedTo !== 'all' && (
                        <p style={{ fontSize: 11, color: C.barkLight, margin: '6px 0 0', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 4 }}><FontAwesomeIcon icon={faLightbulb} style={{ fontSize: 10 }} /> 個人行李僅自己可見</p>
                      )}
                    </div>
                  ) : (
                    /* ── Todo: assignedTo picker — current user pinned first ── */
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                      {[
                        { id: 'all', label: <><FontAwesomeIcon icon={faLeaf} style={{ fontSize: 11, marginRight: 4 }} />全體</> },
                        ...todoMemberOrder.map((m: any) => ({ id: m.name, label: m.name + (m.googleUid === googleUid ? ' ★' : '') })),
                      ].map(opt => (
                        <button key={opt.id} onClick={() => set('assignedTo', opt.id)}
                          style={{ padding: '7px 14px', borderRadius: 20, border: `1.5px solid ${form.assignedTo === opt.id ? C.sageDark : C.creamDark}`, background: form.assignedTo === opt.id ? C.sage : 'var(--tm-card-bg)', color: form.assignedTo === opt.id ? 'white' : C.bark, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
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

      <PageHeader title="旅行準備" subtitle="待辦清單・行李清單" emoji={<FontAwesomeIcon icon={faClipboardList} />} color={C.earth} className="tm-hero-page-earth">
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
        {/* ── 成員篩選列 ──
            待辦：全員顯示 tab（owner 可切換成員）
            行李：僅 owner 顯示 tab（editor 只看自己，不需 tab） */}
        {!isReadOnly && (activeSection === 'todo' || (activeSection === 'packing' && isOwner)) && (() => {
          // Todo: pin current user first; Packing: strict owner-defined order
          const visibleMembers = activeSection === 'todo' ? todoMemberOrder : sortedMemberObjects;

          const activeId = activeSection === 'todo' ? filterBy : packingTab;
          const setActive = (id: string) => {
            if (activeSection === 'todo') setFilterBy(id);
            else setPackingTab(id);
          };

          const Av = ({ m }: { m: any }) => m.avatarUrl
            ? <img src={m.avatarUrl} alt={m.name} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            : <div style={{ width: 20, height: 20, borderRadius: '50%', background: m.color || C.sage, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: avatarTextColor(m.color) }}>{(m.name || '?')[0]}</span>
              </div>;

          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
              {/* Desktop scroll arrow — left */}
              <button onClick={() => scrollFilter('left')}
                style={{ display: 'none', flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', color: C.barkLight, fontSize: 11 }}
                className="tm-filter-arrow tm-filter-arrow-left">
                <FontAwesomeIcon icon={faChevronLeft} />
              </button>

              <div ref={filterScrollRef} className="tm-filter-scroll"
                style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1, paddingBottom: 2 }}>

                {/* 全部 / 全體 button (todo only) */}
                {activeSection === 'todo' && (
                  <button onClick={() => setActive('all')}
                    style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${activeId === 'all' ? C.sageDark : C.creamDark}`, background: activeId === 'all' ? C.sage : 'var(--tm-card-bg)', color: activeId === 'all' ? 'white' : C.bark, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s' }}>
                    <FontAwesomeIcon icon={faLeaf} style={{ fontSize: 11 }} />全部
                  </button>
                )}

                {/* Member avatar buttons */}
                {visibleMembers.map((m: any) => {
                  const active = activeId === m.name;
                  const clickable = activeSection === 'todo' || isOwner || (activeSection === 'packing' && !!googleUid && m.googleUid === googleUid);
                  return (
                    <button key={m.name} onClick={() => clickable && setActive(m.name)}
                      className={active ? 'tm-filter-tab-active' : ''}
                      style={{ flexShrink: 0, padding: '4px 10px 4px 5px', borderRadius: 20, border: `1.5px solid ${active ? (m.color || C.sageDark) : C.creamDark}`, background: active ? (m.color || C.sageDark) : 'var(--tm-card-bg)', color: active ? 'white' : C.barkLight, fontWeight: active ? 700 : 600, fontSize: 12, cursor: clickable ? 'pointer' : 'default', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.2s', boxShadow: active ? `0 1px 6px ${m.color || C.sageDark}55` : 'none' }}>
                      <Av m={m} />
                      {m.name}
                    </button>
                  );
                })}
              </div>

              {/* Desktop scroll arrow — right */}
              <button onClick={() => scrollFilter('right')}
                style={{ display: 'none', flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', color: C.barkLight, fontSize: 11 }}
                className="tm-filter-arrow tm-filter-arrow-right">
                <FontAwesomeIcon icon={faChevronRight} />
              </button>
            </div>
          );
        })()}

        {/* 分區 Tab */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              style={{ flex: 1, padding: '9px 4px', borderRadius: 12, border: `1.5px solid ${activeSection === s.id ? C.earth : C.creamDark}`, background: activeSection === s.id ? C.earth : 'var(--tm-card-bg)', color: activeSection === s.id ? 'white' : C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, transition: 'all 0.2s' }}>
              {s.label}
              <span style={{ marginLeft: 5, fontSize: 11, opacity: 0.75 }}>
                ({isReadOnly ? (s.id === 'packing' ? visitorPackingItems.length : 0) : (s.id === 'todo' ? todos : packing).filter((i: any) => s.id === 'packing' ? !isPackingCheckedFor(i, tabMemberUid) : !isTodoChecked(i)).length})
            </span>
            </button>
          ))}
        </div>

        {SECTIONS.map(s => s.id === activeSection && (
          <div key={s.id}>
            {isReadOnly && s.id === 'todo' ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: 36, marginBottom: 12, color: C.barkLight }}><FontAwesomeIcon icon={faLock} /></div>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.bark, margin: '0 0 6px' }}>待辦清單僅旅伴可查看</p>
                <p style={{ fontSize: 13, color: C.barkLight, margin: 0 }}>請輸入協作金鑰加入旅行團</p>
              </div>
            ) : (() => {
              // ── Packing：三分區渲染 ──────────────────────────────────
              if (s.id === 'packing') {
                const viewItems = isReadOnly ? visitorPackingItems : packingForTab;
                const vGlobal   = isReadOnly ? visitorPackingItems : packingGlobal;
                const vPersonal = isReadOnly ? [] : packingPersonal;
                const vAssigned = isReadOnly ? [] : packingAssigned;

                const MemberAvatar = ({ uid }: { uid?: string }) => {
                  const m = uid ? members.find((mm: any) => mm.googleUid === uid) : null;
                  if (!m) return null;
                  return m.avatarUrl
                    ? <img src={m.avatarUrl} alt={m.name} style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} />
                    : <div style={{ width: 16, height: 16, borderRadius: '50%', background: m.color || C.sage, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: avatarTextColor(m.color) }}>{(m.name || '?')[0]}</span>
                      </div>;
                };

                const renderPackingItem = (item: any, sectionType: 'global' | 'personal' | 'assigned') => {
                  const checked = isReadOnly ? false : isPackingCheckedFor(item, tabMemberUid);
                  const canCheck = isReadOnly ? false : canCheckPacking(item);
                  const displayText = (isGlobalPackingItem(item) && googleUid)
                    ? (item.textOverrides?.[googleUid] || item.text)
                    : item.text;
                  const showEdit = !isReadOnly && (canDeleteItem(item) || isGlobalPackingItem(item));

                  // Card background + border by section type
                  const isMe = tabMemberUid && tabMemberUid === googleUid;
                  const cardBg =
                    sectionType === 'global'   ? '#F0F9FF' :
                    sectionType === 'personal' ? 'var(--tm-card-bg)' :
                    'var(--tm-card-bg)';
                  const cardBorder =
                    sectionType === 'global'   ? '1.5px solid #DBEAFE' :
                    sectionType === 'personal' ? `1.5px solid ${isMe ? '#D1FAE5' : C.creamDark}` :
                    '1.5px solid transparent';

                  // Assignee chip — right of title, todo-style coloured chip
                  const tabM = members.find((m: any) => m.name === packingTab);
                  const chipBg =
                    sectionType === 'global'   ? '#6B7280' :
                    sectionType === 'personal' ? (tabM?.color || C.sageDark) :
                    '#F97316';
                  const chipLabel =
                    sectionType === 'global'   ? '全員' :
                    sectionType === 'personal' ? (isMe ? '我' : packingTab) :
                    packingTab;
                  const chipIcon =
                    sectionType === 'global'   ? <FontAwesomeIcon icon={faUsers} style={{ fontSize: 9 }} /> :
                    sectionType === 'personal' ? (isMe ? <FontAwesomeIcon icon={faStar} style={{ fontSize: 9 }} /> : <FontAwesomeIcon icon={faUser} style={{ fontSize: 9 }} />) :
                    <FontAwesomeIcon icon={faUserTag} style={{ fontSize: 9 }} />;

                  return (
                    <div key={item.id}
                      className={sectionType === 'global' ? 'tm-packing-global-card' : sectionType === 'personal' && isMe ? 'tm-packing-personal-mine' : ''}
                      style={{ background: cardBg, border: cardBorder, borderRadius: 16, padding: '12px 14px', boxShadow: C.shadowSm, display: 'flex', alignItems: 'center', gap: 10, opacity: checked ? 0.55 : 1, transition: 'opacity 0.2s' }}>
                      <div
                        onClick={() => canCheck && toggleItem(item)}
                        style={{ width: 24, height: 24, borderRadius: 8, border: `2px solid ${checked ? C.sageDark : C.creamDark}`, background: checked ? C.sage : 'var(--tm-card-bg)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canCheck ? 'pointer' : 'default', transition: 'all 0.2s', opacity: canCheck ? 1 : 0.4 }}>
                        {checked && <span style={{ color: 'white', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                      </div>
                      <div onClick={() => canCheck && toggleItem(item)} style={{ flex: 1, minWidth: 0, cursor: canCheck ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: C.bark, margin: 0, textDecoration: checked ? 'line-through' : 'none', flex: 1 }}>{displayText}</p>
                        <span className={sectionType === 'global' ? 'tm-packing-chip-global' : sectionType === 'assigned' ? 'tm-packing-chip-assigned' : 'tm-packing-chip-personal'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: chipBg, color: 'white', borderRadius: 8, padding: '3px 8px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                          {chipIcon}{chipLabel}
                        </span>
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
                };

                const SectionHeader = ({ icon, title, badge }: { icon: React.ReactNode; title: string; badge?: React.ReactNode }) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '14px 0 6px' }}>
                    <span style={{ fontSize: 13, color: C.barkLight, display: 'flex', alignItems: 'center' }}>{icon}</span>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.barkLight, margin: 0 }}>{title}</p>
                    {badge}
                  </div>
                );

                return (
                  <>
                    {viewItems.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '32px 0', color: C.barkLight }}>
                        <p style={{ fontSize: 28, margin: '0 0 8px' }}><FontAwesomeIcon icon={faSuitcase} /></p>
                        <p style={{ fontSize: 13, margin: 0 }}>尚無行李項目</p>
                      </div>
                    )}

                    {/* ① 個人專屬 */}
                    {vPersonal.length > 0 && (
                      <>
                        <SectionHeader icon={<FontAwesomeIcon icon={faUser} style={{ fontSize: 12 }} />} title={tabMemberUid === googleUid ? '我的清單' : `${packingTab} 的清單`} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, border: `1.5px solid ${C.sageDark}`, borderRadius: 16, padding: '10px 10px' }}>
                          {vPersonal.map(item => renderPackingItem(item, 'personal'))}
                        </div>
                      </>
                    )}

                    {/* ② 任務指派 */}
                    {vAssigned.length > 0 && (
                      <>
                        <SectionHeader icon={<FontAwesomeIcon icon={faUserTag} style={{ fontSize: 12 }} />} title="任務指派" />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {vAssigned.map(item => renderPackingItem(item, 'assigned'))}
                        </div>
                      </>
                    )}

                    {/* ③ 全體公用 */}
                    {vGlobal.length > 0 && (
                      <>
                        <SectionHeader icon={<FontAwesomeIcon icon={faUsers} style={{ fontSize: 12 }} />} title="全體公用" badge={
                          <span className="tm-packing-global-badge" style={{ background: '#D8EDF8', color: '#1A5276', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}><FontAwesomeIcon icon={faUsers} style={{ fontSize: 9 }} /> 全員</span>
                        } />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {vGlobal.map((item: any) => {
                            const gChecked = isReadOnly ? false : isPackingCheckedFor(item, tabMemberUid);
                            const gCanCheck = !isReadOnly && canCheckPacking(item);
                            const gText = (isGlobalPackingItem(item) && googleUid) ? (item.textOverrides?.[googleUid] || item.text) : item.text;
                            return (
                              <div key={item.id} className="tm-packing-global-card" style={{ background: '#F0F9FF', border: '1.5px solid #DBEAFE', borderRadius: 16, padding: '12px 14px', boxShadow: C.shadowSm, display: 'flex', alignItems: 'center', gap: 10, opacity: gChecked ? 0.55 : 1, transition: 'opacity 0.2s' }}>
                                <div onClick={() => gCanCheck && toggleItem(item)}
                                  style={{ width: 24, height: 24, borderRadius: 8, border: `2px solid ${gChecked ? C.sageDark : C.creamDark}`, background: gChecked ? C.sage : 'var(--tm-card-bg)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: gCanCheck ? 'pointer' : 'default', transition: 'all 0.2s', opacity: gCanCheck ? 1 : 0.4 }}>
                                  {gChecked && <span style={{ color: 'white', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                                </div>
                                <div onClick={() => gCanCheck && toggleItem(item)} style={{ flex: 1, minWidth: 0, cursor: gCanCheck ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <p style={{ fontSize: 13, fontWeight: 600, color: C.bark, margin: 0, textDecoration: gChecked ? 'line-through' : 'none', flex: 1 }}>{gText}</p>
                                  <span className="tm-packing-chip-global" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#6B7280', color: 'white', borderRadius: 8, padding: '3px 8px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                                    <FontAwesomeIcon icon={faUsers} style={{ fontSize: 9 }} />全員
                                  </span>
                                </div>
                                {!isReadOnly && (canDeleteItem(item) || isGlobalPackingItem(item)) && (
                                  <button onClick={e => { e.stopPropagation(); openEdit(item); }}
                                    style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', fontSize: 11, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.barkLight }}>
                                    <FontAwesomeIcon icon={faPen} />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {/* 新增按鈕：擁有者 或 已綁定的編輯者（自己的 tab） */}
                    {!isReadOnly && (isOwner || googleUid === tabMemberUid) && (
                      <button
                        onClick={() => {
                          setEditTarget(null);
                          setForm({ ...EMPTY_FORM, listType: 'packing', assignedTo: isOwner ? 'all' : (myMemberName || 'all') });
                          setShowSheet(true);
                        }}
                        style={{ marginTop: 12, width: '100%', padding: '11px 14px', borderRadius: 14, border: `2px dashed ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box' as const }}>
                        <span style={{ fontSize: 16 }}>＋</span>新增行李項目
                      </button>
                    )}
                  </>
                );
              }

              // ── 待辦：渲染（未完成 + 獨立已完成區塊） ───────────────────
              const filtered = applyFilter(s.items);
              const activeTodos   = filtered.filter((item: any) => !isTodoChecked(item));
              const completedTodos = filtered.filter((item: any) => isTodoChecked(item));

              const renderTodoCard = (item: any) => {
                const checked = isTodoChecked(item);
                const canCheck = canCheckTodo(item);
                const assignedMember = members.find((m: any) => m.name === item.assignedTo);
                const isMyTodo = assignedMember?.googleUid === googleUid;
                const badgeBg = item.assignedTo === 'all' || !item.assignedTo ? '#C8E6C0' : (assignedMember?.color || '#D0C8BE');
                const badgeLabel = item.assignedTo === 'all' || !item.assignedTo ? '全體' : (item.assignedTo || '—');
                const status = getDueStatus(item.dueDate, checked);
                const cardBg = checked ? 'var(--tm-card-bg)' : status === 'overdue' ? '#FFE4E1' : status === 'soon' ? '#FFF2E0' : 'var(--tm-card-bg)';
                const cardBorder = checked ? `1.5px solid ${C.creamDark}` : status === 'overdue' ? '1.5px solid #E57373' : status === 'soon' ? '1.5px solid #FFA726' : isMyTodo ? `1.5px solid ${C.sageDark}` : '1.5px solid transparent';
                const showEdit = canDeleteItem(item);
                return (
                  <div key={item.id}
                    className={!checked ? (status === 'overdue' ? 'tm-todo-overdue-card' : status === 'soon' ? 'tm-todo-soon-card' : '') : ''}
                    style={{ background: cardBg, border: cardBorder, borderRadius: 16, padding: '12px 14px', boxShadow: C.shadowSm, display: 'flex', alignItems: 'center', gap: 10, opacity: checked ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                    <div
                      onClick={() => canCheck && toggleItem(item)}
                      style={{ width: 24, height: 24, borderRadius: 8, border: `2px solid ${checked ? C.sageDark : C.creamDark}`, background: checked ? C.sage : 'var(--tm-card-bg)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canCheck ? 'pointer' : 'default', transition: 'all 0.2s', opacity: canCheck ? 1 : 0.4 }}>
                      {checked && <span style={{ color: 'white', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                    </div>
                    <div onClick={() => canCheck && toggleItem(item)} style={{ flex: 1, minWidth: 0, cursor: canCheck ? 'pointer' : 'default' }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: C.bark, margin: 0, textDecoration: checked ? 'line-through' : 'none' }}>{item.text}</p>
                      {!checked && item.dueDate && (
                        <p className={status === 'overdue' ? 'tm-todo-date-overdue' : status === 'soon' ? 'tm-todo-date-soon' : ''} style={{ fontSize: 10, color: status === 'overdue' ? '#C0392B' : status === 'soon' ? '#E65100' : C.barkLight, fontWeight: status !== 'normal' ? 700 : 500, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 3 }}>
                          {status === 'overdue' ? <><FontAwesomeIcon icon={faCircleExclamation} style={{ fontSize: 9 }} /> 已逾期：</> : status === 'soon' ? <><FontAwesomeIcon icon={faClock} style={{ fontSize: 9 }} /> 即將到期：</> : '截止：'}{item.dueDate}
                        </p>
                      )}
                    </div>
                    <div className={item.assignedTo === 'all' || !item.assignedTo ? 'tm-todo-badge-all' : 'tm-todo-badge-member'} style={{ background: badgeBg, borderRadius: 8, padding: '3px 8px', fontSize: 10, fontWeight: 700, color: '#3A2E24', flexShrink: 0, minWidth: 28, textAlign: 'center' }}>
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
              };

              return (
                <>
                  {filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: C.barkLight }}>
                      <p style={{ fontSize: 28, margin: '0 0 8px', color: C.barkLight }}><FontAwesomeIcon icon={faSquareCheck} /></p>
                      <p style={{ fontSize: 13, margin: 0 }}>尚無待辦項目，點下方 ＋ 新增</p>
                    </div>
                  ) : (
                    <>
                      {/* 未完成項目 */}
                      {activeTodos.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {activeTodos.map(renderTodoCard)}
                        </div>
                      )}
                      {/* 已完成獨立區塊 */}
                      {completedTodos.length > 0 && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: `${activeTodos.length > 0 ? 14 : 0}px 0 8px` }}>
                            <div style={{ flex: 1, height: 1, background: C.creamDark }} />
                            <span style={{ fontSize: 11, color: C.barkLight, fontWeight: 600, whiteSpace: 'nowrap' }}>
                              <FontAwesomeIcon icon={faSquareCheck} style={{ fontSize: 10, marginRight: 4 }} />已完成 {completedTodos.length}
                            </span>
                            <div style={{ flex: 1, height: 1, background: C.creamDark }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {completedTodos.map(renderTodoCard)}
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {/* 新增按鈕：待辦需已綁定才能新增（編輯者未綁不可加） */}
                  {!isReadOnly && !isEditorUnbound && (
                    <button onClick={() => openAdd('todo')}
                      style={{ marginTop: 12, width: '100%', padding: '11px 14px', borderRadius: 14, border: `2px dashed ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box' as const }}>
                      <span style={{ fontSize: 16 }}>＋</span>新增待辦項目
                    </button>
                  )}
                  {isEditorUnbound && !isReadOnly && (
                    <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 12, background: 'var(--tm-note-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FontAwesomeIcon icon={faLock} className="tm-editor-unbound-text" style={{ fontSize: 12, color: '#9A6800' }} />
                      <p className="tm-editor-unbound-text" style={{ fontSize: 12, color: '#9A6800', fontWeight: 600, margin: 0 }}>請先至成員頁綁定 Google 帳號才能新增待辦</p>
                    </div>
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
