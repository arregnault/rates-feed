import { z } from 'zod';
import { FX_CURRENCIES, URLS } from '../config';
import { caracasDate } from '../dates';
import { parseDecimal } from '../decimal';
import type { JsonClient } from '../http';
import type { FxReading, Source, UsdtReading } from '../model';
import { pickCurrencies } from './currencies';

const rates = z.object({
  USD: z.record(z.string(), z.number()),
  timestamp: z.number().int().positive(),
});

async function read(http: JsonClient): Promise<{ date: string; perUsd: Record<string, number> }> {
  const body = rates.parse(await http(URLS.yadio));
  return { date: caracasDate(new Date(body.timestamp)), perUsd: body.USD };
}

/** Yadio derives VES from local crypto trading, which follows the USDT P2P market. */
export class YadioUsdt implements Source<UsdtReading> {
  readonly name = 'yadio';

  constructor(private readonly http: JsonClient) {}

  async read(): Promise<UsdtReading> {
    const { date, perUsd } = await read(this.http);
    const ves = perUsd['VES'];
    if (ves === undefined || ves <= 0) {
      throw new Error('yadio has no VES rate');
    }
    const value = parseDecimal(ves);
    return { value, bid: value, ask: value, effectiveDate: date };
  }
}

export class YadioFx implements Source<FxReading> {
  readonly name = 'yadio';

  constructor(private readonly http: JsonClient) {}

  async read(): Promise<FxReading> {
    const { date, perUsd } = await read(this.http);
    return { effectiveDate: date, perUsd: pickCurrencies(perUsd, FX_CURRENCIES) };
  }
}
