const TIMEOUT_MS = 8000;

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
        throw new Error(`${url} answered HTTP ${response.status}`);
      }
      return response.json();
    };

    if (init?.method !== undefined && init.method !== 'GET') {
      return request();
    }
    const cached = cache.get(url) ?? request();
    cache.set(url, cached);
    return cached;
  };
}
