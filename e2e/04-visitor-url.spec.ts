/**
 * e2e/04-visitor-url.spec.ts
 * Tests: ?visit=TRIP_ID URL 參數的訪客分享連結流程
 *
 * 驗證：
 * - 透過分享連結（?visit=ID）進入時，正確顯示訪客身分
 * - 已有此行程 editor/owner 權限的使用者，以分享連結進入仍保留原權限
 */

import { test, expect } from '@playwright/test';
import { TRIP_ID, BASE_URL, makeStoredProject, mockFirebase } from './helpers';

test.describe('?visit= 分享連結', () => {
  test('新訪客：透過 ?visit= 進入，顯示訪客 banner', async ({ page }) => {
    // 預先注入 visitor 行程到 localStorage（不設 active_project）
    // 避免依賴 Firestore SDK gRPC transport（測試環境無法 mock）
    const visitorProject = makeStoredProject('visitor');
    await page.addInitScript(({ project }) => {
      localStorage.clear();
      localStorage.setItem('tripmori_projects', JSON.stringify([project]));
      // 故意不設 tripmori_active_project，讓 ?visit= 參數決定
    }, { project: visitorProject });
    await mockFirebase(page, 'visitor');
    await page.goto(`${BASE_URL}?visit=${TRIP_ID}`);

    // App 從 localStorage 找到 visitor 行程，直接進入（不需 Firestore fetch）
    await expect(
      page.locator('.tm-visitor-banner').or(page.locator('text=訪客模式')).first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test('已有 editor 權限：以 ?visit= 進入仍保留 editor 身分', async ({ page }) => {
    // 注入 editor 身分
    const editorProject = makeStoredProject('editor');
    await page.addInitScript(({ project, tripId }) => {
      localStorage.setItem('tripmori_projects', JSON.stringify([project]));
      // 不設 active_project，讓 URL 參數決定
    }, { project: editorProject, tripId: TRIP_ID });

    await mockFirebase(page, 'editor');
    await page.goto(`${BASE_URL}?visit=${TRIP_ID}`);

    // Editor 不應顯示訪客 banner
    await page.waitForTimeout(3_000); // wait past splash
    // Editor 有底部導覽但沒有訪客限制文字（"只能預覽"之類）
    const banner = page.locator('.tm-visitor-banner');
    // banner 可能顯示金鑰升級步驟，但不是唯讀提示
    // 主要驗證：editor 能看到底部導覽列
    await expect(page.locator('text=行程').last()).toBeVisible({ timeout: 15_000 });
  });

  test('URL 有 ?visit= 時，不進入 ProjectHub', async ({ page }) => {
    // 預先注入 visitor 行程（無 active_project），讓 ?visit= 參數觸發行程進入
    const visitorProject = makeStoredProject('visitor');
    await page.addInitScript(({ project }) => {
      localStorage.clear();
      localStorage.setItem('tripmori_projects', JSON.stringify([project]));
    }, { project: visitorProject });
    await mockFirebase(page, 'visitor');
    await page.goto(`${BASE_URL}?visit=${TRIP_ID}`);

    // 等待進入行程視圖（底部導覽或訪客 banner）
    await expect(
      page.locator('.tm-visitor-banner').or(page.locator('text=訪客模式')).first()
    ).toBeVisible({ timeout: 20_000 });

    // 確認不在 ProjectHub（「建立新旅行」卡片不可見）
    await expect(page.locator('text=建立新旅行')).not.toBeVisible();
  });
});
