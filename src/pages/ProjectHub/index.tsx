/**
 * ProjectHub — 多專案選擇 / 建立 / 加入 畫面
 * 進入 App 時如果沒有 active project 就顯示此頁。
 */
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlane, faKey, faTriangleExclamation, faLocationDot, faLightbulb, faLock, faPen, faTrashCan, faClipboardList, faFileImport, faUsers, faAddressBook, faCalendarPlus, faArrowRight, faTowerBroadcast, faPlus } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { db, auth } from '../../config/firebase';
import { parseUniversalImport, UNIVERSAL_TEMPLATE, UNIVERSAL_SAMPLE } from '../../utils/universalImporter';
import { collection, doc, setDoc, addDoc, updateDoc, deleteDoc, arrayUnion, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { C, FONT } from '../../App';
import CurrencySearch from '../../components/CurrencySearch';
import DateRangePicker from '../../components/DateRangePicker';

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
  currency?: string;
  archived?: boolean;
  memberOrder?: string[];
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
  // `justJoinedViaKey` signals the App to open the member-bind modal after mount,
  // so a freshly upgraded editor is immediately prompted to pick a member card.
  onEnterProject: (project: StoredProject, justJoinedViaKey?: boolean) => void;
  syncedProjects?: StoredProject[];
}

const ROLE_LABEL: Record<TripRole, { label: string; color: string; bg: string }> = {
  owner:   { label: '擁有者', color: '#4A7A35', bg: '#E0F0D8' },
  editor:  { label: '編輯者', color: '#9A6800', bg: '#FFF2CC' },
  visitor: { label: '訪客',   color: '#2A6A9A', bg: '#D8EDF8' },
};

type View = 'hub' | 'create' | 'create-step2' | 'create-step3' | 'join-collab';

const googleProvider = new GoogleAuthProvider();

