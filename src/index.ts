import { runFeed } from './feed';
import { createJsonClient } from './http';
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
    const response = await serve(request, new KvDocumentStore(env.RATES));
    if (key !== null && response.ok && request.method === 'GET') {
      context.waitUntil(cache.put(key, response.clone()));
    }
    return response;
  },

  async scheduled(controller, env, context) {
    const http = createJsonClient();
    const now = new Date(controller.scheduledTime);
    context.waitUntil(
      runFeed({
        store: new KvDocumentStore(env.RATES),
        chains: {
          bcvUsd: [new DolarApiBcvUsd(http), new OpenErApiBcvUsd(http)],
          bcvEur: [new DolarApiBcvEur(http), new OpenErApiBcvEurCross(http)],
          usdt: [
            new BybitP2pUsdt(http, () => now),
            new OkxP2pUsdt(http, () => now),
            new YadioUsdt(http),
            new DolarApiParaleloUsdt(http),
          ],
          fx: [new CurrencyApiFx(http), new OpenErApiFx(http), new YadioFx(http)],
        },
        loadBackfill: () => readDolarApiHistory(http),
        now,
        warn: (message) => console.warn(message),
      }),
    );
  },
} satisfies ExportedHandler<Env>;
