import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CatalogLookupService } from '../catalog/catalog-lookup.service';
import { ReservationRulesService } from '../config/reservation-rules.service';
import {
  findClosedSlot,
  toLocalSlots,
  toOpenWindows,
  type OperatingCalendar,
} from '../operating-hours/operating-calendar';
import { OperatingHoursService } from '../operating-hours/operating-hours.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildSlotStarts, chunk } from '../reservations/time-rules';
import { RangeQueryDto, SearchAvailabilityQueryDto } from './dto/availability.dto';

const MAX_RANGE_DAYS = 14;

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservationRules: ReservationRulesService,
    private readonly lookup: CatalogLookupService,
    private readonly operatingHours: OperatingHoursService,
  ) {}

  private parseRange(query: RangeQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_RANGE',
        message: '"to" debe ser posterior a "from"',
      });
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 3_600_000) {
      throw new BadRequestException({
        code: 'RANGE_TOO_LONG',
        message: `El rango no puede superar ${MAX_RANGE_DAYS} días`,
      });
    }
    return { from, to };
  }

  private async busyByResource(resourceIds: string[], from: Date, to: Date) {
    const busy = new Map<string, string[]>();
    for (const id of resourceIds) busy.set(id, []);
    // Chunked to stay under the SQL Server 2100 parameter limit.
    for (const ids of chunk(resourceIds, 500)) {
      const slots = await this.prisma.reservationSlot.findMany({
        where: { resourceId: { in: ids }, slotStart: { gte: from, lt: to } },
        select: { resourceId: true, slotStart: true },
        orderBy: { slotStart: 'asc' },
      });
      for (const slot of slots) busy.get(slot.resourceId)?.push(slot.slotStart.toISOString());
    }
    return busy;
  }

  private rangeSlots(from: Date, to: Date) {
    const slotMinutes = this.reservationRules.current().slotMinutes;
    return {
      slotMinutes,
      slots: toLocalSlots(buildSlotStarts(from, to, slotMinutes), this.operatingHours.timeZone),
    };
  }

  async resource(resourceId: string, query: RangeQueryDto) {
    const { from, to } = this.parseRange(query);
    await this.lookup.getActiveResource(resourceId);
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      include: { children: { where: { isActive: true }, orderBy: { name: 'asc' } } },
    });
    if (!resource) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `No existe el recurso ${resourceId}`,
      });
    }
    const busy = await this.busyByResource(
      [resource.id, ...resource.children.map((c) => c.id)],
      from,
      to,
    );
    const { slotMinutes, slots } = this.rangeSlots(from, to);
    const book = await this.operatingHours.loadBook();
    const windowsOf = (calendar: OperatingCalendar) =>
      toOpenWindows(slots, slotMinutes, calendar).map((w) => ({
        start: w.start.toISOString(),
        end: w.end.toISOString(),
      }));
    return {
      resourceId: resource.id,
      name: resource.name,
      type: resource.type,
      slotMinutes,
      from: from.toISOString(),
      to: to.toISOString(),
      busySlots: busy.get(resource.id) ?? [],
      openWindows: windowsOf(book.calendarFor(resource)),
      laptops: resource.children.map((l) => ({
        id: l.id,
        name: l.name,
        busySlots: busy.get(l.id) ?? [],
        openWindows: windowsOf(book.calendarFor(l)),
      })),
    };
  }

  async search(query: SearchAvailabilityQueryDto) {
    const { from, to } = this.parseRange(query);
    const where: Prisma.ResourceWhereInput = {
      isActive: true,
      parentResourceId: null,
      building: { isActive: true },
      type: query.type ? query.type : { in: ['MEETING_ROOM', 'AI_LAB'] },
      ...(query.buildingId ? { buildingId: query.buildingId } : {}),
      ...(query.minCapacity ? { capacity: { gte: query.minCapacity } } : {}),
    };
    const resources = await this.prisma.resource.findMany({
      where,
      include: {
        building: { select: { id: true, name: true } },
        children: { where: { isActive: true }, select: { id: true } },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    const ids = resources.flatMap((r) => [r.id, ...r.children.map((c) => c.id)]);
    const busy =
      ids.length > 0 ? await this.busyByResource(ids, from, to) : new Map<string, string[]>();
    const isFree = (id: string) => (busy.get(id) ?? []).length === 0;
    const { slotMinutes, slots } = this.rangeSlots(from, to);
    const book = await this.operatingHours.loadBook();
    const isOpen = (resource: { id: string; parentResourceId: string | null }) =>
      findClosedSlot(slots, slotMinutes, book.calendarFor(resource)) === null;

    return resources.map((r) => {
      const freeLaptops = r.children.filter((c) => isFree(c.id)).length;
      const open = isOpen(r);
      return {
        id: r.id,
        name: r.name,
        type: r.type,
        capacity: r.capacity,
        equipment: r.equipment,
        building: r.building,
        open,
        free:
          open &&
          (r.type === 'AI_LAB' ? isFree(r.id) && freeLaptops === r.children.length : isFree(r.id)),
        ...(r.type === 'AI_LAB' ? { totalLaptops: r.children.length, freeLaptops } : {}),
      };
    });
  }
}
