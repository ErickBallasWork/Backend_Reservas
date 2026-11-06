import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ReservationSeries } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { CatalogLookupService } from '../../catalog/catalog-lookup.service';
import {
  PRIVILEGED_ROLES,
  RESERVATION_TYPE_BY_RESOURCE,
  ResourceType,
  Status,
} from '../../common/constants';
import { CurrentUserData } from '../../common/current-user/current-user.types';
import { isUniqueViolation } from '../../common/db.types';
import { ReservationRulesService } from '../../config/reservation-rules.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { toLocalSlots } from '../../operating-hours/operating-calendar';
import { OperatingHoursService } from '../../operating-hours/operating-hours.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SanctionsService } from '../../sanctions/sanctions.service';
import { resolveAttendees } from '../attendees-rule';
import { LeaderNotifier } from '../leader-notifier';
import { blockedResourceIds, describeResource } from '../reservation-resources';
import { RESERVATION_INCLUDE, ReservationsService } from '../reservations.service';
import { insertSlots } from '../slots';
import { buildSlotStarts, canCancel, RuleViolation, validateReservationTimes } from '../time-rules';
import {
  CreateReservationSeriesDto,
  ReservationSeriesDto,
  SeriesCancelResponseDto,
  SeriesPreviewResponseDto,
  SkippedOccurrenceDto,
} from './dto/reservation-series.dto';
import { expandWeekly } from './recurrence';

interface Occurrence {
  index: number;
  start: Date;
  end: Date;
}

type ActiveResource = Awaited<ReturnType<CatalogLookupService['getActiveResource']>>;

interface SeriesPlan {
  resource: ActiveResource;
  attendees: number | null;
  blockedIds: string[];
  occurrences: Occurrence[];
}

function toSeriesDto(row: ReservationSeries): ReservationSeriesDto {
  return {
    id: row.id,
    resourceId: row.resourceId,
    intervalWeeks: row.intervalWeeks,
    weekdays: row.weekdays.split(',').map(Number),
    firstStartDateTime: row.firstStartDateTime,
    durationMinutes: row.durationMinutes,
    occurrenceCount: row.occurrenceCount,
    cancelledAt: row.cancelledAt,
  };
}

@Injectable()
export class ReservationSeriesService {
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

  async preview(
    user: CurrentUserData,
    dto: CreateReservationSeriesDto,
  ): Promise<SeriesPreviewResponseDto> {
    const plan = await this.plan(user, dto);
    const occurrences = [];
    for (const occurrence of plan.occurrences) {
      const reason = await this.rejectionOf(plan, occurrence);
      occurrences.push({
        index: occurrence.index,
        startDateTime: occurrence.start.toISOString(),
        endDateTime: occurrence.end.toISOString(),
        available: reason === null,
        reason,
      });
    }
    return { occurrences };
  }

  async create(user: CurrentUserData, dto: CreateReservationSeriesDto) {
    const plan = await this.plan(user, dto);
    const skipped: SkippedOccurrenceDto[] = [];
    const bookable: Occurrence[] = [];
    for (const occurrence of plan.occurrences) {
      const reason = await this.rejectionOf(plan, occurrence);
      if (reason === null) bookable.push(occurrence);
      else skipped.push(this.toSkipped(occurrence, reason));
    }
    if (bookable.length === 0) throw this.emptySeries();

    const first = plan.occurrences[0];
    const series = await this.prisma.reservationSeries.create({
      data: {
        userId: user.id,
        resourceId: plan.resource.id,
        intervalWeeks: dto.recurrence.intervalWeeks,
        weekdays: [...dto.recurrence.weekdays].sort((a, b) => a - b).join(','),
        firstStartDateTime: first.start,
        durationMinutes: (first.end.getTime() - first.start.getTime()) / 60_000,
        occurrenceCount: bookable.length,
      },
    });

    const createdIds: string[] = [];
    for (const occurrence of bookable) {
      const id = await this.createOccurrence(user, dto, plan, series.id, occurrence, createdIds);
      if (id) createdIds.push(id);
      else skipped.push(this.toSkipped(occurrence, 'SLOT_TAKEN'));
    }
    if (createdIds.length === 0) {
      await this.prisma.reservationSeries.delete({ where: { id: series.id } });
      throw this.emptySeries();
    }

    const finalSeries = await this.finish(user, dto, plan, series.id, createdIds.length);
    const created = await Promise.all(createdIds.map((id) => this.reservations.getById(id)));
    return { series: toSeriesDto(finalSeries), created, skipped };
  }

