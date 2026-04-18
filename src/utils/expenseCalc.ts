/**
 * expenseCalc.ts
 * Pure calculation functions for expense splitting, member stats, and settlements.
 * Extracted from Expense/index.tsx so they can be unit-tested independently.
 */

// ── Currency conversion ───────────────────────────────────────────────────────
export const JPY_TO_TWD = 0.218; // approximate

export const CURRENCY_TO_TWD: Record<string, number> = {
  TWD: 1, JPY: JPY_TO_TWD,
  KRW: 0.024, IDR: 0.0021, EUR: 36, USD: 33, GBP: 42, AUD: 21, NZD: 19,
  CAD: 24, CHF: 37, SGD: 24, HKD: 4.1, MOP: 4.1, CNY: 4.6, THB: 0.9,
  MYR: 7.4, VND: 0.0013, PHP: 0.58, AED: 9, SAR: 8.8, TRY: 0.97,
  ZAR: 1.8, MXN: 1.7, BRL: 6.5, INR: 0.4,
};

export const toTWDCalc = (amount: number, currency: string): number =>
  Math.round(amount * (CURRENCY_TO_TWD[currency] ?? 1));

// ── Percentage split helpers ──────────────────────────────────────────────────

/**
 * Generate equal percentages for `names`, rounded to nearest 5%.
 * Any rounding remainder goes to names[0].
 */
export const getEqualPcts = (names: string[]): Record<string, number> => {
  if (names.length === 0) return {};
  const base = Math.floor(100 / names.length / 5) * 5;
  const remainder = 100 - base * names.length;
  const pcts: Record<string, number> = {};
  names.forEach((n, i) => { pcts[n] = base + (i === 0 ? remainder : 0); });
  return pcts;
};

/**
 * After the user changes one person's %, redistribute the remaining % among
 * the others proportionally (rounded to 5%), guaranteeing total == 100.
 */
export const normalizePcts = (
  pcts: Record<string, number>,
  changedName: string,
  newVal: number,
): Record<string, number> => {
  const names = Object.keys(pcts);
  const others = names.filter(n => n !== changedName);
  const remaining = 100 - newVal;
  const otherTotal = others.reduce((s, n) => s + pcts[n], 0);
  const result: Record<string, number> = { ...pcts, [changedName]: newVal };
  if (otherTotal === 0) {
    const perOther = Math.floor(remaining / others.length / 5) * 5;
    const leftover = remaining - perOther * others.length;
    others.forEach((n, i) => { result[n] = perOther + (i === 0 ? leftover : 0); });
  } else {
    let distributed = 0;
    others.forEach((n, i) => {
      if (i === others.length - 1) {
        result[n] = remaining - distributed;
      } else {
        const share = Math.round((pcts[n] / otherTotal) * remaining / 5) * 5;
        result[n] = Math.max(5, share);
        distributed += result[n];
      }
    });
    const total = Object.values(result).reduce((s, v) => s + v, 0);
    if (total !== 100) {
      const diff = 100 - total;
      result[others[0]] = Math.max(5, result[others[0]] + diff);
    }
  }
  return result;
};

// ── Expense type ──────────────────────────────────────────────────────────────
export interface Expense {
  id?: string;
  payer: string;
  amount: number;
  currency?: string;
  amountTWD?: number;
  splitWith?: string[];
  splitMode?: 'equal' | 'weighted' | 'amount';
  percentages?: Record<string, number>;
  customAmounts?: Record<string, string | number>;
  category?: string;
  isPrivate?: boolean;
  privateOwnerUid?: string;
}

export interface MemberStat {
  name: string;
  paid: number;
  rawPaid: number;
  owed: number;
  net: number;
}

// ── Per-member share calculator ───────────────────────────────────────────────

/**
 * Returns how much (in TWD) `name` owes for expense `e`.
 * Returns 0 for private expenses or if name is not in splitWith.
 */
