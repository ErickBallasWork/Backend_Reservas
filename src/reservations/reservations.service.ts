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
import {
  MANAGER_ROLES,
  RESERVATION_TYPE_BY_RESOURCE,
  ResourceType,
  Status,
} from '../common/constants';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { isUniqueViolation } from '../common/db.types';
import { toSkipTake } from '../common/pagination.dto';
import { ReservationRulesService } from '../config/reservation-rules.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toLocalSlots } from '../operating-hours/operating-calendar';
import { OperatingHoursService } from '../operating-hours/operating-hours.service';
import { PrismaService } from '../prisma/prisma.service';
import { SanctionsService } from '../sanctions/sanctions.service';
import { CreateReservationDto, MyReservationsQueryDto } from './dto/reservation.dto';
import { LeaderNotifier } from './leader-notifier';
import { canViewReservation } from './reservation-access.policy';
import { blockedResourceIds, describeResource } from './reservation-resources';
import { resolveAttendees } from './attendees-rule';
import { insertSlots } from './slots';
import {
  buildSlotStarts,
  canCancelReservation,
  isWithinCheckInWindow,
  RuleViolation,
  validateReservationTimes,
} from './time-rules';

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
  series: { select: { id: true, occurrenceCount: true } },
} satisfies Prisma.ReservationInclude;

export const APPROVALS_INCLUDE = {
  orderBy: { decisionDate: 'desc' },
  include: { approver: { select: { fullName: true } } },
} satisfies Prisma.Reservation$approvalsArgs;

