# CLAUDE.md — TripMori 專案長期記憶

> 最後更新：2026-04-19

---

## 專案定位

TripMori 是一個行動優先的 PWA 旅遊手帳，給多人結伴旅行的小組使用，解決行程規劃、費用分攤、日記共筆、待辦清單的協作問題，不需要安裝 app 即可使用。

---

## 技術棧

- **框架**：Vite 5 + React 18 + TypeScript 5.2
- **UI / 樣式**：Tailwind CSS 3.4 + 內嵌 inline style（`App.tsx` 匯出共用 style 常數）；FontAwesome 6（`@fortawesome/react-fontawesome`）
- **狀態管理**：無外部狀態庫，全部使用 React useState / useEffect + Firestore onSnapshot
- **資料庫**：Firestore（v10，persistent offline cache，多 tab 模式）
- **認證**：Firebase Auth — Google Sign-In + 匿名登入（訪客瀏覽）
- **檔案儲存**：Firebase Storage（頭像、日記圖片上傳，使用 `browser-image-compression`）
- **推播**：FCM（Firebase Cloud Messaging）— 已完整實作，含 service worker 背景通知
- **Cloud Functions**：Firebase Functions v2（Node 20）
- **PWA**：`vite-plugin-pwa` 0.19（`injectManifest` 策略，Workbox）
- **部署**：Vercel
- **Node 版本**：v24（本機 `.nvmrc`）；Cloud Functions 鎖定 Node 20

---

## 資料夾結構

```
/
├── src/
│   ├── App.tsx              # 應用程式根元件，含共用 style 常數（C、FONT、cardStyle 等）與路由
│   ├── main.tsx             # Vite 入口
│   ├── sw.ts                # Service Worker 原始碼（Workbox + FCM 背景訊息）
│   ├── index.css            # CSS 變數（dark mode、主題色）
│   ├── config/
│   │   └── firebase.ts      # Firebase 初始化（Firestore、Auth、Storage、Messaging）
│   ├── pages/
│   │   ├── Schedule/        # 行程頁（每日事件）
│   │   ├── Bookings/        # 靜態訂票（機票、飯店、租車）
│   │   ├── Expense/         # 費用分攤
│   │   ├── Journal/         # 旅遊日記
│   │   ├── Planning/        # 待辦 / 打包清單
│   │   ├── Members/         # 成員管理
│   │   └── ProjectHub/      # 多行程管理（建立 / 切換行程、角色判斷）
│   ├── components/
│   │   ├── layout/
│   │   │   ├── BottomNav.tsx  # 底部導覽列（無 router，靠 activeTab state 切換）
│   │   │   └── PageHeader.tsx
│   │   ├── SplashScreen.tsx
│   │   ├── CropModal.tsx
│   │   ├── CurrencyPicker.tsx
│   │   ├── CurrencySearch.tsx
│   │   └── DateRangePicker.tsx
│   ├── hooks/
│   │   └── useFcm.ts         # FCM token 取得、權限請求、token 存至 Firestore
│   └── utils/
│       ├── expenseCalc.ts    # 費用分攤計算邏輯（含測試）
│       ├── helpers.ts        # 通用輔助函式
│       └── universalImporter.ts  # 行程匯入邏輯
├── functions/
│   └── src/index.ts         # 所有 Cloud Functions
├── public/
│   ├── icons/               # PWA 圖示（light / dark / mono × 192 / 512）
│   ├── splash/              # iOS splash screen 圖片
│   ├── manifest.json        # PWA manifest
│   └── firebase-messaging-sw.js  # FCM SW 佔位（實際 SW 由 vite-plugin-pwa 產出）
├── e2e/                     # Playwright E2E 測試
├── scripts/
│   └── generate-pwa-assets.mjs  # 產生 PWA 圖示與 splash 的腳本
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── vercel.json
└── vite.config.ts
```

---

## Firebase 架構

### 使用的服務
- Firestore（主要資料庫，含 offline persistence）
- Firebase Auth（Google + anonymous）
- Firebase Storage（圖片）
- Firebase Cloud Messaging（push 通知）
- Cloud Functions v2

### Firestore Collection 結構

根 collection：`trips/{tripId}`

