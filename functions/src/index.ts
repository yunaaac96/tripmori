import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { Client as NotionClient } from '@notionhq/client';

// ── Notion backup config ───────────────────────────────────────────────────
const NOTION_API_KEY        = defineSecret('NOTION_API_KEY');
const NOTION_DATABASE_ID    = '7f17b1ac-1126-4d54-89ca-51cf6160152c'; // 行程備份紀錄（database）

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// ── Helper: send FCM to a member by name ─────────────────────────────────────
async function notifyMember(
  tripId: string,
  memberName: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
) {
  const membersSnap = await db
    .collection('trips').doc(tripId)
    .collection('members')
    .where('name', '==', memberName)
    .limit(1)
    .get();

  if (membersSnap.empty) return;
  const member = membersSnap.docs[0].data();
  const tokens: string[] = member.fcmTokens || [];
  if (!tokens.length) return;

  // Write to Firestore notifications collection so the badge dot appears
  await db
    .collection('trips').doc(tripId)
    .collection('notifications')
    .add({
      recipientName: memberName,
      title,
      body,
      tag: data.tag || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  const messages = tokens.map(token => ({
    token,
    notification: { title, body },
    webpush: {
      notification: {
        title,
        body,
        icon: 'https://tripmori.vercel.app/icons/icon-192-light.png',
        badge: 'https://tripmori.vercel.app/icons/icon-192-light.png',
        tag: data.tag || 'tripmori',
        requireInteraction: false,
      },
      fcmOptions: { link: data.url || '/' },
    },
    data,
  }));

  // Send all tokens; collect stale ones to clean up
  const results = await Promise.allSettled(messages.map(m => messaging.send(m)));
  const staleTokens: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const err = r.reason as { code?: string };
      if (
        err.code === 'messaging/registration-token-not-registered' ||
        err.code === 'messaging/invalid-registration-token'
      ) {
        staleTokens.push(tokens[i]);
      }
    }
  });

  if (staleTokens.length) {
    await membersSnap.docs[0].ref.update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...staleTokens),
    });
  }
}

// ── 1. Journal comment notifications ─────────────────────────────────────────
// Triggers when a new journalComment is created.
// • @mentioned members → 「X 在日誌提到了你」(highest priority, sent first)
// • Journal author (not mentioned, not self) → 「💬 你的日誌有新留言：...」
export const onJournalCommentCreated = onDocumentCreated(
  'trips/{tripId}/journalComments/{commentId}',
  async (event) => {
    const comment = event.data?.data();
    if (!comment) return;

    const { tripId } = event.params;
    const content: string = comment.content || '';
    const author: string = comment.authorName || comment.author || '';
    const journalId: string = comment.journalId || '';

    // Find all @mentions
    const mentions = content.match(/@([\u4e00-\u9fa5\w]+)/g) || [];
    const mentionedNames = [...new Set(mentions.map((m: string) => m.slice(1)))] as string[];

    // Get journal info (author)
    let journalAuthor = '';
    if (journalId) {
      const jSnap = await db
        .collection('trips').doc(tripId)
        .collection('journals').doc(journalId)
        .get();
      if (jSnap.exists) {
        journalAuthor = jSnap.data()?.authorName || '';
      }
    }

    const snippet = `「${content.slice(0, 60)}${content.length > 60 ? '…' : ''}」`;

    // 1a. Notify @mentioned members first (highest priority)
    for (const name of mentionedNames) {
      if (name === author) continue;
      await notifyMember(
        tripId, name,
        `${author} 在日誌提到了你`,
        snippet,
        { tag: `mention-${event.params.commentId}`, url: '/' }
      );
    }

    // 1b. Notify journal author about new comment (if not the commenter and not already mentioned)
    if (journalAuthor && journalAuthor !== author && !mentionedNames.includes(journalAuthor)) {
      await notifyMember(
        tripId, journalAuthor,
        `💬 你的日誌有新留言`,
        snippet,
        { tag: `journal-comment-${event.params.commentId}`, url: '/' }
      );
    }
  }
);

