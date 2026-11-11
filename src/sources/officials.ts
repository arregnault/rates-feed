import { z } from 'zod';
import { OFFICIAL_URLS, URLS } from '../config';
import { addDays, localDate } from '../dates';
import { formatDecimal, parseDecimal } from '../decimal';
import type { JsonClient } from '../http';
import type { DatedValue, Source } from '../model';
import type { ReferenceReading } from '../v2/collect';

/**
 * Several official rates are published the day before they apply (like the BCV's). The current
 * one is the newest dated today or earlier.
 */
function currentOf(series: readonly DatedValue[], today: string, label: string): ReferenceReading {
  const current = [...series]
    .filter((point) => point.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  if (current === undefined) {
    throw new Error(`${label} has no value dated ${today} or earlier`);
  }
  return { value: parseDecimal(current.value), effectiveDate: current.date };
}

function normalized(value: number | string): string {
  return formatDecimal(parseDecimal(value));
}

const trmRows = z.array(
  z.object({ valor: z.string(), vigenciadesde: z.string().regex(/^\d{4}-\d{2}-\d{2}T/) }),
);

/** Colombia's TRM from the open data portal: each row says from which date it applies. */
export async function readTrm(http: JsonClient, from: string): Promise<DatedValue[]> {
  return trmRows
    .parse(await http(OFFICIAL_URLS.trm(from)))
    .map((row) => ({ date: row.vigenciadesde.slice(0, 10), value: normalized(row.valor) }));
}

export class DatosGovCoTrm implements Source<ReferenceReading> {
  readonly name = 'datos-gov-co';

  constructor(
    private readonly http: JsonClient,
    private readonly today: () => string,
  ) {}

  async read(): Promise<ReferenceReading> {
    const today = this.today();
    return currentOf(await readTrm(this.http, addDays(today, -10)), today, 'TRM');
  }
}

const mindicadorSeries = z.object({
  serie: z.array(z.object({ fecha: z.string(), valor: z.number().positive() })),
});

/** Chile's "dólar observado"; dates are local midnights written in UTC, so read in Santiago. */
async function readMindicador(http: JsonClient, url: string): Promise<DatedValue[]> {
  return mindicadorSeries.parse(await http(url)).serie.map((point) => ({
    date: localDate(new Date(point.fecha), 'America/Santiago'),
    value: normalized(point.valor),
  }));
}

export function readMindicadorYear(http: JsonClient, year: number): Promise<DatedValue[]> {
  return readMindicador(http, OFFICIAL_URLS.mindicadorYear(year));
}

export class MindicadorDollar implements Source<ReferenceReading> {
  readonly name = 'mindicador';

  constructor(
    private readonly http: JsonClient,
    private readonly today: () => string,
  ) {}

  async read(): Promise<ReferenceReading> {
    const series = await readMindicador(this.http, OFFICIAL_URLS.mindicadorDollar);
    return currentOf(series, this.today(), 'Dólar observado');
  }
}

const ptaxRows = z.object({
  value: z.array(z.object({ cotacaoVenda: z.number().positive(), dataHoraCotacao: z.string() })),
});

/** Brazil's PTAX, the selling rate, by its local publication date. */
export async function readPtax(http: JsonClient, from: string, to: string): Promise<DatedValue[]> {
  return ptaxRows.parse(await http(OFFICIAL_URLS.ptax(from, to))).value.map((row) => ({
    date: row.dataHoraCotacao.slice(0, 10),
    value: normalized(row.cotacaoVenda),
  }));
}

export class BcbPtax implements Source<ReferenceReading> {
  readonly name = 'bcb-ptax';

  constructor(
    private readonly http: JsonClient,
    private readonly today: () => string,
  ) {}

  async read(): Promise<ReferenceReading> {
    const today = this.today();
    return currentOf(await readPtax(this.http, addDays(today, -10), today), today, 'PTAX');
  }
}

const bcrpSeries = z.object({
  periods: z.array(z.object({ name: z.string(), values: z.array(z.string()).min(1) })),
});

const SPANISH_MONTHS: Record<string, string> = {
  Ene: '01',
  Feb: '02',
  Mar: '03',
  Abr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Ago: '08',
  Set: '09',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dic: '12',
};

/** "06.Nov.26" to 2026-11-06. */
function bcrpDate(name: string): string {
  const match = /^(\d{2})\.(\w{3})\.(\d{2})$/.exec(name);
  const month = match?.[2] === undefined ? undefined : SPANISH_MONTHS[match[2]];
  if (match === null || month === undefined) {
    throw new Error(`Not a BCRP date: ${name}`);
  }
  return `20${match[3]}-${month}-${match[1]}`;
}

/** Peru's SBS selling rate. Days without a value ("n.d.") are left out. */
export async function readBcrp(http: JsonClient, from: string, to: string): Promise<DatedValue[]> {
  return bcrpSeries
    .parse(await http(OFFICIAL_URLS.bcrpSbs(from, to)))
    .periods.filter((period) => /^\d+(?:\.\d+)?$/.test(period.values[0] ?? ''))
    .map((period) => ({ date: bcrpDate(period.name), value: normalized(period.values[0] ?? '') }));
}

export class BcrpSbs implements Source<ReferenceReading> {
  readonly name = 'bcrp';

  constructor(
    private readonly http: JsonClient,
    private readonly today: () => string,
  ) {}

  async read(): Promise<ReferenceReading> {
    const today = this.today();
    return currentOf(await readBcrp(this.http, addDays(today, -10), today), today, 'SBS');
  }
}

const mexicoQuotes = z.array(
  z.object({ moneda: z.string(), fix: z.number().positive(), fechaActualizacion: z.string() }),
);

/** Mexico's FIX. The timestamp is the date at UTC midnight, so its date part is the date. */
export class DolarApiMexicoFix implements Source<ReferenceReading> {
  readonly name = 'dolarapi';

  constructor(private readonly http: JsonClient) {}

  async read(): Promise<ReferenceReading> {
    const quote = mexicoQuotes
      .parse(await this.http(OFFICIAL_URLS.dolarApiMexico))
      .find((item) => item.moneda === 'USD');
    if (quote === undefined) {
      throw new Error(`${OFFICIAL_URLS.dolarApiMexico} has no USD quote`);
    }
    return { value: parseDecimal(quote.fix), effectiveDate: quote.fechaActualizacion.slice(0, 10) };
  }
}

const boliviaQuote = z.object({
  venta: z.number().positive(),
  fechaActualizacion: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
});

/**
 * Bolivia's official rate (TCO) as the Banco Central de Bolivia publishes it, which does not
 * answer requests from Workers. The timestamp is the date at UTC midnight.
 */
export class DolarApiBoliviaOfficial implements Source<ReferenceReading> {
  readonly name = 'dolarapi';

  constructor(private readonly http: JsonClient) {}

  async read(): Promise<ReferenceReading> {
    const quote = boliviaQuote.parse(await this.http(OFFICIAL_URLS.dolarApiBolivia));
    return {
      value: parseDecimal(quote.venta),
      effectiveDate: quote.fechaActualizacion.slice(0, 10),
    };
  }
}

const currencyApiDay = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  usd: z.record(z.string(), z.number()),
});

