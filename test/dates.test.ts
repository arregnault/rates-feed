import { describe, expect, it } from 'vitest';
import { addDays, caracasDate, dateOfTimestamp, lastDayOf, previousMonth } from '../src/dates';

describe('dates', () => {
  it('reads the calendar date in Caracas, four hours behind UTC', () => {
    expect(caracasDate(new Date('2026-10-22T03:59:00Z'))).toBe('2026-10-21');
    expect(caracasDate(new Date('2026-10-22T04:00:00Z'))).toBe('2026-10-22');
  });

  it('keeps the date of a timestamp with an explicit offset, and reads UTC ones in Caracas', () => {
    expect(dateOfTimestamp('2026-10-21T00:00:00-04:00')).toBe('2026-10-21');
    expect(dateOfTimestamp('2026-10-22T02:00:00.000Z')).toBe('2026-10-21');
    expect(() => dateOfTimestamp('yesterday')).toThrow('Not an ISO timestamp');
  });

  it('steps across months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(lastDayOf('2026-02')).toBe('2026-02-28');
    expect(lastDayOf('2028-02')).toBe('2028-02-29');
    expect(lastDayOf('2026-11')).toBe('2026-11-30');
  });
});
