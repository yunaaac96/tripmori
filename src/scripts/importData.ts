import { collection, doc, addDoc, Timestamp } from "firebase/firestore";
import { db } from "../config/firebase";

const TRIP_ID = "74pfE7RXyEIusEdRV0rZ";
const t = () => doc(db, "trips", TRIP_ID);

export async function runImport() {
  console.log("⏳ 開始自動匯入沖繩行程...");
  try {
    const events = [
      { title: "桃園機場 IT230 出發", date: "2026-04-23", startTime: "06:35", category: "transport", location: "T1" },
      { title: "抵達那霸機場", date: "2026-04-23", startTime: "08:55", category: "transport", location: "那霸機場" }
    ];
    for (const e of events) await addDoc(collection(t(), "events"), e);
    console.log("🎉 行程匯入完成！");
  } catch (e) {
    console.error("匯入失敗:", e);
  }
}