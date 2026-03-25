import { useEffect, useState } from 'react';
import { db } from './config/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';

function App() {
  const [events, setEvents] = useState<any[]>([]);
  const [tripInfo, setTripInfo] = useState<any>(null);
  const [activeDay, setActiveDay] = useState("2026-04-23");
  const [loading, setLoading] = useState(true);
  
  // 🎯 這是你截圖中顯示的最新 ID
  const tripId = "74pfE7RXyEIusdRV0rZ"; 

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // 1. 抓取旅程主文件 (名稱: 日本沖繩之旅)
        const tripSnap = await getDoc(doc(db, "trips", tripId));
        if (tripSnap.exists()) {
          setTripInfo(tripSnap.data());
        }

        // 2. 抓取子集合 events
        const q = query(collection(db, `trips/${tripId}/events`), orderBy("startTime"));
        const querySnapshot = await getDocs(q);
        const eventList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setEvents(eventList);
      } catch (error) {
        console.error("Firebase 讀取失敗:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const days = ["2026-04-23", "2026-04-24", "2026-04-25", "2026-04-26"];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F7FF]">
      <div className="animate-bounce text-accent font-black text-2xl">Tripmori...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F7FF] pb-24 font-sans text-slate-800">
      {/* 頂部 Header - 延續設計討論的簡約感 */}
      <header className="pt-14 pb-6 px-6 text-center">
        <span className="text-[10px] font-black tracking-[0.2em] text-accent uppercase opacity-50">Okinawa Trip</span>
        <h1 className="text-4xl font-black text-slate-900 mt-1 mb-2">
          {tripInfo?.name || "日本沖繩之旅"} {tripInfo?.coverEmoji || "🗾"}
        </h1>
        <div className="flex justify-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          <span>{activeDay}</span>
          <span>•</span>
          <span>Day {days.indexOf(activeDay) + 1}</span>
        </div>
      </header>

      {/* 拍立得風格分頁切換器 - 毛玻璃質感 */}
      <nav className="sticky top-0 z-20 py-4 px-4 bg-[#F8F7FF]/60 backdrop-blur-xl flex justify-center gap-3">
        {days.map((day, index) => (
          <button
            key={day}
            onClick={() => setActiveDay(day)}
            className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all border-2 ${
              activeDay === day 
              ? "bg-accent border-accent text-white shadow-lg shadow-purple-200" 
              : "bg-white border-transparent text-slate-400 shadow-sm"
            }`}
          >
            <span className="text-[10px] font-bold opacity-60">D{index + 1}</span>
            <span className="text-lg font-black leading-none">{day.split('-').pop()}</span>
          </button>
        ))}
      </nav>

      {/* 行程列表 - 拍立得卡片設計 */}
      <main className="max-w-md mx-auto px-6 mt-8 space-y-8">
        {events.filter(e => e.date === activeDay).length > 0 ? (
          events.filter(e => e.date === activeDay).map((event) => (
            <div key={event.id} className="group bg-white p-4 rounded-[2.5rem] shadow-2xl shadow-purple-900/5 border border-white relative overflow-hidden transition-all hover:-translate-y-1">
              {/* 攝影占位區 (這部分可以之後放 Firebase Storage 的相片) */}
              <div className="aspect-[5/4] bg-slate-100 rounded-[2rem] mb-5 overflow-hidden flex items-center justify-center border-base border">
                 <span className="text-4xl grayscale opacity-20">📸</span>
              </div>
              
              <div className="px-3 pb-2">
                <div className="flex justify-between items-center mb-2">
                  <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-tighter ${
                    event.category === 'food' ? 'bg-orange-50 text-orange-400' : 'bg-purple-50 text-accent'
                  }`}>
                    {event.category || "Spot"}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-300">{event.startTime}</span>
                </div>
                <h3 className="text-xl font-bold text-slate-800 leading-tight">{event.title}</h3>
                <p className="text-xs text-slate-400 mt-2 font-medium">📍 {event.location}</p>
                
                {event.notes && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-3xl text-[11px] leading-relaxed text-slate-500 border border-slate-100 font-medium">
                    <span className="text-accent mr-1">●</span> {event.notes}
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-20">
            <p className="text-slate-300 font-bold">今天還沒有安排景點喔</p>
          </div>
        )}
      </main>

      {/* 底部導航欄 - 磨砂玻璃質感 */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[85%] max-w-xs bg-slate-900/90 backdrop-blur-2xl text-white p-2 rounded-[2.5rem] shadow-2xl flex items-center">
         <div className="flex-1 px-5">
           <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest leading-none">Status</p>
           <p className="text-xs font-bold mt-1 text-purple-200">準備前往沖繩 ✈️</p>
         </div>
         <button className="bg-accent h-12 w-12 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform">
           🗺️
         </button>
      </div>
    </div>
  );
}

export default App;