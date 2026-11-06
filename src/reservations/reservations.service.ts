import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CatalogLookupService } from '../catalog/catalog-lookup.service';
import { RESERVATION_TYPE_BY_RESOURCE, ResourceType, Status } from '../common/constants';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { isUniqueViolation } from '../common/db.types';
import { toSkipTake } from '../common/pagination.dto';
import { ReservationRulesService } from '../config/reservation-rules.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SanctionsService } from '../sanctions/sanctions.service';
import { CheckInDto, CreateReservationDto, MyReservationsQueryDto } from './dto/reservation.dto';
import { insertSlots } from './slots';
import {
  buildSlotStarts,
  canCancel,
  isWithinCheckInWindow,
  RuleViolation,
  validateReservationTimes,
} from './time-rules';

// Datos que se devuelven junto con cada reserva.
export const RESERVATION_INCLUDE = {
  resource: {
    select: {
      id: true,
      name: true,
      type: true,
      building: { select: { id: true, name: true } },
      parent: { select: { id: true, name: true } },
    },
  },
  user: { select: { id: true, fullName: true, email: true } },
  checkIn: true,
} satisfies Prisma.ReservationInclude;

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: CatalogLookupService,
    private readonly sanctions: SanctionsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly reservationRules: ReservationRulesService,
  ) {}

  /** Convierte una regla incumplida en un error 422 con su código. */
  static toHttpError(error: unknown): never {
    if (error instanceof RuleViolation) {
      throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
    throw error;
  }

  /** RF-03 a RF-08: reservar una sala, un laboratorio completo o una laptop. */
  async create(user: CurrentUserData, dto: CreateReservationDto) {
    const rules = this.reservationRules.current();

    // 1) Sanciones. Antes se calculan los No-Show pendientes de este usuario (respaldo de la tarea).
    await this.sanctions.processNoShows({ userId: user.id });
    await this.sanctions.assertNoActiveSanction(user.id);

    // 2) Reglas de tiempo: franjas, anticipación y duración máxima (RF-05, RF-06).
    const start = new Date(dto.startDateTime);
    const end = new Date(dto.endDateTime);
    try {
      validateReservationTimes(start, end, new Date(), rules);
    } catch (error) {
      ReservationsService.toHttpError(error);
    }

    // 3) Qué recurso se reserva y qué recursos quedan bloqueados (RF-03).
    const resource = await this.lookup.getActiveResource(dto.resourceId);
    const reservationType = RESERVATION_TYPE_BY_RESOURCE[resource.type as ResourceType];
    // El laboratorio completo bloquea también cada una de sus laptops; y una laptop tomada
    // impide reservar el laboratorio completo en ese horario (choca en la franja de la laptop).
    const blockedIds =
      resource.type === 'AI_LAB'
        ? [resource.id, ...(await this.lookup.activeLaptopIds(resource.id))]
        : [resource.id];
    const slotStarts = buildSlotStarts(start, end, rules.slotMinutes);
    const status = dto.purpose === 'TRAINING' ? Status.PENDING_APPROVAL : Status.CONFIRMED;
    const label =
      resource.type === 'LAPTOP'
        ? `la laptop ${resource.name} (${resource.parent?.name ?? 'laboratorio'})`
        : resource.type === 'AI_LAB'
          ? `${resource.name} (completo)`
          : resource.name;

    // 4) Todo en una transacción: reserva + franjas + avisos + auditoría.
    try {
      const reservation = await this.prisma.$transaction(
        async (tx) => {
          const created = await tx.reservation.create({
            data: {
              userId: user.id,
              resourceId: resource.id,
              reservationType,
              purpose: dto.purpose,
              justification: dto.justification.trim(),
              startDateTime: start,
              endDateTime: end,
              status,
            },
          });

          await insertSlots(tx, created.id, blockedIds, slotStarts, rules.slotMinutes);

          await this.notifications.notify(
            {
              userId: user.id,
              type: status === Status.CONFIRMED ? 'RESERVATION_CONFIRMED' : 'RESERVATION_PENDING',
              title:
                status === Status.CONFIRMED
                  ? 'Reserva confirmada'
                  : 'Reserva pendiente de aprobación',
              message:
                status === Status.CONFIRMED
                  ? `Tu reserva de ${label} quedó confirmada.`
                  : `Tu reserva de ${label} espera la aprobación del Líder de Conocimiento.`,
            },
            tx,
          );

          if (status === Status.PENDING_APPROVAL) {
            await this.notifyLeaders(tx, user.fullName, label);
          }

          await this.audit.log(
            {
              userId: user.id,
              action: 'RESERVATION_CREATED',
              entity: 'Reservation',
              entityId: created.id,
              details: { ...dto, reservationType, status, blockedResources: blockedIds.length },
            },
            tx,
          );
          return created;
        },
        { timeout: 20_000 },
      );
      return this.get(reservation.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'SLOT_TAKEN',
          message: 'El horario ya está ocupado para ese recurso. Elige otra franja u otro recurso.',
        });
      }
      throw error;
    }
  }

  // Pendiente: cuando se defina "asociados a cargo", avisar solo al Líder del asociado.
  private async notifyLeaders(tx: Prisma.TransactionClient, requester: string, label: string) {
    const leaders = await tx.userRole.findMany({
      where: { role: { name: 'LIDER' }, user: { isActive: true } },
      select: { userId: true },
    });
    for (const userId of [...new Set<string>(leaders.map((l) => l.userId))]) {
      await this.notifications.notify(
        {
          userId,
          type: 'APPROVAL_REQUESTED',
          title: 'Entrenamiento por aprobar',
          message: `${requester} solicitó ${label} para un entrenamiento.`,
        },
        tx,
      );
    }
  }

  async get(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        ...RESERVATION_INCLUDE,
        approvals: {
          orderBy: { decisionDate: 'desc' },
          include: { approver: { select: { fullName: true } } },
        },
        reallocations: { orderBy: { reallocationDate: 'desc' } },
      },
    });
    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: `No existe la reserva ${id}`,
      });
    }
    return reservation;
  }

  async listMine(userId: string, query: MyReservationsQueryDto) {
    const where: Prisma.ReservationWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            startDateTime: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        include: RESERVATION_INCLUDE,
        orderBy: { startDateTime: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.reservation.count({ where }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items };
  }

  private async getOwned(userId: string, id: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: `No existe la reserva ${id}`,
      });
    }
    if (reservation.userId !== userId) {
      throw new ForbiddenException({ code: 'NOT_OWNER', message: 'Esta reserva no es tuya' });
    }
    return reservation;
  }

  /** RF-05: cancelar con la anticipación mínima. Libera las franjas de inmediato. */
  async cancel(user: CurrentUserData, id: string) {
    const reservation = await this.getOwned(user.id, id);
    if (reservation.status !== Status.CONFIRMED && reservation.status !== Status.PENDING_APPROVAL) {
      throw new UnprocessableEntityException({
        code: 'NOT_CANCELLABLE',
        message: `No se puede cancelar una reserva en estado ${reservation.status}`,
      });
    }
    const rules = this.reservationRules.current();
    if (!canCancel(reservation.startDateTime, new Date(), rules.cancelMinHours)) {
      throw new UnprocessableEntityException({
        code: 'CANCEL_TOO_LATE',
        message: `Solo se puede cancelar con al menos ${rules.cancelMinHours} horas de anticipación`,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.reservationSlot.deleteMany({ where: { reservationId: id } });
      await tx.reservation.update({ where: { id }, data: { status: Status.CANCELLED } });
      await this.audit.log(
        { userId: user.id, action: 'RESERVATION_CANCELLED', entity: 'Reservation', entityId: id },
        tx,
      );
    });
    return this.get(id);
  }

  /** RF-12 / HU-20: registrar el uso del espacio dentro de la ventana de check-in. */
  async checkIn(user: CurrentUserData, id: string, dto: CheckInDto) {
    const reservation = await this.getOwned(user.id, id);
    if (reservation.status !== Status.CONFIRMED) {
      throw new UnprocessableEntityException({
        code: 'NOT_CHECKABLE',
        message: `No se puede registrar el uso de una reserva en estado ${reservation.status}`,
      });
    }
    const rules = this.reservationRules.current();
    if (
      !isWithinCheckInWindow(
        reservation.startDateTime,
        new Date(),
        rules.checkinBeforeMin,
        rules.checkinAfterMin,
      )
    ) {
      throw new UnprocessableEntityException({
        code: 'OUTSIDE_CHECKIN_WINDOW',
        message: `El uso se registra desde ${rules.checkinBeforeMin} min antes hasta ${rules.checkinAfterMin} min después del inicio`,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.checkIn.create({
        data: { reservationId: id, userId: user.id, method: dto.method ?? 'BUTTON' },
      });
      await tx.reservation.update({ where: { id }, data: { status: Status.CHECKED_IN } });
      await this.audit.log(
        { userId: user.id, action: 'RESERVATION_CHECKED_IN', entity: 'Reservation', entityId: id },
        tx,
      );
    });
    return this.get(id);
  }
}
