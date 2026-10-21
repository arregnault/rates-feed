import { z } from 'zod';
import { URLS } from '../config';
import { caracasDate } from '../dates';
import { mean, median, parseDecimal, type Decimal } from '../decimal';
import type { JsonClient } from '../http';
import type { Source, UsdtReading } from '../model';

const ADS_PER_SIDE = '10';

const search = z.object({
  ret_code: z.literal(0),
  result: z.object({ items: z.array(z.object({ price: z.string() })).min(1) }),
});

/** Bybit names the side from the taker's view: '1' lists ads selling USDT, '0' ads buying it. */
type Side = '1' | '0';

/**
 * Undocumented endpoint behind the Bybit P2P website: only the feed calls it, never the app.
 * The median of the top ads resists a single outlier ad.
 */
export class BybitP2pUsdt implements Source<UsdtReading> {
  readonly name = 'bybit-p2p';

  constructor(
    private readonly http: JsonClient,
    private readonly now: () => Date,
  ) {}

  async read(): Promise<UsdtReading> {
    const [ask, bid] = await Promise.all([this.sideMedian('1'), this.sideMedian('0')]);
    return { value: mean([ask, bid]), ask, bid, effectiveDate: caracasDate(this.now()) };
  }

  private async sideMedian(side: Side): Promise<Decimal> {
    const body = search.parse(
      await this.http(URLS.bybitP2p, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tokenId: 'USDT',
          currencyId: 'VES',
          payment: [],
          side,
          size: ADS_PER_SIDE,
          page: '1',
          amount: '',
          authMaker: false,
          canTrade: false,
        }),
      }),
    );
    return median(body.result.items.map((item) => parseDecimal(item.price)));
  }
}
