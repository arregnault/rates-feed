import type { DayRates, LatestDocument, MonthDocument, PublishedQuote } from '../model';
import { REFERENCE_IDS } from './catalog';
import { denseMonth, type DayValue, type SparseDays } from './history';
import type { LatestQuote, LatestV2, MonthV2 } from './model';

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

/** The bolivar history in the v2 shape, from the v1 month documents. */
export function vesMonth(
  month: string,
  document: MonthDocument | null,
  before: MonthDocument | null,
  today: string,
): MonthV2 | null {
  return denseMonth(
    'VES',
    month,
    document === null ? undefined : sparseOf(document),
    before === null ? undefined : sparseOf(before),
    today,
  );
}

function sparseOf(document: MonthDocument): SparseDays {
  return Object.fromEntries(
    Object.entries(document.days).map(([day, rates]) => [day, valuesOf(rates)]),
  );
}

function valuesOf(rates: DayRates): Record<string, DayValue> {
  const values: Record<string, DayValue> = {};
  if (rates.bcvUsd !== undefined) {
    values[REFERENCE_IDS.vesBcv] = { value: rates.bcvUsd };
  }
  if (rates.bcvEur !== undefined) {
    values[REFERENCE_IDS.vesBcvEur] = { value: rates.bcvEur };
  }
  if (rates.usdt !== undefined) {
    values[REFERENCE_IDS.vesUsdtP2p] = {
      value: rates.usdt,
      ...(rates.usdtSource === undefined ? {} : { source: rates.usdtSource }),
    };
  }
  return values;
}
