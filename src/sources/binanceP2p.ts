import { z } from 'zod';
import { URLS } from '../config';
import { caracasDate } from '../dates';
import { mean, median, parseDecimal, type Decimal } from '../decimal';
import type { JsonClient } from '../http';
import type { Source, UsdtReading } from '../model';

const ADS_PER_SIDE = 10;

const search = z.object({
  code: z.literal('000000'),
  data: z.array(z.object({ adv: z.object({ price: z.string() }) })).min(1),
});

type TradeType = 'BUY' | 'SELL';

/**
 * Undocumented endpoint behind the Binance P2P website: only the feed calls it, never the app.
 * The median of verified merchants' top ads resists a single outlier ad.
 */
export class BinanceP2pUsdt implements Source<UsdtReading> {
  readonly name = 'binance-p2p';

  constructor(
    private readonly http: JsonClient,
    private readonly now: () => Date,
  ) {}

  async read(): Promise<UsdtReading> {
    const [ask, bid] = await Promise.all([this.sideMedian('BUY'), this.sideMedian('SELL')]);
    return { value: mean([ask, bid]), ask, bid, effectiveDate: caracasDate(this.now()) };
  }

  private async sideMedian(tradeType: TradeType): Promise<Decimal> {
    const body = search.parse(
      await this.http(URLS.binanceP2p, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          asset: 'USDT',
          fiat: 'VES',
          tradeType,
          page: 1,
          rows: ADS_PER_SIDE,
          payTypes: [],
          publisherType: 'merchant',
        }),
      }),
    );
    return median(body.data.map((item) => parseDecimal(item.adv.price)));
  }
}
