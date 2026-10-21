import { describe, expect, it } from 'vitest';
import type { FreshQuotes } from '../src/collect';
import { groupByMonth, mergeMonth, patchesFromBackfill, patchesFromFresh } from '../src/history';
import type { PublishedQuote } from '../src/model';

function quote(value: string, effectiveDate: string, source = 'dolarapi'): PublishedQuote {
  return { value, effectiveDate, source, fetchedAt: '2026-10-21T13:00:00.000Z' };
}

describe('history', () => {
  it('files each fresh quote under its own effective date', () => {
    const fresh: FreshQuotes = {
      bcvUsd: quote('890.1', '2026-10-22'),
      bcvEur: quote('1000.2', '2026-10-22'),
      usdt: { ...quote('1005.65', '2026-10-21', 'bybit-p2p'), bid: '1006.5', ask: '1004.8' },
      fx: { COP: quote('3174.07', '2026-10-20', 'currency-api') },
    };

    const patches = patchesFromFresh(fresh);

    expect(patches.get('2026-10-22')).toEqual({ bcvUsd: '890.1', bcvEur: '1000.2' });
    expect(patches.get('2026-10-21')).toEqual({ usdt: '1005.65', usdtSource: 'bybit-p2p' });
    expect(patches.get('2026-10-20')).toEqual({ fx: { COP: '3174.07' } });
  });

  it('leaves the approximated euro out of history', () => {
    const patches = patchesFromFresh({
      bcvUsd: null,
      bcvEur: quote('991.74', '2026-10-21', 'open-er-api-cross'),
      usdt: null,
      fx: {},
    });

    expect(patches.size).toBe(0);
  });

  it('maps dolarapi history, with the parallel rate standing in for USDT', () => {
    const patches = patchesFromBackfill(
      [
        { fuente: 'oficial', promedio: 860.1753, fecha: '2026-10-01' },
        { fuente: 'paralelo', promedio: 954.553517, fecha: '2026-10-01' },
      ],
      [{ fuente: 'oficial', promedio: 993.1759582, fecha: '2026-10-01' }],
    );

    expect(patches.get('2026-10-01')).toEqual({
      bcvUsd: '860.1753',
      bcvEur: '993.175958',
      usdt: '954.553517',
      usdtSource: 'dolarapi-paralelo',
    });
  });

  it('groups days by month', () => {
    const months = groupByMonth(
      new Map([
        ['2026-09-30', { bcvUsd: '859' }],
        ['2026-10-01', { bcvUsd: '860' }],
      ]),
    );

    expect([...months.keys()]).toEqual(['2026-09', '2026-10']);
  });

  it('lets the latest value of the day win, merging currencies', () => {
    const first = mergeMonth(
      null,
      '2026-10',
      new Map([['2026-10-21', { usdt: '1003', fx: { COP: '3170' } }]]),
    );

    const second = mergeMonth(
      first,
      '2026-10',
      new Map([['2026-10-21', { usdt: '1005', fx: { PEN: '3.4' } }]]),
    );

    expect(second.days['2026-10-21']).toEqual({ usdt: '1005', fx: { COP: '3170', PEN: '3.4' } });
  });

  it('never lets a backfill replace what the feed recorded', () => {
    const recorded = mergeMonth(
      null,
      '2026-10',
      new Map([['2026-10-21', { usdt: '1005.65', usdtSource: 'bybit-p2p' }]]),
    );

    const backfilled = mergeMonth(
      recorded,
      '2026-10',
      new Map([['2026-10-21', { usdt: '1003.6', usdtSource: 'dolarapi-paralelo', bcvUsd: '883' }]]),
      true,
    );

    expect(backfilled.days['2026-10-21']).toEqual({
      usdt: '1005.65',
      usdtSource: 'bybit-p2p',
      bcvUsd: '883',
    });
  });

  it('keeps days in date order', () => {
    const document = mergeMonth(
      null,
      '2026-10',
      new Map([
        ['2026-10-21', { bcvUsd: '883' }],
        ['2026-10-01', { bcvUsd: '860' }],
      ]),
    );

    expect(Object.keys(document.days)).toEqual(['2026-10-01', '2026-10-21']);
  });
});
