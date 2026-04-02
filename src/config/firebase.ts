import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth, signInAnonymously, onAuthStateChanged, browserLocalPersistence, setPersistence } from 'firebase/auth';

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

// 啟用離線持久化（新 API，取代已棄用的 enableIndexedDbPersistence）
export const db = initializeFirestore(app, {
  cache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

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

export default app;