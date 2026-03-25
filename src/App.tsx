import { useEffect, useState } from 'react';
import { db } from './config/firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
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
  
  // 🎯 統一使用連字號格式
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

  // 1. 統一日期格式為 YYYY-MM-DD
  const dayOptions: DayOption[] = [
    { date: "2026-04-23", label: "4/23", week: "四" },
    { date: "2026-04-24", label: "4/24", week: "五" },
    { date: "2026-04-25", label: "4/25", week: "六" },
    { date: "2026-04-26", label: "4/26", week: "日" },
  ];

  // 🎯 強大過濾邏輯：自動將資料庫中的斜線 / 轉為連字號 - 進行比對
  const currentDayEvents = events.filter(e => {
    const formattedEventDate = e.date.replace(/\//g, '-').trim();
    const formattedActiveDay = activeDay.replace(/\//g, '-').trim();
    return formattedEventDate === formattedActiveDay;
  });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDFCF8] text-[#769370] font-black">
      正在翻開沖繩手帳...