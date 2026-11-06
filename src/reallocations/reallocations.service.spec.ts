import { Prisma } from '@prisma/client';
import { type AuditEntry, type AuditService } from '../audit/audit.service';
import { type CatalogLookupService } from '../catalog/catalog-lookup.service';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { type AppConfigService } from '../config/app-config.service';
import { DEFAULT_RESERVATION_RULES } from '../config/reservation-rules.service';
import {
  type NotificationsService,
  type NotifyInput,
} from '../notifications/notifications.service';
import { type OperatingHoursService } from '../operating-hours/operating-hours.service';
import { type PrismaService } from '../prisma/prisma.service';
import { type LeaderNotifier } from '../reservations/leader-notifier';
import { type ReservationsService } from '../reservations/reservations.service';
import { ReallocationsService } from './reallocations.service';

const FUTURE_START = new Date(Date.now() + 3 * 3_600_000);
FUTURE_START.setUTCMinutes(0, 0, 0);
const FUTURE_END = new Date(FUTURE_START.getTime() + 3_600_000);

const spoc: CurrentUserData = {
  id: 'spoc',
  email: 'spoc@tcs.com',
  fullName: 'Spoc',
  roles: ['SPOC_EDIFICIO'],
  spocBuildingIds: ['north'],
};

const originRoom = {
  id: 'room-a',
  name: 'Sala A',
  buildingId: 'north',
  building: { name: 'Norte' },
};
const targetRoom = {
  id: 'room-b',
  name: 'Sala B',
  buildingId: 'north',
  capacity: 8,
  building: { name: 'Norte' },
};

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    userId: 'owner',
    resourceId: 'room-a',
    reservationType: 'ROOM',
    status: 'CONFIRMED',
    attendees: 6,
    seriesId: null,
    startDateTime: FUTURE_START,
    endDateTime: FUTURE_END,
    resource: originRoom,
    user: { fullName: 'Owner' },
    ...overrides,
  };
}

