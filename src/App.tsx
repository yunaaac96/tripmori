import { useEffect, useState } from 'react';
import { db, auth } from './config/firebase';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
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
  
  // 🎯 這是經測試成功的新 ID
  const tripId = "okinawa2026"; 

  // --- 🚛 自動搬移腳本 (執行完一次後可刪除此函數) ---
  const migrateOnce = async () => {
    const oldId = "74pfE7RXyEIusdRV0rZ"; // 壞掉的舊 ID
    const subCols = ["events", "members", "bookings"];
    console.log("🚛 啟動搬移腳本...");
    
    for (const col of subCols) {
      const oldSnap = await getDocs(collection(db, "trips", oldId, col));
      console.log(`📦 正在從舊路徑複製 ${col}: ${oldSnap.size} 筆`);
      for (const d of oldSnap.docs) {
        await setDoc(doc(db, "trips", tripId, col, d.id), d.data());
      }
    }
    console.log("✅ 資料全數搬移至 okinawa2026！");
  };
  // ----------------------------------------------

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        await signInAnonymously(auth);

        // 🎯 如果是第一次執行，請取消下面這行的註解來搬移資料
        // await migrateOnce(); 

        const tripDocRef = doc(db, 'trips', tripId);
        
        // 抓取行程 (events)
        const eventSnap = await getDocs(collection(tripDocRef, 'events'));
        const eventList = eventSnap.docs.map(d => ({ id: d.id, ...d.data() } as TripEvent));
        eventList.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
        setEvents(eventList);

        // 抓取成員 (members)
        const memberSnap = await getDocs(collection(tripDocRef, 'members'));
        setMembers(memberSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // 抓取預訂 (bookings)
        const bookingSnap = await getDocs(collection(tripDocRef, 'bookings'));
        setBookings(bookingSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      } catch (error) {
        console.error("🔥 Firestore 讀取失敗:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const dayOptions: DayOption[] = [
    { date: "2026-04-23", label: "4/23", week: "四