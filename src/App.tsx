import { useEffect, useState } from 'react';
import { db, auth } from './config/firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
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
  
  // 🎯 請再次確認這個 ID 是否與 Firestore 的文件 ID 完全一致 (大小寫、有無空白)
  const tripId = "74pfE7RXyEIusdRV0rZ".trim(); 

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const user = await signInAnonymously(auth);
        console.log("🔐 登入成功，UID:", user.user.uid);

        // 🎯 診斷日誌：讓我們看看到底去哪裡找資料
        console.log("📍 嘗試路徑：", `trips/${tripId}/events`);

        // 1. 抓取行程 (不加 orderBy 排序，先求有資料)
        const eventRef = collection(db, 'trips', tripId, 'events');
        const eventSnap = await getDocs(eventRef);
        
        console.log(`📊 集合 'events' 回傳數量:`, eventSnap.size);
        
        const eventData = eventSnap.docs.map(d => ({ 
          id: d.id, 
          ...d.data() 
        })) as TripEvent[];
        
        setEvents(eventData);
        
        // 2. 抓取成員
        const memberSnap = await getDocs(collection(db, 'trips', tripId, 'members'));
        console.log(`👥 集合 'members' 回傳數量:`, memberSnap.size);
        setMembers(memberSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // 3. 抓取預訂
        const bookingSnap = await getDocs(collection(db, 'trips', tripId, 'bookings'));
        setBookings(bookingSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      } catch (error) { 
        console.error("🔥 Firebase 存取重大錯誤:", error); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchData();
  }, []);

  const dayOptions: DayOption[] = [
    { date: "2026-04-23", label: "4/23", week: "四" },
    { date: "2026-04-24", label: "4/24", week: "五" },
    { date: "2026-04-25", label: "4/25", week: "六" },
    { date: "2026-04-26", label: "4/26", week: "日" },
  ];

  // 格式化日期比對
  const currentDayEvents = events.filter(e => {
    const d = (e.date || "").replace(/\//g, '-').trim();
    return d === activeDay;
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FDFCF8] text-[#769370] font-black">載入中...</div>;

  return (
    <div className="min-h-screen bg-[#F1F1E6] flex justify-center items-start">
      <div className="w-full max-w-md bg-[#FDFCF8] min-h-screen relative shadow-2xl pb-32">
        <header className="pt-14 pb-4 px-6 text-center">
          <span className="text-[10px] font-black tracking-[0.2em] text-[#769370]/50 uppercase">Okinawa Journal</span>
          <h1 className="text-3xl font-black text-slate-950 mt-1">日本沖繩之旅 🗾</h1>
        </header>

        {activeTab === "行程" && (
          <div className="animate-in fade-in duration-500">
            <DaySelector days={dayOptions} activeDay={activeDay} onDayChange={setActiveDay} />
            <WeatherCard />
            <main className="px-6 mt-10">
              <div className="space-y-10">
                {currentDayEvents.length > 0 ? (
                  currentDayEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))
                ) : (
                  <div className="text-center py-20 opacity-30">今天休息一下 🌱 (Debug: {activeDay})</div>
                )}
              </div>
            </main>
          </div>
        )}

        {activeTab === "預訂" && (
          <main className="px-6 mt-6 pb-20">
            {bookings.length > 0 ? bookings.map(b => <BookingCard key={b.id} data={b} />) : <p className="text-center opacity-30">無預訂資料</p>}
          </main>
        )}

        {activeTab === "成員" && (
          <main className="px-6 mt-6 grid grid-cols-2 gap-4 pb-20">
            {members.map(m => <MemberCard key={m.id} member={m} />)}
          </main>
        )}

        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}

export default App;