function build(found: unknown = reservation(), target: unknown = targetRoom) {
  const tx = {
    reservation: {
      updateMany: jest
        .fn<Promise<{ count: number }>, [Prisma.ReservationUpdateManyArgs]>()
        .mockResolvedValue({ count: 1 }),
    },
    reservationSlot: {
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    reallocation: {
      create: jest.fn<Promise<unknown>, [Prisma.ReallocationCreateArgs]>().mockResolvedValue({}),
    },
  };
  const prisma = {
    reservation: { findUnique: jest.fn().mockResolvedValue(found) },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const notifications = {
    notify: jest.fn<Promise<void>, [NotifyInput, unknown]>().mockResolvedValue(undefined),
  };
  const audit = {
    log: jest.fn<Promise<void>, [AuditEntry, unknown]>().mockResolvedValue(undefined),
  };
  const operatingHours = {
    assertOpen: jest.fn<Promise<void>, [{ id: string }, unknown[]]>().mockResolvedValue(undefined),
  };
  const leaderNotifier = { reallocated: jest.fn().mockResolvedValue(undefined) };
  const service = new ReallocationsService(
    prisma as unknown as PrismaService,
    { getActiveResource: jest.fn().mockResolvedValue(target) } as unknown as CatalogLookupService,
    { getById: jest.fn().mockResolvedValue({ id: 'res-1' }) } as unknown as ReservationsService,
    notifications as unknown as NotificationsService,
    audit as unknown as AuditService,
    { current: () => DEFAULT_RESERVATION_RULES },
    { server: { timeZone: 'America/Guayaquil' } } as unknown as AppConfigService,
    operatingHours as unknown as OperatingHoursService,
    leaderNotifier as unknown as LeaderNotifier,
  );
  return { service, prisma, tx, notifications, audit, operatingHours, leaderNotifier };
}

const dto = { newResourceId: 'room-b', justification: '  Visita de cliente  ' };

describe('ReallocationsService.reallocate', () => {
  it('moves the reservation, rebuilds its slots and records the history', async () => {
    const { service, tx } = build();

    await service.reallocate(spoc, 'res-1', dto);

    expect(tx.reservation.updateMany.mock.calls[0][0].data).toMatchObject({ resourceId: 'room-b' });
    expect(tx.reservationSlot.deleteMany).toHaveBeenCalledWith({
      where: { reservationId: 'res-1' },
    });
    expect(tx.reservationSlot.createMany).toHaveBeenCalled();
    expect(tx.reallocation.create.mock.calls[0][0].data).toMatchObject({
      previousResourceId: 'room-a',
      newResourceId: 'room-b',
      responsibleUserId: 'spoc',
      justification: 'Visita de cliente',
    });
  });

  it('notifies the owner with the previous and new room and the justification', async () => {
    const { service, notifications } = build();

    await service.reallocate(spoc, 'res-1', dto);

    const [input] = notifications.notify.mock.calls[0];
    expect(input.userId).toBe('owner');
    expect(input.message).toContain('Antes: Sala A (Norte)');
    expect(input.message).toContain('Ahora: Sala B (Norte)');
    expect(input.message).toContain('Motivo: Visita de cliente');
  });

  it('audits the owner, the buildings and the justification', async () => {
    const { service, audit } = build();

    await service.reallocate(spoc, 'res-1', dto);

    const [entry] = audit.log.mock.calls[0];
    expect(entry).toMatchObject({
      userId: 'spoc',
      action: 'RESERVATION_REALLOCATED',
      entityId: 'res-1',
      details: {
        ownerId: 'owner',
        status: 'CONFIRMED',
        justification: 'Visita de cliente',
        from: { resourceId: 'room-a', buildingId: 'north' },
        to: { resourceId: 'room-b', buildingId: 'north' },
      },
    });
  });

  it('tells the leader when a pending reservation is moved', async () => {
    const { service, leaderNotifier } = build(reservation({ status: 'PENDING_APPROVAL' }));

    await service.reallocate(spoc, 'res-1', dto);

    expect(leaderNotifier.reallocated).toHaveBeenCalledTimes(1);
  });

  it('does not bother the leader for a confirmed reservation', async () => {
    const { service, leaderNotifier } = build();

    await service.reallocate(spoc, 'res-1', dto);

    expect(leaderNotifier.reallocated).not.toHaveBeenCalled();
  });

  it('keeps a series occurrence in its series and says so in the notice', async () => {
    const { service, tx, notifications } = build(reservation({ seriesId: 'series-1' }));

    await service.reallocate(spoc, 'res-1', dto);

    const [input] = notifications.notify.mock.calls[0];
    expect(input.message).toContain('Solo cambia esta fecha de tu serie');
    expect(tx.reservation.updateMany.mock.calls[0][0].data).not.toHaveProperty('seriesId');
  });

  it('rejects a missing reservation', async () => {
    const { service } = build(null);

    await expect(service.reallocate(spoc, 'res-1', dto)).rejects.toMatchObject({
      response: { code: 'RESERVATION_NOT_FOUND' },
    });
  });

  it('rejects reservations that are not rooms', async () => {
    const { service } = build(reservation({ reservationType: 'LAPTOP' }));

    await expect(service.reallocate(spoc, 'res-1', dto)).rejects.toMatchObject({
      response: { code: 'ONLY_ROOMS' },
    });
  });

  it.each(['CANCELLED', 'CHECKED_IN', 'REJECTED', 'NO_SHOW'])(
    'rejects a %s reservation',
    async (status) => {
      const { service } = build(reservation({ status }));

      await expect(service.reallocate(spoc, 'res-1', dto)).rejects.toMatchObject({
        response: { code: 'NOT_REALLOCATABLE' },
      });
    },
  );

  it('rejects a target room outside the buildings of the SPOC', async () => {
    const { service, tx } = build(reservation(), { ...targetRoom, buildingId: 'south' });

    await expect(service.reallocate(spoc, 'res-1', dto)).rejects.toMatchObject({
      response: { code: 'NOT_YOUR_BUILDING' },
    });
    expect(tx.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an origin room outside the buildings of the SPOC', async () => {
    const { service } = build(reservation({ resource: { ...originRoom, buildingId: 'south' } }));

    await expect(service.reallocate(spoc, 'res-1', dto)).rejects.toMatchObject({
      response: { code: 'NOT_YOUR_BUILDING' },
    });
  });

  it('allows a move between two buildings of the same SPOC', async () => {
    const { service } = build(reservation(), {
      ...targetRoom,
      buildingId: 'south',
      building: { name: 'Sur' },
    });
    const twoBuildings = { ...spoc, spocBuildingIds: ['north', 'south'] };

    await expect(service.reallocate(twoBuildings, 'res-1', dto)).resolves.toBeDefined();
  });

  it('lets a SUPERADMIN move any building', async () => {
    const { service } = build(reservation(), { ...targetRoom, buildingId: 'south' });
    const superadmin = { ...spoc, roles: ['SUPERADMIN'], spocBuildingIds: [] };

    await expect(service.reallocate(superadmin, 'res-1', dto)).resolves.toBeDefined();
  });

  it('rejects a request that changes nothing', async () => {
    const { service } = build(reservation(), { ...targetRoom, id: 'room-a' });

    await expect(
      service.reallocate(spoc, 'res-1', { newResourceId: 'room-a', justification: 'x' }),
    ).rejects.toMatchObject({ response: { code: 'NOTHING_TO_CHANGE' } });
  });

  it('rejects a room too small for the attendees', async () => {
    const { service, tx } = build(reservation({ attendees: 12 }));

    await expect(service.reallocate(spoc, 'res-1', dto)).rejects.toMatchObject({
      response: { code: 'ATTENDEES_EXCEEDS_CAPACITY' },
    });
    expect(tx.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('checks the operating hours of the target room and stops when it is closed', async () => {
    const { service, operatingHours, tx } = build();
    operatingHours.assertOpen.mockRejectedValueOnce(new Error('closed'));

    await expect(service.reallocate(spoc, 'res-1', dto)).rejects.toThrow('closed');
    expect(operatingHours.assertOpen.mock.calls[0][0].id).toBe('room-b');
    expect(tx.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('does not require the minimum advance', async () => {
    const soon = new Date(Date.now() + 2 * 3_600_000);
    soon.setUTCMinutes(0, 0, 0);
    const { service } = build(
      reservation({ startDateTime: soon, endDateTime: new Date(soon.getTime() + 3_600_000) }),
    );

    await expect(service.reallocate(spoc, 'res-1', dto)).resolves.toBeDefined();
  });

  it('reports a concurrent change and leaves the slots untouched', async () => {
    const { service, tx, notifications } = build();
    tx.reservation.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.reallocate(spoc, 'res-1', dto)).rejects.toMatchObject({
      response: { code: 'CONCURRENT_CONFLICT' },
    });
    expect(tx.reservationSlot.deleteMany).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('guards the update with the state that was read', async () => {
    const { service, tx } = build();

    await service.reallocate(spoc, 'res-1', dto);

    expect(tx.reservation.updateMany.mock.calls[0][0].where).toEqual({
      id: 'res-1',
      status: 'CONFIRMED',
      resourceId: 'room-a',
      startDateTime: FUTURE_START,
      endDateTime: FUTURE_END,
    });
  });

  it('turns a slot collision into SLOT_TAKEN', async () => {
    const { service, tx } = build();
    tx.reservationSlot.createMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
    );

    await expect(service.reallocate(spoc, 'res-1', dto)).rejects.toMatchObject({
      response: { code: 'SLOT_TAKEN' },
    });
  });
});
