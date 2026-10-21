import { describe, expect, it } from 'vitest';
import { KEYS } from '../src/feed';
import { serve } from '../src/serve';
import { MemoryStore } from './support';

async function storeWithLatest(): Promise<MemoryStore> {
  const store = new MemoryStore();
  await store.write(KEYS.latest, { schemaVersion: 1 }, 'public, max-age=120');
  await store.write(KEYS.month('2026-10'), { month: '2026-10' }, 'public, max-age=900');
  await store.write(KEYS.backfill, { done: true }, 'public, max-age=120');
  return store;
}

function request(path: string, method = 'GET'): Request {
  return new Request(`https://rates.example${path}`, { method });
}

describe('serve', () => {
  it('serves published documents as JSON with their cache policy', async () => {
    const response = await serve(request('/v1/latest.json'), await storeWithLatest());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=120');
    expect(await response.json()).toEqual({ schemaVersion: 1 });
  });

  it('serves month history', async () => {
    const response = await serve(request('/v1/history/2026-10.json'), await storeWithLatest());

    expect(await response.json()).toEqual({ month: '2026-10' });
  });

  it('answers HEAD without a body', async () => {
    const response = await serve(request('/v1/latest.json', 'HEAD'), await storeWithLatest());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('hides internal documents and unknown paths', async () => {
    const store = await storeWithLatest();

    expect((await serve(request('/v1/meta/backfill.json'), store)).status).toBe(404);
    expect((await serve(request('/v1/history/2020-01.json'), store)).status).toBe(404);
    expect((await serve(request('/'), store)).status).toBe(404);
  });

  it('rejects writes', async () => {
    const response = await serve(request('/v1/latest.json', 'POST'), await storeWithLatest());

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });
});
