import { RuleViolation } from '../time-rules';
import { expandWeekly, localToInstant } from './recurrence';

const TIME_ZONE = 'America/Guayaquil';
const THURSDAY_10_LOCAL = new Date('2026-11-12T15:00:00Z');

const iso = (dates: Date[]) => dates.map((d) => d.toISOString());

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action();
  } catch (error) {
    return error instanceof RuleViolation ? error.code : 'OTHER';
  }
  return undefined;
};

describe('localToInstant', () => {
  it('converts a local wall time to the matching instant', () => {
    expect(localToInstant('2026-11-12', 10 * 60, TIME_ZONE).toISOString()).toBe(
      '2026-11-12T15:00:00.000Z',
    );
  });

  it('keeps the local date when the instant falls on the next UTC day', () => {
    expect(localToInstant('2026-11-12', 21 * 60, TIME_ZONE).toISOString()).toBe(
      '2026-11-13T02:00:00.000Z',
    );
  });
});

describe('expandWeekly', () => {
  it('repeats every week on the same weekday', () => {
    const starts = expandWeekly(
      THURSDAY_10_LOCAL,
      { intervalWeeks: 1, weekdays: [4], occurrenceCount: 3 },
      TIME_ZONE,
    );

    expect(iso(starts)).toEqual([
      '2026-11-12T15:00:00.000Z',
      '2026-11-19T15:00:00.000Z',
      '2026-11-26T15:00:00.000Z',
    ]);
  });

  it('repeats every other week', () => {
    const starts = expandWeekly(
      THURSDAY_10_LOCAL,
      { intervalWeeks: 2, weekdays: [4], occurrenceCount: 3 },
      TIME_ZONE,
    );

    expect(iso(starts)).toEqual([
      '2026-11-12T15:00:00.000Z',
      '2026-11-26T15:00:00.000Z',
      '2026-12-10T15:00:00.000Z',
    ]);
  });

  it('uses several weekdays inside each week, starting at the first reservation', () => {
    const starts = expandWeekly(
      new Date('2026-11-10T15:00:00Z'),
      { intervalWeeks: 1, weekdays: [2, 4], occurrenceCount: 4 },
      TIME_ZONE,
    );

    expect(iso(starts)).toEqual([
      '2026-11-10T15:00:00.000Z',
      '2026-11-12T15:00:00.000Z',
      '2026-11-17T15:00:00.000Z',
      '2026-11-19T15:00:00.000Z',
    ]);
  });

  it('does not use weekdays of the first week that come before the first reservation', () => {
    const starts = expandWeekly(
      THURSDAY_10_LOCAL,
      { intervalWeeks: 1, weekdays: [2, 4], occurrenceCount: 3 },
      TIME_ZONE,
    );

    expect(iso(starts)).toEqual([
      '2026-11-12T15:00:00.000Z',
      '2026-11-17T15:00:00.000Z',
      '2026-11-19T15:00:00.000Z',
    ]);
  });

  it('stops at the final date, limit included', () => {
    const starts = expandWeekly(
      THURSDAY_10_LOCAL,
      { intervalWeeks: 1, weekdays: [4], until: '2026-11-26' },
      TIME_ZONE,
    );

    expect(starts).toHaveLength(3);
  });

  it('keeps the local time when the instant crosses midnight UTC', () => {
    const starts = expandWeekly(
      new Date('2026-11-13T02:00:00Z'),
      { intervalWeeks: 1, weekdays: [4], occurrenceCount: 2 },
      TIME_ZONE,
    );

    expect(iso(starts)).toEqual(['2026-11-13T02:00:00.000Z', '2026-11-20T02:00:00.000Z']);
  });

  it('requires a count or a final date', () => {
    expect(
      codeOf(() => expandWeekly(THURSDAY_10_LOCAL, { intervalWeeks: 1, weekdays: [4] }, TIME_ZONE)),
    ).toBe('SERIES_LIMIT_REQUIRED');
  });

  it('requires the first reservation weekday to be part of the series', () => {
    expect(
      codeOf(() =>
        expandWeekly(
          THURSDAY_10_LOCAL,
          { intervalWeeks: 1, weekdays: [2], occurrenceCount: 2 },
          TIME_ZONE,
        ),
      ),
    ).toBe('SERIES_START_NOT_IN_WEEKDAYS');
  });

  it('rejects a final date before the first reservation', () => {
    expect(
      codeOf(() =>
        expandWeekly(
          THURSDAY_10_LOCAL,
          { intervalWeeks: 1, weekdays: [4], until: '2026-11-01' },
          TIME_ZONE,
        ),
      ),
    ).toBe('INVALID_RANGE');
  });

  it('rejects a series with more than 12 occurrences', () => {
    expect(
      codeOf(() =>
        expandWeekly(
          THURSDAY_10_LOCAL,
          { intervalWeeks: 1, weekdays: [0, 1, 2, 3, 4, 5, 6], until: '2027-01-30' },
          TIME_ZONE,
        ),
      ),
    ).toBe('SERIES_TOO_LONG');
  });

  it('rejects a count that does not fit in 90 days', () => {
    expect(
      codeOf(() =>
        expandWeekly(
          THURSDAY_10_LOCAL,
          { intervalWeeks: 4, weekdays: [4], occurrenceCount: 6 },
          TIME_ZONE,
        ),
      ),
    ).toBe('SERIES_TOO_LONG');
  });
});
