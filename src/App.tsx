import { useEffect, useState } from 'react';
import { db } from './config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { importTripData } from './scripts/importData';

function App() {
  const [tripName, setTripName] = useState<string>("讀取中...");

  useEffect(() => {
    // ── 第一次匯入資料用，成功後把這三行刪掉 ──
    importTripData();
    // ────────────────────────────────────────

    const fetchTrip = async () => {
      try {
        const docRef = doc(db, "trips", "okinawa-2026");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setTripName(docSnap.data().title);
        } else {
          setTripName("找不到行程資料");
        }
      } catch (error) {
        console.error("Firebase 錯誤:", error);
        setTripName("連線失敗");
      }
    };
    fetchTrip();
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-10">
      <h1 className="text-accent">Tripmori</h1>
      
      <div className="mt-4 p-8 border-base border rounded-3xl shadow-xl bg-white max-w-md w-full">
        <h2 className="text-2xl font-bold mb-2 text-slate-800">{tripName}</h2>
        <p className="mb-6 text-sm text-slate-500 font-medium">
          ✈️ 航班 IT230 | 4月23日 - 4月26日
        </p>
        
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xl">📸</span>
            <div className="text-left">
              <p className="font-bold text-slate-700">第一站：那霸波上宮</p>
              <p className="text-xs text-slate-400">主要攝影：Canon 80D + 18-135mm</p>
            </div>
          </div>
        </div>

        <button className="mt-8 w-full bg-accent text-white px-8 py-4 rounded-2xl font-black hover:scale-[1.02] active:scale-95 transition-all cursor-pointer shadow-lg shadow-purple-200">
          查看完整攝影清單
        </button>
      </div>

      <code className="mt-10 opacity-50">
        Connected to: tripmori-74a18.firebaseapp.com
      </code>
    </div>
  )
}

export default App;