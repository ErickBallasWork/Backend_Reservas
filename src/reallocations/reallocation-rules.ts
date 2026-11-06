import type { ReservationRules } from '../config/reservation-rules.service';
import { RuleViolation, validateReservationTimes } from '../reservations/time-rules';

export interface ReservationPlacement {
  resourceId: string;
  startDateTime: Date;
  endDateTime: Date;
}

export interface PlacementPatch {
  resourceId?: string;
  startDateTime?: Date;
  endDateTime?: Date;
}

export interface ReallocationPlan {
  next: ReservationPlacement;
  changed: boolean;
}

export function planReallocation(
  current: ReservationPlacement,
  patch: PlacementPatch,
): ReallocationPlan {
  const next: ReservationPlacement = {
    resourceId: patch.resourceId ?? current.resourceId,
    startDateTime: patch.startDateTime ?? current.startDateTime,
    endDateTime: patch.endDateTime ?? current.endDateTime,
  };
  const changed =
    next.resourceId !== current.resourceId ||
    next.startDateTime.getTime() !== current.startDateTime.getTime() ||
    next.endDateTime.getTime() !== current.endDateTime.getTime();
  return { next, changed };
}

export function assertReallocationTimes(
  current: ReservationPlacement,
  next: ReservationPlacement,
  now: Date,
  rules: ReservationRules,
): void {
  if (current.startDateTime.getTime() <= now.getTime()) {
    throw new RuleViolation('ALREADY_STARTED', 'La reserva ya comenzó y no se puede reasignar');
  }
  validateReservationTimes(next.startDateTime, next.endDateTime, now, {
    ...rules,
    minAdvanceHours: 0,
  });
}

export function assertFitsCapacity(attendees: number | null, capacity: number): void {
  if (attendees !== null && attendees > capacity) {
    throw new RuleViolation(
      'ATTENDEES_EXCEEDS_CAPACITY',
      `La sala nueva tiene capacidad para ${capacity} personas y la reserva tiene ${attendees} asistentes`,
    );
  }
}
