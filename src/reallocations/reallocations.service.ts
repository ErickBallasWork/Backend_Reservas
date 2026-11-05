import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CatalogLookupService } from '../catalog/catalog-lookup.service';
import { Status } from '../common/constants';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { isUniqueViolation } from '../common/db.types';
import { formatDate } from '../common/format';
import { reservationRules } from '../config/reservation-rules';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from '../reservations/reservations.service';
import { insertSlots } from '../reservations/slots';
import { buildSlotStarts, validateReservationTimes } from '../reservations/time-rules';
import { ReallocateReservationDto } from './dto/reallocation.dto';

@Injectable()
export class ReallocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: CatalogLookupService,
    private readonly reservations: ReservationsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * HU-17 y HU-18: el SPOC de Edificio mueve una reserva de sala (a otra sala y/o a otro horario)
   * por un evento con cliente. Valida choques con las mismas franjas y avisa al asociado.
   * Solo el SPOC del edificio de la sala (o un ADMIN) puede hacerlo.
   */
  async reallocate(spoc: CurrentUserData, reservationId: string, dto: ReallocateReservationDto) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { resource: true },
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
    if (!dto.newResourceId && !dto.newStartDateTime && !dto.newEndDateTime) {
      throw new BadRequestException({
        code: 'NOTHING_TO_CHANGE',
        message: 'Indica una nueva sala, un nuevo horario o ambos',
      });
    }

    const room = await this.lookup.getActiveResource(dto.newResourceId ?? reservation.resourceId, [
      'MEETING_ROOM',
    ]);

    // El SPOC solo maneja las salas de sus edificios (la de origen y la de destino).
    if (!spoc.roles.includes('ADMIN')) {
      const ownsOrigin = spoc.spocBuildingIds.includes(reservation.resource.buildingId);
      const ownsTarget = spoc.spocBuildingIds.includes(room.buildingId);
      if (!ownsOrigin || !ownsTarget) {
        throw new ForbiddenException({
          code: 'NOT_YOUR_BUILDING',
          message: 'Solo puedes reasignar salas de los edificios que administras',
        });
      }
    }

    const start = dto.newStartDateTime ? new Date(dto.newStartDateTime) : reservation.startDateTime;
    const end = dto.newEndDateTime ? new Date(dto.newEndDateTime) : reservation.endDateTime;
    const rules = reservationRules();
    try {
      // El SPOC no está sujeto a la anticipación mínima, pero sí a franjas, futuro y duración máxima.
      validateReservationTimes(start, end, new Date(), { ...rules, minAdvanceHours: 0 });
    } catch (error) {
      ReservationsService.toHttpError(error);
    }

    const justification = dto.justification.trim();
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.reservationSlot.deleteMany({ where: { reservationId } });
          await tx.reservation.update({
            where: { id: reservationId },
            data: { resourceId: room.id, startDateTime: start, endDateTime: end },
          });
          await insertSlots(
            tx,
            reservationId,
            [room.id],
            buildSlotStarts(start, end, rules.slotMinutes),
            rules.slotMinutes,
          );
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
              type: 'RESERVATION_REALLOCATED',
              title: 'Tu reserva fue reasignada',
              message: `Tu reserva de ${reservation.resource.name} se movió a ${room.name} (del ${formatDate(start)} al ${formatDate(end)}). Motivo: ${justification}`,
            },
            tx,
          );
          await this.audit.log(
            {
              userId: spoc.id,
              action: 'RESERVATION_REALLOCATED',
              entity: 'Reservation',
              entityId: reservationId,
              details: {
                from: {
                  resourceId: reservation.resourceId,
                  startDateTime: reservation.startDateTime,
                  endDateTime: reservation.endDateTime,
                },
                to: { resourceId: room.id, startDateTime: start, endDateTime: end },
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

    return this.reservations.get(reservationId);
  }
}
