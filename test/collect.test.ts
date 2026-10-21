import { describe, expect, it } from 'vitest';
import { collect, type SourceChains } from '../src/collect';
import { parseDecimal } from '../src/decimal';
import type { FxReading, LatestDocument, Reading, Source, UsdtReading } from '../src/model';

const NOW = new Date('2026-10-21T13:00:00Z');

function reading(value: string, effectiveDate = '2026-10-21'): Reading {
  return { value: parseDecimal(value), effectiveDate };
}

function source<T>(name: string, result: T): Source<T> {
  return { name, read: async () => result };
}

function failing<T>(name: string, message: string): Source<T> {
  return {
    name,
    read: async () => {
      throw new Error(message);
    },
  };
}

function usdt(value: string): UsdtReading {
  return { ...reading(value), bid: parseDecimal(value), ask: parseDecimal(value) };
}

function fx(entries: Record<string, string>, effectiveDate = '2026-10-20'): FxReading {
  return {
    effectiveDate,
    perUsd: new Map(Object.entries(entries).map(([code, value]) => [code, parseDecimal(value)])),
  };
}

function chains(overrides: Partial<SourceChains> = {}): SourceChains {
  return {
    bcvUsd: [source('dolarapi', reading('883.3963'))],
    bcvEur: [source('dolarapi', reading('993.175958'))],
    usdt: [source('criptoya', usdt('1005.65'))],
    fx: [source('currency-api', fx({ COP: '3174.07' }))],
    ...overrides,
  };
}

describe('collect', () => {
  it('publishes every rate with its source and capture time', async () => {
    const { latest } = await collect(chains(), null, NOW, () => undefined);

    expect(latest.updatedAt).toBe('2026-10-21T13:00:00.000Z');
    expect(latest.rates.bcvUsd).toEqual({
      value: '883.3963',
      effectiveDate: '2026-10-21',
      source: 'dolarapi',
      fetchedAt: '2026-10-21T13:00:00.000Z',
    });
    expect(latest.rates.usdt).toMatchObject({ value: '1005.65', bid: '1005.65', ask: '1005.65' });
    expect(latest.rates.fx['COP']?.value).toBe('3174.07');
  });

  it('falls back to the next source and reports the failure', async () => {
    const warnings: string[] = [];

    const { latest } = await collect(
      chains({
        usdt: [failing('criptoya', 'timeout'), source('binance-p2p', usdt('1007.1'))],
      }),
      null,
      NOW,
      (message) => warnings.push(message),
    );

    expect(latest.rates.usdt).toMatchObject({ value: '1007.1', source: 'binance-p2p' });
    expect(warnings).toEqual(['criptoya: timeout']);
  });

  it('keeps the previous value, with its old capture time, when every source fails', async () => {
    const previous = (await collect(chains(), null, new Date('2026-10-21T12:00:00Z'), () => {}))
      .latest;

    const { latest, fresh } = await collect(
      chains({ bcvUsd: [failing('dolarapi', 'down')] }),
      previous,
      NOW,
      () => undefined,
    );

    expect(fresh.bcvUsd).toBeNull();
    expect(latest.rates.bcvUsd?.fetchedAt).toBe('2026-10-21T12:00:00.000Z');
    expect(latest.rates.usdt?.fetchedAt).toBe('2026-10-21T13:00:00.000Z');
  });

  it('fills each foreign currency from the first source that has it', async () => {
    const { latest } = await collect(
      chains({
        fx: [
          source('currency-api', fx({ COP: '3174.07' })),
          source('open-er-api', fx({ COP: '3153.77', PEN: '3.43' }, '2026-10-21')),
        ],
      }),
      null,
      NOW,
      () => undefined,
    );

    expect(latest.rates.fx['COP']).toMatchObject({ value: '3174.07', source: 'currency-api' });
    expect(latest.rates.fx['PEN']).toMatchObject({ value: '3.43', source: 'open-er-api' });
  });

  it('keeps foreign currencies that no source returned this time', async () => {
    const previous: LatestDocument = (await collect(chains(), null, NOW, () => {})).latest;

    const { latest } = await collect(
      chains({ fx: [failing('currency-api', 'down')] }),
      previous,
      NOW,
      () => undefined,
    );

    expect(latest.rates.fx['COP']?.value).toBe('3174.07');
  });
});
