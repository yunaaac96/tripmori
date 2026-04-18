/**
 * scripts/cleanTestData.mjs
 *
 * 掃描 Firestore，刪除所有 title 帶有 [TEST] 前綴的行程及其子集合。
 * 使用 Firebase CLI 的 OAuth token（firebase login 後自動可用）。
 *
 * 用法：
 *   node scripts/cleanTestData.mjs          ← dry-run（只列出，不刪除）
 *   node scripts/cleanTestData.mjs --delete ← 真正刪除
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PROJECT_ID = 'tripmori-74a18';
const FS_BASE    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const DRY_RUN    = !process.argv.includes('--delete');

// ── 1. 取得 OAuth access token（從 firebase CLI 快取）───────────────────────
function getToken() {
  try {
    const cfg  = JSON.parse(readFileSync(join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const tok  = cfg?.tokens?.access_token;
    if (!tok) throw new Error('access_token not found');
    return tok;
  } catch (e) {
    console.error('❌ 無法讀取 Firebase CLI token，請先執行 firebase login');
    process.exit(1);
  }
}

// ── 2. Firestore REST helpers ───────────────────────────────────────────────
async function fsRequest(path, opts = {}) {
  const token = getToken();
  const res   = await fetch(`${FS_BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

// runQuery — structured query over a collection
async function queryCollection(collectionId, filter) {
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      ...(filter ? { where: filter } : {}),
      select: { fields: [{ fieldPath: 'title' }, { fieldPath: '__name__' }] },
      limit: 500,
    },
  };
  const data = await fsRequest('', { method: 'POST', body: JSON.stringify({ ...body, structuredQuery: body.structuredQuery }) });
  // runQuery is at the database level
  const res  = await fetch(`${FS_BASE.replace('/documents', '')}:runQuery`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ structuredQuery: body.structuredQuery }),
  });
  if (!res.ok) throw new Error(`runQuery ${res.status}: ${await res.text()}`);
  return res.json(); // array of { document: {...} } | { skippedResults: n }
}

// list subcollections of a document
async function listSubcollections(docPath) {
  const path   = docPath.replace(`projects/${PROJECT_ID}/databases/(default)/documents`, '');
  const relUrl = `${path}:listCollectionIds`;
  const res    = await fetch(`${FS_BASE}${relUrl}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body:    '{}',
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.collectionIds || [];
}

// list docs in a subcollection
async function listDocuments(collectionPath) {
  const res  = await fetch(`${FS_BASE}/${collectionPath}?pageSize=200`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.documents || [];
}

// DELETE a document
async function deleteDoc(name) {
  const path = '/' + name.replace(`projects/${PROJECT_ID}/databases/(default)/documents`, '').replace(/^\//, '');
  await fetch(`${FS_BASE}${path}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
}

// ── 3. 遞迴刪除行程（doc + 所有子集合）─────────────────────────────────────
async function deleteTrip(tripDoc) {
  const tripId   = tripDoc.name.split('/').pop();
  const subCols  = await listSubcollections(tripDoc.name);
  let   subCount = 0;

  for (const col of subCols) {
    const docs = await listDocuments(`trips/${tripId}/${col}`);
    for (const d of docs) {
      if (!DRY_RUN) await deleteDoc(d.name);
      subCount++;
    }
    if (!DRY_RUN) {
      // subcollection itself doesn't need separate deletion (deleting all docs is sufficient)
    }
  }

  if (!DRY_RUN) await deleteDoc(tripDoc.name);
  return { tripId, subCount, subCols };
}

// ── 4. Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 掃描 Firestore 專案：${PROJECT_ID}`);
  console.log(DRY_RUN ? '📋 Dry-run 模式（加 --delete 才會真正刪除）\n' : '⚠️  DELETE 模式 — 真正刪除！\n');

  // List all trips
  const allTripsRes = await fetch(`${FS_BASE}/trips?pageSize=200`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!allTripsRes.ok) {
    console.error('❌ 無法讀取 trips 集合（token 可能過期，請重新 firebase login）');
    process.exit(1);
  }
  const allTrips = await allTripsRes.json();
  const docs     = allTrips.documents || [];

  console.log(`📂 trips 集合共 ${docs.length} 筆文件`);

  // Filter [TEST] prefix
  const testDocs = docs.filter(d => {
    const title = d.fields?.title?.stringValue || '';
    return title.startsWith('[TEST]');
  });

  if (testDocs.length === 0) {
    console.log('✅ 沒有找到帶有 [TEST] 前綴的行程，資料庫已乾淨！');
    return;
  }

  console.log(`\n🧪 找到 ${testDocs.length} 個測試行程：`);
  for (const d of testDocs) {
    const title  = d.fields?.title?.stringValue || '（無標題）';
    const tripId = d.name.split('/').pop();
    console.log(`  • [${tripId}] ${title}`);
  }

  if (DRY_RUN) {
    console.log('\n💡 執行 node scripts/cleanTestData.mjs --delete 以刪除上述行程');
    return;
  }

  console.log('\n🗑️  開始刪除...');
  for (const d of testDocs) {
    const title  = d.fields?.title?.stringValue || '（無標題）';
    const tripId = d.name.split('/').pop();
    process.stdout.write(`  刪除 [${tripId}] ${title}...`);
    try {
      const { subCount, subCols } = await deleteTrip(d);
      console.log(` ✓（子集合：${subCols.join(', ')} | ${subCount} 筆子文件）`);
    } catch (e) {
      console.log(` ❌ 失敗：${e.message}`);
    }
  }

  console.log('\n✅ 清理完成！');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
