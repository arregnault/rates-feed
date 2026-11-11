import { describe, expect, it } from 'vitest';
import { OFFICIAL_URLS, URLS } from '../src/config';
import { addDays } from '../src/dates';
import { formatDecimal } from '../src/decimal';
import type { JsonClient } from '../src/http';
import {
  BcbPtax,
  BcrpSbs,
  CurrencyApiMarket,
  DatosGovCoTrm,
  DolarApiBoliviaOfficial,
  DolarApiMexicoFix,
  MindicadorDollar,
  readBcrp,
  readCurrencyApiOn,
} from '../src/sources/officials';
import { INDEX } from '../src/v2/catalog';
import { localBackfill, localChain } from '../src/v2/officials';
import { fixture } from './support';

function serving(responses: Record<string, unknown>): JsonClient {
  return async (url) => {
    if (!(url in responses)) {
      throw new Error(`${url} unavailable`);
    }
    return responses[url];
  };
}

const TODAY = '2026-11-10';

describe('official rates', () => {
  it('takes the TRM in force today, not the one already published for tomorrow', async () => {
    const http = serving({ [OFFICIAL_URLS.trm(addDays(TODAY, -10))]: fixture('trm') });

    const reading = await new DatosGovCoTrm(http, () => TODAY).read();

    expect([formatDecimal(reading.value), reading.effectiveDate]).toEqual(['3269.88', TODAY]);
  });

  it('reads the dólar observado on its date in Santiago', async () => {
    const http = serving({ [OFFICIAL_URLS.mindicadorDollar]: fixture('mindicador-dolar') });

    const reading = await new MindicadorDollar(http, () => TODAY).read();

    expect([formatDecimal(reading.value), reading.effectiveDate]).toEqual(['969.8', TODAY]);
  });

  it('reads the PTAX selling rate by its publication date', async () => {
    const http = serving({
      [OFFICIAL_URLS.ptax(addDays(TODAY, -10), TODAY)]: fixture('ptax'),
    });

    const reading = await new BcbPtax(http, () => TODAY).read();

    expect([formatDecimal(reading.value), reading.effectiveDate]).toEqual(['5.584', TODAY]);
  });

  it('reads the SBS rate, skipping days without a value', async () => {
    const http = serving({ [OFFICIAL_URLS.bcrpSbs(addDays(TODAY, -10), TODAY)]: fixture('bcrp') });

    const reading = await new BcrpSbs(http, () => TODAY).read();

    expect([formatDecimal(reading.value), reading.effectiveDate]).toEqual(['3.418', '2026-11-09']);
  });

  it('reads Spanish month names in BCRP dates, September as "Set"', async () => {
    const http = serving({
      [OFFICIAL_URLS.bcrpSbs('2026-09-29', '2026-10-02')]: fixture('bcrp-sep'),
    });

    const days = await readBcrp(http, '2026-09-29', '2026-10-02');

    expect(days[0]).toEqual({ date: '2026-09-29', value: '3.45' });
  });

  it('reads the Mexican FIX on the date its timestamp names', async () => {
    const http = serving({ [OFFICIAL_URLS.dolarApiMexico]: fixture('dolarapi-mx') });

    const reading = await new DolarApiMexicoFix(http).read();

    expect([formatDecimal(reading.value), reading.effectiveDate]).toEqual(['18.6678', TODAY]);
  });

  it('reads the Bolivian official rate on the date its timestamp names', async () => {
    const http = serving({ [OFFICIAL_URLS.dolarApiBolivia]: fixture('dolarapi-bo') });

    const reading = await new DolarApiBoliviaOfficial(http).read();

    expect([formatDecimal(reading.value), reading.effectiveDate]).toEqual(['11.71', '2026-11-11']);
  });

  it('falls back to the market rate for Bolivia', () => {
    const chain = localChain(serving({}), 'BOB', new Date('2026-11-10T15:00:00Z'));

    expect([chain.id, ...chain.sources.map((source) => source.name)]).toEqual([
      'bob.official',
      'dolarapi',
      'currency-api',
    ]);
  });

  it('fails when nothing is dated today or earlier', async () => {
    const http = serving({ [OFFICIAL_URLS.trm(addDays('2020-01-01', -10))]: fixture('trm') });

    await expect(new DatosGovCoTrm(http, () => '2020-01-01').read()).rejects.toThrow(
      'no value dated 2020-01-01',
    );
  });
});

