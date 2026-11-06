import {
  buildSlotStarts,
  canCancel,
  canCancelReservation,
  chunk,
  isAlignedToSlot,
  isWithinCheckInWindow,
  RuleViolation,
  validateReservationTimes,
} from './time-rules';

const rules = { slotMinutes: 30, minAdvanceHours: 24, maxDurationHours: 48 };
const now = new Date('2026-11-10T15:00:00Z');

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof RuleViolation ? error.code : 'OTHER';
  }
}

describe('Reglas de tiempo', () => {
  it('acepta una reserva válida', () => {
    const start = new Date('2026-11-12T15:00:00Z');
    const end = new Date('2026-11-12T16:00:00Z');
    expect(codeOf(() => validateReservationTimes(start, end, now, rules))).toBeNull();
  });

  it('rechaza fin antes del inicio', () => {
    const start = new Date('2026-11-12T16:00:00Z');
    const end = new Date('2026-11-12T15:00:00Z');
    expect(codeOf(() => validateReservationTimes(start, end, now, rules))).toBe('END_BEFORE_START');
  });

  it('rechaza horas fuera del borde de la franja', () => {
    const start = new Date('2026-11-12T15:10:00Z');
    const end = new Date('2026-11-12T16:00:00Z');
    expect(codeOf(() => validateReservationTimes(start, end, now, rules))).toBe('NOT_ALIGNED');
  });

  it('rechaza con menos de 24 h de anticipación', () => {
    const start = new Date('2026-11-11T14:30:00Z');
    const end = new Date('2026-11-11T15:00:00Z');
    expect(codeOf(() => validateReservationTimes(start, end, now, rules))).toBe('MIN_ADVANCE');
  });

  it('rechaza más de 48 h seguidas', () => {
    const start = new Date('2026-11-12T15:00:00Z');
    const end = new Date('2026-11-14T15:30:00Z');
    expect(codeOf(() => validateReservationTimes(start, end, now, rules))).toBe('MAX_DURATION');
  });

  it('acepta exactamente 48 h', () => {
    const start = new Date('2026-11-12T15:00:00Z');
    const end = new Date('2026-11-14T15:00:00Z');
    expect(codeOf(() => validateReservationTimes(start, end, now, rules))).toBeNull();
  });

  it('rechaza inicio en el pasado aun sin anticipación mínima (reasignación)', () => {
    const start = new Date('2026-11-10T14:00:00Z');
    const end = new Date('2026-11-10T16:00:00Z');
    const noAdvance = { ...rules, minAdvanceHours: 0 };
    expect(codeOf(() => validateReservationTimes(start, end, now, noAdvance))).toBe(
      'START_IN_PAST',
    );
  });
});

describe('Franjas', () => {
  it('una hora con franjas de 30 min son 2 franjas', () => {
    const slots = buildSlotStarts(
      new Date('2026-11-12T15:00:00Z'),
      new Date('2026-11-12T16:00:00Z'),
      30,
    );
    expect(slots.map((d) => d.toISOString())).toEqual([
      '2026-11-12T15:00:00.000Z',
      '2026-11-12T15:30:00.000Z',
    ]);
  });

  it('48 horas son 96 franjas de 30 min', () => {
    const slots = buildSlotStarts(
      new Date('2026-11-12T15:00:00Z'),
      new Date('2026-11-14T15:00:00Z'),
      30,
    );
    expect(slots).toHaveLength(96);
  });

  it('detecta el borde de franja', () => {
    expect(isAlignedToSlot(new Date('2026-11-12T15:30:00Z'), 30)).toBe(true);
    expect(isAlignedToSlot(new Date('2026-11-12T15:45:00Z'), 30)).toBe(false);
  });

  it('divide en grupos', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('Cancelación y check-in', () => {
  const start = new Date('2026-11-11T15:00:00Z');

  it('permite cancelar con 24 h o más', () => {
    expect(canCancel(start, now, 24)).toBe(true);
    expect(canCancel(start, new Date('2026-11-10T15:30:00Z'), 24)).toBe(false);
  });

  it('acepta check-in dentro de la ventana', () => {
    expect(isWithinCheckInWindow(start, new Date('2026-11-11T14:50:00Z'), 15, 15)).toBe(true);
    expect(isWithinCheckInWindow(start, new Date('2026-11-11T15:15:00Z'), 15, 15)).toBe(true);
    expect(isWithinCheckInWindow(start, new Date('2026-11-11T15:16:00Z'), 15, 15)).toBe(false);
    expect(isWithinCheckInWindow(start, new Date('2026-11-11T14:44:00Z'), 15, 15)).toBe(false);
  });
});

describe('canCancelReservation', () => {
  const soon = new Date('2026-11-10T20:00:00Z');

  it('keeps the minimum notice for a reservation that was never moved', () => {
    expect(canCancelReservation(soon, now, 24, false)).toBe(false);
  });

  it('waives the minimum notice after a reallocation', () => {
    expect(canCancelReservation(soon, now, 24, true)).toBe(true);
  });

  it('does not allow cancelling a reallocated reservation that already started', () => {
    expect(canCancelReservation(new Date('2026-11-10T14:00:00Z'), now, 24, true)).toBe(false);
  });
});