// ── 2. Journal reaction notifications ────────────────────────────────────────
// Triggers when a journal's reactions field is updated.
// Notifies the journal author when someone adds a reaction emoji.
export const onJournalReactionUpdated = onDocumentUpdated(
  'trips/{tripId}/journals/{journalId}',
  async (event) => {
    const before = event.data?.before.data();
    const after  = event.data?.after.data();
    if (!before || !after) return;

    const { tripId, journalId } = event.params;
    const journalAuthor: string = after.authorName || '';
    if (!journalAuthor) return;

    const beforeReactions: Record<string, string[]> = before.reactions || {};
    const afterReactions:  Record<string, string[]> = after.reactions  || {};

    // Find which emoji was newly added (someone who wasn't in before is now in after)
    for (const [emoji, reactors] of Object.entries(afterReactions)) {
      const prevReactors: string[] = beforeReactions[emoji] || [];
      const newReactors = (reactors as string[]).filter(u => !prevReactors.includes(u));

      for (const reactorName of newReactors) {
        if (reactorName === journalAuthor) continue; // don't notify yourself
        await notifyMember(
          tripId, journalAuthor,
          `✨ ${reactorName} 對你的日誌按了個 ${emoji}`,
          after.content ? `「${(after.content as string).slice(0, 40)}…」` : '點擊查看',
          { tag: `reaction-${journalId}-${emoji}-${reactorName}`, url: '/' }
        );
      }
    }
  }
);

// ── 3. Member note board notifications ───────────────────────────────────────
// Triggers when a new memberNote is created.
// Notifies the card owner (the member whose board was written on).
export const onMemberNoteCreated = onDocumentCreated(
  'trips/{tripId}/memberNotes/{noteId}',
  async (event) => {
    const note = event.data?.data();
    if (!note) return;

    const { tripId } = event.params;
    const authorName: string = note.authorName || '';
    const memberId: string   = note.memberId   || '';
    const content: string    = note.content    || '';
    if (!memberId || !authorName) return;

    // Resolve the member whose board this is
    const memberSnap = await db
      .collection('trips').doc(tripId)
      .collection('members').doc(memberId)
      .get();
    if (!memberSnap.exists) return;

    const memberName: string = memberSnap.data()?.name || '';
    if (!memberName || memberName === authorName) return; // don't notify yourself

    const snippet = content.length > 60 ? content.slice(0, 60) + '…' : content;

    await notifyMember(
      tripId, memberName,
      `📝 留言板新訊息`,
      `${authorName}：${snippet}`,
      { tag: `note-${event.params.noteId}`, url: '/' }
    );
  }
);

// ── 4. Pre-flight ~4-hour reminder (scheduled, runs every hour) ───────────────
// Checks all trips; if departure is in 3.5–4.5 hours, notify all members.
// Distinguishes outbound (去程) and return (回程) with different copy.
export const preFlightReminder = onSchedule(
  { schedule: 'every 60 minutes', timeZone: 'Asia/Taipei' },
  async () => {
    const now = Date.now();
    const windowStart = now + 3.5 * 60 * 60 * 1000;
    const windowEnd   = now + 4.5 * 60 * 60 * 1000;

    const tripsSnap = await db.collection('trips').get();

    for (const tripDoc of tripsSnap.docs) {
      const trip = tripDoc.data();
      if (!trip.startDate) continue;

      const bookingsSnap = await db
        .collection('trips').doc(tripDoc.id)
        .collection('bookings')
        .where('type', '==', 'flight')
        .get();

      for (const bDoc of bookingsSnap.docs) {
        const b = bDoc.data();
        const flights: any[] = b.flights || (b.departureTime ? [b] : []);

        for (const f of flights) {
          if (!f.departureDate || !f.departureTime) continue;
          const depMs = new Date(`${f.departureDate}T${f.departureTime}:00+08:00`).getTime();
          if (depMs < windowStart || depMs > windowEnd) continue;

          // Determine direction: 去程 (outbound) vs 回程 (return)
          // Use f.direction field; fall back to comparing date with trip.startDate
          let isReturn = false;
          if (f.direction) {
            isReturn = f.direction === '回程';
          } else if (trip.startDate && f.departureDate) {
            // If departure date is same as trip start date → outbound; otherwise → return
            isReturn = f.departureDate !== trip.startDate;
          }

          const membersSnap = await db
            .collection('trips').doc(tripDoc.id)
            .collection('members').get();

          const flightNo  = f.flightNumber || f.flightNo || '';
          const direction = isReturn ? '回程' : '去程';

          // Personalised copy per direction
          const buildNotification = (memberName: string) => {
            if (isReturn) {
              return {
                title: '✈️ 準備回家囉！',
                body: `${flightNo ? flightNo + ' ' : ''}航班 4 小時後起飛，該前往機場囉。確認行李已封箱、護照隨身帶。Tripmori 陪你平安回家 🏠`,
              };
            } else {
              return {
                title: '🛫 出發倒數 4 小時！',
                body: `嘿 ${memberName}，該前往機場囉！檢查好護照與行李，把工作放下，我們只負責享受旅行！祝一路順風 ✨`,
              };
            }
          };

          for (const mDoc of membersSnap.docs) {
            const m = mDoc.data();
            if (!m.name) continue;

            // Dedup: only send once per flight direction per member
            const dedupTag = `flight-${bDoc.id}-${direction}`;
            const alreadySent = await db
              .collection('trips').doc(tripDoc.id)
              .collection('notifications')
              .where('recipientName', '==', m.name)
              .where('tag', '==', dedupTag)
              .limit(1)
              .get();
            if (!alreadySent.empty) continue;

            const { title, body } = buildNotification(m.name);
            await notifyMember(
              tripDoc.id, m.name,
              title, body,
              { tag: dedupTag, url: '/' }
            );
          }
        }
      }
    }
  }
);

