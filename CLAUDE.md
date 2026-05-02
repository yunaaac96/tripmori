# CLAUDE.md — TripMori 專案長期記憶

> 最後更新：2026-05-02

---

## 專案定位

TripMori 是一個行動優先的 PWA 旅遊手帳，給多人結伴旅行的小組使用，解決行程規劃、費用分攤、日記共筆、待辦清單的協作問題，不需要安裝 app 即可使用。

---

## 技術棧

- **框架**：Vite 5.1 + React 18.2 + TypeScript 5.2
- **UI / 樣式**：Tailwind CSS 3.4 + React inline style（`App.tsx` 匯出共用 style 常數）；FontAwesome 6.5（`@fortawesome/react-fontawesome`）
- **狀態管理**：無外部狀態庫，全部使用 React useState / useEffect + Firestore onSnapshot
- **資料庫**：Firestore v10（persistent offline cache，多 tab 模式，experimentalAutoDetectLongPolling）
- **認證**：Firebase Auth — Google Sign-In + 匿名登入（訪客瀏覽）
- **檔案儲存**：Firebase Storage（頭像、日記圖片上傳，使用 `browser-image-compression` 2.0）
- **推播**：FCM（Firebase Cloud Messaging）— 已完整實作，含 service worker 背景通知
- **Cloud Functions**：Firebase Functions v2（Node 20）
- **PWA**：`vite-plugin-pwa` 0.19（`injectManifest` 策略，Workbox）
- **測試**：Vitest 4.1（單元）、Playwright 1.59（E2E）
- **部署**：Vercel（前端）+ Firebase（Firestore / Functions / Storage）
- **Node 版本**：無 `.nvmrc`；Cloud Functions 鎖定 Node 20；本機開發實際使用 v24

---

## 資料夾結構

```
/
├── src/
│   ├── App.tsx              # 應用程式根元件，含共用 style 常數（C、FONT、cardStyle 等）與路由、所有 Firestore 訂閱
│   ├── main.tsx             # Vite 入口
│   ├── sw.ts                # Service Worker（Workbox + FCM 背景訊息）
│   ├── index.css            # CSS 變數（dark mode、主題色 --tm-*）
│   ├── config/
│   │   └── firebase.ts      # Firebase 初始化（Firestore、Auth、Storage、Messaging）
│   ├── pages/
│   │   ├── Schedule/        # 行程頁（每日事件 CRUD）
│   │   ├── Bookings/        # 靜態訂票（機票、飯店、租車）
│   │   ├── Expense/         # 費用分攤（記帳、結算、代錄、收入、退款）← 最複雜
│   │   ├── Journal/         # 旅遊日記（圖片、reactions、留言）
│   │   ├── Planning/        # 待辦 / 打包清單
│   │   ├── Members/         # 成員管理（頭像、FCM、角色、Notion 備份）
│   │   └── ProjectHub/      # 多行程管理（建立 / 切換行程、角色、FAQ help modal）
│   ├── components/
│   │   ├── layout/
│   │   │   ├── BottomNav.tsx
│   │   │   └── PageHeader.tsx
│   │   ├── OnboardingModal.tsx  # 首次使用引導流程
│   │   ├── SplashScreen.tsx
│   │   ├── CropModal.tsx
│   │   ├── CurrencyPicker.tsx
│   │   ├── CurrencySearch.tsx
│   │   └── DateRangePicker.tsx
│   ├── hooks/
│   │   ├── useAuth.ts        # Google UID hook
│   │   └── useFcm.ts         # FCM token 取得、權限請求、token 存至 Firestore
│   └── utils/
│       ├── expenseCalc.ts    # 費用分攤計算邏輯（含 Vitest 測試）
│       ├── expenseCalc.test.ts
│       ├── helpers.ts        # 通用輔助函式（avatarTextColor 等）
│       ├── onboarding.ts     # 首次使用引導狀態管理（/users/{uid} Firestore doc）
│       └── universalImporter.ts  # 行程匯入邏輯
├── functions/
│   └── src/index.ts         # 所有 Cloud Functions
├── public/
│   ├── icons/               # PWA 圖示（light/dark/maskable/mono × 192/512）
│   ├── notion-cover.svg     # Notion 備份頁封面圖（深藍→海灣綠漸層）
│   ├── manifest.json        # PWA manifest
│   └── firebase-messaging-sw.js  # FCM SW 佔位（實際 SW 由 vite-plugin-pwa 產出）
├── e2e/                     # Playwright E2E 測試（8 個 spec 檔案）
├── scripts/
│   ├── gen-app-icons.mjs    # 產生 PWA 圖示
│   ├── checkPackingItems.mjs
│   └── cleanTestData.mjs
├── firebase.json
├── firestore.rules
├── firestore.indexes.json   # 目前無自訂複合索引
├── vercel.json
└── vite.config.ts
```

