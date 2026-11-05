import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PURPOSES, RESERVATION_STATUSES } from '../common/constants';
import { toSkipTake } from '../common/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RESERVATION_INCLUDE } from '../reservations/reservations.service';
import { DashboardQueryDto, MetricsQueryDto } from './dto/dashboard.dto';

// Filtros comunes: rango de fechas (por inicio) y edificio.
function baseWhere(query: MetricsQueryDto): Prisma.ReservationWhereInput {
  const range =
    query.from || query.to
      ? {
          startDateTime: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lt: new Date(query.to) } : {}),
          },
        }
      : {};
  return {
    ...range,
    ...(query.buildingId ? { resource: { buildingId: query.buildingId } } : {}),
  };
}

function countBy<T extends string>(keys: readonly T[], rows: { key: string; count: number }[]) {
  const result: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const row of rows) result[row.key] = (result[row.key] ?? 0) + row.count;
  return result;
}

/**
 * HU-16: panel del SPOC Administrativo y del Líder de Conocimiento.
 * Pendiente: cuando se defina "asociados a su cargo", el Líder verá solo a esos usuarios.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async reservations(query: DashboardQueryDto) {
    const where: Prisma.ReservationWhereInput = {
      ...baseWhere(query),
      ...(query.status ? { status: query.status } : {}),
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
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

  async metrics(query: MetricsQueryDto) {
    const where = baseWhere(query);
    const [byStatusRows, byPurposeRows, byTypeRows, total] = await Promise.all([
      this.prisma.reservation.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.reservation.groupBy({ by: ['purpose'], where, _count: { _all: true } }),
      this.prisma.reservation.groupBy({ by: ['reservationType'], where, _count: { _all: true } }),
      this.prisma.reservation.count({ where }),
    ]);

    const byStatus = countBy(
      RESERVATION_STATUSES,
      byStatusRows.map((r) => ({ key: r.status, count: r._count._all })),
    );
    const byPurpose = countBy(
      PURPOSES,
      byPurposeRows.map((r) => ({ key: r.purpose, count: r._count._all })),
    );
    const byReservationType = countBy(
      ['ROOM', 'FULL_LAB', 'LAPTOP'],
      byTypeRows.map((r) => ({ key: r.reservationType, count: r._count._all })),
    );

    // Inasistencia sobre las reservas que ya debían usarse (con check-in o No-Show).
    const finished = byStatus.CHECKED_IN + byStatus.NO_SHOW;
    return {
      total,
      byStatus,
      byPurpose,
      byReservationType,
      noShowRate: finished > 0 ? Number((byStatus.NO_SHOW / finished).toFixed(4)) : 0,
    };
  }
}
