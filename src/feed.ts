import { collect, type SourceChains, type Warn } from './collect';
import { caracasDate, monthOf } from './dates';
import {
  groupByMonth,
  mergeMonth,
  patchesFromBackfill,
  patchesFromFresh,
  type DayPatches,
} from './history';
import type { LatestDocument, MonthDocument } from './model';
import type { HistoryPoint } from './sources/dolarApi';
import type { DocumentStore } from './store';

export const KEYS = {
  latest: 'v1/latest.json',
  month: (month: string) => `v1/history/${month}.json`,
  backfill: 'v1/meta/backfill.json',
} as const;

const LATEST_CACHE = 'public, max-age=120';
const OPEN_MONTH_CACHE = 'public, max-age=900';
const CLOSED_MONTH_CACHE = 'public, max-age=31536000, immutable';

export type BackfillLoader = () => Promise<{ dollars: HistoryPoint[]; euros: HistoryPoint[] }>;

export interface FeedDependencies {
  store: DocumentStore;
  chains: SourceChains;
  loadBackfill: BackfillLoader;
  now: Date;
  warn: Warn;
}

export async function runFeed({
  store,
  chains,
  loadBackfill,
  now,
  warn,
}: FeedDependencies): Promise<LatestDocument> {
  const previous = await store.read<LatestDocument>(KEYS.latest);
  const { latest, fresh } = await collect(chains, previous, now, warn);
  await store.write(KEYS.latest, latest, LATEST_CACHE);

  const currentMonth = monthOf(caracasDate(now));
  await backfillStep(store, loadBackfill, currentMonth, warn);
  await writeHistory(store, patchesFromFresh(fresh), currentMonth);
  return latest;
}

/** Spread over several runs so a single invocation stays within the free plan's CPU limit. */
const BACKFILL_MONTHS_PER_RUN = 12;

interface BackfillState {
  done: boolean;
  completedMonths: string[];
}

async function backfillStep(
  store: DocumentStore,
  loadBackfill: BackfillLoader,
  currentMonth: string,
  warn: Warn,
): Promise<void> {
  const state = (await store.read<BackfillState>(KEYS.backfill)) ?? {
    done: false,
    completedMonths: [],
  };
  if (state.done) {
    return;
  }
  try {
    const { dollars, euros } = await loadBackfill();
    const months = groupByMonth(patchesFromBackfill(dollars, euros));
    const completed = new Set(state.completedMonths);
    const batch = [...months.keys()]
      .filter((month) => !completed.has(month))
      .sort()
      .slice(0, BACKFILL_MONTHS_PER_RUN);

    for (const month of batch) {
      await writeMonth(store, month, months.get(month) ?? new Map(), currentMonth, true);
      completed.add(month);
    }
    const next: BackfillState = {
      done: [...months.keys()].every((month) => completed.has(month)),
      completedMonths: [...completed].sort(),
    };
    await store.write(KEYS.backfill, next, LATEST_CACHE);
  } catch (error) {
    warn(`backfill: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writeHistory(
  store: DocumentStore,
  patches: DayPatches,
  currentMonth: string,
): Promise<void> {
  for (const [month, monthPatches] of groupByMonth(patches)) {
    await writeMonth(store, month, monthPatches, currentMonth, false);
  }
}

async function writeMonth(
  store: DocumentStore,
  month: string,
  patches: DayPatches,
  currentMonth: string,
  keepExisting: boolean,
): Promise<void> {
  const key = KEYS.month(month);
  const merged = mergeMonth(await store.read<MonthDocument>(key), month, patches, keepExisting);
  await store.write(key, merged, month < currentMonth ? CLOSED_MONTH_CACHE : OPEN_MONTH_CACHE);
}