export const getPersonalShare = (
  e: Expense,
  name: string,
  memberNames: string[],
): number => {
  if (e.isPrivate) return 0;
  const sw = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
  if (!sw.includes(name)) return 0;
  const eAmt = e.amountTWD ?? toTWDCalc(e.amount ?? 0, e.currency ?? 'JPY');
  if (e.splitMode === 'weighted' && e.percentages?.[name] != null) {
    return Math.ceil(eAmt * e.percentages[name] / 100);
  }
  if (e.splitMode === 'amount' && e.customAmounts?.[name] != null) {
    return toTWDCalc(Number(e.customAmounts[name]) || 0, e.currency ?? 'JPY');
  }
  // Equal split: distribute remainder to lexicographically earliest names
  const sortedSw = [...sw].sort();
  const myIdx = sortedSw.indexOf(name);
  const perPerson = Math.floor(eAmt / sortedSw.length);
  const remainder = eAmt - perPerson * sortedSw.length;
  return perPerson + (myIdx < remainder ? 1 : 0);
};

// ── Member statistics ─────────────────────────────────────────────────────────

/**
 * Computes paid / owed / net for each member across all expenses.
 * Settlement expenses are excluded from `owed` but tracked separately to
 * reduce the "paid" figure (money already returned to the creditor).
 */
export const computeMemberStats = (
  expenses: Expense[],
  memberNames: string[],
): MemberStat[] => {
  // Settlements received: payer=A, splitWith=[B] means B received money from A
  const settlementsReceivedByName: Record<string, number> = {};
  expenses.forEach(e => {
    if (e.isPrivate || e.category !== 'settlement') return;
    const sw = e.splitWith && e.splitWith.length > 0 ? e.splitWith : [];
    const eAmt = e.amountTWD ?? toTWDCalc(e.amount ?? 0, e.currency ?? 'JPY');
    sw.forEach(n => {
      settlementsReceivedByName[n] = (settlementsReceivedByName[n] || 0) + eAmt;
    });
  });

  return memberNames.map(name => {
    const paid = expenses
      .filter(e => !e.isPrivate && e.payer === name)
      .reduce((s, e) => s + (e.amountTWD ?? toTWDCalc(e.amount ?? 0, e.currency ?? 'JPY')), 0);

    const owed = expenses.reduce((s, e) => {
      if (e.isPrivate) return s;
      const sw = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
      if (!sw.includes(name)) return s;
      const eAmt = e.amountTWD ?? toTWDCalc(e.amount ?? 0, e.currency ?? 'JPY');
      if (e.splitMode === 'weighted' && e.percentages && Object.keys(e.percentages).length > 0) {
        const pct = e.percentages[name] ?? Math.floor(100 / sw.length);
        return s + Math.ceil(eAmt * pct / 100);
      }
      if (e.splitMode === 'amount' && e.customAmounts && e.customAmounts[name] != null) {
        return s + toTWDCalc(Number(e.customAmounts[name]) || 0, e.currency ?? 'JPY');
      }
      const sortedSw = [...sw].sort();
      const myIdx = sortedSw.indexOf(name);
      const perPerson = Math.floor(eAmt / sortedSw.length);
      const remainder = eAmt - perPerson * sortedSw.length;
      return s + perPerson + (myIdx < remainder ? 1 : 0);
    }, 0);

    const net = paid - owed;
    const netPaid = paid - (settlementsReceivedByName[name] || 0);
    return { name, paid: netPaid, rawPaid: paid, owed, net };
  });
};

// ── Settlement algorithm ──────────────────────────────────────────────────────

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

/**
 * Greedy creditor-debtor matching: finds the minimum number of transfers
 * to settle all debts. Amounts are rounded up (Math.ceil) so creditors
 * always receive at least what they're owed.
 */
export const computeSettlements = (memberStats: MemberStat[]): Settlement[] => {
  const result: Settlement[] = [];
  const creditors = memberStats
    .filter(m => m.net > 0)
    .map(m => ({ name: m.name, amt: m.net }))
    .sort((a, b) => b.amt - a.amt);
  const debtors = memberStats
    .filter(m => m.net < 0)
    .map(m => ({ name: m.name, amt: Math.abs(m.net) }))
    .sort((a, b) => b.amt - a.amt);

  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const transfer = Math.min(creditors[ci].amt, debtors[di].amt);
    if (transfer > 0) {
      result.push({ from: debtors[di].name, to: creditors[ci].name, amount: Math.ceil(transfer) });
    }
    creditors[ci].amt -= transfer;
    debtors[di].amt -= transfer;
    if (creditors[ci].amt < 1) ci++;
    if (debtors[di].amt < 1) di++;
  }
  return result;
};
