import { parseDecimal, type Decimal } from '../decimal';

export function pickCurrencies(
  rates: Record<string, number>,
  codes: readonly string[],
  key: (code: string) => string = (code) => code,
): Map<string, Decimal> {
  const picked = new Map<string, Decimal>();
  for (const code of codes) {
    const value = rates[key(code)];
    if (value !== undefined && value > 0) {
      picked.set(code, parseDecimal(value));
    }
  }
  return picked;
}
