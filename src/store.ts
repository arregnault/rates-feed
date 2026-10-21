export interface StoredDocument {
  body: string;
  cacheControl: string;
}

export interface DocumentStore {
  read<T>(key: string): Promise<T | null>;
  readRaw(key: string): Promise<StoredDocument | null>;
  write(key: string, document: unknown, cacheControl: string): Promise<void>;
}

interface Metadata {
  cacheControl: string;
}

/** Only this worker writes to the namespace, so what it reads back is trusted as already valid. */
export class KvDocumentStore implements DocumentStore {
  constructor(private readonly namespace: KVNamespace) {}

  async read<T>(key: string): Promise<T | null> {
    const stored = await this.readRaw(key);
    return stored === null ? null : (JSON.parse(stored.body) as T);
  }

  async readRaw(key: string): Promise<StoredDocument | null> {
    const { value, metadata } = await this.namespace.getWithMetadata<Metadata>(key);
    return value === null
      ? null
      : { body: value, cacheControl: metadata?.cacheControl ?? 'no-store' };
  }

  async write(key: string, document: unknown, cacheControl: string): Promise<void> {
    await this.namespace.put(key, JSON.stringify(document), { metadata: { cacheControl } });
  }
}
