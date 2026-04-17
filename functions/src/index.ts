import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

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
        if (!assignee || assignee === 'all') continue;

        await notifyMember(
          tripDoc.id, assignee,
          '📋 待辦事項到期提醒',
          `「${item.text || item.name || '待辦'}」今天到期，記得完成！`,
          { tag: `todo-${listDoc.id}`, url: '/' }
        );
      }
    }
  }
);

// ── 6. claimOwnership: backfill ownerUid for trips owned by email ─────────────
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
