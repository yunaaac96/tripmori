/**
 * ProjectHub — 多專案選擇 / 建立 / 加入 畫面
 * 進入 App 時如果沒有 active project 就顯示此頁。
 */
import { useState, useEffect } from 'react';
import { db, auth } from '../../config/firebase';
import { collection, doc, setDoc, addDoc, updateDoc, deleteDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { C, FONT } from '../../App';
import CurrencySearch from '../../components/CurrencySearch';

export type TripRole = 'owner' | 'editor' | 'visitor';

export interface StoredProject {
  id: string;
  title: string;
  emoji: string;
  role: TripRole;
  collaboratorKey: string;
  shareCode: string;
  addedAt: number;
  startDate?: string;
  endDate?: string;
  description?: string;
}

const LS_PROJECTS  = 'tripmori_projects';
const LS_ACTIVE    = 'tripmori_active_project';

// ── persistence helpers ──────────────────────────────────────────
export const loadProjects = (): StoredProject[] => {
  try { return JSON.parse(localStorage.getItem(LS_PROJECTS) || '[]'); }
  catch { return []; }
};

export const saveProject = (p: StoredProject) => {
  const list = loadProjects().filter(x => x.id !== p.id);
  localStorage.setItem(LS_PROJECTS, JSON.stringify([...list, p]));
};

export const removeProject = (id: string) => {
  localStorage.setItem(LS_PROJECTS, JSON.stringify(loadProjects().filter(p => p.id !== id)));
};

export const setActiveProject = (id: string) => localStorage.setItem(LS_ACTIVE, id);
export const getActiveProject = () => localStorage.getItem(LS_ACTIVE);

// ── random string helper ─────────────────────────────────────────
const rand = (n: number) => Math.random().toString(36).slice(2, 2 + n).toUpperCase();
export const makeCollabKey  = (id: string) => `COLLAB-${id.slice(0,6).toUpperCase()}-${rand(4)}`;
export const makeShareCode  = (id: string) => `SHARE-${id.slice(0,6).toUpperCase()}-${rand(3)}`;

// ── Default trip (pre-existing Okinawa trip) ─────────────────────
const DEFAULT_TRIP_ID  = '74pfE7RXyEIusEdRV0rZ';
const DEFAULT_COLLAB   = `COLLAB-${DEFAULT_TRIP_ID.slice(0,6).toUpperCase()}-TRIP`;
const DEFAULT_SHARE    = `SHARE-${DEFAULT_TRIP_ID.slice(0,6).toUpperCase()}-OKI`;

export const ensureDefaultProject = () => {
  const existing = loadProjects().find(p => p.id === DEFAULT_TRIP_ID);
  if (!existing) {
    // 預設給 visitor 角色；登入後由 checkOwnerRole() 升級
    saveProject({
      id: DEFAULT_TRIP_ID,
      title: '沖繩之旅 2026',
      emoji: '🌸',
      role: 'visitor',
      collaboratorKey: DEFAULT_COLLAB,
      shareCode: DEFAULT_SHARE,
      addedAt: Date.now(),
    });
  }
};

// 檢查登入的 Google user 是否為此 trip 的 owner，是則升級 localStorage role（或首次加入）
export const checkOwnerRole = async (googleEmail: string): Promise<TripRole | null> => {
  try {
    const { doc: fDoc, getDoc } = await import('firebase/firestore');
    const { db: fDb } = await import('../../config/firebase');
    const snap = await getDoc(fDoc(fDb, 'trips', DEFAULT_TRIP_ID));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data.ownerEmail && data.ownerEmail.toLowerCase() === googleEmail.toLowerCase()) {
      const projects = loadProjects();
      const idx = projects.findIndex(p => p.id === DEFAULT_TRIP_ID);
      if (idx < 0) {
        // First time owner opens app — add the trip
        saveProject({
          id: DEFAULT_TRIP_ID,
          title: data.title || '沖繩之旅 2026',
          emoji: data.emoji || '🌸',
          role: 'owner',
          collaboratorKey: data.collaboratorKey || DEFAULT_COLLAB,
          shareCode: data.shareCode || DEFAULT_SHARE,
          addedAt: Date.now(),
        });
      } else if (projects[idx].role !== 'owner') {
        projects[idx].role = 'owner';
        localStorage.setItem('tripmori_projects', JSON.stringify(projects));
      }
      return 'owner';
    }
  } catch (e) { console.error(e); }
  return null;
};

// ── Firestore: write trip metadata doc ───────────────────────────
const writeTripMeta = async (id: string, data: object) => {
  await setDoc(doc(db, 'trips', id), data, { merge: true });
};

// ── Country code → default currency mapping ───────────────────
const COUNTRY_CURRENCY: Record<string, string> = {
  JP: 'JPY', KR: 'KRW', TH: 'THB', SG: 'SGD', HK: 'HKD',
  US: 'USD', CA: 'USD', GB: 'GBP', AU: 'AUD', NZ: 'AUD',
  FR: 'EUR', DE: 'EUR', IT: 'EUR', ES: 'EUR', PT: 'EUR',
  NL: 'EUR', AT: 'EUR', BE: 'EUR', GR: 'EUR',
  MY: 'MYR', VN: 'VND', TW: 'TWD', MO: 'HKD',
  ID: 'USD', PH: 'USD', MM: 'USD',
};

