import { DEFAULT_RESERVATION_RULES } from '../config/reservation-rules.service';
import { RuleViolation } from '../reservations/time-rules';
import {
  assertFitsCapacity,
  assertReallocationTimes,
  planReallocation,
  type ReservationPlacement,
} from './reallocation-rules';

const current: ReservationPlacement = {
  resourceId: 'room-a',
  startDateTime: new Date('2026-11-12T15:00:00Z'),
  endDateTime: new Date('2026-11-12T16:00:00Z'),
};
const now = new Date('2026-11-12T10:00:00Z');

function codeOf(fn: () => void): string | null {
  try {
    fn();
  } catch (error) {
    return error instanceof RuleViolation ? error.code : null;
  }
  return null;
}

describe('planReallocation', () => {
  it('keeps the current placement for omitted fields', () => {
    const plan = planReallocation(current, { resourceId: 'room-b' });

    expect(plan.next).toEqual({ ...current, resourceId: 'room-b' });
    expect(plan.changed).toBe(true);
  });

  it('reports no change when the patch repeats the current placement', () => {
    const plan = planReallocation(current, {
      resourceId: 'room-a',
      startDateTime: new Date(current.startDateTime),
      endDateTime: new Date(current.endDateTime),
    });

    expect(plan.changed).toBe(false);
  });

  it('detects a change of schedule only', () => {
    const plan = planReallocation(current, { endDateTime: new Date('2026-11-12T17:00:00Z') });

    expect(plan.changed).toBe(true);
    expect(plan.next.resourceId).toBe('room-a');
  });
});

describe('assertReallocationTimes', () => {
  const rules = DEFAULT_RESERVATION_RULES;
  const check = (patch: Parameters<typeof planReallocation>[1], at: Date = now) =>
    codeOf(() =>
      assertReallocationTimes(current, planReallocation(current, patch).next, at, rules),
    );

  it('does not require the minimum advance', () => {
    expect(check({ resourceId: 'room-b' })).toBeNull();
  });

  it('rejects a reservation that already started', () => {
    expect(check({ resourceId: 'room-b' }, new Date('2026-11-12T15:10:00Z'))).toBe(
      'ALREADY_STARTED',
    );
  });

  it('rejects a new schedule in the past', () => {
    const code = check({
      startDateTime: new Date('2026-11-12T09:00:00Z'),
      endDateTime: new Date('2026-11-12T09:30:00Z'),
    });

    expect(code).toBe('START_IN_PAST');
  });

  it('rejects a schedule off the slot grid', () => {
    expect(check({ endDateTime: new Date('2026-11-12T16:10:00Z') })).toBe('NOT_ALIGNED');
  });

  it('rejects an end before the start', () => {
    expect(check({ endDateTime: new Date('2026-11-12T14:30:00Z') })).toBe('END_BEFORE_START');
  });

  it('rejects a schedule longer than the maximum duration', () => {
    expect(check({ endDateTime: new Date('2026-11-14T16:00:00Z') })).toBe('MAX_DURATION');
  });
});

describe('assertFitsCapacity', () => {
  it('accepts attendees up to the capacity', () => {
    expect(codeOf(() => assertFitsCapacity(8, 8))).toBeNull();
  });

  it('rejects attendees above the capacity', () => {
    expect(codeOf(() => assertFitsCapacity(9, 8))).toBe('ATTENDEES_EXCEEDS_CAPACITY');
  });

  it('skips the check when the reservation has no attendee count', () => {
    expect(codeOf(() => assertFitsCapacity(null, 2))).toBeNull();
  });
});
