import { runFeed } from './feed';
import { createJsonClient } from './http';
import { BinanceP2pUsdt } from './sources/binanceP2p';
import { CriptoYaUsdt } from './sources/criptoYa';
import { CurrencyApiFx } from './sources/currencyApi';
import {
  DolarApiBcvEur,
  DolarApiBcvUsd,
  DolarApiParaleloUsdt,
  readDolarApiHistory,
} from './sources/dolarApi';
import { OpenErApiBcvEurCross, OpenErApiBcvUsd, OpenErApiFx } from './sources/openErApi';
import { YadioFx, YadioUsdt } from './sources/yadio';
import { serve } from './serve';
import { KvDocumentStore } from './store';

interface Env {
  RATES: KVNamespace;
}

export default {
  /** The edge cache answers repeated reads, keeping them off the KV daily read quota. */
  async fetch(request, env, context) {
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached !== undefined) {
      return cached;
    }
    const response = await serve(request, new KvDocumentStore(env.RATES));
    if (response.ok && request.method === 'GET') {
      context.waitUntil(cache.put(request, response.clone()));
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
            new CriptoYaUsdt(http),
            new BinanceP2pUsdt(http, () => now),
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
