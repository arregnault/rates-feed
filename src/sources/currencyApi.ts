import { z } from 'zod';
import { FX_CURRENCIES, URLS } from '../config';
import type { JsonClient } from '../http';
import type { FxReading, Source } from '../model';
import { pickCurrencies } from './currencies';

const latest = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  usd: z.record(z.string(), z.number()),
});

export class CurrencyApiFx implements Source<FxReading> {
  readonly name = 'currency-api';

  constructor(private readonly http: JsonClient) {}

  async read(): Promise<FxReading> {
    const body = latest.parse(await this.http(URLS.currencyApi));
    return {
      effectiveDate: body.date,
      perUsd: pickCurrencies(body.usd, FX_CURRENCIES, (code) => code.toLowerCase()),
    };
  }
}