---

## Firebase 架構

### 使用的服務
- Firestore（主要資料庫，offline persistence，多 tab）
- Firebase Auth（Google + anonymous）
- Firebase Storage（日記圖片、頭像）
- Firebase Cloud Messaging（push 通知）
- Cloud Functions v2

### Firestore Collection 結構

根 collection：`trips/{tripId}`

| Sub-collection | 主要欄位 |
|---|---|
| `events` | title, date, time, category, notes, location, cost ⚠️ |
| `bookings` | type(flight/hotel/car), 各類訂票欄位 |
| `members` | name, role, color, avatarUrl, googleUid, googleEmail, fcmTokens[], fcmTokensStandalone[], createdAt |
| `lists` | type(packing/todo), items[], dueDate, assignee |
| `journals` | date, content, images[], authorName, reactions |
| `journalComments` | journalId, authorName, content, createdAt |
| `memberNotes` | fromName, toName, content, createdAt |
| `notifications` | recipientName, title, body, tag, createdAt |
| `proxyGrants` | key = principalUid；`proxyUids[]` 為被授權代錄者 UID |
| `expenses` | amount, currency, amountTWD, payer, splitWith[], splitMode, customAmounts, isPrivate, privateOwnerUid, loggedByUid, loggedByName, isIncome, awaitCardStatement, actualTWD, linkedExpenseId, category, paymentMethod, cardFeePercent, exchangeRate, status, expenseRef |

根文件 `trips/{tripId}`：`ownerUid`（行程擁有者 Google UID）, `ownerEmail`（legacy fallback）, `allowedEditorUids[]`, `collaboratorKey`, `editorInfo{uid: {email, joinedAt}}` ⚠️

額外根 collection：`users/{uid}`（`onboardingCreator`, `onboardingInvitee` boolean）

### Security Rules 核心邏輯

- 任何已登入（含匿名）用戶可 read 大部分 sub-collection；**write 需 Google 帳號 + owner 或 editor**
- `expenses`：**匿名用戶無法 list**（Google-authed only）；private 費用 get/write 限本人或授權 proxy
- `proxyGrants`：只有 principal 本人或 owner 可寫；editor 可讀
- `users/{uid}`：只有本人可讀寫（Google-authed only）
- Owner 判斷：`ownerUid` 相符，或 legacy fallback 比對 `ownerEmail`

### Cloud Functions（functions/src/index.ts）

| Function | 觸發方式 | 用途 |
|---|---|---|
| `onJournalCommentCreated` | Firestore onCreate | 新留言時 FCM 通知日記作者 |
| `onJournalReactionUpdated` | Firestore onUpdate | 新增 reaction 時通知作者 |
| `onMemberNoteCreated` | Firestore onCreate | 貼紙便條通知收件成員 |
| `onSettlementPending` | Firestore onCreate | 結清申請通知債主確認 |
| `onProxyExpenseRecorded` | Firestore onCreate | 代錄費用完成通知被代錄人 |
| `onProxyGrantChanged` | Firestore onWritten | 代錄授權變更通知 |
| `pruneOldNotifications` | Scheduled | 清除 30 天以上的通知記錄 |
| `preFlightReminder` | Scheduled | 航班前推播提醒 |
| `todoDueDateReminder` | Scheduled | Todo 到期前推播提醒 |
| `addEditor` | HTTPS Callable | 以 email 新增行程編輯者 |
| `claimOwnership` | HTTPS Callable | 認領行程 ownership |
| `backupTripToNotion` | HTTPS Callable | 將行程資料備份至 Notion（**UI 限 googleEmail === 'yunaaac96@gmail.com'** 顯示按鈕） |

---

## PWA 相關設定

- **manifest display**：`standalone`，`start_url`: `/`，`theme_color`: `#6B7C58`，`background_color`: `#F7F4EB`
- **icons**：192/512 × any/maskable/monochrome，light/dark 兩套（共 8 個 PNG）
- **Service Worker 策略**：`injectManifest`（手寫 `src/sw.ts`）
  - 所有跨域請求（Firebase、Google API）：`NetworkOnly`，避免 Firestore streaming 被攔截
  - App shell：Workbox `precacheAndRoute`（globPatterns: `**/*.{js,css,html,ico,png,svg}`）
  - SPA navigation fallback：`NavigationRoute` → `/index.html`
  - `skipWaiting` + `clients.claim`：新版 SW 立即接管，避免舊版 cache 造成 404
