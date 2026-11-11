import { addDays, lastDayOf } from '../dates';
import type { DayRates, LatestDocument, MonthDocument, PublishedQuote } from '../model';
import { REFERENCE_IDS } from './catalog';
import type { LatestQuote, LatestV2, MonthV2, Quote } from './model';

/** The bolivar references, read from the documents the v1 feed already keeps. */
export function vesLatest(document: LatestDocument): LatestV2 {
  const { bcvUsd, bcvEur, bcvUsdNext, bcvEurNext, usdt } = document.rates;
  const references: LatestQuote[] = [];
  if (bcvUsd !== null) {
    references.push(latestQuote(REFERENCE_IDS.vesBcv, bcvUsd, bcvUsdNext));
  }
  if (bcvEur !== null) {
    references.push(latestQuote(REFERENCE_IDS.vesBcvEur, bcvEur, bcvEurNext));
  }
  if (usdt !== null) {
    references.push({
      ...latestQuote(REFERENCE_IDS.vesUsdtP2p, usdt),
      bid: usdt.bid,
      ask: usdt.ask,
    });
  }
  return { schemaVersion: 2, currency: 'VES', updatedAt: document.updatedAt, references };
}

function latestQuote(id: string, quote: PublishedQuote, next?: PublishedQuote | null): LatestQuote {
  return {
    id,
    value: quote.value,
    since: quote.effectiveDate,
    source: quote.source,
    fetchedAt: quote.fetchedAt,
    ...(next ? { next: { value: next.value, since: next.effectiveDate } } : {}),
  };
}

type Carried = Record<string, Quote>;

/**
 * Every day of `month` up to `today`, each reference with the value in force: on a day its
 * source did not publish (a weekend, a holiday), the last value published before it.
 */
export function vesMonth(
  month: string,
  document: MonthDocument | null,
  before: MonthDocument | null,
  today: string,
): MonthV2 | null {
  const first = `${month}-01`;
  if (document === null || today < first) {
    return null;
  }
  const last = lastDayOf(month) < today ? lastDayOf(month) : today;
  let carried = lastValues(before);
  const days: MonthV2['days'] = {};
  for (let day = first; day <= last; day = addDays(day, 1)) {
    const published = document.days[day];
    carried = published === undefined ? carried : { ...carried, ...quotesOf(day, published) };
    if (Object.keys(carried).length > 0) {
      days[day] = carried;
    }
  }
  return { schemaVersion: 2, currency: 'VES', month, days };
}

function lastValues(document: MonthDocument | null): Carried {
  let carried: Carried = {};
  for (const day of Object.keys(document?.days ?? {}).sort()) {
    carried = { ...carried, ...quotesOf(day, document?.days[day] ?? {}) };
  }
  return carried;
}

function quotesOf(day: string, rates: DayRates): Carried {
  const quotes: Carried = {};
  if (rates.bcvUsd !== undefined) {
    quotes[REFERENCE_IDS.vesBcv] = { value: rates.bcvUsd, since: day };
  }
  if (rates.bcvEur !== undefined) {
    quotes[REFERENCE_IDS.vesBcvEur] = { value: rates.bcvEur, since: day };
  }
  if (rates.usdt !== undefined) {
    quotes[REFERENCE_IDS.vesUsdtP2p] = {
      value: rates.usdt,
      since: day,
      ...(rates.usdtSource === undefined ? {} : { source: rates.usdtSource }),
    };
  }
  return quotes;
}
