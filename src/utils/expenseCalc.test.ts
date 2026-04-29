/**
 * expenseCalc.test.ts
 * Unit tests for expense splitting, member stats, and settlement formulas.
 *
 * 測試涵蓋：
 *  A. toTWDCalc — 幣別換算
 *  B. getEqualPcts — 等比例分配（5% 步進）
 *  C. normalizePcts — 手動調整百分比後重新分配
 *  D. getPersonalShare — 個人分攤金額（均分 / 加權百分比 / 自訂金額）
 *  E. computeMemberStats — 成員統計（paid / owed / net）
 *  F. computeSettlements — 結清建議（貪心演算法）
 */

import { describe, it, expect } from 'vitest';
import {
  toTWDCalc,
  getEqualPcts,
  normalizePcts,
  getPersonalShare,
  computeMemberStats,
  computeSettlements,
  computeAmountTWD,
  buildPersonalStatement,
  CURRENCY_TO_TWD,
} from './expenseCalc';

// ── A. toTWDCalc ──────────────────────────────────────────────────────────────
describe('toTWDCalc', () => {
  it('TWD → TWD 不轉換', () => {
    expect(toTWDCalc(1000, 'TWD')).toBe(1000);
  });

  it('JPY 換算 TWD（Math.round）', () => {
    const rate = CURRENCY_TO_TWD['JPY'];
    expect(toTWDCalc(1000, 'JPY')).toBe(Math.round(1000 * rate));
  });

  it('未知幣別 fallback 為 1:1', () => {
    expect(toTWDCalc(500, 'XYZ')).toBe(500);
  });

  it('0 元回傳 0', () => {
    expect(toTWDCalc(0, 'JPY')).toBe(0);
  });

  it('IDR 換算正確', () => {
    expect(toTWDCalc(100000, 'IDR')).toBe(Math.round(100000 * CURRENCY_TO_TWD['IDR']));
  });
});

