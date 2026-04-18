/**
 * e2e/02-visitor-permissions.spec.ts
 * Tests: Visitor (read-only) 身分的 UI 稽核
 *
 * 驗證：
 * - 訪客看得到內容但沒有新增/編輯/刪除按鈕
 * - 訪客 banner 顯示
 * - 各頁籤正常切換
 */

import { test, expect } from '@playwright/test';
import { injectProjectState, mockFirebase, waitPastSplash, BASE_URL } from './helpers';

test.describe('Visitor 身分 UI', () => {
  test.beforeEach(async ({ page }) => {
    await injectProjectState(page, 'visitor');
    await mockFirebase(page, 'visitor');
    await page.goto(BASE_URL);
    await waitPastSplash(page);
  });

  test('顯示訪客唯讀 banner', async ({ page }) => {
    // 訪客 banner 包含分享連結說明
    const banner = page.locator('.tm-visitor-banner');
    await expect(banner).toBeVisible({ timeout: 10_000 });
  });

  test('底部導覽列顯示所有 6 個頁籤', async ({ page }) => {
    const tabs = ['行程', '預訂', '記帳', '日誌', '準備', '成員'];
    for (const tab of tabs) {
      await expect(page.locator(`text=${tab}`).last()).toBeVisible({ timeout: 8_000 });
    }
  });

  test('行程頁：不顯示「新增行程」按鈕', async ({ page }) => {
    // 行程頁已是預設 tab；visitor 不應看到 ＋ 新增按鈕
    await expect(page.locator('text=＋ 新增第一筆行程')).not.toBeVisible();
    await expect(page.locator('text=新增行程')).not.toBeVisible();
  });

  test('行程頁：不顯示「編輯旅行設定」按鈕', async ({ page }) => {
    await expect(page.locator('text=編輯旅行設定')).not.toBeVisible();
  });

  test('行程頁：不顯示「批次匯入」按鈕', async ({ page }) => {
    await expect(page.locator('text=批次匯入')).not.toBeVisible();
  });

  test('記帳頁：不顯示新增費用按鈕', async ({ page }) => {
    await page.locator('text=記帳').last().click();
    await page.waitForTimeout(500);
    // 訪客應看到 pie chart 但不能新增
    await expect(page.locator('text=新增費用')).not.toBeVisible();
    await expect(page.locator('text=＋').first()).not.toBeVisible();
  });

  test('記帳頁：顯示「訪客模式」說明', async ({ page }) => {
    await page.locator('text=記帳').last().click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=訪客').first()).toBeVisible({ timeout: 5_000 });
  });

  test('日誌頁：不顯示新增日誌按鈕', async ({ page }) => {
    await page.locator('text=日誌').last().click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=新增日誌')).not.toBeVisible();
  });

  test('準備頁：不顯示新增清單按鈕', async ({ page }) => {
    await page.locator('text=準備').last().click();
    await page.waitForTimeout(500);
    // 訪客看準備頁應看不到 ＋ 按鈕
    await expect(page.locator('text=新增待辦').or(page.locator('[aria-label="新增"]'))).not.toBeVisible();
  });

  test('預訂頁：確認碼/PIN 不顯示給訪客', async ({ page }) => {
    await page.locator('text=預訂').last().click();
    await page.waitForTimeout(500);
    // 訪客應看不到確認碼
    await expect(page.locator('text=確認碼')).not.toBeVisible();
    await expect(page.locator('text=PIN')).not.toBeVisible();
  });

  test('點擊頁籤可正常切換', async ({ page }) => {
    const tabSequence = ['預訂', '記帳', '日誌', '準備', '成員', '行程'];
    for (const tab of tabSequence) {
      await page.locator(`text=${tab}`).last().click();
      await page.waitForTimeout(300);
      // 頁面不崩潰（無 runtime error）
    }
    // 最後回到行程頁仍然顯示
    await expect(page.locator('text=行程').last()).toBeVisible();
  });
});
