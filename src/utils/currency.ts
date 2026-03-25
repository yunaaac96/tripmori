// 硬編碼參考匯率（可之後接真實 API）
const RATES: Record<string, number> = {
  TWD: 1,
  JPY: 0.22,   // 1 JPY ≈ 0.22 TWD
  USD: 32.0,
  EUR: 34.5,
  KRW: 0.024,
  THB: 0.89,
  HKD: 4.1,
  SGD: 23.8,
};

export function toTWD(amount: number, currency: string): number {
  const rate = RATES[currency] ?? 1;
  return Math.round(amount * rate);
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}