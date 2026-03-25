import { useEffect, useState } from 'react';
import { db, auth } from './config/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
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
  
  // 🎯 確保 ID 是純淨字串
  const tripId = "74pfE7RXyEIusdRV0rZ".trim(); 

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // 1. 匿名登入
        const user = await signInAnonymously(auth);
        console.log("🔐 Firebase 登入成功:", user.user.uid);

        // 2. 核心：使用 doc 引用來確保路徑絕對準確
        const tripDocRef = doc(db, 'trips', tripId);
        
        // 診斷：先檢查父文件是否存在
        const tripSnap = await getDoc(tripDocRef);
        if (!tripSnap.exists()) {
          console.error("❌ 找不到父文件！請檢查 'trips' 集合中是否有 ID:", tripId);
        } else {
          console.log("✅ 成功連線到行程文件:", tripSnap.data()?.name);
        }

        // 3. 抓取子集合 (使用強制路徑方式)
        const eventsCol = collection(tripDocRef, 'events');
        const eventSnap = await getDocs(eventsCol);
        console.log(`📊 行程 (events) 數量: ${eventSnap.size}`);
        
        const eventList = eventSnap.docs.map(d => ({ 
          id: d.id, 
          ...d.data() 
        } as TripEvent));
        
        // 時間排序
        eventList.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
        setEvents(eventList);

        // 4. 抓取其他子集合
        const memberSnap = await getDocs(collection(tripDocRef, 'members'));
        console.log(`👥 成員 (members) 數量: ${memberSnap.size}`);
        setMembers(memberSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const bookingSnap = await getDocs(collection(tripDocRef, 'bookings'));
        setBookings(bookingSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      } catch (error) {
        console.error("🔥 Firestore 抓取失敗:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 日期過濾邏輯
  const currentDayEvents = events.filter(e => {
    const d = (e.date || "").replace(/\//g, '-').trim();
    return d === activeDay;
  });

  const dayOptions: DayOption[] = [
    { date: "2026-04-23", label: "4/23", week: "四" },
    { date: "2026-04-24", label: "4/24", week: "五" },
    { date: "2026-04-25", label: "4/25", week: "六" },
    { date: "2026-04-26", label: "4/26", week: "日" },
  ];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDFCF8] text-[#769370] font-black animate-pulse">
      正在同步沖繩雲端資料...
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
          <main className="px-6 mt-6 pb-20">
            {bookings.length > 0 ? (
              bookings.map(b => <BookingCard key={b.id} data={b} />)
            ) : (
              <p className="text-center py-20 opacity-30 font-bold">尚未加入預訂資訊 ✈️</p>
            )}
          </main>
        )}

        {activeTab === "成員" && (
          <main className="px-6 mt-6 grid grid-cols-2 gap-4 pb-20">
            {members.length > 0 ? (
              members.map(m => <MemberCard key={m.id} member={m} />)
            ) : (
              <p className="col-span-2 text-center py-20 opacity-30 font-bold">成員名單為空 👤</p>
            )}
          </main>
        )}

        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}

export default App;