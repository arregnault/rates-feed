import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJsonClient, parseJson } from '../src/http';

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

describe('parseJson', () => {
  it('ignores an HTML warning after the JSON body', () => {
    const text = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'bcrp-html-tail.txt'),
      'utf8',
    );

    expect(parseJson(text)).toMatchObject({ config: { title: 'Tipo de cambio' } });
  });

  it('rejects a body that is not JSON', () => {
    expect(() => parseJson('<html>down</html>')).toThrow();
  });
});
