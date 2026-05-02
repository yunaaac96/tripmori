import { useState, useRef, useEffect } from 'react';
import { C, FONT } from '../../App';
import { avatarTextColor } from '../../utils/helpers';
import PageHeader from '../../components/layout/PageHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faTrashCan, faPlus, faCamera, faLock, faKey, faClipboardList, faLink, faUsers, faEnvelope, faNoteSticky, faSquareCheck, faBell, faBellSlash, faBookmark, faCheck, faXmark, faChevronUp, faChevronDown, faArrowUp, faArrowDown, faDownload, faTriangleExclamation, faMobileScreen, faHandshake, faUserShield } from '@fortawesome/free-solid-svg-icons';
import CropModal from '../../components/CropModal';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth } from '../../config/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { useGoogleAuth } from '../../hooks/useAuth';
import { getDoc, setDoc, arrayRemove, arrayUnion, updateDoc as _updateDoc, doc as _doc, deleteField, query, where, getDocs, collection as _collection } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { makeCollabKey, saveProject } from '../ProjectHub/index';
import { enableFcmForMember } from '../../hooks/useFcm';

const PRESET_COLORS = ['#ebcef5','#aaa9ab','#E0F0D8','#A8CADF','#FFF2CC','#FAE0E0','#E8C96A','#D8EDF8'];
const PRESET_ROLES  = ['行程規劃','交通達人','美食搜查','攝影師','財務長','旅伴'];
const EMPTY_FORM    = { name: '', role: '', color: PRESET_COLORS[0], avatarUrl: '' };
const LS_USER_KEY   = 'tripmori_current_user';

// Note card color palette for sticky notes
const NOTE_COLORS = ['var(--tm-note-1)', 'var(--tm-note-2)', 'var(--tm-note-3)', 'var(--tm-note-4)', 'var(--tm-note-5)', 'var(--tm-note-6)'];

