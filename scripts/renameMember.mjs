/**
 * scripts/renameMember.mjs
 *
 * 把指定行程裡所有對「舊名字」的引用改成「新名字」。用在成員改名後遺留的
 * 孤兒紀錄上 — 例如成員「熊」改名「熊熊」、舊帳號移除，導致歷史結算紀錄
 * 的 payer 仍寫「熊」、UI 找不到對應成員、無法在前台編輯。
 *
 * 會更新的位置（trips/{tripId}/expenses 內每一筆）：
 *   - payer 欄位等於舊名字者
 *   - splitWith 陣列含舊名字者
 *   - customAmounts 物件的 key 是舊名字者
 *   - percentages 物件的 key 是舊名字者
 *   - loggedByName 欄位等於舊名字者
 *   - privateOwnerUid / loggedByUid 不會動（那是 Google UID，跟名字無關）
 *
 * 用法（在 repo root 跑）：
 *   firebase login                              ← 第一次先登入
 *   node scripts/renameMember.mjs \              ← dry-run（只列改動，不寫入）
 *     --trip <tripId> --from 熊 --to 熊熊
 *
 *   node scripts/renameMember.mjs \              ← 真正寫入
 *     --trip <tripId> --from 熊 --to 熊熊 --apply
 *
 * 怎麼拿 tripId：
 *   1. 打開 PWA → 你的某個行程 → 開瀏覽器 DevTools → Application → Local Storage
 *   2. 找 key = tripmori_active_project，value 就是 tripId
 *   3. 或者直接登入 Firebase Console → Firestore → trips/ 找到峇里島那筆
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PROJECT_ID = 'tripmori-74a18';
const FS_BASE    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ── 1. CLI argument parsing ─────────────────────────────────────────────────
function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : null;
}
const TRIP_ID  = arg('trip');
const FROM     = arg('from');
const TO       = arg('to');
const APPLY    = process.argv.includes('--apply');

if (!TRIP_ID || !FROM || !TO) {
  console.error('用法：node scripts/renameMember.mjs --trip <tripId> --from <oldName> --to <newName> [--apply]');
  process.exit(1);
}

// ── 2. Firebase CLI token ───────────────────────────────────────────────────
function getToken() {
  try {
    const cfg  = JSON.parse(readFileSync(join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const tok  = cfg?.tokens?.access_token;
    if (!tok) throw new Error('access_token not found');
    return tok;
  } catch {
    console.error('❌ 無法讀取 Firebase CLI token，請先執行 `firebase login`');
    process.exit(1);
  }
}
const TOKEN = getToken();

// ── 3. Helpers ─────────────────────────────────────────────────────────────
async function fetchAllExpenses() {
  // REST listDocuments doesn't support compound filters cleanly, so we list
  // every expense and filter client-side. There are at most a few hundred
  // per trip, this is fine for a one-off rename.
  const url = `${FS_BASE}/trips/${TRIP_ID}/expenses?pageSize=300`;
  const out = [];
  let nextPageToken = '';
  while (true) {
    const r = await fetch(url + (nextPageToken ? `&pageToken=${nextPageToken}` : ''), {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!r.ok) {
      console.error(`❌ 讀 expenses 失敗 ${r.status}: ${await r.text()}`);
      process.exit(1);
    }
    const j = await r.json();
    if (j.documents) out.push(...j.documents);
    nextPageToken = j.nextPageToken || '';
    if (!nextPageToken) break;
  }
  return out;
}

// Convert a Firestore REST doc value into a plain JS value (only the field
// types we actually use in expenses — string, array, map, number, boolean).
function fromValue(v) {
  if (v === undefined || v === null) return undefined;
  if ('stringValue'  in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue'  in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue'   in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue'     in v) {
    const o = {};
    for (const [k, vv] of Object.entries(v.mapValue.fields || {})) o[k] = fromValue(vv);
    return o;
  }
  if ('nullValue'    in v) return null;
  return undefined;
}
function toValue(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'string')  return { stringValue: x };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number')  return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (Array.isArray(x))       return { arrayValue: { values: x.map(toValue) } };
  if (typeof x === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(x)) fields[k] = toValue(v);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

// ── 4. Scan + plan changes ─────────────────────────────────────────────────
const docs = await fetchAllExpenses();
console.log(`📦 行程 ${TRIP_ID} 內共 ${docs.length} 筆 expenses`);

const plans = []; // { docName, fields, before, after }
for (const doc of docs) {
  const data = {};
  for (const [k, v] of Object.entries(doc.fields || {})) data[k] = fromValue(v);

  const changes = {};

  if (data.payer === FROM) changes.payer = TO;
  if (data.loggedByName === FROM) changes.loggedByName = TO;
  if (Array.isArray(data.splitWith) && data.splitWith.includes(FROM)) {
    changes.splitWith = data.splitWith.map(n => n === FROM ? TO : n);
  }
  if (data.customAmounts && typeof data.customAmounts === 'object' && FROM in data.customAmounts) {
    const next = { ...data.customAmounts };
    next[TO] = next[FROM];
    delete next[FROM];
    changes.customAmounts = next;
  }
  if (data.percentages && typeof data.percentages === 'object' && FROM in data.percentages) {
    const next = { ...data.percentages };
    next[TO] = next[FROM];
    delete next[FROM];
    changes.percentages = next;
  }

  if (Object.keys(changes).length > 0) {
    plans.push({
      docName:     doc.name,
      docId:       doc.name.split('/').pop(),
      description: data.description || '(無說明)',
      date:        data.date || '?',
      category:    data.category || 'other',
      changes,
    });
  }
}

if (plans.length === 0) {
  console.log(`✅ 沒有任何 expense 含「${FROM}」這個名字，無需更動。`);
  process.exit(0);
}

console.log(`\n🔍 找到 ${plans.length} 筆需要改名「${FROM}」→「${TO}」：\n`);
for (const p of plans) {
  console.log(`  [${p.date}] ${p.category}  ${p.description}  (${p.docId})`);
  for (const [field, val] of Object.entries(p.changes)) {
    console.log(`      ${field}: ${JSON.stringify(val)}`);
  }
}

if (!APPLY) {
  console.log(`\n💡 dry-run 模式 — 沒有寫入任何東西。`);
  console.log(`   確認上面變更無誤後，加 --apply 重跑就會真正寫入。`);
  process.exit(0);
}

// ── 5. Apply ────────────────────────────────────────────────────────────────
console.log(`\n🚀 開始寫入 ${plans.length} 筆...`);
let ok = 0, fail = 0;
for (const p of plans) {
  const fields = {};
  const updateMask = [];
  for (const [k, v] of Object.entries(p.changes)) {
    fields[k] = toValue(v);
    updateMask.push(k);
  }
  const url = `https://firestore.googleapis.com/v1/${p.docName}?` +
    updateMask.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const r = await fetch(url, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields }),
  });
  if (r.ok) {
    ok++;
    process.stdout.write('.');
  } else {
    fail++;
    console.error(`\n❌ ${p.docId} 失敗 ${r.status}: ${await r.text()}`);
  }
}
console.log(`\n✅ 完成：${ok} 成功 / ${fail} 失敗`);
