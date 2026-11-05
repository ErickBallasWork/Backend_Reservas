import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { reservationRules } from '../config/reservation-rules';
import { PrismaService } from '../prisma/prisma.service';
import { chunk } from '../reservations/time-rules';
import { RangeQueryDto, SearchAvailabilityQueryDto } from './dto/availability.dto';

const MAX_RANGE_DAYS = 14;

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  private parseRange(query: RangeQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException({ code: 'INVALID_RANGE', message: '"to" debe ser posterior a "from"' });
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 3_600_000) {
      throw new BadRequestException({
        code: 'RANGE_TOO_LONG',
        message: `El rango no puede superar ${MAX_RANGE_DAYS} días`,
      });
    }
    return { from, to };
  }

  /** Franjas ocupadas de cada recurso en el rango (inicio de cada franja en ISO). */
  private async busyByResource(resourceIds: string[], from: Date, to: Date) {
    const busy = new Map<string, string[]>();
    for (const id of resourceIds) busy.set(id, []);
    // De a 500 ids para no pasar el límite de parámetros de SQL Server.
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

  /**
   * HU-06: detalle de un recurso. Devuelve sus franjas ocupadas y, si es laboratorio, las de cada
   * laptop. Si el laboratorio tiene una franja ocupada, está reservado completo y sus laptops se
   * muestran bloqueadas en esa franja.
   */
  async resource(resourceId: string, query: RangeQueryDto) {
    const { from, to } = this.parseRange(query);
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      include: { children: { where: { isActive: true }, orderBy: { name: 'asc' } } },
    });
    if (!resource) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: `No existe el recurso ${resourceId}` });
    }
    const busy = await this.busyByResource([resource.id, ...resource.children.map((c) => c.id)], from, to);
    return {
      resourceId: resource.id,
      name: resource.name,
      type: resource.type,
      slotMinutes: reservationRules().slotMinutes,
      from: from.toISOString(),
      to: to.toISOString(),
      busySlots: busy.get(resource.id) ?? [],
      laptops: resource.children.map((l) => ({
        id: l.id,
        name: l.name,
        busySlots: busy.get(l.id) ?? [],
      })),
    };
  }

  /** HU-06: salas y laboratorios libres en todo el rango (filtros: edificio, tipo, capacidad). */
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
    const busy = ids.length > 0 ? await this.busyByResource(ids, from, to) : new Map<string, string[]>();
    const isFree = (id: string) => (busy.get(id) ?? []).length === 0;

    return resources.map((r) => {
      const freeLaptops = r.children.filter((c) => isFree(c.id)).length;
      return {
        id: r.id,
        name: r.name,
        type: r.type,
        capacity: r.capacity,
        equipment: r.equipment,
        building: r.building,
        // Sala: libre si nadie la reservó. Laboratorio: libre completo si él y todas sus laptops lo están.
        free: r.type === 'AI_LAB' ? isFree(r.id) && freeLaptops === r.children.length : isFree(r.id),
        ...(r.type === 'AI_LAB' ? { totalLaptops: r.children.length, freeLaptops } : {}),
      };
    });
  }
}
