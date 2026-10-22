# CLAUDE.md — TripMori 專案長期記憶

> 最後更新：2026-10-22

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
| `estimateTravel` | HTTPS Callable | 行程點到點交通時間（Google Directions API，含**真實大眾運輸**）；需 secret `GOOGLE_MAPS_API_KEY`，未設定時 throw `failed-precondition`，前端自動退回 OSRM／直線距離概估 |
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
| `GOOGLE_MAPS_API_KEY` | 交通時間路由（`estimateTravel`）| GCP Console → 啟用 **Directions API** + 綁定帳單 → API 金鑰；設定：`firebase functions:secrets:set GOOGLE_MAPS_API_KEY` |

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
- **狀態列 theme-color 必須對齊頂部條**：`index.html` 的 `theme-color`（iOS standalone 狀態列底色）必須等於 App 最上方專案標題列顏色（`var(--tm-cream)`：light `#F7F4EB` / dark `#242118`），否則狀態列會浮出一條較淡色帶（「霧化」）。改 `--tm-cream` 時務必同步改 `index.html`
- **點到點交通估算（Schedule `calcTravelTime`）**：三層 fallback — ① Cloud Function `estimateTravel`（Google Directions，真實大眾運輸）② 免費 OSRM demo（`router.project-osrm.org`，transit 以開車 ×1.35 近似）③ 直線距離概估（Haversine×道路係數÷各模式均速，顯示「（概估）」）；地理編碼走 Nominatim / Open-Meteo / Photon 多重 fallback
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
| 現金／刷卡篩選 | `payMethodFilter: 'all' \| 'cash' \| 'card'`；頂部金額卡顯示 `methodTotals.cash/card`（排除收入與結清、用 `effectiveTWD`），點擊即切換 list 篩選；結清記錄不受此篩選影響 |

### Help / FAQ（ProjectHub）

- `HELP_DISMISSED_KEY = 'tripmori_help_dismissed_at'`：7 天後自動重新顯示 help banner
- `helpView: 'faq' | 'about'`：控制 help modal 顯示 FAQ 或製作理念
- Notion 備份按鈕僅對 `googleEmail === 'yunaaac96@gmail.com'` 顯示（Members 頁）

---

## 目前進度

- **當前分支**：`main`
- **工作區狀態**：有未 commit 變更（混合兩批，commit 前需釐清）
  - **本次 session（三大優化，已 typecheck 通過）**：
    - `functions/src/index.ts` — 新增 `estimateTravel` callable + `GOOGLE_MAPS_API_KEY` secret
    - `src/pages/Schedule/index.tsx` — 交通時間三層 fallback（CF → OSRM → 直線概估）
    - `src/pages/Expense/index.tsx` — 現金／刷卡篩選 + 頂部金額卡分項統計
    - `index.html` + `src/components/layout/PageHeader.tsx` — 深色 theme-color 對齊頂部條（修霧化）+ 副標題不透明度調高
  - **先前已存在、非本次修改的未 commit 檔**：`src/App.tsx`、`src/pages/Bookings|Journal|Members|Planning/index.tsx`、未追蹤 `scripts/settle-okinawa-expenses.mjs`（commit 前請先確認這批是否要保留）

### 本 session 完成的三大優化

1. **交通時間可靠度**：原本只用公開 demo OSRM（常限流/CORS 失敗就報錯）。改為 `estimateTravel` Cloud Function 走 Google Directions（真實大眾運輸）優先，失敗退 OSRM，再失敗用 Haversine 直線距離概估 → 幾乎必定給得出數字
2. **記帳現金／刷卡**：新增 `payMethodFilter`，頂部金額卡顯示現金/刷卡各自實付台幣並可點擊切換 list 篩選
3. **標題列霧化**：深色 `theme-color` 由 `#3A5A3A` 改為 `#242118`（對齊頂部條 `--tm-cream`），消除狀態列色帶

### 最近 5 筆 commit

```
f3791cb feat(offline): background pre-cache ALL trips, not just the opened one
57931f2 feat(offline): localStorage backup of trip data — survives iOS cache eviction
4e9feb3 fix(offline): don't let auth restore block cache-backed subscriptions
2f57503 fix(offline): switch Schedule + Bookings on-mount reads to onSnapshot
57add3b style(members): replace U+2194 arrow with FontAwesome in couple-pair list
```

---

## 下一步

1. **設定 `GOOGLE_MAPS_API_KEY`**：`firebase functions:secrets:set GOOGLE_MAPS_API_KEY` 並在 GCP 啟用 Directions API + 帳單，然後 `firebase deploy --only functions`。未設定前交通功能仍可用（走 OSRM／概估）
2. **釐清並 commit 未 commit 變更**：先區分本次 session 三大優化與先前已存在的 `App.tsx`/各 page 變更，分批 commit
3. **驗證三項優化**：交通（各模式、含海外地點）、記帳現金/刷卡金額正確、深淺色標題列在 iPhone standalone 無色帶
4. **連結 .vercel/project.json**：`vercel link --project tripmori`（team: `yunas-projects-1e3cc29c`）
5. **E2E 測試補全**：`e2e/` 8 個 spec，補上交通 fallback 與記帳付款方式篩選的覆蓋

---

## 已知問題與技術債

**grep 全域掃描：src/ 與 functions/ 中無任何 TODO / FIXME / HACK 標記**

- `App.tsx` 過大：所有 Firestore 訂閱集中在此，未來若功能繼續增加應考慮拆分成 Context 或 custom hooks
- `TRIP_ID = "74pfE7RXyEIusEdRV0rZ"` 仍硬編碼在 `App.tsx` 作為 fallback，待 ProjectHub 邏輯完整驗證後可移除
- `.vercel/project.json` 不存在，CLI 部署需手動執行 `vercel link --project tripmori`（team: `yunas-projects-1e3cc29c`）
- **交通 OSRM/地理編碼仍依賴公開 demo server**：`estimateTravel` 未設金鑰時才會落到這層；長期建議設定金鑰以取得穩定與真實大眾運輸
- **`transit` 在無金鑰時非真實路線**：OSRM 以開車時間 ×1.35 近似，僅供參考

---

## 對話開場模板

```
請先讀 CLAUDE.md 與最近 5 筆 commit（git log --oneline -5），
用三句話告訴我你理解的專案狀態與下一步建議。
```
