import { describe, expect, it } from 'vitest';
import { parseDecimal } from '../src/decimal';
import type { Source } from '../src/model';
import {
  chainDue,
  collectGroup,
  type ReferenceGroup,
  type ReferenceReading,
} from '../src/v2/collect';
import {
  historyDue,
  runFeedV2,
  V2_KEYS,
  type CurrencyFeed,
  type StoredLatest,
} from '../src/v2/feed';
import { Guards } from '../src/v2/guards';
import {
  denseMonth,
  mergeStoredMonth,
  sparseFromLatest,
  type StoredMonth,
} from '../src/v2/history';
import type { LatestV2 } from '../src/v2/model';
import { MemoryStore } from './support';

class FixedSource implements Source<ReferenceReading> {
  reads = 0;

  constructor(
    readonly name: string,
    private readonly value: string | Error,
    private readonly effectiveDate = '2026-11-10',
  ) {}

  async read(): Promise<ReferenceReading> {
    this.reads += 1;
    if (this.value instanceof Error) {
      throw this.value;
    }
    return { value: parseDecimal(this.value), effectiveDate: this.effectiveDate };
  }
}

function group(...chains: [string, Source<ReferenceReading>[]][]): ReferenceGroup {
  return {
    currency: 'ARS',
    chains: chains.map(([id, sources]) => ({ id, everyMinutes: 60, sources })),
  };
}

const NOW = new Date('2026-11-10T15:02:00Z');

describe('v2 reference collection', () => {
  it('falls back to the next source and names the one used', async () => {
    const { latest, fresh } = await collectGroup(
      group([
        'ars.blue',
        [new FixedSource('dolarapi', new Error('down')), new FixedSource('argentinadatos', '1555')],
      ]),
      undefined,
      NOW,
      () => {},
    );

    expect(latest.references).toEqual([
      {
        id: 'ars.blue',
        value: '1555',
        since: '2026-11-10',
        source: 'argentinadatos',
        fetchedAt: NOW.toISOString(),
      },
    ]);
    expect(fresh).toHaveLength(1);
  });

  it('keeps the previous quote and its fetchedAt when every source fails', async () => {
    const previous: LatestV2 = {
      schemaVersion: 2,
      currency: 'ARS',
      updatedAt: '2026-11-10T14:00:00.000Z',
      references: [
        {
          id: 'ars.blue',
          value: '1550',
          since: '2026-11-10',
          source: 'dolarapi',
          fetchedAt: '2026-11-10T14:00:00.000Z',
        },
      ],
    };
    const warnings: string[] = [];

    const { latest, fresh } = await collectGroup(
      group(['ars.blue', [new FixedSource('dolarapi', new Error('down'))]]),
      previous,
      NOW,
      (message) => warnings.push(message),
    );

    expect(latest).toEqual(previous);
    expect(fresh).toEqual([]);
    expect(warnings).toEqual(['ars.blue: dolarapi: down']);
  });

  it('rejects a jump of more than 30% that no other source confirms', async () => {
    const previous: LatestV2 = {
      schemaVersion: 2,
      currency: 'ARS',
      updatedAt: '2026-11-10T14:00:00.000Z',
      references: [
        {
          id: 'ars.blue',
          value: '1550',
          since: '2026-11-10',
          source: 'dolarapi',
          fetchedAt: '2026-11-10T14:00:00.000Z',
        },
      ],
    };

    const { latest } = await collectGroup(
      group(['ars.blue', [new FixedSource('dolarapi', '15500')]]),
      previous,
      NOW,
      () => {},
    );

    expect(latest.references[0]?.value).toBe('1550');
  });

  it('reads a reference on its period, or at once when it has no value yet', () => {
    const hourly = { id: 'ars.blue', everyMinutes: 60, sources: [] };
    const quarterly = { ...hourly, everyMinutes: 15 };
    const quote = { id: 'ars.blue', value: '1', since: '', source: '', fetchedAt: '' };

    expect(chainDue(hourly, quote, new Date('2026-11-10T15:02:00Z'))).toBe(true);
    expect(chainDue(hourly, quote, new Date('2026-11-10T15:35:00Z'))).toBe(false);
    expect(chainDue(quarterly, quote, new Date('2026-11-10T15:31:00Z'))).toBe(true);
    expect(chainDue(hourly, undefined, new Date('2026-11-10T15:35:00Z'))).toBe(true);
  });
});