export default function MembersPage({ members, memberNotes, proxyGrants = [], project, firestore, pwaInstallAvailable, onPwaInstall }: any) {
  const { db, TRIP_ID, Timestamp, addDoc, deleteDoc, updateDoc, collection, doc, isReadOnly, adminMode } = firestore;

  const [showAdd, setShowAdd]           = useState(false);
  const [editTarget, setEditTarget]     = useState<any | null>(null);
  const [form, setForm]                 = useState({ ...EMPTY_FORM });
  const [saving, setSaving]             = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  // Identity: who is the current user? Stored in localStorage
  const [currentUser, setCurrentUser]   = useState<string>(() => localStorage.getItem(LS_USER_KEY) || '');
  const [copied, setCopied]             = useState<string | null>(null);
  const { uid: googleUid, email: googleEmail } = useGoogleAuth();
  const [signingIn, setSigningIn]       = useState(false);
  const [authError, setAuthError]       = useState<string | null>(null);
  const [bindingSummaryOpen, setBindingSummaryOpen] = useState(false);
  const [editorListOpen, setEditorListOpen]         = useState(false);
  const [proxyGrantOpen, setProxyGrantOpen]         = useState(false);
  const [savingProxy, setSavingProxy]               = useState(false);

  // Notification permission state
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() =>
    'Notification' in window ? Notification.permission : 'default'
  );
  const [fcmSyncing, setFcmSyncing]   = useState(false);
  const [fcmSynced,  setFcmSynced]    = useState(false);

  const handleRequestNotif = async () => {
    setFcmSyncing(true);
    setFcmSynced(false);
    // Find this user's member doc ID so we can register the FCM token
    const boundId = googleUid
      ? members.find((m: any) => m.googleUid === googleUid)?.id ?? null
      : null;
    if (boundId && firestore.TRIP_ID) {
      // enableFcmForMember requests permission AND saves the token to Firestore
      const perm = await enableFcmForMember(firestore.TRIP_ID, boundId);
      setNotifPermission(perm);
      if (perm === 'granted') { setFcmSynced(true); setTimeout(() => setFcmSynced(false), 3000); }
    } else {
      // Not bound yet — just request permission; token will be saved on next bind
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
    }
    setFcmSyncing(false);
  };

  // Notion backup
  const [notionBusy, setNotionBusy]       = useState(false);
  const [notionResult, setNotionResult]   = useState<{ url: string; totalTWD: number } | null>(null);
  const [notionError, setNotionError]     = useState<string | null>(null);
  const handleBackupToNotion = async () => {
    if (!TRIP_ID || notionBusy) return;
    setNotionBusy(true);
    setNotionResult(null);
    setNotionError(null);
    try {
      const fn  = httpsCallable(getFunctions(undefined, 'us-central1'), 'backupTripToNotion');
      const res = await fn({ tripId: TRIP_ID }) as any;
      setNotionResult({ url: res.data.notionUrl, totalTWD: res.data.totalTWD });
    } catch (e: any) {
      setNotionError(e?.message || '備份失敗，請稍後再試');
    }
    setNotionBusy(false);
  };


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
      .then(() => {
        // Shared auth listener (useGoogleAuth) will pick up uid/email automatically
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

  // ── Data cleanup: drop orphan member docs and any references to them ───
  // Two modes:
  // 1) "清理無名資料" — delete member docs whose name is blank/null
  //    (legacy FCM setDoc leftovers that the UI already hides).
  // 2) "依名稱強制清除" — member has a name and leaks into events /
  //    expenses / lists / bookings but its card never shows on the
  //    Members page. Owner types the exact name and we delete the member
  //    docs AND every reference across the trip (participants, payer,
  //    splitWith, assignedTo, memberOrder).
  const [cleanBusy, setCleanBusy]     = useState(false);
  const [cleanResult, setCleanResult] = useState<string | null>(null);
  const [cleanError, setCleanError]   = useState<string | null>(null);
  const [targetName, setTargetName]   = useState('');

  const handleCleanOrphans = async () => {
    if (firestore.role !== 'owner' || cleanBusy) return;
    setCleanBusy(true); setCleanResult(null); setCleanError(null);
    try {
      const snap = await getDocs(_collection(db, 'trips', TRIP_ID, 'members'));
      const nameless = snap.docs.filter(d => {
        const v = (d.data() as any)?.name;
        return typeof v !== 'string' || v.trim() === '';
      });
      if (!nameless.length) {
        setCleanResult('沒有發現無名資料');
        return;
      }
      await Promise.all(nameless.map(d =>
        deleteDoc(_doc(db, 'trips', TRIP_ID, 'members', d.id))
      ));
      setCleanResult(`已清理 ${nameless.length} 筆無名資料`);
    } catch (e: any) {
      console.error('[cleanup] orphan members failed', e);
      setCleanError(e?.message || '清理失敗，請稍後再試');
    } finally {
      setCleanBusy(false);
    }
  };

  const handleDeleteByName = async () => {
    const name = targetName.trim();
    if (firestore.role !== 'owner' || !name || cleanBusy) return;
    if (!window.confirm(`確定要刪除成員「${name}」並清除所有相關引用？此操作無法復原。`)) return;
    setCleanBusy(true); setCleanResult(null); setCleanError(null);
    try {
      // 1. Find member docs matching this name (could be 0, 1, or duplicates)
      const mSnap = await getDocs(_collection(db, 'trips', TRIP_ID, 'members'));
      const targets = mSnap.docs.filter(d => (d.data() as any)?.name === name);
      const targetIds = new Set(targets.map(d => d.id));

      let eventsCleared = 0, expensesCleared = 0, listsCleared = 0, bookingsCleared = 0;

      // 2. events.participants — array of member IDs
      if (targetIds.size > 0) {
        const eSnap = await getDocs(_collection(db, 'trips', TRIP_ID, 'events'));
        for (const d of eSnap.docs) {
          const parts: string[] = (d.data() as any).participants || [];
          const filtered = parts.filter(id => !targetIds.has(id));
          if (filtered.length !== parts.length) {
            await _updateDoc(_doc(db, 'trips', TRIP_ID, 'events', d.id), { participants: filtered });
            eventsCleared++;
          }
        }
      }

      // 3. expenses.payer (name) + expenses.splitWith (array of names)
      const expSnap = await getDocs(_collection(db, 'trips', TRIP_ID, 'expenses'));
      for (const d of expSnap.docs) {
        const data = d.data() as any;
        const updates: any = {};
        if (data.payer === name) updates.payer = '';
        if (Array.isArray(data.splitWith) && data.splitWith.includes(name)) {
          updates.splitWith = data.splitWith.filter((n: string) => n !== name);
        }
        if (Object.keys(updates).length) {
          await _updateDoc(_doc(db, 'trips', TRIP_ID, 'expenses', d.id), updates);
          expensesCleared++;
        }
      }

      // 4. lists.assignedTo (name) — fall back to 'all' so item remains usable
      const lSnap = await getDocs(_collection(db, 'trips', TRIP_ID, 'lists'));
      for (const d of lSnap.docs) {
        const data = d.data() as any;
        if (data.assignedTo === name) {
          await _updateDoc(_doc(db, 'trips', TRIP_ID, 'lists', d.id), { assignedTo: 'all' });
          listsCleared++;
        }
      }

      // 5. bookings.participants — custom-booking collection (member IDs)
      if (targetIds.size > 0) {
        const bSnap = await getDocs(_collection(db, 'trips', TRIP_ID, 'bookings'));
        for (const d of bSnap.docs) {
          const parts: string[] = (d.data() as any).participants || [];
          const filtered = parts.filter(id => !targetIds.has(id));
          if (filtered.length !== parts.length) {
            await _updateDoc(_doc(db, 'trips', TRIP_ID, 'bookings', d.id), { participants: filtered });
            bookingsCleared++;
          }
        }
      }

      // 6. trip.memberOrder — remove the name
      const tripRef = _doc(db, 'trips', TRIP_ID);
      const tripSnap = await getDoc(tripRef);
      if (tripSnap.exists()) {
        const order: string[] = (tripSnap.data() as any).memberOrder || [];
        if (order.includes(name)) {
          await _updateDoc(tripRef, { memberOrder: order.filter(n => n !== name) });
        }
      }

      // 7. finally delete the member docs themselves
      await Promise.all(targets.map(d => deleteDoc(_doc(db, 'trips', TRIP_ID, 'members', d.id))));

      const parts = [
        targets.length > 0 ? `${targets.length} 張成員卡` : null,
        eventsCleared   > 0 ? `${eventsCleared} 筆行程` : null,
        expensesCleared > 0 ? `${expensesCleared} 筆費用` : null,
        listsCleared    > 0 ? `${listsCleared} 筆待辦` : null,
        bookingsCleared > 0 ? `${bookingsCleared} 筆預訂` : null,
      ].filter(Boolean);
      setCleanResult(
        parts.length > 0
          ? `已清除「${name}」：${parts.join('、')}`
          : `找不到與「${name}」相關的資料`
      );
      setTargetName('');
    } catch (e: any) {
      console.error('[cleanup] delete by name failed', e);
      setCleanError(e?.message || '清理失敗，請稍後再試');
    } finally {
      setCleanBusy(false);
    }
  };

  // Last-line-of-defence duplicate check against freshest Firestore data.
  // Mirrors assertNotAlreadyBound in App.tsx: ignores nameless orphan docs
  // (legacy FCM setDoc leftovers) and silently self-heals them so they stop
  // blocking future bind attempts.
  const hasName = (v: any) => typeof v === 'string' && v.trim() !== '';
  const assertNotAlreadyBound = async (uid: string): Promise<{ bound: boolean; name?: string }> => {
    const localHit = (members as any[]).find(m => m.googleUid === uid && hasName(m.name));
    if (localHit) return { bound: true, name: localHit.name };
    try {
      const snap = await getDocs(query(_collection(db, 'trips', TRIP_ID, 'members'), where('googleUid', '==', uid)));
      const named = snap.docs.find(d => hasName((d.data() as any).name));
      const nameless = snap.docs.filter(d => !hasName((d.data() as any).name));
      if (nameless.length) {
        Promise.allSettled(
          nameless.map(d =>
            updateDoc(doc(db, 'trips', TRIP_ID, 'members', d.id), {
              googleUid: deleteField(),
              googleEmail: deleteField(),
            })
          )
        ).catch(() => {});
      }
      if (named) return { bound: true, name: (named.data() as any).name };
    } catch (e) { console.warn('[bind] duplicate check failed', e); }
    return { bound: false };
  };

  const handleBindGoogle = async (memberId: string) => {
    if (!googleUid) return;
    const dup = await assertNotAlreadyBound(googleUid);
    if (dup.bound) {
      alert(`此 Google 帳號已經綁定「${dup.name}」，一個帳號只能綁一張成員卡。請先解除原綁定。`);
      return;
    }
    try {
      await updateDoc(doc(db, 'trips', TRIP_ID, 'members', memberId), { googleUid, googleEmail: googleEmail || '' });
    } catch (e) { console.error(e); }
  };

  const handleUnbindGoogle = async (memberId: string) => {
    if (!window.confirm('確定要解除此成員的 Google 帳號綁定嗎？')) return;
    try {
      await updateDoc(doc(db, 'trips', TRIP_ID, 'members', memberId), {
        googleUid: deleteField(),
        googleEmail: deleteField(),
      });
    } catch (e) {
      console.error(e);
      alert('解除綁定失敗，請重試');
    }
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
    if (!content || !googleUid || !currentUser) return;
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
      const ownerUid   = data.ownerUid as string | undefined;
      const rawEditors = (data.allowedEditorUids || []) as string[];
      const rawInfo    = (data.editorInfo || {}) as Record<string, { email: string; joinedAt: number }>;

      // Self-heal: the owner's own uid must never appear in allowedEditorUids.
      // An earlier bug let the owner pass through the visitor-link key-upgrade
      // flow in incognito, which added their uid to this list. Strip it here
      // so the editor list never shows the owner as an editor and there's no
      // "降級訪客" button tempting them to downgrade themselves.
      if (ownerUid && rawEditors.includes(ownerUid)) {
        try {
          await _updateDoc(_doc(db, 'trips', TRIP_ID), {
            allowedEditorUids: arrayRemove(ownerUid),
            [`editorInfo.${ownerUid}`]: deleteField(),
          });
        } catch (e) { console.warn('[owner-cleanup] failed', e); }
        const cleaned = rawEditors.filter(u => u !== ownerUid);
        const cleanedInfo = { ...rawInfo }; delete cleanedInfo[ownerUid];
        setAllowedEditorUids(cleaned);
        setEditorInfo(cleanedInfo);
      } else {
        setAllowedEditorUids(rawEditors);
        setEditorInfo(rawInfo);
      }

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
    if (!window.confirm('確定要移除此編輯者的權限？對方將立即降級為訪客，並解除成員卡綁定。')) return;
    try {
      // 1. Remove from allowedEditorUids
      await _updateDoc(_doc(db, 'trips', TRIP_ID), {
        allowedEditorUids: arrayRemove(uid),
        [`editorInfo.${uid}`]: deleteField(),
      });
      setAllowedEditorUids(prev => prev.filter(u => u !== uid));
      setEditorInfo(prev => { const n = { ...prev }; delete n[uid]; return n; });

      // 2. Unbind ALL member docs carrying this uid. Queries Firestore directly
      //    instead of local state so nameless orphan docs (filtered out of UI)
      //    are also cleared — prevents residue after repeated bind/demote cycles.
      const dupSnap = await getDocs(query(_collection(db, 'trips', TRIP_ID, 'members'), where('googleUid', '==', uid)));
      await Promise.all(
        dupSnap.docs.map(d =>
          _updateDoc(_doc(db, 'trips', TRIP_ID, 'members', d.id), {
            googleUid: deleteField(),
            googleEmail: deleteField(),
          })
        )
      );
    } catch (e) { console.error(e); alert('操作失敗，請重試'); }
  };

  // ── Proxy grant management ───────────────────────────────────────────────
  // My grant doc is keyed by my UID: proxyGrants/{myUid}
  const myGrantDoc = googleUid ? (proxyGrants as any[]).find((g: any) => g.id === googleUid) : null;
  const myProxyUids: string[] = myGrantDoc?.proxyUids || [];

  const handleToggleProxy = async (targetUid: string) => {
    if (!googleUid || !TRIP_ID || isReadOnly) return;
    setSavingProxy(true);
    const grantRef = _doc(db, 'trips', TRIP_ID, 'proxyGrants', googleUid);
    const isGranted = myProxyUids.includes(targetUid);
    try {
      if (isGranted) {
        await _updateDoc(grantRef, { proxyUids: arrayRemove(targetUid) });
      } else {
        await setDoc(grantRef, { proxyUids: arrayUnion(targetUid) }, { merge: true });
      }
    } catch (e) {
      console.error('[proxyGrant] toggle failed', e);
      alert('操作失敗，請重試');
    } finally {
      setSavingProxy(false);
    }
  };

  // ── Member order ─────────────────────────────────────────────────────────
  const [localMemberOrder, setLocalMemberOrder] = useState<string[] | null>(null);

  const memberNames = members.map((m: any) => m.name);
  const memberOrder: string[] = localMemberOrder ?? project?.memberOrder ?? memberNames;
  const orderedMembers: any[] = [
    ...memberOrder
      .map((name: string) => members.find((m: any) => m.name === name))
      .filter(Boolean),
    ...members.filter((m: any) => !memberOrder.includes(m.name)),
  ];
  // Always pin own card to top regardless of role
  const ownMember = googleUid ? orderedMembers.find((m: any) => m.googleUid === googleUid) : null;
  const otherMembers = orderedMembers.filter((m: any) => !(googleUid && m.googleUid === googleUid));
  const displayMembers = ownMember ? [ownMember, ...otherMembers] : orderedMembers;

  const handleMemberReorder = async (memberId: string, dir: 'up' | 'down') => {
    if (firestore.role !== 'owner') return;
    // Reorder within otherMembers only (own card is pinned to top)
    const idx = otherMembers.findIndex((m: any) => m.id === memberId);
    if (idx < 0) return;
    const newOtherOrder = otherMembers.map((m: any) => m.name);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newOtherOrder.length) return;
    [newOtherOrder[idx], newOtherOrder[swapIdx]] = [newOtherOrder[swapIdx], newOtherOrder[idx]];
    // Optimistic update: own card stays first in Firestore order too
    const fullOrder = ownMember ? [ownMember.name, ...newOtherOrder] : newOtherOrder;
    setLocalMemberOrder(fullOrder);
    try {
      await _updateDoc(_doc(db, 'trips', TRIP_ID), { memberOrder: fullOrder });
    } catch (e) {
      console.error(e);
      setLocalMemberOrder(null); // revert on failure
    }
  };

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
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                {isEdit ? <><FontAwesomeIcon icon={faPen} style={{ fontSize: 13 }} /> 編輯成員</> : <><FontAwesomeIcon icon={faPlus} style={{ fontSize: 13 }} /> 新增旅伴</>}
              </p>
              <button onClick={() => { setShowAdd(false); setEditTarget(null); }}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: C.barkLight, display: 'flex', alignItems: 'center' }}><FontAwesomeIcon icon={faXmark} /></button>
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
                    {uploadingFor === 'new' ? '上傳中...' : <><FontAwesomeIcon icon={faCamera} style={{ fontSize: 12, marginRight: 5 }} />選擇頭像（可裁切）</>}
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
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {PRESET_COLORS.map(c => (
                    <div key={c} onClick={() => set('color', c)}
                      style={{ width: 32, height: 32, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? `3px solid ${C.bark}` : '3px solid transparent', boxShadow: form.color === c ? '0 0 0 2px white inset' : 'none', transition: 'all 0.15s' }} />
                  ))}
                  {/* Custom color picker */}
                  <div style={{ position: 'relative', width: 32, height: 32 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'conic-gradient(#FAE0E0, #ebcef5, #D8EDF8, #E0F0D8, #FFF2CC, #FFD0B0, #F8BBD9, #FAE0E0)', cursor: 'pointer', border: !PRESET_COLORS.includes(form.color) ? `3px solid ${C.bark}` : '3px solid transparent', boxShadow: !PRESET_COLORS.includes(form.color) ? '0 0 0 2px white inset' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }} />
                    <input type="color" value={form.color} onChange={e => set('color', e.target.value)}
                      style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', borderRadius: '50%' }} />
                  </div>
                  {/* Show selected custom color if not a preset */}
                  {!PRESET_COLORS.includes(form.color) && (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: form.color, border: `3px solid ${C.bark}`, boxShadow: '0 0 0 2px white inset' }} />
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => { setShowAdd(false); setEditTarget(null); }}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>取消</button>
                <button onClick={isEdit ? handleEditSave : handleAdd} disabled={saving || !form.name.trim()}
                  style={{ flex: 2, padding: 12, borderRadius: 12, border: 'none', background: form.name.trim() ? C.earth : C.creamDark, color: 'white', fontWeight: 700, fontSize: 14, cursor: form.name.trim() ? 'pointer' : 'default', fontFamily: FONT, opacity: saving ? 0.7 : 1 }}>
                  {saving ? '儲存中...' : isEdit ? <><FontAwesomeIcon icon={faCheck} style={{ marginRight: 6 }} />儲存</> : <><FontAwesomeIcon icon={faPlus} style={{ marginRight: 6 }} />新增</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="旅伴"
        subtitle={headerSubtitle}
        emoji={<FontAwesomeIcon icon={faUsers} />}
        color={C.earth}
        className="tm-hero-page-earth"
      />

      {/* Copy toast */}
      {copied && (
        <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#3A5A3A', color: 'white', borderRadius: 24, padding: '10px 22px', fontSize: 13, fontWeight: 700, zIndex: 500, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', whiteSpace: 'nowrap', fontFamily: FONT }}>
          <FontAwesomeIcon icon={faSquareCheck} style={{ marginRight: 6 }} /> 已複製，快去分享給朋友吧！
        </div>
      )}

      {/* Google sign-in / status — shown first, right below header */}
      {!googleUid && !firestore.isReadOnly && (
        <div style={{ margin: '12px 16px 0', background: 'var(--tm-card-bg)', borderRadius: 16, padding: '12px 14px', boxShadow: C.shadowSm, border: '1.5px solid #EDE8D5' }}>
          <p style={{ fontSize: 12, color: C.barkLight, margin: '0 0 8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <FontAwesomeIcon icon={faLock} style={{ fontSize: 11 }} /> 登入 Google 後可綁定成員卡，以自己的身份留言
          </p>
          <button onClick={handleGoogleSignIn} disabled={signingIn}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #E0D9C8', background: signingIn ? '#F5F5F5' : 'var(--tm-card-bg)', cursor: signingIn ? 'default' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', boxShadow: C.shadowSm, opacity: signingIn ? 0.6 : 1 }}>
            <span style={{ fontSize: 16 }}>G</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1C3461' }}>{signingIn ? '登入中...' : '使用 Google 帳號登入'}</span>
          </button>
          {authError && (
            <p className="tm-error-text" style={{ fontSize: 11, color: '#C0392B', margin: '6px 0 0', fontWeight: 600 }}>{authError}</p>
          )}
        </div>
      )}
      {googleUid && (
        <div style={{ margin: '12px 16px 0', background: '#E0F0D8', borderRadius: 16, padding: '10px 14px', border: '1.5px solid #C2E0B4', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, color: '#4A7A35' }}><FontAwesomeIcon icon={faSquareCheck} /></span>
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

      {/* ── Notification permission status ── */}
      {'Notification' in window && googleUid && ownMember && (
        <div style={{ margin: '8px 16px 0', background: 'var(--tm-card-bg)', borderRadius: 16, padding: '10px 14px', boxShadow: C.shadowSm, border: `1.5px solid ${notifPermission === 'granted' ? '#C2E0B4' : '#EDE8D5'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, color: notifPermission === 'granted' ? '#4A7A35' : notifPermission === 'denied' ? '#9A6030' : C.barkLight }}>
            <FontAwesomeIcon icon={notifPermission === 'granted' ? faBell : faBellSlash} />
          </span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: notifPermission === 'granted' ? '#4A7A35' : C.bark, margin: 0 }}>
              推播通知：{notifPermission === 'granted' ? '已開啟' : notifPermission === 'denied' ? '已拒絕' : '尚未設定'}
            </p>
            {notifPermission === 'granted' && (
              <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>
                {fcmSynced ? '✓ 裝置已完成同步' : '點擊「同步裝置」以確保此裝置可收到通知'}
              </p>
            )}
            {notifPermission === 'denied' && (
              <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>請點擊瀏覽器網址列左側的圖示，在「通知」設定中改為允許</p>
            )}
            {notifPermission === 'default' && (
              <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>開啟後可收到留言、反應、航班提醒等通知</p>
            )}
          </div>
          {notifPermission === 'default' && (
            <button onClick={handleRequestNotif}
              style={{ fontSize: 11, fontWeight: 700, color: 'white', background: C.earth, border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: FONT, flexShrink: 0 }}>
              啟用通知
            </button>
          )}
          {notifPermission === 'granted' && (
            <button onClick={handleRequestNotif} disabled={fcmSyncing}
              style={{ fontSize: 11, fontWeight: 700, color: fcmSynced ? '#4A7A35' : 'white', background: fcmSynced ? '#E0F0D8' : C.earth, border: 'none', borderRadius: 8, padding: '6px 12px', cursor: fcmSyncing ? 'default' : 'pointer', fontFamily: FONT, flexShrink: 0, opacity: fcmSyncing ? 0.6 : 1, transition: 'all 0.2s' }}>
              {fcmSyncing ? '同步中…' : fcmSynced ? '✓ 已同步' : '同步裝置'}
            </button>
          )}
        </div>
      )}

      {/* Share project keys (Owner only) */}
      {project?.role === 'owner' && (
        <div style={{ margin: '12px 16px 0', background: 'var(--tm-card-bg)', borderRadius: 16, padding: '14px 16px', boxShadow: C.shadowSm }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}><FontAwesomeIcon icon={faKey} style={{ fontSize: 11 }} /> 分享此旅行</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* 協作金鑰 — tap to copy */}
            <div onClick={() => handleCopy(firestoreCollaboratorKey || project?.collaboratorKey || '', 'collab')}
              className={copied === 'collab' ? 'tm-copied-success' : 'tm-collab-key-bg'}
              style={{ background: copied === 'collab' ? '#E0F0D8' : undefined, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', transition: 'background 0.2s', userSelect: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <p className={copied === 'collab' ? '' : 'tm-collab-key-label'} style={{ fontSize: 10, fontWeight: 700, color: copied === 'collab' ? '#4A7A35' : undefined, margin: 0 }}>協作金鑰（編輯者）</p>
                <span className={copied === 'collab' ? '' : 'tm-collab-key-label'} style={{ fontSize: 10, color: copied === 'collab' ? '#4A7A35' : undefined, fontWeight: 700 }}>{copied === 'collab' ? <><FontAwesomeIcon icon={faSquareCheck} style={{ marginRight: 3 }} />已複製</> : <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>點擊複製 <FontAwesomeIcon icon={faClipboardList} /></span>}</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: 0, letterSpacing: 1, fontFamily: 'monospace' }}>{firestoreCollaboratorKey || project?.collaboratorKey || '—'}</p>
              <p style={{ fontSize: 10, color: C.barkLight, margin: '3px 0 0' }}>分享此金鑰，對方可以共同編輯行程</p>
            </div>
            {/* 訪客連結 — tap to copy */}
            <div onClick={() => handleCopy(`${window.location.origin}/?visit=${project.id}`, 'visit')}
              className={copied === 'visit' ? 'tm-copied-success' : 'tm-visitor-link-bg'}
              style={{ background: copied === 'visit' ? '#E0F0D8' : undefined, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', transition: 'background 0.2s', userSelect: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <p className={copied === 'visit' ? '' : 'tm-visitor-link-label'} style={{ fontSize: 10, fontWeight: 700, color: copied === 'visit' ? '#4A7A35' : undefined, margin: 0 }}>訪客連結（唯讀瀏覽）</p>
                <span className={copied === 'visit' ? '' : 'tm-visitor-link-label'} style={{ fontSize: 10, color: copied === 'visit' ? '#4A7A35' : undefined, fontWeight: 700 }}>{copied === 'visit' ? <><FontAwesomeIcon icon={faSquareCheck} style={{ marginRight: 3 }} />已複製</> : <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>點擊複製 <FontAwesomeIcon icon={faClipboardList} /></span>}</span>
              </div>
              <p style={{ fontSize: 12, fontWeight: 600, color: C.bark, margin: 0 }}>訪客專屬分享連結</p>
              <p style={{ fontSize: 10, color: C.barkLight, margin: '3px 0 0' }}>對方點擊連結即可直接瀏覽行程（無需登入或輸入代碼）</p>
            </div>
          </div>
        </div>
      )}

      {/* ── PWA install（顯示條件：瀏覽器支援且尚未安裝）── */}
      {pwaInstallAvailable && (
        <div style={{ margin: '12px 16px 0', background: 'var(--tm-card-bg)', borderRadius: 16, padding: '14px 16px', boxShadow: C.shadowSm }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <FontAwesomeIcon icon={faMobileScreen} style={{ fontSize: 13 }} /> 安裝 App
          </p>
          <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 10px' }}>將 TripMori 加入主畫面，享受原生 App 體驗。</p>
          <button onClick={onPwaInstall} className="tm-btn-solid-sage"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: 'none', background: C.sage, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <FontAwesomeIcon icon={faDownload} style={{ fontSize: 13 }} />
            加入主畫面
          </button>
        </div>
      )}

      {/* Editor list management (Owner only, admin mode) */}
      {adminMode && allowedEditorUids.length > 0 && (
        <div style={{ margin: '12px 16px 0', background: 'var(--tm-card-bg)', borderRadius: 16, boxShadow: C.shadowSm, overflow: 'hidden' }}>
          <button onClick={() => setEditorListOpen(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.bark, display: 'flex', alignItems: 'center', gap: 5 }}><FontAwesomeIcon icon={faPen} style={{ fontSize: 11 }} /> 編輯者名單</span>
            <span style={{ fontSize: 12, color: C.barkLight }}><FontAwesomeIcon icon={editorListOpen ? faChevronUp : faChevronDown} /></span>
          </button>
          {editorListOpen && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px 14px' }}>
            {/* Sort editor UIDs by owner-defined member card order.
                Filter: never render the current (owner) user's own uid — that
                would be a 降級訪客 button pointed at themselves (belt & braces
                on top of the Firestore self-heal). */}
            {[...allowedEditorUids]
              .filter(uid => uid !== auth.currentUser?.uid)
              .sort((a, b) => {
              const ai = displayMembers.findIndex((m: any) => m.googleUid === a);
              const bi = displayMembers.findIndex((m: any) => m.googleUid === b);
              return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
            }).map(uid => {
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
                  <div className="tm-member-avatar-dynamic" style={{ width: 32, height: 32, borderRadius: '50%', background: boundMember?.color || '#D8EDF8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: C.bark, flexShrink: 0 }}>
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
                    className="tm-badge-amber-sm"
                    style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 10, border: '1px solid #E8C96A', background: '#FFF8E1', color: '#9A6800', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                    降級訪客
                  </button>
                </div>
              );
            })}
          </div>}
        </div>
      )}

      {/* Member cards + note boards */}
      <div style={{ padding: '12px 16px 80px' }}>
        {firestore.isReadOnly ? (
          /* Visitor skeleton + blur */
          <div style={{ position: 'relative', paddingTop: 4 }}>
            {/* Skeleton member cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, filter: 'blur(3px)', userSelect: 'none', pointerEvents: 'none' }}>
              {[{ w: '40%' }, { w: '55%' }, { w: '35%' }].map((sk, i) => (
                <div key={i} style={{ background: 'var(--tm-card-bg)', borderRadius: 16, padding: '14px 16px', border: `1px solid ${C.creamDark}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#EBEBEB', flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ height: 13, borderRadius: 6, background: '#EBEBEB', width: sk.w }} />
                    <div style={{ height: 10, borderRadius: 5, background: '#EBEBEB', width: '25%' }} />
                  </div>
                </div>
              ))}
            </div>
            {/* Overlay badge */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <span style={{ background: 'rgba(255,255,255,0.92)', border: `1px solid ${C.creamDark}`, borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: C.barkLight, display: 'flex', alignItems: 'center', gap: 6, boxShadow: C.shadowSm }}>
                <FontAwesomeIcon icon={faLock} style={{ fontSize: 12 }} />成員資訊僅限協作者查看
              </span>
              <p style={{ fontSize: 12, color: C.barkLight, margin: 0, lineHeight: 1.6, textAlign: 'center', background: 'rgba(255,255,255,0.85)', borderRadius: 10, padding: '4px 12px' }}>
                請聯繫行程擁有者取得協作金鑰，<br />即可以編輯者身份加入並查看所有成員資訊
              </p>
            </div>
          </div>
        ) : (
          <>
          {/* ── Owner-only: Google binding summary ── */}
          {firestore.role === 'owner' && members.length > 0 && (
            <div style={{ background: 'var(--tm-card-bg)', borderRadius: 16, marginBottom: 14, border: '1.5px solid #C2E0B4', boxShadow: C.shadowSm, overflow: 'hidden' }}>
              {/* Collapsible header */}
              <button onClick={() => setBindingSummaryOpen(v => !v)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#4A7A35', display: 'flex', alignItems: 'center', gap: 5 }}><FontAwesomeIcon icon={faLock} style={{ fontSize: 11 }} /> 帳號綁定總覽</span>
                <span style={{ fontSize: 12, color: '#4A7A35', opacity: 0.7 }}><FontAwesomeIcon icon={bindingSummaryOpen ? faChevronUp : faChevronDown} /></span>
              </button>
              {bindingSummaryOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 12px 12px' }}>
                  {displayMembers.map((m: any) => {
                    const isOwnerCard  = !!(googleUid && m.googleUid === googleUid);
                    const isEditorCard = !!(m.googleUid && allowedEditorUids.includes(m.googleUid) && !isOwnerCard);
                    const rowClass     = isOwnerCard ? 'tm-binding-owner' : isEditorCard ? 'tm-binding-editor' : 'tm-binding-none';
                    const badge = isOwnerCard
                      ? <span className="tm-badge-owner" style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>擁有者</span>
                      : isEditorCard
                        ? <span className="tm-badge-editor" style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>編輯者</span>
                        : null;
                    return (
                      <div key={m.id} className={rowClass} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, padding: '6px 10px' }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: m.color || C.sageLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: avatarTextColor(m.color), flexShrink: 0, overflow: 'hidden' }}>
                          {m.avatarUrl
                            ? <img src={m.avatarUrl} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : m.name?.[0]?.toUpperCase()
                          }
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.bark, minWidth: 50, flexShrink: 0 }}>{m.name}</span>
                        {badge}
                        <span style={{ flex: 1 }} />
                        {m.googleEmail
                          ? <span style={{ fontSize: 11, color: C.bark, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160, opacity: 0.75 }}>{m.googleEmail}</span>
                          : <span style={{ fontSize: 11, color: C.barkLight }}>尚未綁定</span>
                        }
                      </div>
                    );
                  })}
                </div>
              )}
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

          const memberIdx = otherMembers.findIndex((om: any) => om.id === m.id);
          return (
            <div key={m.id} style={{ marginBottom: 16 }}>
              {/* Member info card */}
              <div style={{ background: 'var(--tm-card-bg)', borderRadius: '20px 20px 0 0', padding: '16px', boxShadow: C.shadowSm, display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
                {/* Reorder arrows (admin mode only, hidden for own pinned card) */}
                {adminMode && !isMyCard && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                    <button onClick={() => handleMemberReorder(m.id, 'up')} disabled={memberIdx === 0}
                      style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: memberIdx === 0 ? 'transparent' : C.cream, color: C.barkLight, cursor: memberIdx === 0 ? 'default' : 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: memberIdx === 0 ? 0.25 : 1 }}><FontAwesomeIcon icon={faArrowUp} /></button>
                    <button onClick={() => handleMemberReorder(m.id, 'down')} disabled={memberIdx === otherMembers.length - 1}
                      style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: memberIdx === otherMembers.length - 1 ? 'transparent' : C.cream, color: C.barkLight, cursor: memberIdx === otherMembers.length - 1 ? 'default' : 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: memberIdx === otherMembers.length - 1 ? 0.25 : 1 }}><FontAwesomeIcon icon={faArrowDown} /></button>
                  </div>
                )}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: m.color || C.sageLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: avatarTextColor(m.color), border: '3px solid white', boxShadow: '0 2px 8px rgba(107,92,78,0.15)', overflow: 'hidden' }}>
                    {m.avatarUrl
                      ? <img src={m.avatarUrl} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : m.name?.[0]?.toUpperCase()
                    }
                  </div>
                  {canEdit && (
                  <div onClick={() => { existingMemberId.current = m.id; fileExistingRef.current?.click(); }}
                    style={{ position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderRadius: '50%', background: C.earth, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 9, color: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                    {isUploading ? '…' : <FontAwesomeIcon icon={faCamera} />}
                  </div>
                )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 16, fontWeight: 700, color: C.bark, margin: 0 }}>{m.name}</p>
                    {isMyCard && <span className="tm-badge-me" style={{ fontSize: 10, fontWeight: 700, background: '#E0F0D8', color: '#4A7A35', borderRadius: 6, padding: '1px 6px' }}>我</span>}
                    {m.googleUid && !isMyCard && <span className="tm-badge-sky-sm" style={{ fontSize: 10, fontWeight: 700, background: '#D8EDF8', color: '#2A6A9A', borderRadius: 6, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 3 }}><FontAwesomeIcon icon={faLink} style={{ fontSize: 8 }} /> 已綁定</span>}
                    {!m.googleUid && <span className="tm-badge-unbound" style={{ fontSize: 10, fontWeight: 600, background: '#F5F5F5', color: '#9A8A7A', borderRadius: 6, padding: '1px 6px' }}>未綁定</span>}
                  </div>
                  {/* 擁有者可看到綁定的 Google 帳號 email — 超長 email 省略 */}
                  {firestore.role === 'owner' && m.googleEmail && (
                    <p style={{ fontSize: 10, color: '#2A6A9A', margin: '2px 0 0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                      <FontAwesomeIcon icon={faEnvelope} style={{ fontSize: 9, flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.googleEmail}</span>
                    </p>
                  )}
                  <div style={{ margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: C.barkLight }}>{m.role || '旅伴'}</span>
                    {canEdit && (
                      <button onClick={() => openEdit(m)}
                        title="編輯身份 / 角色"
                        style={{ width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.barkLight, flexShrink: 0 }}>
                        <FontAwesomeIcon icon={faPen} style={{ fontSize: 9 }} />
                      </button>
                    )}
                  </div>
                  {canBind && (
                    <button onClick={() => handleBindGoogle(m.id)}
                      style={{ marginTop: 5, fontSize: 11, fontWeight: 700, color: '#4A7A35', background: '#E0F0D8', border: 'none', borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT }}>
                      <FontAwesomeIcon icon={faLink} style={{ fontSize: 10, marginRight: 4 }} />綁定為我的成員卡
                    </button>
                  )}
                  {/* ── 小操作列：解除綁定 / 刪除 / 授權代錄 ── */}
                  {(() => {
                    const showUnbind  = m.googleUid && (adminMode || isMyCard) && !firestore.isReadOnly;
                    const showDelete  = adminMode && canEdit && !isMyCard;
                    const proxyTargets = isMyCard && googleUid && !isReadOnly
                      ? (members as any[]).filter((tm: any) => tm.googleUid && tm.googleUid !== googleUid)
                      : [];
                    const showProxy = proxyTargets.length > 0;
                    if (!showUnbind && !showDelete && !showProxy) return null;
                    return (
                      <div style={{ marginTop: 6, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                        {showUnbind && (
                          <button onClick={() => handleUnbindGoogle(m.id)}
                            style={{ fontSize: 10, color: '#9A3A3A', background: 'none', border: '1px solid #E8C4C4', borderRadius: 6, padding: '1px 7px', cursor: 'pointer', fontFamily: FONT, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <FontAwesomeIcon icon={faXmark} style={{ fontSize: 9 }} />解除綁定
                          </button>
                        )}
                        {showDelete && (
                          <button onClick={() => handleDeleteMember(m.id, m.name)}
                            style={{ fontSize: 10, color: '#9A3A3A', background: 'none', border: '1px solid #E8C4C4', borderRadius: 6, padding: '1px 7px', cursor: 'pointer', fontFamily: FONT, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 9 }} />刪除成員
                          </button>
                        )}
                        {showProxy && (
                          <button onClick={() => setProxyGrantOpen(v => !v)}
                            style={{ fontSize: 10, fontWeight: 700, color: '#5A4A9A', background: 'none', border: '1px solid #C4BAE8', borderRadius: 6, padding: '1px 7px', cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <FontAwesomeIcon icon={faUserShield} style={{ fontSize: 9 }} />
                            代錄授權
                            {myProxyUids.length > 0 && (
                              <span style={{ background: '#5A4A9A', color: 'white', borderRadius: 8, padding: '0 4px', fontSize: 9, lineHeight: '14px' }}>{myProxyUids.length}</span>
                            )}
                            <FontAwesomeIcon icon={proxyGrantOpen ? faChevronUp : faChevronDown} style={{ fontSize: 8 }} />
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  {/* 代錄授權展開面板 */}
                  {isMyCard && googleUid && !isReadOnly && proxyGrantOpen && (() => {
                    const proxyTargets = (members as any[]).filter(
                      (tm: any) => tm.googleUid && tm.googleUid !== googleUid
                    );
                    if (proxyTargets.length === 0) return null;
                    return (
                      <div style={{ marginTop: 6, background: '#F5F3FF', borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <p style={{ fontSize: 10, color: '#4A3570', margin: 0, lineHeight: 1.5 }}>
                          被授權的夥伴可替你代錄私人帳目。
                        </p>
                        {proxyTargets.map((tm: any) => {
                          const isGranted = myProxyUids.includes(tm.googleUid);
                          return (
                            <div key={tm.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: tm.color || C.sageLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: C.bark, overflow: 'hidden', flexShrink: 0 }}>
                                {tm.avatarUrl
                                  ? <img src={tm.avatarUrl} alt={tm.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  : tm.name?.[0]?.toUpperCase()}
                              </div>
                              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#3D2A60' }}>{tm.name}</span>
                              <button
                                onClick={() => handleToggleProxy(tm.googleUid)}
                                disabled={savingProxy}
                                style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 6, border: 'none', cursor: savingProxy ? 'default' : 'pointer', fontFamily: FONT, background: isGranted ? '#5A4A9A' : '#E0D8F8', color: isGranted ? 'white' : '#5A4A9A', opacity: savingProxy ? 0.6 : 1, transition: 'all 0.15s' }}>
                                {isGranted ? '已授權 ✓' : '授權'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
                {/* Board toggle — 固定寬度避免有無留言時大小改變 */}
                <button onClick={() => setExpandedBoard(isExpanded ? null : m.id)}
                  className={isExpanded ? 'tm-note-board-toggle-active' : undefined}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '6px 4px', borderRadius: 12, border: `1.5px solid ${isExpanded ? C.sageDark : C.creamDark}`, background: isExpanded ? C.sageLight : 'var(--tm-card-bg)', cursor: 'pointer', fontFamily: FONT, width: 52, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: isExpanded ? C.sageDark : C.barkLight }}><FontAwesomeIcon icon={faNoteSticky} /></span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: isExpanded ? C.sageDark : C.barkLight, whiteSpace: 'nowrap' }}>
                    留言{notes.length > 0 ? ` (${notes.length})` : ''}
                  </span>
                </button>
              </div>

              {/* Note board */}
              {isExpanded && (
                <div className="tm-note-board" style={{ background: NOTE_COLORS[colorIdx], borderRadius: '0 0 20px 20px', padding: '14px 16px 16px', boxShadow: C.shadow }}>
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
                              {note.visibility === 'private' ? <><FontAwesomeIcon icon={faLock} style={{ fontSize: 8, marginRight: 3 }} />私人</> : <><FontAwesomeIcon icon={faUsers} style={{ fontSize: 8, marginRight: 3 }} />旅伴</>}
                            </span>
                            <p style={{ fontSize: 13, color: C.bark, margin: '0 0 6px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{note.content}</p>
                            <p style={{ fontSize: 10, color: C.barkLight, margin: 0, fontWeight: 600 }}>— {note.authorName} {timeStr}</p>
                            {(isOwn || isMyCard) && (
                              <button onClick={() => handleDeleteNote(note.id)}
                                style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: '50%', background: '#FAE0E0', border: 'none', color: '#9A3A3A', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                <FontAwesomeIcon icon={faXmark} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add note input */}
                  {(googleUid && currentUser) ? (
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
                          {noteVis[m.id] === 'private' ? <><FontAwesomeIcon icon={faLock} style={{ fontSize: 9, marginRight: 3 }} />私人</> : <><FontAwesomeIcon icon={faUsers} style={{ fontSize: 9, marginRight: 3 }} />旅伴</>}
                        </button>
                        <button
                          onClick={() => handleAddNote(m.id)}
                          disabled={isSavingNote || !(noteInput[m.id] || '').trim()}
                          style={{ padding: '7px 16px', borderRadius: 10, border: 'none', background: C.earth, color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT, opacity: (noteInput[m.id] || '').trim() ? 1 : 0.5 }}>
                          {isSavingNote ? '...' : '貼上'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="tm-amber-text" style={{ padding: '10px', borderRadius: 12, background: 'var(--tm-note-1)', color: '#9A6800', fontWeight: 600, fontSize: 12, textAlign: 'center' }}>
                      <FontAwesomeIcon icon={faLock} style={{ fontSize: 11, marginRight: 5 }} />請先登入 Google 並綁定成員卡後即可留言
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

        {/* ── Notion backup（Owner only）— moved to bottom of page so the
            administrative actions sit below the member cards ── */}
        {firestore.role === 'owner' && (
          <div style={{ marginTop: 12, background: 'var(--tm-card-bg)', borderRadius: 16, padding: '14px 16px', boxShadow: C.shadowSm }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FontAwesomeIcon icon={faBookmark} style={{ fontSize: 13 }} /> 備份到 Notion
            </p>
            <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 10px' }}>將行程資料（成員、行程、費用、日誌）匯出一份快照到 Notion 備份資料庫。</p>
            <button
              onClick={handleBackupToNotion}
              disabled={notionBusy}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: 'none', background: notionBusy ? C.creamDark : '#2F2F2F', color: 'white', fontWeight: 700, fontSize: 13, cursor: notionBusy ? 'default' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: notionBusy ? 0.6 : 1 }}>
              <FontAwesomeIcon icon={faBookmark} style={{ fontSize: 13 }} />
              {notionBusy ? '備份中…' : '立即備份到 Notion'}
            </button>
            {notionResult && (
              <div className="tm-notion-success" style={{ marginTop: 8, padding: '8px 10px', background: '#E0F0D8', borderRadius: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#4A7A35', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 5 }}><FontAwesomeIcon icon={faCheck} /> 備份成功！</p>
                <p style={{ fontSize: 11, color: '#4A7A35', margin: 0 }}>費用總計 NT$ {notionResult.totalTWD.toLocaleString()}</p>
                {notionResult.url && (
                  <a href={notionResult.url} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: '#2A6A9A', display: 'block', marginTop: 4, textDecoration: 'underline' }}>
                    在 Notion 中查看 →
                  </a>
                )}
              </div>
            )}
            {notionError && (
              <p style={{ fontSize: 11, color: '#9A3A3A', marginTop: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}><FontAwesomeIcon icon={faTriangleExclamation} /> {notionError}</p>
            )}
          </div>
        )}

        {/* ── 清理幽靈成員資料（Owner only）— bottom of page ── */}
        {firestore.role === 'owner' && (
          <div style={{ marginTop: 12, background: 'var(--tm-card-bg)', borderRadius: 16, padding: '14px 16px', boxShadow: C.shadowSm }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 12 }} /> 清理幽靈成員資料
            </p>

            {/* Mode 1: nameless cleanup */}
            <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 8px', lineHeight: 1.5 }}>
              掃描並刪除資料庫裡沒有名字的殘留成員紀錄。
            </p>
            <button onClick={handleCleanOrphans} disabled={cleanBusy}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.bark, fontWeight: 700, fontSize: 13, cursor: cleanBusy ? 'default' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: cleanBusy ? 0.6 : 1 }}>
              <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 12 }} />
              {cleanBusy ? '處理中…' : '清理無名資料'}
            </button>

            {/* Mode 2: delete by name + remove all references */}
            <div style={{ borderTop: `1px solid ${C.creamDark}`, marginTop: 14, paddingTop: 12 }}>
              <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 8px', lineHeight: 1.5 }}>
                若有成員在各頁面看得到但成員卡消失，輸入名稱強制刪除並清除所有引用（行程、費用、待辦、預訂）。
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={targetName} onChange={e => setTargetName(e.target.value)}
                  placeholder="要刪除的成員名稱（例：A）"
                  style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-input-bg)', fontSize: 14, color: 'var(--tm-bark)', outline: 'none', fontFamily: FONT }} />
                <button onClick={handleDeleteByName} disabled={cleanBusy || !targetName.trim()}
                  style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: '#9A3A3A', color: 'white', fontWeight: 700, fontSize: 13, cursor: (cleanBusy || !targetName.trim()) ? 'default' : 'pointer', fontFamily: FONT, flexShrink: 0, opacity: (cleanBusy || !targetName.trim()) ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                  強制刪除
                </button>
              </div>
            </div>

            {cleanResult && (
              <p style={{ fontSize: 11, color: '#4A7A35', marginTop: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, lineHeight: 1.5 }}>
                <FontAwesomeIcon icon={faCheck} />
                {cleanResult}
              </p>
            )}
            {cleanError && (
              <p style={{ fontSize: 11, color: '#9A3A3A', marginTop: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                <FontAwesomeIcon icon={faTriangleExclamation} /> {cleanError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
