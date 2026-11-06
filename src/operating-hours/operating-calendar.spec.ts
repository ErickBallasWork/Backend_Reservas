import {
  findClosedSlot,
  findWindowProblem,
  formatTimeOfDay,
  isSlotOpen,
  parseTimeOfDay,
  toLocalSlot,
  toLocalSlots,
  toOpenWindows,
  type DailyWindow,
  type OperatingCalendar,
} from './operating-calendar';

const TIME_ZONE = 'America/Guayaquil';
const SLOT = 30;

const weekdayOffice: DailyWindow[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  opensAtMinute: parseTimeOfDay('08:00'),
  closesAtMinute: parseTimeOfDay('18:00'),
}));

const calendar = (
  windows: DailyWindow[] | null,
  closedDates: string[] = [],
): OperatingCalendar => ({ windows, closedDates: new Set(closedDates) });

const slotsBetween = (startIso: string, endIso: string) => {
  const starts: Date[] = [];
  for (let t = Date.parse(startIso); t < Date.parse(endIso); t += SLOT * 60_000) {
    starts.push(new Date(t));
  }
  return toLocalSlots(starts, TIME_ZONE);
};

describe('toLocalSlot', () => {
  it('reads the business time zone, not UTC', () => {
    const slot = toLocalSlot(new Date('2026-11-12T13:30:00Z'), TIME_ZONE);

    expect(slot).toMatchObject({ dateKey: '2026-11-12', dayOfWeek: 4, minuteOfDay: 8 * 60 + 30 });
  });

  it('moves to the previous local day before 05:00 UTC', () => {
    const slot = toLocalSlot(new Date('2026-11-12T03:00:00Z'), TIME_ZONE);

    expect(slot).toMatchObject({ dateKey: '2026-11-11', dayOfWeek: 3, minuteOfDay: 22 * 60 });
  });
});

describe('isSlotOpen', () => {
  it('is always open without a schedule', () => {
    const slot = toLocalSlot(new Date('2026-11-14T08:00:00Z'), TIME_ZONE);

    expect(isSlotOpen(slot, SLOT, calendar(null))).toBe(true);
  });

  it('accepts the first and the last slot of the window', () => {
    const first = toLocalSlot(new Date('2026-11-12T13:00:00Z'), TIME_ZONE);
    const last = toLocalSlot(new Date('2026-11-12T22:30:00Z'), TIME_ZONE);

    expect(isSlotOpen(first, SLOT, calendar(weekdayOffice))).toBe(true);
    expect(isSlotOpen(last, SLOT, calendar(weekdayOffice))).toBe(true);
  });

  it('rejects the slot that starts at closing time and the one before opening', () => {
    const atClosing = toLocalSlot(new Date('2026-11-12T23:00:00Z'), TIME_ZONE);
    const beforeOpening = toLocalSlot(new Date('2026-11-12T12:30:00Z'), TIME_ZONE);

    expect(isSlotOpen(atClosing, SLOT, calendar(weekdayOffice))).toBe(false);
    expect(isSlotOpen(beforeOpening, SLOT, calendar(weekdayOffice))).toBe(false);
  });

  it('rejects a day without windows', () => {
    const saturday = toLocalSlot(new Date('2026-11-14T15:00:00Z'), TIME_ZONE);

    expect(isSlotOpen(saturday, SLOT, calendar(weekdayOffice))).toBe(false);
  });

  it('rejects a closed date even when the schedule is open', () => {
    const slot = toLocalSlot(new Date('2026-11-12T15:00:00Z'), TIME_ZONE);

    expect(isSlotOpen(slot, SLOT, calendar(weekdayOffice, ['2026-11-12']))).toBe(false);
    expect(isSlotOpen(slot, SLOT, calendar(null, ['2026-11-12']))).toBe(false);
  });

  it('supports several windows in the same day', () => {
    const split: DailyWindow[] = [
      { dayOfWeek: 4, opensAtMinute: 480, closesAtMinute: 720 },
      { dayOfWeek: 4, opensAtMinute: 840, closesAtMinute: 1080 },
    ];
    const lunch = toLocalSlot(new Date('2026-11-12T18:00:00Z'), TIME_ZONE);
    const afternoon = toLocalSlot(new Date('2026-11-12T19:00:00Z'), TIME_ZONE);

    expect(isSlotOpen(lunch, SLOT, calendar(split))).toBe(false);
    expect(isSlotOpen(afternoon, SLOT, calendar(split))).toBe(true);
  });
});

describe('findClosedSlot', () => {
  it('returns null when every slot is open', () => {
    const slots = slotsBetween('2026-11-12T14:00:00Z', '2026-11-12T16:00:00Z');

    expect(findClosedSlot(slots, SLOT, calendar(weekdayOffice))).toBeNull();
  });

  it('returns the first closed slot of a reservation that crosses closing time', () => {
    const slots = slotsBetween('2026-11-12T22:00:00Z', '2026-11-13T00:00:00Z');

    const closed = findClosedSlot(slots, SLOT, calendar(weekdayOffice));

    expect(closed?.start.toISOString()).toBe('2026-11-12T23:00:00.000Z');
  });
});

describe('toOpenWindows', () => {
  it('merges contiguous open slots and splits at closed ones', () => {
    const slots = slotsBetween('2026-11-12T12:00:00Z', '2026-11-13T00:00:00Z');

    const windows = toOpenWindows(slots, SLOT, calendar(weekdayOffice)).map((w) => [
      w.start.toISOString(),
      w.end.toISOString(),
    ]);

    expect(windows).toEqual([['2026-11-12T13:00:00.000Z', '2026-11-12T23:00:00.000Z']]);
  });

  it('returns the whole range without a schedule', () => {
    const slots = slotsBetween('2026-11-12T12:00:00Z', '2026-11-12T14:00:00Z');

    expect(toOpenWindows(slots, SLOT, calendar(null))).toHaveLength(1);
  });
});

describe('time of day', () => {
  it('converts between text and minutes', () => {
    expect(parseTimeOfDay('08:30')).toBe(510);
    expect(parseTimeOfDay('24:00')).toBe(1440);
    expect(formatTimeOfDay(510)).toBe('08:30');
    expect(formatTimeOfDay(1440)).toBe('24:00');
  });
});

describe('findWindowProblem', () => {
  const window = (opensAtMinute: number, closesAtMinute: number, dayOfWeek = 1): DailyWindow => ({
    dayOfWeek,
    opensAtMinute,
    closesAtMinute,
  });

  it('accepts a valid schedule', () => {
    expect(findWindowProblem([window(480, 720), window(840, 1080)], SLOT)).toBeNull();
    expect(findWindowProblem([window(0, 1440)], SLOT)).toBeNull();
  });

  it('rejects closing before opening', () => {
    expect(findWindowProblem([window(600, 600)], SLOT)).not.toBeNull();
    expect(findWindowProblem([window(900, 600)], SLOT)).not.toBeNull();
  });

  it('rejects hours that do not match the slot size', () => {
    expect(findWindowProblem([window(485, 600)], SLOT)).not.toBeNull();
  });

  it('rejects overlapping windows of the same day only', () => {
    expect(findWindowProblem([window(480, 720), window(690, 900)], SLOT)).not.toBeNull();
    expect(findWindowProblem([window(480, 720, 1), window(690, 900, 2)], SLOT)).toBeNull();
  });
});