| Sub-collection | 主要欄位（反推）|
|---|---|
| `events` | title, date, time, category, notes, location, paidBy, cost ⚠️ |
| `bookings` | type(flight/hotel/car), 各類訂票欄位 |
| `members` | name, color, avatar, fcmTokens[], ownerUid ⚠️ |
| `lists` | type(packing/todo), items[], dueDate, assignee |
| `journals` | date, content, images[], authorName, reactions |
| `journalComments` | journalId, authorName, content, createdAt |
| `memberNotes` | fromName, toName, content, createdAt |
| `notifications` | recipientName, title, body, tag, createdAt |
| `expenses` | amount, currency, paidBy, splitAmong[], isPrivate, privateOwnerUid, category |

根文件 `trips/{tripId}` 欄位：`ownerUid`, `ownerEmail`, `allowedEditorUids[]`, `collaboratorKey` ⚠️

### Security Rules 核心邏輯

- 任何已登入（含匿名）用戶可 read 所有 sub-collection；write 需是 Google 帳號 + owner 或 editor
- `expenses` 的 private 記錄：list 允許所有人（client 端再過濾），get/write 限本人
- Owner 判斷：`ownerUid` 相符，或 legacy fallback 比對 `ownerEmail`

### Cloud Functions（functions/src/index.ts）

| Function | 觸發方式 | 用途 |
|---|---|---|
| `onJournalCommentCreated` | Firestore onCreate | 新留言時 FCM 通知日記作者 |
| `onJournalReactionUpdated` | Firestore onUpdate | 新增 reaction 時通知作者 |
| `onMemberNoteCreated` | Firestore onCreate | 貼紙便條通知收件成員 |
| `preFlightReminder` | Scheduled | 航班前推播提醒 |
| `todoDueDateReminder` | Scheduled | Todo 到期前推播提醒 |
| `addEditor` | HTTPS Callable | 以 email 新增行程編輯者 |
| `claimOwnership` | HTTPS Callable | 認領行程 ownership |
| `backupTripToNotion` | HTTPS Callable | 將行程資料備份至 Notion database |

---

## PWA 相關設定

- **manifest display**：`standalone`，`start_url`: `/`
- **Service Worker 策略**：`injectManifest`（手寫 `src/sw.ts`）
  - App shell 用 Workbox `precacheAndRoute` 快取
  - 所有跨域請求（Firebase、Google API）用 `NetworkOnly`，避免 Firestore streaming 被攔截
  - `skipWaiting` + `clients.claim`：新版 SW 立即接管，避免舊版 cache 造成 404
- **Push Notification**：完整實作（FCM + Cloud Functions + `useFcm` hook + `onBackgroundMessage`）
- **Offline 行為**：Firestore persistent cache 支援離線讀取；新寫入在重連後自動同步
- **iOS Splash Screen**：inline HTML splash（`index.html` 內 `<style>` + `<div>`），涵蓋 iPhone SE 到 iPhone 16 Pro Max 尺寸的 `apple-touch-startup-image`

---

## 環境變數

| Key | 用途 | 取得位置 |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Web API Key | Firebase Console → 專案設定 → 一般 → Web API 金鑰 |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth 網域 | Firebase Console → 專案設定 |
| `VITE_FIREBASE_PROJECT_ID` | Firebase 專案 ID（`tripmori-74a18`） | Firebase Console → 專案設定 |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket URL | Firebase Console → 專案設定 |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID | Firebase Console → 專案設定 |
| `VITE_FIREBASE_APP_ID` | Firebase App ID | Firebase Console → 專案設定 |
| `VITE_FIREBASE_VAPID_KEY` | Web Push VAPID 公鑰 | Firebase Console → Cloud Messaging → Web 設定 |

Cloud Functions secret（透過 `defineSecret`）：
| Secret | 用途 | 取得位置 |
|---|---|---|
| `NOTION_API_KEY` | Notion 備份 API 金鑰 | Notion Developer → Integration token |

---

## 部署流程

- **Firebase 專案 ID**：`tripmori-74a18`
- **Vercel 專案**：`tripmori`（team: `yunas-projects-1e3cc29c`）→ https://vercel.com/yunas-projects-1e3cc29c/tripmori
- **Production domain**：`tripmori.vercel.app`（從 functions 圖示 URL 反推）
- **Preview 觸發**：PR 自動產生 Vercel preview，push `main` 觸發 production deploy
- **Vercel 環境變數**：Vercel Dashboard → 專案 → Settings → Environment Variables，需設所有 `VITE_*` 變數
- **Cache 策略**（`vercel.json`）：
  - `/index.html`：`no-cache`（永不快取，確保 SW 更新）
  - `/assets/*`：`max-age=31536000, immutable`（永久快取，hash 命名）
