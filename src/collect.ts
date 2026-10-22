import { caracasDate } from './dates';
import { formatDecimal, parseDecimal, type Decimal } from './decimal';
import type {
  FxReading,
  LatestDocument,
  PublishedQuote,
  PublishedUsdt,
  Reading,
  Source,
  UsdtReading,
} from './model';

export interface SourceChains {
  bcvUsd: Source<Reading>[];
  bcvEur: Source<Reading>[];
  usdt: Source<UsdtReading>[];
  fx: Source<FxReading>[];
}

/** Quotes obtained in this run; anything missing kept its previous published value. */
export interface FreshQuotes {
  bcvUsd: PublishedQuote | null;
  bcvEur: PublishedQuote | null;
  usdt: PublishedUsdt | null;
  fx: Record<string, PublishedQuote>;
}

export type Warn = (message: string) => void;

export async function collect(
  chains: SourceChains,
  previous: LatestDocument | null,
  now: Date,
  warn: Warn,
): Promise<{ latest: LatestDocument; fresh: FreshQuotes }> {
  const fetchedAt = now.toISOString();
  const published = (quote: PublishedQuote | null | undefined) =>
    quote ? parseDecimal(quote.value) : null;
  const today = caracasDate(now);
  const [bcvUsd, bcvEur, usdt, fx] = await Promise.all([
    currentAndNext(chains.bcvUsd, published(previous?.rates.bcvUsd), today, warn),
    currentAndNext(chains.bcvEur, published(previous?.rates.bcvEur), today, warn),
    firstPlausible(chains.usdt, published(previous?.rates.usdt), warn),
    collectFx(chains.fx, previous?.rates.fx ?? {}, fetchedAt, warn),
  ]);

  const fresh: FreshQuotes = {
    bcvUsd: bcvUsd.current && publish(bcvUsd.current.reading, bcvUsd.current.source, fetchedAt),
    bcvEur: bcvEur.current && publish(bcvEur.current.reading, bcvEur.current.source, fetchedAt),
    usdt: usdt && {
      ...publish(usdt.reading, usdt.source, fetchedAt),
      bid: formatDecimal(usdt.reading.bid),
      ask: formatDecimal(usdt.reading.ask),
    },
    fx,
  };

  return {
    fresh,
    latest: {
      schemaVersion: 1,
      updatedAt: fetchedAt,
      rates: {
        bcvUsd: fresh.bcvUsd ?? previous?.rates.bcvUsd ?? null,
        bcvEur: fresh.bcvEur ?? previous?.rates.bcvEur ?? null,
        bcvUsdNext: next(bcvUsd.next, previous?.rates.bcvUsdNext, today, fetchedAt),
        bcvEurNext: next(bcvEur.next, previous?.rates.bcvEurNext, today, fetchedAt),
        usdt: fresh.usdt ?? previous?.rates.usdt ?? null,
        fx: { ...previous?.rates.fx, ...fresh.fx },
      },
    },
  };
}

/** A move this large since the last published value is more likely a broken source. */
const MAX_JUMP_PERCENT = 30n;

/** Two sources this close to each other confirm a large move as real. */
const AGREEMENT_PERCENT = 5n;

function within(value: Decimal, reference: Decimal, percent: bigint): boolean {
  const difference = value > reference ? value - reference : reference - value;
  return difference * 100n <= reference * percent;
}

interface Candidate<T> {
  source: string;
  reading: T;
  value: Decimal;
  verified: boolean;
}

/**
 * Whether [candidate] can be published after [previous]: it must be positive and, when it
 * moved too far, confirmed by another of the [far] readings. An unverified reading must stay
 * close to [previous] and can neither confirm nor be confirmed.
 */