export const REALLOCATIONS_INCLUDE = {
  orderBy: { reallocationDate: 'desc' },
  include: {
    previousResource: { select: RESERVATION_INCLUDE.resource.select },
    newResource: { select: RESERVATION_INCLUDE.resource.select },
  },
} satisfies Prisma.Reservation$reallocationsArgs;

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: CatalogLookupService,
    private readonly sanctions: SanctionsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly reservationRules: ReservationRulesService,
    private readonly operatingHours: OperatingHoursService,
    private readonly leaderNotifier: LeaderNotifier,
  ) {}

  static toHttpError(error: unknown): never {
    if (error instanceof RuleViolation) {
      throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
    throw error;
  }

  async create(user: CurrentUserData, dto: CreateReservationDto) {
    const rules = this.reservationRules.current();

    await this.sanctions.processNoShows({ userId: user.id });
    await this.sanctions.assertNoActiveSanction(user.id);

    const start = new Date(dto.startDateTime);
    const end = new Date(dto.endDateTime);
    try {
      validateReservationTimes(start, end, new Date(), rules);
    } catch (error) {
      ReservationsService.toHttpError(error);
    }

    const resource = await this.lookup.getActiveResource(dto.resourceId);
    let attendees: number | null = null;
    try {
      attendees = resolveAttendees(resource.type as ResourceType, dto.attendees, resource.capacity);
    } catch (error) {
      ReservationsService.toHttpError(error);
    }
    const reservationType = RESERVATION_TYPE_BY_RESOURCE[resource.type as ResourceType];
    const blockedIds = await blockedResourceIds(this.lookup, resource);
    const slotStarts = buildSlotStarts(start, end, rules.slotMinutes);
    try {
      await this.operatingHours.assertOpen(
        resource,
        toLocalSlots(slotStarts, this.operatingHours.timeZone),
      );
    } catch (error) {
      ReservationsService.toHttpError(error);
    }
    const status = dto.purpose === 'TRAINING' ? Status.PENDING_APPROVAL : Status.CONFIRMED;
    const label = describeResource(resource);

    try {
      const reservation = await this.prisma.$transaction(
        async (tx) => {
          const created = await tx.reservation.create({
            data: {
              userId: user.id,
              resourceId: resource.id,
              reservationType,
              purpose: dto.purpose,
              justification: dto.justification,
              attendees,
              startDateTime: start,
              endDateTime: end,
              status,
            },
          });

          await insertSlots(tx, created.id, blockedIds, slotStarts, rules.slotMinutes);

          await this.notifications.notify(
            {
              userId: user.id,
              reservationId: created.id,
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
            await this.leaderNotifier.requestApproval(tx, {
              requesterId: user.id,
              requesterName: user.fullName,
              label,
              reservationId: created.id,
            });
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
      return this.getById(reservation.id);
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

  async getById(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        ...RESERVATION_INCLUDE,
        approvals: APPROVALS_INCLUDE,
        reallocations: REALLOCATIONS_INCLUDE,
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

  async getForViewer(user: CurrentUserData, id: string) {
    const reservation = await this.getById(id);
    const ownerIsManagedBy = await this.isManagedBy(user, reservation.userId);
    const allowed = canViewReservation(user, {
      userId: reservation.userId,
      resourceBuildingId: reservation.resource.building.id,
      ownerIsManagedBy,
    });
    if (!allowed) {
      throw new ForbiddenException({
        code: 'NOT_OWNER',
        message: 'No tienes permiso para ver esta reserva',
      });
    }
    return reservation;
  }

  private async isManagedBy(user: CurrentUserData, ownerId: string) {
    if (!user.roles.some((role) => MANAGER_ROLES.includes(role))) return false;
    const link = await this.prisma.managedAssociate.findFirst({
      where: { managerId: user.id, associateId: ownerId },
      select: { id: true },
    });
    return link !== null;
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
        include: {
          ...RESERVATION_INCLUDE,
          approvals: APPROVALS_INCLUDE,
          reallocations: REALLOCATIONS_INCLUDE,
        },
        orderBy: { startDateTime: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.reservation.count({ where }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items };
  }

  async getOwned(userId: string, id: string) {
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

  async cancel(user: CurrentUserData, id: string) {
    const reservation = await this.getOwned(user.id, id);
    if (reservation.status !== Status.CONFIRMED && reservation.status !== Status.PENDING_APPROVAL) {
      throw new UnprocessableEntityException({
        code: 'NOT_CANCELLABLE',
        message: `No se puede cancelar una reserva en estado ${reservation.status}`,
      });
    }
    const rules = this.reservationRules.current();
    const reallocated =
      (await this.prisma.reallocation.count({ where: { reservationId: id } })) > 0;
    if (
      !canCancelReservation(
        reservation.startDateTime,
        new Date(),
        rules.cancelMinHours,
        reallocated,
      )
    ) {
      throw new UnprocessableEntityException({
        code: 'CANCEL_TOO_LATE',
        message: `Solo se puede cancelar con al menos ${rules.cancelMinHours} horas de anticipación`,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.reservationSlot.deleteMany({ where: { reservationId: id } });
      await tx.reservation.update({ where: { id }, data: { status: Status.CANCELLED } });
      await this.notifications.resolveForReservation(id, ['RESERVATION_REMINDER'], tx);
      await this.audit.log(
        { userId: user.id, action: 'RESERVATION_CANCELLED', entity: 'Reservation', entityId: id },
        tx,
      );
    });
    return this.getById(id);
  }

  async checkIn(user: CurrentUserData, id: string) {
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
      const updated = await tx.reservation.updateMany({
        where: { id, status: Status.CONFIRMED },
        data: { status: Status.CHECKED_IN },
      });
      if (updated.count === 0) {
        throw new ConflictException({
          code: 'CONCURRENT_CONFLICT',
          message: 'La reserva cambió mientras registrabas el uso. Actualiza e inténtalo de nuevo.',
        });
      }
      await tx.checkIn.create({
        data: { reservationId: id, userId: user.id, method: 'BUTTON' },
      });
      await this.notifications.resolveForReservation(id, ['RESERVATION_REMINDER'], tx);
      await this.audit.log(
        { userId: user.id, action: 'RESERVATION_CHECKED_IN', entity: 'Reservation', entityId: id },
        tx,
      );
    });
    return this.getById(id);
  }
}
