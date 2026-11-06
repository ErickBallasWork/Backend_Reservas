import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CatalogLookupService } from '../catalog/catalog-lookup.service';
import { Status, SUPERADMIN_ROLE } from '../common/constants';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { isUniqueViolation } from '../common/db.types';
import { AppConfigService } from '../config/app-config.service';
import { ReservationRulesService } from '../config/reservation-rules.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toLocalSlots } from '../operating-hours/operating-calendar';
import { OperatingHoursService } from '../operating-hours/operating-hours.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderNotifier } from '../reservations/leader-notifier';
import { ReservationsService } from '../reservations/reservations.service';
import { insertSlots } from '../reservations/slots';
import { buildSlotStarts } from '../reservations/time-rules';
import { closePendingTransfers } from '../transfers/transfer-helpers';
import { ReallocateReservationDto } from './dto/reallocation.dto';
import { buildReallocationNotice } from './reallocation-notice';
import {
  assertFitsCapacity,
  assertReallocationTimes,
  planReallocation,
} from './reallocation-rules';

const roomLabel = (room: { name: string; building: { name: string } }) =>
  `${room.name} (${room.building.name})`;

@Injectable()
export class ReallocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: CatalogLookupService,
    private readonly reservations: ReservationsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly reservationRules: ReservationRulesService,
    private readonly appConfig: AppConfigService,
    private readonly operatingHours: OperatingHoursService,
    private readonly leaderNotifier: LeaderNotifier,
  ) {}

  async reallocate(spoc: CurrentUserData, reservationId: string, dto: ReallocateReservationDto) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        resource: { include: { building: true } },
        user: { select: { fullName: true } },
      },
    });
    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: `No existe la reserva ${reservationId}`,
      });
    }
    if (reservation.reservationType !== 'ROOM') {
      throw new UnprocessableEntityException({
        code: 'ONLY_ROOMS',
        message: 'Solo se reasignan reservas de salas de reuniones',
      });
    }
    if (reservation.status !== Status.CONFIRMED && reservation.status !== Status.PENDING_APPROVAL) {
      throw new UnprocessableEntityException({
        code: 'NOT_REALLOCATABLE',
        message: `No se puede reasignar una reserva en estado ${reservation.status}`,
      });
    }

    const room = await this.lookup.getActiveResource(dto.newResourceId ?? reservation.resourceId, [
      'MEETING_ROOM',
    ]);

    if (!spoc.roles.includes(SUPERADMIN_ROLE)) {
      const ownsOrigin = spoc.spocBuildingIds.includes(reservation.resource.buildingId);
      const ownsTarget = spoc.spocBuildingIds.includes(room.buildingId);
      if (!ownsOrigin || !ownsTarget) {
        throw new ForbiddenException({
          code: 'NOT_YOUR_BUILDING',
          message: 'Solo puedes reasignar salas de los edificios que administras',
        });
      }
    }

    const plan = planReallocation(reservation, {
      resourceId: dto.newResourceId,
      startDateTime: dto.newStartDateTime ? new Date(dto.newStartDateTime) : undefined,
      endDateTime: dto.newEndDateTime ? new Date(dto.newEndDateTime) : undefined,
    });
    if (!plan.changed) {
      throw new BadRequestException({
        code: 'NOTHING_TO_CHANGE',
        message: 'Indica una nueva sala, un nuevo horario o ambos',
      });
    }

    const rules = this.reservationRules.current();
    const { startDateTime: start, endDateTime: end } = plan.next;
    const slotStarts = buildSlotStarts(start, end, rules.slotMinutes);
    const { timeZone } = this.appConfig.server;
    try {
      assertReallocationTimes(reservation, plan.next, new Date(), rules);
      assertFitsCapacity(reservation.attendees, room.capacity);
      await this.operatingHours.assertOpen(room, toLocalSlots(slotStarts, timeZone));
    } catch (error) {
      ReservationsService.toHttpError(error);
    }

    const justification = dto.justification.trim();
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const moved = await tx.reservation.updateMany({
            where: {
              id: reservationId,
              status: reservation.status,
              resourceId: reservation.resourceId,
              startDateTime: reservation.startDateTime,
              endDateTime: reservation.endDateTime,
            },
            data: {
              resourceId: room.id,
              startDateTime: start,
              endDateTime: end,
              ...(start.getTime() !== reservation.startDateTime.getTime()
                ? { reminderSentAt: null }
                : {}),
            },
          });
          if (moved.count === 0) {
            throw new ConflictException({
              code: 'CONCURRENT_CONFLICT',
              message: 'La reserva cambió mientras la reasignabas. Revísala e intenta de nuevo.',
            });
          }
          await tx.reservationSlot.deleteMany({ where: { reservationId } });
          await insertSlots(tx, reservationId, [room.id], slotStarts, rules.slotMinutes);
          await this.notifications.resolveForReservation(
            reservationId,
            ['RESERVATION_REMINDER'],
            tx,
          );
          await closePendingTransfers(tx, this.notifications, reservationId, {
            title: 'La reserva que pediste cambió',
            message:
              'El SPOC de Edificio movió esa reserva a otra sala u horario, así que tu solicitud se cerró.',
          });
          await tx.reallocation.create({
            data: {
              reservationId,
              previousResourceId: reservation.resourceId,
              newResourceId: room.id,
              responsibleUserId: spoc.id,
              previousStartDateTime: reservation.startDateTime,
              previousEndDateTime: reservation.endDateTime,
              newStartDateTime: start,
              newEndDateTime: end,
              justification,
            },
          });
          await this.notifications.notify(
            {
              userId: reservation.userId,
              reservationId,
              type: 'RESERVATION_REALLOCATED',
              title: 'Tu reserva fue reasignada',
              message: buildReallocationNotice({
                previous: {
                  roomLabel: roomLabel(reservation.resource),
                  startDateTime: reservation.startDateTime,
                  endDateTime: reservation.endDateTime,
                },
                next: { roomLabel: roomLabel(room), startDateTime: start, endDateTime: end },
                justification,
                inSeries: reservation.seriesId !== null,
                timeZone,
              }),
            },
            tx,
          );
          if (reservation.status === Status.PENDING_APPROVAL) {
            await this.leaderNotifier.reallocated(tx, {
              requesterId: reservation.userId,
              requesterName: reservation.user.fullName,
              label: roomLabel(room),
              reservationId,
            });
          }
          await this.audit.log(
            {
              userId: spoc.id,
              action: 'RESERVATION_REALLOCATED',
              entity: 'Reservation',
              entityId: reservationId,
              details: {
                ownerId: reservation.userId,
                seriesId: reservation.seriesId,
                status: reservation.status,
                from: {
                  resourceId: reservation.resourceId,
                  buildingId: reservation.resource.buildingId,
                  startDateTime: reservation.startDateTime,
                  endDateTime: reservation.endDateTime,
                },
                to: {
                  resourceId: room.id,
                  buildingId: room.buildingId,
                  startDateTime: start,
                  endDateTime: end,
                },
                justification,
              },
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
          message: 'La sala o el horario nuevos ya están ocupados',
        });
      }
      throw error;
    }

    return this.reservations.getById(reservationId);
  }
}
