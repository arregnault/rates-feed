import { localDate } from '../dates';
import type { JsonClient } from '../http';
import { BybitP2pUsdt } from '../sources/bybitP2p';
import { OkxP2pUsdt } from '../sources/okxP2p';
import { p2pId, TIME_ZONES, type CurrencyCode } from './catalog';
import type { ReferenceChain } from './collect';
import type { Guards } from './guards';

/**
 * Every 15 minutes rather than every run: the state of all currencies is one KV document, and
 * rewriting it every five minutes would take most of the daily write quota.
 */
const P2P_EVERY_MINUTES = 15;

/** Bybit has no ads in these currencies. */
const OKX_ONLY: ReadonlySet<CurrencyCode> = new Set(['CRC']);

export function p2pChain(
  http: JsonClient,
  currency: CurrencyCode,
  guards: Guards,
  now: Date,
): ReferenceChain {
  const today = (): string => localDate(now, TIME_ZONES[currency]);
  const okx = guards.cooling('okx', new OkxP2pUsdt(http, currency, today));
  return {
    id: p2pId(currency),
    everyMinutes: P2P_EVERY_MINUTES,
    sources: OKX_ONLY.has(currency)
      ? [okx]
      : [new BybitP2pUsdt(http, currency, today), guards.fallback(okx)],
  };
}
