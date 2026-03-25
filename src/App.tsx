import { useEffect, useState } from 'react';
import { db } from './config/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';

function App() {
  const [events, setEvents] = useState<any[]>([]);
  const [tripInfo, setTripInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // ⚠️ 重要：請把這裡換成你在 Firebase Console 看到的實體 ID
  const tripId = "kZYVcZ1tgzb4oVlsWvvr"; 

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // 1. 抓取旅程主文件 (名稱、日期)
        const tripSnap = await getDoc(doc(db, "trips", tripId));
        if (tripSnap.exists()) {
          setTripInfo(tripSnap.data());
        }

        // 2. 抓取子集合 events (所有景點行程)
        const q = query(collection(db, `trips/${tripId}/events`), orderBy("date"), orderBy("startTime"));
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

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-accent">載入行程中...</div>;

  return (
    <div className="min-h-screen bg-[#F8F7FF] pb-10">
      {/* 頂部 Header */}
      <header className="pt-12 pb-6 px-6 text-center">
        <h1 className="text-4xl font-black text-accent tracking-tighter mb-1">
          {tripInfo?.name || "日本沖繩之旅"} 🗾
        </h1>
        <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">
          {tripInfo?.destination || "Okinawa"} 2026
        </p>
      </header>

      {/* 行程 Timeline */}
      <main className="max-w-md mx-auto px-6 space-y-6">
        {events.length > 0 ? (
          events.map((event) => (
            <div key={event.id} className="bg-white p-5 rounded-[2rem] shadow-xl shadow-purple-100/50 border border-white">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-black text-accent bg-purple-50 px-2 py-0.5 rounded-full uppercase">
                  {event.category}
                </span>
                <span className="text-xs font-mono text-slate-400">{event.startTime}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-800">{event.title}</h3>
              <p className="text-xs text-slate-400 mt-1">📍 {event.location}</p>
              
              {event.notes && (
                <div className="mt-3 p-3 bg-slate-50 rounded-2xl text-[11px] text-slate-500 border border-slate-100">
                  {event.notes}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-20 text-slate-300">目前沒有行程資料</div>
        )}
      </main>

      {/* 底部資訊欄 */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-xs bg-slate-900/90 backdrop-blur-md text-white py-4 px-6 rounded-3xl shadow-2xl flex justify-between items-center">
         <div className="text-left">
           <p className="text-[10px] text-slate-400">NEXT SPOT</p>
           <p className="text-sm font-bold truncate w-24">波上宮</p>
         </div>
         <button className="bg-accent px-4 py-2 rounded-xl text-xs font-black">地圖</button>
      </div>
    </div>
  );
}

export default App;