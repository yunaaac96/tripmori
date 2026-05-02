/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare const self: ServiceWorkerGlobalScope;

// ── Activate new SW immediately, don't wait for old tabs to close ─────────────
self.addEventListener('install', () => {
  (self as any).skipWaiting();
});
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil((self as any).clients.claim());
});

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

// ── SPA navigation fallback ───────────────────────────────────────────────────
// Ensures all navigation requests (page loads, back/forward) are served from
// the precached index.html even when offline. Without this, navigating to any
// URL while offline would return a network error instead of loading the app.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// Firebase Messaging background handler
// Guard: if any required env var is missing, skip FCM setup silently rather than throwing.
const _fbApiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
if (_fbApiKey) {
  const firebaseApp = initializeApp({
    apiKey:            _fbApiKey,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  });

  const messaging = getMessaging(firebaseApp);

  onBackgroundMessage(messaging, (payload) => {
    // All FCM messages are data-only (no webpush.notification field).
    // The browser will NOT auto-display a notification, so we must call
    // showNotification() here. This is the single place that shows the
    // notification when the app is in the background — no duplicates.
    // If somehow a legacy notification field arrives, skip to avoid duplicates.
    if (payload.notification) return;

    const d     = (payload.data ?? {}) as Record<string, string>;
    const title = d.title ?? 'TripMori';
    const body  = d.body  ?? '';

    self.registration.showNotification(title, {
      body,
      icon:  '/icons/icon-192-light.png',
      badge: '/icons/icon-192-light.png',
      data:  payload.data ?? {},
      tag:   d.tag ?? 'tripmori-notification',
      renotify: true,
    });
  });
} // end if (_fbApiKey)

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
