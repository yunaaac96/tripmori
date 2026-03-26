// currency.ts
export const RATES: Record<string, number> = {
  TWD: 1, JPY: 0.22, USD: 32.0, EUR: 34.5, KRW: 0.024, THB: 0.89,
};
export const toTWD = (amount: number, currency: string) =>
  Math.round(amount * (RATES[currency] ?? 1));
export const formatCurrency = (amount: number, currency: string) =>
  new Intl.NumberFormat('zh-TW', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
