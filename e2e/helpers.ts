/**
 * e2e/helpers.ts
 * Shared test utilities for TripMori E2E tests.
 *
 * Strategy:
 * - Inject localStorage to simulate known auth/project state
 * - Intercept Firestore REST requests to return controlled mock data
 * - All tests are fully offline-capable after mock setup
 */

import { Page, Route } from '@playwright/test';

// ── Constants ─────────────────────────────────────────────────────────────────
export const TRIP_ID   = '74pfE7RXyEIusEdRV0rZ';
export const PROJECT_ID = 'tripmori-74a18';
export const BASE_URL   = 'http://localhost:5173';

// ── Firestore URL patterns ────────────────────────────────────────────────────
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const FB_AUTH = 'https://identitytoolkit.googleapis.com';
const FB_SECURETOKEN = 'https://securetoken.googleapis.com';
const FB_FCMTOKEN = 'https://fcmregistrations.googleapis.com';

// ── Mock Firestore trip data ──────────────────────────────────────────────────
export const MOCK_TRIP = {
  title: 'E2E 測試旅行',
  emoji: '🧪',
  startDate: '2026-06-01',
  endDate: '2026-06-07',
  description: 'Playwright 自動化測試用行程',
  currency: 'JPY',
  memberOrder: ['Alice', 'Bob'],
};

export const MOCK_MEMBERS = [
  { id: 'member-alice', name: 'Alice', googleUid: 'uid-alice', googleEmail: 'alice@test.com' },
  { id: 'member-bob',   name: 'Bob',   googleUid: 'uid-bob',   googleEmail: 'bob@test.com' },
];

// ── Firestore document helpers ────────────────────────────────────────────────
function fsDoc(fields: Record<string, any>) {
  const toValue = (v: any): any => {
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'number') return { integerValue: String(v) };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
    if (v && typeof v === 'object') {
      return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, toValue(val)])) } };
    }
    return { nullValue: null };
  };
  return { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) };
}

function fsList(docs: { id: string; data: Record<string, any> }[], collectionPath: string) {
  return {
    documents: docs.map(d => ({
      name: `projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}/${d.id}`,
      ...fsDoc(d.data),
    })),
  };
}

// ── Project stored in localStorage ───────────────────────────────────────────
export type Role = 'owner' | 'editor' | 'visitor';

export function makeStoredProject(role: Role) {
  return {
    id: TRIP_ID,
    title: MOCK_TRIP.title,
    emoji: MOCK_TRIP.emoji,
    startDate: MOCK_TRIP.startDate,
    endDate: MOCK_TRIP.endDate,
    description: MOCK_TRIP.description,
    role,
  };
}

// ── Inject localStorage state ─────────────────────────────────────────────────
export async function injectProjectState(page: Page, role: Role, opts: { adminMode?: boolean } = {}) {
  const project = makeStoredProject(role);
  // Owner-role specs verify the full owner UX (admin-only actions like 編輯旅行設定
  // / 批次匯入 live behind the 管理 toggle). Default adminMode=true for owner so
  // those buttons render — individual tests that want to verify the locked state
  // can pass { adminMode: false }.
  const adminMode = opts.adminMode ?? (role === 'owner');
  await page.addInitScript((args) => {
    const { project, tripId, adminMode } = args;
    localStorage.setItem('tripmori_projects', JSON.stringify([project]));
    localStorage.setItem('tripmori_active_project', tripId);
    // Suppress splash "already imported" flag
    localStorage.setItem('tripmori_imported', '1');
    // Owner admin toggle (gates 編輯旅行設定 / 批次匯入 buttons + dangerous ops)
    if (adminMode) {
      sessionStorage.setItem('tm-admin', '1');
    } else {
      sessionStorage.removeItem('tm-admin');
    }
  }, { project, tripId: TRIP_ID, adminMode });
}

// ── Mock all Firebase/Firestore network calls ─────────────────────────────────
export async function mockFirebase(page: Page, role: Role = 'visitor') {
  const googleUid = role === 'owner' ? 'uid-alice' : role === 'editor' ? 'uid-bob' : 'uid-visitor';

  // Block FCM token registration (not needed for tests)
  await page.route(`${FB_FCMTOKEN}/**`, (route) => route.fulfill({ status: 200, body: '{}' }));

  // Mock Firebase Auth — anonymous sign-in
  await page.route(`${FB_AUTH}/**`, async (route: Route) => {
    const url = route.request().url();
    if (url.includes('signInAnonymously') || url.includes('signUp') || url.includes('token')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'identitytoolkit#SignupNewUserResponse',
          idToken: 'mock-id-token',
          localId: googleUid,
          refreshToken: 'mock-refresh-token',
          expiresIn: '3600',
          isNewUser: true,
        }),
      });
    }
    return route.fulfill({ status: 200, body: '{}' });
  });

  // Mock Secure Token (token refresh)
  await page.route(`${FB_SECURETOKEN}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 'mock-access-token', expires_in: '3600', token_type: 'Bearer' }),
    })
  );

  // Mock Firestore: trip document
  await page.route(`${FS_BASE}/trips/${TRIP_ID}?**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        name: `projects/${PROJECT_ID}/databases/(default)/documents/trips/${TRIP_ID}`,
        ...fsDoc({ ...MOCK_TRIP, ownerUid: 'uid-alice', collaboratorKey: 'COLLAB-TEST' }),
      }),
    })
  );

  // Mock Firestore: members collection
  await page.route(`${FS_BASE}/trips/${TRIP_ID}/members?**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fsList(
        MOCK_MEMBERS.map(m => ({ id: m.id, data: m })),
        `trips/${TRIP_ID}/members`
      )),
    })
  );

  // Mock Firestore: events, bookings, expenses, lists, journals, notifications (all empty)
  for (const col of ['events', 'bookings', 'expenses', 'lists', 'journals', 'journalComments', 'notifications']) {
    await page.route(`${FS_BASE}/trips/${TRIP_ID}/${col}?**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );
  }

  // Mock Firestore: Google Cloud Firestore streaming (listen) channel
  await page.route(`**/google.firestore.v1.Firestore/Listen/**`, (route) =>
    route.fulfill({ status: 200, body: '{}' })
  );

  // Catch-all for remaining Firestore calls
  await page.route(`${FS_BASE}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );
}

// ── Wait for splash to finish ─────────────────────────────────────────────────
// The splash waits for Firebase auth.authStateReady() + minimum 3s.
// With mocked auth this resolves quickly.
export async function waitPastSplash(page: Page) {
  // Wait for any post-splash indicator: visitor banner, bottom nav tabs, or ProjectHub
  await page.locator('.tm-visitor-banner')
    .or(page.locator('text=行程').last())
    .or(page.locator('text=開始規劃旅行'))
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 });
}
