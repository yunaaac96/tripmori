import { useState, useRef, useEffect } from 'react';
import { C, FONT } from '../../App';
import PageHeader from '../../components/layout/PageHeader';
import CropModal from '../../components/CropModal';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth } from '../../config/firebase';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getDoc, setDoc, arrayRemove, updateDoc as _updateDoc, doc as _doc } from 'firebase/firestore';
import { makeCollabKey, saveProject } from '../ProjectHub/index';

const PRESET_COLORS = ['#ebcef5','#aaa9ab','#E0F0D8','#A8CADF','#FFF2CC','#FAE0E0','#E8C96A','#D8EDF8'];
const PRESET_ROLES  = ['行程規劃','交通達人','美食搜查','攝影師','財務長','旅伴'];
const EMPTY_FORM    = { name: '', role: '', color: PRESET_COLORS[0], avatarUrl: '' };
const LS_USER_KEY   = 'tripmori_current_user';

// Note card color palette for sticky notes
const NOTE_COLORS = ['var(--tm-note-1)', 'var(--tm-note-2)', 'var(--tm-note-3)', 'var(--tm-note-4)', 'var(--tm-note-5)', 'var(--tm-note-6)'];

export default function MembersPage({ members, memberNotes, project, firestore }: any) {
  const { db, TRIP_ID, Timestamp, addDoc, deleteDoc, updateDoc, collection, doc, isReadOnly } = firestore;

  const [showAdd, setShowAdd]           = useState(false);
  const [editTarget, setEditTarget]     = useState<any | null>(null);
  const [form, setForm]                 = useState({ ...EMPTY_FORM });
  const [saving, setSaving]             = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  // Identity: who is the current user? Stored in localStorage
  const [currentUser, setCurrentUser]   = useState<string>(() => localStorage.getItem(LS_USER_KEY) || '');
  const [copied, setCopied]             = useState<string | null>(null);
  const [googleUid, setGoogleUid]       = useState<string | null>(null);
  const [googleEmail, setGoogleEmail]   = useState<string | null>(null);
  const [signingIn, setSigningIn]       = useState(false);
  const [authError, setAuthError]       = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user && !user.isAnonymous) {
        setGoogleUid(user.uid);
        setGoogleEmail(user.email);
      } else {
        setGoogleUid(null);
        setGoogleEmail(null);
      }
    });
    return unsub;
  }, []);

  // Auto-detect identity from Google binding
  useEffect(() => {
    if (!googleUid || members.length === 0) return;
    const bound = members.find((m: any) => m.googleUid === googleUid);
    if (bound && bound.name !== currentUser) {
      localStorage.setItem(LS_USER_KEY, bound.name);
      setCurrentUser(bound.name);
    }
  }, [googleUid, members]);

  const handleCopy = (text: string, key: string) => {
    const done = () => { setCopied(key); setTimeout(() => setCopied(null), 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch {}
        document.body.removeChild(ta);
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch {}
      document.body.removeChild(ta);
    }
  };

  // 統一用 signInWithPopup，同步呼叫可相容 iOS Safari，避免 redirect sessionStorage 問題
  const handleGoogleSignIn = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
      .then(result => {
        setGoogleUid(result.user.uid);
        setGoogleEmail(result.user.email);
        setSigningIn(false);
        setAuthError(null);
      })
      .catch((e: any) => {
        if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
          console.error('popup error:', e);
          setAuthError(`登入失敗：${e.code || e.message}`);
        }
        setSigningIn(false);
      });
    setSigningIn(true);
    setAuthError(null);
  };

  // Note input state per member
  const [noteInput, setNoteInput]       = useState<Record<string, string>>({});
  const [noteVis, setNoteVis]           = useState<Record<string, 'public' | 'private'>>({});
  const [expandedBoard, setExpandedBoard] = useState<string | null>(null);
  const [savingNote, setSavingNote]     = useState<string | null>(null);

  // Crop modal state
  const [cropFile, setCropFile]         = useState<File | null>(null);
  const [cropTarget, setCropTarget]     = useState<'new' | string>('new');

  const fileNewRef         = useRef<HTMLInputElement>(null);
  const fileExistingRef    = useRef<HTMLInputElement>(null);
  const existingMemberId   = useRef<string>('');
  const nameInputRef       = useRef<HTMLInputElement>(null);

  const isEdit    = !!editTarget;
  const showSheet = showAdd || isEdit;

  useEffect(() => {
    if (!showSheet) return;
    const t = setTimeout(() => nameInputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [showSheet]);

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  // ── Avatar upload ────────────────────────────────────────────
  const uploadBlob = async (blob: Blob, path: string): Promise<string> => {
    const storage = getStorage();
    const sRef    = storageRef(storage, path);
    await uploadBytes(sRef, blob);
    return getDownloadURL(sRef);
  };

  const handleCropDone = async (blob: Blob) => {
    setCropFile(null);
    if (cropTarget === 'new') {
      setUploadingFor('new');
      try {
        const url = await uploadBlob(blob, `avatars/${TRIP_ID}/new_${Date.now()}`);
        set('avatarUrl', url);
      } catch (e) { console.error(e); alert('頭像上傳失敗'); }
      setUploadingFor(null);
    } else {
      const memberId = cropTarget;
      setUploadingFor(memberId);
      try {
        const url = await uploadBlob(blob, `avatars/${TRIP_ID}/${memberId}_${Date.now()}`);
        await updateDoc(doc(db, 'trips', TRIP_ID, 'members', memberId), { avatarUrl: url });
      } catch (e) { console.error(e); alert('頭像上傳失敗'); }
      setUploadingFor(null);
    }
  };

  // ── Member CRUD ───────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'trips', TRIP_ID, 'members'), {
        name: form.name.trim(), role: form.role || '旅伴',
        color: form.color, avatarUrl: form.avatarUrl || '',
        createdAt: new Date().toISOString(),
      });
      setForm({ ...EMPTY_FORM }); setShowAdd(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleEditSave = async () => {
    if (!editTarget || !form.name.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'trips', TRIP_ID, 'members', editTarget.id), {
        name: form.name.trim(), role: form.role || '旅伴', color: form.color,
      });
      setEditTarget(null); setForm({ ...EMPTY_FORM });
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const openEdit = (m: any) => {
    const role = firestore.role;
    // Editor can only edit their own card (matched by googleUid)
    if (role === 'editor' && googleUid && m.googleUid !== googleUid) return;
    if (firestore.isReadOnly) return;
    setEditTarget(m);
    setForm({ name: m.name, role: m.role || '', color: m.color || PRESET_COLORS[0], avatarUrl: m.avatarUrl || '' });
    setShowAdd(false);
  };

  const handleDeleteMember = async (memberId: string, memberName: string) => {
    if (firestore.role !== 'owner') return;
    if (!window.confirm(`確定要刪除成員「${memberName}」？此操作無法復原。`)) return;
    try { await deleteDoc(doc(db, 'trips', TRIP_ID, 'members', memberId)); }
    catch (e) { console.error(e); }
  };

  const handleBindGoogle = async (memberId: string) => {
    if (!googleUid) return;
    try {
      await updateDoc(doc(db, 'trips', TRIP_ID, 'members', memberId), { googleUid, googleEmail: googleEmail || '' });
    } catch (e) { console.error(e); }
  };

  const handleUnbindGoogle = async (memberId: string) => {
    if (!window.confirm('確定要解除此成員的 Google 帳號綁定嗎？')) return;
    try {
      await updateDoc(doc(db, 'trips', TRIP_ID, 'members', memberId), { googleUid: '', googleEmail: '' });
    } catch (e) { console.error(e); }
  };

  // ── Notes (message board) ─────────────────────────────────────
  // Private notes: only visible to the note author or the card owner
  const getNotesFor = (memberId: string, memberGoogleUid?: string | null) =>
    (memberNotes || [])
      .filter((n: any) => {
        if (n.memberId !== memberId) return false;
        if (n.visibility !== 'private') return true; // public: all see it
        // private: only the author or the person whose card it is
        if (n.authorName === currentUser) return true;
        if (googleUid && memberGoogleUid && memberGoogleUid === googleUid) return true;
        return false;
      })
      .sort((a: any, b: any) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });

  const handleAddNote = async (memberId: string) => {
    const content = (noteInput[memberId] || '').trim();
    if (!content || !currentUser) return;
    setSavingNote(memberId);
    try {
      await addDoc(collection(db, 'trips', TRIP_ID, 'memberNotes'), {
        memberId,
        authorName: currentUser,
        content,
        visibility: noteVis[memberId] || 'public',
        createdAt: Timestamp.now(),
      });
      setNoteInput(p => ({ ...p, [memberId]: '' }));
    } catch (e) { console.error(e); }
    setSavingNote(null);
  };

  const handleDeleteNote = async (noteId: string) => {
    try { await deleteDoc(doc(db, 'trips', TRIP_ID, 'memberNotes', noteId)); }
    catch (e) { console.error(e); }
  };

  // ── Editor revocation + collaboratorKey (owner only) ────────
  const [allowedEditorUids, setAllowedEditorUids] = useState<string[]>([]);
  const [editorInfo, setEditorInfo]               = useState<Record<string, { email: string; joinedAt: number }>>({});
  const [firestoreCollaboratorKey, setFirestoreCollaboratorKey] = useState<string>('');

  useEffect(() => {
    if (!TRIP_ID || firestore.role !== 'owner') return;
    getDoc(_doc(db, 'trips', TRIP_ID)).then(async (snap: any) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setAllowedEditorUids(data.allowedEditorUids || []);
      setEditorInfo(data.editorInfo || {});
      const existing = data.collaboratorKey;
      if (existing) {
        setFirestoreCollaboratorKey(existing);
        if (project && !project.collaboratorKey) {
          saveProject({ ...project, collaboratorKey: existing });
        }
      } else {
        const newKey = makeCollabKey(TRIP_ID);
        try {
          await _updateDoc(_doc(db, 'trips', TRIP_ID), { collaboratorKey: newKey });
          setFirestoreCollaboratorKey(newKey);
          if (project) saveProject({ ...project, collaboratorKey: newKey });
        } catch (e) { console.error('Failed to write collaboratorKey', e); }
      }
    }).catch(() => {});
  }, [TRIP_ID, firestore.role]);

  const handleRevokeEditor = async (uid: string) => {
    if (!window.confirm('確定要移除此編輯者的權限？對方將立即降級為訪客。')) return;
    try {
      const { deleteField } = require('firebase/firestore') as any;
      await _updateDoc(_doc(db, 'trips', TRIP_ID), {
        allowedEditorUids: arrayRemove(uid),
        [`editorInfo.${uid}`]: deleteField(),
      });
      setAllowedEditorUids(prev => prev.filter(u => u !== uid));
      setEditorInfo(prev => { const n = { ...prev }; delete n[uid]; return n; });
    } catch (e) { console.error(e); alert('操作失敗，請重試'); }
  };

  // ── Project name (editable by owner, writes back to trip title) ──
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [teamNameInput, setTeamNameInput] = useState('');

  const handleSaveTeamName = async () => {
    const val = teamNameInput.trim();
    if (!val) { setEditingTeamName(false); return; }
    try {
      await updateDoc(doc(db, 'trips', TRIP_ID), { title: val });
    } catch (e) { console.error(e); }
    setEditingTeamName(false);
  };

  const displayMembers = members.length > 0 ? members : [
    { id: 'uu',    name: 'uu',    color: '#ebcef5', role: '行程規劃', avatarUrl: '' },
    { id: 'brian', name: 'brian', color: '#aaa9ab', role: '交通達人', avatarUrl: '' },
  ];

  const memberNames = displayMembers.map((m: any) => m.name);

  const startDate       = project?.startDate || '';
  const displayTeamName = project?.title || '旅行';
  const defaultTeamName = displayTeamName;

  // Dynamic group label by member count
  const groupLabel = (n: number) =>
    n <= 2 ? '小隊' : n <= 4 ? '小組' : '旅行團';

  // Build subtitle: "2026.04 沖繩之旅・2人小隊"
  const headerSubtitle = `${displayTeamName}・${displayMembers.length}人${groupLabel(displayMembers.length)}`;

  // Start label and trip days for stats panel
  const startLabel = startDate
    ? `${new Date(startDate).getMonth() + 1}/${new Date(startDate).getDate()}`
    : '—';
  const endDate = project?.endDate || '';
  const tripDays = startDate && endDate
    ? Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1
    : 0;

  return (
    <div style={{ fontFamily: FONT }}>

      {/* Crop modal */}
      {cropFile && (
        <CropModal file={cropFile} onCrop={handleCropDone} onCancel={() => setCropFile(null)} />
      )}

      {/* Hidden file inputs */}
      <input ref={fileNewRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) { setCropTarget('new'); setCropFile(f); }
          e.target.value = '';
        }} />
      <input ref={fileExistingRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) { setCropTarget(existingMemberId.current); setCropFile(f); }
          e.target.value = '';
        }} />

      {/* ── 底部面板 ── */}
      {showSheet && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowAdd(false); setEditTarget(null); } }}
        >
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '88vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>
                {isEdit ? '✏️ 編輯成員' : '➕ 新增旅伴'}
              </p>
              <button onClick={() => { setShowAdd(false); setEditTarget(null); }}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!isEdit && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 72, height: 72, borderRadius: '50%', background: form.color, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '3px solid white', boxShadow: '0 2px 10px rgba(107,92,78,0.18)' }}>
                    {form.avatarUrl
                      ? <img src={form.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 28, fontWeight: 700, color: C.bark }}>{form.name?.[0]?.toUpperCase() || '?'}</span>
                    }
                  </div>
                  <button onClick={() => fileNewRef.current?.click()} disabled={uploadingFor === 'new'}
                    style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                    {uploadingFor === 'new' ? '上傳中...' : '📷 選擇頭像（可裁切）'}
                  </button>
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>姓名 *</label>
                <input ref={nameInputRef} value={form.name} onChange={e => set('name', e.target.value)} placeholder="旅伴名稱"
                  style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${C.creamDark}`, borderRadius: 10, padding: '10px 12px', fontSize: 16, fontFamily: FONT, outline: 'none', color: C.bark, background: 'var(--tm-input-bg)' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>身份 / 角色</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {PRESET_ROLES.map(r => (
                    <button key={r} onClick={() => set('role', r)}
                      style={{ padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${form.role === r ? C.sageDark : C.creamDark}`, background: form.role === r ? C.sage : 'var(--tm-card-bg)', color: form.role === r ? 'white' : C.bark, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                      {r}
                    </button>
                  ))}
                </div>
                <input value={form.role} onChange={e => set('role', e.target.value)} placeholder="或自訂角色..."
                  style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${C.creamDark}`, borderRadius: 10, padding: '8px 12px', fontSize: 16, fontFamily: FONT, outline: 'none', color: C.bark, background: 'var(--tm-input-bg)' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>標籤顏色</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {PRESET_COLORS.map(c => (
                    <div key={c} onClick={() => set('color', c)}
                      style={{ width: 32, height: 32, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? `3px solid ${C.bark}` : '3px solid transparent', boxShadow: form.color === c ? '0 0 0 2px white inset' : 'none', transition: 'all 0.15s' }} />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => { setShowAdd(false); setEditTarget(null); }}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>取消</button>
                <button onClick={isEdit ? handleEditSave : handleAdd} disabled={saving || !form.name.trim()}
                  style={{ flex: 2, padding: 12, borderRadius: 12, border: 'none', background: form.name.trim() ? C.earth : C.creamDark, color: 'white', fontWeight: 700, fontSize: 14, cursor: form.name.trim() ? 'pointer' : 'default', fontFamily: FONT, opacity: saving ? 0.7 : 1 }}>
                  {saving ? '儲存中...' : isEdit ? '✓ 儲存' : '➕ 新增'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="旅伴"
        subtitle={headerSubtitle}
        subtitleAction={firestore.role === 'owner' && !editingTeamName ? (
          <button
            onClick={() => { setTeamNameInput(displayTeamName); setEditingTeamName(true); }}
            style={{ background: 'none', border: 'none', padding: '0 2px', fontSize: 13, cursor: 'pointer', lineHeight: 1, color: 'rgba(255,255,255,0.85)' }}
          >✏️</button>
        ) : undefined}
        emoji="👥"
        color={C.earth}
      >
        {editingTeamName && (
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <input
              autoFocus
              value={teamNameInput}
              onChange={e => setTeamNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTeamName(); if (e.key === 'Escape') setEditingTeamName(false); }}
              placeholder={defaultTeamName}
              style={{ flex: 1, padding: '6px 10px', borderRadius: 10, border: 'none', fontSize: 14, fontFamily: FONT, outline: 'none', background: 'rgba(255,255,255,0.25)', color: 'white' }}
            />
            <button onClick={handleSaveTeamName} style={{ padding: '6px 12px', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.3)', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>✓</button>
            <button onClick={() => setEditingTeamName(false)} style={{ padding: '6px 10px', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>✕</button>
          </div>
        )}
      </PageHeader>

      {/* Copy toast */}
      {copied && (
        <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#3A5A3A', color: 'white', borderRadius: 24, padding: '10px 22px', fontSize: 13, fontWeight: 700, zIndex: 500, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', whiteSpace: 'nowrap', fontFamily: FONT }}>
          ✅ 已複製，快去分享給朋友吧！
        </div>
      )}

      {/* Share project keys (Owner only) */}
      {project?.role === 'owner' && (
        <div style={{ margin: '12px 16px 0', background: 'var(--tm-card-bg)', borderRadius: 16, padding: '14px 16px', boxShadow: C.shadowSm }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>🔑 分享此旅行</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* 協作金鑰 — tap to copy */}
            <div onClick={() => handleCopy(firestoreCollaboratorKey || project?.collaboratorKey || '', 'collab')}
              className={copied === 'collab' ? '' : 'tm-collab-key-bg'}
              style={{ background: copied === 'collab' ? '#E0F0D8' : undefined, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', transition: 'background 0.2s', userSelect: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <p className={copied === 'collab' ? '' : 'tm-collab-key-label'} style={{ fontSize: 10, fontWeight: 700, color: copied === 'collab' ? '#4A7A35' : undefined, margin: 0 }}>協作金鑰（編輯者）</p>
                <span className={copied === 'collab' ? '' : 'tm-collab-key-label'} style={{ fontSize: 10, color: copied === 'collab' ? '#4A7A35' : undefined, fontWeight: 700 }}>{copied === 'collab' ? '✅ 已複製' : '點擊複製 📋'}</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: 0, letterSpacing: 1, fontFamily: 'monospace' }}>{firestoreCollaboratorKey || project?.collaboratorKey || '—'}</p>
              <p style={{ fontSize: 10, color: C.barkLight, margin: '3px 0 0' }}>分享此金鑰，對方可以共同編輯行程</p>
            </div>
            {/* 訪客連結 — tap to copy */}
            <div onClick={() => handleCopy(`${window.location.origin}/?visit=${project.id}`, 'visit')}
              className={copied === 'visit' ? '' : 'tm-visitor-link-bg'}
              style={{ background: copied === 'visit' ? '#E0F0D8' : undefined, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', transition: 'background 0.2s', userSelect: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <p className={copied === 'visit' ? '' : 'tm-visitor-link-label'} style={{ fontSize: 10, fontWeight: 700, color: copied === 'visit' ? '#4A7A35' : undefined, margin: 0 }}>訪客連結（唯讀瀏覽）</p>
                <span className={copied === 'visit' ? '' : 'tm-visitor-link-label'} style={{ fontSize: 10, color: copied === 'visit' ? '#4A7A35' : undefined, fontWeight: 700 }}>{copied === 'visit' ? '✅ 已複製' : '點擊複製 📋'}</span>
              </div>
              <p style={{ fontSize: 12, fontWeight: 600, color: C.bark, margin: 0 }}>訪客專屬分享連結</p>
              <p style={{ fontSize: 10, color: C.barkLight, margin: '3px 0 0' }}>對方點擊連結即可直接瀏覽行程（無需登入或輸入代碼）</p>
            </div>
          </div>
        </div>
      )}

      {/* Editor list management (Owner only) */}
      {firestore.role === 'owner' && allowedEditorUids.length > 0 && (
        <div style={{ margin: '12px 16px 0', background: 'var(--tm-card-bg)', borderRadius: 16, padding: '14px 16px', boxShadow: C.shadowSm }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '0 0 10px' }}>✏️ 編輯者名單</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {allowedEditorUids.map(uid => {
              const info = editorInfo[uid];
              // Try to find member card bound to this uid
              const boundMember = members.find((m: any) => m.googleUid === uid);
              const displayName = boundMember?.name || info?.email || uid.slice(0, 12) + '…';
              const displaySub  = boundMember ? (info?.email || '') : (info?.email || '');
              const joinDate    = info?.joinedAt
                ? new Date(info.joinedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
                : '';
              return (
                <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--tm-input-bg)', borderRadius: 12, border: `1px solid ${C.creamDark}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: boundMember?.color || '#D8EDF8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: C.bark, flexShrink: 0 }}>
                    {(boundMember?.name || displayName)[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</p>
                    {(displaySub || joinDate) && (
                      <p style={{ fontSize: 10, color: C.barkLight, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displaySub}{displaySub && joinDate ? '・' : ''}{joinDate ? `加入 ${joinDate}` : ''}
                      </p>
                    )}
                  </div>
                  <button onClick={() => handleRevokeEditor(uid)}
                    style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 10, border: '1px solid #E8C96A', background: '#FFF8E1', color: '#9A6800', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                    降級訪客
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Google sign-in card (shown when not yet signed in with Google) */}
      {!googleUid && !firestore.isReadOnly && (
        <div style={{ margin: '12px 16px 0', background: 'var(--tm-card-bg)', borderRadius: 16, padding: '12px 14px', boxShadow: C.shadowSm, border: '1.5px solid #EDE8D5' }}>
          <p style={{ fontSize: 12, color: C.barkLight, margin: '0 0 8px', fontWeight: 600 }}>
            🔐 登入 Google 後可綁定成員卡，以自己的身份留言
          </p>
          <button onClick={handleGoogleSignIn} disabled={signingIn}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #E0D9C8', background: signingIn ? '#F5F5F5' : 'var(--tm-card-bg)', cursor: signingIn ? 'default' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', boxShadow: C.shadowSm, opacity: signingIn ? 0.6 : 1 }}>
            <span style={{ fontSize: 16 }}>G</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1C3461' }}>{signingIn ? '登入中...' : '使用 Google 帳號登入'}</span>
          </button>
          {authError && (
            <p style={{ fontSize: 11, color: '#C0392B', margin: '6px 0 0', fontWeight: 600 }}>{authError}</p>
          )}
        </div>
      )}
      {googleUid && (
        <div style={{ margin: '12px 16px 0', background: '#E0F0D8', borderRadius: 16, padding: '10px 14px', border: '1.5px solid #C2E0B4', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>✅</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#4A7A35', margin: 0 }}>已登入 Google</p>
            <p style={{ fontSize: 11, color: '#6A8F5C', margin: '1px 0 0' }}>{googleEmail}</p>
          </div>
          <button onClick={() => signOut(auth).catch(console.error)}
            style={{ fontSize: 11, color: '#9A3A3A', background: '#FAE0E0', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: FONT, fontWeight: 600, flexShrink: 0 }}>
            登出
          </button>
        </div>
      )}

      {/* Member cards + note boards */}
      <div style={{ padding: '12px 16px 80px' }}>
        {firestore.isReadOnly ? (
          /* Visitor lock screen */
          <div style={{ textAlign: 'center', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 52 }}>🔒</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: C.bark, margin: 0 }}>成員資訊僅限協作者查看</p>
            <p style={{ fontSize: 13, color: C.barkLight, margin: 0, lineHeight: 1.7 }}>
              請聯繫行程擁有者取得協作金鑰，<br />即可以編輯者身份加入並查看所有成員資訊
            </p>
          </div>
        ) : (
          <>
          {/* ── Owner-only: Google binding summary ── */}
          {firestore.role === 'owner' && members.length > 0 && (
            <div style={{ background: 'var(--tm-card-bg)', borderRadius: 16, padding: '12px 16px', marginBottom: 14, border: '1.5px solid #C2E0B4', boxShadow: C.shadowSm }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#4A7A35', margin: '0 0 8px' }}>🔐 帳號綁定總覽（擁有者）</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {members.map((m: any) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.color || C.sageLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: C.bark, flexShrink: 0, overflow: 'hidden' }}>
                      {m.avatarUrl
                        ? <img src={m.avatarUrl} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : m.name?.[0]?.toUpperCase()
                      }
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.bark, minWidth: 60 }}>{m.name}</span>
                    {m.googleEmail
                      ? <span style={{ fontSize: 11, color: '#2A6A9A', background: '#D8EDF8', borderRadius: 8, padding: '2px 8px', fontWeight: 600 }}>📧 {m.googleEmail}</span>
                      : <span style={{ fontSize: 11, color: '#9A8A7A', background: '#F5F5F5', borderRadius: 8, padding: '2px 8px' }}>尚未綁定</span>
                    }
                  </div>
                ))}
              </div>
            </div>
          )}
          {displayMembers.map((m: any) => {
          const isUploading  = uploadingFor === m.id;
          const notes        = getNotesFor(m.id, m.googleUid);
          const isExpanded   = expandedBoard === m.id;
          const isSavingNote = savingNote === m.id;
          const colorIdx     = displayMembers.indexOf(m) % NOTE_COLORS.length;

          const canEdit = firestore.role === 'owner' || (firestore.role === 'editor' && googleUid && m.googleUid === googleUid);
          const isMyCard = googleUid && m.googleUid === googleUid;
          // 一個 Google 帳號只能綁定一張成員卡
          const alreadyBound = members.some((mem: any) => mem.googleUid === googleUid);
          const canBind = googleUid && !m.googleUid && !firestore.isReadOnly && !alreadyBound;

          return (
            <div key={m.id} style={{ marginBottom: 16 }}>
              {/* Member info card */}
              <div style={{ background: 'var(--tm-card-bg)', borderRadius: '20px 20px 0 0', padding: '16px', boxShadow: C.shadowSm, display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
                {canEdit && (
                  <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4 }}>
                    {firestore.role === 'owner' && (
                      <button onClick={() => handleDeleteMember(m.id, m.name)}
                        style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: '#FAE0E0', color: '#9A3A3A', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        🗑
                      </button>
                    )}
                    <button onClick={() => openEdit(m)}
                      style={{ width: 26, height: 26, borderRadius: 8, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      ✏️
                    </button>
                  </div>
                )}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: m.color || C.sageLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: C.bark, border: '3px solid white', boxShadow: '0 2px 8px rgba(107,92,78,0.15)', overflow: 'hidden' }}>
                    {m.avatarUrl
                      ? <img src={m.avatarUrl} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : m.name?.[0]?.toUpperCase()
                    }
                  </div>
                  <div onClick={() => { existingMemberId.current = m.id; fileExistingRef.current?.click(); }}
                    style={{ position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderRadius: '50%', background: C.earth, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                    {isUploading ? '…' : '📷'}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 16, fontWeight: 700, color: C.bark, margin: 0 }}>{m.name}</p>
                    {isMyCard && <span style={{ fontSize: 10, fontWeight: 700, background: '#E0F0D8', color: '#4A7A35', borderRadius: 6, padding: '1px 6px' }}>我</span>}
                    {m.googleUid && !isMyCard && <span style={{ fontSize: 10, fontWeight: 700, background: '#D8EDF8', color: '#2A6A9A', borderRadius: 6, padding: '1px 6px' }}>🔗 已綁定</span>}
                    {!m.googleUid && <span style={{ fontSize: 10, fontWeight: 600, background: '#F5F5F5', color: '#9A8A7A', borderRadius: 6, padding: '1px 6px' }}>未綁定</span>}
                  </div>
                  {/* 擁有者可看到綁定的 Google 帳號 email */}
                  {firestore.role === 'owner' && m.googleEmail && (
                    <p style={{ fontSize: 10, color: '#2A6A9A', margin: '2px 0 0', fontWeight: 600 }}>
                      📧 {m.googleEmail}
                    </p>
                  )}
                  <p style={{ fontSize: 12, color: C.barkLight, margin: '3px 0 0' }}>{m.role || '旅伴'}</p>
                  {canBind && (
                    <button onClick={() => handleBindGoogle(m.id)}
                      style={{ marginTop: 5, fontSize: 11, fontWeight: 700, color: '#4A7A35', background: '#E0F0D8', border: 'none', borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT }}>
                      🔗 綁定為我的成員卡
                    </button>
                  )}
                  {/* 解除綁定：owner 可解除任何人，本人可解除自己 */}
                  {m.googleUid && (firestore.role === 'owner' || isMyCard) && !firestore.isReadOnly && (
                    <button onClick={() => handleUnbindGoogle(m.id)}
                      style={{ marginTop: 4, fontSize: 10, color: '#9A3A3A', background: '#FAE0E0', border: 'none', borderRadius: 8, padding: '2px 8px', cursor: 'pointer', fontFamily: FONT, fontWeight: 600 }}>
                      ✕ 解除綁定
                    </button>
                  )}
                </div>
                {/* Board toggle */}
                <button onClick={() => setExpandedBoard(isExpanded ? null : m.id)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 10px', borderRadius: 12, border: `1.5px solid ${isExpanded ? C.sageDark : C.creamDark}`, background: isExpanded ? C.sageLight : 'var(--tm-card-bg)', cursor: 'pointer', fontFamily: FONT }}>
                  <span style={{ fontSize: 14 }}>📝</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: isExpanded ? C.sageDark : C.barkLight }}>
                    留言{notes.length > 0 ? ` (${notes.length})` : ''}
                  </span>
                </button>
              </div>

              {/* Note board */}
              {isExpanded && (
                <div style={{ background: NOTE_COLORS[colorIdx], borderRadius: '0 0 20px 20px', padding: '14px 16px 16px', boxShadow: C.shadow }}>
                  {/* Existing notes */}
                  {notes.length === 0 ? (
                    <p style={{ fontSize: 12, color: C.barkLight, margin: '0 0 12px', textAlign: 'center', fontStyle: 'italic' }}>還沒有留言，快來貼上第一張便條紙！</p>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                      {notes.map((note: any, ni: number) => {
                        const stickyColor = NOTE_COLORS[(ni + 2) % NOTE_COLORS.length];
                        const isOwn = note.authorName === currentUser;
                        const ts = note.createdAt?.toDate ? note.createdAt.toDate() : null;
                        const timeStr = ts ? `${ts.getMonth()+1}/${ts.getDate()} ${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}` : '';
                        return (
                          <div key={note.id} style={{ background: stickyColor, borderRadius: 12, padding: '10px 12px', minWidth: 130, maxWidth: 180, boxShadow: '2px 2px 6px rgba(107,92,78,0.15)', position: 'relative', flex: '1 1 130px' }}>
                            {/* Visibility badge */}
                            <span style={{ fontSize: 9, fontWeight: 700, color: note.visibility === 'private' ? '#9A3A3A' : '#4A7A35', background: note.visibility === 'private' ? '#FAE0E0' : '#E0F0D8', borderRadius: 6, padding: '2px 6px', display: 'inline-block', marginBottom: 6 }}>
                              {note.visibility === 'private' ? '🔒 私人' : '👥 旅伴'}
                            </span>
                            <p style={{ fontSize: 13, color: C.bark, margin: '0 0 6px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{note.content}</p>
                            <p style={{ fontSize: 10, color: C.barkLight, margin: 0, fontWeight: 600 }}>— {note.authorName} {timeStr}</p>
                            {(isOwn || isMyCard) && (
                              <button onClick={() => handleDeleteNote(note.id)}
                                style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: '50%', background: '#FAE0E0', border: 'none', color: '#9A3A3A', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add note input */}
                  {currentUser ? (
                    <div style={{ background: 'var(--tm-card-bg)', borderRadius: 14, padding: '10px 12px', boxShadow: '0 1px 6px rgba(107,92,78,0.1)' }}>
                      <textarea
                        value={noteInput[m.id] || ''}
                        onChange={e => setNoteInput(p => ({ ...p, [m.id]: e.target.value }))}
                        placeholder={`以 ${currentUser} 身份留言...`}
                        style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', fontSize: 14, fontFamily: FONT, color: C.bark, resize: 'none', minHeight: 60, background: 'transparent', lineHeight: 1.6 }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                        {/* Visibility toggle：旅伴（所有人可見） / 私人（僅自己看） */}
                        <button onClick={() => setNoteVis(p => ({ ...p, [m.id]: p[m.id] === 'private' ? 'public' : 'private' }))}
                          style={{ fontSize: 11, fontWeight: 700, color: noteVis[m.id] === 'private' ? '#9A3A3A' : '#4A7A35', background: noteVis[m.id] === 'private' ? '#FAE0E0' : '#E0F0D8', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: FONT }}>
                          {noteVis[m.id] === 'private' ? '🔒 私人' : '👥 旅伴'}
                        </button>
                        <button
                          onClick={() => handleAddNote(m.id)}
                          disabled={isSavingNote || !(noteInput[m.id] || '').trim()}
                          style={{ padding: '7px 16px', borderRadius: 10, border: 'none', background: C.earth, color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT, opacity: (noteInput[m.id] || '').trim() ? 1 : 0.5 }}>
                          {isSavingNote ? '...' : '貼上 📌'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '10px', borderRadius: 12, background: 'var(--tm-note-1)', color: '#9A6800', fontWeight: 600, fontSize: 12, textAlign: 'center' }}>
                      🔐 請先登入 Google 並綁定成員卡後即可留言
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* 新增成員：owner 不限；editor 只能在尚未綁定前新增一張自己的卡 */}
        {!firestore.isReadOnly && (
          firestore.role === 'owner' ||
          (firestore.role === 'editor' && googleUid && !members.some((m: any) => m.googleUid === googleUid))
        ) && (
          <div
            onClick={() => { setShowAdd(true); setEditTarget(null); setForm({ ...EMPTY_FORM }); }}
            style={{ background: 'var(--tm-card-bg)', borderRadius: 20, padding: '20px 14px', textAlign: 'center', border: `2px dashed ${C.creamDark}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ fontSize: 28, color: C.creamDark }}>＋</span>
            <span style={{ fontSize: 12, color: C.barkLight, fontWeight: 600 }}>新增成員</span>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
