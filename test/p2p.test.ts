import { describe, expect, it } from 'vitest';
import { okxP2pUrl, URLS } from '../src/config';
import { localDate } from '../src/dates';
import { HttpError, type JsonClient } from '../src/http';
import type { Source } from '../src/model';
import { BybitP2pUsdt } from '../src/sources/bybitP2p';
import { OkxP2pUsdt } from '../src/sources/okxP2p';
import { INDEX, P2P_CURRENCIES, TIME_ZONES } from '../src/v2/catalog';
import { currencyFeeds } from '../src/v2/currencies';
import { runFeedV2, V2_KEYS, type StoredLatest } from '../src/v2/feed';
import { Guards } from '../src/v2/guards';
import { fixture, MemoryStore } from './support';

const NOW = new Date('2026-11-10T15:00:00Z');

function source(read: () => Promise<number>): Source<number> & { reads: number } {
  const counted = {
    name: 'okx-p2p',
    reads: 0,
    read: () => {
      counted.reads += 1;
      return read();
    },
  };
  return counted;
}

describe('P2P sources in any currency', () => {
  it('asks Bybit for the given currency', async () => {
    const currencies: string[] = [];
    const http: JsonClient = async (_url, init) => {
      currencies.push(JSON.parse(String(init?.body)).currencyId);
      return fixture('bybit-p2p');
    };

    const usdt = await new BybitP2pUsdt(http, 'COP', () => '2026-11-10').read();

    expect(currencies).toEqual(['COP', 'COP']);
    expect(usdt.effectiveDate).toBe('2026-11-10');
  });

  it('asks OKX for the given currency, one side after the other', async () => {
    const urls: string[] = [];
    const http: JsonClient = async (url) => {
      urls.push(url);
      return fixture(url.includes('side=sell') ? 'okx-p2p-sell' : 'okx-p2p-buy');
    };

    await new OkxP2pUsdt(http, 'MXN', () => '2026-11-10').read();

    expect(urls).toEqual([okxP2pUrl('MXN', 'sell'), okxP2pUrl('MXN', 'buy')]);
  });
});

describe('guards', () => {
  it('rests a source for 15 minutes after HTTP 429', async () => {
    const guards = new Guards(NOW, 8);
    const okx = source(() => Promise.reject(new HttpError(URLS.yadio, 429)));
    const cooled = guards.cooling('okx', okx);

    await expect(cooled.read()).rejects.toThrow('HTTP 429');
    await expect(cooled.read()).rejects.toThrow('paused until 2026-11-10T15:15:00.000Z');
    expect(okx.reads).toBe(1);
    expect(guards.cooldowns).toEqual({ okx: '2026-11-10T15:15:00.000Z' });
  });

  it('keeps a pause across runs until it ends', () => {
    const later = new Guards(new Date('2026-11-10T15:10:00Z'), 8);
    later.restore({ okx: '2026-11-10T15:15:00.000Z', old: '2026-11-10T15:05:00.000Z' });

    expect(later.cooldowns).toEqual({ okx: '2026-11-10T15:15:00.000Z' });
  });

  it('does not pause on other errors', async () => {
    const guards = new Guards(NOW, 8);

    await expect(
      guards
        .cooling(
          'okx',
          source(() => Promise.reject(new HttpError(URLS.yadio, 500))),
        )
        .read(),
    ).rejects.toThrow('HTTP 500');
    expect(guards.cooldowns).toEqual({});
  });

  it('caps the fallback reads of a run', async () => {
    const guards = new Guards(NOW, 2);
    const fallback = source(() => Promise.resolve(1));
    const capped = guards.fallback(fallback);

    await capped.read();
    await capped.read();
    await expect(capped.read()).rejects.toThrow('spent');
    expect(fallback.reads).toBe(2);
  });
});

describe('currency feeds', () => {
  const http: JsonClient = () => Promise.reject(new Error('offline'));
  const feeds = currencyFeeds(http, new Guards(NOW, 8), NOW);

  it('adds the P2P reference to Argentina and gives every other P2P currency its own feed', () => {
    const argentina = feeds.find((feed) => feed.group.currency === 'ARS');

    expect(argentina?.group.chains.map((chain) => chain.id)).toContain('ars.usdt_p2p');
    expect(argentina?.backfill).toHaveLength(7);
    expect(feeds.map((feed) => feed.group.currency).sort()).toEqual([...P2P_CURRENCIES].sort());
  });

  it('reads P2P every 15 minutes, with OKX alone where Bybit has no ads', () => {
    const p2p = (currency: string) =>
      feeds
        .find((feed) => feed.group.currency === currency)
        ?.group.chains.find((chain) => chain.id.endsWith('.usdt_p2p'));
    const colon = p2p('CRC');
    const peso = p2p('COP');

    expect(colon?.everyMinutes).toBe(15);
    expect(colon?.sources.map((s) => s.name)).toEqual(['okx-p2p']);
    expect(peso?.sources.map((s) => s.name)).toEqual(['bybit-p2p', 'okx-p2p']);
  });

  it('matches the catalog: every collected reference is listed', () => {
    const listed = new Set(INDEX.currencies.flatMap((c) => c.references.map((r) => r.id)));

    for (const feed of feeds) {
      for (const chain of feed.group.chains) {
        expect(listed.has(chain.id)).toBe(true);
      }
    }
  });

  it('saves a pause so the next run skips the rested source', async () => {
    const store = new MemoryStore();
    const limited: JsonClient = async (url) => {
      throw new HttpError(url, 429);
    };
    const guards = new Guards(NOW, 8);
    const colon = currencyFeeds(limited, guards, NOW).filter(
      (feed) => feed.group.currency === 'CRC',
    );

    await runFeedV2({ store, currencies: colon, guards, now: NOW, warn: () => {} });

    const saved = await store.read<StoredLatest>(V2_KEYS.latest);
    expect(saved?.cooldowns).toEqual({ okx: '2026-11-10T15:15:00.000Z' });
  });
});

describe('time zones', () => {
  it('reads each currency date in its zone, with daylight saving time where it applies', () => {
    const instant = new Date('2026-11-11T02:30:00Z');

    expect(localDate(instant, TIME_ZONES.CLP)).toBe('2026-11-10');
    expect(localDate(new Date('2026-11-11T03:30:00Z'), TIME_ZONES.CLP)).toBe('2026-11-11');
    expect(localDate(new Date('2026-07-11T03:30:00Z'), TIME_ZONES.CLP)).toBe('2026-07-10');
    expect(localDate(instant, TIME_ZONES.MXN)).toBe('2026-11-10');
    expect(localDate(instant, TIME_ZONES.ARS)).toBe('2026-11-10');
  });

  it('gives every catalog currency a known zone', () => {
    for (const currency of INDEX.currencies) {
      expect(() => localDate(NOW, currency.timeZone)).not.toThrow();
    }
  });
});
