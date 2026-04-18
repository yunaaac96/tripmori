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
    it('各人金額獨立（TWD 直接用，不再換算）', () => {
      const e = {
        payer: 'Alice', amount: 0, currency: 'TWD',
        splitMode: 'amount' as const,
        customAmounts: { Alice: '1500', Bob: '800' },
        splitWith: ['Alice', 'Bob'],
      };
      expect(getPersonalShare(e, 'Alice', members)).toBe(1500);
      expect(getPersonalShare(e, 'Bob', members)).toBe(800);
    });

    it('自訂金額支援外幣換算', () => {
      // Alice pays 1000 JPY custom
      const e = {
        payer: 'Bob', amount: 0, currency: 'JPY',
        splitMode: 'amount' as const,
        customAmounts: { Alice: '1000' },
        splitWith: ['Alice'],
      };
      const expected = toTWDCalc(1000, 'JPY');
      expect(getPersonalShare(e, 'Alice', members)).toBe(expected);
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
