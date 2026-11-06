import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { Status } from '../common/constants';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalRoutingService } from '../reservations/approval-routing.service';
import { RESERVATION_INCLUDE, ReservationsService } from '../reservations/reservations.service';
import { assertDecidable, assertRejectionHasComments, normalizeComments } from './approval-rules';
import { assertRouted, routeDecision } from './approval-routing.policy';
import { DecideApprovalDto, SeriesDecisionResponseDto } from './dto/approval.dto';

interface DecisionTarget {
  id: string;
  userId: string;
  resource: { name: string };
}

interface Verdict {
  approve: boolean;
  comments: string | null;
}

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly routing: ApprovalRoutingService,
  ) {}

  listPending(approver: CurrentUserData) {
    return this.prisma.reservation.findMany({
      where: {
        status: Status.PENDING_APPROVAL,
        startDateTime: { gt: new Date() },
        ...this.routing.pendingOwnersFilter(approver),
      },
      include: RESERVATION_INCLUDE,
      orderBy: { startDateTime: 'asc' },
    });
  }

  async decide(approver: CurrentUserData, reservationId: string, dto: DecideApprovalDto) {
    const verdict = this.toVerdict(dto);
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
    assertDecidable(reservation, new Date());
    await this.assertRoutedTo(approver, reservation.userId);

    await this.prisma.$transaction(async (tx) => {
      const decided = await this.applyDecision(tx, approver, reservation, verdict);
      if (!decided) {
        throw new ConflictException({
          code: 'NOT_PENDING',
          message: 'Otra persona ya decidió esta reserva',
        });
      }
      await this.notifyOwner(tx, reservation, verdict, 1);
    });

    return this.reservations.getById(reservationId);
  }

  async decideSeries(
    approver: CurrentUserData,
    seriesId: string,
    dto: DecideApprovalDto,
  ): Promise<SeriesDecisionResponseDto> {
    const verdict = this.toVerdict(dto);
    const series = await this.prisma.reservationSeries.findUnique({
      where: { id: seriesId },
      select: { id: true },
    });
    if (!series) {
      throw new NotFoundException({
        code: 'SERIES_NOT_FOUND',
        message: `No existe la serie ${seriesId}`,
      });
    }
    const candidates = await this.prisma.reservation.findMany({
      where: {
        seriesId,
        status: Status.PENDING_APPROVAL,
        startDateTime: { gt: new Date() },
      },
      select: { id: true, userId: true, resource: { select: { name: true } } },
      orderBy: { startDateTime: 'asc' },
    });
    const [first] = candidates;
    if (!first) {
      throw new ConflictException({
        code: 'NOT_PENDING',
        message: 'La serie no tiene solicitudes pendientes',
      });
    }
    await this.assertRoutedTo(approver, first.userId);

    const decided = await this.prisma.$transaction(
      async (tx) => {
        let count = 0;
        for (const candidate of candidates) {
          if (await this.applyDecision(tx, approver, candidate, verdict)) count++;
        }
        if (count > 0) await this.notifyOwner(tx, first, verdict, count);
        return count;
      },
      { timeout: 20_000 },
    );

    return { seriesId, decided, skipped: candidates.length - decided };
  }

  private toVerdict(dto: DecideApprovalDto): Verdict {
    const approve = dto.decision === 'APPROVE';
    const comments = normalizeComments(dto.comments);
    assertRejectionHasComments(approve, comments);
    return { approve, comments };
  }

  private async assertRoutedTo(approver: CurrentUserData, ownerId: string) {
    const assigned = await this.routing.assignedLeaderIds(ownerId);
    assertRouted(routeDecision(approver, ownerId, assigned));
  }

  private async applyDecision(
    tx: Prisma.TransactionClient,
    approver: CurrentUserData,
    reservation: DecisionTarget,
    { approve, comments }: Verdict,
  ): Promise<boolean> {
    // Filtering by status lets only one concurrent decision win.
    const updated = await tx.reservation.updateMany({
      where: { id: reservation.id, status: Status.PENDING_APPROVAL },
      data: { status: approve ? Status.CONFIRMED : Status.REJECTED },
    });
    if (updated.count === 0) return false;
    await tx.approval.create({
      data: {
        reservationId: reservation.id,
        approverId: approver.id,
        status: approve ? 'APPROVED' : 'REJECTED',
        comments,
      },
    });
    if (!approve) {
      await tx.reservationSlot.deleteMany({ where: { reservationId: reservation.id } });
    }
    await this.notifications.resolveForReservation(
      reservation.id,
      ['APPROVAL_REQUESTED', 'APPROVAL_REALLOCATED'],
      tx,
    );
    await this.audit.log(
      {
        userId: approver.id,
        action: approve ? 'TRAINING_APPROVED' : 'TRAINING_REJECTED',
        entity: 'Reservation',
        entityId: reservation.id,
        details: { comments },
      },
      tx,
    );
    return true;
  }

  private notifyOwner(
    tx: Prisma.TransactionClient,
    reservation: DecisionTarget,
    { approve, comments }: Verdict,
    count: number,
  ) {
    const name = reservation.resource.name;
    const outcome = approve ? 'aprobada' : 'rechazada';
    const subject =
      count > 1
        ? `Tus ${count} reservas de ${name} fueron ${outcome}s`
        : `Tu reserva de ${name} fue ${outcome}`;
    const reason = approve ? '' : ` Motivo: ${comments}`;
    return this.notifications.notify(
      {
        userId: reservation.userId,
        reservationId: count > 1 ? undefined : reservation.id,
        type: approve ? 'RESERVATION_APPROVED' : 'RESERVATION_REJECTED',
        title: approve ? 'Entrenamiento aprobado' : 'Entrenamiento rechazado',
        message: `${subject}.${reason}`,
      },
      tx,
    );
  }
}
