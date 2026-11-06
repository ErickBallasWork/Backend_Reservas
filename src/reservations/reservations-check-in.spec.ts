import { type Prisma } from '@prisma/client';
import { type AuditService } from '../audit/audit.service';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { DEFAULT_RESERVATION_RULES } from '../config/reservation-rules.service';
import { type PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from './reservations.service';

const START = new Date('2026-11-11T15:00:00Z');

const owner: CurrentUserData = {
  id: 'owner',
  email: 'owner@tcs.com',
  fullName: 'Owner',
  roles: ['ASOCIADO'],
  spocBuildingIds: [],
};

function reservation(overrides: Record<string, unknown> = {}) {
  return { id: 'res-1', userId: 'owner', status: 'CONFIRMED', startDateTime: START, ...overrides };
}

function build(found: unknown = reservation(), updatedCount = 1) {
  const tx = {
    reservation: {
      updateMany: jest
        .fn<Promise<{ count: number }>, [Prisma.ReservationUpdateManyArgs]>()
        .mockResolvedValue({ count: updatedCount }),
    },
    checkIn: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    reservation: { findUnique: jest.fn().mockResolvedValue(found) },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const rules = { current: () => DEFAULT_RESERVATION_RULES };
  const service = new ReservationsService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
    audit as unknown as AuditService,
    rules,
    {} as never,
    {} as never,
  );
  jest.spyOn(service, 'getById').mockResolvedValue({} as never);
  return { service, tx, audit };
}

describe('ReservationsService.checkIn', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  function setNow(iso: string) {
    jest.useFakeTimers({ now: new Date(iso) });
  }

  it('registers the usage inside the window', async () => {
    setNow('2026-11-11T15:10:00Z');
    const { service, tx, audit } = build();
    await service.checkIn(owner, 'res-1');
    expect(tx.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: 'res-1', status: 'CONFIRMED' },
      data: { status: 'CHECKED_IN' },
    });
    expect(tx.checkIn.create).toHaveBeenCalledWith({
      data: { reservationId: 'res-1', userId: 'owner', method: 'BUTTON' },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RESERVATION_CHECKED_IN' }),
      tx,
    );
  });

  it('rejects the usage after the window', async () => {
    setNow('2026-11-11T15:16:00Z');
    const { service } = build();
    await expect(service.checkIn(owner, 'res-1')).rejects.toMatchObject({
      response: { code: 'OUTSIDE_CHECKIN_WINDOW' },
    });
  });

  it('rejects the usage before the window', async () => {
    setNow('2026-11-11T14:44:00Z');
    const { service } = build();
    await expect(service.checkIn(owner, 'res-1')).rejects.toMatchObject({
      response: { code: 'OUTSIDE_CHECKIN_WINDOW' },
    });
  });

  it.each(['NO_SHOW', 'CANCELLED', 'CHECKED_IN', 'PENDING_APPROVAL'])(
    'rejects a reservation in %s',
    async (status) => {
      setNow('2026-11-11T15:05:00Z');
      const { service } = build(reservation({ status }));
      await expect(service.checkIn(owner, 'res-1')).rejects.toMatchObject({
        response: { code: 'NOT_CHECKABLE' },
      });
    },
  );

  it('rejects someone else reservation', async () => {
    setNow('2026-11-11T15:05:00Z');
    const { service } = build(reservation({ userId: 'other' }));
    await expect(service.checkIn(owner, 'res-1')).rejects.toMatchObject({
      response: { code: 'NOT_OWNER' },
    });
  });

  it('does not overwrite a reservation marked as no-show meanwhile', async () => {
    setNow('2026-11-11T15:14:59Z');
    const { service, tx } = build(reservation(), 0);
    await expect(service.checkIn(owner, 'res-1')).rejects.toMatchObject({
      response: { code: 'CONCURRENT_CONFLICT' },
    });
    expect(tx.checkIn.create).not.toHaveBeenCalled();
  });
});
