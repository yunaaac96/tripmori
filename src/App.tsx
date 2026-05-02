import { useEffect, useMemo, useRef, useState } from 'react';
import { db, auth } from './config/firebase';
import { collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, Timestamp, getDoc, query, where, getDocs, arrayUnion, deleteField, orderBy, limit } from 'firebase/firestore';
import { LS_ONBOARDING_PENDING, hasCompletedOnboarding, markOnboardingDone } from './utils/onboarding';
import type { OnboardingTrack } from './utils/onboarding';
import OnboardingModal from './components/OnboardingModal';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { signInAnonymously, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLightbulb, faEye, faMobileScreen, faBell, faXmark, faArrowUpFromBracket, faSquarePlus, faCircleCheck, faPlus, faGear } from '@fortawesome/free-solid-svg-icons';
import BottomNav from './components/layout/BottomNav';
import SplashScreen from './components/SplashScreen';
import SchedulePage from './pages/Schedule/index';
import BookingsPage from './pages/Bookings/index';
import ExpensePage from './pages/Expense/index';
import JournalPage from './pages/Journal/index';
import PlanningPage from './pages/Planning/index';
import MembersPage from './pages/Members/index';
import { useFcm, enableFcmForMember } from './hooks/useFcm';
import { avatarTextColor } from './utils/helpers';
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
        <span style={{ flexShrink: 0, fontSize: 11, color: color, opacity: 0.7, marginTop: 2 }}><FontAwesomeIcon icon={faLightbulb} /></span>
        <span style={{
          fontSize: 11, color, fontStyle: 'italic', lineHeight: 1.5,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere',
          ...(isLong && !expanded ? {
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
          } : {}),
        }}><SmartText text={notes} /></span>
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
export function SmartText({ text, style }: { text: string; style?: React.CSSProperties }) {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = text.split(urlRegex);
  return (
    <span style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', ...style }}>
      {parts.map((part, i) => {
        if (urlRegex.test(part)) {
          urlRegex.lastIndex = 0; // reset stateful regex
          const href = /^https?:\/\//i.test(part) ? part : `https://${part}`;
          return <a key={i} href={href} target="_blank" rel="noopener noreferrer"
            style={{ color: '#5C8A4A', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>;
        }
        return part;
      })}
    </span>
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
export const EMPTY_EVENT_FORM = { title: '', startTime: '', endTime: '', travelTime: '', category: 'attraction', location: '', notes: '', mapUrl: '', cost: '', currency: 'TWD' };
// Note: currency is overridden at usage site via { ...EMPTY_EVENT_FORM, currency: project?.currency || 'TWD' }

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
  const logoutTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
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
            // Preserve member sort order — read from Firestore first,
            // fall back to what was previously saved in localStorage.
            memberOrder:    (data.memberOrder as string[] | undefined) ?? prev?.memberOrder,
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
      // Only remove stale trips when we have confirmed server data (not from offline cache).
      // When offline, Firestore may return an empty fulfilled snapshot from cache, which would
      // incorrectly delete all locally-stored owner/editor projects.
      const ownerQueriesOK = (ownedResult.status === 'fulfilled' && !ownedResult.value.metadata.fromCache) ||
                             (emailResult.status === 'fulfilled' && !emailResult.value.metadata.fromCache);
      const editorQueryOK  = editorResult.status === 'fulfilled' && !editorResult.value.metadata.fromCache;
      map.forEach((p, id) => {
        if (p.role === 'owner'  && ownerQueriesOK && !firestoreIds.has(id)) map.delete(id);
        if (p.role === 'editor' && editorQueryOK  && !firestoreIds.has(id)) map.delete(id);
      });

      const updated = Array.from(map.values());
      // Guard: if the default trip was lost from Firestore queries (e.g. ownerUid
      // not set on a legacy doc), restore it as a visitor-role fallback so the
      // user never loses it due to a brief auth reset → projects-clear cycle.
      if (!updated.find(p => p.id === TRIP_ID)) {
        ensureDefaultProject(); // writes visitor entry to localStorage
        const restored = loadProjects().find(p => p.id === TRIP_ID);
        if (restored) updated.push(restored);
      }
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
        // Cancel any pending logout timer (auth came back — it was a transient refresh)
        if (logoutTimerRef.current) { clearTimeout(logoutTimerRef.current); logoutTimerRef.current = null; }

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
              // Trigger invitee onboarding (runs once the useEffect picks it up)
              try { localStorage.setItem(LS_ONBOARDING_PENDING, 'invitee'); } catch { /* ignore */ }
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

        // Normal sign-in path: backfill ownerUid then sync all trips.
        // Race claimOwnership against a 6-second timeout so it fails fast when offline
        // (iOS mobile hangs HTTP requests for 30-120s before giving up).
        const functions = getFunctions(undefined, 'us-central1');
        const ownershipTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('claimOwnership timeout')), 6000));
        Promise.race([httpsCallable(functions, 'claimOwnership')(), ownershipTimeout])
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
          } else if (role === null) {
            // Confirmed non-owner (server responded, email doesn't match) → remove default trip
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
          // role === 'unavailable': offline / network error — keep existing project state untouched
        });
      } else if (wasGoogleSignedIn.current) {
        // 使用者主動或自動登出 → 清除所有專案，回到初始畫面
        // Guard: skip clearing when offline — auth null event may be transient (token refresh failure).
        // navigator.onLine is unreliable on iOS (reports true even without actual internet),
        // so use a 5-second debounce: if auth is restored within that window (e.g. token
        // refresh completes), cancel the clear and treat it as a transient state change.
        // Additional guard: skip clearing when Firestore considers itself offline
        // (checks via .info/connected-equivalent: connectionState state ref).
        const firestoreOffline = document.querySelector?.('meta[name="firestore-offline"]') !== null;
        if (!navigator.onLine || firestoreOffline) return;
        logoutTimerRef.current = setTimeout(() => {
          logoutTimerRef.current = null;
          // If auth has since been restored (wasGoogleSignedIn set back to true), skip clear.
          if (wasGoogleSignedIn.current) return;
          // Double-check: if still offline (navigator.onLine may have changed), abort.
          if (!navigator.onLine) return;
          // Save last project ID so we can restore it after re-login
          const lastId = localStorage.getItem('tripmori_active_project');
          if (lastId) localStorage.setItem('tripmori_last_project', lastId);
          localStorage.removeItem('tripmori_active_project');
          localStorage.removeItem('tripmori_projects');
          setSyncedProjects([]);
          setActiveProjectState(null);
        }, 5000); // extended from 3s → 5s to give token refresh more time
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
  const [proxyGrants, setProxyGrants] = useState<any[]>([]);
  const [adminMode, setAdminMode] = useState(() => sessionStorage.getItem('tm-admin') === '1');
  const toggleAdminMode = () => setAdminMode(prev => {
    const next = !prev;
    next ? sessionStorage.setItem('tm-admin', '1') : sessionStorage.removeItem('tm-admin');
    return next;
  });
  const [journals, setJournals] = useState<any[]>([]);
  // Journal pagination — live-subscribe to newest N entries, let user click
  // "載入更多" to grow. Avoids pulling 100+ docs + their photo URLs on every
  // trip open for long-running trips.
  const JOURNAL_PAGE = 20;
  const [journalsLimit, setJournalsLimit] = useState(JOURNAL_PAGE);
  const [hasMoreJournals, setHasMoreJournals] = useState(false);
  const [lists, setLists]       = useState<any[]>([]);
  const [memberNotes, setMemberNotes]         = useState<any[]>([]);
  const [journalComments, setJournalComments] = useState<any[]>([]);
  const [tripNotifications, setTripNotifications] = useState<any[]>([]);
  const [activeTab, setActiveTab]   = useState('行程');
  const [loading, setLoading]       = useState(false);
  // ── Online / offline detection ─────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const toOnline  = () => setIsOnline(true);
    const toOffline = () => setIsOnline(false);
    window.addEventListener('online',  toOnline);
    window.addEventListener('offline', toOffline);
    return () => { window.removeEventListener('online', toOnline); window.removeEventListener('offline', toOffline); };
  }, []);
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

  // ── PWA install + notification onboarding ─────────────────────────────────
  // 1. Intercept `beforeinstallprompt` and stash the event; preventDefault so
  //    the browser does NOT auto-popup. 2. Only call prompt() from a user
  //    gesture (handleInstallClick). 3. After install success, chain into an
  //    opt-in notification permission step for a single-flow onboarding.
  const pwaPromptRef = useRef<any>(null);
  const [pwaInstallAvailable, setPwaInstallAvailable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(() =>
    typeof window !== 'undefined' && (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    )
  );
  // iPad on iPadOS 13+ reports a desktop UA by default (Macintosh), so sniffing
  // for "iPad" alone misses it. Fall back to the touch-points trick: a
  // "Macintosh" UA with >1 touch points is an iPad, not a real Mac.
  const isIOS = typeof navigator !== 'undefined' && !(window as any).MSStream && (
    /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
  );
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  type OnboardingStep = 'none' | 'install' | 'notifications';
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('none');
  const [showIOSInstallHelp, setShowIOSInstallHelp] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: any) => {
      e.preventDefault();
      pwaPromptRef.current = e;
      setPwaInstallAvailable(true);
    };
    const onAppInstalled = () => {
      setIsStandalone(true);
      pwaPromptRef.current = null;
      setPwaInstallAvailable(false);
      // If we were mid-onboarding, chain to the notification step
      setOnboardingStep(prev => prev === 'install'
        ? (typeof Notification !== 'undefined' && Notification.permission === 'default' ? 'notifications' : 'none')
        : prev);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  // Called by binding / key-upgrade success paths to kick off the onboarding
  // banner. Picks the first step the user still needs — never auto-prompts.
  const startPostSetupOnboarding = () => {
    const wantsInstall = !isStandalone && (pwaInstallAvailable || isIOS);
    const wantsNotif = typeof Notification !== 'undefined' && Notification.permission === 'default';
    if (wantsInstall) setOnboardingStep('install');
    else if (wantsNotif) setOnboardingStep('notifications');
    else setOnboardingStep('none');
  };

  // User clicked the "加入主畫面" button → show iOS help modal on iOS Safari,
  // otherwise fire the stashed beforeinstallprompt event.
  const handleInstallClick = async () => {
    if (isIOS && !pwaPromptRef.current) {
      setShowIOSInstallHelp(true);
      return;
    }
    const evt = pwaPromptRef.current;
    if (!evt) return;
    try {
      evt.prompt();
      const result = await evt.userChoice;
      pwaPromptRef.current = null;
      setPwaInstallAvailable(false);
      if (result.outcome === 'accepted') setIsStandalone(true);
      // Advance to notifications step regardless (user made a decision on install)
      setOnboardingStep(
        typeof Notification !== 'undefined' && Notification.permission === 'default' ? 'notifications' : 'none'
      );
    } catch (err) {
      console.warn('PWA install prompt failed:', err);
    }
  };

  // Back-compat alias used by Members/index.tsx install card
  const triggerPwaInstall = handleInstallClick;

  // User clicked "開啟通知" in the onboarding banner
  const handleEnableNotifications = async () => {
    if (!activeProject || !boundMemberId) {
      setOnboardingStep('none');
      return;
    }
    try {
      const result = await enableFcmForMember(activeProject.id, boundMemberId);
      setNotifPermission(result);
    } catch (err) {
      console.warn('FCM permission request failed:', err);
    }
    setOnboardingStep('none');
  };

  // Bind-success toast (短暫 confirm，關閉後才跳 install/notification 橫幅)
  const [bindSuccessToast, setBindSuccessToast] = useState<{ name: string } | null>(null);
  // Inline "create member card + bind" form inside the bind modal
  const MEMBER_COLORS = ['#ebcef5','#aaa9ab','#E0F0D8','#A8CADF','#FFF2CC','#FAE0E0','#E8C96A','#D8EDF8'];
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [createFormName, setCreateFormName] = useState('');
  const [createFormColor, setCreateFormColor] = useState(MEMBER_COLORS[0]);

  const dismissOnboarding = () => {
    // Remember which step the user dismissed so we don't nag on every open,
    // but keep per-step keys so they can still be nudged about the other step
    // later (e.g. dismissed install → eventually installed by themselves →
    // we still want to offer notifications).
    try {
      if (onboardingStep === 'install')       localStorage.setItem('tripmori_dismissed_install', '1');
      if (onboardingStep === 'notifications') localStorage.setItem('tripmori_dismissed_notifications', '1');
    } catch {}
    setOnboardingStep('none');
  };

  // Show the banner on any app open (not only right after binding) for members
  // who are already editor/owner but haven't installed or enabled notifications.
  // Fires only once per mount; the install/notifications prompts themselves
  // still require a user click (see handleInstallClick / handleEnableNotifications),
  // so this useEffect does NOT auto-popup the install window.
  const mountBannerFiredRef = useRef(false);
  useEffect(() => {
    if (mountBannerFiredRef.current) return;
    if (!boundMemberId || !activeProject) return;
    if (activeProject.role === 'visitor') return;
    const wantsInstall = !isStandalone && (pwaInstallAvailable || isIOS);
    const installDismissed = typeof localStorage !== 'undefined' && localStorage.getItem('tripmori_dismissed_install') === '1';
    const wantsNotif = typeof Notification !== 'undefined' && Notification.permission === 'default';
    const notifDismissed = typeof localStorage !== 'undefined' && localStorage.getItem('tripmori_dismissed_notifications') === '1';
    if (wantsInstall && !installDismissed) {
      mountBannerFiredRef.current = true;
      setOnboardingStep('install');
    } else if (wantsNotif && !notifDismissed) {
      mountBannerFiredRef.current = true;
      setOnboardingStep('notifications');
    }
  }, [boundMemberId, activeProject?.id, activeProject?.role, pwaInstallAvailable, isIOS, isStandalone]);

  useEffect(() => {
    // 等 Firebase auth 就緒後再隱藏 splash（至少顯示 5 秒：動畫 ~2.7s + 停留 ~2.3s）
    const minDelay = new Promise<void>(r => setTimeout(r, 5000));
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

  // Subscribe to collections whenever activeTripId / role changes.
  //
  // Cost-control notes:
  //   • Dep array is scoped to [activeTripId, role] — NOT the full
  //     activeProject object — so editing the trip title / memberOrder sync
  //     doesn't tear down and rebuild all nine snapshot listeners.
  //   • Visitors skip the four private / noisy collections entirely
  //     (expenses, memberNotes, journalComments, notifications). The UI
  //     hides them anyway; the old code still burned a full-collection read
  //     for each on every visitor page load.
  const currentRole = activeProject?.role;
  useEffect(() => {
    if (!activeProject) return;
    const isVisitorRole = currentRole === 'visitor';
    let unsubs: (() => void)[] = [];
    const init = async () => {
      setLoading(true);
      try {
        // 等 Firebase 從 localStorage 還原登入狀態完成後再判斷
        // （避免 refresh 時 auth.currentUser 瞬間是 null 導致蓋掉 Google 登入）
        await auth.authStateReady();
        if (!auth.currentUser) {
          try {
            await signInAnonymously(auth);
          } catch (anonErr) {
            // signInAnonymously requires network — fails offline for brand-new sessions.
            // Continue anyway: Firestore's persistent IndexedDB cache serves data without
            // an active auth session. Writes will be queued once network is restored.
            console.warn('[init] anonymous sign-in failed (likely offline):', (anonErr as Error)?.message);
          }
        }
        const tripRef = doc(db, 'trips', activeTripId);
        const cols: [string, React.Dispatch<React.SetStateAction<any[]>>][] = [
          ['events', setEvents], ['bookings', setBookings],
          ['lists', setLists],
          // journals handled separately below — it's paginated
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

        // Visitor-gated collections: only subscribe for editor / owner.
        if (!isVisitorRole) {
          // Expenses: metadata-change callbacks power the "同步中…" indicator
          //   on the client. Safe for cost — we only reach this branch for
          //   editor / owner (visitors skip the sub entirely per H2).
          unsubs.push(onSnapshot(collection(tripRef, 'expenses'), { includeMetadataChanges: true }, snap => {
            setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data(), _pending: d.metadata.hasPendingWrites })));
          }, logErr('expenses')));
          unsubs.push(onSnapshot(collection(tripRef, 'proxyGrants'), snap => {
            setProxyGrants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          }, logErr('proxyGrants')));
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
        } else {
          // Clear any stale data from a previous non-visitor session in this tab
          setExpenses([]); setProxyGrants([]); setMemberNotes([]); setJournalComments([]);
        }
        // ── Watch trip doc: sync title changes + editor revocation + deletion ──
        const currentUid = auth.currentUser?.uid;
        unsubs.push(onSnapshot(doc(db, 'trips', activeTripId), (tripSnap) => {
          if (!tripSnap.exists()) {
            // When offline, Firestore fires exists()=false for any document not in local cache —
            // it cannot distinguish "deleted on server" from "not cached yet".
            // Only evict when we have a confirmed server response (not from cache).
            if (tripSnap.metadata.fromCache) return;
            // Trip was deleted on server — evict from localStorage and return to hub for all users
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

        if (!isVisitorRole) {
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
        } else {
          setTripNotifications([]);
        }
        setLoading(false);
      } catch (err) { console.error(err); setLoading(false); }
    };
    init();
    return () => unsubs.forEach(u => u());
    // NOTE: dep list intentionally excludes the full `activeProject` object —
    // only re-subscribe when tripId or role changes, not when title/emoji
    // /memberOrder sync inside the trip-doc snapshot below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTripId, currentRole]);

  // Dedicated journals subscription — paginated (newest first) so opening a
  // long-running trip doesn't pull every journal + photo URL at once.
  useEffect(() => {
    if (!activeProject) return;
    const tripRef = doc(db, 'trips', activeTripId);
    const q = query(
      collection(tripRef, 'journals'),
      orderBy('date', 'desc'),
      limit(journalsLimit)
    );
    const unsub = onSnapshot(q, snap => {
      setJournals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      // If the page is full, there might be more older entries available.
      setHasMoreJournals(snap.size >= journalsLimit);
    }, e => console.warn('[onSnapshot/journals]', e.message));
    return unsub;
  }, [activeTripId, activeProject, journalsLimit]);

  // Reset journals pagination when switching trips
  useEffect(() => {
    setJournalsLimit(JOURNAL_PAGE);
  }, [activeTripId]);

  const showMoreJournals = () => setJournalsLimit(n => n + JOURNAL_PAGE);

  // ── Onboarding: check the "pending" localStorage flag set by creation /
  //   editor-upgrade flows. If we have a Google uid + a project + the user
  //   hasn't already completed that track on any device, show the modal.
  //
  //   Guards:
  //   - Anonymous users are NOT onboarded (firestore.rules blocks /users/{uid}
  //     writes for anonymous, so flag can't persist). They're also always
  //     visitors in practice, which is skipped below anyway.
  //   - LS value is strictly validated; malformed values are cleared so
  //     they don't keep triggering no-op effect runs.
  //   - onboarding-done write retries on next effect run if it fails — we
  //     only clear the LS pending flag AFTER the Firestore flag lands.
  const [onboardingTrack, setOnboardingTrack] = useState<OnboardingTrack | null>(null);
  useEffect(() => {
    if (!activeProject) return;
    if (!authUid) return;                      // needs real Google sign-in
    if (currentRole === 'visitor') return;     // visitors are not onboarded
    const raw = localStorage.getItem(LS_ONBOARDING_PENDING);
    const pending: OnboardingTrack | null =
      raw === 'creator' || raw === 'invitee' ? raw : null;
    if (!pending) {
      // Stale / malformed LS value — clean up so future runs don't loop.
      if (raw) localStorage.removeItem(LS_ONBOARDING_PENDING);
      return;
    }
    // Sanity: creator track should only fire for actual owner.
    if (pending === 'creator' && currentRole !== 'owner') {
      localStorage.removeItem(LS_ONBOARDING_PENDING);
      return;
    }
    hasCompletedOnboarding(authUid, pending).then(done => {
      if (done) {
        localStorage.removeItem(LS_ONBOARDING_PENDING);
      } else {
        setOnboardingTrack(pending);
      }
    });
  }, [activeProject, authUid, currentRole]);

  const finishOnboarding = async () => {
    const track = onboardingTrack;
    setOnboardingTrack(null);                  // close modal immediately
    if (!authUid || !track) {
      localStorage.removeItem(LS_ONBOARDING_PENDING);
      return;
    }
    const ok = await markOnboardingDone(authUid, track);
    // Only clear LS pending when the Firestore flag actually landed.
    // On failure we keep the LS signal so the effect retries on the next
    // mount / role change and the user won't see the modal permanently
    // stuck "seen but not recorded".
    if (ok) localStorage.removeItem(LS_ONBOARDING_PENDING);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (tab === '成員') { markSeen(LS_SEEN_MEMBERS); setNotifications(n => ({ ...n, '成員': false })); }
    if (tab === '日誌') { markSeen(LS_SEEN_JOURNAL); setNotifications(n => ({ ...n, '日誌': false })); }
  };

  const handleEnterProject = (p: StoredProject, justJoinedViaKey?: boolean) => {
    saveProject(p);
    setActiveProject(p.id);
    setActiveProjectState(p);
    setActiveTab('行程');
    window.scrollTo({ top: 0, behavior: 'instant' });
    // Fresh editor who joined via collaborator key on the hub: open the
    // member-bind modal so they can pick/create a card instead of landing in
    // the project with no member identity. The existing auto-close effect
    // (showMemberBind + boundMemberId) still guards against reopening for
    // users who are already bound.
    if (justJoinedViaKey && p.role === 'editor') {
      setUpgradeStep('binding');
      setShowMemberBind(true);
      // Trigger invitee onboarding when landing in the trip
      try { localStorage.setItem(LS_ONBOARDING_PENDING, 'invitee'); } catch { /* ignore */ }
    }
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
        try { localStorage.setItem(LS_ONBOARDING_PENDING, 'invitee'); } catch { /* ignore */ }
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

  // Show the "bind success" toast for ~1.8s, then chain onboarding.
  const flashBindSuccess = (name: string) => {
    setBindSuccessToast({ name });
    setTimeout(() => {
      setBindSuccessToast(null);
      startPostSetupOnboarding();
    }, 1800);
  };

  // Re-check the "one Google account ↔ one member card" rule against the
  // freshest Firestore data (not the React state snapshot) right before a
  // write. Nameless member docs (legacy orphans from stale FCM setDoc) are
  // NOT real cards — they're filtered out of the UI list, so they must not
  // block binding either. We silently self-heal them by clearing their
  // googleUid, so the "undefined" alert stops reappearing on future attempts.
  const hasName = (v: any) => typeof v === 'string' && v.trim() !== '';
  const assertNotAlreadyBound = async (uid: string, tripId: string): Promise<{ bound: boolean; name?: string }> => {
    const localHit = members.find((m: any) => m.googleUid === uid && hasName(m.name));
    if (localHit) return { bound: true, name: localHit.name };
    try {
      const snap = await getDocs(query(collection(db, 'trips', tripId, 'members'), where('googleUid', '==', uid)));
      const named = snap.docs.find(d => hasName((d.data() as any).name));
      const nameless = snap.docs.filter(d => !hasName((d.data() as any).name));
      if (nameless.length) {
        Promise.allSettled(
          nameless.map(d =>
            updateDoc(doc(db, 'trips', tripId, 'members', d.id), {
              googleUid: deleteField(),
              googleEmail: deleteField(),
            })
          )
        ).catch(() => {});
      }
      if (named) {
        const d = named.data() as any;
        return { bound: true, name: d.name };
      }
    } catch (e) { console.warn('[bind] duplicate check failed', e); }
    return { bound: false };
  };

  // Bind current Google account to an EXISTING member card
  const handleBindMemberCard = async (memberId: string) => {
    const user = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null;
    if (!user || !activeProject) return;
    setBindingMember(true);
    const dup = await assertNotAlreadyBound(user.uid, activeProject.id);
    if (dup.bound) {
      setBindingMember(false);
      setShowMemberBind(false);
      setUpgradeStep('none');
      alert(`此 Google 帳號已經綁定「${dup.name}」，一個帳號只能綁一張成員卡。`);
      return;
    }
    let bindOk = false;
    let boundName = '';
    try {
      await updateDoc(doc(db, 'trips', activeProject.id, 'members', memberId), {
        googleUid: user.uid,
        googleEmail: user.email || '',
      });
      boundName = members.find((m: any) => m.id === memberId)?.name || '';
      localStorage.setItem('tripmori_current_user', boundName);
      bindOk = true;
    } catch (e) { console.error(e); alert('綁定失敗，請重試'); }
    setBindingMember(false);
    setShowMemberBind(false);
    setUpgradeStep('none');
    if (bindOk) flashBindSuccess(boundName);
  };

  // Create a NEW member card and bind the current Google account in one shot
  const handleCreateAndBindMember = async () => {
    const user = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null;
    const name = createFormName.trim();
    if (!user || !activeProject || !name) return;
    setBindingMember(true);
    const dup = await assertNotAlreadyBound(user.uid, activeProject.id);
    if (dup.bound) {
      setBindingMember(false);
      setShowMemberBind(false);
      setUpgradeStep('none');
      setCreateFormOpen(false);
      setCreateFormName('');
      setCreateFormColor(MEMBER_COLORS[0]);
      alert(`此 Google 帳號已經綁定「${dup.name}」，一個帳號只能綁一張成員卡。`);
      return;
    }
    let bindOk = false;
    try {
      await addDoc(collection(db, 'trips', activeProject.id, 'members'), {
        name,
        role: '旅伴',
        color: createFormColor,
        avatarUrl: '',
        googleUid: user.uid,
        googleEmail: user.email || '',
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem('tripmori_current_user', name);
      bindOk = true;
    } catch (e) { console.error(e); alert('建立並綁定失敗，請重試'); }
    setBindingMember(false);
    setShowMemberBind(false);
    setUpgradeStep('none');
    setCreateFormOpen(false);
    setCreateFormName('');
    setCreateFormColor(MEMBER_COLORS[0]);
    if (bindOk) flashBindSuccess(name);
  };

  // Auto-close the bind modal if the current user is already bound — guards
  // against the key-upgrade flow re-opening the modal for an owner who was
  // signed in via incognito/visitor link and already owns a card in this trip.
  useEffect(() => {
    if (!showMemberBind) return;
    if (!boundMemberId) return;
    setShowMemberBind(false);
    setUpgradeStep('none');
    setCreateFormOpen(false);
  }, [showMemberBind, boundMemberId]);

  // ── Splash screen：每次 App 啟動都先顯示（含桌機首次開啟）
  if (!splashDone) return <SplashScreen />;

  // ── Show ProjectHub if no active project ──────────────────────
  if (!activeProject) {
    return <ProjectHub onEnterProject={handleEnterProject} syncedProjects={syncedProjects} />;
  }

  if (loading) return <SplashScreen />;

  const isReadOnly = activeProject.role === 'visitor';
  const firestore = { db, TRIP_ID: activeTripId, Timestamp, addDoc, updateDoc, deleteDoc, collection, doc, role: activeProject.role, isReadOnly, tripNotifications, adminMode: activeProject.role === 'owner' && adminMode };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--tm-page-bg)', display: 'flex', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ width: '100%', maxWidth: 430, background: 'var(--tm-page-bg)', backgroundImage: 'radial-gradient(circle, var(--tm-dot-color) 1px, transparent 1px)', backgroundSize: '18px 18px', backgroundAttachment: 'local', minHeight: '100vh', position: 'relative', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>

        {/* ── Offline banner ── */}
        {!isOnline && (
          <div style={{ position: 'sticky', top: 0, zIndex: 1000, background: '#3A3A3A', color: 'white', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, fontFamily: FONT }}>
            <span style={{ fontSize: 14 }}>📡</span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>離線模式・資料來自本機快取・編輯將於恢復連線後自動同步</span>
          </div>
        )}

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
              {activeProject.role === 'owner' && (
                <button onClick={toggleAdminMode}
                  title={adminMode ? '離開管理模式' : '進入管理模式'}
                  style={{ fontSize: 11, color: adminMode ? '#E87A30' : C.barkLight, background: adminMode ? '#FEF0E6' : 'none', border: `1px solid ${adminMode ? '#E87A30' : C.creamDark}`, borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FontAwesomeIcon icon={faGear} style={{ fontSize: 10 }} />
                  {adminMode ? '管理中' : '管理'}
                </button>
              )}
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

        {/* ── Admin mode banner ── */}
        {activeProject.role === 'owner' && adminMode && (
          <div style={{ background: '#E87A30', color: 'white', padding: '7px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, fontFamily: FONT }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <FontAwesomeIcon icon={faGear} style={{ fontSize: 11 }} />
              管理模式 — 顯示管理操作
            </span>
            <button onClick={toggleAdminMode}
              style={{ fontSize: 11, fontWeight: 700, color: 'white', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, padding: '2px 10px', cursor: 'pointer', fontFamily: FONT }}>
              離開
            </button>
          </div>
        )}

        {activeTab === '行程' && <SchedulePage events={events} members={members} project={activeProject} firestore={firestore} onProjectUpdate={(p) => { saveProject(p); setActiveProjectState(p); }} />}
        {activeTab === '預訂' && <BookingsPage bookings={bookings} members={members} firestore={firestore} project={activeProject} />}
        {activeTab === '記帳' && <ExpensePage expenses={expenses} members={members} proxyGrants={proxyGrants} firestore={firestore} project={activeProject} />}
        {activeTab === '日誌' && <JournalPage journals={journals} members={members} journalComments={journalComments} firestore={firestore} project={activeProject} currentUserName={localStorage.getItem('tripmori_current_user') || ''} hasMoreJournals={hasMoreJournals} onShowMoreJournals={showMoreJournals} />}
        {activeTab === '準備' && <PlanningPage lists={lists} members={members} firestore={firestore} project={activeProject} />}
        {activeTab === '成員' && <MembersPage members={members} memberNotes={memberNotes} proxyGrants={proxyGrants} project={activeProject} firestore={firestore} pwaInstallAvailable={pwaInstallAvailable} onPwaInstall={triggerPwaInstall} />}
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} notifications={notifications} />

        {/* ── Onboarding modal (creator / invitee track) ── */}
        {onboardingTrack && activeProject && (
          <OnboardingModal
            track={onboardingTrack}
            tripTitle={activeProject.title || '旅行'}
            onDone={finishOnboarding}
            onSkip={finishOnboarding}
          />
        )}

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
                    {members.filter((m: any) => !m.googleUid)
                      .sort((a: any, b: any) => {
                        const order: string[] = activeProject?.memberOrder || [];
                        const ai = order.indexOf(a.name);
                        const bi = order.indexOf(b.name);
                        if (ai !== -1 && bi !== -1) return ai - bi;
                        if (ai !== -1) return -1;
                        if (bi !== -1) return 1;
                        return 0;
                      })
                      .map((m: any) => (
                      <button key={m.id} onClick={() => handleBindMemberCard(m.id)} disabled={bindingMember}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', cursor: 'pointer', fontFamily: FONT, textAlign: 'left', width: '100%', opacity: bindingMember ? 0.6 : 1 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: m.color || '#E0D9C8', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: avatarTextColor(m.color) }}>
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

              {/* Inline "create new card + bind" — 創建並綁定一步完成 */}
              {!createFormOpen ? (
                <button onClick={() => setCreateFormOpen(true)}
                  style={{ padding: '12px', borderRadius: 14, border: `1.5px dashed var(--tm-input-border)`, background: 'var(--tm-card-bg)', color: C.bark, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: FONT, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <FontAwesomeIcon icon={faPlus} /> 新增並綁定成員卡
                </button>
              ) : (
                <div style={{ padding: 14, borderRadius: 14, border: `1.5px solid var(--tm-input-border)`, background: 'var(--tm-card-bg)' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.barkLight, margin: '0 0 8px' }}>新增成員卡</p>
                  <input
                    autoFocus
                    value={createFormName}
                    onChange={e => setCreateFormName(e.target.value)}
                    placeholder="顯示名稱"
                    style={inputStyle}
                  />
                  <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>標籤顏色</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {MEMBER_COLORS.map(c => (
                        <button key={c} type="button" onClick={() => setCreateFormColor(c)}
                          style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: createFormColor === c ? `2.5px solid ${C.bark}` : '1px solid var(--tm-input-border)', cursor: 'pointer', padding: 0 }}
                          aria-label={`color ${c}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button
                      onClick={() => { setCreateFormOpen(false); setCreateFormName(''); setCreateFormColor(MEMBER_COLORS[0]); }}
                      disabled={bindingMember}
                      style={{ flex: 1, padding: '10px', borderRadius: 12, border: `1px solid var(--tm-input-border)`, background: 'transparent', color: C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                      取消
                    </button>
                    <button
                      onClick={handleCreateAndBindMember}
                      disabled={bindingMember || !createFormName.trim()}
                      style={{ flex: 2, padding: '10px', borderRadius: 12, border: 'none', background: C.sage, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, opacity: (bindingMember || !createFormName.trim()) ? 0.55 : 1 }}>
                      {bindingMember ? '處理中...' : '建立並綁定'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Bind success toast (顯示 ~1.8s 後才跳 install/notification 橫幅) ── */}
        {bindSuccessToast && (
          <div style={{ position: 'fixed', top: '40%', left: 0, right: 0, zIndex: 10000, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: 20, padding: '22px 26px', boxShadow: '0 14px 40px rgba(0,0,0,0.25)', border: `1px solid var(--tm-card-border)`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, maxWidth: 320, fontFamily: FONT }}>
              <FontAwesomeIcon icon={faCircleCheck} style={{ color: '#4A7A35', fontSize: 36 }} />
              <p style={{ fontSize: 15, fontWeight: 800, color: C.bark, margin: 0 }}>已綁定成功</p>
              <p style={{ fontSize: 12, color: C.barkLight, margin: 0 }}>歡迎加入，{bindSuccessToast.name}</p>
            </div>
          </div>
        )}

        {/* ── Post-setup onboarding banner (install → notifications) ── */}
        {onboardingStep !== 'none' && (
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(80px + env(safe-area-inset-bottom))', zIndex: 400, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: '92%', maxWidth: 400, background: 'var(--tm-sheet-bg)', borderRadius: 16, padding: '14px 16px', boxShadow: '0 10px 30px rgba(0,0,0,0.22)', border: `1px solid var(--tm-card-border)`, pointerEvents: 'auto', fontFamily: FONT }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: C.sageLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FontAwesomeIcon icon={onboardingStep === 'install' ? faMobileScreen : faBell} style={{ color: C.bark, fontSize: 16 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: C.bark, margin: '0 0 4px' }}>
                    {onboardingStep === 'install' ? '加入主畫面，才能收到推播通知' : '開啟通知，不漏掉同伴訊息'}
                  </p>
                  <p style={{ fontSize: 11, color: C.barkLight, margin: '0 0 10px', lineHeight: 1.45 }}>
                    {onboardingStep === 'install'
                      ? '把 TripMori 加入手機主畫面，推播通知才能確實送達，開啟速度也更快。'
                      : isStandalone
                        ? '收到日記留言、貼紙便條、還款請求、航班／待辦提醒時跳出通知。'
                        : '建議先將 TripMori 加入主畫面，通知才能確實送達。在瀏覽器開啟通知也可，但推播效果較不穩定。'}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={onboardingStep === 'install' ? handleInstallClick : handleEnableNotifications}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 12, border: 'none', background: C.sage, color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <FontAwesomeIcon icon={onboardingStep === 'install' ? faMobileScreen : faBell} style={{ fontSize: 12 }} />
                      {onboardingStep === 'install' ? '加入主畫面' : '開啟通知'}
                    </button>
                    <button
                      onClick={dismissOnboarding}
                      style={{ padding: '10px 12px', borderRadius: 12, border: `1px solid var(--tm-input-border)`, background: 'transparent', color: C.barkLight, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
                      稍後再說
                    </button>
                  </div>
                </div>
                <button onClick={dismissOnboarding} aria-label="dismiss"
                  style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', color: C.barkLight, fontSize: 14 }}>
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── iOS install help modal (Safari has no beforeinstallprompt) ── */}
        {showIOSInstallHelp && (
          <div onClick={() => setShowIOSInstallHelp(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 360, background: 'var(--tm-sheet-bg)', borderRadius: 20, padding: '22px 22px 18px', fontFamily: FONT }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: C.bark, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FontAwesomeIcon icon={faMobileScreen} /> 加入主畫面（iOS Safari）
              </p>
              <ol style={{ fontSize: 13, color: C.bark, margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
                <li>點下方工具列的 <FontAwesomeIcon icon={faArrowUpFromBracket} style={{ margin: '0 3px' }} /> 分享按鈕</li>
                <li>下滑找到「<FontAwesomeIcon icon={faSquarePlus} style={{ margin: '0 3px' }} /> 加入主畫面」</li>
                <li>點右上角「新增」</li>
              </ol>
              <button onClick={() => setShowIOSInstallHelp(false)}
                style={{ marginTop: 18, width: '100%', padding: '11px', borderRadius: 12, border: 'none', background: C.sage, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                我知道了
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default App;
