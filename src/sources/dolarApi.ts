import { z } from 'zod';
import { URLS } from '../config';
import { dateOfTimestamp } from '../dates';
import { parseDecimal } from '../decimal';
import type { JsonClient } from '../http';
import type { Reading, Source, UsdtReading } from '../model';

const quotes = z.array(
  z.object({
    fuente: z.string(),
    promedio: z.number().positive(),
    fechaActualizacion: z.string(),
  }),
);

const history = z.array(
  z.object({
    fuente: z.string(),
    promedio: z.number().positive(),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
);

export type HistoryPoint = z.infer<typeof history>[number];

async function readQuote(http: JsonClient, url: string, origin: string): Promise<Reading> {
  const quote = quotes.parse(await http(url)).find((item) => item.fuente === origin);
  if (quote === undefined) {
    throw new Error(`${url} has no "${origin}" quote`);
  }
  return {
    value: parseDecimal(quote.promedio),
    effectiveDate: dateOfTimestamp(quote.fechaActualizacion),
  };
}

export class DolarApiBcvUsd implements Source<Reading> {
  readonly name = 'dolarapi';

  constructor(private readonly http: JsonClient) {}

  read(): Promise<Reading> {
    return readQuote(this.http, URLS.dolarApiDollars, 'oficial');
  }
}

export class DolarApiBcvEur implements Source<Reading> {
  readonly name = 'dolarapi';

  constructor(private readonly http: JsonClient) {}

  read(): Promise<Reading> {
    return readQuote(this.http, URLS.dolarApiEuros, 'oficial');
  }
}

/** The parallel rate tracks USDT closely but is not USDT itself, hence its own source name. */
export class DolarApiParaleloUsdt implements Source<UsdtReading> {
  readonly name = 'dolarapi-paralelo';

  constructor(private readonly http: JsonClient) {}

  async read(): Promise<UsdtReading> {
    const reading = await readQuote(this.http, URLS.dolarApiDollars, 'paralelo');
    return { ...reading, bid: reading.value, ask: reading.value };
  }
}

export async function readDolarApiHistory(
  http: JsonClient,
): Promise<{ dollars: HistoryPoint[]; euros: HistoryPoint[] }> {
  const [dollars, euros] = await Promise.all([
    http(URLS.dolarApiDollarHistory),
    http(URLS.dolarApiEuroHistory),
  ]);
  return { dollars: history.parse(dollars), euros: history.parse(euros) };
}
