import { describe, expect, it } from 'vitest';
import { divide, formatDecimal, mean, median, parseDecimal } from '../src/decimal';

describe('decimal', () => {
  it('parses numbers and strings to six decimals, rounding half up', () => {
    expect(formatDecimal(parseDecimal(883.3963))).toBe('883.3963');
    expect(formatDecimal(parseDecimal('1007.4995'))).toBe('1007.4995');
    expect(formatDecimal(parseDecimal('0.0000005'))).toBe('0.000001');
    expect(formatDecimal(parseDecimal('0.00000049'))).toBe('0');
    expect(formatDecimal(parseDecimal(1.2113977e-5))).toBe('0.000012');
    expect(formatDecimal(parseDecimal('-2.5'))).toBe('-2.5');
  });

  it('rejects what is not a decimal', () => {
    expect(() => parseDecimal('1,5')).toThrow('Not a decimal');
    expect(() => parseDecimal(Number.NaN)).toThrow('Not a finite number');
  });

  it('divides exactly with a single half-up rounding', () => {
    expect(formatDecimal(divide(parseDecimal('883.3963'), parseDecimal('0.89075')))).toBe(
      '991.744373',
    );
    expect(formatDecimal(divide(parseDecimal('2'), parseDecimal('3')))).toBe('0.666667');
    expect(() => divide(1n, 0n)).toThrow('Division by zero');
  });

  it('averages and takes medians', () => {
    expect(formatDecimal(mean([parseDecimal('1004.8'), parseDecimal('1006.5')]))).toBe('1005.65');
    expect(formatDecimal(median(['3', '1', '2'].map((value) => parseDecimal(value))))).toBe('2');
    expect(formatDecimal(median(['4', '1', '2', '3'].map((value) => parseDecimal(value))))).toBe(
      '2.5',
    );
    expect(() => median([])).toThrow('Median of no values');
  });
});
