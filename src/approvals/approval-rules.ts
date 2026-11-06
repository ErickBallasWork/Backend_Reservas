import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Status } from '../common/constants';

export interface DecidableReservation {
  status: string;
  startDateTime: Date;
}

export function normalizeComments(comments: string | undefined): string | null {
  const trimmed = comments?.trim();
  return trimmed ? trimmed : null;
}

export function assertRejectionHasComments(approve: boolean, comments: string | null): void {
  if (!approve && comments === null) {
    throw new BadRequestException({
      code: 'COMMENTS_REQUIRED',
      message: 'Para rechazar debes indicar una justificación',
    });
  }
}

export function assertDecidable(reservation: DecidableReservation, now: Date): void {
  if (reservation.status !== Status.PENDING_APPROVAL) {
    throw new ConflictException({
      code: 'NOT_PENDING',
      message: `La reserva no está pendiente (estado actual: ${reservation.status})`,
    });
  }
  if (reservation.startDateTime.getTime() <= now.getTime()) {
    throw new UnprocessableEntityException({
      code: 'ALREADY_STARTED',
      message: 'La reserva ya empezó; no se puede decidir',
    });
  }
}
