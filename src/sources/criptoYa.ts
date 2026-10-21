import { z } from 'zod';
import { URLS } from '../config';
import { caracasDate } from '../dates';
import { mean, parseDecimal } from '../decimal';
import type { JsonClient } from '../http';
import type { Source, UsdtReading } from '../model';

const quote = z.object({
  ask: z.number().positive(),
  bid: z.number().positive(),
  time: z.number().int().positive(),
});

export class CriptoYaUsdt implements Source<UsdtReading> {
  readonly name = 'criptoya';

  constructor(private readonly http: JsonClient) {}

  async read(): Promise<UsdtReading> {
    const body = quote.parse(await this.http(URLS.criptoYa));
    const ask = parseDecimal(body.ask);
    const bid = parseDecimal(body.bid);
    return {
      value: mean([ask, bid]),
      ask,
      bid,
      effectiveDate: caracasDate(new Date(body.time * 1000)),
    };
  }
}
