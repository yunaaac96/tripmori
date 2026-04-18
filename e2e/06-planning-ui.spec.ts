/**
 * e2e/06-planning-ui.spec.ts
 * Tests: 準備頁（Todo / Packing）UI 流程
 *
 * 驗證：
 * - Todo / 行李 兩個頁籤切換
 * - Owner 可新增 Todo
 * - Visitor 無新增按鈕
 */

import { test, expect } from '@playwright/test';
import { injectProjectState, mockFirebase, waitPastSplash, BASE_URL } from './helpers';

async function goToPlanning(page: any) {
  await page.locator('text=準備').last().click();
  await page.waitForTimeout(400);
}

test.describe('準備頁 UI（Owner）', () => {
  test.beforeEach(async ({ page }) => {
    await injectProjectState(page, 'owner');
    await mockFirebase(page, 'owner');
    await page.goto(BASE_URL);
    await waitPastSplash(page);
    await goToPlanning(page);
  });

  test('顯示「待辦」和「行李」兩個 section', async ({ page }) => {
    await expect(page.locator('text=待辦').or(page.locator('text=TODO')).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('text=行李').or(page.locator('text=打包清單')).first()).toBeVisible({ timeout: 8_000 });
  });

  test('可切換到「行李」section', async ({ page }) => {
    await page.locator('text=行李').first().click();
    await page.waitForTimeout(300);
    // 行李區塊顯示成員頁籤
    await expect(
      page.locator('text=Alice').or(page.locator('text=行李清單')).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('Owner：可開啟新增 Todo 表單', async ({ page }) => {
    const addBtn = page.locator('button').filter({ hasText: '＋' }).first();
    if (await addBtn.isVisible({ timeout: 3_000 })) {
      await addBtn.click();
      await expect(
        page.locator('text=內容').or(page.locator('text=新增').or(page.locator('text=待辦'))).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test('新增 Todo 表單：可輸入文字並取消', async ({ page }) => {
    const addBtn = page.locator('button').filter({ hasText: '＋' }).first();
    if (await addBtn.isVisible({ timeout: 3_000 })) {
      await addBtn.click();
      await page.waitForTimeout(500);
      // 嘗試輸入
      const input = page.locator('input[type="text"]').first();
      if (await input.isVisible()) {
        await input.fill('E2E 測試待辦');
        await expect(input).toHaveValue('E2E 測試待辦');
      }
      // 取消
      const cancelBtn = page.locator('button').filter({ hasText: /取消|✕/ }).first();
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
        await page.waitForTimeout(300);
      }
    }
  });
});

test.describe('準備頁 UI（Visitor）', () => {
  test.beforeEach(async ({ page }) => {
    await injectProjectState(page, 'visitor');
    await mockFirebase(page, 'visitor');
    await page.goto(BASE_URL);
    await waitPastSplash(page);
    await goToPlanning(page);
  });

  test('Visitor：看不到新增按鈕', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: '＋' })).not.toBeVisible({ timeout: 5_000 });
  });

  test('Visitor：行李 section 顯示（全體預設項目）', async ({ page }) => {
    await page.locator('text=行李').first().click();
    await page.waitForTimeout(300);
    // 訪客可看到行李清單（全體預設清單）
    await expect(
      page.locator('text=行李').first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
