import { useEffect, useMemo, useRef, useState } from 'react';
import { db, auth } from './config/firebase';
import { collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, Timestamp, getDoc, query, where, getDocs, arrayUnion } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { signInAnonymously, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLightbulb, faEye } from '@fortawesome/free-solid-svg-icons';
import BottomNav from './components/layout/BottomNav';
import SplashScreen from './components/SplashScreen';
import SchedulePage from './pages/Schedule/index';
import BookingsPage from './pages/Bookings/index';
import ExpensePage from './pages/Expense/index';
import JournalPage from './pages/Journal/index';
import PlanningPage from './pages/Planning/index';
import MembersPage from './pages/Members/index';
import { useFcm } from './hooks/useFcm';
import ProjectHub, {
  ensureDefaultProject, loadProjects, saveProject, removeProject, setActiveProject, getActiveProject,
  checkOwnerRole,
} from './pages/ProjectHub/index';
import type { StoredProject, TripRole } from './pages/ProjectHub/index';

export const TRIP_ID = "74pfE7RXyEIusEdRV0rZ"; // default / fallback
export const C = {
  cream: 'var(--tm-cream)', creamDark: 'var(--tm-cream-dark)',
  sage: 'var(--tm-sage)', sageDark: 'var(--tm-sage-dark)', sageLight: 'var(--tm-sage-light)',
  earth: 'var(--tm-earth)', bark: 'var(--tm-bark)', barkLight: 'var(--tm-bark-light)',
  sky: 'var(--tm-sky)', blush: 'var(--tm-blush)', honey: 'var(--tm-honey)',
  shadow: '3px 3px 0px var(--tm-shadow)', shadowSm: '2px 2px 0px var(--tm-shadow)',
};
export const FONT = "'M PLUS Rounded 1c', 'Noto Sans TC', sans-serif";
export const cardStyle: React.CSSProperties = { background: 'var(--tm-card-bg)', borderRadius: 20, padding: '14px 16px', boxShadow: C.shadow, marginBottom: 10, border: '1px solid var(--tm-card-border)' };
export const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid var(--tm-input-border)', background: 'var(--tm-input-bg)', fontSize: 16, color: 'var(--tm-bark)', outline: 'none', fontFamily: FONT, boxSizing: 'border-box' };
export const btnPrimary = (color = C.sage): React.CSSProperties => ({ background: color, color: 'white', border: 'none', borderRadius: 14, padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: C.shadowSm, fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 });

/** 超過 5 行自動摺疊，收起時顯示前 2 行 */
export function ExpandableNotes({ notes, color, margin }: { notes: string; color: string; margin?: string }) {
  const [expanded, setExpanded] = useState(false);
  const lineCount = (notes.match(/\n/g) || []).length + 1;
  const isLong = lineCount > 5 || notes.length > 200;
  return (
    <div style={{ margin: margin ?? '4px 0 0' }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, fontSize: 11, color: color, opacity: 0.7 }}><FontAwesomeIcon icon={faLightbulb} /></span>
        <span style={{
          fontSize: 11, color, fontStyle: 'italic', lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          ...(isLong && !expanded ? {
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
          } : {}),
        }}>{notes}</span>
      </div>
      {isLong && (
        <button onClick={() => setExpanded(v => !v)} style={{
          background: 'none', border: 'none', padding: '3px 0 0 16px',
          fontSize: 10, color, opacity: 0.7, cursor: 'pointer',
          fontFamily: FONT, display: 'block',
        }}>
          {expanded ? '▲ 收起' : '▼ 展開全文'}
        </button>
      )}
    </div>
  );
}
export const CATEGORY_MAP: Record<string, { label: string; bg: string; text: string; emoji: string }> = {
  attraction:  { label: '景點', bg: '#E0F0D8', text: '#4A7A35', emoji: '🌿' },
  food:        { label: '美食', bg: '#FFF2CC', text: '#9A7200', emoji: '🍜' },
  experience:  { label: '體驗', bg: '#EDE0F8', text: '#7A3A9A', emoji: '🎨' },
  transport:   { label: '交通', bg: '#D8EDF8', text: '#2A6A9A', emoji: '🚌' },
  hotel:       { label: '住宿', bg: '#FAE0E0', text: '#9A3A3A', emoji: '🏨' },
  misc:        { label: '其他', bg: '#EFEFEF', text: '#7A7A7A', emoji: '📌' },
};
export const EXPENSE_CATEGORY_MAP: Record<string, { emoji: string; bg: string; label: string }> = {
  transport: { emoji: '🚌', bg: '#D8EDF8', label: '交通' },
  food:      { emoji: '🍜', bg: '#FFF2CC', label: '美食' },
  attraction:{ emoji: '🎟', bg: '#E0F0D8', label: '景點' },
  shopping:  { emoji: '🛍', bg: '#FAE0E0', label: '購物' },
  hotel:     { emoji: '🏨', bg: '#F0E8FF', label: '住宿' },
  other:     { emoji: '📦', bg: '#F0F0F0', label: '其他' },
};
export const JPY_TO_TWD = 0.22;
export const EMPTY_EVENT_FORM = { title: '', startTime: '', endTime: '', travelTime: '', category: 'attraction', location: '', notes: '', mapUrl: '', cost: '', currency: 'JPY' };

