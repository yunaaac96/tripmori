import { useEffect, useState } from 'react';
import { db, auth } from './config/firebase';
import { collection, getDocs, doc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import DaySelector from './components/DaySelector';
import EventCard from './components/EventCard';
import WeatherCard from './components/WeatherCard';
import TabBar from './components/TabBar';
import MemberCard from './components/MemberCard';
import BookingCard from './components/BookingCard';
import { TripEvent, DayOption } from './types/index';

function App() {
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [activeDay, setActiveDay] = useState("2026-04-23");
  const [activeTab, setActiveTab] = useState("行程");
  const [loading, setLoading] = useState(true);
  
  // 🎯 這是你剛才確認過大小寫正確的 ID
  const tripId = "74pfE7RXyEIusEdRV0rZ"; 

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        await signInAnonymously(auth);
        const tripDocRef = doc(db, 'trips', tripId);

        // 1. 抓取行程並同步日期格式
        const eventSnap = await getDocs(collection(tripDocRef, 'events'));
        const eventList = eventSnap.docs.map(d => ({ id: d.id, ...d.data() } as TripEvent));
        eventList.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
        setEvents(eventList);

        // 2. 抓取成員與預訂
        const memberSnap = await getDocs(collection(tripDocRef, 'members'));
        setMembers(memberSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        const bookingSnap = await getDocs(collection(tripDocRef, 'bookings'));
        setBookings(bookingSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        console.log("✅ 資料讀取成功，行程筆數:", eventList.length);
      } catch (error) {
        console.error("🔥 讀取失敗:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 🎯 日期格式相容過濾器
  const currentDayEvents = events.filter(e => {
    if (!e.date) return false;
    const fmtEventDate = e.date.replace(/\//g, '-').trim();
    const fmtActiveDay = activeDay.replace(/\//g, '-').trim();
    return fmtEventDate === fmtActiveDay;
  });

  const dayOptions: DayOption[] = [
    { date: "2026-04-23", label: "4/23", week: "四" },
    { date: "2026-04-24", label: "4/24", week: "五" },
    { date: "2026-04-25", label: "4/25", week: "六" },
    { date: "2026-04-26", label: "4/26", week: "日" },
  ];

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FDFCF8] text-[#769370] font-black">正在同步沖繩手帳...</div>;

  return (
    <div className="min-h-screen bg-[#F1F1E6] flex justify-center items-start">
      <div className="w-full max-w-md bg-[#FDFCF8] min-h-screen relative shadow-2xl pb-32">
        <header className="pt-14 pb-4 px-6 text-center">
          <span className="text-[10px] font-black tracking-[0.2em] text-[#769370]/50 uppercase">Okinawa Journal</span>
          <h1 className="text-3xl font-black text-slate-950 mt-1">日本沖繩之旅 🗾</h1>
        </header>

        {activeTab === "行程" && (
          <div className="px-6 mt-10">
            <DaySelector days={dayOptions} activeDay={activeDay} onDayChange={setActiveDay} />
            <WeatherCard />
            <div className="space-y-10 mt-10">
              {currentDayEvents.length > 0 ? (
                currentDayEvents.map(event => <EventCard key={event.id} event={event} />)
              ) : (
                <div className="text-center py-20 opacity-30 font-bold">今天休息一下 🌱 (Debug: {activeDay})</div>
              )}
            </div>
          </div>
        )}

        {activeTab === "預訂" && <main className="px-6 mt-6">{bookings.map(b => <BookingCard key={b.id} data={b} />)}</main>}
        {activeTab === "成員" && <main className="px-6 mt-6 grid grid-cols-2 gap-4">{members.map(m => <MemberCard key={m.id} member={m} />)}</main>}

        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}

export default App;