function plausible<T>(
  candidate: Candidate<T>,
  previous: Decimal | null,
  far: Candidate<T>[],
  warn: Warn,
  label: string,
): boolean {
  if (candidate.value <= 0n) {
    warn(`${candidate.source}: ${label} is not positive`);
    return false;
  }
  if (!candidate.verified) {
    if (previous !== null && within(candidate.value, previous, AGREEMENT_PERCENT)) {
      return true;
    }
    warn(
      `${candidate.source}: unverified ${label} is not within ${AGREEMENT_PERCENT}% of the last`,
    );
    return false;
  }
  if (previous === null || within(candidate.value, previous, MAX_JUMP_PERCENT)) {
    return true;
  }
  if (far.some((other) => within(candidate.value, other.value, AGREEMENT_PERCENT))) {
    return true;
  }
  warn(
    `${candidate.source}: ${label} moved more than ${MAX_JUMP_PERCENT}% from ${formatDecimal(previous)}`,
  );
  far.push(candidate);
  return false;
}

async function firstPlausible<T extends Reading>(
  chain: readonly Source<T>[],
  previous: Decimal | null,
  warn: Warn,
): Promise<{ source: string; reading: T } | null> {
  const far: Candidate<T>[] = [];
  for (const source of chain) {
    try {
      const reading = await source.read();
      const candidate = toCandidate(source.name, reading);
      if (plausible(candidate, previous, far, warn, 'value')) {
        return candidate;
      }
    } catch (error) {
      warn(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return null;
}

function toCandidate<T extends Reading>(source: string, reading: T): Candidate<T> {
  return { source, reading, value: reading.value, verified: reading.verified ?? true };
}

/**
 * The BCV publishes each afternoon the rate of the next business day. A reading dated after
 * [today] is that next rate; the current one then comes from the rest of the chain, or stays.
 */
async function currentAndNext(
  chain: readonly Source<Reading>[],
  previous: Decimal | null,
  today: string,
  warn: Warn,
): Promise<{ current: Candidate<Reading> | null; next: Candidate<Reading> | null }> {
  const far: Candidate<Reading>[] = [];
  let next: Candidate<Reading> | null = null;
  for (const source of chain) {
    try {
      const candidate = toCandidate(source.name, await source.read());
      if (!plausible(candidate, previous, far, warn, 'value')) {
        continue;
      }
      if (candidate.reading.effectiveDate <= today) {
        return { current: candidate, next };
      }
      next ??= candidate;
    } catch (error) {
      warn(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { current: null, next };
}

/** A next rate is shown until its value date arrives, when it becomes the current one. */
function next(
  fresh: Candidate<Reading> | null,
  previous: PublishedQuote | null | undefined,
  today: string,
  fetchedAt: string,
): PublishedQuote | null {
  if (fresh !== null) {
    return publish(fresh.reading, fresh.source, fetchedAt);
  }
  return previous && previous.effectiveDate > today ? previous : null;
}

/** Each currency falls back independently, so a source missing one code does not lose the rest. */
async function collectFx(
  chain: readonly Source<FxReading>[],
  previous: Record<string, PublishedQuote>,
  fetchedAt: string,
  warn: Warn,
): Promise<Record<string, PublishedQuote>> {
  const quotes: Record<string, PublishedQuote> = {};
  const far = new Map<string, Candidate<Reading>[]>();
  for (const source of chain) {
    try {
      const reading = await source.read();
      for (const [code, value] of reading.perUsd) {
        if (quotes[code] !== undefined) {
          continue;
        }
        const quote = { value, effectiveDate: reading.effectiveDate };
        const before = previous[code];
        const farForCode = far.get(code) ?? [];
        far.set(code, farForCode);
        const candidate = toCandidate(source.name, quote);
        const reference = before ? parseDecimal(before.value) : null;
        if (plausible(candidate, reference, farForCode, warn, code)) {
          quotes[code] = publish(quote, source.name, fetchedAt);
        }
      }
    } catch (error) {
      warn(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return quotes;
}

function publish(reading: Reading, source: string, fetchedAt: string): PublishedQuote {
  return {
    value: formatDecimal(reading.value),
    effectiveDate: reading.effectiveDate,
    source,
    fetchedAt,
  };
}
