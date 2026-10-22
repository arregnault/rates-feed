import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { URLS } from '../src/config';
import { formatDecimal } from '../src/decimal';
import { BcvEur, BcvUsd, createBcvPage, parseBcvPage, type PageFetcher } from '../src/sources/bcv';

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'bcv.html'),
  'utf8',
);

function fetcher(pages: Record<string, string | null>): { fetch: PageFetcher; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url) => {
      calls.push(url);
      return pages[url] ?? null;
    },
  };
}

describe('bcv', () => {
  it('reads the dollar and the euro with their value date', () => {
    const { usd, eur } = parseBcvPage(html, true);

    expect([formatDecimal(usd.value), usd.effectiveDate, usd.verified]).toEqual([
      '884.7496',
      '2026-10-22',
      true,
    ]);
    expect(formatDecimal(eur.value)).toBe('993.211053');
  });

  it('refuses a page without a value date or a rate', () => {
    expect(() => parseBcvPage(html.replace('Fecha Valor', 'Fecha'), true)).toThrow('no value date');
    expect(() => parseBcvPage(html.replace('id="euro"', 'id="x"'), true)).toThrow('no euro rate');
  });

  it('reads the page once for both currencies', async () => {
    const { fetch, calls } = fetcher({ [URLS.bcvSecure]: html });
    const page = createBcvPage(fetch);

    await new BcvUsd(page).read();
    await new BcvEur(page).read();

    expect(calls).toEqual([URLS.bcvSecure]);
  });

  it('falls back to plain HTTP when HTTPS fails, marking the readings unverified', async () => {
    const { fetch, calls } = fetcher({ [URLS.bcvSecure]: null, [URLS.bcvPlain]: html });

    const usd = await new BcvUsd(createBcvPage(fetch)).read();

    expect(calls).toEqual([URLS.bcvSecure, URLS.bcvPlain]);
    expect(usd.verified).toBe(false);
  });

  it('fails when neither HTTPS nor HTTP answers', async () => {
    const { fetch } = fetcher({});

    await expect(new BcvUsd(createBcvPage(fetch)).read()).rejects.toThrow('could not be reached');
  });
});