  async get(user: CurrentUserData, id: string) {
    const series = await this.findSeries(id);
    const isPrivileged = user.roles.some((role) => PRIVILEGED_ROLES.includes(role));
    if (series.userId !== user.id && !isPrivileged) {
      throw new ForbiddenException({ code: 'NOT_OWNER', message: 'Esta serie no es tuya' });
    }
    const occurrences = await this.prisma.reservation.findMany({
      where: { seriesId: id },
      include: RESERVATION_INCLUDE,
      orderBy: { startDateTime: 'asc' },
    });
    return { series: toSeriesDto(series), occurrences };
  }

  async cancel(user: CurrentUserData, id: string): Promise<SeriesCancelResponseDto> {
    const series = await this.findSeries(id);
    if (series.userId !== user.id) {
      throw new ForbiddenException({ code: 'NOT_OWNER', message: 'Esta serie no es tuya' });
    }
    if (series.cancelledAt) {
      throw new UnprocessableEntityException({
        code: 'NOT_CANCELLABLE',
        message: 'Esta serie ya fue cancelada',
      });
    }
    const rules = this.reservationRules.current();
    const now = new Date();
    const upcoming = await this.prisma.reservation.findMany({
      where: {
        seriesId: id,
        status: { in: [Status.CONFIRMED, Status.PENDING_APPROVAL] },
        startDateTime: { gt: now },
      },
      select: { id: true, startDateTime: true },
    });
    const cancellableIds = upcoming
      .filter((r) => canCancel(r.startDateTime, now, rules.cancelMinHours))
      .map((r) => r.id);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.reservationSlot.deleteMany({ where: { reservationId: { in: cancellableIds } } });
      await tx.reservation.updateMany({
        where: {
          id: { in: cancellableIds },
          status: { in: [Status.CONFIRMED, Status.PENDING_APPROVAL] },
        },
        data: { status: Status.CANCELLED },
      });
      const row = await tx.reservationSeries.update({
        where: { id },
        data: { cancelledAt: now },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'RESERVATION_SERIES_CANCELLED',
          entity: 'ReservationSeries',
          entityId: id,
          details: {
            cancelled: cancellableIds.length,
            kept: upcoming.length - cancellableIds.length,
          },
        },
        tx,
      );
      return row;
    });
    return {
      series: toSeriesDto(updated),
      cancelled: cancellableIds.length,
      kept: upcoming.length - cancellableIds.length,
    };
  }

  private async plan(user: CurrentUserData, dto: CreateReservationSeriesDto): Promise<SeriesPlan> {
    await this.sanctions.processNoShows({ userId: user.id });
    await this.sanctions.assertNoActiveSanction(user.id);

    const resource = await this.lookup.getActiveResource(dto.resourceId);
    try {
      const attendees = resolveAttendees(
        resource.type as ResourceType,
        dto.attendees,
        resource.capacity,
      );
      const start = new Date(dto.startDateTime);
      const end = new Date(dto.endDateTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new RuleViolation('INVALID_DATE', 'Las fechas no son válidas');
      }
      if (end.getTime() <= start.getTime()) {
        throw new RuleViolation(
          'END_BEFORE_START',
          'La hora de fin debe ser posterior a la de inicio',
        );
      }
      const starts = expandWeekly(start, dto.recurrence, this.operatingHours.timeZone);
      const durationMs = end.getTime() - start.getTime();
      return {
        resource,
        attendees,
        blockedIds: await blockedResourceIds(this.lookup, resource),
        occurrences: starts.map((s, i) => ({
          index: i + 1,
          start: s,
          end: new Date(s.getTime() + durationMs),
        })),
      };
    } catch (error) {
      return ReservationsService.toHttpError(error);
    }
  }

  private async rejectionOf(plan: SeriesPlan, occurrence: Occurrence): Promise<string | null> {
    const rules = this.reservationRules.current();
    try {
      validateReservationTimes(occurrence.start, occurrence.end, new Date(), rules);
      await this.operatingHours.assertOpen(
        plan.resource,
        toLocalSlots(
          buildSlotStarts(occurrence.start, occurrence.end, rules.slotMinutes),
          this.operatingHours.timeZone,
        ),
      );
    } catch (error) {
      if (error instanceof RuleViolation) return error.code;
      throw error;
    }
    const taken = await this.prisma.reservationSlot.count({
      where: {
        resourceId: { in: plan.blockedIds },
        slotStart: { gte: occurrence.start, lt: occurrence.end },
      },
    });
    return taken > 0 ? 'SLOT_TAKEN' : null;
  }

  private async createOccurrence(
    user: CurrentUserData,
    dto: CreateReservationSeriesDto,
    plan: SeriesPlan,
    seriesId: string,
    occurrence: Occurrence,
    alreadyCreated: readonly string[],
  ): Promise<string | null> {
    const rules = this.reservationRules.current();
    const status = dto.purpose === 'TRAINING' ? Status.PENDING_APPROVAL : Status.CONFIRMED;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const row = await tx.reservation.create({
            data: {
              userId: user.id,
              resourceId: plan.resource.id,
              reservationType: RESERVATION_TYPE_BY_RESOURCE[plan.resource.type as ResourceType],
              purpose: dto.purpose,
              justification: dto.justification,
              attendees: plan.attendees,
              startDateTime: occurrence.start,
              endDateTime: occurrence.end,
              status,
              seriesId,
              occurrenceIndex: alreadyCreated.length + 1,
            },
          });
          await insertSlots(
            tx,
            row.id,
            plan.blockedIds,
            buildSlotStarts(occurrence.start, occurrence.end, rules.slotMinutes),
            rules.slotMinutes,
          );
          await this.audit.log(
            {
              userId: user.id,
              action: 'RESERVATION_CREATED',
              entity: 'Reservation',
              entityId: row.id,
              details: { seriesId, index: row.occurrenceIndex, status },
            },
            tx,
          );
          return row.id;
        },
        { timeout: 20_000 },
      );
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  private async finish(
    user: CurrentUserData,
    dto: CreateReservationSeriesDto,
    plan: SeriesPlan,
    seriesId: string,
    createdCount: number,
  ) {
    const label = describeResource(plan.resource);
    const pending = dto.purpose === 'TRAINING';
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.reservationSeries.update({
        where: { id: seriesId },
        data: { occurrenceCount: createdCount },
      });
      await this.notifications.notify(
        {
          userId: user.id,
          type: pending ? 'RESERVATION_PENDING' : 'RESERVATION_CONFIRMED',
          title: pending ? 'Serie pendiente de aprobación' : 'Serie de reservas confirmada',
          message: pending
            ? `Tus ${createdCount} reservas de ${label} esperan la aprobación del Líder de Conocimiento.`
            : `Se crearon ${createdCount} reservas de ${label}.`,
        },
        tx,
      );
      if (pending) {
        await this.leaderNotifier.requestApproval(tx, {
          requesterId: user.id,
          requesterName: user.fullName,
          label,
          count: createdCount,
        });
      }
      await this.audit.log(
        {
          userId: user.id,
          action: 'RESERVATION_SERIES_CREATED',
          entity: 'ReservationSeries',
          entityId: seriesId,
          details: { ...dto, created: createdCount },
        },
        tx,
      );
      return row;
    });
  }

  private async findSeries(id: string) {
    const series = await this.prisma.reservationSeries.findUnique({ where: { id } });
    if (!series) {
      throw new NotFoundException({
        code: 'SERIES_NOT_FOUND',
        message: `No existe la serie ${id}`,
      });
    }
    return series;
  }

  private toSkipped(occurrence: Occurrence, reason: string): SkippedOccurrenceDto {
    return {
      startDateTime: occurrence.start.toISOString(),
      endDateTime: occurrence.end.toISOString(),
      reason,
    };
  }

  private emptySeries() {
    return new ConflictException({
      code: 'SERIES_EMPTY',
      message: 'Ninguna fecha de la serie está disponible. Revisa la vista previa.',
    });
  }
}