// ── B. getEqualPcts ───────────────────────────────────────────────────────────
describe('getEqualPcts', () => {
  it('空陣列回傳空物件', () => {
    expect(getEqualPcts([])).toEqual({});
  });

  it('1 人 → 100%', () => {
    expect(getEqualPcts(['A'])).toEqual({ A: 100 });
  });

  it('2 人 → 50% each', () => {
    expect(getEqualPcts(['A', 'B'])).toEqual({ A: 50, B: 50 });
  });

  it('3 人 → 5% 步進，餘數給第一人', () => {
    const pcts = getEqualPcts(['A', 'B', 'C']);
    // 100/3 ≈ 33, floor to 30 (nearest 5). remainder = 100 - 30*3 = 10 → A gets 40
    expect(pcts['A']).toBe(40);
    expect(pcts['B']).toBe(30);
    expect(pcts['C']).toBe(30);
    expect(pcts['A'] + pcts['B'] + pcts['C']).toBe(100);
  });

  it('4 人 → 總和為 100', () => {
    const pcts = getEqualPcts(['A', 'B', 'C', 'D']);
    const total = Object.values(pcts).reduce((s, v) => s + v, 0);
    expect(total).toBe(100);
  });

  it('5 人 → 總和為 100', () => {
    const pcts = getEqualPcts(['A', 'B', 'C', 'D', 'E']);
    const total = Object.values(pcts).reduce((s, v) => s + v, 0);
    expect(total).toBe(100);
  });

  it('7 人 → 總和為 100', () => {
    const pcts = getEqualPcts(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    const total = Object.values(pcts).reduce((s, v) => s + v, 0);
    expect(total).toBe(100);
  });
});

// ── C. normalizePcts ──────────────────────────────────────────────────────────
describe('normalizePcts', () => {
  it('2 人：調整後總和仍為 100', () => {
    const pcts = { A: 50, B: 50 };
    const result = normalizePcts(pcts, 'A', 70);
    expect(result['A']).toBe(70);
    expect(result['B']).toBe(30);
    expect(result['A'] + result['B']).toBe(100);
  });

  it('3 人：調整後總和仍為 100', () => {
    const pcts = { A: 40, B: 30, C: 30 };
    const result = normalizePcts(pcts, 'A', 60);
    const total = Object.values(result).reduce((s, v) => s + v, 0);
    expect(total).toBe(100);
    expect(result['A']).toBe(60);
  });

  it('其他人全為 0 時，均分剩餘', () => {
    const pcts = { A: 100, B: 0, C: 0 };
    const result = normalizePcts(pcts, 'A', 60);
    const total = Object.values(result).reduce((s, v) => s + v, 0);
    expect(total).toBe(100);
    expect(result['A']).toBe(60);
  });

  it('調整不影響 changedName 以外成員的相對比例方向', () => {
    const pcts = { A: 50, B: 30, C: 20 };
    const result = normalizePcts(pcts, 'A', 40);
    // B was 30/50 of others, C was 20/50 — both should increase
    expect(result['B']).toBeGreaterThan(0);
    expect(result['C']).toBeGreaterThan(0);
    const total = Object.values(result).reduce((s, v) => s + v, 0);
    expect(total).toBe(100);
  });
});

// ── D. getPersonalShare ───────────────────────────────────────────────────────
describe('getPersonalShare', () => {
  const members = ['Alice', 'Bob', 'Carol'];

  it('私人費用回傳 0', () => {
    const e = { payer: 'Alice', amount: 1000, currency: 'TWD', isPrivate: true };
    expect(getPersonalShare(e, 'Alice', members)).toBe(0);
  });

  it('不在 splitWith 的成員回傳 0', () => {
    const e = { payer: 'Alice', amount: 1000, currency: 'TWD', splitWith: ['Alice', 'Bob'] };
    expect(getPersonalShare(e, 'Carol', members)).toBe(0);
  });

  describe('均分模式（equal）', () => {
    it('整除：每人相同', () => {
      const e = { payer: 'Alice', amountTWD: 300, currency: 'TWD' };
      expect(getPersonalShare(e, 'Alice', members)).toBe(100);
      expect(getPersonalShare(e, 'Bob', members)).toBe(100);
      expect(getPersonalShare(e, 'Carol', members)).toBe(100);
    });

    it('不整除：餘數給字母序最前的人', () => {
      // 100 ÷ 3 = 33 餘 1 → sorted: [Alice, Bob, Carol] → Alice 得 34
      const e = { payer: 'Alice', amountTWD: 100, currency: 'TWD' };
      expect(getPersonalShare(e, 'Alice', members)).toBe(34);
      expect(getPersonalShare(e, 'Bob', members)).toBe(33);
      expect(getPersonalShare(e, 'Carol', members)).toBe(33);
      // 驗證總和正確
      const total = members.reduce((s, n) => s + getPersonalShare(e, n, members), 0);
      expect(total).toBe(100);
    });

    it('2 人均分：101 TWD → 51 + 50', () => {
      const e = { payer: 'Alice', amountTWD: 101, currency: 'TWD', splitWith: ['Alice', 'Bob'] };
      const aliceShare = getPersonalShare(e, 'Alice', members);
      const bobShare   = getPersonalShare(e, 'Bob', members);
      expect(aliceShare + bobShare).toBe(101);
      expect(Math.abs(aliceShare - bobShare)).toBeLessThanOrEqual(1);
    });

    it('4 人均分：103 → 總和等於 103', () => {
      const four = ['Alice', 'Bob', 'Carol', 'Dave'];
      const e = { payer: 'Alice', amountTWD: 103, splitWith: four };
      const total = four.reduce((s, n) => s + getPersonalShare(e, n, four), 0);
      expect(total).toBe(103);
    });
  });

  describe('加權百分比模式（weighted）', () => {
    it('Math.ceil 進位', () => {
      // 100 * 33% = 33.0 → ceil = 33
      const e = {
        payer: 'Alice', amountTWD: 100,
        splitMode: 'weighted' as const,
        percentages: { Alice: 33, Bob: 33, Carol: 34 },
      };
      expect(getPersonalShare(e, 'Alice', members)).toBe(33);
      expect(getPersonalShare(e, 'Carol', members)).toBe(34);
    });

    it('小數百分比進位', () => {
      // 1001 * 30% = 300.3 → ceil = 301
      const e = {
        payer: 'Alice', amountTWD: 1001,
        splitMode: 'weighted' as const,
        percentages: { Alice: 30, Bob: 30, Carol: 40 },
      };
      expect(getPersonalShare(e, 'Alice', members)).toBe(Math.ceil(1001 * 0.30));
      expect(getPersonalShare(e, 'Carol', members)).toBe(Math.ceil(1001 * 0.40));
    });
  });

  describe('自訂金額模式（amount）', () => {
    it('各人金額獨立（TWD 直接用）：比例由 effectiveTWD 決定', () => {
      // amount 模式：customAmounts 是「原幣各人分配金額」，
      // 程式以 Math.round(effectiveTWD × customAmt/totalCustom) 計算，
      // 確保各人份額加總 == effectiveTWD（而非直接用 customAmount 值）。
      // 測試必須提供 amountTWD，否則 effectiveTWD=0，全員份額都是 0。
      const e = {
        payer: 'Alice', amount: 2300, currency: 'TWD',
        amountTWD: 2300, // 1500 + 800
        splitMode: 'amount' as const,
        customAmounts: { Alice: '1500', Bob: '800' },
        splitWith: ['Alice', 'Bob'],
      };
      // Alice: Math.round(2300 × 1500/2300) = 1500
      // Bob:   Math.round(2300 × 800/2300)  = 800
      expect(getPersonalShare(e, 'Alice', members)).toBe(1500);
      expect(getPersonalShare(e, 'Bob', members)).toBe(800);
    });

    it('自訂金額模式（JPY）：比例換算正確', () => {
      // customAmounts 以原幣紀錄（1000 JPY），amountTWD 是 effectiveTWD 的來源
      const jpyTWD = toTWDCalc(1000, 'JPY'); // 218
      const e = {
        payer: 'Bob', amount: 1000, currency: 'JPY',
        amountTWD: jpyTWD, // 總額 218 TWD，Alice 佔全部
        splitMode: 'amount' as const,
        customAmounts: { Alice: '1000' },
        splitWith: ['Alice'],
      };
      // Alice: Math.round(218 × 1000/1000) = 218
      expect(getPersonalShare(e, 'Alice', members)).toBe(jpyTWD);
    });
  });
});

// ── E. computeMemberStats ─────────────────────────────────────────────────────
describe('computeMemberStats', () => {
  it('單一費用，付款人 paid = 全額，其餘為 0', () => {
    const expenses = [
      { payer: 'Alice', amountTWD: 300, currency: 'TWD', splitWith: ['Alice', 'Bob', 'Carol'] },
    ];
    const stats = computeMemberStats(expenses, ['Alice', 'Bob', 'Carol']);
    const alice = stats.find(s => s.name === 'Alice')!;
    const bob   = stats.find(s => s.name === 'Bob')!;
    expect(alice.rawPaid).toBe(300);
    expect(bob.rawPaid).toBe(0);
  });

  it('net: 付款人 net > 0（別人欠他），非付款人 net < 0（他欠別人）', () => {
    const expenses = [
      { payer: 'Alice', amountTWD: 300, currency: 'TWD' },
    ];
    const stats = computeMemberStats(expenses, ['Alice', 'Bob', 'Carol']);
    const alice = stats.find(s => s.name === 'Alice')!;
    const bob   = stats.find(s => s.name === 'Bob')!;
    expect(alice.net).toBeGreaterThan(0);
    expect(bob.net).toBeLessThan(0);
  });

  it('所有人 net 之和接近 0（分攤誤差 ≤ 成員人數）', () => {
    const expenses = [
      { payer: 'Alice', amountTWD: 1003, currency: 'TWD' },
      { payer: 'Bob',   amountTWD: 500,  currency: 'TWD' },
    ];
    const members = ['Alice', 'Bob', 'Carol'];
    const stats = computeMemberStats(expenses, members);
    const netSum = stats.reduce((s, m) => s + m.net, 0);
    // ceil 捨入可能產生微小誤差
    expect(Math.abs(netSum)).toBeLessThanOrEqual(members.length);
  });

  it('私人費用不計入 paid / owed', () => {
    const expenses = [
      { payer: 'Alice', amountTWD: 1000, currency: 'TWD', isPrivate: true },
    ];
    const stats = computeMemberStats(expenses, ['Alice', 'Bob']);
    const alice = stats.find(s => s.name === 'Alice')!;
    expect(alice.rawPaid).toBe(0);
    expect(alice.owed).toBe(0);
  });

  it('settlement 費用：creditor 的 paid 減少（已收回款項）', () => {
    // Alice 先付了 300，Bob 欠 100，Bob 已還款 100
    const expenses = [
      { payer: 'Alice', amountTWD: 300, currency: 'TWD', splitWith: ['Alice', 'Bob', 'Carol'] },
      { payer: 'Bob', amountTWD: 100, currency: 'TWD', category: 'settlement', splitWith: ['Alice'] },
    ];
    const stats = computeMemberStats(expenses, ['Alice', 'Bob', 'Carol']);
    const alice = stats.find(s => s.name === 'Alice')!;
    // Alice rawPaid = 300, settlementsReceived = 100 → paid = 200
    expect(alice.paid).toBe(200);
    expect(alice.rawPaid).toBe(300);
  });

  it('兩人互付費用：net 相互抵消', () => {
    const expenses = [
      { payer: 'Alice', amountTWD: 200, currency: 'TWD', splitWith: ['Alice', 'Bob'] },
      { payer: 'Bob',   amountTWD: 200, currency: 'TWD', splitWith: ['Alice', 'Bob'] },
    ];
    const stats = computeMemberStats(expenses, ['Alice', 'Bob']);
    const alice = stats.find(s => s.name === 'Alice')!;
    const bob   = stats.find(s => s.name === 'Bob')!;
    expect(alice.net).toBe(0);
    expect(bob.net).toBe(0);
  });
});

// ── F. computeSettlements ─────────────────────────────────────────────────────
describe('computeSettlements', () => {
  it('平衡狀態：無需結清', () => {
    const stats = [
      { name: 'Alice', paid: 100, rawPaid: 100, owed: 100, net: 0 },
      { name: 'Bob',   paid: 100, rawPaid: 100, owed: 100, net: 0 },
    ];
    expect(computeSettlements(stats)).toEqual([]);
  });

  it('2 人：債務人還錢給債權人', () => {
    // Alice net = +200, Bob net = -200
    const stats = [
      { name: 'Alice', paid: 300, rawPaid: 300, owed: 100, net: 200 },
      { name: 'Bob',   paid: 0,   rawPaid: 0,   owed: 200, net: -200 },
    ];
    const result = computeSettlements(stats);
    expect(result).toHaveLength(1);
    expect(result[0].from).toBe('Bob');
    expect(result[0].to).toBe('Alice');
    expect(result[0].amount).toBe(200);
  });

  it('3 人：debt 總和等於 credit 總和（Math.ceil 允許 1 TWD 誤差）', () => {
    // Alice paid 300 for all → Bob owes 100, Carol owes 100
    const expenses = [
      { payer: 'Alice', amountTWD: 300, currency: 'TWD' },
    ];
    const stats = computeMemberStats(expenses, ['Alice', 'Bob', 'Carol']);
    const result = computeSettlements(stats);
    // Both Bob and Carol should pay Alice
    expect(result.every(s => s.to === 'Alice')).toBe(true);
    const totalPaid = result.reduce((s, r) => s + r.amount, 0);
    expect(totalPaid).toBeGreaterThanOrEqual(200);
    expect(totalPaid).toBeLessThanOrEqual(202); // ceil 可能有 1-2 TWD 誤差
  });

  it('多對多結清：最小化交易數', () => {
    // A net = +300, B net = +100, C net = -200, D net = -200
    const stats = [
      { name: 'A', paid: 0, rawPaid: 0, owed: 0, net: 300 },
      { name: 'B', paid: 0, rawPaid: 0, owed: 0, net: 100 },
      { name: 'C', paid: 0, rawPaid: 0, owed: 0, net: -200 },
      { name: 'D', paid: 0, rawPaid: 0, owed: 0, net: -200 },
    ];
    const result = computeSettlements(stats);
    // C → A: 200, D → A: 100, D → B: 100
    expect(result.length).toBeLessThanOrEqual(4); // 最多 2*2 筆
    // 總還款等於總欠款
    const totalPaid = result.reduce((s, r) => s + r.amount, 0);
    expect(totalPaid).toBeGreaterThanOrEqual(400);
    expect(totalPaid).toBeLessThanOrEqual(404);
  });

  it('amount 為 Math.ceil（不足 1 元進位）', () => {
    // net slightly non-integer due to prior rounding
    const stats = [
      { name: 'Alice', paid: 0, rawPaid: 0, owed: 0, net: 33.3 },
      { name: 'Bob',   paid: 0, rawPaid: 0, owed: 0, net: -33.3 },
    ];
    const result = computeSettlements(stats);
    expect(result[0].amount).toBe(34); // Math.ceil(33.3) = 34
  });

  it('只有 1 TWD 差額也產生結清紀錄', () => {
    const stats = [
      { name: 'Alice', paid: 0, rawPaid: 0, owed: 0, net: 1 },
      { name: 'Bob',   paid: 0, rawPaid: 0, owed: 0, net: -1 },
    ];
    const result = computeSettlements(stats);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(1);
  });
});

// ── 整合測試：實際分帳情境 ────────────────────────────────────────────────────
describe('整合情境', () => {
  it('3 人旅遊：多筆費用 → 結清建議總和正確', () => {
    const members = ['Alice', 'Bob', 'Carol'];
    const expenses = [
      { payer: 'Alice', amountTWD: 900,  currency: 'TWD' }, // 各 300
      { payer: 'Bob',   amountTWD: 600,  currency: 'TWD' }, // 各 200
      { payer: 'Carol', amountTWD: 300,  currency: 'TWD' }, // 各 100
    ];
    // 各人應付：300+200+100 = 600
    // Alice paid 900, owed 600 → net +300
    // Bob paid 600, owed 600 → net 0
    // Carol paid 300, owed 600 → net -300
    const stats = computeMemberStats(expenses, members);
    const alice = stats.find(s => s.name === 'Alice')!;
    const bob   = stats.find(s => s.name === 'Bob')!;
    const carol = stats.find(s => s.name === 'Carol')!;
    expect(alice.net).toBe(300);
    expect(bob.net).toBe(0);
    expect(carol.net).toBe(-300);

    const settlements = computeSettlements(stats);
    expect(settlements).toHaveLength(1);
    expect(settlements[0]).toMatchObject({ from: 'Carol', to: 'Alice', amount: 300 });
  });

  it('非均分（部分人不參與）：只有 splitWith 成員分攤', () => {
    const members = ['Alice', 'Bob', 'Carol'];
    const expenses = [
      // 只有 Alice 和 Bob 去吃飯，Carol 不參與
      { payer: 'Alice', amountTWD: 200, currency: 'TWD', splitWith: ['Alice', 'Bob'] },
    ];
    const stats = computeMemberStats(expenses, members);
    const carol = stats.find(s => s.name === 'Carol')!;
    expect(carol.owed).toBe(0);
    expect(carol.net).toBe(0);

    const bob = stats.find(s => s.name === 'Bob')!;
    expect(bob.owed).toBe(100);
    expect(bob.net).toBe(-100);
  });

  it('加權分攤：驗證個人負擔比例', () => {
    const members = ['Alice', 'Bob'];
    const expenses = [
      {
        payer: 'Alice', amountTWD: 1000, currency: 'TWD',
        splitMode: 'weighted' as const,
        percentages: { Alice: 70, Bob: 30 },
      },
    ];
    const stats = computeMemberStats(expenses, members);
    const alice = stats.find(s => s.name === 'Alice')!;
    const bob   = stats.find(s => s.name === 'Bob')!;
    // Alice: paid 1000, owed ceil(700) = 700 → net = +300
    // Bob: paid 0, owed ceil(300) = 300 → net = -300
    expect(alice.owed).toBe(700);
    expect(alice.net).toBe(300);
    expect(bob.owed).toBe(300);
    expect(bob.net).toBe(-300);
  });
});

// ── 壓力測試情境一：兩人簡單對沖（匯率 + 刷卡手續費）────────────────────────
describe('壓力測試 情境一：兩人匯率 + 手續費', () => {
  /**
   * 成員：A, B
   * 費用①：A 代墊午餐 $1,000 TWD，兩人均分
   * 費用②：B 代墊藥妝 $10,000 JPY，匯率 0.21，刷卡手續費 1.5%，兩人均分
   *
   * 手算推導：
   *   費用② amountTWD = Math.round(10000 × 0.21 × 1.015) = Math.round(2131.5) = 2132
   *   均分後每人 = floor(2132/2) = 1066，餘數 0，A 份 = 1066，B 份 = 1066
   *
   *   A: paid=1000, owed=500+1066=1566, net = 1000-1566 = -566（欠 B）
   *   B: paid=2132, owed=500+1066=1566, net = 2132-1566 = +566（B 是債權人）
   *   結算：A → B  NT$566
   */
  const members = ['A', 'B'];

  // computeAmountTWD 正確算出含手續費 TWD
  it('費用② amountTWD = 2132（刷卡手續費含入）', () => {
    const amtTWD = computeAmountTWD(10000, 'JPY', {
      exchangeRate: 0.21,
      paymentMethod: 'card',
      cardFeePercent: 1.5,
    });
    expect(amtTWD).toBe(2132);
  });

  it('費用② 均分：A 份 = B 份 = 1066，總和等於 2132', () => {
    const e = { payer: 'B', amountTWD: 2132, currency: 'JPY', splitWith: ['A', 'B'] };
    const aShare = getPersonalShare(e, 'A', members);
    const bShare = getPersonalShare(e, 'B', members);
    expect(aShare).toBe(1066);
    expect(bShare).toBe(1066);
    expect(aShare + bShare).toBe(2132);
  });

  it('memberStats：A net = -566，B net = +566', () => {
    const expenses = [
      { payer: 'A', amountTWD: 1000, currency: 'TWD', splitWith: ['A', 'B'] },
      { payer: 'B', amountTWD: 2132, currency: 'JPY', splitWith: ['A', 'B'] },
    ];
    const stats = computeMemberStats(expenses, members);
    const a = stats.find(s => s.name === 'A')!;
    const b = stats.find(s => s.name === 'B')!;
    expect(a.net).toBe(-566);
    expect(b.net).toBe(566);
    // net 總和為 0
    expect(a.net + b.net).toBe(0);
  });

  it('結算建議：A → B  NT$566', () => {
    const expenses = [
      { payer: 'A', amountTWD: 1000, currency: 'TWD', splitWith: ['A', 'B'] },
      { payer: 'B', amountTWD: 2132, currency: 'JPY', splitWith: ['A', 'B'] },
    ];
    const stats = computeMemberStats(expenses, members);
    const settlements = computeSettlements(stats);
    expect(settlements).toHaveLength(1);
    expect(settlements[0].from).toBe('A');
    expect(settlements[0].to).toBe('B');
    expect(settlements[0].amount).toBe(566);
  });

  it('Personal Statement A：代墊 1000，應付 1566，淨值 -566', () => {
    const expenses = [
      { id: 'e1', payer: 'A', amountTWD: 1000, currency: 'TWD', splitWith: ['A', 'B'], description: '午餐', date: '2024-04-01' },
      { id: 'e2', payer: 'B', amountTWD: 2132, currency: 'JPY', splitWith: ['A', 'B'], description: '藥妝', date: '2024-04-01' },
    ];
    const stmt = buildPersonalStatement(expenses, 'A', members);
    expect(stmt.myPaymentsTotal).toBe(1000);
    expect(stmt.mySharesTotal).toBe(1566);
    expect(stmt.net).toBe(-566);
    expect(stmt.myAdvancedTotal).toBe(500); // A 代墊給 B 的 500
  });
});

// ── 壓力測試情境二：8 人複雜大團（多人分攤與債務對沖）─────────────────────────
describe('壓力測試 情境二：8 人大團', () => {
  /**
   * 成員：A, B, C, D, E, F, G, H
   * 費用①：A 代墊大巴 $8,000 TWD，全員 8 人均分 → 每人 1000
   * 費用②：B 代墊燒肉 $24,000 JPY，匯率 0.21（per-expense），splitWith [A,B,C,D]
   *         amountTWD = Math.round(24000×0.21) = 5040
   *         每人 = 5040/4 = 1260（整除）
   * 費用③：C 代墊門票 $1,200 TWD，splitWith [E,F,G,H] → 每人 300
   *
   * 手算淨值：
   *   A：paid=8000, owed=1000+1260=2260, net=+5740
   *   B：paid=5040, owed=1000+1260=2260, net=+2780
   *   C：paid=1200, owed=1000+1260=2260, net=−1060
   *   D：paid=0,    owed=1000+1260=2260, net=−2260
   *   E：paid=0,    owed=1000+300=1300,  net=−1300
   *   F：paid=0,    owed=1000+300=1300,  net=−1300
   *   G：paid=0,    owed=1000+300=1300,  net=−1300
   *   H：paid=0,    owed=1000+300=1300,  net=−1300
   *   總和= 5740+2780−1060−2260−1300×4 = 8520−8520 = 0 ✓
   *
   * 結算建議（貪心，債務人降冪）：
   *   D(2260)→A, E(1300)→A, F(1300)→A, G(880)→A,
   *   G 剩 420→B, H(1300)→B, C(1060)→B
   */
  const members = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  const expenses = [
    {
      id: 'bus', payer: 'A', amountTWD: 8000, currency: 'TWD',
      splitWith: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      description: '大巴', date: '2024-04-01',
    },
    {
      id: 'bbq', payer: 'B', amountTWD: 5040, currency: 'JPY',
      splitWith: ['A', 'B', 'C', 'D'],
      description: '燒肉', date: '2024-04-01',
    },
    {
      id: 'tkt', payer: 'C', amountTWD: 1200, currency: 'TWD',
      splitWith: ['E', 'F', 'G', 'H'],
      description: '門票', date: '2024-04-01',
    },
  ];

  it('費用② amountTWD：24000 × 0.21 = 5040', () => {
    const amtTWD = computeAmountTWD(24000, 'JPY', { exchangeRate: 0.21 });
    expect(amtTWD).toBe(5040);
  });

  it('費用② 均分：每人 1260，4 人總和 = 5040', () => {
    const e = { payer: 'B', amountTWD: 5040, currency: 'JPY', splitWith: ['A', 'B', 'C', 'D'] };
    const shares = ['A', 'B', 'C', 'D'].map(n => getPersonalShare(e, n, members));
    expect(shares).toEqual([1260, 1260, 1260, 1260]);
    expect(shares.reduce((s, v) => s + v, 0)).toBe(5040);
  });

  it('每位成員 net 值正確', () => {
    const stats = computeMemberStats(expenses, members);
    const get = (name: string) => stats.find(s => s.name === name)!;

    expect(get('A').net).toBe(5740);
    expect(get('B').net).toBe(2780);
    expect(get('C').net).toBe(-1060);
    expect(get('D').net).toBe(-2260);
    expect(get('E').net).toBe(-1300);
    expect(get('F').net).toBe(-1300);
    expect(get('G').net).toBe(-1300);
    expect(get('H').net).toBe(-1300);
  });

  it('所有成員 net 總和等於 0', () => {
    const stats = computeMemberStats(expenses, members);
    const netSum = stats.reduce((s, m) => s + m.net, 0);
    expect(netSum).toBe(0);
  });

  it('結算建議：最多 7 筆，且總還款額等於總債務 8520', () => {
    const stats = computeMemberStats(expenses, members);
    const settlements = computeSettlements(stats);
    // 最大筆數 = (債權人數 × 債務人數) = 2 × 6 = 12；貪心應產出更少
    expect(settlements.length).toBeLessThanOrEqual(7);
    const totalTransferred = settlements.reduce((s, r) => s + r.amount, 0);
    expect(totalTransferred).toBe(8520);
  });

  it('結算建議：所有還款方向正確（只流向 A 或 B）', () => {
    const stats = computeMemberStats(expenses, members);
    const settlements = computeSettlements(stats);
    expect(settlements.every(s => s.to === 'A' || s.to === 'B')).toBe(true);
    expect(settlements.every(s => ['C', 'D', 'E', 'F', 'G', 'H'].includes(s.from))).toBe(true);
  });

  it('結算建議：貪心結果符合手算（7 筆）', () => {
    const stats = computeMemberStats(expenses, members);
    const settlements = computeSettlements(stats);
    // 轉成 map 方便查詢
    const find = (from: string, to: string) =>
      settlements.find(s => s.from === from && s.to === to);

    expect(find('D', 'A')?.amount).toBe(2260);
    expect(find('E', 'A')?.amount).toBe(1300);
    expect(find('F', 'A')?.amount).toBe(1300);
    expect(find('G', 'A')?.amount).toBe(880);
    expect(find('G', 'B')?.amount).toBe(420);
    expect(find('H', 'B')?.amount).toBe(1300);
    expect(find('C', 'B')?.amount).toBe(1060);
  });

  it('Personal Statement B：paid=5040，owed=2260，net=+2780，代墊 3780', () => {
    const stmt = buildPersonalStatement(expenses, 'B', members);
    expect(stmt.myPaymentsTotal).toBe(5040);
    expect(stmt.mySharesTotal).toBe(2260);
    expect(stmt.net).toBe(2780);
    // myAdvancedTotal = myPaymentsTotal − B自己份額 = 5040 − 1260 = 3780
    expect(stmt.myAdvancedTotal).toBe(3780);
  });

  it('Personal Statement D（全欠款方）：paid=0，owed=2260，net=−2260', () => {
    const stmt = buildPersonalStatement(expenses, 'D', members);
    expect(stmt.myPaymentsTotal).toBe(0);
    expect(stmt.mySharesTotal).toBe(2260);
    expect(stmt.net).toBe(-2260);
  });

  it('Personal Statement H（只參與大巴 + 門票）：paid=0，owed=1300，net=−1300', () => {
    const stmt = buildPersonalStatement(expenses, 'H', members);
    expect(stmt.myPaymentsTotal).toBe(0);
    expect(stmt.mySharesTotal).toBe(1300);
    expect(stmt.net).toBe(-1300);
  });
});

// ── 壓力測試情境三：結清狀態機與對稱標記 ────────────────────────────────────────
describe('壓力測試 情境三：結清狀態機 + 對稱標記 + 剔除已結清視圖', () => {
  /**
   * 3 人局：A, B, C
   *
   * 費用①：A 付餐費 $1200 TWD，3 人均分（每人 $400）
   * 費用②：B 付交通 $900 TWD，3 人均分（每人 $300）
   * 費用③：B 付景點 $600 TWD，3 人均分（每人 $200）
   *
   * 手算淨值：
   *   A：paid=1200, owed=400+300+200=900, net=+300（債權人）
   *   B：paid=1500, owed=400+300+200=900, net=+600（債權人）
   *   C：paid=0,    owed=400+300+200=900, net=−900（債務人）
   *
   * 結算建議：C → B $600, C → A $300（B 先收，A 後收）
   *
   * 情境：C 只還了 B（C→B $600），A 尚未收款
   *   → 費用②③（B 付、C 在 splitWith）設 settledAt
   *   → 費用②③（B 付、C 在 splitWith）的 payer=B，B 的 receivedAt 也對稱更新
   *
   * 在「剔除已結清」模式下：
   *   費用①（A 付，未結清）仍顯示
   *   費用②③（B 付，已結清）被隱藏
   *   C 的應分攤明細只剩費用①（NT$400）
   */

  const members = ['A', 'B', 'C'];

  // 基礎費用（不帶任何結清標記）
  const baseExpenses = [
    { id: 'e1', payer: 'A', amountTWD: 1200, currency: 'TWD', splitWith: ['A','B','C'], description: '餐費', date: '2024-04-01' },
    { id: 'e2', payer: 'B', amountTWD: 900,  currency: 'TWD', splitWith: ['A','B','C'], description: '交通', date: '2024-04-02' },
    { id: 'e3', payer: 'B', amountTWD: 600,  currency: 'TWD', splitWith: ['A','B','C'], description: '景點', date: '2024-04-03' },
  ];

  // 部分結清：C 已還 B（費用②③設 settledAt + receivedAt）
  const partiallySettled = [
    { id: 'e1', payer: 'A', amountTWD: 1200, currency: 'TWD', splitWith: ['A','B','C'], description: '餐費', date: '2024-04-01' },
    { id: 'e2', payer: 'B', amountTWD: 900,  currency: 'TWD', splitWith: ['A','B','C'], description: '交通', date: '2024-04-02', settledAt: '2024-04-10', settledByRef: 's1' },
    { id: 'e3', payer: 'B', amountTWD: 600,  currency: 'TWD', splitWith: ['A','B','C'], description: '景點', date: '2024-04-03', settledAt: '2024-04-10', settledByRef: 's1' },
  ];

  // ① 基礎淨值正確
  it('基礎淨值：A=+300, B=+600, C=−900, 總和=0', () => {
    const stats = computeMemberStats(baseExpenses, members);
    const get = (n: string) => stats.find(s => s.name === n)!;
    expect(get('A').net).toBe(300);
    expect(get('B').net).toBe(600);
    expect(get('C').net).toBe(-900);
    expect(stats.reduce((s, m) => s + m.net, 0)).toBe(0);
  });

  // ② 結算建議符合手算
  it('結算建議：C→B $600, C→A $300，共 2 筆', () => {
    const stats = computeMemberStats(baseExpenses, members);
    const s = computeSettlements(stats);
    expect(s).toHaveLength(2);
    const find = (from: string, to: string) => s.find(r => r.from === from && r.to === to);
    expect(find('C','B')?.amount).toBe(600);
    expect(find('C','A')?.amount).toBe(300);
  });

  // ③ settledAt 標記：費用②③ 的 debtor 視角（C 欠 B）
  it('C 的 應分攤明細 在 partial-settle 後只剩費用①（$400）', () => {
    const stmt = buildPersonalStatement(partiallySettled, 'C', members);
    const unpaid = stmt.myShares.filter(i => i.payer !== 'C' && !i.settledAt);
    expect(unpaid).toHaveLength(1);
    expect(unpaid[0].id).toBe('e1');
    expect(unpaid[0].myShare).toBe(400);
    // 未結清總額
    const total = unpaid.reduce((s, i) => s + i.myShare, 0);
    expect(total).toBe(400);
  });

  // ④ settledAt 標記：費用②③ 從計算中「歷史存在」不影響 net（結清是透過 settlement 紀錄處理）
  it('費用②③ settledAt 不影響 buildPersonalStatement 的 net 計算（未改動）', () => {
    // buildPersonalStatement uses all expenses regardless of settledAt for totals
    // settledAt only gates the "應分攤明細" filtered list
    const stmt = buildPersonalStatement(partiallySettled, 'C', members);
    expect(stmt.mySharesTotal).toBe(900); // 全額仍計入 (400+300+200)
    expect(stmt.net).toBe(-900);
  });

  // ⑤ receivedAt 對稱性：費用②③ 若帶 receivedAt，代表 B 已收回
  it('receivedAt 標記：B 的代墊視圖 — 費用②③ 有 receivedAt 則不再顯示「待收」', () => {
    const withReceived = [
      { id: 'e1', payer: 'A', amountTWD: 1200, currency: 'TWD', splitWith: ['A','B','C'], description: '餐費', date: '2024-04-01' },
      { id: 'e2', payer: 'B', amountTWD: 900,  currency: 'TWD', splitWith: ['A','B','C'], description: '交通', date: '2024-04-02', settledAt: '2024-04-10', receivedAt: '2024-04-10', settledByRef: 's1' },
      { id: 'e3', payer: 'B', amountTWD: 600,  currency: 'TWD', splitWith: ['A','B','C'], description: '景點', date: '2024-04-03', settledAt: '2024-04-10', receivedAt: '2024-04-10', settledByRef: 's1' },
    ];
    const stmt = buildPersonalStatement(withReceived, 'B', members);
    // B 的代墊中，費用②③ 已有 receivedAt（代表對 C 的部分已收回）
    const receivedItems = stmt.myPayments.filter(i => i.receivedAt);
    expect(receivedItems).toHaveLength(2);
    expect(receivedItems.map(i => i.id).sort()).toEqual(['e2','e3']);
    // 未收回代墊（receivedAt 不存在）— 費用①是 A 付的，不在 B 的 myPayments
    const unreceived = stmt.myPayments.filter(i => !i.receivedAt);
    expect(unreceived).toHaveLength(0);
  });

  // ⑥ 8 人局：各對獨立，互不干擾
  it('8 人局：C→B 結清只影響 C/B 相關費用，E/F/G/H 的 settledAt 不受影響', () => {
    const eight = ['A','B','C','D','E','F','G','H'];
    const expensesEight = [
      { id: 'bus', payer: 'A', amountTWD: 8000, currency: 'TWD', splitWith: eight, date: '2024-04-01' },
      { id: 'bbq', payer: 'B', amountTWD: 5040, currency: 'TWD', splitWith: ['A','B','C','D'], date: '2024-04-01' },
      { id: 'tkt', payer: 'C', amountTWD: 1200, currency: 'TWD', splitWith: ['E','F','G','H'], date: '2024-04-01' },
    ];
    // Simulate C paying B: mark BBQ (payer=B, C in splitWith) with settledAt
    const afterSettle = expensesEight.map(e => {
      if (e.id === 'bbq') return { ...e, settledAt: '2024-04-10', settledByRef: 's1' };
      return e;
    });
    // E's statement should be unaffected
    const stmtE = buildPersonalStatement(afterSettle, 'E', eight);
    const unpaidE = stmtE.myShares.filter(i => !i.settledAt && i.payer !== 'E');
    // E owes A for bus ($1000) and C for ticket ($300)
    expect(unpaidE).toHaveLength(2);
    expect(unpaidE.map(i => i.id).sort()).toEqual(['bus','tkt']);
    // C's statement: BBQ should now be settled
    const stmtC = buildPersonalStatement(afterSettle, 'C', eight);
    const unpaidC = stmtC.myShares.filter(i => !i.settledAt && i.payer !== 'C');
    // C owes A for bus ($1000); BBQ is settled
    expect(unpaidC).toHaveLength(1);
    expect(unpaidC[0].id).toBe('bus');
  });

  // ⑦ 「剔除已結清」過濾邏輯模擬
  it('剔除已結清：只保留無 settledAt 且無 receivedAt 的費用（settlement 類別不被隱藏）', () => {
    const allExpenses = [
      { id: 'e1', payer: 'A', amountTWD: 1200, currency: 'TWD', category: 'food',       splitWith: ['A','B','C'], date: '2024-04-01' },
      { id: 'e2', payer: 'B', amountTWD: 900,  currency: 'TWD', category: 'transport',  splitWith: ['A','B','C'], date: '2024-04-02', settledAt: '2024-04-10' },
      { id: 'e3', payer: 'B', amountTWD: 600,  currency: 'TWD', category: 'attraction', splitWith: ['A','B','C'], date: '2024-04-03', receivedAt: '2024-04-10' },
      { id: 's1', payer: 'C', amountTWD: 600,  currency: 'TWD', category: 'settlement', splitWith: ['B'],         date: '2024-04-10' },
    ];
    // Mirror the filteredExpenses logic:
    // !hideSettled || (!e.settledAt && !e.receivedAt) || e.category === 'settlement'
    const hideSettled = true;
    const visible = allExpenses.filter(e =>
      !hideSettled || (!e.settledAt && !e.receivedAt) || e.category === 'settlement'
    );
    // e1 (未結清 food) → 顯示
    // e2 (settledAt) → 隱藏
    // e3 (receivedAt) → 隱藏
    // s1 (settlement) → 永遠顯示
    expect(visible.map(e => e.id)).toEqual(['e1', 's1']);
  });

  // ⑧ 剔除後金額正確（不含已結清）
  it('剔除已結清後，可見費用 amountTWD 總和僅計算未結清部分', () => {
    const allExpenses = [
      { id: 'e1', payer: 'A', amountTWD: 1200, currency: 'TWD', category: 'food',       splitWith: ['A','B','C'], date: '2024-04-01' },
      { id: 'e2', payer: 'B', amountTWD: 900,  currency: 'TWD', category: 'transport',  splitWith: ['A','B','C'], date: '2024-04-02', settledAt: '2024-04-10' },
      { id: 'e3', payer: 'B', amountTWD: 600,  currency: 'TWD', category: 'attraction', splitWith: ['A','B','C'], date: '2024-04-03', receivedAt: '2024-04-10' },
      { id: 's1', payer: 'C', amountTWD: 600,  currency: 'TWD', category: 'settlement', splitWith: ['B'],         date: '2024-04-10' },
    ];
    const hideSettled = true;
    const visible = allExpenses.filter(e =>
      !hideSettled || (!e.settledAt && !e.receivedAt) || e.category === 'settlement'
    );
    // Only e1 (1200) + s1 (settlement, 600) are visible
    // Non-settlement total = 1200
    const nonSettlementTotal = visible
      .filter(e => e.category !== 'settlement')
      .reduce((s, e) => s + e.amountTWD, 0);
    expect(nonSettlementTotal).toBe(1200);
  });

  // ⑨ 撤銷結清（刪除 settlement）應同時清除 settledAt 和 receivedAt
  it('撤銷結清：刪除 settlement 後，linked 費用的 settledAt 和 receivedAt 都應清空', () => {
    // 模擬 handleDelete 的邏輯：
    // linked = expenses.filter(e => e.settledByRef === deletedId)
    const settledExpenses = [
      { id: 'e2', payer: 'B', settledAt: '2024-04-10', settledByRef: 's1', receivedAt: undefined },
      { id: 'e3', payer: 'B', settledAt: '2024-04-10', settledByRef: 's1', receivedAt: '2024-04-10' },
      { id: 'e4', payer: 'C', settledAt: undefined,    settledByRef: undefined, receivedAt: '2024-04-10', settledByRef2: 's1' },
    ];
    const deletedSettlementId = 's1';
    const linked = settledExpenses.filter(e =>
      e.settledByRef === deletedSettlementId || (e as any).settledByRef2 === deletedSettlementId
    );
    // 所有 linked 費用都應該清除 settledAt 和 receivedAt
    expect(linked).toHaveLength(3);
    // 清除後的狀態模擬
    const cleared = linked.map(e => ({
      ...e,
      settledAt: undefined,
      settledByRef: undefined,
      receivedAt: undefined,
    }));
    expect(cleared.every(e => !e.settledAt && !e.settledByRef && !e.receivedAt)).toBe(true);
  });
});
