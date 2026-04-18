/**
 * e2e/01-splash-hub.spec.ts
 * Tests: Splash screen → ProjectHub
 *
 * 這些測試不依賴 Firebase：測試 app 的靜態啟動流程。
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

test.describe('Splash → ProjectHub', () => {
  test.beforeEach(async ({ page }) => {
    // 清除所有 localStorage，確保 ProjectHub 顯示（未選任何行程）
    await page.addInitScript(() => { localStorage.clear(); });
  });

  test('首次載入：顯示 TripMori Splash', async ({ page }) => {
    await page.goto(BASE);
    // Splash 包含 logo 文字
    await expect(page.locator('text=TripMori').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Splash 結束後：ProjectHub 顯示', async ({ page }) => {
    await page.goto(BASE);
    // 等待 ProjectHub 關鍵文字出現（最多 20s，因為 splash 固定等 3s + auth）
    await expect(page.locator('text=開始規劃旅行')).toBeVisible({ timeout: 20_000 });
  });

  test('ProjectHub：顯示 Google 登入按鈕', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('text=使用 Google 帳號登入')).toBeVisible({ timeout: 20_000 });
  });

  test('ProjectHub：顯示「建立新旅行」卡片', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('text=建立新旅行')).toBeVisible({ timeout: 20_000 });
  });

  test('ProjectHub：顯示「輸入協作金鑰」卡片', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('text=輸入協作金鑰')).toBeVisible({ timeout: 20_000 });
  });

  test('ProjectHub：點擊「建立新旅行」展開建立表單', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('text=建立新旅行').click();
    // 建立旅行的確認/名稱輸入欄
    await expect(page.locator('text=旅行名稱').or(page.locator('text=成為擁有者')).first()).toBeVisible({ timeout: 5_000 });
  });

  test('ProjectHub：點擊「輸入協作金鑰」展開金鑰輸入', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('text=輸入協作金鑰').click();
    // 金鑰輸入欄位（placeholder = COLLAB-XXXXXX-XXXX）
    await expect(page.locator('input[placeholder*="COLLAB"]')).toBeVisible({ timeout: 5_000 });
  });
});
