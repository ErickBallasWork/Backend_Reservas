import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PURPOSES, RESERVATION_STATUSES } from '../common/constants';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { toSkipTake } from '../common/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalRoutingService } from '../reservations/approval-routing.service';
import { APPROVALS_INCLUDE, RESERVATION_INCLUDE } from '../reservations/reservations.service';
import { DashboardQueryDto, MetricsQueryDto } from './dto/dashboard.dto';

export const DASHBOARD_VIEWED = 'DASHBOARD_VIEWED';

export function rangeAndBuildingWhere(query: MetricsQueryDto): Prisma.ReservationWhereInput {
  return {
    ...(query.from || query.to
      ? {
          startDateTime: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lt: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(query.buildingId ? { resource: { buildingId: query.buildingId } } : {}),
  };
}

export function countBy(keys: readonly string[], rows: { key: string; count: number }[]) {
  const result: Record<string, number> = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const row of rows) result[row.key] = (result[row.key] ?? 0) + row.count;
  return result;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: ApprovalRoutingService,
    private readonly audit: AuditService,
  ) {}

  async reservations(viewer: CurrentUserData, query: DashboardQueryDto) {
    const where: Prisma.ReservationWhereInput = {
      AND: [
        this.routing.managedOwnersFilter(viewer),
        rangeAndBuildingWhere(query),
        {
          ...(query.status ? { status: query.status } : {}),
          ...(query.purpose ? { purpose: query.purpose } : {}),
          ...(query.userId ? { userId: query.userId } : {}),
          ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        },
      ],
    };
    const [items, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        include: { ...RESERVATION_INCLUDE, approvals: APPROVALS_INCLUDE },
        orderBy: { startDateTime: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.reservation.count({ where }),
    ]);
    if (query.refresh !== 'true') {
      await this.audit.log({
        userId: viewer.id,
        action: DASHBOARD_VIEWED,
        entity: 'Reservation',
        details: {
          from: query.from,
          to: query.to,
          buildingId: query.buildingId,
          status: query.status,
          purpose: query.purpose,
          userId: query.userId,
          resourceId: query.resourceId,
          page: query.page,
        },
      });
    }
    return { total, page: query.page, pageSize: query.pageSize, items };
  }

  async metrics(viewer: CurrentUserData, query: MetricsQueryDto) {
    const where: Prisma.ReservationWhereInput = {
      AND: [this.routing.managedOwnersFilter(viewer), rangeAndBuildingWhere(query)],
    };
    const [byStatusRows, byPurposeRows, byTypeRows, total] = await Promise.all([
      this.prisma.reservation.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.reservation.groupBy({ by: ['purpose'], where, _count: { _all: true } }),
      this.prisma.reservation.groupBy({ by: ['reservationType'], where, _count: { _all: true } }),
      this.prisma.reservation.count({ where }),
    ]);

    const byStatus = countBy(
      RESERVATION_STATUSES,
      byStatusRows.map((row) => ({ key: row.status, count: row._count._all })),
    );
    const byPurpose = countBy(
      PURPOSES,
      byPurposeRows.map((row) => ({ key: row.purpose, count: row._count._all })),
    );
    const byReservationType = countBy(
      ['ROOM', 'FULL_LAB', 'LAPTOP'],
      byTypeRows.map((row) => ({ key: row.reservationType, count: row._count._all })),
    );

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
