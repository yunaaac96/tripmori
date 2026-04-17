/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare const self: ServiceWorkerGlobalScope;

// ── Pass ALL cross-origin requests directly to the network (never cache) ──────
// This prevents Workbox from intercepting Firebase/Google API streaming
// connections (e.g. Firestore Listen/channel) and trying to cache them,
// which causes Cache.put() network errors and breaks the Firestore connection.
registerRoute(
  ({ url }) => url.origin !== self.location.origin,
  new NetworkOnly()
);

// ── Workbox precache for app shell ────────────────────────────────────────────
precacheAndRoute(self.__WB_MANIFEST ?? []);
cleanupOutdatedCaches();

// Firebase Messaging background handler
const firebaseApp = initializeApp({
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
});

const messaging = getMessaging(firebaseApp);

onBackgroundMessage(messaging, (payload) => {
  const title = payload.notification?.title ?? 'TripMori';
  const body  = payload.notification?.body  ?? '';
  const icon  = payload.notification?.icon  ?? '/icons/icon-192-light.png';

  self.registration.showNotification(title, {
    body,
    icon,
    badge: '/icons/icon-192-light.png',
    data:  payload.data ?? {},
    tag:   (payload.data as any)?.tag ?? 'tripmori-notification',
    renotify: true,
  });
});

// Open app on notification click
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as any)?.url ?? '/';
  event.waitUntil(
    (self.clients as Clients).matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return (self.clients as Clients).openWindow(url);
    })
  );
});
