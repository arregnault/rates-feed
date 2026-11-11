import type { JsonClient } from '../http';
import { argentinaFeed } from './argentina';
import { P2P_CURRENCIES, TIME_ZONES } from './catalog';
import type { CurrencyFeed } from './feed';
import type { Guards } from './guards';
import { p2pChain } from './p2p';

/** Every currency the v2 feed collects itself; the bolivar comes from v1. */
export function currencyFeeds(http: JsonClient, guards: Guards, now: Date): CurrencyFeed[] {
  const curated = [argentinaFeed(http, () => now)];
  return [
    ...curated.map((feed) => {
      const code = P2P_CURRENCIES.find((currency) => currency === feed.group.currency);
      return code === undefined
        ? feed
        : {
            ...feed,
            group: {
              ...feed.group,
              chains: [...feed.group.chains, p2pChain(http, code, guards, now)],
            },
          };
    }),
    ...P2P_CURRENCIES.filter((code) => !curated.some((feed) => feed.group.currency === code)).map(
      (code): CurrencyFeed => ({
        timeZone: TIME_ZONES[code],
        group: { currency: code, chains: [p2pChain(http, code, guards, now)] },
        backfill: [],
      }),
    ),
  ];
}
