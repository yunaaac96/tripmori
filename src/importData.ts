import { collection, doc, addDoc, Timestamp, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "../config/firebase";

const TRIP_ID = "74pfE7RXyEIusEdRV0rZ";
const tripRef = () => doc(db, "trips", TRIP_ID);

export async function runImport() {
  console.log("⏳ 開始匯入沖繩行程資料...");

  try {
    // ── 先確認 members 是否已有資料 ──
    const memberSnap = await getDocs(collection(tripRef(), "members"));
    if (memberSnap.size > 0) {
      console.log(`ℹ️ 已有 ${memberSnap.size} 筆成員，略過匯入`);
      return;
    }

    // ── Members ──
    const members = [
      { name: "uu",    color: "#ebcef5", role: "行程規劃", createdAt: Timestamp.now() },
      { name: "brian", color: "#aaa9ab", role: "交通達人", createdAt: Timestamp.now() },
    ];
    for (const m of members) await addDoc(collection(tripRef(), "members"), m);
    console.log("✅ 成員匯入完成");

    // ── Events ──
    const events = [
      { date:"2026-04-23", startTime:"06:50", endTime:"09:20", title:"TPE → OKA 台灣虎航 IT230", location:"桃園國際機場 T1", category:"transport", notes:"有加購貴賓室，建議提早到", mapUrl:"", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-23", startTime:"11:30", title:"波上宮", location:"沖縄県那覇市若狭1-25-11", category:"attraction", notes:"", mapUrl:"https://share.google/sL13rD0NG53bLmpji", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-23", startTime:"13:30", title:"港川外國人住宅區", location:"沖繩縣浦添市港川2丁目33-1", category:"attraction", notes:"可麗露、咖啡豆必買", mapUrl:"https://share.google/xwJMjHumEyrYHCyyl", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-23", startTime:"16:00", title:"Check-in 雷克沖繩北谷溫泉度假村", location:"沖繩縣中頭郡北谷町字美濱34番地2", category:"hotel", notes:"14:00可Check-in，設有天然溫泉及高空無邊際泳池", mapUrl:"https://share.google/c6eO7mgX4n2TkEvg9", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-23", startTime:"17:00", title:"美國村", location:"沖繩縣中頭郡北谷町字美浜9-1", category:"attraction", notes:"營業時間 10:00-22:00", mapUrl:"https://share.google/9smPWoGjXLrAut791", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-23", startTime:"18:30", title:"晚餐 琉球的牛（北谷店）", location:"沖繩縣中頭郡北谷町美浜51-1 3F", category:"food", notes:"已訂位 uu 的名字，A5石垣牛", mapUrl:"https://share.google/sqCkSnoROvMjsuXL1", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-24", startTime:"10:00", title:"古宇利島大橋", location:"沖縄県国頭郡今帰仁村古宇利", category:"attraction", notes:"", mapUrl:"https://share.google/xwcSzxPtnNfeCh466", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-24", startTime:"11:00", title:"古宇利島蝦蝦飯", location:"沖縄県国頭郡今帰仁村古宇利314", category:"food", notes:"", mapUrl:"https://share.google/Z06Og33qX1e0mQNkU", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-24", startTime:"12:00", title:"Shinmei Coffee", location:"沖縄県国頭郡今帰仁村玉城292-2", category:"food", notes:"現刨生黑糖拿鐵", mapUrl:"https://share.google/lqDsn8Wmu93BNwsXv", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-24", startTime:"13:00", title:"沖繩美麗海水族館", location:"沖繩縣國頭郡本部町字石川424番地", category:"attraction", notes:"營業時間 08:30-18:30", mapUrl:"https://share.google/GV2tUlnNeHf7Ld67n", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-24", startTime:"13:30", title:"海豚劇場 海豚秀", location:"美麗海水族館內", category:"attraction", notes:"提早10分鐘占位子", mapUrl:"", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-24", startTime:"15:00", title:"黑潮之海 鯨鯊餵食秀", location:"美麗海水族館內", category:"attraction", notes:"", mapUrl:"", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-24", startTime:"17:00", title:"Check-in 沖繩逸之彩飯店", location:"沖繩縣那霸市牧志3丁目18番33號", category:"hotel", notes:"15:00可Check-in，設有露天溫泉、免費宵夜拉麵暢飲", mapUrl:"https://share.google/uFxCdkeWJ0tBQoViF", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-24", startTime:"20:00", title:"國際通晚餐 串燒can", location:"沖縄県那覇市泉崎1丁目9-23 2F", category:"food", notes:"已訂位 brian 的名字", mapUrl:"https://share.google/h7ZC5IV826mO86idq", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-25", startTime:"10:00", title:"oHacorte Bakery", location:"沖繩縣那霸市泉崎1丁目4-10", category:"food", notes:"水果塔、法式吐司必吃", mapUrl:"https://share.google/WjaTmtzdzj9f1OFd3", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-25", startTime:"11:30", title:"PARCO CITY", location:"沖縄県浦添市西洲3丁目1-1", category:"attraction", notes:"", mapUrl:"https://share.google/YLclh5ZkjKJGunIMd", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-25", startTime:"16:00", title:"第一牧志公設市場", location:"沖縄県那覇市松尾2-10-1", category:"attraction", notes:"", mapUrl:"https://share.google/6GpdFYk9CKFPqBvit", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-25", startTime:"18:00", title:"國際通商店街必吃", location:"沖縄県那覇市牧志3丁目2-10", category:"food", notes:"🍦Blue Seal冰淇淋｜🍙豬肉蛋飯糰｜🧂鹽屋雪鹽冰淇淋｜🍟Calbee+現炸薯條｜🥐御菓子御殿紅芋塔", mapUrl:"", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-26", startTime:"09:00", title:"出雲大社 沖繩分社", location:"沖繩縣那霸市古島1丁目16-13", category:"attraction", notes:"", mapUrl:"https://share.google/vGdKvkcaNUF0y4K07", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-26", startTime:"10:00", title:"hoppepan 排隊麵包名店", location:"沖繩縣浦添市內間2-10-10", category:"food", notes:"紅豆奶油麵包、明太子法棍必吃", mapUrl:"https://share.google/nQaI2kqaDWLt7EfQC", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-26", startTime:"10:30", title:"Ashibinaa Outlet", location:"沖繩縣豐見城市豐崎1-188", category:"attraction", notes:"", mapUrl:"https://share.google/bHtU4TpBp4IkUBw0i", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-26", startTime:"13:30", title:"OTS 還車", location:"OTS 臨空豐崎營業所", category:"transport", notes:"需提前抵達", mapUrl:"", cost:0, currency:"JPY", createdAt:Timestamp.now() },
      { date:"2026-04-26", startTime:"16:45", endTime:"17:20", title:"OKA → TPE 樂桃航空 MM929", location:"沖繩那霸機場 T1", category:"transport", notes:"", mapUrl:"", cost:0, currency:"JPY", createdAt:Timestamp.now() },
    ];
    for (const e of events) await addDoc(collection(tripRef(), "events"), e);
    console.log(`✅ 行程匯入完成，共 ${events.length} 筆`);

    // ── Lists ──
    const lists = [
      { listType:"packing", text:"護照（有效期6個月以上）", checked:false, assignedTo:"all", createdAt:Timestamp.now() },
      { listType:"packing", text:"國際駕照＋日文譯本", checked:false, assignedTo:"brian", createdAt:Timestamp.now() },
      { listType:"packing", text:"信用卡（Visa/Master）", checked:false, assignedTo:"all", createdAt:Timestamp.now() },
      { listType:"packing", text:"日幣現金", checked:false, assignedTo:"uu", createdAt:Timestamp.now() },
      { listType:"packing", text:"旅行萬用轉接頭", checked:false, assignedTo:"uu", createdAt:Timestamp.now() },
      { listType:"packing", text:"藥品（腸胃藥/感冒藥）", checked:false, assignedTo:"uu", createdAt:Timestamp.now() },
      { listType:"packing", text:"充電線", checked:false, assignedTo:"all", createdAt:Timestamp.now() },
      { listType:"packing", text:"相機", checked:false, assignedTo:"uu", createdAt:Timestamp.now() },
      { listType:"todo", text:"購買美麗海水族館門票", checked:false, assignedTo:"uu", dueDate:"2026-03-27", createdAt:Timestamp.now() },
      { listType:"todo", text:"購買 eSIM", checked:false, assignedTo:"uu", dueDate:"2026-03-27", createdAt:Timestamp.now() },
      { listType:"todo", text:"購買旅遊平安險", checked:false, assignedTo:"all", dueDate:"2026-04-20", createdAt:Timestamp.now() },
      { listType:"todo", text:"提領日幣", checked:false, assignedTo:"uu", dueDate:"2026-04-22", createdAt:Timestamp.now() },
      { listType:"todo", text:"線上入關審查海關申報", checked:false, assignedTo:"uu", dueDate:"2026-03-25", createdAt:Timestamp.now() },
      { listType:"todo", text:"訂所有飯店、機票", checked:true, assignedTo:"uu", dueDate:"2026-01-04", createdAt:Timestamp.now() },
      { listType:"todo", text:"預定 04/23 琉球的牛（北谷店）", checked:true, assignedTo:"uu", dueDate:"2026-02-23", createdAt:Timestamp.now() },
      { listType:"todo", text:"預定 04/24 串燒can", checked:true, assignedTo:"uu", dueDate:"2026-03-24", createdAt:Timestamp.now() },
    ];
    for (const l of lists) await addDoc(collection(tripRef(), "lists"), l);
    console.log("✅ 清單匯入完成");
    console.log("🎉 全部匯入完成！");
  } catch(err) {
    console.error("匯入失敗:", err);
  }
}
