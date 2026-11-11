import { CACHE } from '../cache';
import type { Warn } from '../collect';
import { localDate, monthOf } from '../dates';
import type { DocumentStore } from '../store';
import { collectGroup, groupDue, type ReferenceGroup } from './collect';
import {
  byMonth,
  mergeStoredMonth,
  sparseFromLatest,
  type SparseDays,
  type StoredMonth,
} from './history';
import type { LatestV2 } from './model';

export const V2_KEYS = {
  latest: 'v2/meta/latest.json',
  month: (month: string) => `v2/meta/history/${month}.json`,
  backfill: 'v2/meta/backfill.json',
} as const;

export interface StoredLatest {
  schemaVersion: 2;
  currencies: Record<string, LatestV2>;
}

/** One piece of past history, loaded in a run of its own to stay within the CPU limit. */
export interface BackfillTask {
  key: string;
  load: () => Promise<SparseDays>;
}

export interface CurrencyFeed {
  group: ReferenceGroup;
  utcOffsetHours: number;
  backfill: BackfillTask[];
}

export interface FeedV2Dependencies {
  store: DocumentStore;
  currencies: CurrencyFeed[];
  now: Date;
  warn: Warn;
}

export async function runFeedV2({
  store,
  currencies,
  now,
  warn,
}: FeedV2Dependencies): Promise<void> {
  const previous = await store.read<StoredLatest>(V2_KEYS.latest);
  const latest: StoredLatest = { schemaVersion: 2, currencies: { ...previous?.currencies } };
  for (const { group } of currencies) {
    const before = previous?.currencies[group.currency];
    if (groupDue(group, before, now)) {
      latest.currencies[group.currency] = (await collectGroup(group, before, now, warn)).latest;
    }
  }
  if (JSON.stringify(latest) !== JSON.stringify(previous)) {
    await store.write(V2_KEYS.latest, latest, CACHE.latest);
  }

  await backfillStep(store, currencies, now, warn);
  if (historyDue(now, currencies)) {
    for (const feed of currencies) {
      const quotes = latest.currencies[feed.group.currency]?.references ?? [];
      const currentMonth = monthOf(localDate(now, feed.utcOffsetHours));
      const days = sparseFromLatest(quotes.filter((quote) => monthOf(quote.since) >= currentMonth));
      await writeDays(store, feed.group.currency, days, currentMonth, false);
    }
  }
}

const RUN_EVERY_MINUTES = 5;

/**
 * Once an hour, and on the last run of each currency's day so no value of that day is lost.
 * Writing every run would spend the KV daily write quota on documents of one value per day.
 */
export function historyDue(now: Date, currencies: readonly CurrencyFeed[]): boolean {
  const nextRun = new Date(now.getTime() + RUN_EVERY_MINUTES * 60_000);
  return (
    now.getUTCMinutes() < RUN_EVERY_MINUTES ||
    currencies.some(
      ({ utcOffsetHours }) => localDate(nextRun, utcOffsetHours) !== localDate(now, utcOffsetHours),
    )
  );
}

interface BackfillState {
  done: string[];
}

async function backfillStep(
  store: DocumentStore,
  currencies: readonly CurrencyFeed[],
  now: Date,
  warn: Warn,
): Promise<void> {
  const state = (await store.read<BackfillState>(V2_KEYS.backfill)) ?? { done: [] };
  const pending = currencies
    .flatMap((feed) => feed.backfill.map((task) => ({ feed, task })))
    .find(({ task }) => !state.done.includes(task.key));
  if (pending === undefined) {
    return;
  }
  try {
    const currentMonth = monthOf(localDate(now, pending.feed.utcOffsetHours));
    await writeDays(
      store,
      pending.feed.group.currency,
      await pending.task.load(),
      currentMonth,
      true,
    );
    await store.write(
      V2_KEYS.backfill,
      { done: [...state.done, pending.task.key].sort() },
      CACHE.latest,
    );
  } catch (error) {
    warn(`backfill ${pending.task.key}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writeDays(
  store: DocumentStore,
  currency: string,
  days: SparseDays,
  currentMonth: string,
  keepExisting: boolean,
): Promise<void> {
  for (const [month, monthDays] of byMonth(days)) {
    const key = V2_KEYS.month(month);
    const existing = await store.read<StoredMonth>(key);
    const merged = mergeStoredMonth(existing, month, currency, monthDays, keepExisting);
    if (JSON.stringify(merged) !== JSON.stringify(existing)) {
      await store.write(key, merged, month < currentMonth ? CACHE.closedMonth : CACHE.openMonth);
    }
  }
}