// ── 5. Todo due-date daily reminder (runs at 08:00 Taipei time) ──────────────
// Notifies assignees when a todo is due today.
export const todoDueDateReminder = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'Asia/Taipei' },
  async () => {
    const today = new Date().toLocaleDateString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).replace(/\//g, '-'); // → 'YYYY-MM-DD'

    const tripsSnap = await db.collection('trips').get();

    for (const tripDoc of tripsSnap.docs) {
      const listsSnap = await db
        .collection('trips').doc(tripDoc.id)
        .collection('lists')
        .where('dueDate', '==', today)
        .where('checked', '==', false)
        .get();

      for (const listDoc of listsSnap.docs) {
        const item = listDoc.data();
        const assignee: string = item.assignee || item.assignedTo || '';
        if (!assignee) continue;

        const text = item.text || item.name || '待辦';
        const title = '📋 待辦事項到期提醒';

        if (assignee === 'all') {
          // 全體待辦：推播給這個行程的每一位成員
          const membersSnap = await db
            .collection('trips').doc(tripDoc.id)
            .collection('members').get();
          for (const mDoc of membersSnap.docs) {
            const m = mDoc.data() as { name?: string };
            if (!m.name) continue;
            await notifyMember(
              tripDoc.id, m.name,
              title,
              `「${text}」今天到期（全體待辦），記得完成！`,
              { tag: `todo-${listDoc.id}-${m.name}`, url: '/' }
            );
          }
        } else {
          await notifyMember(
            tripDoc.id, assignee,
            title,
            `「${text}」今天到期，記得完成！`,
            { tag: `todo-${listDoc.id}`, url: '/' }
          );
        }
      }
    }
  }
);

// ── 6. addEditor: validate collaborator key and add caller to allowedEditorUids ──
// Called from the client when a visitor enters the correct collaborator key.
// Uses Admin SDK to bypass client-side security rules (trip update is owner-only).
export const addEditor = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const { tripId, collaboratorKey } = request.data as { tripId: string; collaboratorKey: string };
  if (!tripId || !collaboratorKey) throw new HttpsError('invalid-argument', 'tripId and collaboratorKey required');

  const tripDoc = await db.collection('trips').doc(tripId).get();
  if (!tripDoc.exists) throw new HttpsError('not-found', 'Trip not found');

  const data = tripDoc.data()!;
  const storedKey = (data.collaboratorKey || '').toUpperCase();
  if (!storedKey || collaboratorKey.trim().toUpperCase() !== storedKey) {
    throw new HttpsError('permission-denied', 'Invalid collaborator key');
  }

  const uid = request.auth.uid;
  const email = (request.auth.token.email as string | undefined) || '';

  await tripDoc.ref.update({
    allowedEditorUids: admin.firestore.FieldValue.arrayUnion(uid),
    [`editorInfo.${uid}`]: { email, joinedAt: Date.now() },
  });

  return { success: true };
});

// ── 7. claimOwnership: backfill ownerUid for trips owned by email ─────────────
// Called from the client after Google sign-in. Uses Admin SDK to bypass
// client-side security rules and stamp the caller's UID onto any trip
// where ownerEmail matches but ownerUid is missing or stale.
export const claimOwnership = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const uid   = request.auth.uid;
  const email = (request.auth.token.email as string | undefined || '').toLowerCase();
  if (!email) throw new HttpsError('invalid-argument', 'No email on token');

  // Query by ownerEmail (stored lowercase at creation time)
  const snap = await db.collection('trips')
    .where('ownerEmail', '==', email)
    .get();

  let fixed = 0;
  for (const tripDoc of snap.docs) {
    const data = tripDoc.data();
    if (data.ownerUid !== uid) {
      await tripDoc.ref.update({ ownerUid: uid });
      fixed++;
    }
  }
  return { fixed };
});

