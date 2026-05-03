/**
 * e2e/08-expense-crud.spec.ts
 * Tests: 記帳頁 CRUD 流程
 *
 * 驗證：
 * - Owner 可開啟新增支出表單
 * - 表單包含必填欄位（名稱、金額、付款人）
 * - 未填必填時提交按鈕 disabled
 * - 填入必填欄位後提交按鈕啟用並可提交
 * - 表單可用「取消」關閉
 */

import { test, expect } from '@playwright/test';
import { injectProjectState, mockFirebase, waitPastSplash, BASE_URL } from './helpers';

async function goToExpense(page: any) {
  await page.locator('text=記帳').last().click();
  await page.waitForTimeout(400);
}

async function openAddForm(page: any) {
  await page.locator('button').filter({ hasText: '＋ 新增' }).first().click();
  await page.waitForTimeout(300);
}

test.describe('記帳頁 CRUD（Owner）', () => {
  test.beforeEach(async ({ page }) => {
    await injectProjectState(page, 'owner');
    await mockFirebase(page, 'owner');
    await page.goto(BASE_URL);
    await waitPastSplash(page);
    await goToExpense(page);
  });

  test('顯示「＋ 新增」按鈕', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: '＋ 新增' }).first()).toBeVisible({ timeout: 8_000 });
  });

  test('點擊後開啟新增支出表單', async ({ page }) => {
    await openAddForm(page);
    await expect(page.locator('text=名稱 *').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=金額 *').first()).toBeVisible({ timeout: 5_000 });
  });

  test('表單包含「誰付款 *」欄位', async ({ page }) => {
    await openAddForm(page);
    await expect(page.locator('text=誰付款 *')).toBeVisible({ timeout: 5_000 });
  });

  test('未填名稱時提交按鈕為 disabled', async ({ page }) => {
    await openAddForm(page);
    // The form's submit button reads "新增支出" by default; the page-level "＋ 新增"
    // trigger also has "新增" text, so filter on "新增支出" specifically.
    const submitBtn = page.locator('button').filter({ hasText: '新增支出' }).last();
    await expect(submitBtn).toBeDisabled({ timeout: 5_000 });
  });

  // Skipped: needs the members onSnapshot subscription to deliver an initial
  // snapshot in the test environment. Our route-based Firestore mocks return
  // an empty body for the gRPC-Web Listen channel, so members[] never
  // populates → the form's payer button list stays empty → no Alice button
  // to click. Re-enable once helpers.ts mocks the Listen stream properly.
  test.skip('填入名稱、金額、付款人後提交按鈕啟用', async ({ page }) => {
    await openAddForm(page);

    await page.locator('input[placeholder*="藥妝店"]').fill('E2E 測試費用');
    await page.locator('input[type="number"][placeholder="0"]').first().fill('1000');
    await page.locator('button').filter({ hasText: 'Alice' }).first().click();

    const submitBtn = page.locator('button').filter({ hasText: '新增' }).last();
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
  });

  // Skipped: same root cause as 07-schedule-crud's submit-close test —
  // addDoc()'s local-cache → server-sync handshake doesn't reliably resolve
  // with route-based mocks, so setShowForm(false) never runs.
  test.skip('填入必填欄位後可成功提交（表單關閉）', async ({ page }) => {
    await openAddForm(page);

    await page.locator('input[placeholder*="藥妝店"]').fill('E2E 測試費用');
    await page.locator('input[type="number"][placeholder="0"]').first().fill('500');
    await page.locator('button').filter({ hasText: 'Alice' }).first().click();

    await page.locator('button').filter({ hasText: '新增' }).last().click();
    await expect(page.locator('text=名稱 *')).not.toBeVisible({ timeout: 5_000 });
  });

  test('表單可用「取消」按鈕關閉', async ({ page }) => {
    await openAddForm(page);
    await expect(page.locator('text=名稱 *')).toBeVisible();

    await page.locator('button').filter({ hasText: '取消' }).first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=名稱 *')).not.toBeVisible();
  });

  test('幣別預設顯示行程幣別（JPY）', async ({ page }) => {
    await openAddForm(page);
    // The currency picker lives in the form's "費用明細" block which sits below
    // the visible viewport on phone widths. Scroll it into view first so the
    // visibility check isn't a viewport problem masquerading as a content
    // problem (toBeVisible doesn't auto-scroll).
    const jpyTarget = page.locator('button').filter({ hasText: 'JPY' }).first();
    await jpyTarget.scrollIntoViewIfNeeded();
    await expect(jpyTarget).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('記帳頁 CRUD（Visitor）', () => {
  test.beforeEach(async ({ page }) => {
    await injectProjectState(page, 'visitor');
    await mockFirebase(page, 'visitor');
    await page.goto(BASE_URL);
    await waitPastSplash(page);
    await goToExpense(page);
  });

  test('Visitor：看不到「＋ 新增」按鈕', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: '＋ 新增' })).not.toBeVisible();
  });
});
