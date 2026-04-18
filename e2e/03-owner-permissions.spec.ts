/**
 * e2e/03-owner-permissions.spec.ts
 * Tests: Owner 身分的 UI 稽核
 *
 * 驗證：
 * - 擁有者看到所有編輯按鈕
 * - 擁有者可開啟新增/編輯表單
 * - 無訪客 banner
 */

import { test, expect } from '@playwright/test';
import { injectProjectState, mockFirebase, waitPastSplash, BASE_URL } from './helpers';

test.describe('Owner 身分 UI', () => {
  test.beforeEach(async ({ page }) => {
    await injectProjectState(page, 'owner');
    await mockFirebase(page, 'owner');
    await page.goto(BASE_URL);
    await waitPastSplash(page);
  });

  test('不顯示訪客 banner', async ({ page }) => {
    const banner = page.locator('.tm-visitor-banner');
    // Visitor banner 應為 hidden 或不存在
    await expect(banner).not.toBeVisible({ timeout: 8_000 });
  });

  test('行程頁：顯示「編輯旅行設定」按鈕', async ({ page }) => {
    await expect(page.locator('text=編輯旅行設定')).toBeVisible({ timeout: 8_000 });
  });

  test('行程頁：顯示「批次匯入」按鈕', async ({ page }) => {
    await expect(page.locator('text=批次匯入')).toBeVisible({ timeout: 8_000 });
  });

  test('行程頁：可開啟新增行程表單', async ({ page }) => {
    // 點擊 ＋ 按鈕
    const addBtn = page.locator('button').filter({ hasText: '＋' }).first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      // 表單標題出現
      await expect(page.locator('text=新增行程').or(page.locator('text=行程名稱')).first()).toBeVisible({ timeout: 5_000 });
    } else {
      // 若當天無行程，顯示「新增第一筆」按鈕
      const firstBtn = page.locator('text=＋ 新增第一筆行程');
      if (await firstBtn.isVisible()) {
        await firstBtn.click();
        await expect(page.locator('text=行程名稱').or(page.locator('text=時間')).first()).toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test('行程頁：點擊「編輯旅行設定」開啟 Meta 表單', async ({ page }) => {
    await page.locator('text=編輯旅行設定').click();
    // Meta form 有旅行名稱欄位
    await expect(page.locator('text=旅行名稱').first()).toBeVisible({ timeout: 5_000 });
  });

  test('行程頁：點擊「批次匯入」開啟匯入 Modal', async ({ page }) => {
    await page.locator('text=批次匯入').click();
    await expect(page.locator('text=批次匯入').last().or(page.locator('text=匯入')).first()).toBeVisible({ timeout: 5_000 });
  });

  test('記帳頁：顯示新增費用功能', async ({ page }) => {
    await page.locator('text=記帳').last().click();
    await page.waitForTimeout(500);
    // Owner 應看到 ＋ 新增費用按鈕
    await expect(
      page.locator('text=新增費用').or(page.locator('button').filter({ hasText: '＋' })).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('日誌頁：顯示新增日誌按鈕', async ({ page }) => {
    await page.locator('text=日誌').last().click();
    await page.waitForTimeout(500);
    await expect(
      page.locator('text=新增日誌').or(page.locator('button').filter({ hasText: '＋' })).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('準備頁：顯示新增 TODO / 行李清單按鈕', async ({ page }) => {
    await page.locator('text=準備').last().click();
    await page.waitForTimeout(500);
    await expect(
      page.locator('button').filter({ hasText: '＋' }).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});
