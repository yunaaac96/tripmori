import { useEffect, useState } from 'react';

export const TRIP_ID = "74pfE7RXyEIusEdRV0rZ";

export const C = {
  cream: '#F7F4EB', creamDark: '#EDE8D5',
  sage: '#8FAF7E', sageDark: '#6A8F5C', sageLight: '#B5CFA7',
  earth: '#C4956A', bark: '#6B5C4E', barkLight: '#8C7B6E',
  sky: '#A8CADF', blush: '#E8B4B8', honey: '#E8C96A',
  shadow: '4px 4px 0px #D6D0BE', shadowSm: '3px 3px 0px #D6D0BE',
};

export const FONT = "'M PLUS Rounded 1c', 'Noto Sans TC', sans-serif";

export const cardStyle: React.CSSProperties = {
  background: 'white', borderRadius: 20, padding: '14px 16px',
  boxShadow: C.shadow, marginBottom: 10,
};

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 12,
  border: '1.5px solid #E0D9C8', background: C.cream,
  fontSize: 14, color: C.bark, outline: 'none',
  fontFamily: FONT, boxSizing: 'border-box',
};

export const btnPrimary = (color = C.sage): React.CSSProperties => ({
  background: color, color: 'white', border: 'none', borderRadius: 14,
  padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  boxShadow: C.shadowSm, fontFamily: FONT,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
});

export const CATEGORY_MAP: Record<string, { label: string; bg: string; text: string; emoji: string }> = {
  attraction: { label: '景點', bg: '#E0F0D8', text: '#4A7A35', emoji: '🌿' },
  food:       { label: '美食', bg: '#FFF2CC', text: '#9A7200', emoji: '🍜' },
  transport:  { label: '交通', bg: '#D8EDF8', text: '#2A6A9A', emoji: '🚌' },
  hotel:      { label: '住宿', bg: '#FAE0E0', text: '#9A3A3A', emoji: '🏨' },
};

export const EXPENSE_CATEGORY_MAP: Record<string, { emoji: string; bg: string; label: string }> = {
  transport:  { emoji: '🚌', bg: '#D8EDF8', label: '交通' },
  food:       { emoji: '🍜', bg: '#FFF2CC', label: '美食' },
  attraction: { emoji: '🎟', bg: '#E0F0D8', label: '景點' },
  shopping:   { emoji: '🛍', bg: '#FAE0E0', label: '購物' },
  hotel:      { emoji: '🏨', bg: '#F0E8FF', label: '住宿' },
  other:      { emoji: '📦', bg: '#F0F0F0', label: '其他' },
};

export const JPY_TO_TWD = 0.22;

export const EMPTY_EVENT_FORM = {
  title: '', startTime: '', endTime: '',
  category: 'attraction', location: '',
  notes: '', mapUrl: '', cost: '', currency: 'JPY',
};

function App() {
  const [events, setEvents]     = useState<any[]>([]);
  const [members, setMembers]   = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [lists, setLists]       = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('行程');
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let unsubs: any[] = [];
    const init = async () => {
      try {
        setLoading(true);
        await signInAnonymously(auth);
        const tripRef = doc(db, 'trips', TRIP_ID);
        const cols: [string, React.Dispatch<React.SetStateAction<any[]>>][] = [
          ['events', setEvents], ['members', setMembers],
          ['bookings', setBookings], ['expenses', setExpenses],
          ['journals', setJournals], ['lists', setLists],
        ];
        unsubs = cols.map(([col, setter]) =>
          onSnapshot(collection(tripRef, col), snap => {
            setter(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          })
        );
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    init();
    return () => unsubs.forEach(u => u());
  }, []);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: C.cream, fontFamily: FONT }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🍃</div>
      <p style={{ fontWeight: 700, color: C.sage, fontSize: 16 }}>同步資料中...</p>
    </div>
  );

  const firestore = { db, TRIP_ID, Timestamp, addDoc, updateDoc, deleteDoc, collection, doc };

  // 動態載入各分頁（避免元件未建立時報錯）
  const renderPage = () => {
    try {
      const SchedulePage  = require('./pages/Schedule/index').default;
      const BookingsPage  = require('./pages/Bookings/index').default;
      const ExpensePage   = require('./pages/Expense/index').default;
      const JournalPage   = require('./pages/Journal/index').default;
      const PlanningPage  = require('./pages/Planning/index').default;
      const MembersPage   = require('./pages/Members/index').default;
      const BottomNav     = require('./components/layout/BottomNav').default;

      return (
        <>
          {activeTab === '行程' && <SchedulePage events={events}    members={members}  firestore={firestore} />}
          {activeTab === '預訂' && <BookingsPage bookings={bookings} />}
          {activeTab === '記帳' && <ExpensePage  expenses={expenses} members={members}  firestore={firestore} />}
          {activeTab === '日誌' && <JournalPage  journals={journals} members={members}  firestore={firestore} />}
          {activeTab === '準備' && <PlanningPage lists={lists}       members={members}  firestore={firestore} />}
          {activeTab === '成員' && <MembersPage  members={members}   expenses={expenses} />}
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        </>
      );
    } catch {
      return <p style={{ padding: 24, color: C.barkLight, fontFamily: FONT }}>⚠️ 元件載入中，請稍候...</p>;
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: C.cream,
      backgroundImage: 'radial-gradient(circle, #C8C0AD 1px, transparent 1px)',
      backgroundSize: '18px 18px',
      display: 'flex', justifyContent: 'center', fontFamily: FONT,
    }}>
      <div style={{ width: '100%', maxWidth: 430, background: C.cream, minHeight: '100vh', position: 'relative', paddingBottom: 80 }}>
        {renderPage()}
      </div>
    </div>
  );
}

export default App;