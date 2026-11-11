const TIMEOUT_MS = 8000;

export class HttpError extends Error {
  constructor(
    url: string,
    readonly status: number,
  ) {
    super(`${url} answered HTTP ${status}`);
  }
}

/**
 * Some servers append an HTML warning after the JSON body (a PHP notice, for one); the JSON before
 * it is still the answer.
 */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const htmlStart = text.search(/<[a-z!]/i);
    if (htmlStart <= 0) {
      throw error;
    }
    return JSON.parse(text.slice(0, htmlStart));
  }
}

export type JsonClient = (url: string, init?: RequestInit) => Promise<unknown>;

/**
 * One client per collection run: identical GET requests share a single response, since several
 * sources read the same endpoint.
 */
export function createJsonClient(fetcher: typeof fetch = fetch): JsonClient {
  const cache = new Map<string, Promise<unknown>>();

  return (url, init) => {
    const request = async (): Promise<unknown> => {
      const response = await fetcher(url, {
        ...init,
        headers: { accept: 'application/json', ...init?.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new HttpError(url, response.status);
      }
      return parseJson(await response.text());
    };

    if (init?.method !== undefined && init.method !== 'GET') {
      return request();
    }
    const cached = cache.get(url) ?? request();
    cache.set(url, cached);
    return cached;
  };
}