function marketValue(rates: Record<string, number>, currency: string, url: string): string {
  const value = rates[currency.toLowerCase()];
  if (value === undefined || value <= 0) {
    throw new Error(`${url} has no ${currency} rate`);
  }
  return normalized(value);
}

/** A market rate per US dollar from currency-api, for currencies without a single official one. */
export class CurrencyApiMarket implements Source<ReferenceReading> {
  readonly name = 'currency-api';

  constructor(
    private readonly http: JsonClient,
    private readonly currency: string,
  ) {}

  async read(): Promise<ReferenceReading> {
    const day = currencyApiDay.parse(await this.http(URLS.currencyApi));
    return {
      value: parseDecimal(marketValue(day.usd, this.currency, URLS.currencyApi)),
      effectiveDate: day.date,
    };
  }
}

/** The market rates of `currencies` on one past date. */
export async function readCurrencyApiOn(
  http: JsonClient,
  date: string,
  currencies: readonly string[],
): Promise<Map<string, DatedValue>> {
  const url = OFFICIAL_URLS.currencyApiOn(date);
  const day = currencyApiDay.parse(await http(url));
  return new Map(
    currencies.map((currency) => [
      currency,
      { date: day.date, value: marketValue(day.usd, currency, url) },
    ]),
  );
}
