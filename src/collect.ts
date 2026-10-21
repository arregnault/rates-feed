import { formatDecimal } from './decimal';
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
  const [bcvUsd, bcvEur, usdt, fx] = await Promise.all([
    firstSuccessful(chains.bcvUsd, warn),
    firstSuccessful(chains.bcvEur, warn),
    firstSuccessful(chains.usdt, warn),
    collectFx(chains.fx, fetchedAt, warn),
  ]);

  const fresh: FreshQuotes = {
    bcvUsd: bcvUsd && publish(bcvUsd.reading, bcvUsd.source, fetchedAt),
    bcvEur: bcvEur && publish(bcvEur.reading, bcvEur.source, fetchedAt),
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
        usdt: fresh.usdt ?? previous?.rates.usdt ?? null,
        fx: { ...previous?.rates.fx, ...fresh.fx },
      },
    },
  };
}

async function firstSuccessful<T>(
  chain: readonly Source<T>[],
  warn: Warn,
): Promise<{ source: string; reading: T } | null> {
  for (const source of chain) {
    try {
      return { source: source.name, reading: await source.read() };
    } catch (error) {
      warn(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return null;
}

/** Each currency falls back independently, so a source missing one code does not lose the rest. */
async function collectFx(
  chain: readonly Source<FxReading>[],
  fetchedAt: string,
  warn: Warn,
): Promise<Record<string, PublishedQuote>> {
  const quotes: Record<string, PublishedQuote> = {};
  for (const source of chain) {
    try {
      const reading = await source.read();
      for (const [code, value] of reading.perUsd) {
        quotes[code] ??= publish(
          { value, effectiveDate: reading.effectiveDate },
          source.name,
          fetchedAt,
        );
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
