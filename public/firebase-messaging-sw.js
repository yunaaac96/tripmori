// Empty stub — the real FCM background handler lives in the main service
// worker (src/sw.ts, registered by vite-plugin-pwa at /sw.js). This file
// exists only to satisfy the Firebase Messaging SDK's internal fetch of
// its default SW path and avoid a 404 in the console.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
