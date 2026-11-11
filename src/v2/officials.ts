import { addDays, localDate } from '../dates';
import type { JsonClient } from '../http';
import type { DatedValue } from '../model';
import {
  BcbPtax,
  BcrpSbs,
  CurrencyApiMarket,
  DatosGovCoTrm,
  DolarApiMexicoFix,
  MindicadorDollar,
  readBcrp,
  readCurrencyApiOn,
  readMindicadorYear,
  readPtax,
  readTrm,
} from '../sources/officials';
import {
  HISTORY_FROM,
  MARKET_CURRENCIES,
  MARKET_HISTORY_FROM,
  marketId,
  OFFICIAL_REFERENCES,
  P2P_CURRENCIES,
  TIME_ZONES,
  type CurrencyCode,
} from './catalog';
import type { ReferenceChain } from './collect';
import type { BackfillTask } from './feed';
import { sparseOf, type SparseDays } from './history';

/** Official and market rates change once a day at most. */
const OFFICIAL_EVERY_MINUTES = 60;

/** Past market rates come one date per request; five per run keep within 50 subrequests. */
const MARKET_DAYS_PER_TASK = 5;

/** From this date on the feed records market rates itself. */
const MARKET_BACKFILL_UNTIL = '2026-11-11';

export function localChain(http: JsonClient, code: LocalCode, now: Date): ReferenceChain {
  const today = (): string => localDate(now, TIME_ZONES[code]);
  const official = (id: string, source: ReferenceChain['sources'][number]): ReferenceChain => ({
    id,
    everyMinutes: OFFICIAL_EVERY_MINUTES,
    sources: [source],
  });
  switch (code) {
    case 'BRL':
      return official(OFFICIAL_REFERENCES.BRL.id, new BcbPtax(http, today));
    case 'CLP':
      return official(OFFICIAL_REFERENCES.CLP.id, new MindicadorDollar(http, today));
    case 'COP':
      return official(OFFICIAL_REFERENCES.COP.id, new DatosGovCoTrm(http, today));
    case 'MXN':
      return official(OFFICIAL_REFERENCES.MXN.id, new DolarApiMexicoFix(http));
    case 'PEN':
      return official(OFFICIAL_REFERENCES.PEN.id, new BcrpSbs(http, today));
    default:
      return official(marketId(code), new CurrencyApiMarket(http, code));
  }
}

function task(
  key: string,
  currency: CurrencyCode,
  id: string,
  source: string,
  load: () => Promise<DatedValue[]>,
): BackfillTask {
  return { key, load: async () => ({ [currency]: sparseOf(await load(), id, source) }) };
}

/** Currencies with an official or market reference besides their P2P one. */
export type LocalCode = Exclude<(typeof P2P_CURRENCIES)[number], 'ARS'>;

/**
 * History since 2023 of the official rates that have it. Market rates come for all their
 * currencies at once since 2024-03-02, so the first of them carries those tasks.
 */
export function localBackfill(http: JsonClient, code: LocalCode, now: Date): BackfillTask[] {
  const today = localDate(now, TIME_ZONES[code]);
  switch (code) {
    case 'COP':
      return [
        task('cop:trm', code, OFFICIAL_REFERENCES.COP.id, 'datos-gov-co', () =>
          readTrm(http, HISTORY_FROM),
        ),
      ];
    case 'BRL':
      return [
        task('brl:ptax', code, OFFICIAL_REFERENCES.BRL.id, 'bcb-ptax', () =>
          readPtax(http, HISTORY_FROM, today),
        ),
      ];
    case 'PEN':
      return [
        task('pen:sbs', code, OFFICIAL_REFERENCES.PEN.id, 'bcrp', () =>
          readBcrp(http, HISTORY_FROM, today),
        ),
      ];
    case 'CLP':
      return yearsSince(HISTORY_FROM, today).map((year) =>
        task(`clp:${year}`, code, OFFICIAL_REFERENCES.CLP.id, 'mindicador', () =>
          readMindicadorYear(http, year),
        ),
      );
    case 'MXN':
      return [];
    default:
      return code === MARKET_CURRENCIES[0] ? marketBackfill(http) : [];
  }
}

function yearsSince(from: string, today: string): number[] {
  const years: number[] = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(today.slice(0, 4)); year += 1) {
    years.push(year);
  }
  return years;
}

function marketBackfill(http: JsonClient): BackfillTask[] {
  const tasks: BackfillTask[] = [];
  for (
    let start = MARKET_HISTORY_FROM;
    start < MARKET_BACKFILL_UNTIL;
    start = addDays(start, MARKET_DAYS_PER_TASK)
  ) {
    const dates: string[] = [];
    for (let day = 0; day < MARKET_DAYS_PER_TASK; day += 1) {
      const date = addDays(start, day);
      if (date < MARKET_BACKFILL_UNTIL) {
        dates.push(date);
      }
    }
    tasks.push({ key: `market:${start}`, load: () => loadMarketDays(http, dates) });
  }
  return tasks;
}

/** A date currency-api is missing is skipped, so one gap cannot hold the whole backfill. */
async function loadMarketDays(
  http: JsonClient,
  dates: readonly string[],
): Promise<Record<string, SparseDays>> {
  const results = await Promise.allSettled(
    dates.map((date) => readCurrencyApiOn(http, date, MARKET_CURRENCIES)),
  );
  const byCurrency: Record<string, SparseDays> = {};
  for (const result of results) {
    if (result.status === 'rejected') {
      continue;
    }
    for (const [currency, point] of result.value) {
      const id = marketId(currency as CurrencyCode);
      byCurrency[currency] = {
        ...byCurrency[currency],
        [point.date]: { [id]: { value: point.value, source: 'currency-api' } },
      };
    }
  }
  return byCurrency;
}
