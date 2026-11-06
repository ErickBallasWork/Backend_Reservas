import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { Status } from '../common/constants';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RESERVATION_INCLUDE, ReservationsService } from '../reservations/reservations.service';
import { DecideApprovalDto } from './dto/approval.dto';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  listPending() {
    return this.prisma.reservation.findMany({
      where: { status: Status.PENDING_APPROVAL, startDateTime: { gt: new Date() } },
      include: RESERVATION_INCLUDE,
      orderBy: { startDateTime: 'asc' },
    });
  }

  async decide(approver: CurrentUserData, reservationId: string, dto: DecideApprovalDto) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { resource: { select: { name: true } } },
    });
    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: `No existe la reserva ${reservationId}`,
      });
    }
    if (reservation.status !== Status.PENDING_APPROVAL) {
      throw new ConflictException({
        code: 'NOT_PENDING',
        message: `La reserva no está pendiente (estado actual: ${reservation.status})`,
      });
    }
    if (reservation.startDateTime.getTime() <= Date.now()) {
      throw new UnprocessableEntityException({
        code: 'ALREADY_STARTED',
        message: 'La reserva ya empezó; no se puede decidir',
      });
    }
    const approve = dto.decision === 'APPROVE';
    const comments = dto.comments?.trim();
    if (!approve && !comments) {
      throw new BadRequestException({
        code: 'COMMENTS_REQUIRED',
        message: 'Para rechazar debes indicar una justificación',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Filtering by status lets only one concurrent decision win.
      const updated = await tx.reservation.updateMany({
        where: { id: reservationId, status: Status.PENDING_APPROVAL },
        data: { status: approve ? Status.CONFIRMED : Status.REJECTED },
      });
      if (updated.count === 0) {
        throw new ConflictException({
          code: 'NOT_PENDING',
          message: 'Otra persona ya decidió esta reserva',
        });
      }
      await tx.approval.create({
        data: {
          reservationId,
          approverId: approver.id,
          status: approve ? 'APPROVED' : 'REJECTED',
          comments: comments ?? null,
        },
      });
      if (!approve) {
        await tx.reservationSlot.deleteMany({ where: { reservationId } });
      }
      await this.notifications.notify(
        {
          userId: reservation.userId,
          type: approve ? 'RESERVATION_APPROVED' : 'RESERVATION_REJECTED',
          title: approve ? 'Entrenamiento aprobado' : 'Entrenamiento rechazado',
          message: approve
            ? `Tu reserva de ${reservation.resource.name} fue aprobada.`
            : `Tu reserva de ${reservation.resource.name} fue rechazada. Motivo: ${comments}`,
        },
        tx,
      );
      await this.audit.log(
        {
          userId: approver.id,
          action: approve ? 'TRAINING_APPROVED' : 'TRAINING_REJECTED',
          entity: 'Reservation',
          entityId: reservationId,
          details: { comments: comments ?? null },
        },
        tx,
      );
    });

    return this.reservations.getById(reservationId);
  }
}
