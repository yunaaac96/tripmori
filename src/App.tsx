import { useEffect, useState } from 'react';
import { db, auth } from './config/firebase';
import { collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { runImport } from './scripts/importData';
import BottomNav from './components/layout/BottomNav';
import SchedulePage from './pages/Schedule/index';
import BookingsPage from './pages/Bookings/index';
import ExpensePage from './pages/Expense/index';
import JournalPage from './pages/Journal/index';
import PlanningPage from './pages/Planning/index';
import MembersPage from './pages/Members/index';
import ProjectHub, {
  ensureDefaultProject, loadProjects, saveProject, setActiveProject, getActiveProject,
  StoredProject, TripRole,
} from './pages/ProjectHub/index';

export const TRIP_ID = "74pfE7RXyEIusEdRV0rZ"; // default / fallback
export const C = {
  cream: '#F7F4EB', creamDark: '#EDE8D5',
  sage: '#8FAF7E', sageDark: '#6A8F5C', sageLight: '#B5CFA7',
  earth: '#C4956A', bark: '#6B5C4E', barkLight: '#8C7B6E',
  sky: '#A8CADF', blush: '#E8B4B8', honey: '#E8C96A',
  shadow: '4px 4px 0px #D6D0BE', shadowSm: '3px 3px 0px #D6D0BE',
};
export const FONT = "'M PLUS Rounded 1c', 'Noto Sans TC', sans-serif";
export const cardStyle: React.CSSProperties = { background: 'white', borderRadius: 20, padding: '14px 16px', boxShadow: C.shadow, marginBottom: 10 };
export const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #E0D9C8', background: C.cream, fontSize: 16, color: C.bark, outline: 'none', fontFamily: FONT, boxSizing: 'border-box' };
export const btnPrimary = (color = C.sage): React.CSSProperties => ({ background: color, color: 'white', border: 'none', borderRadius: 14, padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: C.shadowSm, fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 });
export const CATEGORY_MAP: Record<string, { label: string; bg: string; text: string; emoji: string }> = {
  attraction: { label: '景點', bg: '#E0F0D8', text: '#4A7A35', emoji: '🌿' },
  food:       { label: '美食', bg: '#FFF2CC', text: '#9A7200', emoji: '🍜' },
  transport:  { label: '交通', bg: '#D8EDF8', text: '#2A6A9A', emoji: '🚌' },
  hotel:      { label: '住宿', bg: '#FAE0E0', text: '#9A3A3A', emoji: '🏨' },
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

// ── Notification helpers ──────────────────────────────────────
const LS_SEEN_MEMBERS = 'tripmori_seen_members';
const LS_SEEN_JOURNAL = 'tripmori_seen_journal';
const getLastSeen = (key: string) => Number(localStorage.getItem(key) || '0');
const markSeen    = (key: string) => localStorage.setItem(key, String(Date.now()));

function App() {
  // ── Active project state ──────────────────────────────────────
  const [activeProject, setActiveProjectState] = useState<StoredProject | null>(() => {
    ensureDefaultProject();                        // always register default trip
    const id = getActiveProject();
    if (!id) return null;
    return loadProjects().find(p => p.id === id) || null;
  });

  // ── Trip data ─────────────────────────────────────────────────
  const [events, setEvents]     = useState<any[]>([]);
  const [members, setMembers]   = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [lists, setLists]       = useState<any[]>([]);
  const [memberNotes, setMemberNotes]         = useState<any[]>([]);
  const [journalComments, setJournalComments] = useState<any[]>([]);
  const [activeTab, setActiveTab]   = useState('行程');
  const [loading, setLoading]       = useState(false);
  const [notifications, setNotifications] = useState<Record<string, boolean>>({ '成員': false, '日誌': false });

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
        await signInAnonymously(auth);
        const tripRef = doc(db, 'trips', activeTripId);
        const cols: [string, React.Dispatch<React.SetStateAction<any[]>>][] = [
          ['events', setEvents], ['members', setMembers], ['bookings', setBookings],
          ['expenses', setExpenses], ['journals', setJournals], ['lists', setLists],
        ];
        unsubs = cols.map(([col, setter]) =>
          onSnapshot(collection(tripRef, col), snap => {
            setter(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          })
        );
        unsubs.push(onSnapshot(collection(tripRef, 'memberNotes'), snap => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setMemberNotes(items);
          checkNotification(items, LS_SEEN_MEMBERS, '成員');
        }));
        unsubs.push(onSnapshot(collection(tripRef, 'journalComments'), snap => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setJournalComments(items);
          checkNotification(items, LS_SEEN_JOURNAL, '日誌');
        }));
        setLoading(false);
        if (activeTripId === TRIP_ID && !localStorage.getItem('tripmori_imported')) {
          runImport().then(() => localStorage.setItem('tripmori_imported', '1'));
        }
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

  // ── Show ProjectHub if no active project ──────────────────────
  if (!activeProject) {
    return <ProjectHub onEnterProject={handleEnterProject} />;
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F7F4EB', fontFamily: FONT }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🍃</div>
      <p style={{ fontWeight: 700, color: '#8FAF7E', fontSize: 16 }}>同步資料中...</p>
    </div>
  );

  const isReadOnly = activeProject.role === 'visitor';
  const firestore = { db, TRIP_ID: activeTripId, Timestamp, addDoc, updateDoc, deleteDoc, collection, doc, role: activeProject.role, isReadOnly };

  return (
    <div style={{ minHeight: '100vh', background: C.cream, backgroundImage: 'radial-gradient(circle, #C8C0AD 1px, transparent 1px)', backgroundSize: '18px 18px', display: 'flex', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ width: '100%', maxWidth: 430, background: C.cream, minHeight: '100vh', position: 'relative', paddingBottom: 80 }}>

        {/* ── Visitor read-only banner ── */}
        {isReadOnly && (
          <div style={{ background: '#D8EDF8', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#2A6A9A' }}>👁 訪客模式（唯讀）</span>
            <button onClick={handleExitToHub}
              style={{ fontSize: 11, color: '#2A6A9A', fontWeight: 700, background: 'none', border: `1px solid #2A6A9A55`, borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT }}>
              切換專案
            </button>
          </div>
        )}

        {/* ── Project header strip (non-visitor) ── */}
        {!isReadOnly && (
          <div style={{ background: C.cream, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.creamDark}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{activeProject.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.bark }}>{activeProject.title}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: activeProject.role === 'owner' ? '#4A7A35' : '#9A6800', background: activeProject.role === 'owner' ? '#E0F0D8' : '#FFF2CC', borderRadius: 6, padding: '1px 6px' }}>
                {activeProject.role === 'owner' ? '擁有者' : '編輯者'}
              </span>
            </div>
            <button onClick={handleExitToHub}
              style={{ fontSize: 11, color: C.barkLight, background: 'none', border: `1px solid ${C.creamDark}`, borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT }}>
              切換
            </button>
          </div>
        )}

        {activeTab === '行程' && <SchedulePage events={events} members={members} firestore={firestore} />}
        {activeTab === '預訂' && <BookingsPage bookings={bookings} />}
        {activeTab === '記帳' && <ExpensePage expenses={expenses} members={members} firestore={firestore} />}
        {activeTab === '日誌' && <JournalPage journals={journals} members={members} journalComments={journalComments} firestore={firestore} />}
        {activeTab === '準備' && <PlanningPage lists={lists} members={members} firestore={firestore} />}
        {activeTab === '成員' && <MembersPage members={members} memberNotes={memberNotes} project={activeProject} firestore={firestore} />}
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} notifications={notifications} />
      </div>
    </div>
  );
}
export default App;
