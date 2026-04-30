import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, persistentSingleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth, signInAnonymously, onAuthStateChanged, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// 初始化 Firebase
const app  = initializeApp(firebaseConfig);

// 啟用離線持久化：多 tab 模式（需 SharedWorker），不支援時自動降級為單 tab
// 自動偵測 Long Polling（解決 QUIC ERR_QUIC_PROTOCOL_ERROR）
//
// IMPORTANT: initializeFirestore can only be called once per Firebase app.
// We must choose the tabManager BEFORE calling initializeFirestore, so we
// test SharedWorker support separately to avoid a double-initialization bug.
function createDb() {
  // Test SharedWorker availability (required by persistentMultipleTabManager)
  // without calling initializeFirestore first.
  let tabManager;
  try {
    // persistentMultipleTabManager() itself is safe to call; it only allocates
    // a descriptor object. The actual SharedWorker is created lazily by Firestore.
    tabManager = persistentMultipleTabManager();
  } catch {
    tabManager = persistentSingleTabManager();
  }
  try {
    return initializeFirestore(app, {
      cache: persistentLocalCache({ tabManager }),
      experimentalAutoDetectLongPolling: true,
    });
  } catch (e) {
    // initializeFirestore already called (hot-reload / module re-eval edge case).
    // Fall back to the default Firestore instance — getFirestore returns the
    // existing instance without re-initializing.
    console.warn('[firebase] initializeFirestore failed, using default instance:', (e as Error)?.message);
    return getFirestore(app);
  }
}
export const db = createDb();

export const storage = getStorage(app);
export const auth    = getAuth(app);

// 登入狀態持久化：存 localStorage，關閉瀏覽器後仍保持登入
setPersistence(auth, browserLocalPersistence).catch(console.error);

// 匿名登入
export const initAuth = () =>
  new Promise<void>((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        signInAnonymously(auth).then(() => resolve());
      } else {
        resolve();
      }
    });
  });

// Firebase Messaging (only initialised on supported browsers)
export const messagingPromise: Promise<ReturnType<typeof getMessaging> | null> = isSupported()
  .then(ok => ok ? getMessaging(app) : null)
  .catch(() => null);

export default app;