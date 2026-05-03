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
  isIncome?: boolean;
  amountTWD?: number;                   // effective TWD at record time (rate × amount × card fee)
  splitWith?: string[];
  splitMode?: 'equal' | 'weighted' | 'amount';
  percentages?: Record<string, number>;
  customAmounts?: Record<string, string | number>;
  category?: string;
  isPrivate?: boolean;
  privateOwnerUid?: string;
  // Display fields (stored in Firestore, used in Personal Statement)
  description?: string;
  date?: string;
  // ── Cross-currency / settlement helpers ─────────────────────────────
  // Per-expense FX rate override entered by the user at record time. Takes
  // priority over the trip-level rate; when absent we fall back to
  // trip.exchangeRate (if currency matches trip) → CURRENCY_TO_TWD table.
  exchangeRate?: number;
  // Foreign-card fee %. Only meaningful when paymentMethod === 'card' AND
  // currency !== 'TWD'. Default 1.5%. Captured into amountTWD at record time.
  cardFeePercent?: number;
  // Post-statement actual TWD (for credit-card expenses whose true settled
  // amount only surfaces later). Present = takes precedence over amountTWD.
  actualTWD?: number;
  // "等卡單" flag — expense excluded from memberStats / settlement
  // suggestions until cleared (usually auto-cleared when actualTWD fills).
  awaitCardStatement?: boolean;
  // Legacy (batch feature, removed) — kept so we can still strip it off
  // existing docs via deleteField() without TS complaints.
  settlementBatch?: number | null;
  adjustmentOf?: string | null;
  // Settlement tracking
  settledAt?: string;
  settledByRef?: string | null;
  /** ISO date when the payer confirmed they received repayment for this expense. */
  receivedAt?: string;
  // Two-phase settlement status (only on category==='settlement' records)
  // Absent = legacy confirmed (backward compat)
  status?: 'pending' | 'confirmed';
  /** ISO date when debtor marked as paid (pending phase). */
  paidAt?: string;
  /** ISO date when creditor confirmed receipt (confirmed phase). */
  confirmedAt?: string;
  /**
   * Links a settlement record to a specific expense (per-expense "結清這筆" flow).
   * When set, this settlement covers only that one expense for this debtor,
   * rather than a whole pair-level batch.
   */
  expenseRef?: string;
}

// ── Resolve effective TWD ────────────────────────────────────────────────────
// Priority: actualTWD (post-statement truth) > stored amountTWD (value we
// wrote when the expense was created) > fallback compute via CURRENCY_TO_TWD.
export const effectiveTWD = (e: Expense): number => {
  if (e.actualTWD != null) return e.actualTWD;
  if (e.amountTWD != null) return e.amountTWD;
  return toTWDCalc(e.amount || 0, e.currency || 'TWD');
};

