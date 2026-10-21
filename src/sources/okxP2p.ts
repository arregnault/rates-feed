import { z } from 'zod';
import { URLS } from '../config';
import { caracasDate } from '../dates';
import { mean, median, parseDecimal, type Decimal } from '../decimal';
import type { JsonClient } from '../http';
import type { Source, UsdtReading } from '../model';

const ADS_PER_SIDE = 10;

const ads = z.array(z.object({ price: z.string() })).min(1);

const sellBook = z.object({ code: z.literal(0), data: z.object({ sell: ads }) });
const buyBook = z.object({ code: z.literal(0), data: z.object({ buy: ads }) });

function topMedian(book: readonly { price: string }[]): Decimal {
  return median(book.slice(0, ADS_PER_SIDE).map((ad) => parseDecimal(ad.price)));
}

/**
 * Undocumented endpoint behind the OKX P2P website: only the feed calls it, never the app.
 * The median of the top ads resists a single outlier ad.
 */
export class OkxP2pUsdt implements Source<UsdtReading> {
  readonly name = 'okx-p2p';

  constructor(
    private readonly http: JsonClient,
    private readonly now: () => Date,
  ) {}

  async read(): Promise<UsdtReading> {
    const [sell, buy] = await Promise.all([this.http(URLS.okxP2pSell), this.http(URLS.okxP2pBuy)]);
    const ask = topMedian(sellBook.parse(sell).data.sell);
    const bid = topMedian(buyBook.parse(buy).data.buy);
    return { value: mean([ask, bid]), ask, bid, effectiveDate: caracasDate(this.now()) };
  }
}
