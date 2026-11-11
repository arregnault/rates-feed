import { caracasDate } from './dates';
import { runFeed } from './feed';
import { currencyFeeds } from './v2/currencies';
import { runFeedV2 } from './v2/feed';
import { Guards } from './v2/guards';
import { createJsonClient } from './http';
import { BcvEur, BcvUsd, createBcvPage, createPageFetcher } from './sources/bcv';
import { BybitP2pUsdt } from './sources/bybitP2p';
import { CurrencyApiFx } from './sources/currencyApi';
import {
  DolarApiBcvEur,
  DolarApiBcvUsd,
  DolarApiParaleloUsdt,
  readDolarApiHistory,
} from './sources/dolarApi';
import { OkxP2pUsdt } from './sources/okxP2p';
import { OpenErApiBcvEurCross, OpenErApiBcvUsd, OpenErApiFx } from './sources/openErApi';
import { YadioFx, YadioUsdt } from './sources/yadio';
import { cacheKey, serve } from './serve';
import { KvDocumentStore } from './store';

/** Fallback reads per run, within the free plan's 50 subrequests with the primary sources. */
const MAX_FALLBACK_READS = 4;

interface Env {
  RATES: KVNamespace;
}

export default {
  /** The edge cache answers repeated reads, keeping them off the KV daily read quota. */
  async fetch(request, env, context) {
    const cache = caches.default;
    const key = cacheKey(request);
    const cached = key === null ? undefined : await cache.match(key);
    if (cached !== undefined) {
      return request.method === 'HEAD' ? new Response(null, cached) : cached;
    }
    const response = await serve(request, new KvDocumentStore(env.RATES), new Date());
    if (key !== null && response.ok && request.method === 'GET') {
      context.waitUntil(cache.put(key, response.clone()));
    }
    return response;
  },

  async scheduled(controller, env, context) {
    const http = createJsonClient();
    const bcv = createBcvPage(createPageFetcher());
    const now = new Date(controller.scheduledTime);
    const store = new KvDocumentStore(env.RATES);
    const warn = (message: string): void => console.warn(message);
    const v1 = runFeed({
      store,
      chains: {
        bcvUsd: [new BcvUsd(bcv), new DolarApiBcvUsd(http), new OpenErApiBcvUsd(http)],
        bcvEur: [new BcvEur(bcv), new DolarApiBcvEur(http), new OpenErApiBcvEurCross(http)],
        usdt: [
          new BybitP2pUsdt(http, 'VES', () => caracasDate(now)),
          new OkxP2pUsdt(http, 'VES', () => caracasDate(now)),
          new YadioUsdt(http),
          new DolarApiParaleloUsdt(http),
        ],
        fx: [new CurrencyApiFx(http), new OpenErApiFx(http), new YadioFx(http)],
      },
      loadBackfill: () => readDolarApiHistory(http),
      now,
      warn,
    });
    const guards = new Guards(now, MAX_FALLBACK_READS);
    const currencies = currencyFeeds(http, guards, now);
    const v2 = runFeedV2({ store, currencies, guards, now, warn });
    context.waitUntil(Promise.all([v1, v2]));
  },
} satisfies ExportedHandler<Env>;
