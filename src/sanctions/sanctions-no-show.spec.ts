import { type Prisma } from '@prisma/client';
import { type AuditEntry, type AuditService } from '../audit/audit.service';
import { type AppConfigService } from '../config/app-config.service';
import { DEFAULT_RESERVATION_RULES } from '../config/reservation-rules.service';
import {
  type NotificationsService,
  type NotifyInput,
} from '../notifications/notifications.service';
import { type PrismaService } from '../prisma/prisma.service';
import { SanctionsService } from './sanctions.service';

const NOW = new Date('2026-11-11T15:20:00Z');

function overdueReservation(overrides: Record<string, unknown> = {}) {
  return { id: 'res-1', userId: 'owner', resource: { name: 'Sala A' }, ...overrides };
}

interface BuildOptions {
  overdue?: unknown[];
  markedCount?: number;
  enforcedFrom?: Date | null;
}

function build(options: BuildOptions = {}) {
  const tx = {
    reservation: {
      updateMany: jest
        .fn<Promise<{ count: number }>, [Prisma.ReservationUpdateManyArgs]>()
        .mockResolvedValue({ count: options.markedCount ?? 1 }),
    },
    reservationSlot: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    sanction: {
      create: jest.fn<Promise<unknown>, [Prisma.SanctionCreateArgs]>().mockResolvedValue({}),
    },
  };
  const findMany = jest
    .fn<Promise<unknown[]>, [Prisma.ReservationFindManyArgs]>()
    .mockResolvedValueOnce(options.overdue ?? [overdueReservation()])
    .mockResolvedValue([]);
  const prisma = {
    reservation: { findMany },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const notifications = {
    notify: jest.fn<Promise<void>, [NotifyInput, unknown]>().mockResolvedValue(undefined),
  };
  const audit = {
    log: jest.fn<Promise<void>, [AuditEntry, unknown]>().mockResolvedValue(undefined),
  };
  const service = new SanctionsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    audit as unknown as AuditService,
    { current: () => DEFAULT_RESERVATION_RULES },
    { jobs: { noShowEnforcedFrom: options.enforcedFrom ?? null } } as AppConfigService,
  );
  return { service, tx, findMany, notifications, audit };
}

describe('SanctionsService.processNoShows', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks an overdue confirmed reservation and creates an active sanction', async () => {
    const { service, tx, notifications, audit } = build();

    const result = await service.processNoShows();

    expect(result).toEqual({ noShows: 1, expiredTrainings: 0 });
    expect(tx.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: 'res-1', status: 'CONFIRMED' },
      data: { status: 'NO_SHOW' },
    });
    const [sanction] = tx.sanction.create.mock.calls[0];
    expect(sanction.data).toMatchObject({
      userId: 'owner',
      reservationId: 'res-1',
      type: 'NO_SHOW',
      status: 'ACTIVE',
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner', type: 'NO_SHOW_SANCTION' }),
      tx,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'NO_SHOW_MARKED', entityId: 'res-1' }),
      tx,
    );
  });

  it('looks only for reservations whose check-in window already closed', async () => {
    const { service, findMany } = build();

    await service.processNoShows();

    const [query] = findMany.mock.calls[0];
    expect(query.where?.status).toBe('CONFIRMED');
    expect(query.where?.startDateTime).toEqual({ lt: new Date('2026-11-11T15:05:00Z') });
  });

  it('ignores reservations that started before the enforcement date', async () => {
    const enforcedFrom = new Date('2026-11-10T00:00:00Z');
    const { service, findMany } = build({ enforcedFrom });

    await service.processNoShows();

    const [query] = findMany.mock.calls[0];
    expect(query.where?.startDateTime).toEqual({
      lt: new Date('2026-11-11T15:05:00Z'),
      gte: enforcedFrom,
    });
  });

  it('scopes the run to one user', async () => {
    const { service, findMany } = build();

    await service.processNoShows({ userId: 'owner' });

    const [query] = findMany.mock.calls[0];
    expect(query.where?.userId).toBe('owner');
  });

  it('does not sanction twice when another run marked the reservation first', async () => {
    const { service, tx, notifications } = build({ markedCount: 0 });

    const result = await service.processNoShows();

    expect(result.noShows).toBe(0);
    expect(tx.sanction.create).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
