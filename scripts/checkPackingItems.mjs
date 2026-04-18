// Check and seed global packing preset items for both trips
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use application default credentials (gcloud / firebase login --reauth)
const app = getApps().length ? getApps()[0] : initializeApp({
  credential: (await import('firebase-admin/app')).applicationDefault(),
});
const db = getFirestore(app);

const OKINAWA_ID  = '74pfE7RXyEIusEdRV0rZ';
const BALI_ID     = 'HxVpVhBDAT1mhqMdJfZO'; // from project list

// Global preset packing items (assignedTo='all', no privateOwnerUid)
const GLOBAL_PRESETS = [
  '護照（有效期6個月以上）',
  '信用卡（Visa/Master）',
  '充電線',
  '行動電源',
  '洗漱用品',
  '換洗衣物',
  '藥品（腸胃藥/感冒藥/止痛藥）',
  '旅行萬用轉接頭',
];

async function checkAndSeedTrip(tripId, tripName) {
  console.log(`\n📦 檢查 ${tripName} (${tripId}) 行李預設項目...`);
  const listsRef = db.collection('trips').doc(tripId).collection('lists');
  const snap = await listsRef
    .where('listType', '==', 'packing')
    .where('assignedTo', '==', 'all')
    .get();

  // Filter out items that have privateOwnerUid (those are member-private)
  const existing = snap.docs.filter(d => !d.data().privateOwnerUid).map(d => d.data().text);
  console.log(`  現有全域預設行李 ${existing.length} 筆:`, existing);

  const missing = GLOBAL_PRESETS.filter(t => !existing.includes(t));
  if (missing.length === 0) {
    console.log('  ✅ 全域預設行李項目完整，無需補充');
    return;
  }

  console.log(`  ⚠️  缺少 ${missing.length} 筆，正在補充...`);
  for (const text of missing) {
    await listsRef.add({
      listType: 'packing',
      text,
      assignedTo: 'all',
      checked: false,
      createdAt: Timestamp.now(),
    });
    console.log(`    ＋ 已新增：${text}`);
  }
  console.log(`  ✅ ${tripName} 全域預設行李補充完成`);
}

try {
  await checkAndSeedTrip(OKINAWA_ID, '沖繩');
  // Try Bali too if ID is known
  const allTrips = await db.collection('trips').listDocuments();
  for (const ref of allTrips) {
    if (ref.id === OKINAWA_ID) continue;
    const snap = await ref.get();
    const data = snap.data();
    if (data?.title?.includes('峇里') || data?.title?.includes('巴厘') || data?.title?.includes('Bali')) {
      await checkAndSeedTrip(ref.id, data.title || '峇里島');
    }
  }
  console.log('\n🎉 完成！');
  process.exit(0);
} catch (e) {
  console.error('失敗:', e.message || e);
  process.exit(1);
}
