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
import { R2DocumentStore } from './store';

interface Env {
  RATES: R2Bucket;
}

export default {
  async scheduled(controller, env, context) {
    const http = createJsonClient();
    const now = new Date(controller.scheduledTime);
    context.waitUntil(
      runFeed({
        store: new R2DocumentStore(env.RATES),
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
