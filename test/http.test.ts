import { describe, expect, it } from 'vitest';
import { createJsonClient } from '../src/http';

function countingFetch(status = 200): { fetcher: typeof fetch; calls: () => number } {
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ calls }), { status });
  }) as typeof fetch;
  return { fetcher, calls: () => calls };
}

describe('createJsonClient', () => {
  it('shares one response between identical GET requests', async () => {
    const { fetcher, calls } = countingFetch();
    const http = createJsonClient(fetcher);

    await http('https://example.test/a');
    await http('https://example.test/a');

    expect(calls()).toBe(1);
  });

  it('sends every POST', async () => {
    const { fetcher, calls } = countingFetch();
    const http = createJsonClient(fetcher);

    await http('https://example.test/a', { method: 'POST', body: '{}' });
    await http('https://example.test/a', { method: 'POST', body: '{}' });

    expect(calls()).toBe(2);
  });

  it('rejects error responses', async () => {
    const http = createJsonClient(countingFetch(502).fetcher);

    await expect(http('https://example.test/a')).rejects.toThrow('answered HTTP 502');
  });
});
