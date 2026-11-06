import { DEFAULT_RESERVATION_RULES } from '../config/reservation-rules.service';
import {
  assertEditable,
  planEdit,
  statusAfterEdit,
  type ReservationSnapshot,
} from './reservation-edit-rules';
import { RuleViolation } from './time-rules';

const HOUR = 3_600_000;
const NOW = new Date('2026-11-06T12:00:00Z');
const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * HOUR);

const current = (overrides: Partial<ReservationSnapshot & { status: string }> = {}) => ({
  resourceId: 'room-1',
  startDateTime: at(72),
  endDateTime: at(73),
  purpose: 'INTERNAL_MEETING',
  justification: 'Planificación',
  attendees: 4 as number | null,
  status: 'CONFIRMED',
  ...overrides,
});

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action();
  } catch (error) {
    return error instanceof RuleViolation ? error.code : 'OTHER';
  }
  return undefined;
};

describe('planEdit', () => {
  it('detects a change of slot, resource, purpose, detail or attendees', () => {
    expect(planEdit(current(), { resourceId: 'room-2' })).toMatchObject({ slotChanged: true });
    expect(planEdit(current(), { startDateTime: at(96), endDateTime: at(97) })).toMatchObject({
      slotChanged: true,
      changed: true,
    });
    expect(planEdit(current(), { purpose: 'TRAINING' })).toMatchObject({
      slotChanged: false,
      changed: true,
    });
    expect(planEdit(current(), { justification: 'Otro' })).toMatchObject({ changed: true });
    expect(planEdit(current(), { attendees: 5 })).toMatchObject({ changed: true });
  });

  it('reports no change when the values are the same', () => {
    const base = current();

    const plan = planEdit(base, {
      resourceId: 'room-1',
      startDateTime: new Date(base.startDateTime),
      endDateTime: new Date(base.endDateTime),
      justification: 'Planificación',
      attendees: 4,
    });

    expect(plan).toMatchObject({ changed: false, slotChanged: false });
  });

  it('requires start and end together', () => {
    expect(codeOf(() => planEdit(current(), { startDateTime: at(96) }))).toBe('INCOMPLETE_TIMES');
    expect(codeOf(() => planEdit(current(), { endDateTime: at(96) }))).toBe('INCOMPLETE_TIMES');
  });
});

describe('assertEditable', () => {
  const rules = DEFAULT_RESERVATION_RULES;

  it('lets a detail-only change through until the reservation starts', () => {
    const base = current({ startDateTime: at(2), endDateTime: at(3) });
    const plan = planEdit(base, { justification: 'Nuevo detalle' });

    expect(codeOf(() => assertEditable(base, plan, NOW, rules))).toBeUndefined();
  });

  it('rejects any change once the reservation has started', () => {
    const base = current({ startDateTime: at(-1), endDateTime: at(1) });
    const plan = planEdit(base, { justification: 'Nuevo detalle' });

    expect(codeOf(() => assertEditable(base, plan, NOW, rules))).toBe('ALREADY_STARTED');
  });

  it.each(['REJECTED', 'CANCELLED', 'CHECKED_IN', 'NO_SHOW'])(
    'rejects a reservation in %s',
    (status) => {
      const base = current({ status });
      const plan = planEdit(base, { justification: 'Nuevo detalle' });

      expect(codeOf(() => assertEditable(base, plan, NOW, rules))).toBe('NOT_EDITABLE');
    },
  );

  it('requires 24 h before the original start to move the slot', () => {
    const base = current({ startDateTime: at(23), endDateTime: at(24) });
    const plan = planEdit(base, { startDateTime: at(96), endDateTime: at(97) });

    expect(codeOf(() => assertEditable(base, plan, NOW, rules))).toBe('EDIT_TOO_LATE');
  });

  it('accepts moving the slot with exactly 24 h before the original start', () => {
    const base = current({ startDateTime: at(24), endDateTime: at(25) });
    const plan = planEdit(base, { startDateTime: at(96), endDateTime: at(97) });

    expect(codeOf(() => assertEditable(base, plan, NOW, rules))).toBeUndefined();
  });

  it('requires 24 h before the new start as well', () => {
    const base = current();
    const plan = planEdit(base, { startDateTime: at(12), endDateTime: at(13) });

    expect(codeOf(() => assertEditable(base, plan, NOW, rules))).toBe('MIN_ADVANCE');
  });

  it('applies the maximum duration to the new slot', () => {
    const base = current();
    const plan = planEdit(base, { startDateTime: at(72), endDateTime: at(72 + 49) });

    expect(codeOf(() => assertEditable(base, plan, NOW, rules))).toBe('MAX_DURATION');
  });

  it('applies the slot alignment to the new slot', () => {
    const base = current();
    const plan = planEdit(base, {
      startDateTime: new Date(at(72).getTime() + 7 * 60_000),
      endDateTime: at(74),
    });

    expect(codeOf(() => assertEditable(base, plan, NOW, rules))).toBe('NOT_ALIGNED');
  });
});

describe('statusAfterEdit', () => {
  it('confirms a pending training that stops being a training', () => {
    expect(
      statusAfterEdit(
        { status: 'PENDING_APPROVAL', purpose: 'TRAINING' },
        { purpose: 'INTERNAL_MEETING' },
        false,
      ),
    ).toBe('CONFIRMED');
  });

  it('sends a reservation that becomes a training to approval', () => {
    expect(
      statusAfterEdit(
        { status: 'CONFIRMED', purpose: 'CLIENT_MEETING' },
        { purpose: 'TRAINING' },
        false,
      ),
    ).toBe('PENDING_APPROVAL');
  });

  it('asks for a new approval when an approved training changes slot or resource', () => {
    expect(
      statusAfterEdit({ status: 'CONFIRMED', purpose: 'TRAINING' }, { purpose: 'TRAINING' }, true),
    ).toBe('PENDING_APPROVAL');
  });

  it('keeps an approved training confirmed when only the detail changes', () => {
    expect(
      statusAfterEdit({ status: 'CONFIRMED', purpose: 'TRAINING' }, { purpose: 'TRAINING' }, false),
    ).toBe('CONFIRMED');
  });

  it('keeps a pending training pending after a slot change', () => {
    expect(
      statusAfterEdit(
        { status: 'PENDING_APPROVAL', purpose: 'TRAINING' },
        { purpose: 'TRAINING' },
        true,
      ),
    ).toBe('PENDING_APPROVAL');
  });
});
