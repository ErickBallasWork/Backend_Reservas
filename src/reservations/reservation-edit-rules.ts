import { Status } from '../common/constants';
import type { ReservationRules } from '../config/reservation-rules.service';
import { canCancel, RuleViolation, validateReservationTimes } from './time-rules';

export interface ReservationSnapshot {
  resourceId: string;
  startDateTime: Date;
  endDateTime: Date;
  purpose: string;
  justification: string;
  attendees: number | null;
}

export interface ReservationPatch {
  resourceId?: string;
  startDateTime?: Date;
  endDateTime?: Date;
  purpose?: string;
  justification?: string;
  attendees?: number | null;
}

export interface EditPlan {
  next: ReservationSnapshot;
  slotChanged: boolean;
  changed: boolean;
}

export function planEdit(current: ReservationSnapshot, patch: ReservationPatch): EditPlan {
  const hasStart = patch.startDateTime !== undefined;
  const hasEnd = patch.endDateTime !== undefined;
  if (hasStart !== hasEnd) {
    throw new RuleViolation('INCOMPLETE_TIMES', 'Indica la hora de inicio y la de fin juntas');
  }
  const next: ReservationSnapshot = {
    resourceId: patch.resourceId ?? current.resourceId,
    startDateTime: patch.startDateTime ?? current.startDateTime,
    endDateTime: patch.endDateTime ?? current.endDateTime,
    purpose: patch.purpose ?? current.purpose,
    justification: patch.justification ?? current.justification,
    attendees: patch.attendees === undefined ? current.attendees : patch.attendees,
  };
  const slotChanged =
    next.resourceId !== current.resourceId ||
    next.startDateTime.getTime() !== current.startDateTime.getTime() ||
    next.endDateTime.getTime() !== current.endDateTime.getTime();
  const changed =
    slotChanged ||
    next.purpose !== current.purpose ||
    next.justification !== current.justification ||
    next.attendees !== current.attendees;
  return { next, slotChanged, changed };
}

export function assertEditable(
  current: ReservationSnapshot & { status: string },
  plan: EditPlan,
  now: Date,
  rules: ReservationRules,
): void {
  if (current.status !== Status.CONFIRMED && current.status !== Status.PENDING_APPROVAL) {
    throw new RuleViolation(
      'NOT_EDITABLE',
      `No se puede modificar una reserva en estado ${current.status}`,
    );
  }
  if (current.startDateTime.getTime() <= now.getTime()) {
    throw new RuleViolation('ALREADY_STARTED', 'La reserva ya comenzó y no se puede modificar');
  }
  if (!plan.slotChanged) return;
  if (!canCancel(current.startDateTime, now, rules.cancelMinHours)) {
    throw new RuleViolation(
      'EDIT_TOO_LATE',
      `Solo se puede cambiar la franja o el recurso con al menos ${rules.cancelMinHours} horas de anticipación respecto a la reserva original`,
    );
  }
  validateReservationTimes(plan.next.startDateTime, plan.next.endDateTime, now, rules);
}

export function statusAfterEdit(
  current: { status: string; purpose: string },
  next: { purpose: string },
  slotChanged: boolean,
): string {
  if (next.purpose !== 'TRAINING') return Status.CONFIRMED;
  if (current.purpose !== 'TRAINING') return Status.PENDING_APPROVAL;
  if (slotChanged && current.status === Status.CONFIRMED) return Status.PENDING_APPROVAL;
  return current.status;
}