- **Push Notification**：完整實作（FCM data-only 訊息 + Cloud Functions + `useFcm` hook + `onBackgroundMessage`）
  - iOS 和 Android 均需加到主畫面（standalone 模式）才能收到通知
  - `useFcm`：passive hook，只在 permission 已 granted 時刷新 token
  - `enableFcmForMember()`：active，從 button 點擊觸發，請求通知權限
  - Standalone token 另存 `fcmTokensStandalone[]` 供 Cloud Functions 優先使用
- **Offline 行為**：Firestore persistent cache 支援離線讀取；新寫入在重連後自動同步
- **iOS Splash Screen**：`index.html` inline HTML（`<style>` + `<div>`），涵蓋 iPhone SE 到 iPhone 16 Pro Max

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

> `.env.local` 和 `.env.example` 均不存在；所有 `VITE_*` 值設在 Vercel Dashboard → Settings → Environment Variables。

---

## 部署流程

- **Firebase 專案 ID**：`tripmori-74a18`（`.firebaserc`）
- **Vercel 專案**：名稱 `tripmori`，team：`yunas-projects-1e3cc29c`（`.vercel/project.json` 不存在，需執行 `vercel link --project tripmori` 產生）
- **Production domain**：`tripmori.vercel.app`
- **Preview 觸發**：PR 自動產生 Vercel preview；push `main` 觸發 production deploy
- **Vercel 環境變數**：Vercel Dashboard → 專案 → Settings → Environment Variables
- **Cache 策略**（`vercel.json`）：
  - `/index.html`：`no-cache, no-store, must-revalidate`（確保 SW 更新）
  - `/assets/*`：`public, max-age=31536000, immutable`（hash 命名，永久快取）
  - 全域：`Cross-Origin-Opener-Policy: same-origin-allow-popups`（Google Sign-In popup 需要）
- **Cloud Functions 部署**：在 `functions/` 執行 `npm install` 後 `firebase deploy --only functions`

---

## 架構決策與慣例

- **無路由 library**：頁面切換靠 `App.tsx` 的 `activeTab` state + `BottomNav` 點擊，不用 react-router
- **共用 style 常數集中在 App.tsx**：`C`（顏色 CSS 變數）、`FONT`、`cardStyle`、`inputStyle`、`btnPrimary` 從 App.tsx import
- **CSS 變數 dark mode**：主題色透過 `index.css` 的 `--tm-*` 變數控制，dark mode 用 `[data-theme="dark"]` 覆寫
- **Inline style 優先**：大部分元件使用 React inline style；Tailwind 僅用於少數 utility class
- **FontAwesome 替代 emoji icon**：所有 icon 用 `@fortawesome/free-solid-svg-icons`，不用 emoji
- **Firestore 直接在元件內 subscribe**：所有 onSnapshot 在 `App.tsx` 的 useEffect，data 透過 props 傳遞
- **多行程支援**：`ProjectHub` 管理 localStorage 內的行程清單，`App.tsx` 讀取 active tripId
- **訪客模式**：匿名 auth 可瀏覽（知道 tripId），Expense 等頁面在 isReadOnly 時顯示 skeleton blur overlay；匿名用戶無法存取 expenses collection
- **圖片壓縮**：上傳前用 `browser-image-compression` 壓縮，避免 Storage 費用過高
- **Onboarding**：首次使用流程儲存至 `/users/{uid}` Firestore doc（`onboardingCreator` / `onboardingInvitee`）
- **TRIP_ID fallback**：`App.tsx` 有 `export const TRIP_ID = "74pfE7RXyEIusEdRV0rZ"` 作為 fallback，實際由 ProjectHub 動態決定
- **禁止引入**：Redux、react-router、MUI、Ant Design

### 費用分攤系統（Expense page）特殊慣例

