import { useEffect, useState } from 'react';
import { db, auth } from './config/firebase'; // 確保 firebase.ts 有 export auth
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
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
  
  // 🎯 確保 ID 純淨無空格
  const tripId = "74pfE7RXyEIusdRV0rZ".trim(); 

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // 1. 確保匿名登入 (解決權限問題)
        await signInAnonymously(auth);
        console.log("🔐 匿名登入成功");

        console.log("📍 正在嘗試讀取路徑:", `trips/${tripId}`);

        // 2. 抓取行程 (events)
        const eventRef = collection(db, 'trips', tripId, 'events');
        const eventSnap = await getDocs(query(eventRef, orderBy("startTime")));
        const eventList = eventSnap.docs.map(d => ({ id: d.id, ...d.data() } as TripEvent));
        console.log("📊 找到行程文件數:", eventSnap.size);
        setEvents(eventList);
        
        // 3. 抓取成員 (members)
        const memberRef = collection(db, 'trips', tripId, 'members');
        const memberSnap = await getDocs(memberRef);
        const memberList = memberSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log("👥 找到成員文件數:", memberSnap.size);
        setMembers(memberList);

        // 4. 抓取預訂 (bookings)
        const bookingRef = collection(db, 'trips', tripId, 'bookings');
        const bookingSnap = await getDocs(bookingRef);
        console.log("✈️ 找到預訂文件數:", bookingSnap.size);
        setBookings(bookingSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      } catch (error) { 
        console.error("🔥 Firebase 讀取重大錯誤:", error); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchData();
  }, []);

  const dayOptions: DayOption[] =