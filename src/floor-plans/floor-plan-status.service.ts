import { BadRequestException, Injectable } from '@nestjs/common';
import { BusySlotsReader } from '../availability/busy-slots.reader';
import { BLOCKING_STATUSES } from '../common/constants';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { ReservationRulesService } from '../config/reservation-rules.service';
import { findClosedSlot, toLocalSlots } from '../operating-hours/operating-calendar';
import { OperatingHoursService } from '../operating-hours/operating-hours.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildSlotStarts } from '../reservations/time-rules';
import { FloorPlanStatusQueryDto } from './dto/floor-plan.dto';
import { FloorPlanStatusDto } from './dto/floor-plan-response.dto';
import { computeFloorStatus, statusResourceIds, type StatusZone } from './floor-plan-status';
import { type ZoneWithResource } from './floor-plan.mapper';
import { FloorPlansService } from './floor-plans.service';

const HOUR = 3_600_000;

function toStatusZone(zone: ZoneWithResource): StatusZone {
  const { resource } = zone;
  return {
    id: zone.id,
    isReservable: zone.isReservable,
    resource: resource
      ? {
          id: resource.id,
          type: resource.type,
          capacity: resource.capacity,
          isActive: resource.isActive,
          laptopIds: resource.type === 'AI_LAB' ? resource.children.map((laptop) => laptop.id) : [],
        }
      : null,
  };
}

@Injectable()
export class FloorPlanStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly floorPlans: FloorPlansService,
    private readonly busySlots: BusySlotsReader,
    private readonly operatingHours: OperatingHoursService,
    private readonly reservationRules: ReservationRulesService,
  ) {}

  async status(
    actor: CurrentUserData,
    id: string,
    query: FloorPlanStatusQueryDto,
  ): Promise<FloorPlanStatusDto> {
    const { from, to } = this.parseRange(query);
    const plan = await this.floorPlans.findVisible(actor, id);
    const zones = plan.zones.map(toStatusZone);
    const resourceIds = statusResourceIds(zones);
    const { slotMinutes } = this.reservationRules.current();
    const step = slotMinutes * 60_000;
    const slotFrom = new Date(Math.floor(from.getTime() / step) * step);

    const [busy, mine, book] = await Promise.all([
      this.busySlots.byResource(resourceIds, slotFrom, to),
      this.prisma.reservation.findMany({
        where: {
          userId: actor.id,
          resourceId: { in: resourceIds },
          status: { in: BLOCKING_STATUSES },
          startDateTime: { lt: to },
          endDateTime: { gt: from },
        },
        select: { resourceId: true },
      }),
      this.operatingHours.loadBook(),
    ]);

    const slots = toLocalSlots(
      buildSlotStarts(slotFrom, to, slotMinutes),
      this.operatingHours.timeZone,
    );
    const closedResourceIds = new Set(
      zones.flatMap((zone) => {
        if (!zone.resource) return [];
        const calendar = book.calendarFor({ id: zone.resource.id, parentResourceId: null });
        return findClosedSlot(slots, slotMinutes, calendar) ? [zone.resource.id] : [];
      }),
    );

    const status = computeFloorStatus({
      zones,
      busyResourceIds: new Set(
        [...busy].flatMap(([resourceId, starts]) => (starts.length ? [resourceId] : [])),
      ),
      mineResourceIds: new Set(mine.map((reservation) => reservation.resourceId)),
      closedResourceIds,
      filter: { type: query.type, minCapacity: query.minCapacity },
    });
    return { floorPlanId: plan.id, from: from.toISOString(), to: to.toISOString(), ...status };
  }

  private parseRange(query: FloorPlanStatusQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    const maxHours = this.reservationRules.current().maxDurationHours;
    const span = to.getTime() - from.getTime();
    if (!(span > 0) || span > maxHours * HOUR) {
      throw new BadRequestException({
        code: 'FLOOR_PLAN_RANGE_INVALID',
        message: `El rango debe terminar después de empezar y durar como máximo ${maxHours} horas`,
      });
    }
    return { from, to };
  }
}
