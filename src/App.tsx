import { useEffect, useState } from 'react';
import { db } from './config/firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import DaySelector from './components/DaySelector';
import EventCard from './components/EventCard';
import WeatherCard from './components/WeatherCard';
import TabBar from './components/TabBar';
import { TripEvent, DayOption } from './types';

function App() {
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [activeDay, setActiveDay] = useState("2026-04-23");
  const [activeTab, setActiveTab] = useState("行程");
  const [loading, setLoading] = useState(true);
  
  const tripId = "74pfE7RXyEIusdRV0rZ"; 

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, `trips/${tripId}/events`), orderBy("startTime"));
        const querySnapshot = await getDocs(q);
        const eventList = querySnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        } as TripEvent));
        
        console.log("抓取到的原始資料:", eventList); // 偵錯用
        setEvents(eventList);
      } catch (error) { 
        console.error("讀取失敗:", error); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchData();
  }, []);

  // 1. 修正日期與星期
  const dayOptions: DayOption[] = [
    { date: "2026-04-23", label: "4/23", week: "四" },
    { date: "2026-04-24", label: "4/24", week: "五" },
    { date: "2026-04-25", label: "4/25", week: "六" },
    { date: "2026-04-26", label: "4/26", week: "日" },
  ];

  // 2. 修正過濾邏輯 (確保格式匹配)
  const currentDayEvents = events.filter(e => e.date === activeDay);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDFCF8] text-[#769370] font-black">
      正在翻開沖繩手帳...
    </div>
  );

  return (
    /* 電員版顯示異常修正：強制 max-w-md 並置中 */
    <div className="min-h-screen bg-[#F1F1E6] flex justify-center">
      <div className="w-full max-w-md bg-[#FDFCF8] min-h-screen relative shadow-2xl overflow-y-auto no-scrollbar"
           style={{ backgroundImage: 'radial-gradient(#e5e7eb 1.5px, transparent 1.5px)', backgroundSize: '30px 30px' }}>
        
        {/* Header */}
        <header className="pt-14 pb-4 px-6 text-center">
          <span className="text-[10px] font-black tracking-[0.2em] text-[#769370]/50 uppercase">Okinawa Journal</span>
          <h1 className="text-3xl font-black text-slate-950 mt-1">日本沖繩之旅 🗾</h1>
        </header>

        {/* 日期選擇 */}
        <DaySelector days={dayOptions} activeDay={activeDay} onDayChange={setActiveDay} />

        {/* 天氣 */}
        <WeatherCard />

        {/* 行程 Timeline */}
        <main className="px-6 mt-10 pb-40 relative">
          <div className="absolute left-[1.9rem] top-2 bottom-0 w-[2px] bg-slate-100 z-0"></div>

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
                  <div className="flex-1">
                    <EventCard event={event} />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-20">
                <p className="text-slate-300 font-bold">這天還沒有行程資料</p>
                <p className="text-[10px] text-slate-200 mt-1">請檢查 Firestore Date 欄位格式</p>
              </div>
            )}
          </div>
        </main>

        {/* 底部導航欄 - 傳入狀態與切換函式 */}
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}

export default App;