| 功能 | 重點 |
|---|---|
| 結算公式 | `computeMemberStats`（expenseCalc.ts）排除 `awaitCardStatement` 和 pending settlement |
| 已結清 badge | `getSettlementBadge()`；收入（isIncome）和 awaitCard 費用**不顯示**已結清/已收回 badge |
| `canEditExpense` | 收入費用僅 owner/editor 可編輯；已結清費用鎖定（awaitCard 除外） |
| `canDeleteExpense` | 收入費用僅 owner/editor 可刪；已結清費用鎖定 |
| `canEditDescOnly` | 已結清一般費用仍可修改名稱/日期/備註；收入費用不開放此模式 |
| 代錄（proxy） | `proxyGrants` sub-collection 控制授權；代錄者可編輯/刪除自己代錄的帳目（非 private 路徑也適用） |
| 等卡單 | `awaitCardStatement: true`；暫不納入結算；`補實際金額` 按鈕僅 payer 本人可用 |
| 退款記錄 | `linkedExpenseId`：已結清費用點「↩ 建立退款」→ 預填收入表單；原費用顯示「已有退款記錄」 |
| 結清這筆 button | `settlements.length === 0 && confirmedAmountsMap.size > 0` 時不顯示（整趟已結清）；`myShare <= 0` 時不顯示 |
| 隱藏收還款記錄 | `hideSettled` toggle 開啟 → 隱藏 `category=settlement` 的記錄，不影響一般費用 |

### Help / FAQ（ProjectHub）

- `HELP_DISMISSED_KEY = 'tripmori_help_dismissed_at'`：7 天後自動重新顯示 help banner
- `helpView: 'faq' | 'about'`：控制 help modal 顯示 FAQ 或製作理念
- Notion 備份按鈕僅對 `googleEmail === 'yunaaac96@gmail.com'` 顯示（Members 頁）

---

## 目前進度

- **當前分支**：`claude/clever-bhabha-767a14`
- **工作區狀態**：有未 commit 變更
  - `src/pages/Expense/index.tsx`（本 session 多項功能修正，尚未 commit）

### 本 session 完成的主要修正（未 commit）

1. **收入費用權限**：`canEdit/Delete/DescOnly` 限 owner/editor；不顯示已結清 badge
2. **建立退款（方案 B）**：已結清費用顯示 ↩ 退款按鈕，預填收入表單並記錄 `linkedExpenseId`；退款來源顯示
3. **結清這筆 button**：修正整趟旅行透過最少轉帳算法結清後仍顯示的問題；`myShare <= 0` 防衛
4. **隱藏收還款記錄 toggle**：修正邏輯反向 bug（現正確隱藏 settlement records）
5. **補實際金額 button**：確認僅 payer 本人可操作（移除錯誤的 isOwner bypass）
6. **代錄編輯/刪除**：`loggedByUid` 檢查已延伸至非 private 費用路徑
7. **desc-only 編輯模式**：已結清費用可修改說明/日期/備註，金融欄鎖定
8. **awaitCardStatement 衝突修正**：加 `&& !e.awaitCardStatement` 防衛避免錯誤鎖定

### 最近 5 筆 commit

```
2c9a737 fix: 關於 TripMori mini-link opens about view, not FAQ
417e9a1 fix: awaitCardStatement expenses must not show 已結清 or be edit-locked
95f80f4 feat: proxy edit/delete fix, settled desc-only edit, awaitCard bypass, help banner dismiss
0c64fcf fix: update in-app FAQ — rephrase Q1 and fix push notification Q2
faf1407 chore: restrict Notion backup to owner email + add brand gradient cover
```

---

## 下一步

1. **Commit 本 session 的 Expense 修正**：`src/pages/Expense/index.tsx` 有大量未 commit 變更，應先整理成一或多個 commit
2. **驗證結清 button 消失邏輯**：在 production 確認整趟旅行結清後「結清這筆」確實消失（含最少轉帳路由案例）
3. **確認 Klook 退款顯示已正確**：`收入` 費用現在不顯示已結清 badge，確認解決截圖中誤顯問題
4. **連結 .vercel/project.json**：在專案根目錄執行 `vercel link --project tripmori`（team: `yunas-projects-1e3cc29c`）產生 `.vercel/project.json`，之後 `vercel deploy` 才能正確指向正確專案
5. **E2E 測試補全**：`e2e/` 有 8 個 spec，確認 expense 相關新功能（代錄、退款、desc-only、收入限權）有測試覆蓋

---

## 已知問題與技術債

**grep 全域掃描：src/ 與 functions/ 中無任何 TODO / FIXME / HACK 標記**

- `App.tsx` 過大：所有 Firestore 訂閱集中在此，未來若功能繼續增加應考慮拆分成 Context 或 custom hooks
- `TRIP_ID = "74pfE7RXyEIusEdRV0rZ"` 仍硬編碼在 `App.tsx` 作為 fallback，待 ProjectHub 邏輯完整驗證後可移除
- `.vercel/project.json` 不存在，CLI 部署需手動執行 `vercel link --project tripmori`（team: `yunas-projects-1e3cc29c`）

---

## 對話開場模板

```
請先讀 CLAUDE.md 與最近 5 筆 commit（git log --oneline -5），
用三句話告訴我你理解的專案狀態與下一步建議。
```
