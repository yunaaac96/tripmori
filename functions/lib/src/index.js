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
exports.todoDueDateReminder = exports.preFlightReminder = exports.onJournalCommentCreated = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
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
    const tokens = member.fcmTokens || [];
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
    // Remove stale tokens
    if (staleTokens.length) {
        await membersSnap.docs[0].ref.update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...staleTokens),
        });
    }
}
// ── 1. Journal comment @mention notification ──────────────────────────────────
// Triggers when a new journalComment is created.
// If comment.content contains @名字, notify that member.
exports.onJournalCommentCreated = (0, firestore_1.onDocumentCreated)('trips/{tripId}/journalComments/{commentId}', async (event) => {
    const comment = event.data?.data();
    if (!comment)
        return;
    const { tripId } = event.params;
    const content = comment.content || '';
    const author = comment.author || '';
    // Find all @mentions in the comment text
    const mentions = content.match(/@([\u4e00-\u9fa5\w]+)/g) || [];
    const mentionedNames = [...new Set(mentions.map(m => m.slice(1)))];
    // Get journal title for context
    let journalTitle = '旅行日誌';
    if (comment.journalId) {
        const jSnap = await db
            .collection('trips').doc(tripId)
            .collection('journals').doc(comment.journalId)
            .get();
        if (jSnap.exists)
            journalTitle = jSnap.data()?.date || journalTitle;
    }
    for (const name of mentionedNames) {
        if (name === author)
            continue; // don't notify yourself
        await notifyMember(tripId, name, `${author} 在日誌提到了你`, `「${content.slice(0, 60)}${content.length > 60 ? '…' : ''}」`, { tag: 'mention', url: '/' });
    }
});
// ── 2. Pre-flight 5-hour reminder (scheduled, runs every hour) ────────────────
// Checks all trips; if departure is in 4.5–5.5 hours, notify all members.
exports.preFlightReminder = (0, scheduler_1.onSchedule)({ schedule: 'every 60 minutes', timeZone: 'Asia/Taipei' }, async () => {
    const now = Date.now();
    const windowStart = now + 4.5 * 60 * 60 * 1000;
    const windowEnd = now + 5.5 * 60 * 60 * 1000;
    // Fetch trips that have a startDate set
    const tripsSnap = await db.collection('trips').get();
    for (const tripDoc of tripsSnap.docs) {
        const trip = tripDoc.data();
        if (!trip.startDate)
            continue;
        // startDate is stored as 'YYYY-MM-DD'; assume departure at 00:00 Asia/Taipei
        // For flight reminders, check bookings instead
        const bookingsSnap = await db
            .collection('trips').doc(tripDoc.id)
            .collection('bookings')
            .where('type', '==', 'flight')
            .get();
        for (const bDoc of bookingsSnap.docs) {
            const b = bDoc.data();
            // flights array: [{departureTime: 'HH:MM', departureDate: 'YYYY-MM-DD', direction: '去程'}, ...]
            const flights = b.flights || (b.departureTime ? [b] : []);
            for (const f of flights) {
                if (!f.departureDate || !f.departureTime)
                    continue;
                const depMs = new Date(`${f.departureDate}T${f.departureTime}:00+08:00`).getTime();
                if (depMs < windowStart || depMs > windowEnd)
                    continue;
                // This flight departs in ~5 hours — notify all members
                const membersSnap = await db
                    .collection('trips').doc(tripDoc.id)
                    .collection('members').get();
                const direction = f.direction || '去程';
                const flightNo = f.flightNumber || '';
                const body = `${flightNo ? flightNo + ' ' : ''}${f.departureTime} 出發，請確認行李與證件！`;
                for (const mDoc of membersSnap.docs) {
                    const m = mDoc.data();
                    if (!m.name)
                        continue;
                    // Check if already notified (dedup via notif tag)
                    const alreadySent = await db
                        .collection('trips').doc(tripDoc.id)
                        .collection('notifications')
                        .where('recipientName', '==', m.name)
                        .where('tag', '==', `flight-${bDoc.id}-${direction}`)
                        .limit(1)
                        .get();
                    if (!alreadySent.empty)
                        continue;
                    await notifyMember(tripDoc.id, m.name, `✈️ ${direction}航班 5 小時後出發`, body, { tag: `flight-${bDoc.id}-${direction}`, url: '/' });
                }
            }
        }
    }
});
// ── 3. Todo due-date daily reminder (runs at 08:00 Taipei time) ───────────────
// Notifies assignees when a todo is due today.
exports.todoDueDateReminder = (0, scheduler_1.onSchedule)({ schedule: '0 8 * * *', timeZone: 'Asia/Taipei' }, async () => {
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
            const assignee = item.assignee || '';
            if (!assignee)
                continue;
            await notifyMember(tripDoc.id, assignee, '📋 待辦事項到期提醒', `「${item.text || item.name || '待辦'}」今天到期，記得完成！`, { tag: `todo-${listDoc.id}`, url: '/' });
        }
    }
});
//# sourceMappingURL=index.js.map