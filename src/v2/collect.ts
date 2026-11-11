import { firstPlausible, type Warn } from '../collect';
import { formatDecimal, parseDecimal, type Decimal } from '../decimal';
import type { Reading, Source } from '../model';
import type { LatestQuote, LatestV2 } from './model';

export interface ReferenceReading extends Reading {
  bid?: Decimal;
  ask?: Decimal;
}

export interface ReferenceChain {
  id: string;
  /** How often the reference is read; a multiple of the five-minute run. */
  everyMinutes: number;
  sources: Source<ReferenceReading>[];
}

/** The references of one currency. */
export interface ReferenceGroup {
  currency: string;
  chains: ReferenceChain[];
}

const RUN_EVERY_MINUTES = 5;

/** Whether this run reads the reference: on its period, or straight away when it has no value. */
export function chainDue(
  chain: ReferenceChain,
  previous: LatestQuote | undefined,
  now: Date,
): boolean {
  const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
  return previous === undefined || minuteOfDay % chain.everyMinutes < RUN_EVERY_MINUTES;
}

/**
 * Each reference keeps its previous quote when all its sources fail, so an old `fetchedAt`
 * tells the reader it is stale.
 */
export async function collectGroup(
  group: ReferenceGroup,
  previous: LatestV2 | undefined,
  now: Date,
  warn: Warn,
): Promise<{ latest: LatestV2; fresh: LatestQuote[] }> {
  const fetchedAt = now.toISOString();
  const before = new Map(previous?.references.map((quote) => [quote.id, quote]));
  const fresh: LatestQuote[] = [];
  const references: LatestQuote[] = [];
  for (const chain of group.chains) {
    const last = before.get(chain.id);
    if (!chainDue(chain, last, now)) {
      if (last !== undefined) {
        references.push(last);
      }
      continue;
    }
    const found = await firstPlausible(
      chain.sources,
      last === undefined ? null : parseDecimal(last.value),
      (message) => warn(`${chain.id}: ${message}`),
    );
    const quote = found === null ? last : publish(chain.id, found.reading, found.source, fetchedAt);
    if (found !== null && quote !== undefined) {
      fresh.push(quote);
    }
    if (quote !== undefined) {
      references.push(quote);
    }
  }
  return {
    fresh,
    latest: {
      schemaVersion: 2,
      currency: group.currency,
      updatedAt: fresh.length > 0 ? fetchedAt : (previous?.updatedAt ?? fetchedAt),
      references,
    },
  };
}

function publish(
  id: string,
  reading: ReferenceReading,
  source: string,
  fetchedAt: string,
): LatestQuote {
  return {
    id,
    value: formatDecimal(reading.value),
    since: reading.effectiveDate,
    source,
    fetchedAt,
    ...(reading.bid === undefined ? {} : { bid: formatDecimal(reading.bid) }),
    ...(reading.ask === undefined ? {} : { ask: formatDecimal(reading.ask) }),
  };
}
