import { CACHE } from './cache';
import { caracasDate, monthOf, previousMonth } from './dates';
import { KEYS } from './feed';
import type { LatestDocument, MonthDocument } from './model';
import type { DocumentStore } from './store';
import { INDEX } from './v2/catalog';
import { vesLatest, vesMonth } from './v2/fromV1';

const V1_PATH = /^\/v1\/(?:latest|history\/\d{4}-\d{2})\.json$/;
const V2_LATEST = /^\/v2\/ves\/latest\.json$/;
const V2_MONTH = /^\/v2\/ves\/history\/(\d{4}-\d{2})\.json$/;

/**
 * The edge cache entry for a request: the path alone, so adding a query string cannot skip the
 * cache and spend the KV read quota. Null for methods that are never cached.
 */
export function cacheKey(request: Request): Request | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return null;
  }
  const url = new URL(request.url);
  return new Request(`${url.origin}${url.pathname}`);
}

interface Found {
  body: string;
  cacheControl: string;
}

export async function serve(request: Request, store: DocumentStore, now: Date): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  const found = await find(new URL(request.url).pathname, store, now);
  if (found === null) {
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  return new Response(request.method === 'HEAD' ? null : found.body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': found.cacheControl,
    },
  });
}

async function find(path: string, store: DocumentStore, now: Date): Promise<Found | null> {
  if (V1_PATH.test(path)) {
    return store.readRaw(path.slice(1));
  }
  if (path === '/v2/index.json') {
    return { body: JSON.stringify(INDEX), cacheControl: CACHE.index };
  }
  if (V2_LATEST.test(path)) {
    const latest = await store.read<LatestDocument>(KEYS.latest);
    return latest === null
      ? null
      : { body: JSON.stringify(vesLatest(latest)), cacheControl: CACHE.latest };
  }
  const month = V2_MONTH.exec(path)?.[1];
  if (month !== undefined) {
    const today = caracasDate(now);
    const [document, before] = await Promise.all([
      store.read<MonthDocument>(KEYS.month(month)),
      store.read<MonthDocument>(KEYS.month(previousMonth(month))),
    ]);
    const days = vesMonth(month, document, before, today);
    return days === null
      ? null
      : {
          body: JSON.stringify(days),
          cacheControl: month < monthOf(today) ? CACHE.closedMonth : CACHE.openMonth,
        };
  }
  return null;
}
