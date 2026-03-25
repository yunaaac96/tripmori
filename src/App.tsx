import { useEffect, useState } from 'react';
import { db, auth } from './config/firebase'; // 確保這條路徑正確
import { collection, getDocs } from 'firebase/firestore'; // 根據需要引入
import { signInAnonymously } from 'firebase/auth'; // 根據需要引入
import DaySelector from './components/DaySelector';
import EventCard from './components/EventCard';
import WeatherCard from './components/WeatherCard';
import TabBar from './components/TabBar';
import { TripEvent, DayOption } from './types/index'; // 確保路徑與型別定義正確

// 引入 Asset
import heroImage from './assets/hero.png'; 

function App() {
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [activeDay, setActiveDay] = useState("2026-04-23"); // 設為行程第一天
  const [activeTab, setActiveTab] = useState("行程");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 🎯 這裡填入你之前編寫的 Firebase fetchData 邏輯
    // 務必保留 setLoading(true) 和 setLoading(false)
    const fetchData = async () => {
      try {
        setLoading(true);
        console.log("正在從 Firebase 抓取資料...");
        
        // --- 你的 Firebase 邏輯開始 ---
        // (例如: signInAnonymously, getDocs 等)
        // 抓取完成後使用 setEvents(data)
        // --- 你的 Firebase 邏輯結束 ---

        // 模擬延遲 (測試 UI 用，接好資料後請刪除)
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        setLoading(false); 
      } catch (error) {
        console.error("Firebase 讀取失敗:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 根據模板定義的日期選項
  const dayOptions: DayOption[] = [
    { date: "2026-04-23", label: "4/23", week: "四" },
    { date: "2026-04-24", label: "4/24", week: "五" },
    { date: "2026-04-25", label: "4/25", week: "六" },
    { date: "2026-04-26", label: "4/26", week: "日" },
  ];

  // 根據 activeDay 過濾行程
  const currentDayEvents = events.filter(event => event.date === activeDay);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDFCF8] text-[#769370] font-bold">
      沖繩手帳載入中...
    </div>
  );

  return (
    // 外層容器：確保在 PC 端置中，手機端滿版。背景色對齊模板。
    <div className="min-h-screen bg-[#F1F1E6] flex justify-center items-start">
      {/* 手機模擬容器：限制最大寬度，加上陰影，背景設為手帳米白色 */}
      <div className="w-full max-w-md bg-[#FDFCF8] min-h-screen relative shadow-2xl overflow-y-auto no-scrollbar pb-32">
        
        {/* 1. 拍立得風格 Hero 區域 */}
        <div className="aspect-[1.1] w-full p-4">
          <img 
            src={heroImage} 
            alt="Okinawa View" 
            className="w-full h-full object-cover rounded-sm shadow-xl border-4 border-white"
          />
        </div>

        {/* 2. 標題區域 */}
        <header className="pt-6 pb-4 px-6 text-center">
          <span className="text-[10px] font-black tracking-[0.2em] text-[#769370]/50 uppercase">Okinawa Journal</span>
          <h1 className="text-3xl font-black text-slate-950 mt-1">日本沖繩之旅 🗾</h1>
        </header>

        {/* 3. 日期選擇器 (需要更新其子組件 UI 以匹配模板) */}
        <DaySelector days={dayOptions} activeDay={activeDay} onDayChange={setActiveDay} />

        {/* 4. 天氣卡片 (需要更新其子組件 UI 以匹配模板) */}
        <WeatherCard />

        {/* 5. 行程列表區域 (Tab 切換) */}
        {activeTab === "行程" && (
          <main className="px-6 mt-10 relative">
            {/* 時間軸垂直線 */}
            <div className="absolute left-[1.9rem] top-2 bottom-0 w-[2px] bg-slate-100"></div>

            <div className="space-y-10">
              {currentDayEvents.length > 0 ? (
                currentDayEvents.map((event) => (
                  <div key={event.id} className="relative flex gap-6 z-10">
                    {/* 時間與節點 */}
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold text-slate-400 mb-1.5">{event.startTime}</span>
                      <div className={`w-3.5 h-3.5 rounded-full border-4 border-white shadow-md ${
                        event.category === 'food' ? 'bg-[#E9C46A]' : 
                        event.category === 'transport' ? 'bg-[#90BECC]' : 'bg-[#769370]'
                      }`}></div>
                    </div>
                    {/* 行程卡片 (需要更新其子組件 UI 以匹配模板) */}
                    <div className="flex-1">
                      <EventCard event={event} />
                    </div>
                  </div>
                ))
              ) : (
                // 無行程時的顯示
                <div className="text-center py-20 opacity-30 font-bold italic text-sm text-slate-400 uppercase tracking-widest">
                  今天休息一下 🌱
                </div>
              )}
            </div>
          </main>
        )}

        {/* 其他 Tab 的佔位 (根據需要自行擴充 MemberCard, BookingCard 等) */}
        {activeTab !== "行程" && (
          <main className="px-6 py-20 text-center text-slate-400 font-bold animate-pulse">
            {activeTab} 內容載入中...
          </main>
        )}

        {/* 6. 底部導覽列 (需要更新其子組件 UI 以匹配模板) */}
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}

export default App;