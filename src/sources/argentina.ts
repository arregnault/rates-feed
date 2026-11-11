import { z } from 'zod';
import { ARGENTINA_DATOS_URLS, URLS } from '../config';
import { localDate } from '../dates';
import { formatDecimal, parseDecimal } from '../decimal';
import type { JsonClient } from '../http';
import type { Source } from '../model';
import { TIME_ZONES } from '../v2/catalog';
import type { ReferenceReading } from '../v2/collect';

/**
 * The houses ("casas") both sources name the same way. Each quotes what it pays (`compra`) and
 * what it charges (`venta`); the rate people repeat is the selling one.
 */
export const ARGENTINA_HOUSES = [
  'oficial',
  'mayorista',
  'bolsa',
  'contadoconliqui',
  'blue',
  'cripto',
  'tarjeta',
] as const;

export type ArgentinaHouse = (typeof ARGENTINA_HOUSES)[number];

const dolarApiQuotes = z.array(
  z.object({
    casa: z.string(),
    compra: z.number().positive().nullable(),
    venta: z.number().positive(),
    fechaActualizacion: z.string(),
  }),
);

const dayQuote = z.object({
  casa: z.string(),
  compra: z.number().positive().nullable(),
  venta: z.number().positive(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function reading(compra: number | null, venta: number, effectiveDate: string): ReferenceReading {
  const ask = parseDecimal(venta);
  return {
    value: ask,
    ask,
    ...(compra === null ? {} : { bid: parseDecimal(compra) }),
    effectiveDate,
  };
}

/** One request serves every house: the JSON client shares the response within a run. */
export class DolarApiArgentina implements Source<ReferenceReading> {
  readonly name = 'dolarapi';

  constructor(
    private readonly http: JsonClient,
    private readonly house: ArgentinaHouse,
  ) {}

  async read(): Promise<ReferenceReading> {
    const quote = dolarApiQuotes
      .parse(await this.http(URLS.dolarApiArgentina))
      .find((item) => item.casa === this.house);
    if (quote === undefined) {
      throw new Error(`${URLS.dolarApiArgentina} has no "${this.house}" quote`);
    }
    const effectiveDate = localDate(new Date(quote.fechaActualizacion), TIME_ZONES.ARS);
    return reading(quote.compra, quote.venta, effectiveDate);
  }
}

export class ArgentinaDatosDay implements Source<ReferenceReading> {
  readonly name = 'argentinadatos';

  constructor(
    private readonly http: JsonClient,
    private readonly house: ArgentinaHouse,
    private readonly now: () => Date,
  ) {}

  async read(): Promise<ReferenceReading> {
    const today = localDate(this.now(), TIME_ZONES.ARS);
    const quote = dayQuote.parse(await this.http(ARGENTINA_DATOS_URLS.day(this.house, today)));
    return reading(quote.compra, quote.venta, quote.fecha);
  }
}

export interface DayValue {
  date: string;
  value: string;
}

/**
 * The full series of a house, one entry per calendar day. Only dates from [from] are validated,
 * which keeps the run within the free plan's CPU limit.
 */
export async function readArgentinaDatosHistory(
  http: JsonClient,
  house: ArgentinaHouse,
  from: string,
): Promise<DayValue[]> {
  const series: unknown = await http(ARGENTINA_DATOS_URLS.history(house));
  if (!Array.isArray(series)) {
    throw new Error(`${ARGENTINA_DATOS_URLS.history(house)} is not a list`);
  }
  return series
    .filter((item: { fecha?: unknown }) => typeof item.fecha === 'string' && item.fecha >= from)
    .map((item) => dayQuote.parse(item))
    .map((item) => ({ date: item.fecha, value: formatDecimal(parseDecimal(item.venta)) }));
}
