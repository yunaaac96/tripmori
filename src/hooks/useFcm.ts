import { useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { messagingPromise } from '../config/firebase';
import { db } from '../config/firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

/**
 * Enable FCM for the current member — must be called from a user-gesture
 * handler (e.g. a button click), NOT on mount. Requests the notification
 * permission only if it is still 'default', stores the token on the member
 * document, and resolves to the final permission state.
 */
export async function enableFcmForMember(tripId: string, memberId: string): Promise<NotificationPermission> {
  if (!VAPID_KEY) return Notification.permission;
  if (!('Notification' in window)) return 'denied';

  let permission: NotificationPermission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return permission;

  const messaging = await messagingPromise;
  if (!messaging) return permission;

  try {
    const swReg = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    if (token) {
      await updateDoc(
        doc(db, 'trips', tripId, 'members', memberId),
        { fcmTokens: arrayUnion(token) }
      );
    }
  } catch (err: any) {
    // Silently skip "not-found" — the member doc was deleted between bind
    // time and this token refresh. The next bind will re-register the token,
    // so the warning is just noise. Real errors (network, permission, etc.)
    // still log.
    if (err?.code !== 'not-found' && !/No document to update/.test(String(err?.message))) {
      console.warn('[FCM] getToken failed:', err);
    }
  }
  return permission;
}

/**
 * Passive FCM hook — only wires up foreground message display and refreshes
 * the token when permission is ALREADY 'granted'. Does not prompt the user.
 * Call `enableFcmForMember()` from a button to request permission.
 */
export function useFcm(tripId: string | null, memberId: string | null) {
  useEffect(() => {
    if (!tripId || !memberId) return;
    if (!VAPID_KEY) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    let unsubForeground: (() => void) | undefined;

    (async () => {
      const messaging = await messagingPromise;
      if (!messaging) return;

      try {
        const swReg = await navigator.serviceWorker.ready;
        const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
        if (token) {
          await updateDoc(
            doc(db, 'trips', tripId, 'members', memberId),
            { fcmTokens: arrayUnion(token) }
          );
        }
      } catch (err) {
        console.warn('[FCM] getToken failed:', err);
      }

      unsubForeground = onMessage(messaging, (payload) => {
        const title = payload.notification?.title ?? 'TripMori';
        const body  = payload.notification?.body  ?? '';
        if (Notification.permission === 'granted') {
          new Notification(title, {
            body,
            icon: '/icons/icon-192-light.png',
            badge: '/icons/icon-192-light.png',
            tag: (payload.data as any)?.tag ?? 'tripmori-notification',
          });
        }
      });
    })();

    return () => { unsubForeground?.(); };
  }, [tripId, memberId]);
}
