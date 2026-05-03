/**
 * e2e/07-schedule-crud.spec.ts
 * Tests: 行程頁 CRUD 流程
 *
 * 驗證：
 * - Owner 可開啟新增行程表單
 * - 表單包含必填欄位（行程名稱、開始時間）
 * - 填入必填欄位後提交按鈕啟用
 * - 表單可用 ✕ 關閉
 * - Visitor 無法看到新增按鈕
 */

import { test, expect } from '@playwright/test';
import { injectProjectState, mockFirebase, waitPastSplash, BASE_URL } from './helpers';

async function goToSchedule(page: any) {
  await page.locator('text=行程').last().click();
  await page.waitForTimeout(400);
}

test.describe('行程頁 CRUD（Owner）', () => {
  test.beforeEach(async ({ page }) => {
    await injectProjectState(page, 'owner');
    await mockFirebase(page, 'owner');
    await page.goto(BASE_URL);
    await waitPastSplash(page);
    await goToSchedule(page);
  });

  test('顯示「＋ 新增第一筆行程」按鈕（空日）', async ({ page }) => {
    await expect(
      page.locator('text=＋ 新增第一筆行程').or(page.locator('text=＋ 繼續新增行程')).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('點擊後開啟新增行程表單', async ({ page }) => {
    const addBtn = page.locator('text=＋ 新增第一筆行程').or(page.locator('text=＋ 繼續新增行程')).first();
    await addBtn.click();
    await expect(page.locator('text=新增行程').first()).toBeVisible({ timeout: 5_000 });
  });

  test('新增表單包含「行程名稱 *」欄位', async ({ page }) => {
    const addBtn = page.locator('text=＋ 新增第一筆行程').or(page.locator('text=＋ 繼續新增行程')).first();
    await addBtn.click();
    await expect(page.locator('text=行程名稱 *')).toBeVisible({ timeout: 5_000 });
  });

  test('新增表單包含「開始時間 *」欄位', async ({ page }) => {
    const addBtn = page.locator('text=＋ 新增第一筆行程').or(page.locator('text=＋ 繼續新增行程')).first();
    await addBtn.click();
    await expect(page.locator('text=開始時間 *')).toBeVisible({ timeout: 5_000 });
  });

  test('未填必填欄位時提交按鈕為 disabled', async ({ page }) => {
    const addBtn = page.locator('text=＋ 新增第一筆行程').or(page.locator('text=＋ 繼續新增行程')).first();
    await addBtn.click();
    await page.waitForTimeout(300);
    const submitBtn = page.locator('button').filter({ hasText: '✓ 新增' }).first();
    await expect(submitBtn).toBeDisabled({ timeout: 5_000 });
  });

  test('填入行程名稱與開始時間後提交按鈕啟用', async ({ page }) => {
    const addBtn = page.locator('text=＋ 新增第一筆行程').or(page.locator('text=＋ 繼續新增行程')).first();
    await addBtn.click();
    await page.waitForTimeout(300);

    // 填入行程名稱
    await page.locator('input[placeholder*="早午餐"]').fill('E2E 測試景點');
    // 填入開始時間
    await page.locator('input[type="time"]').first().fill('09:00');

    const submitBtn = page.locator('button').filter({ hasText: '✓ 新增' }).first();
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
  });

  test('表單可用 ✕ 按鈕關閉', async ({ page }) => {
    const addBtn = page.locator('text=＋ 新增第一筆行程').or(page.locator('text=＋ 繼續新增行程')).first();
    await addBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=行程名稱 *')).toBeVisible();

    await page.locator('button').filter({ hasText: '✕' }).first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=行程名稱 *')).not.toBeVisible();
  });

  // Skipped: needs Firestore SDK's addDoc() to resolve through local
  // persistence in the test environment so the form's `setMode('view')` can
  // run. Our route-based mocks intercept REST endpoints but the SDK's local-
  // cache → server-sync handshake involves gRPC-Web Listen channel framing
  // we don't fake. Re-enable once helpers.ts mocks the Listen stream
  // properly (or once we add `experimentalForceLongPolling` for test mode).
  test.skip('填入必填欄位後可成功提交（表單關閉）', async ({ page }) => {
    const addBtn = page.locator('text=＋ 新增第一筆行程').or(page.locator('text=＋ 繼續新增行程')).first();
    await addBtn.click();
    await page.waitForTimeout(300);

    await page.locator('input[placeholder*="早午餐"]').fill('E2E 測試景點');
    await page.locator('input[type="time"]').first().fill('10:00');

    await page.locator('button').filter({ hasText: '✓ 新增' }).first().click();
    await expect(page.locator('text=行程名稱 *')).not.toBeVisible({ timeout: 5_000 });
  });
});

test.describe('行程頁 CRUD（Visitor）', () => {
  test.beforeEach(async ({ page }) => {
    await injectProjectState(page, 'visitor');
    await mockFirebase(page, 'visitor');
    await page.goto(BASE_URL);
    await waitPastSplash(page);
    await goToSchedule(page);
  });

  test('Visitor：看不到「＋ 新增第一筆行程」按鈕', async ({ page }) => {
    await expect(page.locator('text=＋ 新增第一筆行程')).not.toBeVisible();
  });

  test('Visitor：看不到「＋ 繼續新增行程」按鈕', async ({ page }) => {
    await expect(page.locator('text=＋ 繼續新增行程')).not.toBeVisible();
  });
});
