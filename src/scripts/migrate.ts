import { db } from "../config/firebase";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";

export const migrateData = async () => {
  const oldId = "74pfE7RXyEIusdRV0rZ";
  const newId = "okinawa2026";
  const subCollections = ["events", "members", "bookings"];

  console.log("🚀 開始搬移資料...");

  for (const colName of subCollections) {
    // 1. 抓取舊資料
    const oldColRef = collection(db, "trips", oldId, colName);
    const snap = await getDocs(oldColRef);
    
    console.log(`📦 正在處理 ${colName}，共 ${snap.size} 筆...`);

    // 2. 寫入新位置
    for (const d of snap.docs) {
      const newDocRef = doc(db, "trips", newId, colName, d.id);
      await setDoc(newDocRef, d.data());
    }
  }

  console.log("✅ 資料搬移完成！現在可以重新整理網頁看成果了。");
};