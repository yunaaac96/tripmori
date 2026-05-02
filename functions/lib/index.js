"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onProxyGrantChanged = exports.onProxyExpenseRecorded = exports.onSettlementPending = exports.backupTripToNotion = exports.claimOwnership = exports.addEditor = exports.pruneOldNotifications = exports.todoDueDateReminder = exports.preFlightReminder = exports.onMemberNoteCreated = exports.onJournalReactionUpdated = exports.onJournalCommentCreated = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const client_1 = require("@notionhq/client");
// ── Notion backup config ───────────────────────────────────────────────────
const NOTION_API_KEY = (0, params_1.defineSecret)('NOTION_API_KEY');
const NOTION_DATABASE_ID = '7f17b1ac-1126-4d54-89ca-51cf6160152c'; // 行程備份紀錄（database）
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
// ── Timezone utility ──────────────────────────────────────────────────────────
/**
 * Convert a local date + time string to UTC milliseconds using the given
 * IANA timezone. Handles DST correctly via the Intl "round-trip" method:
 * treats the input as UTC to get a reference point, measures the displayed
 * local offset in the target tz, then shifts accordingly.
 *
 * @param date  "YYYY-MM-DD"
 * @param time  "HH:MM"
 * @param tz    IANA timezone, e.g. "Asia/Taipei" or "Asia/Tokyo"
 * @returns     UTC milliseconds, or NaN on parse failure
 */
