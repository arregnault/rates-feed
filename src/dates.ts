/** Venezuela has used UTC-4 year-round since 2016. */
const CARACAS_OFFSET_MS = -4 * 60 * 60 * 1000;

export function caracasDate(instant: Date): string {
  return new Date(instant.getTime() + CARACAS_OFFSET_MS).toISOString().slice(0, 10);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Calendar date of an ISO timestamp, read in the timestamp's own offset. */
export function dateOfTimestamp(timestamp: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T/.exec(timestamp);
  if (match?.[1] === undefined) {
    throw new Error(`Not an ISO timestamp: ${timestamp}`);
  }
  return /(?:[+-]\d{2}:\d{2})$/.test(timestamp) ? match[1] : caracasDate(new Date(timestamp));
}
