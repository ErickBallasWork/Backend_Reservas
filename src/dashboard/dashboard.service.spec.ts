import { type Prisma } from '@prisma/client';
import { type AuditEntry, type AuditService } from '../audit/audit.service';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { type PrismaService } from '../prisma/prisma.service';
import { type ApprovalRoutingService } from '../reservations/approval-routing.service';
import {
  countBy,
  DASHBOARD_VIEWED,
  DashboardService,
  rangeAndBuildingWhere,
} from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard.dto';

const leader: CurrentUserData = {
  id: 'leader',
  email: 'leader@tcs.com',
  fullName: 'Leader',
  roles: ['LIDER'],
  spocBuildingIds: [],
};

function query(overrides: Partial<DashboardQueryDto> = {}): DashboardQueryDto {
  return Object.assign(new DashboardQueryDto(), overrides);
}

function build() {
  const scope = { user: { managers: { some: { managerId: 'leader' } } } };
  const prisma = {
    reservation: {
      findMany: jest
        .fn<Promise<unknown[]>, [Prisma.ReservationFindManyArgs]>()
        .mockResolvedValue([]),
      count: jest.fn<Promise<number>, [Prisma.ReservationCountArgs]>().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
  const routing = { managedOwnersFilter: jest.fn().mockReturnValue(scope) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new DashboardService(
    prisma as unknown as PrismaService,
    routing as unknown as ApprovalRoutingService,
    audit as unknown as AuditService,
  );
  return { service, prisma, routing, audit, scope };
}

describe('DashboardService.reservations', () => {
  it('applies the viewer scope even when another user is requested', async () => {
    const { service, prisma, scope } = build();
    await service.reservations(leader, query({ userId: 'someone-else' }));
    const { where } = prisma.reservation.findMany.mock.calls[0][0];
    expect(where?.AND).toContainEqual(scope);
    expect(where?.AND).toContainEqual({ userId: 'someone-else' });
  });

  it('writes an audit entry for a manual query', async () => {
    const { service, audit } = build();
    await service.reservations(leader, query({ status: 'PENDING_APPROVAL' }));
    expect(audit.log).toHaveBeenCalledTimes(1);
    const [entry] = audit.log.mock.calls[0] as [AuditEntry];
    expect(entry).toMatchObject({ userId: 'leader', action: DASHBOARD_VIEWED });
    expect(entry.details).toMatchObject({ status: 'PENDING_APPROVAL' });
  });

  it('does not audit automatic refreshes', async () => {
    const { service, audit } = build();
    await service.reservations(leader, query({ refresh: 'true' }));
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('DashboardService.metrics', () => {
  it('counts only the scoped reservations', async () => {
    const { service, prisma, scope } = build();
    await service.metrics(leader, {});
    expect(prisma.reservation.count.mock.calls[0][0].where?.AND).toContainEqual(scope);
  });

  it('computes the no-show rate over finished reservations', async () => {
    const { service, prisma } = build();
    prisma.reservation.groupBy
      .mockResolvedValueOnce([
        { status: 'CHECKED_IN', _count: { _all: 3 } },
        { status: 'NO_SHOW', _count: { _all: 1 } },
      ])
      .mockResolvedValue([]);
    const metrics = await service.metrics(leader, {});
    expect(metrics.noShowRate).toBe(0.25);
    expect(metrics.byStatus.CONFIRMED).toBe(0);
  });

  it('returns zero when nothing has finished', async () => {
    const { service } = build();
    expect((await service.metrics(leader, {})).noShowRate).toBe(0);
  });
});

describe('rangeAndBuildingWhere', () => {
  it('builds an exclusive end', () => {
    expect(rangeAndBuildingWhere({ from: '2026-11-01', to: '2026-12-01' })).toEqual({
      startDateTime: { gte: new Date('2026-11-01'), lt: new Date('2026-12-01') },
    });
  });

  it('is empty without filters', () => {
    expect(rangeAndBuildingWhere({})).toEqual({});
  });
});

describe('countBy', () => {
  it('fills missing keys with zero', () => {
    expect(countBy(['A', 'B'], [{ key: 'A', count: 2 }])).toEqual({ A: 2, B: 0 });
  });
});
