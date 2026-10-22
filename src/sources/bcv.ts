import { URLS } from '../config';
import { dateOfTimestamp } from '../dates';
import { parseDecimal } from '../decimal';
import type { Reading, Source } from '../model';

const TIMEOUT_MS = 12000;

export interface BcvPage {
  usd: Reading;
  eur: Reading;
}

/** Fetches a page as text; null when the connection itself fails, as with a bad certificate. */
export type PageFetcher = (url: string) => Promise<string | null>;

export function createPageFetcher(fetcher: typeof fetch = fetch): PageFetcher {
  return async (url) => {
    let response: Response;
    try {
      response = await fetcher(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; rates-feed)' },
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return null;
    }
    if (!response.ok) {
      throw new Error(`${url} answered HTTP ${response.status}`);
    }
    return response.text();
  };
}

/**
 * The BCV home page, read once per run for both currencies. Plain HTTP is tried only when the
 * HTTPS connection fails, and its readings are marked unverified, since anyone on the way could
 * have changed them.
 */
export function createBcvPage(fetchPage: PageFetcher): () => Promise<BcvPage> {
  let page: Promise<BcvPage> | undefined;
  return () => {
    page ??= (async () => {
      const secure = await fetchPage(URLS.bcvSecure);
      const html = secure ?? (await fetchPage(URLS.bcvPlain));
      if (html === null) {
        throw new Error('bcv.org.ve could not be reached over HTTPS or HTTP');
      }
      return parseBcvPage(html, secure !== null);
    })();
    return page;
  };
}

/** The dollar and euro of the BCV home page, with the value date both share. */
export function parseBcvPage(html: string, verified: boolean): BcvPage {
  const date = /Fecha Valor:[\s\S]*?content="([^"]+)"/.exec(html)?.[1];
  if (date === undefined) {
    throw new Error('bcv.org.ve has no value date');
  }
  const effectiveDate = dateOfTimestamp(date);
  const read = (currency: string): Reading => {
    const pattern = new RegExp(
      `id="${currency}"[\\s\\S]*?<strong[^>]*>\\s*([\\d.,]+)\\s*</strong>`,
    );
    const text = pattern.exec(html)?.[1];
    if (text === undefined) {
      throw new Error(`bcv.org.ve has no ${currency} rate`);
    }
    // The BCV writes Venezuelan numbers: dots group thousands and the comma marks decimals.
    return {
      value: parseDecimal(text.replaceAll('.', '').replace(',', '.')),
      effectiveDate,
      verified,
    };
  };
  return { usd: read('dolar'), eur: read('euro') };
}

export class BcvUsd implements Source<Reading> {
  readonly name = 'bcv';

  constructor(private readonly page: () => Promise<BcvPage>) {}

  async read(): Promise<Reading> {
    return (await this.page()).usd;
  }
}

export class BcvEur implements Source<Reading> {
  readonly name = 'bcv';

  constructor(private readonly page: () => Promise<BcvPage>) {}

  async read(): Promise<Reading> {
    return (await this.page()).eur;
  }
}
