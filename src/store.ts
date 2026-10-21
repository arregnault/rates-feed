export interface DocumentStore {
  read<T>(key: string): Promise<T | null>;
  write(key: string, document: unknown, cacheControl: string): Promise<void>;
}

/** Only this worker writes to the bucket, so what it reads back is trusted as already valid. */
export class R2DocumentStore implements DocumentStore {
  constructor(private readonly bucket: R2Bucket) {}

  async read<T>(key: string): Promise<T | null> {
    const object = await this.bucket.get(key);
    return object === null ? null : await object.json<T>();
  }

  async write(key: string, document: unknown, cacheControl: string): Promise<void> {
    await this.bucket.put(key, JSON.stringify(document), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl },
    });
  }
}
