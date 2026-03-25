import { useEffect, useState } from 'react';
import { db } from './config/firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';

function App() {
  const [events, setEvents] = useState<any[]>([]);
  const tripId = "kZYVcZ1tgzb4oVlsWvvr"; // 填入剛才 Log 顯示的 ID

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        // 抓取該旅程下的 events 子集合，並按日期排序
        const q = query(collection(db, `trips/${tripId}/events`), orderBy("date"), orderBy("startTime"));
        const querySnapshot = await getDocs(q);
        const eventList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setEvents(eventList);
      } catch (error) {
        console.error("讀取失敗:", error);
      }
    };
    fetchEvents();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <header className="text-center mb-10">
        <h1 className="text-accent text-4xl font-black mb-2">Tripmori 🗾</h1>
        <p className="text-slate-500 font-medium">日本沖繩攝影之旅 | 2026.04.23 - 04.26</p>
      </header>

      <div className="max-w-2xl mx-auto space-y-6">
        {events.length > 0 ? (
          events.map((event, index) => (
            <div key={event.id} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex gap-4 items-start">
              <div className="bg-purple-50 text-accent px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">
                {event.startTime || "全天"}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-800 text-lg">{event.title}</h3>
                <p className="text-slate-500 text-sm mt-1">📍 {event.location}</p>
                {event.notes && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-xl text-xs text-slate-600 italic">
                    💡 {event.notes}
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-slate-400">正在從雲端載入行程...</p>
        )}
      </div>

      <footer className="text-center mt-20 opacity-30 text-xs">
        Data ID: {tripId}
      </footer>
    </div>
  );
}

export default App;