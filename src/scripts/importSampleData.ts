// ═══════════════════════════════════════════════════════
//  TripMori — 記帳 & 日誌 範例資料匯入
//  使用方式：在 App.tsx 的 useEffect 裡呼叫一次 importSampleData()
//  確認 Firestore 有資料後刪除呼叫即可
// ═══════════════════════════════════════════════════════

import { collection, doc, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

const tripId = "74pfE7RXyEIusEdRV0rZ";
const tripRef = () => doc(db, 'trips', tripId);

// ── 範例記帳資料 ──────────────────────────────────────
const sampleExpenses = [
  {
    item: "OTS 租車費用",
    amountJPY: 26290,
    amountTWD: Math.round(26290 * 0.22),
    payer: "uu",
    category: "transport",
    date: "2026-04-23",
    createdAt: Timestamp.now(),
  },
  {
    item: "波上宮附近午餐",
    amountJPY: 1800,
    amountTWD: Math.round(1800 * 0.22),
    payer: "brian",
    category: "food",
    date: "2026-04-23",
    createdAt: Timestamp.now(),
  },
  {
    item: "琉球の牛 晚餐",
    amountJPY: 12000,
    amountTWD: Math.round(12000 * 0.22),
    payer: "uu",
    category: "food",
    date: "2026-04-23",
    createdAt: Timestamp.now(),
  },
  {
    item: "美麗海水族館門票",
    amountJPY: 4200,
    amountTWD: Math.round(4200 * 0.22),
    payer: "brian",
    category: "attraction",
    date: "2026-04-24",
    createdAt: Timestamp.now(),
  },
  {
    item: "古宇利島蝦蝦飯",
    amountJPY: 2400,
    amountTWD: Math.round(2400 * 0.22),
    payer: "uu",
    category: "food",
    date: "2026-04-24",
    createdAt: Timestamp.now(),
  },
  {
    item: "串燒 can 晚餐",
    amountJPY: 8000,
    amountTWD: Math.round(8000 * 0.22),
    payer: "brian",
    category: "food",
    date: "2026-04-24",
    createdAt: Timestamp.now(),
  },
  {
    item: "Blue Seal 冰淇淋",
    amountJPY: 800,
    amountTWD: Math.round(800 * 0.22),
    payer: "uu",
    category: "food",
    date: "2026-04-25",
    createdAt: Timestamp.now(),
  },
  {
    item: "國際通 伴手禮",
    amountJPY: 5600,
    amountTWD: Math.round(5600 * 0.22),
    payer: "uu",
    category: "shopping",
    date: "2026-04-25",
    createdAt: Timestamp.now(),
  },
  {
    item: "hoppepan 麵包",
    amountJPY: 1200,
    amountTWD: Math.round(1200 * 0.22),
    payer: "brian",
    category: "food",
    date: "2026-04-26",
    createdAt: Timestamp.now(),
  },
];

// ── 範例日誌資料 ──────────────────────────────────────
const sampleJournals = [
  {
    author: "uu",
    content: "第一天抵達沖繩！天氣超好，從飛機上就能看到清澈的藍海。波上宮的紅色鳥居配上藍天真的好美，拍了好多照片 📸 晚上琉球的牛超好吃，肉質軟嫩，配上泡盛剛剛好！",
    date: "2026-04-23",
    time: "4/23 晚上",
    photoUrl: "",
    createdAt: Timestamp.now(),
  },
  {
    author: "brian",
    content: "古宇利大橋真的太震撼了，開車過橋兩側都是碧藍的海，感覺整個人都被洗滌了。蝦蝦飯也超新鮮，現點現做，湯汁鮮甜。美麗海水族館的鯨鯊好巨大！",
    date: "2026-04-24",
    time: "4/24 下午",
    photoUrl: "",
    createdAt: Timestamp.now(),
  },
];

// ── 匯入執行函式 ──────────────────────────────────────
export async function importSampleData() {
  try {
    console.log("開始匯入記帳與日誌範例資料...");

    for (const expense of sampleExpenses) {
      await addDoc(collection(tripRef(), 'expenses'), expense);
    }
    console.log(`✅ 記帳匯入完成，共 ${sampleExpenses.length} 筆`);

    for (const journal of sampleJournals) {
      await addDoc(collection(tripRef(), 'journals'), journal);
    }
    console.log(`✅ 日誌匯入完成，共 ${sampleJournals.length} 筆`);

    console.log("🎉 範例資料匯入完成！");
  } catch (error) {
    console.error("❌ 匯入失敗：", error);
  }
}
