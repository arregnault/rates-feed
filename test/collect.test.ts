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
    usdt: [source('bybit-p2p', usdt('1005.65'))],
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
        usdt: [failing('bybit-p2p', 'timeout'), source('okx-p2p', usdt('1007.1'))],
      }),
      null,
      NOW,
      (message) => warnings.push(message),
    );

    expect(latest.rates.usdt).toMatchObject({ value: '1007.1', source: 'okx-p2p' });
    expect(warnings).toEqual(['bybit-p2p: timeout']);
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

  describe('with a previous value', () => {
    async function previous(): Promise<LatestDocument> {
      return (await collect(chains(), null, new Date('2026-10-21T12:00:00Z'), () => {})).latest;
    }

    it('skips a source that jumped too far and takes the next one', async () => {
      const warnings: string[] = [];

      const { latest } = await collect(
        chains({
          bcvUsd: [source('dolarapi', reading('8.833963')), source('open-er-api', reading('884'))],
        }),
        await previous(),
        NOW,
        (message) => warnings.push(message),
      );

      expect(latest.rates.bcvUsd).toMatchObject({ value: '884', source: 'open-er-api' });
      expect(warnings).toEqual(['dolarapi: value moved more than 30% from 883.3963']);
    });

    it('accepts a large move when two sources agree on it', async () => {
      const { latest } = await collect(
        chains({
          bcvUsd: [source('dolarapi', reading('1300')), source('open-er-api', reading('1290'))],
        }),
        await previous(),
        NOW,
        () => undefined,
      );

      expect(latest.rates.bcvUsd).toMatchObject({ value: '1290', source: 'open-er-api' });
    });

    it('keeps the previous value when a large move is not confirmed', async () => {
      const { latest, fresh } = await collect(
        chains({ usdt: [source('bybit-p2p', usdt('2500'))] }),
        await previous(),
        NOW,
        () => undefined,
      );

      expect(fresh.usdt).toBeNull();
      expect(latest.rates.usdt?.value).toBe('1005.65');
    });

    it('checks each foreign currency against its own previous value', async () => {
      const { latest } = await collect(
        chains({
          fx: [
            source('currency-api', fx({ COP: '31.7407' })),
            source('open-er-api', fx({ COP: '3160' }, '2026-10-21')),
          ],
        }),
        await previous(),
        NOW,
        () => undefined,
      );

      expect(latest.rates.fx['COP']).toMatchObject({ value: '3160', source: 'open-er-api' });
    });
  });

  it('never publishes a value that is not positive', async () => {
    const warnings: string[] = [];

    const { fresh } = await collect(
      chains({ bcvUsd: [source('dolarapi', reading('0'))] }),
      null,
      NOW,
      (message) => warnings.push(message),
    );

    expect(fresh.bcvUsd).toBeNull();
    expect(warnings).toEqual(['dolarapi: value is not positive']);
  });

  describe('the BCV next rate', () => {
    const afternoon = new Date('2026-10-21T21:00:00Z');

    it('publishes a reading dated after today as next and takes today from the rest', async () => {
      const { latest, fresh } = await collect(
        chains({
          bcvUsd: [
            source('bcv', reading('884.7496', '2026-10-22')),
            source('dolarapi', reading('883.3963', '2026-10-21')),
          ],
        }),
        null,
        afternoon,
        () => undefined,
      );

      expect(latest.rates.bcvUsd).toMatchObject({ value: '883.3963', source: 'dolarapi' });
      expect(latest.rates.bcvUsdNext).toMatchObject({
        value: '884.7496',
        effectiveDate: '2026-10-22',
        source: 'bcv',
      });
      expect(fresh.bcvUsd?.effectiveDate).toBe('2026-10-21');
    });

    it('keeps the next rate until its date, then drops it', async () => {
      const withNext = (
        await collect(
          chains({ bcvUsd: [source('bcv', reading('884.7496', '2026-10-22'))] }),
          null,
          afternoon,
          () => undefined,
        )
      ).latest;

      const evening = await collect(
        chains({ bcvUsd: [failing('bcv', 'down')] }),
        withNext,
        new Date('2026-10-22T02:00:00Z'),
        () => undefined,
      );
      expect(evening.latest.rates.bcvUsdNext?.value).toBe('884.7496');

      const nextMorning = await collect(
        chains({ bcvUsd: [source('bcv', reading('884.7496', '2026-10-22'))] }),
        evening.latest,
        new Date('2026-10-22T13:00:00Z'),
        () => undefined,
      );
      expect(nextMorning.latest.rates.bcvUsd).toMatchObject({ value: '884.7496', source: 'bcv' });
      expect(nextMorning.latest.rates.bcvUsdNext).toBeNull();
    });

    it('accepts an unverified reading only close to the last published value', async () => {
      const previous = (await collect(chains(), null, NOW, () => {})).latest;
      const unverified = (value: string): Reading => ({ ...reading(value), verified: false });
      const warnings: string[] = [];

      const near = await collect(
        chains({ bcvUsd: [source('bcv', unverified('890'))] }),
        previous,
        NOW,
        () => undefined,
      );
      const far = await collect(
        chains({
          bcvUsd: [source('bcv', unverified('1000')), source('dolarapi', reading('884'))],
        }),
        previous,
        NOW,
        (message) => warnings.push(message),
      );

      expect(near.latest.rates.bcvUsd).toMatchObject({ value: '890', source: 'bcv' });
      expect(far.latest.rates.bcvUsd).toMatchObject({ value: '884', source: 'dolarapi' });
      expect(warnings).toEqual(['bcv: unverified value is not within 5% of the last']);
    });
  });
});
