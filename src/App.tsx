import { useEffect, useState } from 'react';
import { db, auth } from './config/firebase';
import { collection, getDocs, doc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import DaySelector from './components/DaySelector';
import EventCard from './components/EventCard';
import WeatherCard from './components/WeatherCard';
import TabBar from './components/TabBar';
import MemberCard from './components/MemberCard';
import BookingCard from './components/BookingCard';
import { TripEvent, DayOption } from './types/index';

// 🎯 請確保你有這張大張封面圖在 src/assets/hero.png
import heroImage from './assets/hero.png'; 

function App() {
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [activeDay, setActiveDay] = useState("2026-04-23");
  const [activeTab, setActiveTab] = useState("行程");
  const [loading, setLoading] = useState(true);
  
  // 🎯 使用你確認大小寫正確的純淨 ID
  const tripId = "74pfE7RXyEIusEdRV0rZ"; 

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // 1. 匿名登入取得讀取權限
        await signInAnonymously(auth);
        
        const tripDocRef = doc(db, 'trips', tripId);

        // 2. 平行抓取所有資料，提升手機端載入速度
        const [eventSnap, memberSnap, bookingSnap] = await Promise.all([
          getDocs(collection(tripDocRef, 'events')),
          getDocs(collection(tripDocRef, 'members')),
          getDocs(collection(tripDocRef, 'bookings'))
        ]);

        // 3. 處理行程資料並依照時間排序
        const eventList = eventSnap.docs.map(d => ({ 
          id: d.id, 
          ...d.data() 
        } as TripEvent));
        
        eventList.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
        setEvents(eventList);

        // 4. 處理成員與預訂
        setMembers(memberSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setBookings(bookingSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      } catch (error) {
        console.error("Firebase Data Fetch Error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 🎯 日期過濾器：支援斜線與橫線格式相容，確保 PWA 的日期按鈕一定準確
  const currentDayEvents = events.filter(e => {
    if (!e.date) return false;
    const fmtEventDate = e.date.replace(/\//g, '-').trim();
    const fmtActiveDay = activeDay.replace(/\//g, '-').trim();
    return fmtEventDate === fmtActiveDay;
  });

  const dayOptions: DayOption[] = [
    { date: "2026-04-23", label: "4/23", week: "四" },
    { date: "2026-04-24", label: "4/24", week: "五" },
    { date: "2026-04-25", label: "4/25", week: "六" },
    { date: "2026-04-26", label: "4/26", week: "日" },
  ];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDFCF8] text-[#769370] font-black animate-pulse">
      正在翻開沖繩手帳...
    </div>
  );

  return (
    // 🎯 最外層背景補回 [#F1F1E6]
    <div className="min-h-screen bg-[#F1F1E6] flex justify-center items-start">
      {/* 🎯 PWA 容器背景 [#FDFCF8] 並補回 [radial-gradient] 方格紙質感 */}
      <div 
        className="w-full max-w-md bg-[#FDFCF8] min-h-screen relative shadow-2xl pb-32 overflow-y-auto no-scrollbar"
        style={{ 
          backgroundImage: 'radial-gradient(#e5e7eb 1.5px, transparent 1.5px)', 
          backgroundSize: '30px 30px',
          backgroundAttachment: 'local' // 強制背景隨內容捲動，手機端顯示關鍵
        }}
      >
        
        {/* 🎯 Polaroid 大張封面圖補回 */}
        <div className="aspect-[1.1] w-full p-4">
          <img 
            src={heroImage} 
            alt="Okinawa View" 
            className="w-full h-full object-cover rounded-sm shadow-xl border-4 border-white"
          />
        </div>

        <header className="pt-10 pb-4 px-6 text-center animate-in fade-in duration-1000">
          <span className="text-[10px] font-black tracking-[0.2em] text-[#769370]/50 uppercase">Okinawa Journal</span>
          <h1 className="text-3xl font-black text-slate-950 mt-1">日本沖繩之旅 🗾</h1>
        </header>

        {activeTab === "行程" && (
          <div className="animate-in fade-in duration-500">
            <DaySelector days={dayOptions} activeDay={activeDay} onDayChange={setActiveDay} />
            <WeatherCard />
            <main className="px-6 mt-10 relative">
              {/* 🎯 行程時間線補回 */}
              <div className="absolute left-[1.9rem] top-2 bottom-0 w-[2px] bg-slate-100"></div>
              <div className="space-y-10">
                {currentDayEvents.length > 0 ? (
                  currentDayEvents.map((event) => (
                    <div key={event.id} className="relative flex gap-6 z-10 animate-in slide-in-from-bottom-2">
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
                  <div className="text-center py-20 opacity-30 font-bold italic text-sm text-slate-400 uppercase tracking-widest">
                    今天暫時沒排行程 🌱
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
            {bookings.length > 0 ? (
              bookings.map(b => <BookingCard key={b.id} data={b} />)
            ) : (
              <p className="text-center py-20 opacity-30">無預訂資訊</p>
            )}
          </main>
        )}

        {activeTab === "成員" && (
          <main className="px-6 mt-6 grid grid-cols-2 gap-4 pb-20 animate-in zoom-in duration-300">
            {members.map(m => <MemberCard key={m.id} member={m} />)}
          </main>
        )}

        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}

export default App;