describe('v2 stored history', () => {
  it('records each fresh quote on its effective date', () => {
    expect(
      sparseFromLatest([
        {
          id: 'ars.official',
          value: '1570',
          since: '2026-11-05',
          source: 'dolarapi',
          fetchedAt: '',
        },
        { id: 'ars.blue', value: '1555', since: '2026-11-10', source: 'dolarapi', fetchedAt: '' },
      ]),
    ).toEqual({
      '2026-11-05': { 'ars.official': { value: '1570', source: 'dolarapi' } },
      '2026-11-10': { 'ars.blue': { value: '1555', source: 'dolarapi' } },
    });
  });

  it('keeps other currencies and, in a backfill, what the feed already recorded', () => {
    const existing: StoredMonth = {
      schemaVersion: 2,
      month: '2026-11',
      currencies: {
        BOB: { '2026-11-02': { 'bob.official': { value: '11.8' } } },
        ARS: { '2026-11-02': { 'ars.blue': { value: '1540', source: 'dolarapi' } } },
      },
    };

    const merged = mergeStoredMonth(
      existing,
      '2026-11',
      'ARS',
      {
        '2026-11-01': { 'ars.blue': { value: '1530', source: 'argentinadatos' } },
        '2026-11-02': { 'ars.blue': { value: '1535', source: 'argentinadatos' } },
      },
      true,
    );

    expect(merged.currencies.BOB).toEqual(existing.currencies.BOB);
    expect(merged.currencies.ARS).toEqual({
      '2026-11-01': { 'ars.blue': { value: '1530', source: 'argentinadatos' } },
      '2026-11-02': { 'ars.blue': { value: '1540', source: 'dolarapi' } },
    });
  });

  it('carries each reference forward on its own', () => {
    const month = denseMonth(
      'ARS',
      '2026-11',
      {
        '2026-11-02': { 'ars.blue': { value: '1540', source: 'dolarapi' } },
        '2026-11-03': { 'ars.official': { value: '1570', source: 'dolarapi' } },
      },
      { '2026-10-31': { 'ars.official': { value: '1560' } } },
      '2026-11-03',
    );

    expect(month?.days['2026-11-01']).toEqual({
      'ars.official': { value: '1560', since: '2026-10-31' },
    });
    expect(month?.days['2026-11-03']).toEqual({
      'ars.official': { value: '1570', since: '2026-11-03', source: 'dolarapi' },
      'ars.blue': { value: '1540', since: '2026-11-02', source: 'dolarapi' },
    });
  });
});

function feed(blue: FixedSource, backfill: CurrencyFeed['backfill'] = []): CurrencyFeed {
  return {
    timeZone: 'America/Argentina/Buenos_Aires',
    group: group(['ars.blue', [blue]]),
    backfill,
  };
}

describe('v2 feed run', () => {
  it('writes the latest values and, at the top of the hour, the month', async () => {
    const store = new MemoryStore();

    await runFeedV2({
      store,
      guards: new Guards(NOW, 8),
      currencies: [feed(new FixedSource('dolarapi', '1555'))],
      now: NOW,
      warn: () => {},
    });

    expect(
      (await store.read<StoredLatest>(V2_KEYS.latest))?.currencies.ARS?.references[0]?.value,
    ).toBe('1555');
    expect((await store.read<StoredMonth>(V2_KEYS.month('2026-11')))?.currencies.ARS).toEqual({
      '2026-11-10': { 'ars.blue': { value: '1555', source: 'dolarapi' } },
    });
  });

  it('between periods reads no source and writes nothing', async () => {
    const store = new MemoryStore();
    await runFeedV2({
      store,
      guards: new Guards(NOW, 8),
      currencies: [feed(new FixedSource('dolarapi', '1555'))],
      now: NOW,
      warn: () => {},
    });
    store.writes.length = 0;
    const blue = new FixedSource('dolarapi', '1560');

    await runFeedV2({
      store,
      guards: new Guards(NOW, 8),
      currencies: [feed(blue)],
      now: new Date('2026-11-10T15:20:00Z'),
      warn: () => {},
    });

    expect(blue.reads).toBe(0);
    expect(store.writes).toEqual([]);
  });

  it('runs one backfill task per run, without replacing what the feed recorded', async () => {
    const store = new MemoryStore();
    const task = (key: string, value: string) => ({
      key,
      load: async () => ({
        '2026-11-10': { 'ars.blue': { value, source: 'argentinadatos' } },
        '2026-10-30': { 'ars.blue': { value, source: 'argentinadatos' } },
      }),
    });
    const currencies = [
      feed(new FixedSource('dolarapi', '1555'), [
        task('ars:blue', '1500'),
        task('ars:other', '1400'),
      ]),
    ];

    await runFeedV2({ store, guards: new Guards(NOW, 8), currencies, now: NOW, warn: () => {} });

    expect(await store.read(V2_KEYS.backfill)).toEqual({ done: ['ars:blue'] });
    const october = await store.read<StoredMonth>(V2_KEYS.month('2026-10'));
    expect(october?.currencies.ARS?.['2026-10-30']).toEqual({
      'ars.blue': { value: '1500', source: 'argentinadatos' },
    });
    expect(store.documents.get(V2_KEYS.month('2026-10'))?.cacheControl).toBe(
      'public, max-age=31536000, immutable',
    );
    const november = await store.read<StoredMonth>(V2_KEYS.month('2026-11'));
    expect(november?.currencies.ARS?.['2026-11-10']?.['ars.blue']?.value).toBe('1555');
  });

  it('leaves a failed backfill task pending', async () => {
    const store = new MemoryStore();
    const warnings: string[] = [];
    const failing = { key: 'ars:blue', load: () => Promise.reject(new Error('down')) };

    await runFeedV2({
      store,
      guards: new Guards(NOW, 8),
      currencies: [feed(new FixedSource('dolarapi', '1555'), [failing])],
      now: NOW,
      warn: (message) => warnings.push(message),
    });

    expect(await store.read(V2_KEYS.backfill)).toBeNull();
    expect(warnings).toEqual(['backfill ars:blue: down']);
  });

  it('writes history hourly and on the last run of each currency day', () => {
    const currencies = [feed(new FixedSource('dolarapi', '1'))];

    expect(historyDue(new Date('2026-11-10T15:02:00Z'), currencies)).toBe(true);
    expect(historyDue(new Date('2026-11-10T15:30:00Z'), currencies)).toBe(false);
    expect(historyDue(new Date('2026-11-11T02:55:00Z'), currencies)).toBe(true);
  });
});
