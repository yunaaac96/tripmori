import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// 🎯 Debug: 用來確認 Netlify 是否有正確抓到環境變數
console.log("🔥 Firebase Config ProjectID:", firebaseConfig.projectId);

const app = initializeApp(firebaseConfig);

// 匯出功能模組
export const db = getFirestore(app);
export const auth = getAuth(app);

// 執行匿名登入以獲取讀取權限
signInAnonymously(auth)
  .then(() => console.log("🔐 Firebase 匿名登入成功"))
  .catch((err) => console.error("❌ Firebase 登入失敗:", err));

export default app;