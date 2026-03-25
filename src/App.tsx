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
  const [loading, setLoading] = useState(true);
  
  // 你的 Firestore tripId
  const tripId = "74pfE7RXyEIusdRV0rZ"; 

  useEffect(() => {
    const fetchData = async () => {
      try {
        const q = query(collection(db, `trips/${tripId}/events`), orderBy("startTime"));
        const querySnapshot = await getDocs(q);
        const eventList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TripEvent));
        setEvents(eventList);
      } catch (error) { console.error(error); } finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const dayOptions: DayOption[] = [
    { date: "2026-04-23", label: "4/23", week: "五" },
    { date: "2026-04-24", label: "4/24", week: "六" },
    { date: "2026-04-25", label: "4/25", week: "日" },
    { date: "2026-04-26", label: "4/26", week: "一" },
  ];

  const currentDayEvents = events.filter(e => e.date === activeDay);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDFCF8] text-accent font-black">
      載入沖繩手帳中...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFCF8] pb-40" 
         style={{ backgroundImage: 'radial-gradient(#e5e7eb 1.5px, transparent 1.5px)', backgroundSize: '30px 30px' }}>
      
      {/* 1. Header (延續簡約設計) */}
      <header className="pt-14 pb-4 px-6 text-center">
        <span className="text-[10px] font-black tracking-[0.2em] text-accent/50 uppercase">Okinawa Journal</span>
        <h1 className="text-4xl font-black text-slate-950 mt-1">日本沖繩之旅 🗾</h1>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2">2026.04.23 - 04.26</p>
      </header>

      {/* 2. 日期選擇器 */}
      <DaySelector days={dayOptions} activeDay={activeDay} onDayChange={setActiveDay} />

      {/* 3. 天氣資訊 */}
      <WeatherCard />

      {/* 4. 行程 Timeline */}
      <main className="max-w-md mx-auto px-6 mt-12 relative">
        {/* 時間軸線 */}
        <div className="absolute left-[1.9rem] top-2 bottom-0 w-[2px] bg-slate-100 z-0"></div>

        <div className="space-y-12">
          {currentDayEvents.length > 0 ? (
            currentDayEvents.map((event) => (
              <div key={event.id} className="relative flex gap-6 z-10">
                {/* 時間點與圓點 */}
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-slate-400 mb-1.5">{event.startTime}</span>
                  <div className={`w-3.5 h-3.5 rounded-full border-4 border-white shadow-md ${
                    event.category === 'food' ? 'bg-[#E9C46A]' : 
                    event.category === 'transport' ? 'bg-[#90BECC]' : 'bg-[#769370]'
                  }`}></div>
                </div>

                {/* 行程卡片 */}
                <div className="flex-1">
                  <EventCard event={event} />
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-20 text-slate-300 font-bold">今天休息一下 🌱</div>
          )}
        </div>
      </main>

      {/* 5. 底部導航欄 */}
      <TabBar />
    </div>
  );
}

export default App;