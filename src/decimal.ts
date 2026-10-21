const SCALE = 6;
const FACTOR = 10n ** BigInt(SCALE);

/** Fixed-point decimal scaled by 10^6, so rates keep exactly six decimals without floats. */
export type Decimal = bigint;

export function parseDecimal(input: number | string): Decimal {
  const text = typeof input === 'number' ? numberToPlainString(input) : input.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (match === null) {
    throw new Error(`Not a decimal: ${text}`);
  }
  const [, sign, integer = '0', fraction = ''] = match;
  const padded = fraction.padEnd(SCALE + 1, '0');
  let scaled = BigInt(integer) * FACTOR + BigInt(padded.slice(0, SCALE));
  if (Number(padded[SCALE]) >= 5) {
    scaled += 1n;
  }
  return sign === '-' ? -scaled : scaled;
}

export function formatDecimal(value: Decimal): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const integer = absolute / FACTOR;
  const fraction = (absolute % FACTOR).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fraction === '' ? '' : `.${fraction}`}`;
}

export function divide(dividend: Decimal, divisor: Decimal): Decimal {
  if (divisor === 0n) {
    throw new Error('Division by zero');
  }
  return roundHalfUp(dividend * FACTOR, divisor);
}

export function mean(values: readonly Decimal[]): Decimal {
  if (values.length === 0) {
    throw new Error('Mean of no values');
  }
  return roundHalfUp(
    values.reduce((sum, value) => sum + value, 0n),
    BigInt(values.length),
  );
}

export function median(values: readonly Decimal[]): Decimal {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) {
    throw new Error('Median of no values');
  }
  const lower = sorted[middle - 1];
  return sorted.length % 2 === 1 || lower === undefined ? upper : mean([lower, upper]);
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (n * 2n + d) / (d * 2n);
  return negative ? -quotient : quotient;
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Not a finite number: ${value}`);
  }
  const text = String(value);
  return text.includes('e') ? value.toFixed(SCALE + 1) : text;
}
