import { describe, expect, it } from 'vitest';
import type { SourceChains } from '../src/collect';
import { KEYS, runFeed, type BackfillLoader } from '../src/feed';
import type { LatestDocument, MonthDocument } from '../src/model';
import { BinanceP2pUsdt } from '../src/sources/binanceP2p';
import { CriptoYaUsdt } from '../src/sources/criptoYa';
import { CurrencyApiFx } from '../src/sources/currencyApi';
import { DolarApiBcvEur, DolarApiBcvUsd, readDolarApiHistory } from '../src/sources/dolarApi';
import { OpenErApiBcvUsd, OpenErApiFx } from '../src/sources/openErApi';
import type { HistoryPoint } from '../src/sources/dolarApi';
import { fakeHttp, MemoryStore } from './support';

const NOW = new Date('2026-10-21T13:00:00Z');

function chains(failing: string[] = []): SourceChains {
  const http = fakeHttp(failing);
  return {
    bcvUsd: [new DolarApiBcvUsd(http), new OpenErApiBcvUsd(http)],
    bcvEur: [new DolarApiBcvEur(http)],
    usdt: [new CriptoYaUsdt(http), new BinanceP2pUsdt(http, () => NOW)],
    fx: [new CurrencyApiFx(http), new OpenErApiFx(http)],
  };
}

function run(store: MemoryStore, loadBackfill: BackfillLoader, now = NOW) {
  return runFeed({ store, chains: chains(), loadBackfill, now, warn: () => undefined });
}

function monthsBack(count: number): HistoryPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9 - index, 15));
    return { fuente: 'oficial', promedio: 100 + index, fecha: date.toISOString().slice(0, 10) };
  });
}

describe('runFeed', () => {
  it('publishes latest.json and the month history from recorded responses', async () => {
    const store = new MemoryStore();

    await run(store, () => readDolarApiHistory(fakeHttp()));

    const latest = await store.read<LatestDocument>(KEYS.latest);
    const october = await store.read<MonthDocument>(KEYS.month('2026-10'));
    expect(latest?.rates.bcvUsd?.value).toBe('883.3963');
    expect(latest?.rates.usdt?.source).toBe('criptoya');
    expect(store.documents.get(KEYS.latest)?.cacheControl).toBe('public, max-age=120');
    expect(october?.days['2026-10-21']).toMatchObject({
      bcvUsd: '883.3963',
      usdt: '1005.65',
      usdtSource: 'criptoya',
    });
    expect(october?.days['2026-10-01']?.bcvUsd).toBe('860.1753');
  });

  it('caches closed months for a year and the open month briefly', async () => {
    const store = new MemoryStore();

    await run(store, () => readDolarApiHistory(fakeHttp()));

    expect(store.documents.get(KEYS.month('2026-09'))?.cacheControl).toContain('immutable');
    expect(store.documents.get(KEYS.month('2026-10'))?.cacheControl).toBe('public, max-age=900');
  });

  it('spreads the backfill over runs, twelve months each, and then stops loading it', async () => {
    const store = new MemoryStore();
    let loads = 0;
    const loader: BackfillLoader = async () => {
      loads += 1;
      return { dollars: monthsBack(30), euros: [] };
    };

    await run(store, loader);
    expect(await store.read(KEYS.month('2024-05'))).not.toBeNull();
    expect(await store.read(KEYS.month('2025-05'))).toBeNull();

    await run(store, loader);
    await run(store, loader);
    await run(store, loader);

    expect(await store.read(KEYS.month('2026-10'))).not.toBeNull();
    expect(await store.read(KEYS.backfill)).toMatchObject({ done: true });
    expect(loads).toBe(3);
  });

  it('rewrites a month only when its content changed, to stay within the KV write quota', async () => {
    const store = new MemoryStore();
    await run(store, () => readDolarApiHistory(fakeHttp()));
    store.writes.length = 0;

    await run(store, () => readDolarApiHistory(fakeHttp()));

    expect(store.writes).toEqual([KEYS.latest]);
  });

  it('retries the backfill on the next run when it fails', async () => {
    const store = new MemoryStore();
    const warnings: string[] = [];

    await runFeed({
      store,
      chains: chains(),
      loadBackfill: async () => {
        throw new Error('dolarapi down');
      },
      now: NOW,
      warn: (message) => warnings.push(message),
    });

    expect(warnings).toEqual(['backfill: dolarapi down']);
    expect(await store.read(KEYS.backfill)).toBeNull();
  });

  it('keeps publishing when the primary sources are down', async () => {
    const store = new MemoryStore();

    await runFeed({
      store,
      chains: chains([
        'https://ve.dolarapi.com/v1/dolares',
        'https://criptoya.com/api/binancep2p/USDT/VES/1',
      ]),
      loadBackfill: async () => ({ dollars: [], euros: [] }),
      now: NOW,
      warn: () => undefined,
    });

    const latest = await store.read<LatestDocument>(KEYS.latest);
    expect(latest?.rates.bcvUsd?.source).toBe('open-er-api');
    expect(latest?.rates.usdt?.source).toBe('binance-p2p');
  });
});
