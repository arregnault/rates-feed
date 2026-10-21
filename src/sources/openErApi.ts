import { z } from 'zod';
import { FX_CURRENCIES, URLS } from '../config';
import { divide, parseDecimal } from '../decimal';
import type { JsonClient } from '../http';
import type { FxReading, Reading, Source } from '../model';
import { pickCurrencies } from './currencies';

const latest = z.object({
  result: z.literal('success'),
  time_last_update_utc: z.string(),
  rates: z.record(z.string(), z.number().positive()),
});

async function read(http: JsonClient): Promise<{ date: string; rates: Record<string, number> }> {
  const body = latest.parse(await http(URLS.openErApi));
  return {
    date: new Date(body.time_last_update_utc).toISOString().slice(0, 10),
    rates: body.rates,
  };
}

function rate(rates: Record<string, number>, code: string): number {
  const value = rates[code];
  if (value === undefined) {
    throw new Error(`open.er-api has no ${code} rate`);
  }
  return value;
}

/** Its VES rate mirrors the BCV official dollar. */
export class OpenErApiBcvUsd implements Source<Reading> {
  readonly name = 'open-er-api';

  constructor(private readonly http: JsonClient) {}

  async read(): Promise<Reading> {
    const { date, rates } = await read(this.http);
    return { value: parseDecimal(rate(rates, 'VES')), effectiveDate: date };
  }
}

/** BCV publishes its own euro rate; crossing through the dollar only approximates it. */
export class OpenErApiBcvEurCross implements Source<Reading> {
  readonly name = 'open-er-api-cross';

  constructor(private readonly http: JsonClient) {}

  async read(): Promise<Reading> {
    const { date, rates } = await read(this.http);
    return {
      value: divide(parseDecimal(rate(rates, 'VES')), parseDecimal(rate(rates, 'EUR'))),
      effectiveDate: date,
    };
  }
}

export class OpenErApiFx implements Source<FxReading> {
  readonly name = 'open-er-api';

  constructor(private readonly http: JsonClient) {}

  async read(): Promise<FxReading> {
    const { date, rates } = await read(this.http);
    return { effectiveDate: date, perUsd: pickCurrencies(rates, FX_CURRENCIES) };
  }
}
