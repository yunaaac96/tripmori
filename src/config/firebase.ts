import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
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
export const db      = getFirestore(app);
export const storage = getStorage(app);
export const auth    = getAuth(app);

// 登入狀態持久化：存 localStorage，關閉瀏覽器後仍保持登入
setPersistence(auth, browserLocalPersistence).catch(console.error);

// 啟用離線持久化
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('多個標籤頁開啟，離線持久化只能在單一標籤頁使用');
  } else if (err.code === 'unimplemented') {
    console.warn('瀏覽器不支援離線持久化');
  }
});

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