// ── Common travel currencies ──────────────────────────────────
export const CURRENCY_OPTIONS = [
  { code: 'JPY', label: '日圓 ¥' },
  { code: 'KRW', label: '韓圜 ₩' },
  { code: 'THB', label: '泰銖 ฿' },
  { code: 'SGD', label: '新加坡幣 S$' },
  { code: 'HKD', label: '港幣 HK$' },
  { code: 'USD', label: '美元 $' },
  { code: 'EUR', label: '歐元 €' },
  { code: 'AUD', label: '澳幣 A$' },
  { code: 'GBP', label: '英鎊 £' },
  { code: 'MYR', label: '馬來幣 RM' },
  { code: 'VND', label: '越南盾 ₫' },
  { code: 'TWD', label: '台幣 NT$' },
];

// ── Default packing list (Japanese trip standard) ───────────────
const DEFAULT_PACKING: string[] = [
  '護照 / 證件', '機票 / 訂位確認單', '訂房確認單',
  '現金（當地貨幣）', '信用卡', '旅遊保險',
  '換洗衣物', '盥洗用品', '毛巾',
  '充電器', '行動電源', '變壓器 / 轉接頭',
  '防曬乳', '雨傘', '藥品（感冒、止痛、腸胃）',
  '眼鏡 / 隱形眼鏡', '耳機', '相機',
];

// ─────────────────────────────────────────────────────────────────
interface Props {
  onEnterProject: (project: StoredProject) => void;
}

const ROLE_LABEL: Record<TripRole, { label: string; color: string; bg: string }> = {
  owner:   { label: '擁有者', color: '#4A7A35', bg: '#E0F0D8' },
  editor:  { label: '編輯者', color: '#9A6800', bg: '#FFF2CC' },
  visitor: { label: '訪客',   color: '#2A6A9A', bg: '#D8EDF8' },
};

type View = 'hub' | 'create' | 'create-step2' | 'create-step3' | 'join-collab';

const googleProvider = new GoogleAuthProvider();

