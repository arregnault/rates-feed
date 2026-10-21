import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { URLS } from '../src/config';
import type { JsonClient } from '../src/http';
import type { DocumentStore, StoredDocument } from '../src/store';

export function fixture(name: string): unknown {
  const directory = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(readFileSync(join(directory, 'fixtures', `${name}.json`), 'utf8'));
}

export const FIXTURES_BY_URL: Record<string, string> = {
  [URLS.dolarApiDollars]: 'dolarapi-dolares',
  [URLS.dolarApiEuros]: 'dolarapi-euros',
  [URLS.dolarApiDollarHistory]: 'dolarapi-historicos-dolares',
  [URLS.dolarApiEuroHistory]: 'dolarapi-historicos-euros',
  [URLS.openErApi]: 'open-er-api',
  [URLS.criptoYa]: 'criptoya',
  [URLS.binanceP2p]: 'binance-p2p',
  [URLS.yadio]: 'yadio',
  [URLS.currencyApi]: 'currency-api',
};

/** Serves recorded responses; URLs listed in `failing` reject as if the source were down. */
export function fakeHttp(failing: readonly string[] = []): JsonClient {
  return async (url) => {
    const name = FIXTURES_BY_URL[url];
    if (name === undefined || failing.includes(url)) {
      throw new Error(`${url} unavailable`);
    }
    return fixture(name);
  };
}

export class MemoryStore implements DocumentStore {
  readonly documents = new Map<string, { body: string; cacheControl: string }>();

  readonly writes: string[] = [];

  async read<T>(key: string): Promise<T | null> {
    const stored = this.documents.get(key);
    return stored === undefined ? null : (JSON.parse(stored.body) as T);
  }

  async readRaw(key: string): Promise<StoredDocument | null> {
    return this.documents.get(key) ?? null;
  }

  async write(key: string, document: unknown, cacheControl: string): Promise<void> {
    this.writes.push(key);
    this.documents.set(key, { body: JSON.stringify(document), cacheControl });
  }
}
