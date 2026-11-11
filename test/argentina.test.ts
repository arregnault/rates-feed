import { describe, expect, it } from 'vitest';
import { ARGENTINA_DATOS_URLS, URLS } from '../src/config';
import { parseDecimal } from '../src/decimal';
import type { JsonClient } from '../src/http';
import {
  ArgentinaDatosDay,
  DolarApiArgentina,
  readArgentinaDatosHistory,
} from '../src/sources/argentina';
import { fixture } from './support';

function serving(responses: Record<string, unknown>): JsonClient & { urls: string[] } {
  const urls: string[] = [];
  const client = async (url: string): Promise<unknown> => {
    urls.push(url);
    if (!(url in responses)) {
      throw new Error(`${url} unavailable`);
    }
    return responses[url];
  };
  return Object.assign(client, { urls });
}

describe('dolarapi Argentina', () => {
  const http = serving({ [URLS.dolarApiArgentina]: fixture('dolarapi-ar-dolares') });

  it('reads the selling rate as the value, with both sides, on the date in Buenos Aires', async () => {
    expect(await new DolarApiArgentina(http, 'blue').read()).toEqual({
      value: parseDecimal('1555'),
      ask: parseDecimal('1555'),
      bid: parseDecimal('1535'),
      effectiveDate: '2026-11-10',
    });
  });

  it('keeps the date the house last changed, which can be days ago', async () => {
    expect((await new DolarApiArgentina(http, 'oficial').read()).effectiveDate).toBe('2026-11-05');
  });

  it('fails when the house is missing', async () => {
    const empty = serving({ [URLS.dolarApiArgentina]: [] });

    await expect(new DolarApiArgentina(empty, 'blue').read()).rejects.toThrow('no "blue" quote');
  });
});

describe('ArgentinaDatos', () => {
  it('reads today in Buenos Aires, which is still yesterday in UTC until 03:00', async () => {
    const url = ARGENTINA_DATOS_URLS.day('blue', '2026-11-10');
    const http = serving({ [url]: fixture('argentinadatos-blue-dia') });
    const source = new ArgentinaDatosDay(http, 'blue', () => new Date('2026-11-11T02:30:00Z'));

    expect((await source.read()).value).toBe(parseDecimal('1555'));
    expect(http.urls).toEqual([
      'https://api.argentinadatos.com/v1/cotizaciones/dolares/blue/2026/11/10',
    ]);
  });

  it('keeps the series from the start date, one selling value per day', async () => {
    const http = serving({
      [ARGENTINA_DATOS_URLS.history('blue')]: fixture('argentinadatos-blue'),
    });

    const days = await readArgentinaDatosHistory(http, 'blue', '2023-01-01');

    expect(days[0]).toEqual({ date: '2023-01-01', value: expect.any(String) });
    expect(days.every((day) => day.date >= '2023-01-01')).toBe(true);
    expect(days.map((day) => day.date)).toContain('2026-11-01');
  });

  it('fails on a response that is not a list', async () => {
    const http = serving({ [ARGENTINA_DATOS_URLS.history('blue')]: { error: 'down' } });

    await expect(readArgentinaDatosHistory(http, 'blue', '2023-01-01')).rejects.toThrow(
      'not a list',
    );
  });
});
