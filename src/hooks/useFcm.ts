import { useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { messagingPromise } from '../config/firebase';
import { db } from '../config/firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

/**
 * Requests notification permission, gets an FCM token, stores it in the
 * member's Firestore record, and wires up foreground message display.
 *
 * @param tripId  – active trip document ID (null = not yet loaded)
 * @param memberId – bound member document ID for this user (null = not bound)
 */
export function useFcm(tripId: string | null, memberId: string | null) {
  useEffect(() => {
    if (!tripId || !memberId) return;
    if (!VAPID_KEY) return; // VITE_FIREBASE_VAPID_KEY not configured
    if (!('Notification' in window)) return;

    let unsubForeground: (() => void) | undefined;

    (async () => {
      const messaging = await messagingPromise;
      if (!messaging) return;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      try {
        // Use the already-registered service worker (sw.js) rather than letting
        // FCM default to registering /firebase-messaging-sw.js (which doesn't exist).
        const swReg = await navigator.serviceWorker.ready;
        const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
        if (token) {
          // Use updateDoc (not setDoc+merge) so that a deleted member doc
          // does NOT get silently recreated as a nameless document.
          await updateDoc(
            doc(db, 'trips', tripId, 'members', memberId),
            { fcmTokens: arrayUnion(token) }
          );
        }
      } catch (err) {
        console.warn('[FCM] getToken failed:', err);
      }

      // Show notifications when app is in foreground
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
