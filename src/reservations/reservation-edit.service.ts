import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CatalogLookupService } from '../catalog/catalog-lookup.service';
import { RESERVATION_TYPE_BY_RESOURCE, ResourceType, Status } from '../common/constants';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { isUniqueViolation } from '../common/db.types';
import { ReservationRulesService } from '../config/reservation-rules.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toLocalSlots } from '../operating-hours/operating-calendar';
import { OperatingHoursService } from '../operating-hours/operating-hours.service';
import { PrismaService } from '../prisma/prisma.service';
import { SanctionsService } from '../sanctions/sanctions.service';
import { resolveAttendees } from './attendees-rule';
import { UpdateReservationDto } from './dto/reservation.dto';
import { LeaderNotifier } from './leader-notifier';
import { assertEditable, planEdit, statusAfterEdit } from './reservation-edit-rules';
import { blockedResourceIds, describeResource } from './reservation-resources';
import { ReservationsService } from './reservations.service';
import { insertSlots } from './slots';
import { buildSlotStarts } from './time-rules';

@Injectable()
export class ReservationEditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: CatalogLookupService,
    private readonly sanctions: SanctionsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly reservationRules: ReservationRulesService,
    private readonly operatingHours: OperatingHoursService,
    private readonly leaderNotifier: LeaderNotifier,
    private readonly reservations: ReservationsService,
  ) {}

  async update(user: CurrentUserData, id: string, dto: UpdateReservationDto) {
    const rules = this.reservationRules.current();
    await this.sanctions.processNoShows({ userId: user.id });
    await this.sanctions.assertNoActiveSanction(user.id);

    const current = await this.reservations.getOwned(user.id, id);
    const resource = await this.lookup.getActiveResource(dto.resourceId ?? current.resourceId);

    try {
      const attendees = resolveAttendees(
        resource.type as ResourceType,
        dto.attendees ?? current.attendees ?? undefined,
        resource.capacity,
      );
      const plan = planEdit(current, {
        resourceId: dto.resourceId,
        startDateTime: dto.startDateTime ? new Date(dto.startDateTime) : undefined,
        endDateTime: dto.endDateTime ? new Date(dto.endDateTime) : undefined,
        purpose: dto.purpose,
        justification: dto.justification,
        attendees,
      });
      if (!plan.changed) {
        throw new BadRequestException({
          code: 'NOTHING_TO_CHANGE',
          message: 'No hay cambios que guardar',
        });
      }
      assertEditable(current, plan, new Date(), rules);

      const slotStarts = buildSlotStarts(
        plan.next.startDateTime,
        plan.next.endDateTime,
        rules.slotMinutes,
      );
      if (plan.slotChanged) {
        await this.operatingHours.assertOpen(
          resource,
          toLocalSlots(slotStarts, this.operatingHours.timeZone),
        );
      }
      const status = statusAfterEdit(current, plan.next, plan.slotChanged);
      const blockedIds = plan.slotChanged ? await blockedResourceIds(this.lookup, resource) : [];
      await this.apply({ user, current, resource, plan, status, slotStarts, blockedIds });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'SLOT_TAKEN',
          message: 'El horario ya está ocupado para ese recurso. Elige otra franja u otro recurso.',
        });
      }
      ReservationsService.toHttpError(error);
    }
    return this.reservations.getById(id);
  }

  private async apply(input: {
    user: CurrentUserData;
    current: Awaited<ReturnType<ReservationsService['getOwned']>>;
    resource: Awaited<ReturnType<CatalogLookupService['getActiveResource']>>;
    plan: ReturnType<typeof planEdit>;
    status: string;
    slotStarts: Date[];
    blockedIds: string[];
  }) {
    const { user, current, resource, plan, status, slotStarts, blockedIds } = input;
    const label = describeResource(resource);
    const slotMinutes = this.reservationRules.current().slotMinutes;

    await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.reservation.updateMany({
          where: { id: current.id, status: current.status },
          data: {
            resourceId: plan.next.resourceId,
            reservationType: RESERVATION_TYPE_BY_RESOURCE[resource.type as ResourceType],
            purpose: plan.next.purpose,
            justification: plan.next.justification,
            attendees: plan.next.attendees,
            startDateTime: plan.next.startDateTime,
            endDateTime: plan.next.endDateTime,
            status,
          },
        });
        if (updated.count === 0) {
          throw new ConflictException({
            code: 'CONCURRENT_CONFLICT',
            message: 'La reserva cambió mientras la editabas. Revísala e intenta de nuevo.',
          });
        }
        if (plan.slotChanged) {
          await tx.reservationSlot.deleteMany({ where: { reservationId: current.id } });
          await insertSlots(tx, current.id, blockedIds, slotStarts, slotMinutes);
        }

        const goesToApproval = status === Status.PENDING_APPROVAL && current.status !== status;
        await this.notifications.notify(
          {
            userId: current.userId,
            type: goesToApproval ? 'RESERVATION_PENDING' : 'RESERVATION_UPDATED',
            title: goesToApproval ? 'Reserva pendiente de aprobación' : 'Reserva actualizada',
            message: goesToApproval
              ? `Tu reserva de ${label} espera la aprobación del Líder de Conocimiento.`
              : `Tu reserva de ${label} se actualizó.`,
          },
          tx,
        );
        if (goesToApproval) {
          await this.leaderNotifier.requestApproval(tx, user.fullName, label);
        }
        await this.audit.log(
          {
            userId: user.id,
            action: 'RESERVATION_UPDATED',
            entity: 'Reservation',
            entityId: current.id,
            details: {
              before: {
                resourceId: current.resourceId,
                startDateTime: current.startDateTime,
                endDateTime: current.endDateTime,
                purpose: current.purpose,
                justification: current.justification,
                attendees: current.attendees,
                status: current.status,
              },
              after: { ...plan.next, status },
              blockedResources: blockedIds.length,
            },
          },
          tx,
        );
      },
      { timeout: 20_000 },
    );
  }
}
