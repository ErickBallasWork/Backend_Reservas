import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CatalogLookupService } from '../catalog/catalog-lookup.service';
import { Status, TransferStatus } from '../common/constants';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { isUniqueViolation } from '../common/db.types';
import { formatDate } from '../common/format';
import { toSkipTake } from '../common/pagination.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { reservationLabel, ReservationsService } from '../reservations/reservations.service';
import { SanctionsService } from '../sanctions/sanctions.service';
import { CreateTransferRequestDto, RespondTransferDto, TransferListQueryDto } from './dto/transfer.dto';
import { closePendingTransfers } from './transfer-helpers';

// Lo que se devuelve de cada solicitud: quién la pide, por qué, y la reserva pedida.
const TRANSFER_INCLUDE = {
  requester: { select: { id: true, fullName: true, email: true, department: true } },
  reservation: {
    select: {
      id: true,
      userId: true,
      purpose: true,
      startDateTime: true,
      endDateTime: true,
      status: true,
      resource: {
        select: { id: true, name: true, type: true, building: { select: { id: true, name: true } } },
      },
      user: { select: { id: true, fullName: true, email: true } },
    },
  },
} satisfies Prisma.TransferRequestInclude;

// Para cargar una solicitud con lo necesario para responderla.
const TRANSFER_WITH_RESERVATION = {
  reservation: { include: { resource: { include: { parent: true } } } },
} satisfies Prisma.TransferRequestInclude;

/** Mientras está pendiente, quien pidió no ve quién tiene la reserva (privacidad). */
function hideOwnerWhilePending<T extends { status: string; reservation: { user: unknown } }>(item: T) {
  if (item.status !== TransferStatus.PENDING) return item;
  return { ...item, reservation: { ...item.reservation, user: null } };
}

