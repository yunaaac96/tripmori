import { useEffect, useState } from 'react';
import { db, auth } from './config/firebase';
import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
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
  
  const tripId = "okinawa2026"; 

  useEffect(() => {
    const runMigrationAndFetch = async () => {
      try {
        setLoading(true);
        await signInAnonymously(auth);
        console.log("🔐 Firebase 已登入");

        // --- 🚛 強制搬移邏輯 (從舊 ID 複製到新 ID) ---
        const oldId = "74pfE7RXyEIusEdRV0rZ";
        const collectionsToMigrate = ["events", "members", "bookings"];
        
        for (const colName of collectionsToMigrate) {
          const oldSnap = await getDocs(collection(db, "trips", oldId, colName));
          if (!oldSnap.empty) {
            console.log(`📦 搬移中: [${colName}] 找到 ${oldSnap.size} 筆舊資料`);
            for (const d of oldSnap.docs) {
              // 強制寫入到新 ID 的路徑下
              await setDoc(doc(db, "trips", tripId, colName, d.id), d.data());
            }
          }
        }
        // ------------------------------------------

        const tripDocRef = doc(db, 'trips', tripId);
        
        // 抓取搬移後的新資料
        const eventSnap = await getDocs(collection(tripDocRef, 'events'));
        const eventList = eventSnap.docs.map(d => ({ id: d.id, ...d.data() } as TripEvent));
        eventList.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
        setEvents(eventList);

        const memberSnap = await getDocs(collection(tripDocRef, 'members'));
        setMembers(memberSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const bookingSnap = await getDocs(collection(tripDocRef, 'bookings'));
        setBookings(bookingSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        console.log("✅ 全數資料同步完成！");

      } catch (error) {
        console.error("🔥 發生錯誤:", error);
      } finally {
        setLoading(false);
      }
    };

    runMigrationAndFetch();
  }, []);

  const dayOptions: DayOption[] = [
    { date: "2026-04-23", label: "4/23", week: "四" },
    { date: "2026-04-24", label: "4/24", week: "五" },
    { date: "2026-04-25", label: "4/25", week: "六" },
    { date: "2026-04-26", label: "4/26", week: "日" },
  ];

  const currentDayEvents = events.filter(e => {
    const d = (e.date || "").replace(/\//g, '-').trim();
    return d === activeDay;
  });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDFCF8] text-[#769370] font-black">
      正在更新沖繩手帳內容...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F1F1E6] flex justify-center items-start">
      <div className="w-full max-w-md bg-[#FDFCF8] min-h-screen relative shadow-2xl pb-32 overflow-y-auto no-scrollbar"
           style={{ backgroundImage: 'radial-gradient(#e5e7eb 1.5px, transparent 1.5px)', backgroundSize: '30px 30px' }}>
        
        <header className="pt-14 pb-4 px-6 text-center">
          <span className="text-[10px] font-black tracking-[0.2em] text-[#769370]/50 uppercase">Okinawa Journal</span>
          <h1 className="text-3xl font-black text-slate-950 mt-1">日本沖繩之旅 🗾</h1>
        </header>

        {activeTab === "行程" && (
          <div className="animate-in fade-in duration-500">
            <DaySelector days={dayOptions} activeDay={activeDay} onDayChange={setActiveDay} />
            <WeatherCard />
            <main className="px-6 mt-10 relative">
              <div className="absolute left-[1.9rem] top-2 bottom-0 w-[2px] bg-slate-100"></div>
              <div className="space-y-10">
                {currentDayEvents.length > 0 ? (
                  currentDayEvents.map((event) => (
                    <div key={event.id} className="relative flex gap-6 z-10">
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-slate-400 mb-1.5">{event.startTime}</span>
                        <div className={`w-3.5 h-3.5 rounded-full border-4 border-white shadow-md ${
                          event.category === 'food' ? 'bg-[#E9C46A]' : 
                          event.category === 'transport' ? 'bg-[#90BECC]' : 'bg-[#769370]'
                        }`}></div>
                      </div>
                      <div className="flex-1"><EventCard event={event} /></div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20 opacity-30 font-bold">今天休息一下 🌱</div>
                )}
              </div>
            </main>
          </div>
        )}

        {activeTab === "預訂" && (
          <main className="px-6 mt-6 pb-20 animate-in slide-in-from-bottom-4 duration-500">
            {bookings.length > 0 ? bookings.map(b => <BookingCard key={b.id} data={b} />) : <p className="text-center py-20 opacity-30">無預訂資訊</p>}
          </main>
        )}

        {activeTab === "成員" && (
          <main className="px-6 mt-6 grid grid-cols-2 gap-4 pb-20 animate-in zoom-in duration-300">
            {members.map(m => <MemberCard key={m.id} member={m} />)}
          </main>
        )}

        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}

export default App;