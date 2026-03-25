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

function App() {
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [activeDay, setActiveDay] = useState("2026-04-23");
  const [activeTab, setActiveTab] = useState("行程");
  const [loading, setLoading] = useState(true);
  
  // 修正後的正確 ID
  const tripId = "74pfE7RXyEIusEdRV0rZ"; 

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // 1. 匿名登入以取得讀取權限
        await signInAnonymously(auth);
        
        const tripDocRef = doc(db, 'trips', tripId);

        // 2. 平行抓取所有資料以提升載入速度
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

  // 🎯 日期過濾器：支援斜線與橫線格式相容
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
    <div className="min-h-screen flex items-center justify-center bg-[#FDFCF8] text-[#769370] font-black">
      正在翻開沖繩手帳...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F1F1E6] flex justify-center items-start">
      <div className="w-full max-w-md bg-[#FDFCF8] min-h-screen relative shadow-2xl pb-32 overflow-y-auto">
        
        <header className="pt-14 pb-4 px-6 text-center">
          <span className="text-[10px] font-black tracking-[0.2em] text-[#769370]/50 uppercase">Okinawa Journal</span>
          <h1 className="text-3xl font-black text-slate-950 mt-1">日本沖繩之旅 🗾</h1>
        </header>

        {activeTab === "行程" && (
          <div className="animate-in fade-in duration-500">
            <DaySelector days={dayOptions} activeDay={activeDay} onDayChange={