- **Cloud Functions 部署**：`firebase deploy --only functions`（需在 `functions/` 目錄安裝依賴）

---

## 架構決策與慣例

- **無路由 library**：頁面切換靠 `App.tsx` 的 `activeTab` state + `BottomNav` 點擊，不用 react-router
- **共用 style 常數集中在 App.tsx**：`C`（顏色）、`FONT`、`cardStyle`、`inputStyle`、`btnPrimary` 從 App.tsx import，不放 CSS module
- **CSS 變數用於 dark mode**：所有主題色透過 `index.css` 的 CSS 變數（`--tm-*`）控制，dark mode 在 `[data-theme="dark"]` selector 覆寫
- **Inline style 優先於 Tailwind**：大部分元件使用 React inline style；Tailwind 僅用於少數 utility class
- **FontAwesome 替代 emoji**：所有 icon 一律用 FontAwesome（`@fortawesome/free-solid-svg-icons`），不用 emoji 做 icon
- **Firestore 直接在元件內 subscribe**：大部分 onSnapshot 直接寫在 `App.tsx` 的 useEffect，data 透過 props 傳遞，不用 Context 或 Zustand
- **多行程支援**：`ProjectHub` 頁管理 localStorage 內的行程清單，`App.tsx` 讀取 active tripId
- **訪客模式**：知道 tripId（secret link）即可用匿名 auth 瀏覽，但無法寫入
- **圖片壓縮**：上傳前用 `browser-image-compression` 壓縮，避免 Storage 費用過高
- **不要引入**：Redux、react-router、MUI、Ant Design（風格不符）

---

## 目前進度

最近完成的 commit 摘要（以 `git log --oneline` 為準，此處僅列里程碑）：

1. `9616f95` — PWA splash 改用 inline HTML 確保可靠性，新增 iPhone 16 Pro 尺寸
2. `b068186` — PWA icon 與 splash 支援 iOS dark / tinted 模式（light/dark/mono icon 三版本）
3. `a2eeb32` — 修正訪客打包清單：所有項目永遠顯示且未勾選
4. `5dcefce` — 修正四個訪客 / UI bug（日記白畫面、航班刪除位置、打包可見性、頭像排序）
5. `f4bc49f / ad34ded` — Merge 系列：E2E 測試、Notion 備份、dark mode 對比修正

---

## 下一步

（基於 commit history 與功能狀態推斷，需人工確認優先序）

1. **驗證 Notion 備份功能**：`backupTripToNotion` Cloud Function 經多次修正（chunking、sort），確認在 production 成功執行並寫入正確格式
2. **E2E 測試補全**：`e2e/` 目錄已有 Playwright 設定，檢查哪些頁面/流程缺少覆蓋
3. **PWA install prompt**：`f4bc49f` 提到 PWA install button 遷移到 FontAwesome，確認 install prompt UX 在 Android Chrome 完整可用
4. **排程通知測試**：`preFlightReminder` 和 `todoDueDateReminder` 是 scheduled function，確認在 production 環境的觸發時間設定正確
5. **Vercel project.json 補齊**：執行 `vercel link --project tripmori` 連結本地專案（team: `yunas-projects-1e3cc29c`），產生 `.vercel/project.json` 以便 CLI 部署

---

## 已知問題與技術債

（掃描 `src/` 和 `functions/` 全部 TODO/FIXME/HACK 結果：**無發現任何 TODO/FIXME/HACK 標記**）

- `App.tsx` 過大：幾乎所有 Firestore 訂閱與頁面狀態集中在此，未來若功能再增應考慮拆分成 Context 或 custom hooks
- `TRIP_ID` 硬編碼在 `App.tsx`（`export const TRIP_ID = "74pfE7RXyEIusEdRV0rZ"`）作為 fallback，需確認 ProjectHub 邏輯完整覆蓋後可移除

---

## 對話開場模板

```
請先讀 CLAUDE.md 與最近 5 筆 commit（git log --oneline -5），
用三句話告訴我你理解的專案狀態與下一步建議。
```