export default function ProjectHub({ onEnterProject }: Props) {
  const [projects, setProjects] = useState<StoredProject[]>(() => loadProjects());
  const [view, setView]       = useState<View>('hub');
  const [busy, setBusy]       = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError]     = useState('');
  const [googleUser, setGoogleUser] = useState<User | null>(null);

  // Create form
  const [newTitle, setNewTitle]       = useState('');
  const [newEmoji, setNewEmoji]       = useState('✈️');
  const [newStart, setNewStart]       = useState('');
  const [newEnd, setNewEnd]           = useState('');
  const [newDesc, setNewDesc]         = useState('');
  const [newCurrency, setNewCurrency] = useState('JPY');
  const [newRate, setNewRate]         = useState('');
  const [fetchingRate, setFetchingRate] = useState(false);

  // Destination geocoding
  const [newDestination, setNewDestination] = useState('');
  const [geocoding, setGeocoding]           = useState(false);
  const [geoResult, setGeoResult]           = useState<{ lat: number; lng: number; timezone: string; name: string } | null>(null);

  // Created project (used across step 2 / step 3)
  const [createdProject, setCreatedProject] = useState<StoredProject | null>(null);

  // Step-2 member card form
  const [memberName, setMemberName]       = useState('');
  const [memberColor, setMemberColor]     = useState('#ebcef5');
  const [savingMember, setSavingMember]   = useState(false);
  const [memberError, setMemberError]     = useState('');

  // Step-2 extra members (other travellers)
  const [extraMembers, setExtraMembers]   = useState<{ id: string; name: string; color: string }[]>([]);
  const [extraName, setExtraName]         = useState('');
  const [extraColor, setExtraColor]       = useState('#C8E6C9');
  const [showExtraForm, setShowExtraForm] = useState(false);

  // Step-3 bulk import
  const [bulkText, setBulkText]           = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkError, setBulkError]         = useState('');

  // Join form
  const [keyInput, setKeyInput]       = useState('');

  // Double-click delete
  const [deleteTarget, setDeleteTarget]     = useState<StoredProject | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deletingProject, setDeletingProject] = useState(false);

  // Track auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user && !user.isAnonymous) setGoogleUser(user);
      else setGoogleUser(null);
    });
    return unsub;
  }, []);

  // 統一用 signInWithPopup（不用 redirect），在 click handler 同步呼叫可相容 iOS Safari
  const handleGoogleSignIn = () => {
    signInWithPopup(auth, googleProvider)
      .then(result => {
        setGoogleUser(result.user);
        setSigningIn(false);
        setError('');
      })
      .catch((e: any) => {
        if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
          console.error('popup error:', e);
          setError(`登入失敗：${e.code || e.message}`);
        }
        setSigningIn(false);
      });
    setSigningIn(true);
    setError('');
  };

  // 42 emojis — 3 groups of 14: transport/nature, country flags, winter/scenery
  const EMOJI_OPTS = [
    '✈️','🚢','🚞','🌸','🏝','🌊','⛩','🍜','🍣','🎌','🌴','🏔','🎡','🗾',
    '🇯🇵','🇹🇼','🇰🇷','🇺🇸','🇫🇷','🇮🇹','🇬🇧','🇹🇭','🇦🇺','🇸🇬','🇭🇰','🇪🇸','🇩🇪','🇵🇹',
    '⛷️','🏂','❄️','🎿','🗻','🏕️','🚂','🌅','🌃','🏖️','🌄','🌉','🏯','🎯',
  ];

  const handleFetchRate = async () => {
    setFetchingRate(true);
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/TWD`);
      const data = await res.json();
      if (data?.rates?.[newCurrency]) {
        setNewRate(String(Math.round(1 / data.rates[newCurrency] * 100) / 100));
      } else {
        setError('無法取得匯率，請手動輸入');
      }
    } catch {
      setError('匯率查詢失敗，請手動輸入');
    }
    setFetchingRate(false);
  };

  const handleGeocode = async () => {
    const q = newDestination.trim();
    if (!q) return;
    setGeocoding(true); setGeoResult(null); setError('');
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=zh&format=json`);
      const data = await res.json();
      const r = data?.results?.[0];
      if (r) {
        setGeoResult({ lat: r.latitude, lng: r.longitude, timezone: r.timezone || 'Asia/Tokyo', name: r.name || q });
        // Auto-set currency if country is known
        const detectedCurrency = COUNTRY_CURRENCY[r.country_code?.toUpperCase()];
        if (detectedCurrency) setNewCurrency(detectedCurrency);
      } else {
        setError('找不到此地點，請嘗試英文地名');
      }
    } catch {
      setError('地點查詢失敗，請稍後重試');
    }
    setGeocoding(false);
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newStart) { setError('請填寫旅行名稱和出發日期'); return; }
    const user = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null;
    if (!user) { setError('請先登入 Google 帳號後再建立旅行'); return; }
    setBusy(true); setError('');
    try {
      const ref = await addDoc(collection(db, 'trips'), {
        title: newTitle.trim(), emoji: newEmoji,
        startDate: newStart, endDate: newEnd || newStart,
        description: newDesc.trim(),
        currency: newCurrency,
        exchangeRate: newRate ? parseFloat(newRate) : null,
        ownerUid: user.uid,
        ownerEmail: user.email || '',
        collaboratorKey: '', shareCode: '',
        createdAt: Timestamp.now(),
        // Location for weather
        locationLat:      geoResult?.lat      ?? null,
        locationLng:      geoResult?.lng      ?? null,
        locationTimezone: geoResult?.timezone ?? null,
        locationName:     (geoResult?.name ?? newDestination.trim()) || null,
      });
      const cKey = makeCollabKey(ref.id);
      const sCode = makeShareCode(ref.id);
      await writeTripMeta(ref.id, { collaboratorKey: cKey, shareCode: sCode });
      // 植入預設行李清單
      const listsCol = collection(doc(db, 'trips', ref.id), 'lists');
      await Promise.all(DEFAULT_PACKING.map(text =>
        addDoc(listsCol, {
          text, listType: 'packing', assignedTo: 'all',
          dueDate: '', checked: false,
          createdAt: new Date().toISOString(),
        })
      ));
      const p: StoredProject = {
        id: ref.id, title: newTitle.trim(), emoji: newEmoji,
        role: 'owner', collaboratorKey: cKey, shareCode: sCode, addedAt: Date.now(),
        startDate: newStart, endDate: newEnd || newStart, description: newDesc.trim(),
      };
      saveProject(p);
      setCreatedProject(p);
      // Pre-fill member name from Google display name
      const displayFirst = user.displayName?.split(/[\s_]+/)[0] || '';
      setMemberName(displayFirst);
      setMemberError('');
      setView('create-step2');
    } catch (e: any) { console.error(e); setError('建立失敗，請重試'); }
    setBusy(false);
  };

  const handleJoinCollab = async () => {
    const key = keyInput.trim().toUpperCase();
    if (!key) { setError('請輸入協作金鑰'); return; }
    const user = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null;
    if (!user) { setError('請先登入 Google 帳號後再加入行程'); return; }
    setBusy(true); setError('');
    try {
      const existing = projects.find(p => p.collaboratorKey === key);
      if (existing) {
        // Register editor UID in allowedEditorUids so owner can revoke
        if (user.uid) {
          try { await updateDoc(doc(db, 'trips', existing.id), { allowedEditorUids: arrayUnion(user.uid) }); }
          catch (e) { console.error('Failed to register editor UID:', e); }
        }
        const editorProject = { ...existing, role: 'editor' as TripRole };
        saveProject(editorProject);
        onEnterProject(editorProject);
        return;
      }

      if (key === DEFAULT_COLLAB) {
        ensureDefaultProject();
        const p = loadProjects().find(x => x.id === DEFAULT_TRIP_ID)!;
        onEnterProject({ ...p, role: 'editor' });
        return;
      }

      const parts = key.split('-');
      if (parts.length < 3 || parts[0] !== 'COLLAB') { setError('金鑰格式不正確'); setBusy(false); return; }

      setError('找不到符合的專案，請確認金鑰是否正確');
    } catch (e) { setError('加入失敗，請重試'); }
    setBusy(false);
  };

  // ── Delete project (owner only) ───────────────────────────────
  const handleDeleteProject = async () => {
    if (!deleteTarget || deleteConfirmInput !== deleteTarget.title) return;
    setDeletingProject(true);
    try {
      await deleteDoc(doc(db, 'trips', deleteTarget.id));
    } catch (e) { console.error('Firestore delete failed:', e); }
    const updated = loadProjects().filter(p => p.id !== deleteTarget.id);
    localStorage.setItem('tripmori_projects', JSON.stringify(updated));
    setProjects(updated);
    setDeleteTarget(null);
    setDeletingProject(false);
  };

  // ── Member card create helper ──────────────────────────────────
  const MEMBER_COLORS = ['#ebcef5', '#C8E6C9', '#B3E5FC', '#FFF9C4', '#FFD0B0', '#F8BBD9', '#D1C4E9', '#B2EBF2', '#aaa9ab'];

  const handleCreateMemberCard = async () => {
    if (!createdProject) return;
    setSavingMember(true); setMemberError('');
    try {
      const user = auth.currentUser;
      const membersCol = collection(db, 'trips', createdProject.id, 'members');
      // Save own card
      if (memberName.trim()) {
        await addDoc(membersCol, {
          name: memberName.trim(), color: memberColor,
          googleUid: user?.uid || null, email: user?.email || null,
          createdAt: Timestamp.now(),
        });
      }
      // Save extra members
      await Promise.all(extraMembers.map(m =>
        addDoc(membersCol, {
          name: m.name, color: m.color,
          googleUid: null, email: null,
          createdAt: Timestamp.now(),
        })
      ));
      setView('create-step3');
    } catch (e) { console.error(e); setMemberError('儲存失敗，請重試'); }
    setSavingMember(false);
  };

  // ── Bulk import parser ─────────────────────────────────────────
  // Format: YYYY-MM-DD,HH:MM,名稱[,類別][,地點]
  // Lines starting with # are comments
  const CATEGORY_ALIASES: Record<string, string> = {
    attraction: 'attraction', 景點: 'attraction', 活動: 'attraction',
    food: 'food', 餐廳: 'food', 飲食: 'food', 用餐: 'food',
    transport: 'transport', 交通: 'transport',
    hotel: 'hotel', 住宿: 'hotel', 飯店: 'hotel',
    shopping: 'shopping', 購物: 'shopping',
    misc: 'misc', 其他: 'misc',
  };

  const handleBulkImport = async () => {
    if (!createdProject || !bulkText.trim()) { onEnterProject(createdProject!); return; }
    setBulkImporting(true); setBulkError('');
    const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const eventsToAdd: any[] = [];
    const errors: string[] = [];
    lines.forEach((line, idx) => {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length < 3) { errors.push(`第 ${idx + 1} 行格式不正確`); return; }
      const [date, time, title, catRaw = '', location = ''] = parts;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push(`第 ${idx + 1} 行日期格式錯誤`); return; }
      if (!/^\d{2}:\d{2}$/.test(time)) { errors.push(`第 ${idx + 1} 行時間格式錯誤`); return; }
      if (!title) { errors.push(`第 ${idx + 1} 行缺少名稱`); return; }
      const category = CATEGORY_ALIASES[catRaw] || 'attraction';
      eventsToAdd.push({ date, startTime: time, endTime: '', title, category, location, notes: '', mapUrl: '', cost: 0, currency: createdProject.id ? 'JPY' : 'JPY', travelTime: '' });
    });
    if (errors.length > 0) { setBulkError(errors.slice(0, 3).join('\n') + (errors.length > 3 ? `\n⋯ 共 ${errors.length} 個錯誤` : '')); setBulkImporting(false); return; }
    try {
      const eventsCol = collection(db, 'trips', createdProject.id, 'events');
      await Promise.all(eventsToAdd.map(ev => addDoc(eventsCol, { ...ev, createdAt: Timestamp.now() })));
      onEnterProject(createdProject);
    } catch (e) { console.error(e); setBulkError('匯入失敗，請重試'); }
    setBulkImporting(false);
  };

  // ── Views ──────────────────────────────────────────────────────

  if (view === 'create-step2') return (
    <Screen title="👤 建立旅伴名單" onBack={() => {}} hideBack stepLabel="步驟 2 / 3">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ── 自己的卡片 ── */}
        <p style={{ fontSize: 12, fontWeight: 700, color: C.barkLight, margin: 0, letterSpacing: 0.5 }}>我的卡片</p>
        <div>
          <label style={labelStyle}>你的名稱（暱稱）</label>
          <input style={inputSt} placeholder="例：小明、Uu、Brian"
            value={memberName} onChange={e => setMemberName(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>卡片顏色</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {MEMBER_COLORS.map(c => (
              <button key={c} onClick={() => setMemberColor(c)}
                style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid ${memberColor === c ? C.sageDark : 'transparent'}`, background: c, cursor: 'pointer', flexShrink: 0 }} />
            ))}
          </div>
        </div>

        {/* ── 其他旅伴 ── */}
        <div style={{ borderTop: `1px solid ${C.creamDark}`, paddingTop: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.barkLight, margin: '0 0 10px', letterSpacing: 0.5 }}>其他旅伴</p>
          {extraMembers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {extraMembers.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12, background: 'var(--tm-card-bg)', border: `1.5px solid ${C.creamDark}` }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.bark }}>{m.name}</span>
                  <button onClick={() => setExtraMembers(prev => prev.filter(x => x.id !== m.id))}
                    style={{ background: 'none', border: 'none', color: C.barkLight, fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {showExtraForm ? (
            <div style={{ background: 'var(--tm-card-bg)', borderRadius: 14, padding: 14, border: `1.5px solid ${C.creamDark}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input style={inputSt} placeholder="旅伴名稱"
                value={extraName} onChange={e => setExtraName(e.target.value)} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                {MEMBER_COLORS.map(c => (
                  <button key={c} onClick={() => setExtraColor(c)}
                    style={{ width: 30, height: 30, borderRadius: '50%', border: `3px solid ${extraColor === c ? C.sageDark : 'transparent'}`, background: c, cursor: 'pointer', flexShrink: 0 }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setShowExtraForm(false); setExtraName(''); setExtraColor('#C8E6C9'); }}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'transparent', color: C.barkLight, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>取消</button>
                <button onClick={() => {
                  if (!extraName.trim()) return;
                  setExtraMembers(prev => [...prev, { id: Date.now().toString(), name: extraName.trim(), color: extraColor }]);
                  setExtraName(''); setExtraColor('#C8E6C9'); setShowExtraForm(false);
                }} disabled={!extraName.trim()}
                  style={{ flex: 2, padding: '9px 12px', borderRadius: 12, border: 'none', background: extraName.trim() ? C.sage : C.creamDark, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                  ＋ 加入
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowExtraForm(true)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1.5px dashed ${C.creamDark}`, background: 'transparent', color: C.barkLight, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
              ＋ 新增其他旅伴
            </button>
          )}
        </div>

        {memberError && <p style={{ fontSize: 12, color: '#C0392B', margin: 0 }}>{memberError}</p>}
        <button onClick={handleCreateMemberCard} disabled={savingMember}
          style={{ padding: 14, borderRadius: 14, border: 'none', background: C.earth, color: 'white', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT, opacity: savingMember ? 0.6 : 1 }}>
          {savingMember ? '儲存中...' : `✓ 完成（${[memberName.trim(), ...extraMembers.map(m => m.name)].filter(Boolean).length} 位旅伴）`}
        </button>
        <button onClick={() => setView('create-step3')}
          style={{ padding: 12, borderRadius: 14, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
          跳過，稍後再建
        </button>
      </div>
    </Screen>
  );

  const BULK_TEMPLATE =
`# 格式：日期,時間,名稱,類別(可選),地點(可選)
# 類別可填：attraction / food / transport / hotel / shopping / misc
# 以 # 開頭的行為註解，會被忽略
${createdProject?.startDate || 'YYYY-MM-DD'},09:00,早餐,food,飯店附近
${createdProject?.startDate || 'YYYY-MM-DD'},10:30,景點名稱,attraction,地點
${createdProject?.startDate || 'YYYY-MM-DD'},13:00,午餐,food,
${createdProject?.startDate || 'YYYY-MM-DD'},15:00,另一個景點,attraction,地點`;

  if (view === 'create-step3') return (
    <Screen title="📅 匯入行程（選填）" onBack={() => setView('create-step2')} stepLabel="步驟 3 / 3">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 13, color: C.barkLight, margin: 0, lineHeight: 1.6 }}>
          若已有行程規劃，可貼上資料一次匯入。留空直接跳過即可。
        </p>

        {/* 格式說明 */}
        <div style={{ background: 'var(--tm-note-2)', borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: 0 }}>📋 格式範本</p>
            <button
              onClick={() => { setBulkText(BULK_TEMPLATE); }}
              style={{ fontSize: 11, fontWeight: 700, color: C.sky, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, padding: 0 }}>
              套用範本 →
            </button>
          </div>
          <pre style={{ fontSize: 10, color: C.barkLight, margin: 0, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{BULK_TEMPLATE}</pre>
        </div>

        <textarea
          value={bulkText}
          onChange={e => { setBulkText(e.target.value); setBulkError(''); }}
          placeholder="貼上行程資料…"
          rows={8}
          style={{ ...inputSt, resize: 'vertical' as const, lineHeight: 1.7, fontFamily: 'monospace', fontSize: 12 }}
        />

        {bulkError && (
          <div style={{ background: '#FAE0E0', borderRadius: 12, padding: '10px 14px' }}>
            <p style={{ fontSize: 12, color: '#9A3A3A', margin: 0, whiteSpace: 'pre-line' }}>{bulkError}</p>
          </div>
        )}

        <button onClick={handleBulkImport} disabled={bulkImporting}
          style={{ padding: 14, borderRadius: 14, border: 'none', background: bulkText.trim() ? C.earth : C.sage, color: 'white', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT, opacity: bulkImporting ? 0.6 : 1 }}>
          {bulkImporting ? '匯入中...' : bulkText.trim() ? '📥 匯入並進入行程' : '🌸 開始規劃旅行 →'}
        </button>
        <button onClick={() => createdProject && onEnterProject(createdProject)}
          style={{ padding: 12, borderRadius: 14, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
          跳過，直接進入
        </button>
      </div>
    </Screen>
  );

  if (view === 'create') return (
    <Screen title="✈️ 建立新旅行" onBack={() => { setView('hub'); setError(''); }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!googleUser && (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--tm-note-1)', fontSize: 12, color: '#9A6800', fontWeight: 600 }}>
            ⚠️ 請先返回首頁登入 Google 帳號後再建立旅行
          </div>
        )}
        {/* Emoji */}
        <div>
          <label style={labelStyle}>旅行表情</label>
          <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 0' }}>
            {EMOJI_OPTS.map(e => (
              <button key={e} onClick={() => setNewEmoji(e)}
                style={{ width: 40, height: 40, fontSize: 22, borderRadius: 12, border: `2px solid ${newEmoji === e ? C.sageDark : C.creamDark}`, background: newEmoji === e ? C.sageLight : 'var(--tm-card-bg)', cursor: 'pointer', flexShrink: 0 }}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>旅行名稱 *</label>
          <input style={inputSt} placeholder="例：沖繩親子遊 2026" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>目的地城市（用於天氣預報）</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inputSt, flex: 1 }}
              placeholder="例：那霸、首爾、Bangkok"
              value={newDestination}
              onChange={e => { setNewDestination(e.target.value); setGeoResult(null); }} />
            <button onClick={handleGeocode} disabled={geocoding || !newDestination.trim()}
              style={{ padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.bark, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT, flexShrink: 0, opacity: (geocoding || !newDestination.trim()) ? 0.5 : 1 }}>
              {geocoding ? '查詢中' : '📍 定位'}
            </button>
          </div>
          {geoResult && (
            <p style={{ fontSize: 11, color: '#4A7A35', margin: '5px 0 0', fontWeight: 600 }}>
              ✓ {geoResult.name}　{geoResult.lat.toFixed(2)}, {geoResult.lng.toFixed(2)}　時區：{geoResult.timezone}
            </p>
          )}
          {!geoResult && newDestination.trim() && (
            <p style={{ fontSize: 11, color: C.barkLight, margin: '5px 0 0' }}>請按「📍 定位」取得座標以啟用即時天氣功能</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>出發日期 *</label>
            <input style={{ ...inputSt, padding: '10px 8px' }} type="date" value={newStart} onChange={e => setNewStart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>回程日期</label>
            <input style={{ ...inputSt, padding: '10px 8px' }} type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>旅行簡介（選填）</label>
          <textarea style={{ ...inputSt, minHeight: 72, resize: 'vertical' as const, lineHeight: 1.6 }}
            placeholder="目的地、主要行程..." value={newDesc} onChange={e => setNewDesc(e.target.value)} />
          <p style={{ fontSize: 11, color: C.barkLight, margin: '4px 0 0', lineHeight: 1.5 }}>
            此欄位內容將顯示在行程標題下方小字
          </p>
        </div>
        {/* ── 旅遊貨幣 + 匯率 ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ ...labelStyle, margin: 0 }}>主要旅遊貨幣</label>
            {geoResult && COUNTRY_CURRENCY[geoResult.name] === newCurrency && (
              <span style={{ fontSize: 10, color: '#4A7A35', fontWeight: 700 }}>✓ 依目的地自動填入</span>
            )}
          </div>
          <CurrencySearch value={newCurrency} onChange={code => { setNewCurrency(code); setNewRate(''); }} />
          <p style={{ fontSize: 11, color: C.barkLight, margin: '4px 0 0' }}>
            依目的地自動建議，可手動更換為其他幣值
          </p>
        </div>
        <div>
          <label style={labelStyle}>對台幣匯率（1 {newCurrency} = ? TWD）</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inputSt, flex: 1 }}
              type="number" min="0" step="0.01"
              placeholder="例：0.22"
              value={newRate} onChange={e => setNewRate(e.target.value)} />
            <button onClick={handleFetchRate} disabled={fetchingRate}
              style={{ padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.bark, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT, flexShrink: 0, opacity: fetchingRate ? 0.6 : 1 }}>
              {fetchingRate ? '查詢中' : '📡 即時查詢'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: C.barkLight, margin: '4px 0 0' }}>留空或稍後在記帳頁更新</p>
        </div>
        {error && <p style={{ fontSize: 12, color: '#C0392B', margin: 0 }}>{error}</p>}
        <button onClick={handleCreate} disabled={busy}
          style={{ padding: 14, borderRadius: 14, border: 'none', background: C.earth, color: 'white', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT, opacity: busy ? 0.6 : 1 }}>
          {busy ? '建立中...' : '🌸 建立旅行'}
        </button>
      </div>
    </Screen>
  );

  if (view === 'join-collab') return (
    <Screen title="🔑 輸入協作金鑰" onBack={() => { setView('hub'); setError(''); setKeyInput(''); }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 13, color: C.barkLight, margin: 0 }}>
          收到擁有者分享的協作金鑰後輸入，即可以「編輯者」身份加入行程。
        </p>
        <input style={inputSt} placeholder="COLLAB-XXXXXX-XXXX"
          value={keyInput} onChange={e => setKeyInput(e.target.value.toUpperCase())}
          autoCapitalize="characters" />
        {error && <p style={{ fontSize: 12, color: '#C0392B', margin: 0 }}>{error}</p>}
        <button onClick={handleJoinCollab} disabled={busy}
          style={{ padding: 14, borderRadius: 14, border: 'none', background: C.sage, color: 'white', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT, opacity: busy ? 0.6 : 1 }}>
          {busy ? '驗證中...' : '✓ 加入'}
        </button>
      </div>
    </Screen>
  );

  // ── Main hub view ─────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--tm-page-bg)', backgroundImage: 'radial-gradient(circle, var(--tm-dot-color) 1px, transparent 1px)', backgroundSize: '18px 18px', display: 'flex', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ width: '100%', maxWidth: 430, padding: '0 0 40px' }}>
        {/* Hero */}
        <div style={{ background: 'linear-gradient(150deg, #EDF5F4 0%, #F5EDE6 100%)', padding: '44px 24px 32px', textAlign: 'center', borderBottom: '1px solid #E0D9CF' }}>
          <img src="/logo.png" alt="TripMori" style={{ width: '72%', maxWidth: 260, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: '#8B7565', margin: 0, fontFamily: FONT, fontWeight: 600, letterSpacing: 0.3 }}>你的旅行規劃小幫手</p>
        </div>

        <div style={{ padding: '24px 20px' }}>

          {/* Google sign-in / user status */}
          {googleUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 16, background: '#E0F0D8', marginBottom: 20, border: '1.5px solid #C2E0B4', boxShadow: C.shadowSm }}>
              {googleUser.photoURL && (
                <img src={googleUser.photoURL} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid #A0CC88', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#4A7A35', margin: 0 }}>已登入 Google</p>
                <p style={{ fontSize: 12, color: '#6A8F5C', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{googleUser.displayName || googleUser.email}</p>
              </div>
              <button
                onClick={() => signOut(auth).catch(console.error)}
                style={{ fontSize: 11, fontWeight: 700, color: '#6A8F5C', background: 'none', border: '1px solid #A0CC88', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: FONT, flexShrink: 0 }}>
                登出
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              <div style={{ padding: '10px 14px', borderRadius: 12, background: '#FFF8E1', marginBottom: 10, fontSize: 12, color: '#9A6800', fontWeight: 600 }}>
                💡 建立或編輯行程需要登入 Google 帳號，訪客可直接使用分享連結進入
              </div>
              {error && <p style={{ fontSize: 12, color: '#C0392B', margin: '0 0 8px' }}>{error}</p>}
              <button onClick={handleGoogleSignIn} disabled={signingIn}
                style={{ width: '100%', padding: '13px 16px', borderRadius: 16, border: '1.5px solid #E0D9C8', background: 'var(--tm-card-bg)', cursor: signingIn ? 'default' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', boxShadow: C.shadowSm, opacity: signingIn ? 0.6 : 1 }}>
                <span style={{ fontSize: 18 }}>🔐</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1C3461' }}>{signingIn ? '登入中...' : '使用 Google 帳號登入'}</span>
              </button>
            </div>
          )}

          {/* My projects */}
          {projects.length > 0 && (
            <>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.barkLight, margin: '0 0 10px', letterSpacing: 0.5 }}>MY TRIPS</p>
              {deleteTarget && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24 }}>
                  <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: 24, padding: '28px 24px', width: '100%', maxWidth: 340, fontFamily: FONT, textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>🗑</div>
                    <p style={{ fontSize: 16, fontWeight: 700, color: C.bark, margin: '0 0 6px' }}>確認刪除旅行？</p>
                    <p style={{ fontSize: 12, color: C.barkLight, margin: '0 0 16px', lineHeight: 1.6 }}>
                      此操作無法復原。請輸入旅行名稱<br />
                      <strong style={{ color: C.bark }}>「{deleteTarget.title}」</strong> 確認刪除
                    </p>
                    <input
                      value={deleteConfirmInput}
                      onChange={e => setDeleteConfirmInput(e.target.value)}
                      placeholder={deleteTarget.title}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${deleteConfirmInput === deleteTarget.title ? '#E76F51' : C.creamDark}`, background: 'var(--tm-input-bg)', fontSize: 14, fontFamily: FONT, outline: 'none', color: C.bark, boxSizing: 'border-box', marginBottom: 16 }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setDeleteTarget(null); setDeleteConfirmInput(''); }} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>取消</button>
                      <button
                        onClick={handleDeleteProject}
                        disabled={deleteConfirmInput !== deleteTarget.title || deletingProject}
                        style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#E76F51', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: FONT, opacity: deleteConfirmInput !== deleteTarget.title || deletingProject ? 0.4 : 1 }}>
                        {deletingProject ? '刪除中...' : '確認刪除'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {projects.map(p => {
                  const rl = ROLE_LABEL[p.role];
                  return (
                    <div key={p.id} style={{ position: 'relative' }}>
                      <button
                        onClick={() => onEnterProject(p)}
                        onDoubleClick={p.role === 'owner' ? (e) => { e.preventDefault(); setDeleteTarget(p); setDeleteConfirmInput(''); } : undefined}
                        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 20, background: 'var(--tm-card-bg)', border: `2px solid ${C.creamDark}`, cursor: 'pointer', fontFamily: FONT, textAlign: 'left', boxShadow: C.shadowSm, width: '100%' }}>
                        <span style={{ fontSize: 28, flexShrink: 0 }}>{p.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 15, fontWeight: 700, color: C.bark, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: rl.color, background: rl.bg, borderRadius: 6, padding: '2px 8px' }}>{rl.label}</span>
                            {p.role === 'owner' && <span style={{ fontSize: 9, color: C.barkLight, opacity: 0.6 }}>長按兩下可刪除</span>}
                          </div>
                        </div>
                        <span style={{ fontSize: 20, color: C.barkLight }}>›</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Actions */}
          <p style={{ fontSize: 13, fontWeight: 700, color: C.barkLight, margin: '0 0 10px', letterSpacing: 0.5 }}>
            {projects.length === 0 ? '開始規劃旅行' : '加入更多'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ActionBtn emoji="✈️" title="建立新旅行" sub="從零開始規劃行程，成為擁有者（需登入 Google）" color={C.earth} onClick={() => { setView('create'); setError(''); }} />
            <ActionBtn emoji="🔑" title="輸入協作金鑰" sub="加入朋友的行程，可以共同編輯（需登入 Google）" color={C.sageDark} onClick={() => { setView('join-collab'); setError(''); setKeyInput(''); }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helper sub-components (top-level so they don't remount) ───────

function Screen({ title, onBack, children, hideBack, stepLabel }: { title: string; onBack: () => void; children: React.ReactNode; hideBack?: boolean; stepLabel?: string }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--tm-page-bg)', backgroundImage: 'radial-gradient(circle, var(--tm-dot-color) 1px, transparent 1px)', backgroundSize: '18px 18px', display: 'flex', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ width: '100%', maxWidth: 430 }}>
        <div style={{ background: 'linear-gradient(150deg, #EDF5F4 0%, #F5EDE6 100%)', padding: '20px 20px 24px', borderBottom: '1px solid #E0D9CF' }}>
          {!hideBack && (
            <button onClick={onBack} style={{ background: 'rgba(28,52,97,0.08)', border: 'none', borderRadius: 10, padding: '6px 12px', color: '#1C3461', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, marginBottom: 16 }}>‹ 返回</button>
          )}
          {stepLabel && (
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9A8C80', margin: hideBack ? '0 0 8px' : '0 0 8px', letterSpacing: 1 }}>{stepLabel}</p>
          )}
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1C3461', margin: 0, fontFamily: FONT }}>{title}</h2>
        </div>
        <div style={{ padding: '24px 20px' }}>{children}</div>
      </div>
    </div>
  );
}

function ActionBtn({ emoji, title, sub, color, onClick }: { emoji: string; title: string; sub: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 20, background: 'var(--tm-card-bg)', border: `2px solid ${C.creamDark}`, cursor: 'pointer', fontFamily: FONT, textAlign: 'left', boxShadow: C.shadowSm }}>
      <div style={{ width: 44, height: 44, borderRadius: 14, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{emoji}</div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{title}</p>
        <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>{sub}</p>
      </div>
      <span style={{ fontSize: 20, color: C.barkLight }}>›</span>
    </button>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#8C7B6E', display: 'block', marginBottom: 6 };
const inputSt: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--tm-cream-dark)', background: 'var(--tm-input-bg)', fontSize: 16, color: 'var(--tm-bark)', outline: 'none', fontFamily: "'M PLUS Rounded 1c', 'Noto Sans TC', sans-serif" };
