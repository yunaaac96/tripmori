// ═══════════════════════════════════════════════════════════════
//  TripMori — 沖繩行程 Firestore 匯入資料
//  使用方式：貼入 src/scripts/importData.ts 後執行一次即可
// ═══════════════════════════════════════════════════════════════

import { collection, addDoc, setDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

// ── 旅程主文件 ────────────────────────────────────────────────
export const tripData = {
  name: "日本沖繩之旅",
  destination: "沖繩",
  startDate: Timestamp.fromDate(new Date("2026-04-23")),
  endDate:   Timestamp.fromDate(new Date("2026-04-26")),
  currency: "JPY",
  pin: "0423",
  coverEmoji: "🗾",
  createdAt: Timestamp.now(),
};

// ── 成員（trips/{tripId}/members）────────────────────────────
export const members = [
  { name: "uu",    color: "#ebcef5", role: "行程規劃", createdAt: Timestamp.now() },
  { name: "brian", color: "#aaa9ab", role: "交通達人",  createdAt: Timestamp.now() },
];

// ── 行程事件（trips/{tripId}/events）─────────────────────────
export const events = [

  // ── 第 1 天 2026-04-23 ──
  {
    date: "2026-04-23",
    startTime: "06:50", endTime: "09:20",
    title: "TPE → OKA 台灣虎航 IT 230",
    location: "桃園國際機場 第一航廈 T1",
    category: "transport",
    notes: "有免費貴賓室，建議提早抵達機場",
    mapUrl: "",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-23",
    startTime: "11:30",
    title: "波上宮",
    location: "沖縄県那覇市若狭1-25-11",
    category: "attraction",
    notes: "",
    mapUrl: "https://share.google/sL13rD0NG53bLmpji",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-23",
    startTime: "13:30",
    title: "港川外國人住宅區",
    location: "沖繩縣浦添市港川2丁目33−1",
    category: "attraction",
    notes: "可麗露、咖啡豆必買",
    mapUrl: "https://share.google/xwJMjHumEyrYHCyyl",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-23",
    startTime: "16:30",
    title: "Check-in 雷克沖繩北谷溫泉度假村",
    location: "沖繩縣中頭郡北谷町字美濱34番地2",
    category: "hotel",
    notes: "14:00 可開始 Check-in，緊鄰美國村，設有天然溫泉及高空無邊際泳池",
    mapUrl: "https://share.google/c6eO7mgX4n2TkEvg9",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-23",
    startTime: "17:00",
    title: "美國村",
    location: "沖繩縣中頭郡北谷町字美浜9-1",
    category: "attraction",
    notes: "營業時間 10:00–22:00",
    mapUrl: "https://share.google/9smPWoGjXLrAut791",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-23",
    startTime: "18:30",
    title: "晚餐 琉球的牛（北谷店）",
    location: "沖繩縣中頭郡北谷町美浜51-1 3F",
    category: "food",
    notes: "已提前訂位 uu 的名字，A5 石垣牛，推薦招牌和牛三種拼盤",
    mapUrl: "https://share.google/sqCkSnoROvMjsuXL1",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },

  // ── 第 2 天 2026-04-24 ──
  {
    date: "2026-04-24",
    startTime: "10:00",
    title: "古宇利島大橋",
    location: "沖縄県国頭郡今帰仁村古宇利",
    category: "attraction",
    notes: "",
    mapUrl: "https://share.google/xwcSzxPtnNfeCh466",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-24",
    startTime: "11:00",
    title: "古宇利島蝦蝦飯",
    location: "沖縄県国頭郡今帰仁村古宇利314",
    category: "food",
    notes: "",
    mapUrl: "https://share.google/Z06Og33qX1e0mQNkU",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-24",
    startTime: "12:00",
    title: "Shinmei Coffee",
    location: "沖縄県国頭郡今帰仁村玉城292-2",
    category: "food",
    notes: "現刨生黑糖拿鐵必點",
    mapUrl: "https://share.google/lqDsn8Wmu93BNwsXv",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-24",
    startTime: "12:30",
    title: "沖繩美麗海水族館",
    location: "沖繩縣國頭郡本部町字石川424番地",
    category: "attraction",
    notes: "營業時間 08:30–18:30",
    mapUrl: "https://share.google/GV2tUlnNeHf7Ld67n",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-24",
    startTime: "13:00",
    title: "海豚劇場 海豚秀",
    location: "美麗海水族館內",
    category: "attraction",
    notes: "提早10分鐘占好位子",
    mapUrl: "",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-24",
    startTime: "15:00",
    title: "黑潮之海 鯨鯊餵食秀",
    location: "美麗海水族館內",
    category: "attraction",
    notes: "",
    mapUrl: "",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-24",
    startTime: "17:30",
    title: "Check-in 沖繩逸之彩飯店",
    location: "沖繩縣那霸市牧志3丁目18番33號",
    category: "hotel",
    notes: "15:00 可開始 Check-in，設有露天溫泉、游泳池，提供免費宵夜拉麵、飲料與啤酒暢飲",
    mapUrl: "https://share.google/uFxCdkeWJ0tBQoViF",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-24",
    startTime: "20:00",
    title: "國際通晚餐 串燒can",
    location: "沖縄県那覇市泉崎1丁目9−23 レジデンシア泉崎2階",
    category: "food",
    notes: "已提前訂位 brian 的名字",
    mapUrl: "https://share.google/h7ZC5IV826mO86idq",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },

  // ── 第 3 天 2026-04-25 ──
  {
    date: "2026-04-25",
    startTime: "10:00",
    title: "oHacorte Bakery",
    location: "沖繩縣那霸市泉崎1丁目4-10",
    category: "food",
    notes: "水果塔、法式吐司必吃",
    mapUrl: "https://share.google/WjaTmtzdzj9f1OFd3",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-25",
    startTime: "11:30",
    title: "PARCO CITY",
    location: "沖縄県浦添市西洲3丁目1-1",
    category: "attraction",
    notes: "",
    mapUrl: "https://share.google/YLclh5ZkjKJGunIMd",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-25",
    startTime: "16:00",
    title: "第一牧志公設市場",
    location: "沖縄県那覇市松尾2-10-1",
    category: "attraction",
    notes: "",
    mapUrl: "https://share.google/6GpdFYk9CKFPqBvit",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-25",
    startTime: "18:00",
    title: "國際通商店街漫遊＋必吃小吃",
    location: "沖縄県那覇市牧志3丁目2−10",
    category: "food",
    notes: "【必吃清單】🍦 Blue Seal 冰淇淋（海鹽牛奶/紅芋口味）｜🍙 豬肉蛋飯糰本店（松尾2-8-35）｜🧂 鹽屋雪鹽冰淇淋｜🍟 Calbee+ 現炸薯條（紫薯/沙拉口味）｜🥟 暖暮拉麵煎餃（牧志2丁目）｜🥐 御菓子御殿 紅芋塔｜🥞 FUKUGIYA 黑糖年輪蛋糕｜🌮 LUCKY TACOS 沖繩塔可餅｜🫘 花商花生豆腐（甜辣醬油）",
    mapUrl: "",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },

  // ── 第 4 天 2026-04-26 ──
  {
    date: "2026-04-26",
    startTime: "09:00",
    title: "出雲大社 沖繩分社",
    location: "沖繩縣那霸市古島1丁目16-13",
    category: "attraction",
    notes: "",
    mapUrl: "https://share.google/vGdKvkcaNUF0y4K07",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-26",
    startTime: "10:00",
    title: "hoppepan 排隊麵包名店",
    location: "沖繩縣浦添市內間2-10-10",
    category: "food",
    notes: "紅豆奶油麵包、明太子法棍必吃",
    mapUrl: "https://share.google/nQaI2kqaDWLt7EfQC",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-26",
    startTime: "10:30",
    title: "Ashibinaa Outlet",
    location: "沖繩縣豐見城市豐崎1-188",
    category: "attraction",
    notes: "",
    mapUrl: "https://share.google/bHtU4TpBp4IkUBw0i",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-26",
    startTime: "13:30",
    title: "OTS 還車",
    location: "OTS 臨空豐崎營業所",
    category: "transport",
    notes: "還車時間 13:30，需提前到達",
    mapUrl: "",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
  {
    date: "2026-04-26",
    startTime: "16:45", endTime: "17:20",
    title: "OKA → TPE 樂桃航空 MM 929",
    location: "沖繩那霸機場 第一航廈 T1",
    category: "transport",
    notes: "",
    mapUrl: "",
    cost: 0, currency: "JPY",
    createdAt: Timestamp.now(),
  },
];

// ── 機票（trips/{tripId}/bookings/flights）────────────────────
export const flights = [
  {
    type: "flight",
    direction: "outbound",
    airline: "台灣虎航",
    flightNo: "IT 230",
    departure: { airport: "TPE", airportName: "台北桃園", time: Timestamp.fromDate(new Date("2026-04-23T06:50:00")) },
    arrival:   { airport: "OKA", airportName: "沖繩那霸", time: Timestamp.fromDate(new Date("2026-04-23T09:20:00")) },
    passengers: ["uu", "brian"],
    notes: "有加購貴賓室，可提前到機場",
    costPerPerson: 0, currency: "TWD",
    createdAt: Timestamp.now(),
  },
  {
    type: "flight",
    direction: "inbound",
    airline: "樂桃航空",
    flightNo: "MM 929",
    departure: { airport: "OKA", airportName: "沖繩那霸", time: Timestamp.fromDate(new Date("2026-04-26T16:45:00")) },
    arrival:   { airport: "TPE", airportName: "台北桃園", time: Timestamp.fromDate(new Date("2026-04-26T17:20:00")) },
    passengers: ["uu", "brian"],
    notes: "",
    costPerPerson: 10017, currency: "TWD",
    createdAt: Timestamp.now(),
  },
];

// ── 住宿（trips/{tripId}/bookings/hotels）────────────────────
export const hotels = [
  {
    type: "hotel",
    name: "雷克沖繩北谷溫泉度假村",
    nameJa: "レクー沖縄北谷スパ&リゾート",
    address: "沖繩縣中頭郡北谷町字美濱34番地2",
    phone: "+81-98-9362288",
    checkIn:  Timestamp.fromDate(new Date("2026-04-23T14:00:00")),
    checkOut: Timestamp.fromDate(new Date("2026-04-24T11:00:00")),
    roomType: "海景雙人房",
    totalCost: 3943, currency: "TWD",
    costPerPerson: 1971.5,
    confirmCode: "1616327200916576",
    pin: "5983",
    mapUrl: "https://share.google/c6eO7mgX4n2TkEvg9",
    notes: "緊鄰美國村，距離沖繩海灘步行可達，設有天然溫泉及高空無邊際泳池",
    createdAt: Timestamp.now(),
  },
  {
    type: "hotel",
    name: "沖繩逸之彩飯店",
    nameJa: "沖縄逸の彩 温泉リゾートホテル",
    address: "沖繩縣那霸市牧志3丁目18番33號",
    phone: "+81-98-8638877",
    checkIn:  Timestamp.fromDate(new Date("2026-04-24T15:00:00")),
    checkOut: Timestamp.fromDate(new Date("2026-04-26T11:00:00")),
    roomType: "大床房",
    totalCost: 6929, currency: "TWD",
    costPerPerson: 3464.5,
    confirmCode: "1616327200935988",
    pin: "5762",
    mapUrl: "https://share.google/uFxCdkeWJ0tBQoViF",
    notes: "設有露天溫泉、游泳池，提供免費宵夜拉麵、飲料與啤酒暢飲",
    createdAt: Timestamp.now(),
  },
];

// ── 租車（trips/{tripId}/bookings/cars）──────────────────────
export const carRentals = [
  {
    type: "car",
    company: "OTS",
    pickupLocation: "OTS 臨空豐崎營業所（那霸機場）",
    pickupTime:  Timestamp.fromDate(new Date("2026-04-23T11:00:00")),
    returnLocation: "OTS 臨空豐崎營業所（那霸機場）",
    returnTime:  Timestamp.fromDate(new Date("2026-04-26T13:30:00")),
    carType: "S級別 1台",
    totalCost: 26290, currency: "JPY",
    confirmCode: "OTS1402455",
    notes: "需國際駕照＋日文譯本，機場報到需出示預約 QR Code",
    qrCodeUrl: "",  // 之後上傳 QR Code 圖片後填入 Storage URL
    createdAt: Timestamp.now(),
  },
];

// ── 行李清單（trips/{tripId}/lists）──────────────────────────
export const packingList = [
  { listType: "packing", text: "護照（有效期6個月以上）", checked: false, assignedTo: "all", createdAt: Timestamp.now() },
  { listType: "packing", text: "國際駕照＋日文譯本",       checked: false, assignedTo: "brian", createdAt: Timestamp.now() },
  { listType: "packing", text: "信用卡（Visa/Master）",    checked: false, assignedTo: "all", createdAt: Timestamp.now() },
  { listType: "packing", text: "日幣現金",                 checked: false, assignedTo: "uu", createdAt: Timestamp.now() },
  { listType: "packing", text: "旅行萬用轉接頭",           checked: false, assignedTo: "uu", createdAt: Timestamp.now() },
  { listType: "packing", text: "藥品（腸胃藥/感冒藥）",    checked: false, assignedTo: "uu", createdAt: Timestamp.now() },
  { listType: "packing", text: "充電線",                   checked: false, assignedTo: "all", createdAt: Timestamp.now() },
  { listType: "packing", text: "耳機、手提/平板電腦",       checked: false, assignedTo: "all", createdAt: Timestamp.now() },
  { listType: "packing", text: "相機",                     checked: false, assignedTo: "uu", createdAt: Timestamp.now() },
  { listType: "packing", text: "個人日用品、換洗衣物",       checked: false, assignedTo: "all", createdAt: Timestamp.now() },
];

// ── 出發前待辦（trips/{tripId}/lists）────────────────────────
export const todoList = [
  { listType: "todo", text: "訂所有飯店、機票",                           checked: true,  assignedTo: "uu",    dueDate: "2026-01-04", createdAt: Timestamp.now() },
  { listType: "todo", text: "購買美麗海水族館門票",                         checked: false, assignedTo: "uu",    dueDate: "2026-03-27", createdAt: Timestamp.now() },
  { listType: "todo", text: "購買 eSIM",                                  checked: false, assignedTo: "uu",    dueDate: "2026-03-27", createdAt: Timestamp.now() },
  { listType: "todo", text: "線上入關審查海關申報",                          checked: false, assignedTo: "uu",    dueDate: "2026-03-25", createdAt: Timestamp.now() },
  { listType: "todo", text: "購買旅遊平安險",                               checked: false, assignedTo: "all",   dueDate: "2026-04-20", createdAt: Timestamp.now() },
  { listType: "todo", text: "提領日幣",                                    checked: false, assignedTo: "uu",    dueDate: "2026-04-22", createdAt: Timestamp.now() },
  { listType: "todo", text: "預定 04/23 18:30 琉球的牛（北谷店）",          checked: true,  assignedTo: "uu",    dueDate: "2026-02-23", createdAt: Timestamp.now() },
  { listType: "todo", text: "預定 04/24 20:00 串燒can（クシヤキCan）",     checked: true,  assignedTo: "uu",    dueDate: "2026-03-24", createdAt: Timestamp.now() },
];

// ═══════════════════════════════════════════════════════════════
//  匯入執行函式（在 App 初始化時呼叫一次）
// ═══════════════════════════════════════════════════════════════

export async function importTripData() {
  try {
    // 1. 建立旅程
    const tripRef = await addDoc(collection(db, 'trips'), tripData);
    const tripId = tripRef.id;
    console.log('✅ 旅程建立成功，ID:', tripId);

    // 2. 匯入成員
    for (const member of members) {
      await addDoc(collection(db, `trips/${tripId}/members`), member);
    }
    console.log('✅ 成員匯入完成');

    // 3. 匯入行程事件
    for (const event of events) {
      await addDoc(collection(db, `trips/${tripId}/events`), event);
    }
    console.log('✅ 行程事件匯入完成，共', events.length, '筆');

    // 4. 匯入機票
    for (const flight of flights) {
      await addDoc(collection(db, `trips/${tripId}/bookings`), flight);
    }
    console.log('✅ 機票匯入完成');

    // 5. 匯入住宿
    for (const hotel of hotels) {
      await addDoc(collection(db, `trips/${tripId}/bookings`), hotel);
    }
    console.log('✅ 住宿匯入完成');

    // 6. 匯入租車
    for (const car of carRentals) {
      await addDoc(collection(db, `trips/${tripId}/bookings`), car);
    }
    console.log('✅ 租車匯入完成');

    // 7. 匯入清單
    for (const item of [...packingList, ...todoList]) {
      await addDoc(collection(db, `trips/${tripId}/lists`), item);
    }
    console.log('✅ 清單匯入完成');

    console.log('🎉 所有資料匯入完成！tripId =', tripId);
    return tripId;

  } catch (error) {
    console.error('❌ 匯入失敗：', error);
    throw error;
  }
}