// ── 8. backupTripToNotion ─────────────────────────────────────────────────────
// Callable function: owner triggers a backup of a trip to the Notion database.
// Prerequisites:
//   firebase functions:secrets:set NOTION_API_KEY
//   (Use an Internal Integration token from notion.so/my-integrations,
//    shared with the "TripMori 旅行備份" page.)
//
// Client call example:
//   const fn = httpsCallable(functions, 'backupTripToNotion');
//   await fn({ tripId: '...' });
export const backupTripToNotion = onCall(
  { secrets: [NOTION_API_KEY] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

    const { tripId } = request.data as { tripId: string };
    if (!tripId) throw new HttpsError('invalid-argument', 'tripId required');

    const notionKey = NOTION_API_KEY.value();
    if (!notionKey) throw new HttpsError('failed-precondition', 'NOTION_API_KEY secret not configured');

    const notion = new NotionClient({ auth: notionKey });

    // ── Fetch all trip data from Firestore ────────────────────────────────────
    const [tripSnap, membersSnap, eventsSnap, expensesSnap, journalsSnap, bookingsSnap] = await Promise.all([
      db.collection('trips').doc(tripId).get(),
      db.collection('trips').doc(tripId).collection('members').get(),
      db.collection('trips').doc(tripId).collection('events').get(),
      db.collection('trips').doc(tripId).collection('expenses').get(),
      db.collection('trips').doc(tripId).collection('journals').get(),
      db.collection('trips').doc(tripId).collection('bookings').get(),
    ]);

    if (!tripSnap.exists) throw new HttpsError('not-found', 'Trip not found');

    const tripData = tripSnap.data()!;
    const uid      = request.auth.uid;
    const isOwner  = tripData.ownerUid === uid;
    const isEditor = (tripData.allowedEditorUids || []).includes(uid);
    if (!isOwner && !isEditor) throw new HttpsError('permission-denied', 'Owner or editor only');

    // ── Static booking data (stored on trip document) ─────────────────────────
    const staticFlights: any[] = tripData.staticFlights || [];
    const staticHotels: any[]  = tripData.staticHotels  || [];
    const staticCar: any       = tripData.staticCar     || null;

    // ── Aggregates ────────────────────────────────────────────────────────────
    const currency    = tripData.currency || 'JPY';
    const memberNames = membersSnap.docs.map(d => d.data().name || '').filter(Boolean);
    const memberCount = membersSnap.size;
    const eventCount  = eventsSnap.size;
    const dateRange   = [tripData.startDate, tripData.endDate].filter(Boolean).join(' ～ ') || '—';
    const backupTime  = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

    const TWD_RATES: Record<string, number> = { TWD: 1, JPY: 0.22, USD: 32, EUR: 35, KRW: 0.024, CNY: 4.4, HKD: 4.1, MYR: 7.2, THB: 0.9, IDR: 0.002 };
    const totalTWD = expensesSnap.docs.reduce((sum, d) => {
      const e = d.data();
      if (e.isSettlement) return sum;
      const amt = Number(e.amountTWD) || Number(e.amount) * (TWD_RATES[e.currency] ?? 1);
      return sum + amt;
    }, 0);

    // ── Sort collections (no limits — full backup) ────────────────────────────
    const allEvents = eventsSnap.docs
      .map(d => d.data())
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const allExpenses = expensesSnap.docs
      .filter(d => !d.data().isSettlement)
      .map(d => d.data())
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const allJournals = journalsSnap.docs
      .map(d => d.data())
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const allBookings = bookingsSnap.docs
      .map(d => d.data())
      .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

    // ── Block builder helpers ─────────────────────────────────────────────────
    const h2 = (text: string): any => ({
      object: 'block', type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: text } }] },
    });
    const h3 = (text: string): any => ({
      object: 'block', type: 'heading_3',
      heading_3: { rich_text: [{ type: 'text', text: { content: text.slice(0, 1900) } }] },
    });
    const para = (text: string): any => ({
      object: 'block', type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: text } }] },
    });
    const bullet = (text: string): any => ({
      object: 'block', type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text.slice(0, 1900) } }] },
    });
    const divider = (): any => ({ object: 'block', type: 'divider', divider: {} });
    // Split long text into multiple paragraph blocks (max 1900 chars each)
    const textBlocks = (text: string): any[] => {
      const out: any[] = [];
      for (let i = 0; i < text.length; i += 1900) out.push(para(text.slice(i, i + 1900)));
      return out.length ? out : [para('（無）')];
    };

    // ── Build all Notion blocks ───────────────────────────────────────────────
    const blocks: any[] = [];

    // 1. 行程資訊
    blocks.push(h2('🗂 行程資訊'));
    blocks.push(para(`名稱：${tripData.title || '—'} ${tripData.emoji || ''}`));
    blocks.push(para(`日期：${dateRange}`));
    blocks.push(para(`幣別：${currency}`));
    blocks.push(para(`說明：${tripData.description || '（無）'}`));
    blocks.push(para(`備份時間：${backupTime}　｜　Firestore ID：${tripId}`));
    blocks.push(divider());

    // 2. 旅伴
    blocks.push(h2(`👥 旅伴（${memberCount} 人）`));
    if (memberNames.length) {
      memberNames.forEach(n => blocks.push(bullet(n)));
    } else {
      blocks.push(para('（無成員）'));
    }
    blocks.push(divider());

    // 3. 機票
    blocks.push(h2(`✈️ 機票（${staticFlights.length} 筆）`));
    if (staticFlights.length) {
      staticFlights.forEach(f => {
        const line = [
          f.direction, f.airline, f.flightNo,
          `| ${f.date || '—'}`,
          `| ${f.dep?.airport || ''}(${f.dep?.time || ''}) → ${f.arr?.airport || ''}(${f.arr?.time || ''})`,
          f.costPerPerson ? `| 每人 ${f.costPerPerson}` : '',
          f.notes ? `| 備註：${f.notes}` : '',
        ].filter(Boolean).join(' ');
        blocks.push(bullet(line));
      });
    } else {
      blocks.push(para('（無機票資料）'));
    }
    blocks.push(divider());

    // 4. 住宿
    blocks.push(h2(`🏨 住宿（${staticHotels.length} 筆）`));
    if (staticHotels.length) {
      staticHotels.forEach(h => {
        blocks.push(h3(h.name || '未命名飯店'));
        blocks.push(para(`入住：${h.checkIn || '—'}　退房：${h.checkOut || '—'}`));
        blocks.push(para(`房型：${h.roomType || '—'}　費用：${h.totalCost || '—'} ${h.currency || ''}`));
        if (h.confirmCode) blocks.push(para(`確認碼：${h.confirmCode}${h.pin ? `　PIN：${h.pin}` : ''}`));
        if (h.notes) blocks.push(...textBlocks(`備註：${h.notes}`));
      });
    } else {
      blocks.push(para('（無住宿資料）'));
    }
    blocks.push(divider());

    // 5. 租車
    blocks.push(h2('🚗 租車'));
    if (staticCar) {
      blocks.push(para(`${staticCar.company || ''} ${staticCar.carType || ''}`));
      blocks.push(para(`取車：${staticCar.pickupLocation || '—'}　${staticCar.pickupTime || ''}`));
      blocks.push(para(`還車：${staticCar.returnLocation || '—'}　${staticCar.returnTime || ''}`));
      blocks.push(para(`費用：${staticCar.totalCost || '—'} ${staticCar.currency || ''}　確認碼：${staticCar.confirmCode || '—'}`));
      if (staticCar.notes) blocks.push(...textBlocks(`備註：${staticCar.notes}`));
    } else {
      blocks.push(para('（無租車資料）'));
    }
    blocks.push(divider());

    // 6. 自訂預定
    blocks.push(h2(`📋 自訂預定（${allBookings.length} 筆）`));
    if (allBookings.length) {
      allBookings.forEach(b => {
        const line = [
          b.title || b.name || '未命名',
          b.date ? `| ${b.date}${b.time ? ' ' + b.time : ''}` : '',
          b.cost ? `| ${b.cost} ${b.currency || ''}` : '',
          b.confirmCode ? `| 確認碼：${b.confirmCode}` : '',
          b.notes ? `| 備註：${String(b.notes).slice(0, 150)}` : '',
        ].filter(Boolean).join(' ');
        blocks.push(bullet(line));
      });
    } else {
      blocks.push(para('（無自訂預定）'));
    }
    blocks.push(divider());

    // 7. 行程活動（全部，依日期分組）
    blocks.push(h2(`📅 行程活動（共 ${allEvents.length} 筆）`));
    if (allEvents.length) {
      const byDate: Record<string, any[]> = {};
      allEvents.forEach(e => {
        const d = e.date || '—';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(e);
      });
      Object.entries(byDate).forEach(([date, evs]) => {
        blocks.push(h3(date));
        evs.forEach(e => {
          const line = [
            e.startTime || '',
            e.title || e.name || '—',
            e.location ? `| 地點：${e.location}` : '',
            e.category ? `| ${e.category}` : '',
            e.notes ? `| ${String(e.notes).slice(0, 120)}` : '',
          ].filter(Boolean).join(' ');
          blocks.push(bullet(line));
        });
      });
    } else {
      blocks.push(para('（尚無行程活動）'));
    }
    blocks.push(divider());

    // 8. 費用（全部）
    blocks.push(h2(`💰 費用（共 ${allExpenses.length} 筆　合計 ≈ NT$ ${Math.round(totalTWD).toLocaleString()}）`));
    if (allExpenses.length) {
      allExpenses.forEach(e => {
        const twdPart = e.amountTWD ? ` ≈ NT$${Math.round(Number(e.amountTWD))}` : '';
        const splitPart = Array.isArray(e.splitWith) && e.splitWith.length
          ? `（${e.splitWith.join('、')}）` : '';
        const line = [
          e.date || '—',
          `| ${e.description || '—'}`,
          `| ${e.amount} ${e.currency || ''}${twdPart}`,
          `| 付款：${e.paidBy || '—'}${splitPart}`,
          e.notes ? `| ${String(e.notes).slice(0, 80)}` : '',
        ].filter(Boolean).join(' ');
        blocks.push(bullet(line));
      });
    } else {
      blocks.push(para('（尚無費用記錄）'));
    }
    blocks.push(divider());

    // 9. 日誌（全部，完整內文）
    blocks.push(h2(`📖 日誌（共 ${allJournals.length} 篇）`));
    if (allJournals.length) {
      allJournals.forEach(j => {
        blocks.push(h3(`${j.date || '—'} — ${j.title || '（無標題）'}`));
        if (j.body) blocks.push(...textBlocks(j.body));
        else blocks.push(para('（無內文）'));
      });
    } else {
      blocks.push(para('（尚無日誌）'));
    }

    // ── Mark previous backups of same trip as 舊版 ────────────────────────────
    try {
      const existing = await notion.dataSources.query({
        dataSourceId: NOTION_DATABASE_ID,
        filter: { property: 'Firestore ID', rich_text: { equals: tripId } },
      } as any);
      for (const pg of (existing as any).results ?? []) {
        await notion.pages.update({
          page_id: pg.id,
          properties: { '狀態': { select: { name: '舊版' } } },
        } as any);
      }
    } catch (err: any) {
      console.warn('Non-fatal: marking old backups failed:', err?.message ?? err);
    }

    // ── Create Notion page (first 95 blocks) ─────────────────────────────────
    const BATCH = 95;
    let page: any;
    try {
      page = await notion.pages.create({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
          '行程名稱':      { title:     [{ text: { content: `${tripData.emoji || '✈️'} ${tripData.title || '未命名行程'}` } }] },
          'Firestore ID': { rich_text: [{ text: { content: tripId } }] },
          '行程日期':      { rich_text: [{ text: { content: dateRange } }] },
          '成員數':        { number:    memberCount },
          '活動數':        { number:    eventCount },
          '費用總計 TWD':  { number:    Math.round(totalTWD) },
          '幣別':          { rich_text: [{ text: { content: currency } }] },
          '狀態':          { select:    { name: '最新' } },
        },
        children: blocks.slice(0, BATCH),
      });
    } catch (err: any) {
      const detail = JSON.stringify(err?.body ?? err?.message ?? String(err));
      console.error('Notion pages.create error:', detail);
      throw new HttpsError('internal', `Notion error: ${err?.message ?? detail}`);
    }

    // ── Append remaining blocks in batches of 95 ─────────────────────────────
    for (let i = BATCH; i < blocks.length; i += BATCH) {
      try {
        await (notion.blocks.children as any).append({
          block_id: page.id,
          children: blocks.slice(i, i + BATCH),
        });
      } catch (err: any) {
        console.error(`Notion append error at block ${i}:`, err?.message ?? err);
        break; // partial backup beats no backup
      }
    }

    return {
      success:      true,
      notionPageId: page.id,
      notionUrl:    page.url || '',
      memberCount,
      eventCount,
      expenseCount: allExpenses.length,
      totalTWD:     Math.round(totalTWD),
      blockCount:   blocks.length,
    };
  }
);
