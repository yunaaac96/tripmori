import { collection, doc, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "../config/firebase";

const TRIP_ID = "74pfE7RXyEIusEdRV0rZ";

export async function deduplicateData() {
  const tripRef = doc(db, "trips", TRIP_ID);
  const cols = ["events", "members", "bookings", "lists"];

  for (const col of cols) {
    const snap = await getDocs(collection(tripRef, col));
    const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const seen = new Map<string, string>();
    const toDelete: string[] = [];

    for (const d of docs) {
      const key = d.title || d.name || d.text || d.flightNo || d.confirmCode || d.id;
      if (seen.has(key)) { toDelete.push(d.id); }
      else { seen.set(key, d.id); }
    }

    for (const id of toDelete) {
      await deleteDoc(doc(db, "trips", TRIP_ID, col, id));
    }
    console.log(`✅ ${col}: 刪除 ${toDelete.length} 筆重複，保留 ${docs.length - toDelete.length} 筆`);
  }
  localStorage.removeItem('tripmori_imported');
  console.log("🎉 去重完成！");
}
