import { HttpError } from '../http';
import type { Source } from '../model';

/** After an HTTP 429 the source rests this long instead of being asked again every run. */
const COOLDOWN_MINUTES = 15;

/**
 * Limits shared by every source in one run: a pause after a rate-limit answer, kept between runs,
 * and a cap on fallback reads so a primary source going down cannot exhaust the free plan's 50
 * subrequests per run.
 */
export class Guards {
  cooldowns: Record<string, string> = {};

  private fallbackReads: number;

  constructor(
    private readonly now: Date,
    maxFallbackReads: number,
  ) {
    this.fallbackReads = maxFallbackReads;
  }

  /** Pauses still running at `now`; the expired ones are dropped. */
  restore(saved: Record<string, string> | undefined): void {
    const now = this.now.toISOString();
    this.cooldowns = Object.fromEntries(
      Object.entries(saved ?? {}).filter(([, until]) => until > now),
    );
  }

  cooling<T>(key: string, source: Source<T>): Source<T> {
    return {
      name: source.name,
      read: async () => {
        const until = this.cooldowns[key];
        if (until !== undefined && until > this.now.toISOString()) {
          throw new Error(`paused until ${until} after HTTP 429`);
        }
        try {
          return await source.read();
        } catch (error) {
          if (error instanceof HttpError && error.status === 429) {
            const end = new Date(this.now.getTime() + COOLDOWN_MINUTES * 60_000);
            this.cooldowns[key] = end.toISOString();
          }
          throw error;
        }
      },
    };
  }

  fallback<T>(source: Source<T>): Source<T> {
    return {
      name: source.name,
      read: () => {
        if (this.fallbackReads <= 0) {
          return Promise.reject(new Error('fallback reads for this run are spent'));
        }
        this.fallbackReads -= 1;
        return source.read();
      },
    };
  }
}