// ── Compute TWD amount for a NEW / edited expense at save time ──────────────
// Uses per-expense FX rate if entered, else trip-level rate (only when
// currencies match), else the hardcoded table. Applies card fee % when
// payment method is card and currency is not TWD.
export const computeAmountTWD = (
  amount: number,
  currency: string,
  opts: {
    exchangeRate?: number | null;         // per-expense override
    tripCurrency?: string | null;
    tripRate?: number | null;             // trip-wide rate for its primary currency
    paymentMethod?: 'cash' | 'card';
    cardFeePercent?: number | null;
  } = {}
): number => {
  const { exchangeRate, tripCurrency, tripRate, paymentMethod, cardFeePercent } = opts;
  let rate: number;
  if (exchangeRate && exchangeRate > 0) {
    rate = exchangeRate;
  } else if (tripRate && tripRate > 0 && tripCurrency && tripCurrency === currency) {
    rate = tripRate;
  } else {
    rate = CURRENCY_TO_TWD[currency] ?? 1;
  }
  let twd = amount * rate;
  if (paymentMethod === 'card' && currency !== 'TWD') {
    const fee = cardFeePercent != null ? cardFeePercent : 1.5;
    twd = twd * (1 + fee / 100);
  }
  return Math.round(twd);
};

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
  const eAmt = effectiveTWD(e);
  if (e.splitMode === 'weighted' && e.percentages != null) {
    // Largest-remainder method: guarantees sum(shares) === eAmt (no phantom over-allocation)
    const exact = (pct: number) => eAmt * pct / 100;
    const sorted = [...sw].sort();           // deterministic order for remainder distribution
    const floors = sorted.map(n => Math.floor(exact(e.percentages![n] ?? 0)));
    const allocated = floors.reduce((s, v) => s + v, 0);
    const rem = eAmt - allocated;
    const fracs = sorted.map((n, i) => ({ idx: i, frac: exact(e.percentages![n] ?? 0) - floors[i] }))
      .sort((a, b) => b.frac - a.frac);
    const myIdx = sorted.indexOf(name);
    const myRankInFracs = fracs.findIndex(f => f.idx === myIdx);
    return floors[myIdx] + (myRankInFracs < rem ? 1 : 0);
  }
  if (e.splitMode === 'amount' && e.customAmounts?.[name] != null) {
    // Compute share proportionally from effectiveTWD so that sum(shares) == effectiveTWD
    // regardless of which FX rate was used when the expense was recorded.
    const totalCustom = Object.values(e.customAmounts)
      .reduce((s, v) => s + (Number(v) || 0), 0);
    if (totalCustom <= 0) return 0;
    return Math.round(eAmt * (Number(e.customAmounts[name]) || 0) / totalCustom);
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
  // Exclude expenses that are waiting on a credit-card statement — the real
  // TWD isn't known yet, so counting them would inflate / misstate balances.
  // Also exclude pending settlement records (debtor claimed paid, creditor not yet confirmed)
  // so that suggestion amounts remain correct until both parties confirm.
  const active = expenses.filter(e =>
    !e.awaitCardStatement &&
    !(e.category === 'settlement' && e.status === 'pending'),
  );

  // Settlements received: payer=A, splitWith=[B] means B received money from A
  const settlementsReceivedByName: Record<string, number> = {};
  active.forEach(e => {
    if (e.isPrivate || e.category !== 'settlement') return;
    const sw = e.splitWith && e.splitWith.length > 0 ? e.splitWith : [];
    const eAmt = effectiveTWD(e);
    sw.forEach(n => {
      settlementsReceivedByName[n] = (settlementsReceivedByName[n] || 0) + eAmt;
    });
  });

  return memberNames.map(name => {
    // Income entries: the payer "received" cash on behalf of the group, so we
    // subtract income from their paid total (they now owe that money to others).
    const paid = active
      .filter(e => !e.isPrivate && e.payer === name)
      .reduce((s, e) => e.isIncome ? s - effectiveTWD(e) : s + effectiveTWD(e), 0);

    const owed = active.reduce((s, e) => {
      if (e.isPrivate) return s;
      const sw = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
      if (!sw.includes(name)) return s;
      const eAmt = effectiveTWD(e);
      // Income entries reduce everyone's owed share (they all benefit from the refund/income).
      const sign = e.isIncome ? -1 : 1;
      if (e.splitMode === 'weighted' && e.percentages && Object.keys(e.percentages).length > 0) {
        // Largest-remainder method — same algorithm as getPersonalShare
        const exact2 = (pct: number) => eAmt * pct / 100;
        const sorted2 = [...sw].sort();
        const floors2 = sorted2.map(n2 => Math.floor(exact2(e.percentages![n2] ?? 0)));
        const allocated2 = floors2.reduce((a, v) => a + v, 0);
        const rem2 = eAmt - allocated2;
        const fracs2 = sorted2.map((n2, i) => ({ idx: i, frac: exact2(e.percentages![n2] ?? 0) - floors2[i] }))
          .sort((a, b) => b.frac - a.frac);
        const myIdx2 = sorted2.indexOf(name);
        const myRank2 = fracs2.findIndex(f => f.idx === myIdx2);
        const share2 = floors2[myIdx2] + (myRank2 < rem2 ? 1 : 0);
        return s + sign * share2;
      }
      if (e.splitMode === 'amount' && e.customAmounts && e.customAmounts[name] != null) {
        // Use proportional split from effectiveTWD — avoids FX-rate mismatch between
        // the stored amountTWD (may use custom rate) and the fallback toTWDCalc table.
        const totalCustom = Object.values(e.customAmounts)
          .reduce((s2, v) => s2 + (Number(v) || 0), 0);
        const share = totalCustom > 0
          ? Math.round(eAmt * (Number(e.customAmounts[name]) || 0) / totalCustom)
          : 0;
        return s + sign * share;
      }
      const sortedSw = [...sw].sort();
      const myIdx = sortedSw.indexOf(name);
      const perPerson = Math.floor(eAmt / sortedSw.length);
      const remainder = eAmt - perPerson * sortedSw.length;
      return s + sign * (perPerson + (myIdx < remainder ? 1 : 0));
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

// ── Personal Statement ────────────────────────────────────────────────────────

/** A single line in the "My Payments" or "My Shares" section. */
export interface StatementLineItem {
  id: string;
  date: string;
  description: string;
  category: string;
  isIncome: boolean;
  origAmount: number;
  origCurrency: string;
  /** Who paid for this expense. */
  payer: string;
  /** Effective TWD of the whole expense (effectiveTWD priority chain). */
  effectiveTWD: number;
  /** This member's personal share in TWD for this expense. */
  myShare: number;
  splitMode: 'equal' | 'weighted' | 'amount';
  /** Names of everyone in the split, including this member. */
  splitWith: string[];
  /** Grayed-out in UI; excluded from totals (same rule as computeMemberStats). */
  awaitCardStatement: boolean;
  /** Date this expense was marked settled (ISO date string). Undefined = not yet settled. */
  settledAt?: string;
  /** Date the payer confirmed they received repayment for this expense. */
  receivedAt?: string;
}

/**
 * Per-member breakdown: what they paid, what they owe, and the resulting net.
 * Excludes settlement and private expenses from the item lists; totals
 * are computed from active (non-awaitCardStatement) items only so they
 * match computeMemberStats numbers exactly when no settlements are recorded.
 */
export interface PersonalStatement {
  memberName: string;
  // ── Section 1: My Payments ──────────────────────────────────────────
  /** Non-private, non-settlement expenses where this member is the payer. */
  myPayments: StatementLineItem[];
  /** Sum of effectiveTWD for active payment items (income subtracts). */
  myPaymentsTotal: number;
  /** Portion of myPaymentsTotal paid on behalf of others (= total − own share). */
  myAdvancedTotal: number;
  // ── Section 2: My Shares ────────────────────────────────────────────
  /** Non-private, non-settlement expenses where this member is a participant. */
  myShares: StatementLineItem[];
  /** Sum of myShare for active share items (income subtracts). */
  mySharesTotal: number;
  // ── Section 3: Net ──────────────────────────────────────────────────
  /** myPaymentsTotal − mySharesTotal. Positive = creditor, negative = debtor. */
  net: number;
  /** True if any item is still awaiting a credit-card statement. */
  hasAwaitingItems: boolean;
}

/**
 * Build the Personal Statement for one member from the raw expense list.
 * Pure function — no side effects, safe to call in render.
 */
export const buildPersonalStatement = (
  expenses: Expense[],
  memberName: string,
  memberNames: string[],
): PersonalStatement => {
  const toLineItem = (e: Expense): StatementLineItem => {
    const sw = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
    return {
      id: e.id || '',
      date: e.date || '',
      description: e.description || '',
      category: e.category || 'other',
      isIncome: !!e.isIncome,
      origAmount: e.amount || 0,
      origCurrency: e.currency || 'TWD',
      payer: e.payer || '',
      effectiveTWD: effectiveTWD(e),
      myShare: getPersonalShare(e, memberName, memberNames),
      splitMode: e.splitMode || 'equal',
      splitWith: sw,
      awaitCardStatement: !!e.awaitCardStatement,
      settledAt: e.settledAt,
      receivedAt: e.receivedAt,
    };
  };

  // Only non-private, non-settlement expenses appear in the statement sections.
  const relevant = expenses.filter(e => !e.isPrivate && e.category !== 'settlement');

  // Section 1: expenses where this member is the payer, sorted by date.
  const myPayments = relevant
    .filter(e => e.payer === memberName)
    .map(toLineItem)
    .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));

  // Section 2: expenses where this member is a participant (includes self-paid).
  const myShares = relevant
    .filter(e => {
      const sw = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;
      return sw.includes(memberName);
    })
    .map(toLineItem)
    .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));

  // Totals — exclude awaitCardStatement rows (mirrors computeMemberStats behaviour).
  const activePayments = myPayments.filter(i => !i.awaitCardStatement);
  const activeShares   = myShares.filter(i => !i.awaitCardStatement);

  const myPaymentsTotal = activePayments.reduce(
    (s, i) => s + (i.isIncome ? -i.effectiveTWD : i.effectiveTWD), 0,
  );
  const myOwnShareInPayments = activePayments.reduce(
    (s, i) => s + (i.isIncome ? -i.myShare : i.myShare), 0,
  );
  const mySharesTotal = activeShares.reduce(
    (s, i) => s + (i.isIncome ? -i.myShare : i.myShare), 0,
  );

  return {
    memberName,
    myPayments,
    myPaymentsTotal,
    myAdvancedTotal: myPaymentsTotal - myOwnShareInPayments,
    myShares,
    mySharesTotal,
    net: myPaymentsTotal - mySharesTotal,
    hasAwaitingItems:
      myPayments.some(i => i.awaitCardStatement) ||
      myShares.some(i => i.awaitCardStatement),
  };
};

// ── Expense insertion-date helper ────────────────────────────────────────────
/**
 * Returns the "real" insertion date (YYYY-MM-DD) for an expense.
 *
 * Priority:
 *   1. createdAt (Firestore Timestamp | Date | ISO string) — actual write time,
 *      immune to backdating by the user.
 *   2. date field — user-supplied, used only as fallback for old records that
 *      predate the createdAt field.
 *
 * This is the value used when deciding whether an expense was created before
 * or after a settlement was confirmed.
 */
export const getExpenseInsertDate = (e: Expense): string => {
  const raw = (e as any).createdAt;
  if (raw) {
    // Firestore Timestamp: { seconds, nanoseconds } with optional toDate()
    if (typeof raw.toDate === 'function') {
      return (raw.toDate() as Date).toISOString().slice(0, 10);
    }
    if (typeof raw.seconds === 'number') {
      return new Date(raw.seconds * 1000).toISOString().slice(0, 10);
    }
    if (raw instanceof Date) {
      return raw.toISOString().slice(0, 10);
    }
    if (typeof raw === 'string') {
      return raw.slice(0, 10);
    }
  }
  // Fallback for legacy expenses without createdAt
  return (e.date || '').slice(0, 10);
};

// ── Settlement pair helpers (Method B) ────────────────────────────────────────

/**
 * Build a map of confirmed settlement pairs from the expense list.
 * Key: "debtor→creditor", Value: confirmed date (ISO string).
 * Records without a `status` field are treated as confirmed (backward compat).
 * Only the most recent date per pair is kept.
 * Still used for `isConfirmedPair` boolean checks in the UI.
 */
export const getConfirmedSettlementPairMap = (expenses: Expense[]): Map<string, string> => {
  const map = new Map<string, string>();
  expenses.forEach(e => {
    if (e.category !== 'settlement') return;
    if (e.status === 'pending') return;
    const to = e.splitWith?.[0];
    if (!e.payer || !to) return;
    const key = `${e.payer}→${to}`;
    const date = (e.confirmedAt || e.date || '').slice(0, 10);
    if (!map.has(key) || date > (map.get(key) ?? '')) {
      map.set(key, date);
    }
  });
  return map;
};

/**
 * Build a set of confirmed per-expense settlements.
 * Entry format: "expenseId|debtorName"
 * A per-expense settlement is a confirmed settlement record that has an expenseRef field.
 * Used to show 已結清 badge on individual expense cards without needing a full pair settlement.
 */
export const getPerExpenseConfirmedSet = (expenses: Expense[]): Set<string> => {
  const set = new Set<string>();
  expenses.forEach(e => {
    if (e.category !== 'settlement') return;
    if (e.status === 'pending') return;
    if (!e.expenseRef) return;
    const to = e.splitWith?.[0];
    if (!e.payer || !to) return;
    // e.payer = debtor, to = creditor; expenseRef = the expense being settled
    set.add(`${e.expenseRef}|${e.payer}`);
  });
  return set;
};

/**
 * Build a map of cumulative confirmed settlement amounts per pair.
 * Key: "debtor→creditor", Value: total confirmed TWD paid so far.
 * Used together with pairDebtsMap (remaining debt from computeSettlements)
 * to determine if a pair is fully settled.
 */
export const getConfirmedSettlementAmountsMap = (expenses: Expense[]): Map<string, number> => {
  const map = new Map<string, number>();
  expenses.forEach(e => {
    if (e.category !== 'settlement') return;
    if (e.status === 'pending') return;
    // Exclude per-expense settlements (those with expenseRef): they contribute to
    // perExpenseConfirmedSet for individual expense badges but must NOT trigger the
    // pair-level isFullySettled check — otherwise settling one expense whose share
    // happens to equal the net pair debt would incorrectly mark ALL shared expenses
    // between the pair as settled.
    if (e.expenseRef) return;
    const to = e.splitWith?.[0];
    if (!e.payer || !to) return;
    const key = `${e.payer}→${to}`;
    const amt = effectiveTWD(e);
    map.set(key, (map.get(key) ?? 0) + amt);
  });
  return map;
};

/**
 * Returns the settlement badge state for an expense from a specific viewer's perspective.
 * 'settled'  → viewer is a debtor for this expense and their pair is fully settled,
 *              or a per-expense settlement specifically covers this expense for this debtor.
 * 'received' → viewer is the payer (creditor) and all debtors' pairs are fully settled
 *              (or each debtor has a per-expense settlement for this expense).
 * 'none'     → outstanding debt still remains for this viewer's pair
 *
 * Uses amount-based comparison for pair-level: a pair is fully settled when
 *   confirmedAmountsMap[pair] > 0  AND  pairDebtsMap[pair] == 0
 * (i.e. at least one payment has been confirmed and no remaining debt exists).
 * This correctly handles partial payments: partial payment alone does NOT
 * mark older expenses as settled.
 *
 * Also checks:
 *   - legacy stamp fields (settledAt / receivedAt) for backward compatibility
 *   - perExpenseConfirmedSet for the "結清這筆" per-expense settlement flow
 */
export const getSettlementBadge = (
  e: Expense,
  viewerName: string,
  memberNames: string[],
  confirmedAmountsMap: Map<string, number>,
  pairDebtsMap: Map<string, number>,
  perExpenseConfirmedSet?: Set<string>,
  /**
   * Whole-trip-settled signal: true when the trip's overall settlement plan is
   * empty (no remaining debts) AND at least one confirmed settlement exists.
   * In that case minimum-transfer routing may have left individual pairs with
   * no direct confirmed amount — but the trip as a whole is closed, so all
   * shared expenses should be treated as settled from each party's POV.
   */
  wholeTripSettled?: boolean,
): 'settled' | 'received' | 'none' => {
  // Private expenses never participate in settlements — the principal is the
  // sole party. Bail early.
  if (e.isPrivate) return 'none';

  const sw = e.splitWith && e.splitWith.length > 0 ? e.splitWith : memberNames;

  /** True when this specific expense has a per-expense settlement for this debtor. */
  const isPerExpenseSettled = (debtorName: string): boolean =>
    !!e.id && !!perExpenseConfirmedSet?.has(`${e.id}|${debtorName}`);

  // Locking semantics (deliberately conservative — see Bali refund saga):
  // an expense only counts as "settled" / "received" when ONE of:
  //   1. legacy settledAt / receivedAt stamp (Method A backward compat)
  //   2. the entire trip is settled (wholeTripSettled — every member's net is
  //      zero AND at least one settlement was confirmed)
  //   3. THIS specific expense was per-expense-settled (perExpenseConfirmedSet)
  // Pair-level "math is balanced" alone does NOT lock individual expenses,
  // because new activity (e.g. a refund) can open new debts that the
  // pair-level check misses. Members keep the freedom to per-expense-settle
  // any single line until the whole trip closes.
  // The confirmedAmountsMap / pairDebtsMap parameters are still part of the
  // signature for backward compat, but no longer drive lock state.
  void confirmedAmountsMap; void pairDebtsMap;

  // Viewer is a debtor for this expense (in splitWith, not the payer)
  if (e.payer !== viewerName && sw.includes(viewerName)) {
    if (e.settledAt) return 'settled';                       // legacy stamp
    if (wholeTripSettled) return 'settled';                  // entire trip closed
    if (isPerExpenseSettled(viewerName)) return 'settled';   // this line specifically settled
  }

  // Viewer is the payer (creditor): show 'received' when whole trip closed,
  // or when every debtor on this expense was per-expense-settled.
  if (e.payer === viewerName) {
    if (e.receivedAt) return 'received';                     // legacy stamp
    const debtors = sw.filter(n => n !== viewerName);
    if (debtors.length === 0) return 'none';
    if (wholeTripSettled) return 'received';
    if (debtors.every(isPerExpenseSettled)) return 'received';
  }

  return 'none';
};
