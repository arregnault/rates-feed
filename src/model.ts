import type { Decimal } from './decimal';

export interface Reading {
  value: Decimal;
  effectiveDate: string;
}

export interface UsdtReading extends Reading {
  bid: Decimal;
  ask: Decimal;
}

export interface FxReading {
  effectiveDate: string;
  /** Units of each currency per US dollar, keyed by ISO 4217 code. */
  perUsd: Map<string, Decimal>;
}

export interface Source<T> {
  readonly name: string;
  read(): Promise<T>;
}

export interface PublishedQuote {
  value: string;
  effectiveDate: string;
  source: string;
  fetchedAt: string;
}

export interface PublishedUsdt extends PublishedQuote {
  bid: string;
  ask: string;
}

export interface LatestDocument {
  schemaVersion: 1;
  updatedAt: string;
  rates: {
    bcvUsd: PublishedQuote | null;
    bcvEur: PublishedQuote | null;
    usdt: PublishedUsdt | null;
    fx: Record<string, PublishedQuote>;
  };
}

export interface DayRates {
  bcvUsd?: string;
  bcvEur?: string;
  usdt?: string;
  usdtSource?: string;
  fx?: Record<string, string>;
}

export interface MonthDocument {
  schemaVersion: 1;
  month: string;
  days: Record<string, DayRates>;
}
