import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BLOCKING_STATUSES, Status } from '../common/constants';
import { reservationRules } from '../config/reservation-rules';
import { PrismaService } from '../prisma/prisma.service';
import { chunk } from '../reservations/time-rules';
import { RangeQueryDto, SearchAvailabilityQueryDto } from './dto/availability.dto';

const MAX_RANGE_DAYS = 14;

// Una reserva que ocupa parte del rango consultado
export interface ReservationBlock {
  reservationId: string;
  startDateTime: string;
  endDateTime: string;
  // Es mía
  mine: boolean;
  // Se puede pedir en cesión: es de otra persona, está confirmada y no ha empezado
  transferable: boolean;
}

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
  async resource(resourceId: string, query: RangeQueryDto, userId: string) {
    const { from, to } = this.parseRange(query);
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      include: { children: { where: { isActive: true }, orderBy: { name: 'asc' } } },
    });
    if (!resource) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: `No existe el recurso ${resourceId}` });
    }
    const ids = [resource.id, ...resource.children.map((c) => c.id)];
    const busy = await this.busyByResource(ids, from, to);
    const blocks = await this.reservationsByResource(ids, from, to, userId);
    return {
      resourceId: resource.id,
      name: resource.name,
      type: resource.type,
      slotMinutes: reservationRules().slotMinutes,
      from: from.toISOString(),
      to: to.toISOString(),
      busySlots: busy.get(resource.id) ?? [],
      // Qué reserva ocupa cada tramo, para poder pedirla en cesión (sin datos de su dueño)
      reservations: blocks.get(resource.id) ?? [],
      laptops: resource.children.map((l) => ({
        id: l.id,
        name: l.name,
        busySlots: busy.get(l.id) ?? [],
        reservations: blocks.get(l.id) ?? [],
      })),
    };
  }
  /**
   * Reservas que ocupan el rango, por recurso. No incluye quién es el dueño (privacidad):
   * solo si es mía y si se puede pedir en cesión. Una laptop ocupada porque reservaron el
   * laboratorio completo no tiene reserva propia: esa reserva aparece en el laboratorio.
   */
  private async reservationsByResource(resourceIds: string[], from: Date, to: Date, userId: string) {
    const result = new Map<string, ReservationBlock[]>();
    const now = Date.now();
    for (const ids of chunk(resourceIds, 500)) {
      const rows = await this.prisma.reservation.findMany({
        where: {
          resourceId: { in: ids },
          status: { in: BLOCKING_STATUSES },
          startDateTime: { lt: to },
          endDateTime: { gt: from },
        },
        select: { id: true, resourceId: true, userId: true, status: true, startDateTime: true, endDateTime: true },
        orderBy: { startDateTime: 'asc' },
      });
      for (const r of rows) {
        const list = result.get(r.resourceId) ?? [];
        list.push({
          reservationId: r.id,
          startDateTime: r.startDateTime.toISOString(),
          endDateTime: r.endDateTime.toISOString(),
          mine: r.userId === userId,
          transferable: r.userId !== userId && r.status === Status.CONFIRMED && r.startDateTime.getTime() > now,
        });
        result.set(r.resourceId, list);
      }
    }
    return result;
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
