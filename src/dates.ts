const CARACAS_OFFSET_MS = -4 * 60 * 60 * 1000;

/** Venezuela has used UTC-4 year-round since 2016. */
export function caracasDate(instant: Date): string {
  return new Date(instant.getTime() + CARACAS_OFFSET_MS).toISOString().slice(0, 10);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Calendar date in an IANA time zone, daylight saving time included. */
export function localDate(instant: Date, timeZone: string): string {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(instant);
  const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
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

export function addDays(date: string, days: number): string {
  const instant = new Date(`${date}T00:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

export function previousMonth(month: string): string {
  return monthOf(addDays(`${month}-01`, -1));
}

export function lastDayOf(month: string): string {
  const nextMonth = monthOf(addDays(`${month}-28`, 4));
  return addDays(`${nextMonth}-01`, -1);
}