describe('market rates', () => {
  const day = { date: '2026-11-10', usd: { uyu: 40.45, crc: 451.2 } };

  it('reads one currency per US dollar', async () => {
    const reading = await new CurrencyApiMarket(serving({ [URLS.currencyApi]: day }), 'UYU').read();

    expect([formatDecimal(reading.value), reading.effectiveDate]).toEqual(['40.45', '2026-11-10']);
  });

  it('fails for a currency the day does not have', async () => {
    await expect(
      new CurrencyApiMarket(serving({ [URLS.currencyApi]: day }), 'PYG').read(),
    ).rejects.toThrow('no PYG rate');
  });

  it('reads several currencies of a past date at once', async () => {
    const http = serving({ [OFFICIAL_URLS.currencyApiOn('2026-11-10')]: day });

    const rates = await readCurrencyApiOn(http, '2026-11-10', ['UYU', 'CRC']);

    expect(rates.get('CRC')).toEqual({ date: '2026-11-10', value: '451.2' });
  });
});

describe('official backfill', () => {
  const now = new Date('2026-11-10T15:00:00Z');

  it('splits the Chilean history by year and leaves Mexico without one', () => {
    const http = serving({});

    expect(localBackfill(http, 'CLP', now).map((task) => task.key)).toEqual([
      'clp:2023',
      'clp:2024',
      'clp:2025',
      'clp:2026',
    ]);
    expect(localBackfill(http, 'MXN', now)).toEqual([]);
  });

  it('loads the fixed Bolivian rate on weekdays, then the recorded daily rates', async () => {
    const [task] = localBackfill(serving({}), 'BOB', now);

    const days = (await task?.load())?.BOB ?? {};

    expect(task?.key).toBe('bob:official');
    expect(days['2023-01-01']).toBeUndefined();
    expect(days['2023-01-02']).toEqual({ 'bob.official': { value: '6.96', source: 'bcb' } });
    expect(days['2026-06-26']).toEqual({ 'bob.official': { value: '6.96', source: 'bcb' } });
    expect(days['2026-06-29']).toEqual({ 'bob.official': { value: '9.73', source: 'bcb' } });
  });

  it('loads market rates five days per task for every market currency, skipping missing dates', async () => {
    const responses: Record<string, unknown> = {};
    for (let offset = 0; offset < 5; offset += 1) {
      const date = addDays('2024-03-02', offset);
      if (offset !== 3) {
        responses[OFFICIAL_URLS.currencyApiOn(date)] = {
          date,
          usd: { crc: 500, dop: 59, pyg: 7300, uyu: 39 },
        };
      }
    }
    const tasks = localBackfill(serving(responses), 'CRC', now);

    const first = await tasks[0]?.load();

    expect(tasks[0]?.key).toBe('market:2024-03-02');
    expect(Object.keys(first ?? {}).sort()).toEqual(['CRC', 'DOP', 'PYG', 'UYU']);
    expect(Object.keys(first?.UYU ?? {})).toHaveLength(4);
    expect(first?.UYU?.['2024-03-02']).toEqual({
      'uyu.market': { value: '39', source: 'currency-api' },
    });
    expect(localBackfill(serving({}), 'UYU', now)).toEqual([]);
  });

  it('starts each official history on the first day its source published', () => {
    const historyFrom = Object.fromEntries(
      INDEX.currencies.flatMap((currency) => currency.references.map((r) => [r.id, r.historyFrom])),
    );

    expect(historyFrom['bob.official']).toBe('2023-01-02');
    expect(historyFrom['cop.trm']).toBe('2023-01-04');
  });

  it('lists every official and market reference in the catalog', () => {
    const ids = INDEX.currencies.flatMap((currency) => currency.references.map((r) => r.id));

    expect(ids).toEqual(
      expect.arrayContaining([
        'cop.trm',
        'clp.observed',
        'brl.ptax',
        'pen.sbs',
        'mxn.fix',
        'bob.official',
        'bob.usdt_p2p',
        'uyu.market',
      ]),
    );
  });
});
