import { describe, expect, it } from 'vitest';
import { URLS } from '../src/config';
import { formatDecimal } from '../src/decimal';
import type { JsonClient } from '../src/http';
import { BybitP2pUsdt } from '../src/sources/bybitP2p';
import { CurrencyApiFx } from '../src/sources/currencyApi';
import {
  DolarApiBcvEur,
  DolarApiBcvUsd,
  DolarApiParaleloUsdt,
  readDolarApiHistory,
} from '../src/sources/dolarApi';
import { OkxP2pUsdt } from '../src/sources/okxP2p';
import { OpenErApiBcvEurCross, OpenErApiBcvUsd, OpenErApiFx } from '../src/sources/openErApi';
import { YadioFx, YadioUsdt } from '../src/sources/yadio';
import { fakeHttp } from './support';

const http = fakeHttp();
const decimal = formatDecimal;

describe('sources', () => {
  it('reads the BCV official dollar and euro from dolarapi', async () => {
    const usd = await new DolarApiBcvUsd(http).read();
    const eur = await new DolarApiBcvEur(http).read();

    expect([decimal(usd.value), usd.effectiveDate]).toEqual(['883.3963', '2026-10-21']);
    expect([decimal(eur.value), eur.effectiveDate]).toEqual(['993.175958', '2026-10-21']);
  });

  it('reads the parallel rate as a USDT stand-in', async () => {
    const usdt = await new DolarApiParaleloUsdt(http).read();

    expect(decimal(usdt.value)).toBe('1003.618069');
    expect(usdt.bid).toBe(usdt.value);
  });

  it('reads dolarapi history', async () => {
    const { dollars, euros } = await readDolarApiHistory(http);

    expect(dollars.map((point) => `${point.fecha}:${point.fuente}`)).toContain(
      '2026-09-30:paralelo',
    );
    expect(euros[0]?.fecha).toBe('2023-01-03');
  });

  it('reads the BCV dollar from open.er-api and crosses the euro through it', async () => {
    const usd = await new OpenErApiBcvUsd(http).read();
    const eur = await new OpenErApiBcvEurCross(http).read();

    expect([decimal(usd.value), usd.effectiveDate]).toEqual(['883.3963', '2026-10-21']);
    expect(decimal(eur.value)).toBe('991.744373');
  });

  it('takes the median of each Bybit P2P side and averages them', async () => {
    const sides: string[] = [];
    const recording: JsonClient = (url, init) => {
      sides.push(JSON.parse(String(init?.body)).side);
      return http(url, init);
    };

    const usdt = await new BybitP2pUsdt(recording, () => new Date('2026-10-21T13:00:00Z')).read();

    expect(sides.sort()).toEqual(['0', '1']);
    expect([decimal(usdt.value), usdt.effectiveDate]).toEqual(['1008.973', '2026-10-21']);
  });

  it('takes the median of the top ten OKX P2P ads on each side and averages them', async () => {
    const usdt = await new OkxP2pUsdt(http, () => new Date('2026-10-21T13:00:00Z')).read();

    expect([decimal(usdt.ask), decimal(usdt.bid), decimal(usdt.value)]).toEqual([
      '1009.915',
      '1003.0005',
      '1006.45775',
    ]);
    expect(usdt.effectiveDate).toBe('2026-10-21');
  });

  it('reads USDT and foreign currencies from yadio', async () => {
    const usdt = await new YadioUsdt(http).read();
    const fx = await new YadioFx(http).read();

    expect(decimal(usdt.value)).toBe('1003.752289');
    expect(fx.perUsd.has('COP')).toBe(true);
    expect(fx.perUsd.has('VES')).toBe(false);
  });

  it('keeps only the configured currencies from currency-api and open.er-api', async () => {
    const fromCurrencyApi = await new CurrencyApiFx(http).read();
    const fromOpenErApi = await new OpenErApiFx(http).read();

    expect(fromCurrencyApi.effectiveDate).toBe('2026-10-20');
    expect([...fromCurrencyApi.perUsd.keys()].sort()).toEqual(['ARS', 'BRL', 'COP', 'EUR', 'PEN']);
    expect(decimal(fromOpenErApi.perUsd.get('COP') ?? 0n)).toBe('3153.773599');
  });

  it('fails when a response does not have the expected shape', async () => {
    const broken: JsonClient = async () => ({ unexpected: true });

    await expect(new DolarApiBcvUsd(broken).read()).rejects.toThrow();
    await expect(new OkxP2pUsdt(broken, () => new Date()).read()).rejects.toThrow();
  });

  it('fails when dolarapi lacks the requested quote', async () => {
    const onlyParallel: JsonClient = async (url) =>
      url === URLS.dolarApiDollars
        ? [{ fuente: 'paralelo', promedio: 1, fechaActualizacion: '2026-10-21T00:00:00Z' }]
        : null;

    await expect(new DolarApiBcvUsd(onlyParallel).read()).rejects.toThrow('no "oficial" quote');
  });
});
