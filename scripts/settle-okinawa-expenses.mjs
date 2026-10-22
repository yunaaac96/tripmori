/**
 * 批次標記沖繩費用為已結清（settledAt / receivedAt）
 * 使用 Firestore REST API + Firebase CLI access token
 *
 * settledAt  → 代墊方（brian）付的費用，欠款方（uu）已還清
 * receivedAt → 欠款方（uu）付的費用，代墊方（brian）已收回其份額
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';

const PROJECT  = 'tripmori-74a18';
const TRIP     = '74pfE7RXyEIusEdRV0rZ';
const DEBTOR   = 'uu';
const CRED     = 'brian';
const today    = new Date().toISOString().slice(0, 10);
const BASE     = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// Read Firebase CLI token
const fbConfig = JSON.parse(readFileSync(`${homedir()}/.config/configstore/firebase-tools.json`, 'utf8'));
const TOKEN    = fbConfig.tokens.access_token;

async function firestoreGet(path) {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function firestorePatch(path, fields) {
  const mask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
  const body = {
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, { stringValue: v }])
    ),
  };
  const res = await fetch(`${BASE}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

function parseDoc(doc) {
  const f = doc.fields || {};
  const get = (key, type) => f[key]?.[type] ?? null;
  const sw = f.splitWith?.arrayValue?.values?.map(v => v.stringValue) ?? [];
  return {
    id: doc.name.split('/').pop(),
    description: get('description', 'stringValue') || '',
    date:        get('date', 'stringValue') || '',
    category:    get('category', 'stringValue') || '',
    payer:       get('payer', 'stringValue') || '',
    isPrivate:   f.isPrivate?.booleanValue ?? false,
    settledAt:   get('settledAt', 'stringValue'),
    receivedAt:  get('receivedAt', 'stringValue'),
    splitWith:   sw,
  };
}

async function listAllExpenses() {
  const docs = [];
  let pageToken = null;
  do {
    const url = `${BASE}/trips/${TRIP}/expenses${pageToken ? `?pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error(`List → ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.documents) docs.push(...data.documents.map(parseDoc));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return docs;
}

async function main() {
  console.log('讀取費用清單...');
  const all = await listAllExpenses();
  console.log(`共 ${all.length} 筆費用`);

  const isTest = e => e.description.includes('測試');

  // 方向一：brian 付款，uu 有份額 → settledAt
  const toSettle = all.filter(e => {
    if (e.category === 'settlement') return false;
    if (e.isPrivate)                 return false;
    if (e.settledAt)                 return false;
    if (e.payer !== CRED)            return false;
    const sw = e.splitWith.length > 0 ? e.splitWith : [DEBTOR, CRED];
    if (!sw.includes(DEBTOR))        return false;
    if (isTest(e))                   return false;
    return true;
  });

  // 方向二：uu 付款，brian 有份額 → receivedAt
  const toReceive = all.filter(e => {
    if (e.category === 'settlement') return false;
    if (e.isPrivate)                 return false;
    if (e.receivedAt)                return false;
    if (e.payer !== DEBTOR)          return false;
    const sw = e.splitWith.length > 0 ? e.splitWith : [DEBTOR, CRED];
    if (!sw.includes(CRED))          return false;
    if (isTest(e))                   return false;
    return true;
  });

  console.log(`\n【settledAt】找到 ${toSettle.length} 筆（brian 付、uu 有份額）：`);
  toSettle.forEach(e => console.log(`  - [${e.date}] ${e.description}`));

  console.log(`\n【receivedAt】找到 ${toReceive.length} 筆（uu 付、brian 有份額）：`);
  toReceive.forEach(e => console.log(`  - [${e.date}] ${e.description}`));

  if (!toSettle.length && !toReceive.length) {
    console.log('\n無需更新。');
    process.exit(0);
  }

  console.log('\n開始標記...');

  for (const e of toSettle) {
    await firestorePatch(`trips/${TRIP}/expenses/${e.id}`, {
      settledAt: today,
      settledByRef: 'manual-clear',
    });
    process.stdout.write('.');
  }

  for (const e of toReceive) {
    await firestorePatch(`trips/${TRIP}/expenses/${e.id}`, {
      receivedAt: today,
      settledByRef: 'manual-clear',
    });
    process.stdout.write('.');
  }

  const total = toSettle.length + toReceive.length;
  console.log(`\n\n✅ 完成！共 ${total} 筆已標記（settledAt: ${toSettle.length}，receivedAt: ${toReceive.length}）（${today}）`);
  process.exit(0);
}

main().catch(err => { console.error('\nError:', err.message); process.exit(1); });
