import { describe, expect, it } from 'vitest';
import type { LatestDocument, MonthDocument } from '../src/model';
import { INDEX } from '../src/v2/catalog';
import { vesLatest, vesMonth } from '../src/v2/fromV1';

const FETCHED = '2026-11-10T15:00:00.000Z';

const latest: LatestDocument = {
  schemaVersion: 1,
  updatedAt: FETCHED,
  rates: {
    bcvUsd: { value: '899.2705', effectiveDate: '2026-11-10', source: 'bcv', fetchedAt: FETCHED },
    bcvEur: { value: '1006.6', effectiveDate: '2026-11-10', source: 'bcv', fetchedAt: FETCHED },
    bcvUsdNext: {
      value: '901.6175',
      effectiveDate: '2026-11-11',
      source: 'bcv',
      fetchedAt: FETCHED,
    },
    bcvEurNext: null,
    usdt: {
      value: '1082.5',
      bid: '1075.8',
      ask: '1089.2',
      effectiveDate: '2026-11-10',
      source: 'bybit-p2p',
      fetchedAt: FETCHED,
    },
    fx: {
      COP: {
        value: '3270',
        effectiveDate: '2026-11-10',
        source: 'currency-api',
        fetchedAt: FETCHED,
      },
    },
  },
};

function month(name: string, days: MonthDocument['days']): MonthDocument {
  return { schemaVersion: 1, month: name, days };
}

describe('v2 latest for the bolivar', () => {
  it('names each reference and keeps its source, both sides of the market and the next BCV rate', () => {
    expect(vesLatest(latest)).toEqual({
      schemaVersion: 2,
      currency: 'VES',
      updatedAt: FETCHED,
      references: [
        {
          id: 'ves.bcv',
          value: '899.2705',
          since: '2026-11-10',
          source: 'bcv',
          fetchedAt: FETCHED,
          next: { value: '901.6175', since: '2026-11-11' },
        },
        {
          id: 'ves.bcv_eur',
          value: '1006.6',
          since: '2026-11-10',
          source: 'bcv',
          fetchedAt: FETCHED,
        },
        {
          id: 'ves.usdt_p2p',
          value: '1082.5',
          since: '2026-11-10',
          source: 'bybit-p2p',
          fetchedAt: FETCHED,
          bid: '1075.8',
          ask: '1089.2',
        },
      ],
    });
  });

  it('leaves out a reference that has never had a value', () => {
    const empty = { ...latest, rates: { ...latest.rates, bcvEur: null, usdt: null } };

    expect(vesLatest(empty).references.map((r) => r.id)).toEqual(['ves.bcv']);
  });
});

describe('v2 month history for the bolivar', () => {
  const october = month('2026-10', {
    '2026-10-30': { bcvUsd: '880', bcvEur: '990', usdt: '1050', usdtSource: 'bybit-p2p' },
  });
  const november = month('2026-11', {
    '2026-11-02': { bcvUsd: '885', usdt: '1060', usdtSource: 'bybit-p2p' },
    '2026-11-04': { bcvUsd: '890' },
    '2026-11-05': { bcvUsd: '895' },
  });

  it('fills every day with the value in force, carried from the last day its source published', () => {
    const result = vesMonth('2026-11', november, october, '2026-11-04');

    expect(Object.keys(result?.days ?? {})).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ]);
    expect(result?.days['2026-11-01']).toEqual({
      'ves.bcv': { value: '880', since: '2026-10-30' },
      'ves.bcv_eur': { value: '990', since: '2026-10-30' },
      'ves.usdt_p2p': { value: '1050', since: '2026-10-30', source: 'bybit-p2p' },
    });
    expect(result?.days['2026-11-03']?.['ves.bcv']).toEqual({ value: '885', since: '2026-11-02' });
    expect(result?.days['2026-11-04']?.['ves.bcv']).toEqual({ value: '890', since: '2026-11-04' });
  });

  it('stops at today, so a rate published for tomorrow only shows in latest', () => {
    const result = vesMonth('2026-11', november, october, '2026-11-04');

    expect(result?.days['2026-11-05']).toBeUndefined();
  });

  it('covers the whole of a closed month', () => {
    const result = vesMonth('2026-11', november, october, '2026-12-15');

    expect(Object.keys(result?.days ?? {})).toHaveLength(30);
    expect(result?.days['2026-11-30']?.['ves.bcv']).toEqual({ value: '895', since: '2026-11-05' });
  });

  it('starts with the first published day when there is nothing before the month', () => {
    const result = vesMonth('2026-11', november, null, '2026-11-04');

    expect(result?.days['2026-11-01']).toBeUndefined();
    expect(result?.days['2026-11-02']?.['ves.usdt_p2p']?.source).toBe('bybit-p2p');
  });

  it('has nothing for a month the feed never recorded or that has not started', () => {
    expect(vesMonth('2020-01', null, null, '2026-11-04')).toBeNull();
    expect(vesMonth('2026-12', month('2026-12', {}), november, '2026-11-04')).toBeNull();
  });
});

describe('v2 index', () => {
  it('lists unique reference ids, each with its history start', () => {
    const ids = INDEX.currencies.flatMap((c) => c.references.map((r) => r.id));

    expect(new Set(ids).size).toBe(ids.length);
    for (const currency of INDEX.currencies) {
      for (const reference of currency.references) {
        expect(reference.id.startsWith(`${currency.code.toLowerCase()}.`)).toBe(true);
      }
    }
  });
});
