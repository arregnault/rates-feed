import { describe, expect, it } from 'vitest';
import { KEYS } from '../src/feed';
import { cacheKey, serve } from '../src/serve';
import type { IndexDocument, MonthV2 } from '../src/v2/model';
import { MemoryStore } from './support';

async function storeWithLatest(): Promise<MemoryStore> {
  const store = new MemoryStore();
  await store.write(KEYS.latest, { schemaVersion: 1 }, 'public, max-age=120');
  await store.write(KEYS.month('2026-10'), { month: '2026-10' }, 'public, max-age=900');
  await store.write(KEYS.backfill, { done: true }, 'public, max-age=120');
  return store;
}

const NOW = new Date('2026-11-10T15:00:00Z');

function request(path: string, method = 'GET'): Request {
  return new Request(`https://rates.example${path}`, { method });
}

describe('serve', () => {
  it('serves published documents as JSON with their cache policy', async () => {
    const response = await serve(request('/v1/latest.json'), await storeWithLatest(), NOW);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=120');
    expect(await response.json()).toEqual({ schemaVersion: 1 });
  });

  it('serves month history', async () => {
    const response = await serve(request('/v1/history/2026-10.json'), await storeWithLatest(), NOW);

    expect(await response.json()).toEqual({ month: '2026-10' });
  });

  it('answers HEAD without a body', async () => {
    const response = await serve(request('/v1/latest.json', 'HEAD'), await storeWithLatest(), NOW);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('hides internal documents and unknown paths', async () => {
    const store = await storeWithLatest();

    expect((await serve(request('/v1/meta/backfill.json'), store, NOW)).status).toBe(404);
    expect((await serve(request('/v1/history/2020-01.json'), store, NOW)).status).toBe(404);
    expect((await serve(request('/'), store, NOW)).status).toBe(404);
  });

  it('rejects writes', async () => {
    const response = await serve(request('/v1/latest.json', 'POST'), await storeWithLatest(), NOW);

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });

  it('caches by path alone, so a query string cannot skip the cache', () => {
    expect(cacheKey(request('/v1/latest.json?x=1'))?.url).toBe(
      'https://rates.example/v1/latest.json',
    );
    expect(cacheKey(request('/v1/latest.json', 'HEAD'))?.method).toBe('GET');
    expect(cacheKey(request('/v1/latest.json', 'POST'))).toBeNull();
  });
});

describe('serve v2', () => {
  async function storeWithHistory(): Promise<MemoryStore> {
    const store = new MemoryStore();
    await store.write(
      KEYS.latest,
      {
        schemaVersion: 1,
        updatedAt: '2026-11-10T15:00:00.000Z',
        rates: { bcvUsd: null, bcvEur: null, usdt: null, fx: {} },
      },
      'public, max-age=120',
    );
    await store.write(
      KEYS.month('2026-10'),
      { schemaVersion: 1, month: '2026-10', days: { '2026-10-30': { bcvUsd: '880' } } },
      'public, max-age=31536000, immutable',
    );
    await store.write(
      KEYS.month('2026-11'),
      { schemaVersion: 1, month: '2026-11', days: { '2026-11-02': { bcvUsd: '885' } } },
      'public, max-age=900',
    );
    return store;
  }

  it('serves the catalog', async () => {
    const response = await serve(request('/v2/index.json'), new MemoryStore(), NOW);

    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(((await response.json()) as IndexDocument).currencies[0]?.code).toBe('VES');
  });

  it('serves the bolivar latest from the stored rates', async () => {
    const response = await serve(request('/v2/ves/latest.json'), await storeWithHistory(), NOW);

    expect(response.headers.get('cache-control')).toBe('public, max-age=120');
    expect(await response.json()).toMatchObject({ schemaVersion: 2, currency: 'VES' });
  });

  it('serves a month, carrying the previous month into its first days', async () => {
    const response = await serve(
      request('/v2/ves/history/2026-11.json'),
      await storeWithHistory(),
      NOW,
    );
    const body = (await response.json()) as MonthV2;

    expect(response.headers.get('cache-control')).toBe('public, max-age=900');
    expect(body.days['2026-11-01']?.['ves.bcv']).toEqual({ value: '880', since: '2026-10-30' });
    expect(Object.keys(body.days)).toHaveLength(10);
  });

  it('caches closed months for a year', async () => {
    const response = await serve(
      request('/v2/ves/history/2026-10.json'),
      await storeWithHistory(),
      NOW,
    );

    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('answers 404 for unknown currencies and months without data', async () => {
    const store = await storeWithHistory();

    expect((await serve(request('/v2/xyz/latest.json'), store, NOW)).status).toBe(404);
    expect((await serve(request('/v2/ves/history/2020-01.json'), store, NOW)).status).toBe(404);
    expect((await serve(request('/v2/ves/latest.json'), new MemoryStore(), NOW)).status).toBe(404);
  });
});
