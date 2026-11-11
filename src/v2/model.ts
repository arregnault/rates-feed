/** What a reference measures: the units of the local currency that one unit of `base` buys. */
export type ReferenceKind = 'official' | 'exchange' | 'informal' | 'p2p' | 'market';

export interface Reference {
  id: string;
  name: string;
  kind: ReferenceKind;
  base: string;
  /** First date with a value in the history, or null when only the current value is kept. */
  historyFrom: string | null;
  /** History before this date comes from a stand-in source, named in each day's `source`. */
  measuredFrom?: string;
}

export interface Currency {
  code: string;
  name: string;
  /** The zone dates are read in: `since` and the days of the history. */
  timeZone: string;
  references: Reference[];
}

export interface IndexDocument {
  schemaVersion: 2;
  currencies: Currency[];
}

export interface Quote {
  value: string;
  /** Date this value took effect at its source; earlier than today when nothing newer exists. */
  since: string;
  source?: string;
}

export interface LatestQuote extends Quote {
  id: string;
  source: string;
  fetchedAt: string;
  bid?: string;
  ask?: string;
  /** A value already published for a later date, until that date arrives. */
  next?: Quote;
}

export interface LatestV2 {
  schemaVersion: 2;
  currency: string;
  updatedAt: string;
  references: LatestQuote[];
}

export interface MonthV2 {
  schemaVersion: 2;
  currency: string;
  month: string;
  /** Every calendar day, each reference with the value in force that day. */
  days: Record<string, Record<string, Quote>>;
}
