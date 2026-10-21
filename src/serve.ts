import type { DocumentStore } from './store';

const PUBLIC_PATH = /^\/v1\/(?:latest|history\/\d{4}-\d{2})\.json$/;

export async function serve(request: Request, store: DocumentStore): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  const path = new URL(request.url).pathname;
  const stored = PUBLIC_PATH.test(path) ? await store.readRaw(path.slice(1)) : null;
  if (stored === null) {
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  return new Response(request.method === 'HEAD' ? null : stored.body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': stored.cacheControl,
    },
  });
}