/**
 * Cesión de reservas entre asociados. Una persona pide una reserva ocupada explicando por qué;
 * el dueño recibe el aviso y acepta o rechaza. Si acepta, en una sola transacción su reserva
 * pasa a TRANSFERRED y se crea la reserva de quien la pidió con el mismo recurso y horario.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: CatalogLookupService,
    private readonly reservations: ReservationsService,
    private readonly sanctions: SanctionsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Pedir una reserva ocupada. La justificación le llega al dueño en el aviso. */
  async request(requester: CurrentUserData, reservationId: string, dto: CreateTransferRequestDto) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { resource: { include: { parent: true } } },
    });
    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: `No existe la reserva ${reservationId}`,
      });
    }
    if (reservation.userId === requester.id) {
      throw new UnprocessableEntityException({ code: 'OWN_RESERVATION', message: 'Esta reserva ya es tuya' });
    }
    if (reservation.status !== Status.CONFIRMED) {
      throw new UnprocessableEntityException({
        code: 'NOT_TRANSFERABLE',
        message: `Solo se puede pedir una reserva confirmada (estado actual: ${reservation.status})`,
      });
    }
    if (reservation.startDateTime.getTime() <= Date.now()) {
      throw new UnprocessableEntityException({ code: 'ALREADY_STARTED', message: 'La reserva ya empezó' });
    }

    // Mismas condiciones que para reservar: sin sanción activa.
    await this.sanctions.processNoShows({ userId: requester.id });
    await this.sanctions.assertNoActiveSanction(requester.id);

    const repeated = await this.prisma.transferRequest.findFirst({
      where: { reservationId, requesterId: requester.id, status: TransferStatus.PENDING },
    });
    if (repeated) {
      throw new ConflictException({
        code: 'ALREADY_REQUESTED',
        message: 'Ya pediste esta reserva; espera la respuesta de su dueño',
      });
    }

    const justification = dto.justification.trim();
    const label = reservationLabel(reservation.resource);
    const created = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transferRequest.create({
        data: {
          reservationId,
          requesterId: requester.id,
          purpose: dto.purpose,
          justification,
          status: TransferStatus.PENDING,
        },
      });
      await this.notifications.notify(
        {
          userId: reservation.userId,
          type: 'TRANSFER_REQUESTED',
          title: 'Te piden ceder una reserva',
          message:
            `${requester.fullName} (${requester.email}) necesita ${label} ` +
            `del ${formatDate(reservation.startDateTime)} al ${formatDate(reservation.endDateTime)}. ` +
            `Motivo: ${justification}`,
        },
        tx,
      );
      await this.audit.log(
        {
          userId: requester.id,
          action: 'TRANSFER_REQUESTED',
          entity: 'TransferRequest',
          entityId: transfer.id,
          details: { reservationId, purpose: dto.purpose, justification },
        },
        tx,
      );
      return transfer;
    });
    return hideOwnerWhilePending(await this.getById(created.id));
  }

  /** Solicitudes que llegaron por mis reservas (yo decido). */
  async received(owner: CurrentUserData, query: TransferListQueryDto) {
    const where: Prisma.TransferRequestWhereInput = {
      reservation: { userId: owner.id },
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.transferRequest.findMany({
        where,
        include: TRANSFER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.transferRequest.count({ where }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items };
  }

  /** Solicitudes que yo envié. */
  async sent(requester: CurrentUserData, query: TransferListQueryDto) {
    const where: Prisma.TransferRequestWhereInput = {
      requesterId: requester.id,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.transferRequest.findMany({
        where,
        include: TRANSFER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.transferRequest.count({ where }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items: items.map(hideOwnerWhilePending) };
  }

  /** El dueño cede su reserva: la suya queda TRANSFERRED y se crea la de quien la pidió. */
  async accept(owner: CurrentUserData, id: string, dto: RespondTransferDto) {
    const transfer = await this.findPendingForOwner(owner, id);
    const { reservation } = transfer;
    if (reservation.status !== Status.CONFIRMED) {
      throw new ConflictException({
        code: 'RESERVATION_CHANGED',
        message: `Tu reserva ya no está confirmada (estado actual: ${reservation.status})`,
      });
    }
    if (reservation.startDateTime.getTime() <= Date.now()) {
      throw new UnprocessableEntityException({ code: 'ALREADY_STARTED', message: 'La reserva ya empezó' });
    }

    // Quien la recibe debe seguir activo y sin sanción.
    const requester = await this.prisma.user.findUnique({
      where: { id: transfer.requesterId },
      select: { id: true, fullName: true, isActive: true },
    });
    const activeSanctions = await this.prisma.sanction.count({
      where: { userId: transfer.requesterId, status: 'ACTIVE' },
    });
    if (!requester || !requester.isActive || activeSanctions > 0) {
      throw new UnprocessableEntityException({
        code: 'REQUESTER_BLOCKED',
        message: 'Quien pidió la reserva está desactivado o tiene una sanción activa; no se le puede ceder',
      });
    }

    // El recurso, su edificio y su laboratorio deben seguir activos.
    const resource = await this.lookup.getActiveResource(reservation.resourceId);
    const label = reservationLabel(reservation.resource);
    const comment = dto.comment?.trim() || null;
    const start = reservation.startDateTime;
    const end = reservation.endDateTime;

    try {
      await this.prisma.$transaction(
        async (tx) => {
          // 1) La solicitud sigue pendiente (si dos procesos responden a la vez, solo pasa uno).
          const accepted = await tx.transferRequest.updateMany({
            where: { id, status: TransferStatus.PENDING },
            data: { status: TransferStatus.ACCEPTED, responseComment: comment, respondedAt: new Date() },
          });
          if (accepted.count === 0) {
            throw new ConflictException({ code: 'NOT_PENDING', message: 'La solicitud ya fue respondida o retirada' });
          }

          // 2) La reserva del dueño sigue confirmada (no la canceló ni la movieron mientras tanto).
          const ceded = await tx.reservation.updateMany({
            where: { id: reservation.id, status: Status.CONFIRMED },
            data: { status: Status.TRANSFERRED },
          });
          if (ceded.count === 0) {
            throw new ConflictException({ code: 'RESERVATION_CHANGED', message: 'La reserva cambió; ya no se puede ceder' });
          }

          // 3) Libera las franjas del dueño y crea la reserva nueva con el mismo recurso y horario.
          await tx.reservationSlot.deleteMany({ where: { reservationId: reservation.id } });
          const created = await this.reservations.createInTx(
            tx,
            requester,
            { resource, start, end, purpose: transfer.purpose, justification: transfer.justification },
            { notifyOwner: false, auditDetails: { transferRequestId: id, fromReservationId: reservation.id } },
          );
          await tx.transferRequest.update({ where: { id }, data: { newReservationId: created.id } });

          // 4) Las demás personas que pedían la misma reserva se enteran de que ya no está disponible.
          await closePendingTransfers(tx, this.notifications, reservation.id, {
            title: 'La reserva que pediste se cedió a otra persona',
            message: `${label} ya no está disponible en ese horario: su dueño la cedió a otra persona.`,
          });

          // 5) Avisos y auditoría.
          const waitsForLeader = created.status === Status.PENDING_APPROVAL;
          await this.notifications.notify(
            {
              userId: requester.id,
              type: 'TRANSFER_ACCEPTED',
              title: 'Te cedieron la reserva',
              message:
                `${owner.fullName} te cedió ${label} del ${formatDate(start)} al ${formatDate(end)}. ` +
                (waitsForLeader
                  ? 'Como es un entrenamiento, espera la aprobación del Líder de Conocimiento.'
                  : 'Tu reserva quedó confirmada.') +
                (comment ? ` Comentario: ${comment}` : ''),
            },
            tx,
          );
          await this.audit.log(
            {
              userId: owner.id,
              action: 'RESERVATION_TRANSFERRED',
              entity: 'Reservation',
              entityId: reservation.id,
              details: { toUserId: requester.id, newReservationId: created.id, transferRequestId: id },
            },
            tx,
          );
          await this.audit.log(
            {
              userId: owner.id,
              action: 'TRANSFER_ACCEPTED',
              entity: 'TransferRequest',
              entityId: id,
              details: { fromReservationId: reservation.id, newReservationId: created.id, comment },
            },
            tx,
          );
        },
        { timeout: 20_000 },
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'SLOT_TAKEN',
          message: 'Parte del horario quedó ocupada por otra reserva; no se pudo ceder',
        });
      }
      throw error;
    }

    return this.getById(id);
  }

  /** El dueño no cede su reserva. El motivo es obligatorio y le llega a quien la pidió. */
  async reject(owner: CurrentUserData, id: string, dto: RespondTransferDto) {
    const comment = dto.comment?.trim();
    if (!comment) {
      throw new BadRequestException({
        code: 'COMMENT_REQUIRED',
        message: 'Para rechazar escribe el motivo; le llegará a quien te pidió la reserva',
      });
    }
    const transfer = await this.findPendingForOwner(owner, id);
    const { reservation } = transfer;
    const label = reservationLabel(reservation.resource);

    await this.prisma.$transaction(async (tx) => {
      const rejected = await tx.transferRequest.updateMany({
        where: { id, status: TransferStatus.PENDING },
        data: { status: TransferStatus.REJECTED, responseComment: comment, respondedAt: new Date() },
      });
      if (rejected.count === 0) {
        throw new ConflictException({ code: 'NOT_PENDING', message: 'La solicitud ya fue respondida o retirada' });
      }
      await this.notifications.notify(
        {
          userId: transfer.requesterId,
          type: 'TRANSFER_REJECTED',
          title: 'No te cedieron la reserva',
          message:
            `${owner.fullName} no puede cederte ${label} del ${formatDate(reservation.startDateTime)} ` +
            `al ${formatDate(reservation.endDateTime)}. Motivo: ${comment}`,
        },
        tx,
      );
      await this.audit.log(
        {
          userId: owner.id,
          action: 'TRANSFER_REJECTED',
          entity: 'TransferRequest',
          entityId: id,
          details: { reservationId: reservation.id, comment },
        },
        tx,
      );
    });

    return this.getById(id);
  }

  /** Quien pidió la reserva retira su solicitud. */
  async cancel(requester: CurrentUserData, id: string) {
    const transfer = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: TRANSFER_WITH_RESERVATION,
    });
    if (!transfer) {
      throw new NotFoundException({ code: 'TRANSFER_NOT_FOUND', message: `No existe la solicitud ${id}` });
    }
    if (transfer.requesterId !== requester.id) {
      throw new ForbiddenException({ code: 'NOT_REQUESTER', message: 'Solo quien hizo la solicitud puede retirarla' });
    }
    if (transfer.status !== TransferStatus.PENDING) {
      throw new ConflictException({ code: 'NOT_PENDING', message: 'La solicitud ya fue respondida o retirada' });
    }
    const label = reservationLabel(transfer.reservation.resource);

    await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.transferRequest.updateMany({
        where: { id, status: TransferStatus.PENDING },
        data: { status: TransferStatus.CANCELLED, respondedAt: new Date() },
      });
      if (cancelled.count === 0) {
        throw new ConflictException({ code: 'NOT_PENDING', message: 'La solicitud ya fue respondida o retirada' });
      }
      await this.notifications.notify(
        {
          userId: transfer.reservation.userId,
          type: 'TRANSFER_CANCELLED',
          title: 'Retiraron una solicitud de cesión',
          message: `${requester.fullName} ya no necesita ${label}; no tienes que responder.`,
        },
        tx,
      );
      await this.audit.log(
        { userId: requester.id, action: 'TRANSFER_CANCELLED', entity: 'TransferRequest', entityId: id },
        tx,
      );
    });

    return hideOwnerWhilePending(await this.getById(id));
  }

  /** Carga una solicitud pendiente y comprueba que quien responde sea el dueño de la reserva. */
  private async findPendingForOwner(owner: CurrentUserData, id: string) {
    const transfer = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: TRANSFER_WITH_RESERVATION,
    });
    if (!transfer) {
      throw new NotFoundException({ code: 'TRANSFER_NOT_FOUND', message: `No existe la solicitud ${id}` });
    }
    if (transfer.reservation.userId !== owner.id) {
      throw new ForbiddenException({
        code: 'NOT_OWNER',
        message: 'Solo el dueño de la reserva puede responder esta solicitud',
      });
    }
    if (transfer.status !== TransferStatus.PENDING) {
      throw new ConflictException({ code: 'NOT_PENDING', message: 'La solicitud ya fue respondida o retirada' });
    }
    return transfer;
  }

  private async getById(id: string) {
    const transfer = await this.prisma.transferRequest.findUnique({ where: { id }, include: TRANSFER_INCLUDE });
    if (!transfer) {
      throw new NotFoundException({ code: 'TRANSFER_NOT_FOUND', message: `No existe la solicitud ${id}` });
    }
    return transfer;
  }
}