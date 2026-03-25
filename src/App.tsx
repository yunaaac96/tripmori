import { useEffect, useState } from 'react';
import { db } from './config/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';

function App() {
  const [events, setEvents] = useState<any[]>([]);
  const [tripData, setTripData] = useState<any>(null);
  const [activeDay, setActiveDay] = useState("2026-04-23");
  const tripId = "kZYVcZ1tgzb4oVlsWvvr"; // 改成你成功的 ID

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. 抓取旅程主資訊
        const tripSnap = await getDoc(doc(db, "trips", tripId));
        if (tripSnap.exists()) setTripData(tripSnap.data());

        // 2. 抓取行程
        const q = query(collection(db, `trips/${tripId}/events`), orderBy("startTime"));
        const querySnapshot = await getDocs(q);
        const eventList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setEvents(eventList);
      } catch (error) {
        console.error("讀取失敗:", error);
      }
    };
    fetchData();
  }, []);

  const days = ["2026-04-23", "2026-04-24", "2026-04-25", "2026-04-26"];

  return (
    <div className="min-h-screen bg-[#F8F7FF] pb-20 font-sans text-slate-800">
      {/* 頂部 Header */}
      <header className="pt-12 pb-6 px-6 text-center">
        <h1 className="text-4xl font-black text-accent tracking-tighter mb-1">Tripmori 🗾</h1>
        <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Okinawa 2026</p>
      </header>

      {/* 拍立得風格分頁 */}
      <nav className="sticky top-0 z-10 py-4 px-4 overflow-x-auto no-scrollbar bg-[#F8F7FF]/80 backdrop-blur-md flex justify-center gap-3">
        {days.map((day, index) => (
          <button
            key={day}
            onClick={() => setActiveDay(day)}
            className={`px-5 py-2 rounded-2xl text-sm font-bold transition-all shadow-sm ${
              activeDay === day 
              ? "bg-accent text-white scale-105 shadow-purple-200" 
              : "bg-white text-slate-400 hover:text-accent"
            }`}
          >
            Day {index + 1}
          </button>
        ))}
      </nav>

      <main className="max-w-md mx-auto px-6 mt-6 space-y-6">
        {events.filter(e => e.date === activeDay).length > 0 ? (
          events.filter(e => e.date === activeDay).map((event) => (
            <div key={event.id} className="group bg-white p-4 rounded-[2rem] shadow-xl shadow-purple-100/50 border border-white transition-all hover:-rotate-1">
              {/* 模擬拍立得的照片區域 (暫時用色塊代表) */}
              <div className="aspect-[4/3] bg-slate-100 rounded-2xl mb-4 overflow-hidden relative">
                <div className="absolute inset-0 flex items-center justify-center text-4xl opacity-20">📸</div>
                {/* 之後可以從 Firebase 抓圖片放這 */}
              </div>
              
              <div className="px-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-black text-accent bg-purple-50 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                    {event.category || "Spot"}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{event.startTime}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-800 leading-tight">{event.title}</h3>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  📍 {event.location.split(' ').pop()}
                </p>
                
                {event.notes && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-2xl text-[11px] leading-relaxed text-slate-500 border border-slate-100">
                    <span className="font-bold text-accent">Memo:</span> {event.notes}
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-20 opacity-30 font-bold">載入行程中...</div>
        )}
      </main>

      {/* 固定底欄：預算或航班 */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-xs bg-slate-900/90 backdrop-blur-xl text-white py-4 px-6 rounded-3xl shadow-2xl flex justify-between items-center">
        <div>
          <p className="text-[10px] text-slate-400 font-bold uppercase">Next Flight</p>
          <p className="text-sm font-bold">IT230 06:50</p>
        </div>
        <div className="h-8 w-[1px] bg-white/10"></div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 font-bold uppercase">Budget</p>
          <p className="text-sm font-bold text-purple-300">¥ 26,290</p>
        </div>
      </div>
    </div>
  );
}

export default App;