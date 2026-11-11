import { CACHE } from './cache';
import { localDate, monthOf, previousMonth } from './dates';
import { KEYS } from './feed';
import type { LatestDocument, MonthDocument } from './model';
import type { DocumentStore } from './store';
import { INDEX, utcOffsetOf } from './v2/catalog';
import { V2_KEYS, type StoredLatest } from './v2/feed';
import { vesLatest, vesMonth } from './v2/fromV1';
import { denseMonth, type StoredMonth } from './v2/history';
import type { LatestV2, MonthV2 } from './v2/model';

const V1_PATH = /^\/v1\/(?:latest|history\/\d{4}-\d{2})\.json$/;
const V2_LATEST = /^\/v2\/([a-z]{3})\/latest\.json$/;
const V2_MONTH = /^\/v2\/([a-z]{3})\/history\/(\d{4}-\d{2})\.json$/;

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
  const latestCode = V2_LATEST.exec(path)?.[1];
  if (latestCode !== undefined) {
    const latest = await latestOf(latestCode.toUpperCase(), store);
    return latest === undefined
      ? null
      : { body: JSON.stringify(latest), cacheControl: CACHE.latest };
  }
  const [, monthCode, month] = V2_MONTH.exec(path) ?? [];
  const offset = monthCode === undefined ? undefined : utcOffsetOf(monthCode.toUpperCase());
  if (monthCode !== undefined && month !== undefined && offset !== undefined) {
    const today = localDate(now, offset);
    const days = await historyOf(monthCode.toUpperCase(), month, today, store);
    return days === null
      ? null
      : {
          body: JSON.stringify(days),
          cacheControl: month < monthOf(today) ? CACHE.closedMonth : CACHE.openMonth,
        };
  }
  return null;
}

async function latestOf(code: string, store: DocumentStore): Promise<LatestV2 | undefined> {
  if (code === 'VES') {
    const latest = await store.read<LatestDocument>(KEYS.latest);
    return latest === null ? undefined : vesLatest(latest);
  }
  return (await store.read<StoredLatest>(V2_KEYS.latest))?.currencies[code];
}

async function historyOf(
  code: string,
  month: string,
  today: string,
  store: DocumentStore,
): Promise<MonthV2 | null> {
  if (code === 'VES') {
    const [document, before] = await Promise.all([
      store.read<MonthDocument>(KEYS.month(month)),
      store.read<MonthDocument>(KEYS.month(previousMonth(month))),
    ]);
    return vesMonth(month, document, before, today);
  }
  const [document, before] = await Promise.all([
    store.read<StoredMonth>(V2_KEYS.month(month)),
    store.read<StoredMonth>(V2_KEYS.month(previousMonth(month))),
  ]);
  return denseMonth(code, month, document?.currencies[code], before?.currencies[code], today);
}