export default function ProjectHub({ onEnterProject, syncedProjects }: Props) {
  const [projects, setProjects] = useState<StoredProject[]>(() => loadProjects());
  const [view, setView]       = useState<View>('hub');
  const [busy, setBusy]       = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError]     = useState('');
  const [googleUser, setGoogleUser] = useState<User | null>(null);

  // When App.tsx finishes syncUserTrips, it passes the updated list directly as a prop
  // This is reliable regardless of mount timing — no storage event needed
  useEffect(() => {
    if (syncedProjects !== undefined) {
      // If synced list is non-empty, use it; if empty (logout/no account), still show
      // whatever is in localStorage (visitor trips etc. that we can't query in Firestore)
      const local = loadProjects();
      const merged = syncedProjects.length > 0 ? syncedProjects : local;
      setProjects(merged);
    }
  }, [syncedProjects]);

  // Cross-tab sync (other browser tabs updating localStorage)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'tripmori_projects') setProjects(loadProjects());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

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

  // Edit mode (project management)
  const [isEditMode, setIsEditMode]         = useState(false);
  const [deleteTarget, setDeleteTarget]     = useState<StoredProject | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [archivedOpen, setArchivedOpen]     = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const isTripEnded = (p: StoredProject) => !!(p.endDate && p.endDate < today);

  const archiveProject = (id: string) => {
    const updated = loadProjects().map(p => p.id === id ? { ...p, archived: true } : p);
    localStorage.setItem('tripmori_projects', JSON.stringify(updated));
    setProjects(updated);
  };
  const unarchiveProject = (id: string) => {
    const updated = loadProjects().map(p => p.id === id ? { ...p, archived: false } : p);
    localStorage.setItem('tripmori_projects', JSON.stringify(updated));
    setProjects(updated);
  };

  const sortByDate = (list: StoredProject[]) =>
    [...list].sort((a, b) => {
      const da = a.startDate || '9999';
      const db2 = b.startDate || '9999';
      return da.localeCompare(db2);
    });

  const activeProjects   = sortByDate(projects.filter(p => !p.archived));
  const archivedProjects = sortByDate(projects.filter(p => p.archived));
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
    setFetchingRate(true); setError('');
    const STATIC_RATES: Record<string, number> = {
      JPY: 0.22, KRW: 0.024, THB: 0.9, SGD: 24, HKD: 4.1,
      USD: 33, EUR: 36, AUD: 21, GBP: 42, MYR: 7.4,
      VND: 0.0013, IDR: 0.002, CNY: 4.6, CHF: 37,
    };
    try {
      let rate: number | null = null;
      // Try TWD base first
      try {
        const res = await fetch(`https://open.er-api.com/v6/latest/TWD`);
        const data = await res.json();
        if (data?.rates?.[newCurrency]) {
          rate = Math.round(1 / data.rates[newCurrency] * 100) / 100;
        }
      } catch { /* try fallback */ }
      // Fallback: USD base → cross rate
      if (!rate) {
        try {
          const res = await fetch(`https://open.er-api.com/v6/latest/USD`);
          const data = await res.json();
          if (data?.rates?.TWD && data?.rates?.[newCurrency]) {
            rate = Math.round(data.rates.TWD / data.rates[newCurrency] * 100) / 100;
          }
        } catch { /* ignore */ }
      }
      if (rate) {
        setNewRate(String(rate));
      } else if (STATIC_RATES[newCurrency]) {
        setNewRate(String(STATIC_RATES[newCurrency]));
        setError('（已使用參考匯率，建議確認最新匯率）');
      } else {
        setError('無法取得匯率，請手動輸入');
      }
    } catch {
      if (STATIC_RATES[newCurrency]) {
        setNewRate(String(STATIC_RATES[newCurrency]));
        setError('（已使用參考匯率）');
      } else {
        setError('匯率查詢失敗，請手動輸入');
      }
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
        ownerEmail: (user.email || '').toLowerCase(),
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
        currency: newCurrency,
      };
      saveProject(p);
      // Mark onboarding pending so the creator track fires when the user
      // lands in the newly-created trip (App.tsx consumes this on mount).
      try { localStorage.setItem('tripmori_onboarding_pending', 'creator'); } catch { /* ignore storage errors */ }
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

    const registerAndEnter = async (tripId: string, project: StoredProject) => {
      if (user.uid) {
        // Use the addEditor Cloud Function (Admin SDK) instead of a direct
        // updateDoc — Firestore rules only allow owners to update the trip
        // doc, so a direct write silently fails for the joining user and
        // leaves allowedEditorUids out of sync with the local "editor" role.
        const fnClient = getFunctions(undefined, 'us-central1');
        await httpsCallable(fnClient, 'addEditor')({ tripId, collaboratorKey: key });
      }
      const editorProject: StoredProject = { ...project, role: 'editor' as TripRole };
      saveProject(editorProject);
      onEnterProject(editorProject, true);
    };

    try {
      // 1. Fast path: project already in localStorage
      const existing = projects.find(p => p.collaboratorKey === key);
      if (existing) {
        await registerAndEnter(existing.id, existing);
        return;
      }

      // 2. Default demo project shortcut
      if (key === DEFAULT_COLLAB) {
        ensureDefaultProject();
        const p = loadProjects().find(x => x.id === DEFAULT_TRIP_ID)!;
        onEnterProject({ ...p, role: 'editor' });
        return;
      }

      // 3. Basic format check before hitting Firestore
      const parts = key.split('-');
      if (parts.length < 3 || parts[0] !== 'COLLAB') {
        setError('金鑰格式不正確'); setBusy(false); return;
      }

      // 4. Query Firestore — find the trip whose collaboratorKey matches
      const snap = await getDocs(query(collection(db, 'trips'), where('collaboratorKey', '==', key)));
      if (snap.empty) {
        setError('找不到符合的專案，請確認金鑰是否正確'); setBusy(false); return;
      }

      const tripDoc = snap.docs[0];
      const data    = tripDoc.data();
      const newProject: StoredProject = {
        id: tripDoc.id,
        title: data.title || '旅行行程',
        emoji: data.emoji || '✈️',
        role: 'editor',
        collaboratorKey: key,
        shareCode: data.shareCode || '',
        addedAt: Date.now(),
        startDate: data.startDate || '',
        endDate: data.endDate || '',
        description: data.description || '',
      };
      await registerAndEnter(tripDoc.id, newProject);
    } catch (e) { console.error(e); setError('加入失敗，請重試'); }
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
          googleUid: user?.uid || '',
          googleEmail: (user?.email || '').toLowerCase(),
          createdAt: Timestamp.now(),
        });
        localStorage.setItem('tripmori_current_user', memberName.trim());
      }
      // Save extra members
      await Promise.all(extraMembers.map(m =>
        addDoc(membersCol, {
          name: m.name, color: m.color,
          googleUid: '', googleEmail: '',
          createdAt: Timestamp.now(),
        })
      ));
      setView('create-step3');
    } catch (e) { console.error(e); setMemberError('儲存失敗，請重試'); }
    setSavingMember(false);
  };

  // ── Universal bulk import ──────────────────────────────────────
  const [bulkCopied, setBulkCopied] = useState(false);

  const copyTemplate = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setBulkCopied(true);
      setTimeout(() => setBulkCopied(false), 2000);
    });
  };

  const handleBulkImport = async () => {
    if (!createdProject) { onEnterProject(createdProject!); return; }
    if (!bulkText.trim()) { onEnterProject(createdProject); return; }
    setBulkImporting(true); setBulkError('');
    const currency = (createdProject as any).currency || 'JPY';
    const parsed = parseUniversalImport(bulkText, currency);
    if (parsed.errors.length > 0) {
      setBulkError(parsed.errors.slice(0, 5).join('\n') + (parsed.errors.length > 5 ? `\n⋯ 共 ${parsed.errors.length} 個錯誤` : ''));
      setBulkImporting(false);
      return;
    }
    try {
      const tripRef = doc(db, 'trips', createdProject.id);
      const tripUpdate: any = {};
      if (parsed.flights.length)  tripUpdate.staticFlights = parsed.flights;
      if (parsed.hotels.length)   tripUpdate.staticHotels  = parsed.hotels;
      if (parsed.car)             tripUpdate.staticCars     = [parsed.car];
      if (Object.keys(tripUpdate).length) await updateDoc(tripRef, tripUpdate);

      const eventsCol   = collection(db, 'trips', createdProject.id, 'events');
      const bookingsCol = collection(db, 'trips', createdProject.id, 'bookings');
      await Promise.all([
        ...parsed.events.map(ev => addDoc(eventsCol, { ...ev, createdAt: Timestamp.now() })),
        ...parsed.bookings.map(b  => addDoc(bookingsCol, { ...b, createdAt: Timestamp.now() })),
      ]);
      onEnterProject(createdProject);
    } catch (e) { console.error(e); setBulkError('匯入失敗，請重試'); }
    setBulkImporting(false);
  };

  // ── Views ──────────────────────────────────────────────────────

  if (view === 'create-step2') return (
    <Screen title={<><FontAwesomeIcon icon={faAddressBook} style={{ marginRight: 8 }} />建立旅伴名單</>} onBack={() => {}} hideBack stepLabel="步驟 2 / 3">
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            {MEMBER_COLORS.map(c => (
              <button key={c} onClick={() => setMemberColor(c)}
                style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid ${memberColor === c ? C.sageDark : 'transparent'}`, background: c, cursor: 'pointer', flexShrink: 0 }} />
            ))}
            <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'conic-gradient(#FAE0E0, #ebcef5, #D8EDF8, #E0F0D8, #FFF2CC, #FFD0B0, #F8BBD9, #FAE0E0)', border: `3px solid ${!MEMBER_COLORS.includes(memberColor) ? C.sageDark : 'transparent'}` }} />
              <input type="color" value={memberColor} onChange={e => setMemberColor(e.target.value)}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', borderRadius: '50%' }} />
            </div>
            {!MEMBER_COLORS.includes(memberColor) && (
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: memberColor, border: `3px solid ${C.sageDark}`, flexShrink: 0 }} />
            )}
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
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                {MEMBER_COLORS.map(c => (
                  <button key={c} onClick={() => setExtraColor(c)}
                    style={{ width: 30, height: 30, borderRadius: '50%', border: `3px solid ${extraColor === c ? C.sageDark : 'transparent'}`, background: c, cursor: 'pointer', flexShrink: 0 }} />
                ))}
                <div style={{ position: 'relative', width: 30, height: 30, flexShrink: 0 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'conic-gradient(#FAE0E0, #ebcef5, #D8EDF8, #E0F0D8, #FFF2CC, #FFD0B0, #F8BBD9, #FAE0E0)', border: `3px solid ${!MEMBER_COLORS.includes(extraColor) ? C.sageDark : 'transparent'}` }} />
                  <input type="color" value={extraColor} onChange={e => setExtraColor(e.target.value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', borderRadius: '50%' }} />
                </div>
                {!MEMBER_COLORS.includes(extraColor) && (
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: extraColor, border: `3px solid ${C.sageDark}`, flexShrink: 0 }} />
                )}
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

        {memberError && <p className="tm-error-text" style={{ fontSize: 12, color: '#C0392B', margin: 0 }}>{memberError}</p>}
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

  if (view === 'create-step3') return (
    <Screen title={<><FontAwesomeIcon icon={faCalendarPlus} style={{ marginRight: 8 }} />匯入行程（選填）</>} onBack={() => setView('create-step2')} stepLabel="步驟 3 / 3">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 13, color: C.barkLight, margin: 0, lineHeight: 1.6 }}>
          若已有機票、住宿或行程規劃，可貼上資料一次匯入。留空直接跳過即可。
        </p>

        {/* ① 格式範本 */}
        <div style={{ background: 'var(--tm-note-2)', borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.bark, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FontAwesomeIcon icon={faClipboardList} />格式範本
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => copyTemplate(UNIVERSAL_TEMPLATE)}
                style={{ fontSize: 11, fontWeight: 700, color: C.sageDark, background: 'none', border: `1px solid ${C.sageDark}`, borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT }}>
                {bulkCopied ? '✓ 已複製' : '複製空白範本'}
              </button>
              <button onClick={() => setBulkText(UNIVERSAL_SAMPLE)}
                style={{ fontSize: 11, fontWeight: 700, color: C.sky, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, padding: 0 }}>
                套用範例 →
              </button>
            </div>
          </div>
          <pre style={{ fontSize: 10, color: C.barkLight, margin: 0, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{UNIVERSAL_TEMPLATE}</pre>
          <p style={{ fontSize: 10, color: C.barkLight, margin: '8px 0 0', lineHeight: 1.5 }}>
            ✦ 非必填資訊（確認碼、房型、地圖連結等）可於匯入後點選卡片再補齊
          </p>
        </div>

        <textarea
          value={bulkText}
          onChange={e => { setBulkText(e.target.value); setBulkError(''); }}
          placeholder="將空白範本貼至此處，填入內容後匯入…"
          rows={10}
          style={{ ...inputSt, resize: 'vertical' as const, lineHeight: 1.7, fontFamily: 'monospace', fontSize: 12 }}
        />

        {bulkError && (
          <div style={{ background: '#FAE0E0', borderRadius: 12, padding: '10px 14px' }}>
            <p style={{ fontSize: 12, color: '#9A3A3A', margin: 0, whiteSpace: 'pre-line' }}>{bulkError}</p>
          </div>
        )}

        <button onClick={handleBulkImport} disabled={bulkImporting}
          style={{ padding: 14, borderRadius: 14, border: 'none', background: bulkText.trim() ? C.earth : C.sage, color: 'white', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT, opacity: bulkImporting ? 0.6 : 1 }}>
          {bulkImporting ? '匯入中...' : bulkText.trim() ? <><FontAwesomeIcon icon={faFileImport} style={{ marginRight: 6 }} />匯入並進入行程</> : <><FontAwesomeIcon icon={faArrowRight} style={{ marginRight: 6 }} />開始規劃旅行</>}
        </button>
        <button onClick={() => createdProject && onEnterProject(createdProject)}
          style={{ padding: 12, borderRadius: 14, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
          跳過，直接進入
        </button>
      </div>
    </Screen>
  );

  if (view === 'create') return (
    <Screen title={<><FontAwesomeIcon icon={faPlane} style={{ marginRight: 8 }} />建立新旅行</>} onBack={() => { setView('hub'); setError(''); }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!googleUser && (
          <div className="tm-amber-text" style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--tm-note-1)', fontSize: 12, color: '#9A6800', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FontAwesomeIcon icon={faTriangleExclamation} />請先返回首頁登入 Google 帳號後再建立旅行
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
              {geocoding ? '查詢中' : <><FontAwesomeIcon icon={faLocationDot} style={{ marginRight: 4 }} />定位</>}
            </button>
          </div>
          {geoResult && (
            <p style={{ fontSize: 11, color: '#4A7A35', margin: '5px 0 0', fontWeight: 600 }}>
              ✓ {geoResult.name}　{geoResult.lat.toFixed(2)}, {geoResult.lng.toFixed(2)}　時區：{geoResult.timezone}
            </p>
          )}
          {!geoResult && newDestination.trim() && (
            <p style={{ fontSize: 11, color: C.barkLight, margin: '5px 0 0' }}>請按「<FontAwesomeIcon icon={faLocationDot} style={{ margin: '0 2px' }} />定位」取得座標以啟用即時天氣功能</p>
          )}
        </div>
        <div>
          <label style={labelStyle}>出發 → 回程日期 *</label>
          <DateRangePicker
            startDate={newStart}
            endDate={newEnd}
            onChange={(start, end) => { setNewStart(start); setNewEnd(end); }}
          />
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
              {fetchingRate ? '查詢中' : <><FontAwesomeIcon icon={faTowerBroadcast} style={{ marginRight: 4 }} />即時查詢</>}
            </button>
          </div>
          <p style={{ fontSize: 11, color: C.barkLight, margin: '4px 0 0' }}>留空或稍後在「行程頁面 → 編輯旅行設定」調整</p>
        </div>
        {error && <p className="tm-error-text" style={{ fontSize: 12, color: '#C0392B', margin: 0 }}>{error}</p>}
        <button onClick={handleCreate} disabled={busy}
          style={{ padding: 14, borderRadius: 14, border: 'none', background: C.earth, color: 'white', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT, opacity: busy ? 0.6 : 1 }}>
          {busy ? '建立中...' : <><FontAwesomeIcon icon={faPlus} style={{ marginRight: 6 }} />建立旅行</>}
        </button>
      </div>
    </Screen>
  );

  if (view === 'join-collab') return (
    <Screen title={<><FontAwesomeIcon icon={faKey} style={{ marginRight: 8 }} />輸入協作金鑰</>} onBack={() => { setView('hub'); setError(''); setKeyInput(''); }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 13, color: C.barkLight, margin: 0 }}>
          收到擁有者分享的協作金鑰後輸入，即可以「編輯者」身份加入行程。
        </p>
        <input style={inputSt} placeholder="COLLAB-XXXXXX-XXXX"
          value={keyInput} onChange={e => setKeyInput(e.target.value.toUpperCase())}
          autoCapitalize="characters" />
        {error && <p className="tm-error-text" style={{ fontSize: 12, color: '#C0392B', margin: 0 }}>{error}</p>}
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
        <div className="tm-hero-welcome" style={{ background: 'linear-gradient(150deg, #EDF5F4 0%, #F5EDE6 100%)', padding: '44px 24px 32px', textAlign: 'center', borderBottom: '1px solid #E0D9CF' }}>
          <img src="/logo.png" alt="TripMori" style={{ width: '72%', maxWidth: 260, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: '#8B7565', margin: 0, fontFamily: FONT, fontWeight: 600, letterSpacing: 0.3 }}>你的旅行規劃小幫手</p>
        </div>

        <div style={{ padding: '24px 20px' }}>

          {/* Google sign-in / user status */}
          {googleUser ? (
            <div className="tm-status-success" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 16, background: '#E0F0D8', marginBottom: 20, border: '1.5px solid #C2E0B4', boxShadow: C.shadowSm }}>
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
              <div className="tm-signin-tip" style={{ padding: '12px 14px', borderRadius: 14, marginBottom: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 700, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FontAwesomeIcon icon={faLightbulb} />溫馨提醒
                </p>
                <p style={{ fontSize: 12, margin: '0 0 3px', lineHeight: 1.6 }}>若要「建立」或「編輯」行程，請先登入 Google 帳號。</p>
                <p style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>訪客仍可透過「分享連結」直接進入預覽行程。</p>
              </div>
              {error && <p className="tm-error-text" style={{ fontSize: 12, color: '#C0392B', margin: '0 0 8px' }}>{error}</p>}
              <button onClick={handleGoogleSignIn} disabled={signingIn}
                style={{ width: '100%', padding: '13px 16px', borderRadius: 16, border: '1.5px solid var(--tm-cream-dark)', background: 'var(--tm-card-bg)', cursor: signingIn ? 'default' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', boxShadow: C.shadowSm, opacity: signingIn ? 0.6 : 1 }}>
                <span className="tm-signin-btn-text" style={{ fontSize: 18 }}><FontAwesomeIcon icon={faLock} /></span>
                <span className="tm-signin-btn-text" style={{ fontSize: 14, fontWeight: 700 }}>{signingIn ? '登入中...' : '使用 Google 帳號登入'}</span>
              </button>
            </div>
          )}

          {/* My projects */}
          {projects.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 10px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.barkLight, margin: 0, letterSpacing: 0.5 }}>MY TRIPS</p>
                {projects.some(p => p.role === 'owner') && (
                  isEditMode
                    ? <button onClick={() => setIsEditMode(false)} style={{ fontSize: 11, fontWeight: 700, color: C.sage, background: '#E8F5E2', border: '1.5px solid #B5CFA7', borderRadius: 8, padding: '3px 12px', cursor: 'pointer', fontFamily: FONT }}>完成</button>
                    : <button onClick={() => setIsEditMode(true)} style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: C.barkLight }}><FontAwesomeIcon icon={faPen} /></button>
                )}
              </div>
              {deleteTarget && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24 }}>
                  <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: 24, padding: '28px 24px', width: '100%', maxWidth: 340, fontFamily: FONT, textAlign: 'center', boxSizing: 'border-box' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}><FontAwesomeIcon icon={faTrashCan} /></div>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {activeProjects.map(p => {
                  const rl = ROLE_LABEL[p.role];
                  const ended = isTripEnded(p);
                  return (
                    <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {isEditMode && p.role === 'owner' && (
                          <button
                            onClick={() => { setDeleteTarget(p); setDeleteConfirmInput(''); }}
                            style={{ width: 32, height: 32, borderRadius: '50%', background: '#E76F51', border: 'none', color: 'white', fontSize: 16, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            −
                          </button>
                        )}
                        <button
                          onClick={() => { if (!isEditMode) onEnterProject(p); }}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: ended ? '20px 20px 0 0' : 20, background: 'var(--tm-card-bg)', border: `2px solid ${isEditMode && p.role === 'owner' ? '#E76F51' : ended ? '#D0C4B0' : C.creamDark}`, borderBottom: ended ? 'none' : undefined, cursor: isEditMode ? 'default' : 'pointer', fontFamily: FONT, textAlign: 'left', boxShadow: ended ? 'none' : C.shadowSm, opacity: ended ? 0.85 : 1 }}>
                          <span style={{ fontSize: 28, flexShrink: 0 }}>{p.emoji}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 15, fontWeight: 700, color: C.bark, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: rl.color, background: rl.bg, borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>{rl.label}</span>
                              {ended && <span style={{ fontSize: 10, fontWeight: 700, color: '#8A7060', background: '#EDE8DF', borderRadius: 6, padding: '2px 6px', whiteSpace: 'nowrap', flexShrink: 0 }}>🏁 已結束</span>}
                              {p.startDate && <span style={{ fontSize: 10, color: C.barkLight, whiteSpace: 'nowrap' }}>{p.startDate}{p.endDate ? ` – ${p.endDate}` : ''}</span>}
                            </div>
                          </div>
                          {!isEditMode && <span style={{ fontSize: 20, color: C.barkLight }}>›</span>}
                        </button>
                      </div>
                      {/* Ended trip: archive prompt bar */}
                      {ended && !isEditMode && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F5F0E8', border: `2px solid #D0C4B0`, borderTop: 'none', borderRadius: '0 0 20px 20px', padding: '8px 16px', boxShadow: C.shadowSm }}>
                          <span style={{ fontSize: 11, color: C.barkLight }}>移至「已結束」區塊？</span>
                          <button onClick={() => archiveProject(p.id)}
                            style={{ fontSize: 11, fontWeight: 700, color: '#8A7060', background: '#EDE8DF', border: 'none', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontFamily: FONT }}>
                            移過去
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 已結束 section */}
              {archivedProjects.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <button onClick={() => setArchivedOpen(v => !v)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 2px', fontFamily: FONT, marginBottom: archivedOpen ? 8 : 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.barkLight, margin: 0, letterSpacing: 0.5 }}>🏁 已結束 ({archivedProjects.length})</p>
                    <span style={{ fontSize: 12, color: C.barkLight }}>{archivedOpen ? '▲' : '▼'}</span>
                  </button>
                  {archivedOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {archivedProjects.map(p => {
                        const rl = ROLE_LABEL[p.role];
                        return (
                          <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button
                              onClick={() => { if (!isEditMode) onEnterProject(p); }}
                              style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 16, background: 'var(--tm-card-bg)', border: `2px solid ${C.creamDark}`, cursor: 'pointer', fontFamily: FONT, textAlign: 'left', opacity: 0.7 }}>
                              <span style={{ fontSize: 24, flexShrink: 0 }}>{p.emoji}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
                                <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: rl.color, background: rl.bg, borderRadius: 6, padding: '2px 8px' }}>{rl.label}</span>
                                  {p.startDate && <span style={{ fontSize: 10, color: C.barkLight }}>{p.startDate}{p.endDate ? ` – ${p.endDate}` : ''}</span>}
                                </div>
                              </div>
                              <button onClick={e => { e.stopPropagation(); unarchiveProject(p.id); }}
                                style={{ fontSize: 10, fontWeight: 700, color: C.sageDark, background: '#E8F5E2', border: 'none', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontFamily: FONT, flexShrink: 0 }}>
                                恢復
                              </button>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <p style={{ fontSize: 13, fontWeight: 700, color: C.barkLight, margin: '0 0 10px', letterSpacing: 0.5 }}>
            {projects.length === 0 ? '開始規劃旅行' : '加入更多'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ActionBtn icon={faPlane} title="建立新旅行" sub="從零開始規劃行程，成為擁有者（需登入 Google）" color={C.earth} onClick={() => { setView('create'); setError(''); }} />
            <ActionBtn icon={faKey} title="輸入協作金鑰" sub="加入朋友的行程，可以共同編輯（需登入 Google）" color={C.sageDark} onClick={() => { setView('join-collab'); setError(''); setKeyInput(''); }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helper sub-components (top-level so they don't remount) ───────

function Screen({ title, onBack, children, hideBack, stepLabel }: { title: ReactNode; onBack: () => void; children: ReactNode; hideBack?: boolean; stepLabel?: string }) {
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

function ActionBtn({ icon, title, sub, color, onClick }: { icon: IconDefinition; title: string; sub: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 20, background: 'var(--tm-card-bg)', border: `2px solid ${C.creamDark}`, cursor: 'pointer', fontFamily: FONT, textAlign: 'left', boxShadow: C.shadowSm }}>
      <div style={{ width: 44, height: 44, borderRadius: 14, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, color }}><FontAwesomeIcon icon={icon} /></div>
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
