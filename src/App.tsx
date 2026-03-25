import { useEffect, useState } from 'react';
import { db } from './config/firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import DaySelector from './components/DaySelector';
import EventCard from './components/EventCard';
import WeatherCard from './components/WeatherCard';
import TabBar from './components/TabBar';
import MemberCard from './components/MemberCard';
import BookingCard from './components/BookingCard';
import { TripEvent, DayOption } from './types';

function App() {
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [activeDay, setActiveDay] = useState("2026-04-23");
  const [activeTab, setActiveTab] = useState("行程");
  const [loading, setLoading] = useState(true);
  
  const tripId = "74pfE7RXyEIusdRV0rZ"; 

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // 抓取行程
        const eventSnap = await getDocs(query(collection(db, `trips/${tripId}/events`), orderBy("startTime")));
        const eventList = eventSnap.docs.map(d => ({ id: d.id, ...d.data() } as TripEvent));
        setEvents(eventList);
        
        // 抓取成員
        const memberSnap = await getDocs(collection(db, `trips/${tripId}/members`));
        setMembers(memberSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // 抓取預訂
        const bookingSnap = await getDocs(collection(db, `trips/${tripId}/bookings`));
        setBookings(bookingSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      } catch (error) { 
        console.error("Firebase Error:", error); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchData();
  }, []);

  // 1. 修正日期與星期 (4/23 為週四)
  const dayOptions: DayOption[] = [
    { date: "2026-04-23", label: "4/23", week: "四" },
    { date: "2026-04-24", label: "4/24", week: "五" },
    { date: "2026-04-25", label: "4/25", week: "六" },
    { date: "2026-04-26", label: "4/26", week: "日" },
  ];

  // 🎯 修正過濾邏輯：加入 trim() 確保字串完全匹配，並確保事件渲染與 activeDay 連動
  const currentDayEvents = events.filter(e => e.date.trim() === activeDay.trim());

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDFCF8] text-[#769370] font-black">
      正在翻開沖繩手帳...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F1F1E6] flex justify-center items-start">
      <div className="w-full max-w-md bg-[#FDFCF8] min-h-screen relative shadow-2xl overflow-y-auto no-scrollbar pb-32"
           style={{ backgroundImage: 'radial-gradient(#e5e7eb 1.5px, transparent 1.5px)', backgroundSize: '30px 30px' }}>
        
        {/* 固定 Header */}
        <header className="pt-12 pb-4 px-6 text-center">
          <span className="text-[10px] font-black tracking-[0.2em] text-[#769370]/50 uppercase">Okinawa Journal</span>
          <h1 className="text-3xl font-black text-slate-950 mt-1">日本沖繩之旅 🗾</h1>
        </header>

        {/* 根據不同 Tab 顯示不同內容 */}
        {activeTab === "行程" && (
          <div className="animate-in fade-in duration-500">
            {/* 🎯 確保 DaySelector 接收正確的狀態改變函式 */}
            <DaySelector 
              days={dayOptions} 
              activeDay={activeDay} 
              onDayChange={(date) => setActiveDay(date)} 
            />
            <WeatherCard />
            <main className="px-6 mt-10 relative">
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
                      <div className="flex-1"><EventCard event={event} /></div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20 opacity-30 font-bold">
                    <p>今天暫時沒排行程 🌱</p>
                    <p className="text-[10px] mt-2 italic font-normal">ActiveDay: {activeDay}</p>
                  </div>
                )}
              </div>
            </main>
          </div>
        )}

        {activeTab === "預訂" && (
          <main className="px-6 mt-6 pb-20 animate-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-sm font-black text-slate-400 mb-6 tracking-widest flex items-center gap-2">
              <span className="w-8 h-[1px] bg-slate-200"></span> 交通與住宿資訊
            </h2>
            {bookings.length > 0 ? bookings.map(b => (
              <BookingCard key={b.id} data={b} />
            )) : <p className="text-center opacity-30">載入預訂資料中...</p>}
          </main>
        )}

        {activeTab === "成員" && (
          <main className="px-6 mt-6 grid grid-cols-2 gap-4 pb-20 animate-in zoom-in duration-300">
            {members.map(m => (
              <MemberCard key={m.id} member={m} />
            ))}
            <div className="border-2 border-dashed border-slate-100 rounded-[2.5rem] flex flex-col items-center justify-center p-6 text-slate-300">
               <span className="text-2xl">+</span>
               <span className="text-[10px] font-bold mt-1">新增成員</span>
            </div>
          </main>
        )}

        {/* 🎯 底部導航欄，確保 Tab 切換正常工作 */}
        <TabBar activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />
      </div>
    </div>
  );
}

export default App;