import { addDays, lastDayOf, monthOf } from '../dates';
import type { LatestQuote, MonthV2, Quote } from './model';

/** A value as its source published it on one date. */
export interface DayValue {
  value: string;
  source?: string;
}

/** Per date, the references whose source published that date. */
export type SparseDays = Record<string, Record<string, DayValue>>;

/** One stored document per month, shared by every currency so an hourly write covers them all. */
export interface StoredMonth {
  schemaVersion: 2;
  month: string;
  currencies: Record<string, SparseDays>;
}

export function sparseFromLatest(fresh: readonly LatestQuote[]): SparseDays {
  const days: SparseDays = {};
  for (const quote of fresh) {
    days[quote.since] = {
      ...days[quote.since],
      [quote.id]: { value: quote.value, source: quote.source },
    };
  }
  return days;
}

export function byMonth(days: SparseDays): Map<string, SparseDays> {
  const months = new Map<string, SparseDays>();
  for (const [date, values] of Object.entries(days)) {
    months.set(monthOf(date), { ...months.get(monthOf(date)), [date]: values });
  }
  return months;
}

/**
 * Later values win, so each day ends with the last value seen that day. With `keepExisting`, a
 * backfill never replaces what the feed itself recorded.
 */
export function mergeStoredMonth(
  document: StoredMonth | null,
  month: string,
  currency: string,
  days: SparseDays,
  keepExisting = false,
): StoredMonth {
  const merged: SparseDays = { ...document?.currencies[currency] };
  for (const [date, values] of Object.entries(days)) {
    const current = merged[date] ?? {};
    merged[date] = keepExisting ? { ...values, ...current } : { ...current, ...values };
  }
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  return {
    schemaVersion: 2,
    month,
    currencies: { ...document?.currencies, [currency]: sorted },
  };
}

type Carried = Record<string, Quote>;

/**
 * Every day of `month` up to `today`, each reference with the value in force: on a day its
 * source did not publish (a weekend, a holiday), the last value published before it.
 */
export function denseMonth(
  currency: string,
  month: string,
  days: SparseDays | undefined,
  before: SparseDays | undefined,
  today: string,
): MonthV2 | null {
  const first = `${month}-01`;
  if (days === undefined || today < first) {
    return null;
  }
  const last = lastDayOf(month) < today ? lastDayOf(month) : today;
  let carried = lastValues(before);
  const dense: MonthV2['days'] = {};
  for (let day = first; day <= last; day = addDays(day, 1)) {
    carried = { ...carried, ...quotesOf(day, days[day]) };
    if (Object.keys(carried).length > 0) {
      dense[day] = carried;
    }
  }
  return { schemaVersion: 2, currency, month, days: dense };
}

function lastValues(days: SparseDays | undefined): Carried {
  let carried: Carried = {};
  for (const day of Object.keys(days ?? {}).sort()) {
    carried = { ...carried, ...quotesOf(day, days?.[day]) };
  }
  return carried;
}

function quotesOf(day: string, values: Record<string, DayValue> | undefined): Carried {
  const quotes: Carried = {};
  for (const [id, { value, source }] of Object.entries(values ?? {})) {
    quotes[id] = { value, since: day, ...(source === undefined ? {} : { source }) };
  }
  return quotes;
}