/** Dynamic font size for long names: scales down to prevent overflow */
export const dynFont = (text: string, base = 14): number => {
  if (!text) return base;
  if (text.length > 22) return base - 2;
  if (text.length > 14) return base - 1;
  return base;
};

// ── Notification helpers ──────────────────────────────────────
const LS_SEEN_MEMBERS = 'tripmori_seen_members';
const LS_SEEN_JOURNAL = 'tripmori_seen_journal';
const getLastSeen = (key: string) => Number(localStorage.getItem(key) || '0');
const markSeen    = (key: string) => localStorage.setItem(key, String(Date.now()));

function App() {
  const wasGoogleSignedIn = useRef(false);
  const [authUid, setAuthUid] = useState<string | null>(null);

  // ── Sync all trips for logged-in user from Firestore ─────────
  const syncUserTrips = async (uid: string, email: string) => {
    try {
      const ownedQ  = query(collection(db, 'trips'), where('ownerUid',         '==',             uid));
      const emailQ  = query(collection(db, 'trips'), where('ownerEmail',       '==',             email.toLowerCase()));
      const editorQ = query(collection(db, 'trips'), where('allowedEditorUids','array-contains', uid));
      const [ownedResult, emailResult, editorResult] = await Promise.allSettled([
        getDocs(ownedQ), getDocs(emailQ), getDocs(editorQ),
      ]);
      const ownedSnap  = ownedResult.status  === 'fulfilled' ? ownedResult.value  : null;
      const emailSnap  = emailResult.status  === 'fulfilled' ? emailResult.value  : null;
      const editorSnap = editorResult.status === 'fulfilled' ? editorResult.value : null;
      if (ownedResult.status  === 'rejected') console.warn('syncUserTrips: ownedQ failed',  ownedResult.reason);
      if (emailResult.status  === 'rejected') console.warn('syncUserTrips: emailQ failed',  emailResult.reason);
      if (editorResult.status === 'rejected') console.warn('syncUserTrips: editorQ failed', editorResult.reason);

      const existing = loadProjects();
      const map = new Map(existing.map(p => [p.id, p]));
      const merge = (snap: any, role: TripRole) => {
        snap.forEach((d: any) => {
          const data = d.data();
          const prev = map.get(d.id);
          const p: StoredProject = {
            id:             d.id,
            title:          data.title       || '旅行行程',
            emoji:          data.emoji       || '✈️',
            role:           prev?.role === 'owner' ? 'owner' : role,
            collaboratorKey: data.collaboratorKey || '',
            shareCode:      data.shareCode   || '',
            addedAt:        prev?.addedAt    || Date.now(),
            startDate:      data.startDate   || '',
            endDate:        data.endDate     || '',
            description:    data.description || '',
            currency:       data.currency    || prev?.currency || '',
          };
          map.set(d.id, p);
        });
      };
      if (ownedSnap)  merge(ownedSnap,  'owner');
      if (emailSnap)  merge(emailSnap,  'owner');
      if (editorSnap) merge(editorSnap, 'editor');

      // Backfill ownerUid for trips found via ownerEmail that are missing it.
      // This migrates legacy trips so UID-based security rules work going forward.
      if (emailSnap) {
        emailSnap.forEach((d: any) => {
          if (!d.data().ownerUid) {
            updateDoc(doc(db, 'trips', d.id), { ownerUid: uid }).catch(console.warn);
          }
        });
      }

      // Build set of trip IDs that actually exist in Firestore for this user
      const firestoreIds = new Set<string>();
      [ownedSnap, emailSnap, editorSnap].forEach(snap => {
        if (snap) snap.forEach((d: any) => firestoreIds.add(d.id));
      });
      // Only remove stale trips if the corresponding query succeeded
      const ownerQueriesOK = ownedResult.status === 'fulfilled' || emailResult.status === 'fulfilled';
      const editorQueryOK  = editorResult.status === 'fulfilled';
      map.forEach((p, id) => {
        if (p.role === 'owner'  && ownerQueriesOK && !firestoreIds.has(id)) map.delete(id);
        if (p.role === 'editor' && editorQueryOK  && !firestoreIds.has(id)) map.delete(id);
      });

      const updated = Array.from(map.values());
      localStorage.setItem('tripmori_projects', JSON.stringify(updated));
      // Directly update React state — reliable regardless of mount timing
      setSyncedProjects(updated);
      setActiveProjectState(prev => {
        if (prev) {
          const synced = updated.find(p => p.id === prev.id);
          if (synced) { setActiveProject(synced.id); return synced; }
          return prev;
        }
        // No active project — try to restore the last used one
        const lastId = localStorage.getItem('tripmori_last_project');
        if (lastId) {
          const last = updated.find(p => p.id === lastId);
          if (last) {
            setActiveProject(last.id);
            return last;
          }
        }
        return prev;
      });
    } catch (e) { console.error('syncUserTrips:', e); }
  };

  // ── Google 登入後自動升級 owner 角色（或清除非 owner 的預設行程）
  // ── 登出時：清除 localStorage 並回到 hub
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAuthUid(user && !user.isAnonymous ? user.uid : null);
      if (user && !user.isAnonymous && user.email) {
        wasGoogleSignedIn.current = true;

        // ── Complete pending key upgrade if a validated key is waiting ──
        // Must run BEFORE claimOwnership/syncUserTrips to avoid a race where
        // syncUserTrips deletes the newly-upgraded project because allowedEditorUids
        // hasn't propagated to Firestore yet.
        if (pendingKeyRef.current) {
          const pendingKey    = pendingKeyRef.current;
          const pendingTripId = pendingTripIdRef.current;
          pendingKeyRef.current    = '';
          pendingTripIdRef.current = '';
          setUpgradeStep('none');
          // Call addEditor CF (Admin SDK → bypasses owner-only update rule)
          const fnClient = getFunctions(undefined, 'us-central1');
          httpsCallable(fnClient, 'addEditor')({ tripId: pendingTripId, collaboratorKey: pendingKey })
            .then(() => {
              // CF wrote allowedEditorUids → now safe to upgrade local state
              setActiveProjectState(prev => {
                if (!prev) return prev;
                const upgraded: StoredProject = { ...prev, role: 'editor' };
                saveProject(upgraded);
                return upgraded;
              });
              setShowMemberBind(true);
              // Delay sync so Firestore write propagates before editorQ is queried
              setTimeout(() => syncUserTrips(user.uid, user.email!), 2000);
            })
            .catch(err => {
              console.error('addEditor failed:', err);
              setVisitorKeyError('加入協作失敗，請重試');
              setUpgradeStep('need-login');
            });
          return; // skip claimOwnership & checkOwnerRole for this event
        }

        // Normal sign-in path: backfill ownerUid then sync all trips
        const functions = getFunctions(undefined, 'us-central1');
        httpsCallable(functions, 'claimOwnership')()
          .then(() => syncUserTrips(user.uid, user.email!))
          .catch(() => syncUserTrips(user.uid, user.email!));

        checkOwnerRole(user.email).then(role => {
          if (role === 'owner') {
            setActiveProjectState(prev => {
              if (prev?.id === '74pfE7RXyEIusEdRV0rZ' && prev.role !== 'owner') {
                return { ...prev, role: 'owner' };
              }
              // 若 owner 尚未有 activeProject，從 localStorage 載入
              if (!prev) {
                const p = loadProjects().find(x => x.id === '74pfE7RXyEIusEdRV0rZ');
                if (p) {
                  setActiveProject(p.id);
                  return p;
                }
              }
              return prev;
            });
          } else {
            // 非 owner：清除 localStorage 裡的預設行程（無論 role 為何）
            const projects = loadProjects();
            const idx = projects.findIndex(p => p.id === '74pfE7RXyEIusEdRV0rZ');
            if (idx >= 0) {
              projects.splice(idx, 1);
              localStorage.setItem('tripmori_projects', JSON.stringify(projects));
              setSyncedProjects(projects);
              setActiveProjectState(prev => {
                if (prev?.id === '74pfE7RXyEIusEdRV0rZ') {
                  localStorage.removeItem('tripmori_active_project');
                  return null;
                }
                return prev;
              });
            }
          }
        });
      } else if (wasGoogleSignedIn.current) {
        // 使用者主動或自動登出 → 清除所有專案，回到初始畫面
        wasGoogleSignedIn.current = false;
        // Save last project ID so we can restore it after re-login
        const lastId = localStorage.getItem('tripmori_active_project');
        if (lastId) localStorage.setItem('tripmori_last_project', lastId);
        localStorage.removeItem('tripmori_active_project');
        localStorage.removeItem('tripmori_projects');
        setSyncedProjects([]);
        setActiveProjectState(null);
      }
    });
    return unsub;
  }, []);

  // ── Cross-tab localStorage sync ─────────────────────────────
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'tripmori_projects') {
        const activeId = getActiveProject();
        if (activeId) {
          const p = loadProjects().find(x => x.id === activeId);
          if (p) setActiveProjectState(p);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ── Active project state ──────────────────────────────────────
  const [activeProject, setActiveProjectState] = useState<StoredProject | null>(() => {
    // Check for ?visit=TRIP_ID URL param (visitor auto-join via share link)
    const params = new URLSearchParams(window.location.search);
    const visitId = params.get('visit');
    if (visitId) {
      const existing = loadProjects().find(p => p.id === visitId);
      if (existing) {
        setActiveProject(existing.id);
        // Preserve editor/owner role if already granted via collaborator key
        const role: TripRole = (existing.role === 'editor' || existing.role === 'owner') ? existing.role : 'visitor';
        return { ...existing, role };
      }
      // Will be resolved async in useEffect
    }
    const id = getActiveProject();
    if (!id) return null;
    return loadProjects().find(p => p.id === id) || null;
  });

  // ── Handle ?visit=TRIP_ID URL param (visitor auto-join) ────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tripId = params.get('visit');
    if (!tripId || activeProject) return;
    // Check localStorage first
    const stored = loadProjects().find(p => p.id === tripId);
    if (stored) {
      setActiveProject(stored.id);
      // Preserve editor/owner role if already granted via collaborator key
      const role: TripRole = (stored.role === 'editor' || stored.role === 'owner') ? stored.role : 'visitor';
      setActiveProjectState({ ...stored, role });
      return;
    }
    // Fetch trip metadata from Firestore
    const lookup = async () => {
      try {
        await auth.authStateReady();
        if (!auth.currentUser) await signInAnonymously(auth);
        const tripSnap = await getDoc(doc(db, 'trips', tripId));
        if (!tripSnap.exists()) return;
        const data = tripSnap.data();
        const p: StoredProject = {
          id: tripId,
          title: data.title || '旅行行程',
          emoji: data.emoji || '✈️',
          role: 'visitor',
          collaboratorKey: data.collaboratorKey || '',
          shareCode: data.shareCode || '',
          addedAt: Date.now(),
          startDate: data.startDate || '',
          endDate: data.endDate || '',
          description: data.description || '',
        };
        saveProject(p);
        setActiveProject(p.id);
        setActiveProjectState(p);
      } catch (e) { console.error(e); }
    };
    lookup();
  }, []);

  // ── Trip data ─────────────────────────────────────────────────
  const [events, setEvents]     = useState<any[]>([]);
  const [members, setMembers]   = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [lists, setLists]       = useState<any[]>([]);
  const [memberNotes, setMemberNotes]         = useState<any[]>([]);
  const [journalComments, setJournalComments] = useState<any[]>([]);
  const [tripNotifications, setTripNotifications] = useState<any[]>([]);
  const [activeTab, setActiveTab]   = useState('行程');
  const [loading, setLoading]       = useState(false);
  // 啟動 Splash：每次 App mount（含桌機首次開啟）都先顯示動畫
  const [splashDone, setSplashDone] = useState(false);
  const [notifications, setNotifications] = useState<Record<string, boolean>>({ '成員': false, '日誌': false });
  // Projects synced from Firestore — passed directly to ProjectHub to avoid storage event timing issues
  const [syncedProjects, setSyncedProjects] = useState<StoredProject[]>(() => loadProjects());
  const [visitorKeyInput, setVisitorKeyInput] = useState('');
  const [visitorKeyError, setVisitorKeyError] = useState('');
  const [visitorKeyBusy, setVisitorKeyBusy]   = useState(false);
  const [showKeyUpgrade, setShowKeyUpgrade]   = useState(false);
  // Upgrade flow: key validated → pending Google login → member card binding
  type UpgradeStep = 'none' | 'input' | 'need-login' | 'signing-in' | 'binding';
  const [upgradeStep, setUpgradeStep] = useState<UpgradeStep>('none');
  const pendingKeyRef    = useRef<string>(''); // survives re-renders / closure
  const pendingTripIdRef = useRef<string>(''); // trip being upgraded (paired with pendingKeyRef)
  const [showMemberBind, setShowMemberBind] = useState(false);
  const [bindingMember, setBindingMember]   = useState(false);

  // ── FCM: find bound member ID for current user ──────────────────────────
  const boundMemberId = useMemo(() => {
    if (!authUid || !members.length) return null;
    return members.find((m: any) => m.googleUid === authUid)?.id ?? null;
  }, [authUid, members]);
  useFcm(activeProject?.id ?? null, boundMemberId);

  // ── PWA install prompt ────────────────────────────────────────────────────
  // Capture the beforeinstallprompt event so we can show it at the right time.
  const pwaPromptRef = useRef<any>(null);
  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); pwaPromptRef.current = e; };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  // When user has both Google account AND a bound member card, trigger install + notifications
  useEffect(() => {
    if (!authUid || !boundMemberId) return;
    const t = setTimeout(() => {
      if (pwaPromptRef.current) {
        pwaPromptRef.current.prompt();
        pwaPromptRef.current = null;
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [authUid, boundMemberId]);

  useEffect(() => {
    // 等 Firebase auth 就緒後再隱藏 splash（至少顯示 3 秒以完整播放動畫）
    const minDelay = new Promise<void>(r => setTimeout(r, 3000));
    const authReady = auth.authStateReady();
    Promise.all([minDelay, authReady]).then(() => setSplashDone(true));
  }, []);

  const activeTripId = activeProject?.id || TRIP_ID;

  const checkNotification = (items: any[], key: string, tab: string) => {
    const lastSeen = getLastSeen(key);
    const hasNew = items.some(item => {
      const ts = item.createdAt?.toMillis ? item.createdAt.toMillis()
        : (item.createdAt ? new Date(item.createdAt).getTime() : 0);
      return ts > lastSeen;
    });
    setNotifications(n => ({ ...n, [tab]: hasNew }));
  };

  // Subscribe to collections whenever activeTripId changes
  useEffect(() => {
    if (!activeProject) return;
    let unsubs: (() => void)[] = [];
    const init = async () => {
      setLoading(true);
      try {
        // 等 Firebase 從 localStorage 還原登入狀態完成後再判斷
        // （避免 refresh 時 auth.currentUser 瞬間是 null 導致蓋掉 Google 登入）
        await auth.authStateReady();
        if (!auth.currentUser) await signInAnonymously(auth);
        const tripRef = doc(db, 'trips', activeTripId);
        const cols: [string, React.Dispatch<React.SetStateAction<any[]>>][] = [
          ['events', setEvents], ['bookings', setBookings],
          ['journals', setJournals], ['lists', setLists],
        ];
        const logErr = (col: string) => (e: Error) => console.warn(`[onSnapshot/${col}]`, e.message);
        unsubs = cols.map(([col, setter]) =>
          onSnapshot(collection(tripRef, col), snap => {
            setter(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          }, logErr(col))
        );
        // Members: filter out nameless docs (can be created by stale FCM setDoc)
        unsubs.push(onSnapshot(collection(tripRef, 'members'), snap => {
          setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((m: any) => !!m.name));
        }, logErr('members')));
        // Expenses: include metadata changes to track pending writes (offline indicator)
        unsubs.push(onSnapshot(collection(tripRef, 'expenses'), { includeMetadataChanges: true }, snap => {
          setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data(), _pending: d.metadata.hasPendingWrites })));
        }, logErr('expenses')));
        unsubs.push(onSnapshot(collection(tripRef, 'memberNotes'), snap => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setMemberNotes(items);
          checkNotification(items, LS_SEEN_MEMBERS, '成員');
        }, logErr('memberNotes')));
        unsubs.push(onSnapshot(collection(tripRef, 'journalComments'), snap => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setJournalComments(items);
          checkNotification(items, LS_SEEN_JOURNAL, '日誌');
        }, logErr('journalComments')));
        // ── Watch trip doc: sync title changes + editor revocation + deletion ──
        const currentUid = auth.currentUser?.uid;
        unsubs.push(onSnapshot(doc(db, 'trips', activeTripId), (tripSnap) => {
          if (!tripSnap.exists()) {
            // Trip was deleted — evict from localStorage and return to hub for all users
            removeProject(activeTripId);
            localStorage.removeItem('tripmori_active_project');
            setActiveProjectState(null);
            window.dispatchEvent(new StorageEvent('storage', { key: 'tripmori_projects' }));
            return;
          }
          const data = tripSnap.data();

          // Sync title, emoji, memberOrder back into activeProject for all roles
          setActiveProjectState(prev => {
            if (!prev) return prev;
            const newTitle       = data.title || prev.title;
            const newEmoji       = data.emoji || prev.emoji;
            const newMemberOrder = data.memberOrder as string[] | undefined;
            const unchanged =
              newTitle === prev.title &&
              newEmoji === prev.emoji &&
              JSON.stringify(newMemberOrder) === JSON.stringify(prev.memberOrder);
            if (unchanged) return prev;
            const updated = { ...prev, title: newTitle, emoji: newEmoji, memberOrder: newMemberOrder };
            saveProject(updated);
            return updated;
          });

          // Editor revocation: if owner removed this uid, downgrade to visitor
          if (activeProject.role === 'editor' && currentUid) {
            const allowed: string[] = data.allowedEditorUids || [];
            if (!allowed.includes(currentUid)) {
              setActiveProjectState(prev => {
                if (!prev || prev.role !== 'editor') return prev;
                const updated = { ...prev, role: 'visitor' as TripRole };
                saveProject(updated);
                return updated;
              });
            }
          }
        }));

        unsubs.push(onSnapshot(collection(tripRef, 'notifications'), snap => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setTripNotifications(items);
          // 若有未讀通知 → 對應 tab 顯示紅點
          const currentName = localStorage.getItem('tripmori_current_user') || '';
          if (currentName) {
            const lastSeen = getLastSeen(LS_SEEN_JOURNAL);
            const hasUnread = items.some((n: any) => {
              if (n.recipientName !== currentName) return false;
              const ts = n.createdAt?.toMillis ? n.createdAt.toMillis() : 0;
              return ts > lastSeen;
            });
            if (hasUnread) setNotifications(prev => ({ ...prev, '日誌': true }));
          }
        }, () => { /* notifications collection not yet provisioned — silently skip */ }));
        setLoading(false);
      } catch (err) { console.error(err); setLoading(false); }
    };
    init();
    return () => unsubs.forEach(u => u());
  }, [activeTripId, activeProject]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === '成員') { markSeen(LS_SEEN_MEMBERS); setNotifications(n => ({ ...n, '成員': false })); }
    if (tab === '日誌') { markSeen(LS_SEEN_JOURNAL); setNotifications(n => ({ ...n, '日誌': false })); }
  };

  const handleEnterProject = (p: StoredProject) => {
    saveProject(p);
    setActiveProject(p.id);
    setActiveProjectState(p);
  };

  const handleExitToHub = () => {
    localStorage.removeItem('tripmori_active_project');
    setActiveProjectState(null);
  };

  // Step 1: validate key
  const handleValidateKey = async () => {
    const key = visitorKeyInput.trim().toUpperCase();
    if (!key) { setVisitorKeyError('請輸入協作金鑰'); return; }
    if (!activeProject) return;
    setVisitorKeyBusy(true); setVisitorKeyError('');
    try {
      let storedKey = activeProject.collaboratorKey?.toUpperCase() || '';
      if (!storedKey) {
        const tripSnap = await getDoc(doc(db, 'trips', activeProject.id));
        storedKey = (tripSnap.data()?.collaboratorKey || '').toUpperCase();
      }
      if (!storedKey || key !== storedKey) {
        setVisitorKeyError('金鑰不正確，請確認後再試');
        setVisitorKeyBusy(false); return;
      }
      // Key is valid — check if already Google-signed-in
      const user = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null;
      if (user) {
        // Already logged in → call addEditor CF (Admin SDK bypasses owner-only rule)
        const fnClient = getFunctions(undefined, 'us-central1');
        await httpsCallable(fnClient, 'addEditor')({ tripId: activeProject.id, collaboratorKey: key });
        const upgraded: StoredProject = { ...activeProject, role: 'editor' };
        saveProject(upgraded);
        setActiveProject(upgraded.id);
        setActiveProjectState(upgraded);
        setShowKeyUpgrade(false);
        setUpgradeStep('binding');
        setShowMemberBind(true);
        // Delay sync so Firestore write propagates before editorQ is queried
        setTimeout(() => syncUserTrips(user.uid, user.email!), 2000);
      } else {
        // Not logged in → save validated key + trip ID, prompt Google login
        pendingKeyRef.current    = key;
        pendingTripIdRef.current = activeProject.id;
        setUpgradeStep('need-login');
      }
    } catch (e) { setVisitorKeyError('驗證失敗，請重試'); }
    setVisitorKeyBusy(false);
  };

  // Step 2: Google sign-in popup (for key upgrade flow)
  const handleGoogleSignInForUpgrade = async () => {
    setUpgradeStep('signing-in');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      // onAuthStateChanged will fire and complete the upgrade via pendingKeyRef
    } catch (e: any) {
      pendingKeyRef.current = '';
      setUpgradeStep('need-login');
      setVisitorKeyError('登入取消或失敗，請重試');
    }
  };

  // Bind current Google account to a member card
  const handleBindMemberCard = async (memberId: string) => {
    const user = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null;
    if (!user || !activeProject) return;
    setBindingMember(true);
    try {
      await updateDoc(doc(db, 'trips', activeProject.id, 'members', memberId), {
        googleUid: user.uid,
        googleEmail: user.email || '',
      });
      localStorage.setItem('tripmori_current_user',
        members.find((m: any) => m.id === memberId)?.name || '');
    } catch (e) { console.error(e); alert('綁定失敗，請重試'); }
    setBindingMember(false);
    setShowMemberBind(false);
    setUpgradeStep('none');
  };

  // ── Splash screen：每次 App 啟動都先顯示（含桌機首次開啟）
  if (!splashDone) return <SplashScreen />;

  // ── Show ProjectHub if no active project ──────────────────────
  if (!activeProject) {
    return <ProjectHub onEnterProject={handleEnterProject} syncedProjects={syncedProjects} />;
  }

  if (loading) return <SplashScreen />;

  const isReadOnly = activeProject.role === 'visitor';
  const firestore = { db, TRIP_ID: activeTripId, Timestamp, addDoc, updateDoc, deleteDoc, collection, doc, role: activeProject.role, isReadOnly, tripNotifications };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--tm-page-bg)', display: 'flex', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ width: '100%', maxWidth: 430, background: 'var(--tm-page-bg)', backgroundImage: 'radial-gradient(circle, var(--tm-dot-color) 1px, transparent 1px)', backgroundSize: '18px 18px', backgroundAttachment: 'local', minHeight: '100vh', position: 'relative', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>

        {/* ── Visitor read-only banner ── */}
        {isReadOnly && (
          <div className="tm-visitor-banner" style={{ background: '#D8EDF8', padding: '8px 16px' }}>
            {upgradeStep === 'need-login' || upgradeStep === 'signing-in' ? (
              /* Step 2: prompt Google login */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#2A6A9A' }}>✅ 金鑰驗證成功</span>
                  <button onClick={() => { setUpgradeStep('none'); pendingKeyRef.current = ''; setVisitorKeyInput(''); setVisitorKeyError(''); }}
                    style={{ fontSize: 11, color: '#2A6A9A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT }}>取消</button>
                </div>
                <p style={{ fontSize: 11, color: '#2A6A9A', margin: 0 }}>請登入 Google 帳號以完成身份綁定，成為協作編輯者</p>
                <button onClick={handleGoogleSignInForUpgrade} disabled={upgradeStep === 'signing-in'}
                  style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: upgradeStep === 'signing-in' ? '#9AAFC8' : '#2A6A9A', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%' }}>
                  <span style={{ fontSize: 15, fontWeight: 900, background: 'white', color: '#4285F4', borderRadius: 4, width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>G</span>
                  {upgradeStep === 'signing-in' ? '登入中…' : '使用 Google 帳號登入並綁定'}
                </button>
                {visitorKeyError && <span style={{ fontSize: 11, color: '#9A3A3A' }}>{visitorKeyError}</span>}
              </div>
            ) : (
              /* Step 1: key input */
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#2A6A9A', display: 'flex', alignItems: 'center', gap: 5 }}><FontAwesomeIcon icon={faEye} />訪客模式（唯讀）</span>
                  <button
                    onClick={() => { setShowKeyUpgrade(v => !v); setVisitorKeyError(''); setVisitorKeyInput(''); setUpgradeStep('none'); }}
                    style={{ fontSize: 11, fontWeight: 700, color: '#2A6A9A', background: 'white', border: '1.5px solid #A8CADF', borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT }}>
                    {showKeyUpgrade ? '取消' : '輸入金鑰升級'}
                  </button>
                </div>
                {showKeyUpgrade && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={visitorKeyInput}
                        onChange={e => setVisitorKeyInput(e.target.value.toUpperCase())}
                        placeholder="輸入協作金鑰"
                        style={{ flex: 1, padding: '7px 12px', borderRadius: 10, border: '1.5px solid #A8CADF', background: 'white', fontSize: 13, fontFamily: FONT, outline: 'none', color: '#2A6A9A', letterSpacing: 1 }}
                      />
                      <button
                        onClick={handleValidateKey}
                        disabled={visitorKeyBusy}
                        style={{ padding: '7px 14px', borderRadius: 10, border: 'none', background: '#2A6A9A', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, opacity: visitorKeyBusy ? 0.6 : 1 }}>
                        {visitorKeyBusy ? '…' : '確認'}
                      </button>
                    </div>
                    {visitorKeyError && <span style={{ fontSize: 11, color: '#9A3A3A' }}>{visitorKeyError}</span>}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Project header strip (non-visitor) ── */}
        {!isReadOnly && (
          <div style={{ background: C.cream, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.creamDark}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{activeProject.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.bark }}>{activeProject.title}</span>
              <span className={activeProject.role === 'owner' ? 'tm-badge-owner' : 'tm-role-badge-editor'} style={{ fontSize: 10, fontWeight: 700, color: activeProject.role === 'owner' ? '#4A7A35' : '#9A6800', background: activeProject.role === 'owner' ? '#E0F0D8' : '#FFF2CC', borderRadius: 6, padding: '1px 6px' }}>
                {activeProject.role === 'owner' ? '擁有者' : '編輯者'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => signOut(auth).catch(console.error)}
                style={{ fontSize: 11, color: '#9A3A3A', background: 'none', border: `1px solid #E8C4C4`, borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT }}>
                登出
              </button>
              <button onClick={handleExitToHub}
                style={{ fontSize: 11, color: C.barkLight, background: 'none', border: `1px solid ${C.creamDark}`, borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT }}>
                切換
              </button>
            </div>
          </div>
        )}

        {activeTab === '行程' && <SchedulePage events={events} members={members} project={activeProject} firestore={firestore} onProjectUpdate={(p) => { saveProject(p); setActiveProjectState(p); }} />}
        {activeTab === '預訂' && <BookingsPage bookings={bookings} members={members} firestore={firestore} project={activeProject} />}
        {activeTab === '記帳' && <ExpensePage expenses={expenses} members={members} firestore={firestore} project={activeProject} />}
        {activeTab === '日誌' && <JournalPage journals={journals} members={members} journalComments={journalComments} firestore={firestore} currentUserName={localStorage.getItem('tripmori_current_user') || ''} />}
        {activeTab === '準備' && <PlanningPage lists={lists} members={members} firestore={firestore} project={activeProject} />}
        {activeTab === '成員' && <MembersPage members={members} memberNotes={memberNotes} project={activeProject} firestore={firestore} />}
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} notifications={notifications} />

        {/* ── Member card binding modal (shown after key upgrade) ── */}
        {showMemberBind && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: 430, background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', fontFamily: FONT, maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 32, marginBottom: 6 }}>🎉</div>
                <p style={{ fontSize: 16, fontWeight: 800, color: C.bark, margin: '0 0 4px' }}>已成功加入協作！</p>
                <p style={{ fontSize: 13, color: C.barkLight, margin: 0 }}>請選擇你的成員卡，或新增一張</p>
              </div>

              {/* Unbound member cards */}
              {members.filter((m: any) => !m.googleUid).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: C.barkLight, margin: '0 0 10px' }}>選擇已有的成員卡</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {members.filter((m: any) => !m.googleUid).map((m: any) => (
                      <button key={m.id} onClick={() => handleBindMemberCard(m.id)} disabled={bindingMember}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', cursor: 'pointer', fontFamily: FONT, textAlign: 'left', width: '100%', opacity: bindingMember ? 0.6 : 1 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: m.color || '#E0D9C8', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                          {m.avatarUrl ? <img src={m.avatarUrl} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} alt="" /> : m.name?.[0] || '?'}
                        </div>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{m.name}</p>
                          {m.role && <p style={{ fontSize: 11, color: C.barkLight, margin: '1px 0 0' }}>{m.role}</p>}
                        </div>
                        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#4A7A35' }}>這是我 →</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Go to Members page to create a card */}
              <button onClick={() => { setShowMemberBind(false); setActiveTab('成員'); }}
                style={{ padding: '12px', borderRadius: 14, border: 'none', background: C.sage, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: FONT, width: '100%' }}>
                ＋ 前往成員頁新增成員卡
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default App;