function localToUTCMs(date, time, tz) {
    if (!date || !time)
        return NaN;
    // Step 1: parse as UTC to get a reference instant
    const refUtc = new Date(`${date}T${time}:00Z`);
    if (isNaN(refUtc.getTime()))
        return NaN;
    // Step 2: what does the target tz show for that instant?
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(refUtc).map(p => [p.type, p.value]));
    const tzMs = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour === '24' ? 0 : parts.hour), Number(parts.minute));
    // Step 3: desired local time as UTC
    const [y, m, d] = date.split('-').map(Number);
    const [h, min] = time.split(':').map(Number);
    const wantMs = Date.UTC(y, m - 1, d, h, min);
    // Step 4: shift reference by the difference
    return refUtc.getTime() + (wantMs - tzMs);
}
// ── Helper: send FCM to a member by name ─────────────────────────────────────
async function notifyMember(tripId, memberName, title, body, data = {}) {
    const membersSnap = await db
        .collection('trips').doc(tripId)
        .collection('members')
        .where('name', '==', memberName)
        .limit(1)
        .get();
    if (membersSnap.empty)
        return;
    const member = membersSnap.docs[0].data();
    // Prefer standalone (PWA home-screen) tokens so only the installed app
    // shows the notification. Fall back to all tokens if none are standalone.
    const standaloneTokens = member.fcmTokensStandalone || [];
    const allTokens = member.fcmTokens || [];
    const tokens = standaloneTokens.length > 0 ? standaloneTokens : allTokens;
    if (!tokens.length)
        return;
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
    // webpush.notification: browser auto-displays the notification from this field.
    // onBackgroundMessage in sw.ts detects payload.notification and returns early,
    // so no second showNotification call is made — eliminating the duplicate.
    // data also carries title/body for the foreground onMessage handler (useFcm.ts)
    // and as a future-proof fallback.
    const messages = tokens.map(token => ({
        token,
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
        data: { title, body, ...data },
    }));
    // Send all tokens; collect stale ones to clean up
    const results = await Promise.allSettled(messages.map(m => messaging.send(m)));
    const staleTokens = [];
    results.forEach((r, i) => {
        if (r.status === 'rejected') {
            const err = r.reason;
            if (err.code === 'messaging/registration-token-not-registered' ||
                err.code === 'messaging/invalid-registration-token') {
                staleTokens.push(tokens[i]);
            }
        }
    });
    if (staleTokens.length) {
        await membersSnap.docs[0].ref.update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...staleTokens),
            fcmTokensStandalone: admin.firestore.FieldValue.arrayRemove(...staleTokens),
        });
    }
}
// ── 1. Journal comment notifications ─────────────────────────────────────────
// Triggers when a new journalComment is created.
// • @mentioned members → 「X 在日誌提到了你」(highest priority, sent first)
// • Journal author (not mentioned, not self) → 「💬 你的日誌有新留言：...」
exports.onJournalCommentCreated = (0, firestore_1.onDocumentCreated)('trips/{tripId}/journalComments/{commentId}', async (event) => {
    const comment = event.data?.data();
    if (!comment)
        return;
    const { tripId } = event.params;
    const content = comment.content || '';
    const author = comment.authorName || comment.author || '';
    const journalId = comment.journalId || '';
    // Find all @mentions
    const mentions = content.match(/@([\u4e00-\u9fa5\w]+)/g) || [];
    const mentionedNames = [...new Set(mentions.map((m) => m.slice(1)))];
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
        if (name === author)
            continue;
        await notifyMember(tripId, name, `${author} 在日誌提到了你`, snippet, { tag: `mention-${event.params.commentId}`, url: '/' });
    }
    // 1b. Notify journal author about new comment (if not the commenter and not already mentioned)
    if (journalAuthor && journalAuthor !== author && !mentionedNames.includes(journalAuthor)) {
        await notifyMember(tripId, journalAuthor, `💬 你的日誌有新留言`, snippet, { tag: `journal-comment-${event.params.commentId}`, url: '/' });
    }
});
// ── 2. Journal reaction notifications ────────────────────────────────────────
// Triggers when a journal's reactions field is updated.
// Notifies the journal author when someone adds a reaction emoji.
exports.onJournalReactionUpdated = (0, firestore_1.onDocumentUpdated)('trips/{tripId}/journals/{journalId}', async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    const { tripId, journalId } = event.params;
    const journalAuthor = after.authorName || '';
    if (!journalAuthor)
        return;
    const beforeReactions = before.reactions || {};
    const afterReactions = after.reactions || {};
    // Find which emoji was newly added (someone who wasn't in before is now in after)
    for (const [emoji, reactors] of Object.entries(afterReactions)) {
        const prevReactors = beforeReactions[emoji] || [];
        const newReactors = reactors.filter(u => !prevReactors.includes(u));
        for (const reactorName of newReactors) {
            if (reactorName === journalAuthor)
                continue; // don't notify yourself
            await notifyMember(tripId, journalAuthor, `✨ ${reactorName} 對你的日誌按了個 ${emoji}`, after.content ? `「${after.content.slice(0, 40)}…」` : '點擊查看', { tag: `reaction-${journalId}-${emoji}-${reactorName}`, url: '/' });
        }
    }
});
// ── 3. Member note board notifications ───────────────────────────────────────
// Triggers when a new memberNote is created.
// Notifies the card owner (the member whose board was written on).
exports.onMemberNoteCreated = (0, firestore_1.onDocumentCreated)('trips/{tripId}/memberNotes/{noteId}', async (event) => {
    const note = event.data?.data();
    if (!note)
        return;
    const { tripId } = event.params;
    const authorName = note.authorName || '';
    const memberId = note.memberId || '';
    const content = note.content || '';
    if (!memberId || !authorName)
        return;
    // Resolve the member whose board this is
    const memberSnap = await db
        .collection('trips').doc(tripId)
        .collection('members').doc(memberId)
        .get();
    if (!memberSnap.exists)
        return;
    const memberName = memberSnap.data()?.name || '';
    if (!memberName || memberName === authorName)
        return; // don't notify yourself
    const snippet = content.length > 60 ? content.slice(0, 60) + '…' : content;
    await notifyMember(tripId, memberName, `📝 留言板新訊息`, `${authorName}：${snippet}`, { tag: `note-${event.params.noteId}`, url: '/' });
});
// ── 4. Pre-flight ~4-hour reminder (scheduled, runs every hour) ───────────────
// Checks all trips; if departure is in 3.5–4.5 hours, notify all members.
// Distinguishes outbound (去程) and return (回程) with different copy.
exports.preFlightReminder = (0, scheduler_1.onSchedule)({ schedule: 'every 60 minutes', timeZone: 'Asia/Taipei' }, async () => {
    const now = Date.now();
    const tripsSnap = await db.collection('trips').get();
    // Defence: a malformed departureTime or a single failing member notify
    // shouldn't abort the entire cron run for every other trip.
    for (const tripDoc of tripsSnap.docs) {
        try {
            const trip = tripDoc.data();
            if (!trip.startDate)
                continue;
            const flightEntries = [];
            // 1. staticFlights on the trip document
            const staticFlights = Array.isArray(trip.staticFlights) ? trip.staticFlights : [];
            for (const f of staticFlights) {
                const depDate = f.departureDate || f.date || '';
                const depTime = f.departureTime || f.dep?.time || '';
                if (depDate && depTime) {
                    flightEntries.push({ f, sourceKey: `static-${depDate}-${depTime}` });
                }
            }
            // 2. Legacy bookings sub-collection
            const bookingsSnap = await db
                .collection('trips').doc(tripDoc.id)
                .collection('bookings')
                .where('type', '==', 'flight')
                .get();
            for (const bDoc of bookingsSnap.docs) {
                const b = bDoc.data();
                const legacyFlights = b.flights || (b.departureTime || b.date ? [b] : []);
                for (const f of legacyFlights) {
                    const depDate = f.departureDate || f.date || '';
                    const depTime = f.departureTime || f.dep?.time || '';
                    if (depDate && depTime) {
                        flightEntries.push({ f, sourceKey: `booking-${bDoc.id}` });
                    }
                }
            }
            if (flightEntries.length === 0)
                continue;
            for (const { f, sourceKey } of flightEntries) {
                try {
                    const depDate = f.departureDate || f.date || '';
                    const depTime = f.departureTime || f.dep?.time || '';
                    if (!depDate || !depTime)
                        continue;
                    // ── Determine direction ──────────────────────────────────────
                    let isReturn = false;
                    if (f.direction) {
                        isReturn = f.direction === '回程';
                    }
                    else if (trip.startDate && depDate) {
                        isReturn = depDate !== trip.startDate;
                    }
                    // ── Pick departure-point timezone ────────────────────────────
                    // 去程: departs from Taiwan (Asia/Taipei, UTC+8)
                    // 回程: departs from destination (trip.locationTimezone, e.g. Asia/Tokyo UTC+9)
                    const depTz = isReturn
                        ? (trip.locationTimezone || 'Asia/Taipei')
                        : 'Asia/Taipei';
                    // ── UTC conversion (no hardcoded +08:00) ─────────────────────
                    const depMs = localToUTCMs(depDate, depTime, depTz);
                    if (Number.isNaN(depMs)) {
                        console.warn(`[preflight] localToUTCMs returned NaN for ${depDate} ${depTime} ${depTz}`);
                        continue;
                    }
                    // Window: 3.0 – 5.0 hours ahead of now
                    const inWindow = depMs >= (now + 3.0 * 3600000) && depMs <= (now + 5.0 * 3600000);
                    if (!inWindow)
                        continue;
                    const flightNo = f.flightNumber || f.flightNo || '';
                    const direction = isReturn ? '回程' : '去程';
                    const buildNotification = (memberName) => {
                        if (isReturn) {
                            return {
                                title: '✈️ 準備回家囉！',
                                body: `${flightNo ? flightNo + ' ' : ''}航班 4 小時後起飛，該前往機場囉。確認行李已封箱、護照隨身帶。Tripmori 陪你平安回家 🏠`,
                            };
                        }
                        else {
                            return {
                                title: '🛫 出發倒數 4 小時！',
                                body: `嘿 ${memberName}，該前往機場囉！檢查好護照與行李，把工作放下，我們只負責享受旅行！祝一路順風 ✨`,
                            };
                        }
                    };
                    const membersSnap = await db
                        .collection('trips').doc(tripDoc.id)
                        .collection('members').get();
                    for (const mDoc of membersSnap.docs) {
                        try {
                            const m = mDoc.data();
                            if (!m.name)
                                continue;
                            // Dedup key: stable per flight direction (not per Firestore doc id)
                            const dedupTag = `flight-${sourceKey}-${direction}`;
                            const alreadySent = await db
                                .collection('trips').doc(tripDoc.id)
                                .collection('notifications')
                                .where('recipientName', '==', m.name)
                                .where('tag', '==', dedupTag)
                                .limit(1)
                                .get();
                            if (!alreadySent.empty)
                                continue;
                            const { title, body } = buildNotification(m.name);
                            await notifyMember(tripDoc.id, m.name, title, body, { tag: dedupTag, url: '/' });
                        }
                        catch (memberErr) {
                            console.error(`[preflight] trip ${tripDoc.id} source ${sourceKey} member ${mDoc.id} failed`, memberErr);
                        }
                    }
                }
                catch (flightErr) {
                    console.error(`[preflight] trip ${tripDoc.id} source ${sourceKey} failed`, flightErr);
                }
            }
        }
        catch (tripErr) {
            console.error(`[preflight] trip ${tripDoc.id} failed`, tripErr);
        }
    }
});
// ── 5. Todo due-date reminder (runs at 12:00 Taipei time) ───────────────────
// Fires three tiers of reminders on the same daily cron:
//   明天到期 (D-1)  → 前一天提醒
//   今天到期 (D+0)  → 當天提醒
//   已逾期 1 天 (D+1) → 最後 nudge（更早的逾期不再打擾，UI 已紅標）
exports.todoDueDateReminder = (0, scheduler_1.onSchedule)({ schedule: '0 12 * * *', timeZone: 'Asia/Taipei' }, async () => {
    // Use en-CA locale which is guaranteed to output YYYY-MM-DD ISO order.
    // (zh-TW + year: 'numeric' can produce R.O.C. calendar "114/04/20" on
    // some Node ICU builds, which silently misses the Firestore `dueDate`
    // field that Planning always stores as ISO via <input type="date">.)
    const dateFmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const fmt = (d) => dateFmt.format(d);
    const now = new Date();
    const today = fmt(now);
    const tomorrow = fmt(new Date(now.getTime() + 86400000));
    const yesterday = fmt(new Date(now.getTime() - 86400000));
    console.log('[todo-reminder] tick', { yesterday, today, tomorrow });
    const stageByDate = {
        [tomorrow]: 'soon',
        [today]: 'today',
        [yesterday]: 'overdue',
    };
    const copyFor = (stage, text, isAll) => {
        const suffix = isAll ? '（全體待辦）' : '';
        if (stage === 'soon')
            return {
                title: '⏰ 待辦明天到期',
                body: `「${text}」明天就到期囉${suffix}，記得提前準備！`,
            };
        if (stage === 'today')
            return {
                title: '📋 待辦今天到期',
                body: `「${text}」今天到期${suffix}，記得完成！`,
            };
        return {
            title: '⚠️ 待辦已逾期',
            body: `「${text}」昨天就到期了${suffix}，尚未完成，請盡快處理！`,
        };
    };
    const tripsSnap = await db.collection('trips').get();
    for (const tripDoc of tripsSnap.docs) {
        // Run 3 separate equality queries instead of a single `in` query.
        // Pure equality-equality compound queries don't need a composite index;
        // `in` + another equality sometimes does, and silently failing in a
        // background function is exactly the class of bug we don't want.
        let docs = [];
        try {
            const results = await Promise.all([yesterday, today, tomorrow].map(date => db.collection('trips').doc(tripDoc.id)
                .collection('lists')
                .where('dueDate', '==', date)
                .where('checked', '==', false)
                .get()));
            docs = results.flatMap(s => s.docs);
        }
        catch (err) {
            console.error(`[todo-reminder] trip ${tripDoc.id} query failed`, err);
            continue;
        }
        console.log(`[todo-reminder] trip ${tripDoc.id}: ${docs.length} matched lists`);
        for (const listDoc of docs) {
            const item = listDoc.data();
            const stage = stageByDate[item.dueDate];
            if (!stage)
                continue;
            const assignee = item.assignee || item.assignedTo || '';
            if (!assignee)
                continue;
            const text = item.text || item.name || '待辦';
            const tagStage = stage === 'today' ? 'd0' : stage === 'soon' ? 'd1' : 'overdue';
            if (assignee === 'all') {
                // 全體待辦：每人獨立 checkedBy[uid]。只推播給「自己尚未勾完成」的成員。
                const checkedBy = item.checkedBy || {};
                const membersSnap = await db
                    .collection('trips').doc(tripDoc.id)
                    .collection('members').get();
                for (const mDoc of membersSnap.docs) {
                    const m = mDoc.data();
                    if (!m.name)
                        continue;
                    // 已綁 Google 帳號且自己勾完了 → 跳過，不打擾
                    if (m.googleUid && checkedBy[m.googleUid])
                        continue;
                    const { title, body } = copyFor(stage, text, true);
                    const dedupTag = `todo-${listDoc.id}-${tagStage}-${today}`;
                    // Check if already notified this member today
                    const alreadyNotified = await db
                        .collection('trips').doc(tripDoc.id)
                        .collection('notifications')
                        .where('recipientName', '==', m.name)
                        .where('tag', '==', dedupTag)
                        .limit(1).get();
                    if (!alreadyNotified.empty)
                        continue;
                    await notifyMember(tripDoc.id, m.name, title, body, { tag: dedupTag, url: '/' });
                }
            }
            else {
                const { title, body } = copyFor(stage, text, false);
                const dedupTag = `todo-${listDoc.id}-${tagStage}-${today}`;
                const alreadyNotified = await db
                    .collection('trips').doc(tripDoc.id)
                    .collection('notifications')
                    .where('recipientName', '==', assignee)
                    .where('tag', '==', dedupTag)
                    .limit(1).get();
                if (!alreadyNotified.empty)
                    continue;
                await notifyMember(tripDoc.id, assignee, title, body, { tag: dedupTag, url: '/' });
            }
        }
    }
});
// ── Notification TTL cleanup (runs 03:00 Taipei time, daily) ─────────────────
// Every notifyMember() writes a row into /trips/{tripId}/notifications so the
// red-dot tab badge works. There's no runtime cleanup in the UI, so that
// collection grows forever and gets downloaded in full by every member and
// visitor who opens the trip. Prune anything older than 30 days.
exports.pruneOldNotifications = (0, scheduler_1.onSchedule)({ schedule: '0 3 * * *', timeZone: 'Asia/Taipei' }, async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const PER_TRIP_CAP = 500; // hard upper bound per daily run to avoid
    //  fetching a runaway trip's whole collection
    //  into memory. Anything over this spills
    //  to tomorrow's run.
    const tripsSnap = await db.collection('trips').get();
    let totalDeleted = 0;
    let totalStamped = 0;
    for (const tripDoc of tripsSnap.docs) {
        try {
            // 1. Normal prune: notifications older than the 30-day cutoff.
            const snap = await db
                .collection('trips').doc(tripDoc.id)
                .collection('notifications')
                .where('createdAt', '<', cutoff)
                .limit(PER_TRIP_CAP)
                .get();
            if (!snap.empty) {
                // Firestore batches cap at 500 writes; stay well below.
                const docs = snap.docs;
                for (let i = 0; i < docs.length; i += 400) {
                    const batch = db.batch();
                    docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
                totalDeleted += docs.length;
                console.log(`[prune-notifs] trip ${tripDoc.id}: deleted ${docs.length}`);
            }
            // 2. Self-heal pass: Firestore's `where('createdAt', '<', cutoff)`
            //    excludes docs where the field is missing, so legacy rows with
            //    no createdAt would never be pruned. Sample up to 50 per trip
            //    per run and stamp them with serverTimestamp so they enter the
            //    30-day clock — eventually caught by the normal prune above.
            const sample = await db
                .collection('trips').doc(tripDoc.id)
                .collection('notifications')
                .limit(50)
                .get();
            const missing = sample.docs.filter(d => !d.data().createdAt);
            if (missing.length > 0) {
                const batch = db.batch();
                missing.forEach(d => batch.set(d.ref, {
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true }));
                await batch.commit();
                totalStamped += missing.length;
                console.log(`[prune-notifs] trip ${tripDoc.id}: stamped ${missing.length} legacy rows with createdAt`);
            }
        }
        catch (err) {
            console.error(`[prune-notifs] trip ${tripDoc.id} failed`, err);
        }
    }
    console.log(`[prune-notifs] done, deleted ${totalDeleted}, stamped ${totalStamped}`);
});
// ── 6. addEditor: validate collaborator key and add caller to allowedEditorUids ──
// Called from the client when a visitor enters the correct collaborator key.
// Uses Admin SDK to bypass client-side security rules (trip update is owner-only).
exports.addEditor = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in');
    const { tripId, collaboratorKey } = request.data;
    if (!tripId || !collaboratorKey)
        throw new https_1.HttpsError('invalid-argument', 'tripId and collaboratorKey required');
    const tripDoc = await db.collection('trips').doc(tripId).get();
    if (!tripDoc.exists)
        throw new https_1.HttpsError('not-found', 'Trip not found');
    const data = tripDoc.data();
    const storedKey = (data.collaboratorKey || '').toUpperCase();
    if (!storedKey || collaboratorKey.trim().toUpperCase() !== storedKey) {
        throw new https_1.HttpsError('permission-denied', 'Invalid collaborator key');
    }
    const uid = request.auth.uid;
    const email = request.auth.token.email || '';
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
exports.claimOwnership = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in');
    const uid = request.auth.uid;
    const email = (request.auth.token.email || '').toLowerCase();
    if (!email)
        throw new https_1.HttpsError('invalid-argument', 'No email on token');
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
exports.backupTripToNotion = (0, https_1.onCall)({ secrets: [NOTION_API_KEY] }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in');
    const { tripId } = request.data;
    if (!tripId)
        throw new https_1.HttpsError('invalid-argument', 'tripId required');
    const notionKey = NOTION_API_KEY.value();
    if (!notionKey)
        throw new https_1.HttpsError('failed-precondition', 'NOTION_API_KEY secret not configured');
    const notion = new client_1.Client({ auth: notionKey });
    // ── Fetch all trip data from Firestore ────────────────────────────────────
    const [tripSnap, membersSnap, eventsSnap, expensesSnap, journalsSnap, bookingsSnap] = await Promise.all([
        db.collection('trips').doc(tripId).get(),
        db.collection('trips').doc(tripId).collection('members').get(),
        db.collection('trips').doc(tripId).collection('events').get(),
        db.collection('trips').doc(tripId).collection('expenses').get(),
        db.collection('trips').doc(tripId).collection('journals').get(),
        db.collection('trips').doc(tripId).collection('bookings').get(),
    ]);
    if (!tripSnap.exists)
        throw new https_1.HttpsError('not-found', 'Trip not found');
    const tripData = tripSnap.data();
    const uid = request.auth.uid;
    const isOwner = tripData.ownerUid === uid;
    const isEditor = (tripData.allowedEditorUids || []).includes(uid);
    if (!isOwner && !isEditor)
        throw new https_1.HttpsError('permission-denied', 'Owner or editor only');
    // ── Static booking data (stored on trip document) ─────────────────────────
    const staticFlights = tripData.staticFlights || [];
    const staticHotels = tripData.staticHotels || [];
    const staticCar = tripData.staticCar || null;
    // ── Aggregates ────────────────────────────────────────────────────────────
    const currency = tripData.currency || 'JPY';
    const memberNames = membersSnap.docs.map(d => d.data().name || '').filter(Boolean);
    const memberCount = membersSnap.size;
    const eventCount = eventsSnap.size;
    const dateRange = [tripData.startDate, tripData.endDate].filter(Boolean).join(' ～ ') || '—';
    const backupTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    const TWD_RATES = { TWD: 1, JPY: 0.22, USD: 32, EUR: 35, KRW: 0.024, CNY: 4.4, HKD: 4.1, MYR: 7.2, THB: 0.9, IDR: 0.002 };
    const totalTWD = expensesSnap.docs.reduce((sum, d) => {
        const e = d.data();
        if (e.isSettlement)
            return sum;
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
    const h2 = (text) => ({
        object: 'block', type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: text } }] },
    });
    const h3 = (text) => ({
        object: 'block', type: 'heading_3',
        heading_3: { rich_text: [{ type: 'text', text: { content: text.slice(0, 1900) } }] },
    });
    const para = (text) => ({
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: text } }] },
    });
    const bullet = (text) => ({
        object: 'block', type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text.slice(0, 1900) } }] },
    });
    const divider = () => ({ object: 'block', type: 'divider', divider: {} });
    // Split long text into multiple paragraph blocks (max 1900 chars each)
    const textBlocks = (text) => {
        const out = [];
        for (let i = 0; i < text.length; i += 1900)
            out.push(para(text.slice(i, i + 1900)));
        return out.length ? out : [para('（無）')];
    };
    // ── Build all Notion blocks ───────────────────────────────────────────────
    const blocks = [];
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
    }
    else {
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
    }
    else {
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
            if (h.confirmCode)
                blocks.push(para(`確認碼：${h.confirmCode}${h.pin ? `　PIN：${h.pin}` : ''}`));
            if (h.notes)
                blocks.push(...textBlocks(`備註：${h.notes}`));
        });
    }
    else {
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
        if (staticCar.notes)
            blocks.push(...textBlocks(`備註：${staticCar.notes}`));
    }
    else {
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
    }
    else {
        blocks.push(para('（無自訂預定）'));
    }
    blocks.push(divider());
    // 7. 行程活動（全部，依日期分組）
    blocks.push(h2(`📅 行程活動（共 ${allEvents.length} 筆）`));
    if (allEvents.length) {
        const byDate = {};
        allEvents.forEach(e => {
            const d = e.date || '—';
            if (!byDate[d])
                byDate[d] = [];
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
    }
    else {
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
    }
    else {
        blocks.push(para('（尚無費用記錄）'));
    }
    blocks.push(divider());
    // 9. 日誌（全部，完整內文）
    blocks.push(h2(`📖 日誌（共 ${allJournals.length} 篇）`));
    if (allJournals.length) {
        allJournals.forEach(j => {
            blocks.push(h3(`${j.date || '—'} — ${j.title || '（無標題）'}`));
            if (j.body)
                blocks.push(...textBlocks(j.body));
            else
                blocks.push(para('（無內文）'));
        });
    }
    else {
        blocks.push(para('（尚無日誌）'));
    }
    // ── Mark previous backups of same trip as 舊版 ────────────────────────────
    try {
        const existing = await notion.dataSources.query({
            dataSourceId: NOTION_DATABASE_ID,
            filter: { property: 'Firestore ID', rich_text: { equals: tripId } },
        });
        for (const pg of existing.results ?? []) {
            await notion.pages.update({
                page_id: pg.id,
                properties: { '狀態': { select: { name: '舊版' } } },
            });
        }
    }
    catch (err) {
        console.warn('Non-fatal: marking old backups failed:', err?.message ?? err);
    }
    // ── Create Notion page (first 95 blocks) ─────────────────────────────────
    const BATCH = 95;
    let page;
    try {
        page = await notion.pages.create({
            parent: { database_id: NOTION_DATABASE_ID },
            properties: {
                '行程名稱': { title: [{ text: { content: `${tripData.emoji || '✈️'} ${tripData.title || '未命名行程'}` } }] },
                'Firestore ID': { rich_text: [{ text: { content: tripId } }] },
                '行程日期': { rich_text: [{ text: { content: dateRange } }] },
                '成員數': { number: memberCount },
                '活動數': { number: eventCount },
                '費用總計 TWD': { number: Math.round(totalTWD) },
                '幣別': { rich_text: [{ text: { content: currency } }] },
                '狀態': { select: { name: '最新' } },
            },
            children: blocks.slice(0, BATCH),
        });
    }
    catch (err) {
        const detail = JSON.stringify(err?.body ?? err?.message ?? String(err));
        console.error('Notion pages.create error:', detail);
        throw new https_1.HttpsError('internal', `Notion error: ${err?.message ?? detail}`);
    }
    // ── Append remaining blocks in batches of 95 ─────────────────────────────
    let truncatedAt = -1;
    for (let i = BATCH; i < blocks.length; i += BATCH) {
        try {
            await notion.blocks.children.append({
                block_id: page.id,
                children: blocks.slice(i, i + BATCH),
            });
        }
        catch (err) {
            console.error(`Notion append error at block ${i}:`, err?.message ?? err);
            truncatedAt = i;
            break; // partial backup beats no backup
        }
    }
    // ── Mark page status if truncated ─────────────────────────────────────────
    if (truncatedAt >= 0) {
        try {
            await notion.pages.update({
                page_id: page.id,
                properties: { '狀態': { select: { name: '備份不完整' } } },
            });
        }
        catch (err) {
            console.warn('Could not mark page as incomplete:', err?.message ?? err);
        }
    }
    return {
        success: true,
        notionPageId: page.id,
        notionUrl: page.url || '',
        memberCount,
        eventCount,
        expenseCount: allExpenses.length,
        totalTWD: Math.round(totalTWD),
        blockCount: blocks.length,
        ...(truncatedAt >= 0 && {
            truncated: true,
            truncatedAt,
            warning: `備份不完整：第 ${truncatedAt + 1} 個 block 開始寫入失敗，Notion 頁面狀態已標記為「備份不完整」`,
        }),
    };
});
// ── 8. Settlement pending notification ───────────────────────────────────────
// Triggers when a new expense is created.
// If it's a pending settlement (debtor initiated), notify the creditor to confirm receipt.
exports.onSettlementPending = (0, firestore_1.onDocumentCreated)('trips/{tripId}/expenses/{expenseId}', async (event) => {
    const expense = event.data?.data();
    if (!expense)
        return;
    // Only handle pending settlement records (Phase 1: debtor initiated)
    if (expense.category !== 'settlement')
        return;
    if (expense.status !== 'pending')
        return;
    const { tripId, expenseId } = event.params;
    const debtor = expense.payer || '';
    const creditor = expense.splitWith?.[0] || '';
    const amount = expense.amountTWD ?? expense.amount ?? 0;
    if (!debtor || !creditor)
        return;
    // Idempotency guard: Cloud Functions may fire more than once for the same
    // Firestore event. Use a transaction to atomically claim the right to send;
    // if notifSentAt is already set, a previous invocation already sent it.
    const expenseRef = db
        .collection('trips').doc(tripId)
        .collection('expenses').doc(expenseId);
    const claimed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(expenseRef);
        if (!snap.exists)
            return false;
        if (snap.data()?.notifSentAt)
            return false; // already sent
        tx.update(expenseRef, { notifSentAt: admin.firestore.FieldValue.serverTimestamp() });
        return true;
    });
    if (!claimed)
        return;
    const amountStr = `NT$ ${Math.round(amount).toLocaleString('zh-TW')}`;
    await notifyMember(tripId, creditor, `💸 ${debtor} 已記錄還款`, `${debtor} 已還款 ${amountStr}，請到費用頁點「確認收款」完成結清`, { tag: `settlement-pending-${expenseId}`, url: '/' });
});
// ── 10. Proxy expense recorded notification ───────────────────────────────────
// Triggers when a new expense is created.
// If it is a private expense recorded by someone other than the principal
// (loggedByUid ≠ privateOwnerUid), notify the principal so they can review it.
exports.onProxyExpenseRecorded = (0, firestore_1.onDocumentCreated)('trips/{tripId}/expenses/{expenseId}', async (event) => {
    const expense = event.data?.data();
    if (!expense)
        return;
    // Only handle private expenses recorded by a proxy
    if (!expense.isPrivate)
        return;
    if (!expense.loggedByUid)
        return;
    if (!expense.privateOwnerUid)
        return;
    if (expense.loggedByUid === expense.privateOwnerUid)
        return; // principal recorded their own
    const { tripId, expenseId } = event.params;
    // Idempotency guard — same pattern as onSettlementPending
    const expenseRef = db
        .collection('trips').doc(tripId)
        .collection('expenses').doc(expenseId);
    const claimed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(expenseRef);
        if (!snap.exists)
            return false;
        if (snap.data()?.proxyNotifSentAt)
            return false;
        tx.update(expenseRef, {
            proxyNotifSentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return true;
    });
    if (!claimed)
        return;
    // Resolve names from member documents
    const membersSnap = await db
        .collection('trips').doc(tripId)
        .collection('members').get();
    const allMembers = membersSnap.docs.map(d => ({
        ...d.data(),
    }));
    const proxyMember = allMembers.find(m => m.googleUid === expense.loggedByUid);
    const principalMember = allMembers.find(m => m.googleUid === expense.privateOwnerUid);
    const proxyName = proxyMember?.name ?? '旅伴';
    const principalName = principalMember?.name ?? '';
    if (!principalName)
        return;
    const amount = expense.amountTWD ?? expense.amount ?? 0;
    const amountStr = `NT$ ${Math.round(amount).toLocaleString('zh-TW')}`;
    await notifyMember(tripId, principalName, `💼 ${proxyName} 幫你代錄了一筆私人帳目`, `金額 ${amountStr}，請到記帳頁確認`, { tag: `proxy-expense-${expenseId}`, url: '/' });
});
// ── 9. Proxy grant notification ───────────────────────────────────────────────
// Triggers when proxyGrants/{grantorUid} is created or updated.
// Sends a push notification to any member whose UID was newly added to proxyUids.
exports.onProxyGrantChanged = (0, firestore_1.onDocumentWritten)('trips/{tripId}/proxyGrants/{grantorUid}', async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after)
        return; // deletion — no notification
    const { tripId, grantorUid } = event.params;
    const prevUids = before?.proxyUids ?? [];
    const nextUids = after.proxyUids ?? [];
    // Only notify for newly added UIDs (not revocations)
    const newlyGranted = nextUids.filter(uid => !prevUids.includes(uid));
    if (newlyGranted.length === 0)
        return;
    // Look up all members to resolve UIDs → names
    const membersSnap = await db
        .collection('trips').doc(tripId)
        .collection('members').get();
    const allMembers = membersSnap.docs.map(d => ({ ...d.data() }));
    const grantor = allMembers.find(m => m.googleUid === grantorUid);
    const grantorName = grantor?.name ?? '旅伴';
    for (const uid of newlyGranted) {
        const target = allMembers.find(m => m.googleUid === uid);
        const targetName = target?.name;
        if (!targetName)
            continue;
        await notifyMember(tripId, targetName, '🔑 代錄授權通知', `${grantorName} 授權你可以協助代錄私人帳目`, { tag: `proxy-grant-${grantorUid}`, url: '/' });
    }
});
//# sourceMappingURL=index.js.map