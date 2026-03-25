import { useEffect, useState } from 'react';
import { db, auth } from './config/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
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
  
  const tripId = "74pfE7RXyEIusdRV0rZ".trim(); 

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        await signInAnonymously(auth);
        console.log("🔐 Firebase 匿名登入成功");

        const cleanId = tripId;

        // 🎯 1. 掃描行程資料 (嘗試所有可能的單複數組合)
        const eventPaths = [
          `trips/${cleanId}/events`,
          `trips/${cleanId}/event`,
          `trip/${cleanId}/events`
        ];

        for (const path of eventPaths) {
          const snap = await getDocs(collection(db, path));
          if (!snap.empty) {
            console.log(`✅ 在路徑 [${path}] 找到 ${snap.size} 筆行程資料`);
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as TripEvent));
            // 按照時間排序
            data.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
            setEvents(data);
            break; 
          }
        }

        // 🎯 2. 掃描成員資料
        const memberPaths = [`trips/${cleanId}/members`, `trips/${cleanId}/member` Noah];
        for (const path of memberPaths) {
          const snap = await getDocs(collection(db, path));
          if (!snap.empty) {
            console.log(`✅ 在路