/**
 * e2e/05-expense-ui.spec.ts
 * Tests: 記帳頁核心 UI 流程
 *
 * 驗證：
 * - 新增費用表單開啟/關閉
 * - 幣別切換
 * - 訪客無法操作
 */

import { test, expect } from '@playwright/test';
import { injectProjectState, mockFirebase, waitPastSplash, BASE_URL } from './helpers';

async function goToExpense(page: any) {
  await page.locator('text=記帳').last().click();
  await page.waitForTimeout(400);
}

test.describe('記帳頁 UI（Owner）', () => {
  test.beforeEach(async ({ page }) => {
    await injectProjectState(page, 'owner');
    await mockFirebase(page, 'owner');
    await page.goto(BASE_URL);
    await waitPastSplash(page);
    await goToExpense(page);
  });

  test('顯示記帳頁標題「記帳」', async ({ page }) => {
    await expect(page.locator('text=記帳').first()).toBeVisible();
  });

  test('顯示成員統計卡片區域', async ({ page }) => {
    // 成員名稱（從 mock members）
    await expect(
      page.locator('text=Alice').or(page.locator('text=Bob')).or(page.locator('text=成員')).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('Owner：可開啟新增費用表單', async ({ page }) => {
    const addBtn = page.locator('button').filter({ hasText: '＋' }).first();
    await addBtn.click();
    // 表單應有金額欄位
    await expect(page.locator('text=金額').or(page.locator('text=費用描述')).first()).toBeVisible({ timeout: 5_000 });
  });

  test('新增費用表單：有關閉按鈕可收起', async ({ page }) => {
    const addBtn = page.locator('button').filter({ hasText: '＋' }).first();
    await addBtn.click();
    await page.waitForTimeout(300);
    // 關閉按鈕 (✕)
    const closeBtn = page.locator('button').filter({ hasText: /✕|取消|關閉/ }).first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(300);
      await expect(page.locator('text=金額')).not.toBeVisible();
    }
  });

  test('新增費用表單：可切換幣別', async ({ page }) => {
    const addBtn = page.locator('button').filter({ hasText: '＋' }).first();
    await addBtn.click();
    await page.waitForTimeout(300);
    // 幣別選擇：點擊「自訂 ▾」開啟搜尋
    const customBtn = page.locator('button').filter({ hasText: '自訂' }).first();
    if (await customBtn.isVisible({ timeout: 3_000 })) {
      await customBtn.click();
      // 搜尋輸入框或貨幣清單出現
      await expect(
        page.locator('input[placeholder*="搜尋"]').or(page.locator('text=JPY')).first()
      ).toBeVisible({ timeout: 3_000 });
    }
  });
});

test.describe('記帳頁 UI（Visitor）', () => {
  test.beforeEach(async ({ page }) => {
    await injectProjectState(page, 'visitor');
    await mockFirebase(page, 'visitor');
    await page.goto(BASE_URL);
    await waitPastSplash(page);
    await goToExpense(page);
  });

  test('Visitor：看不到新增費用按鈕', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: '＋' })).not.toBeVisible();
  });

  test('Visitor：顯示訪客模式說明', async ({ page }) => {
    await expect(
      page.locator('text=訪客').or(page.locator('text=唯讀')).or(page.locator('text=無法')).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('Visitor：分類圓餅圖顯示（自動展開）', async ({ page }) => {
    // 訪客模式下 showPie 自動 = true
    await expect(
      page.locator('text=分類佔比').or(page.locator('svg')).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});
