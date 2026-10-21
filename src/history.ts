import type { FreshQuotes } from './collect';
import { monthOf } from './dates';
import { formatDecimal, parseDecimal } from './decimal';
import type { DayRates, MonthDocument } from './model';
import type { HistoryPoint } from './sources/dolarApi';

/** Approximations stay out of history: a past date must keep the rate that was published. */
const NON_HISTORICAL_SOURCES = new Set(['open-er-api-cross']);

export type DayPatches = Map<string, DayRates>;

export function patchesFromFresh(fresh: FreshQuotes): DayPatches {
  const patches: DayPatches = new Map();
  const patch = (date: string, rates: DayRates): void => {
    patches.set(date, { ...patches.get(date), ...rates });
  };

  if (fresh.bcvUsd !== null) {
    patch(fresh.bcvUsd.effectiveDate, { bcvUsd: fresh.bcvUsd.value });
  }
  if (fresh.bcvEur !== null && !NON_HISTORICAL_SOURCES.has(fresh.bcvEur.source)) {
    patch(fresh.bcvEur.effectiveDate, { bcvEur: fresh.bcvEur.value });
  }
  if (fresh.usdt !== null) {
    patch(fresh.usdt.effectiveDate, { usdt: fresh.usdt.value, usdtSource: fresh.usdt.source });
  }
  for (const [code, quote] of Object.entries(fresh.fx)) {
    const existing = patches.get(quote.effectiveDate)?.fx;
    patch(quote.effectiveDate, { fx: { ...existing, [code]: quote.value } });
  }
  return patches;
}

/** Seeds history from dolarapi, whose parallel rate stands in for USDT before the feed existed. */
export function patchesFromBackfill(dollars: HistoryPoint[], euros: HistoryPoint[]): DayPatches {
  const patches: DayPatches = new Map();
  const patch = (date: string, rates: DayRates): void => {
    patches.set(date, { ...patches.get(date), ...rates });
  };
  const value = (point: HistoryPoint): string => formatDecimal(parseDecimal(point.promedio));

  for (const point of dollars) {
    if (point.fuente === 'oficial') {
      patch(point.fecha, { bcvUsd: value(point) });
    } else if (point.fuente === 'paralelo') {
      patch(point.fecha, { usdt: value(point), usdtSource: 'dolarapi-paralelo' });
    }
  }
  for (const point of euros) {
    if (point.fuente === 'oficial') {
      patch(point.fecha, { bcvEur: value(point) });
    }
  }
  return patches;
}

export function groupByMonth(patches: DayPatches): Map<string, DayPatches> {
  const months = new Map<string, DayPatches>();
  for (const [date, rates] of patches) {
    const month = months.get(monthOf(date)) ?? new Map<string, DayRates>();
    month.set(date, rates);
    months.set(monthOf(date), month);
  }
  return months;
}

/**
 * Later writes win, so each day ends with the last value seen that day. With `keepExisting`, a
 * backfill never replaces what the feed itself recorded.
 */
export function mergeMonth(
  document: MonthDocument | null,
  month: string,
  patches: DayPatches,
  keepExisting = false,
): MonthDocument {
  const days: Record<string, DayRates> = { ...document?.days };
  for (const [date, patch] of patches) {
    const current = days[date] ?? {};
    const fx = keepExisting ? { ...patch.fx, ...current.fx } : { ...current.fx, ...patch.fx };
    const merged = keepExisting ? { ...patch, ...current } : { ...current, ...patch };
    days[date] = Object.keys(fx).length > 0 ? { ...merged, fx } : merged;
  }
  return { schemaVersion: 1, month, days: sortKeys(days) };
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}
