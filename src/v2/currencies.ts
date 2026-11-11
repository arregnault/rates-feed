import type { JsonClient } from '../http';
import { argentinaFeed } from './argentina';
import { P2P_CURRENCIES, TIME_ZONES } from './catalog';
import type { CurrencyFeed } from './feed';
import type { Guards } from './guards';
import { localBackfill, localChain } from './officials';
import { p2pChain } from './p2p';

/** Every currency the v2 feed collects itself; the bolivar comes from v1. */
export function currencyFeeds(http: JsonClient, guards: Guards, now: Date): CurrencyFeed[] {
  const argentina = argentinaFeed(http, () => now);
  return [
    {
      ...argentina,
      group: {
        ...argentina.group,
        chains: [...argentina.group.chains, p2pChain(http, 'ARS', guards, now)],
      },
    },
    ...P2P_CURRENCIES.filter((code) => code !== 'ARS').map((code): CurrencyFeed => ({
      timeZone: TIME_ZONES[code],
      group: {
        currency: code,
        chains: [localChain(http, code, now), p2pChain(http, code, guards, now)],
      },
      backfill: localBackfill(http, code, now),
    })),
  ];
}
